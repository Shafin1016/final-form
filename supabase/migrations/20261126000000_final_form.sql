-- Final Form: shared answer store, review queue, shared play stats.
-- Every table has row-level security ON and NO policies, and anon/authenticated roles get no grants,
-- so the public (publishable/anon) key can read or write nothing. Only the edge function, which runs
-- with the service-role key on the server, touches these tables.

-- ───────── answers validated after the hand-written bank (AI-checked or human-reviewed) ─────────
create table if not exists ff_answers (
  prompt_id   text not null,
  key         text not null,                    -- normalized canonical name (same norm() as the game)
  name        text not null,                    -- display name
  aliases     text[] not null default '{}',     -- normalized spellings players typed that map here
  tier        char(1) check (tier in ('S','A','B','C','D','E')),  -- set by a reviewer only; null = use live stats
  status      text not null default 'ai' check (status in ('ai','approved','rejected')),
  source      text not null default 'ai',       -- ai | ai-alias (maps to a bank answer) | review | expansion
  model       text,
  confidence  real,
  hits        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  primary key (prompt_id, key)
);
create index if not exists ff_answers_status on ff_answers (status);

-- ───────── guesses the AI rejected or wasn't sure about, plus player claims: the review queue ─────────
create table if not exists ff_verdicts (
  prompt_id     text not null,
  norm          text not null,
  raw           text not null,                  -- one example of what was typed
  verdict       text not null check (verdict in ('invalid','uncertain','claim')),
  ai_name       text,
  confidence    real,
  count         integer not null default 1,
  first_at      timestamptz not null default now(),
  last_at       timestamptz not null default now(),
  expires_at    timestamptz,                    -- negative cache: after this, the AI is asked again
  review_status text not null default 'open' check (review_status in ('open','approved','rejected','dismissed')),
  primary key (prompt_id, norm)
);
create index if not exists ff_verdicts_open on ff_verdicts (review_status, last_at desc);

-- ───────── finished runs + aggregated counters for rarity ─────────
create table if not exists ff_runs (
  id         bigserial primary key,
  player     text not null,                     -- anonymous per-browser id
  ts         bigint not null,                   -- client timestamp of the run (dedupe key with player)
  day        integer,
  mode       text,
  score      integer not null,
  rank       text,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  unique (player, ts)
);
create table if not exists ff_counts (           -- answer_key '' = how many runs played this prompt
  prompt_id  text not null,
  answer_key text not null,
  n          bigint not null default 0,
  primary key (prompt_id, answer_key)
);
create table if not exists ff_bins (bin integer primary key, n bigint not null default 0);

-- ───────── rate limiting + metrics ─────────
create table if not exists ff_rate (bucket text primary key, window_start timestamptz not null, n integer not null);
create table if not exists ff_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  prompt_id text, norm text,
  outcome text not null,                        -- bank | cache | neg | ai-valid | ai-invalid | ai-uncertain | error | rate | dedupe
  latency_ms integer,
  detail text
);
create index if not exists ff_log_at on ff_log (at desc);

alter table ff_answers  enable row level security;
alter table ff_verdicts enable row level security;
alter table ff_runs     enable row level security;
alter table ff_counts   enable row level security;
alter table ff_bins     enable row level security;
alter table ff_rate     enable row level security;
alter table ff_log      enable row level security;
revoke all on ff_answers, ff_verdicts, ff_runs, ff_counts, ff_bins, ff_rate, ff_log from anon, authenticated;
revoke all on sequence ff_runs_id_seq, ff_log_id_seq from anon, authenticated;

-- ───────── functions (service role only) ─────────

-- record one run atomically; returns false (and counts nothing) if this player+ts was already recorded
create or replace function ff_record_run(p_player text, p_ts bigint, p_day integer, p_mode text, p_score integer,
  p_rank text, p_data jsonb, p_bin integer, p_answers jsonb)
returns boolean language plpgsql as $$
declare r jsonb; inserted boolean;
begin
  insert into ff_runs (player, ts, day, mode, score, rank, data) values (p_player, p_ts, p_day, p_mode, p_score, p_rank, p_data)
    on conflict (player, ts) do nothing;
  get diagnostics inserted = row_count;
  if not inserted then return false; end if;
  insert into ff_bins (bin, n) values (p_bin, 1) on conflict (bin) do update set n = ff_bins.n + 1;
  for r in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) loop
    insert into ff_counts (prompt_id, answer_key, n) values (r->>'p', '', 1)
      on conflict (prompt_id, answer_key) do update set n = ff_counts.n + 1;
    if coalesce(r->>'a', '') <> '' then
      insert into ff_counts (prompt_id, answer_key, n) values (r->>'p', r->>'a', 1)
        on conflict (prompt_id, answer_key) do update set n = ff_counts.n + 1;
    end if;
  end loop;
  return true;
end $$;

-- same shape the game already uses: { n, bins:[...], pn:{prompt:n}, ans:{prompt:{key:n}} }
create or replace function ff_stats(p_nbins integer default 28)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'n', coalesce((select sum(n) from ff_bins), 0),
    'bins', (select jsonb_agg(coalesce(b.n, 0) order by g) from generate_series(0, p_nbins - 1) g left join ff_bins b on b.bin = g),
    'pn', coalesce((select jsonb_object_agg(prompt_id, n) from ff_counts where answer_key = ''), '{}'::jsonb),
    'ans', coalesce((select jsonb_object_agg(prompt_id, m) from (
              select prompt_id, jsonb_object_agg(answer_key, n) m from ff_counts where answer_key <> '' group by prompt_id) x), '{}'::jsonb));
$$;

-- fixed-window rate limit: true = allowed
create or replace function ff_rate_hit(p_bucket text, p_limit integer, p_window_secs integer)
returns boolean language plpgsql as $$
declare cur integer;
begin
  insert into ff_rate (bucket, window_start, n) values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    n = case when ff_rate.window_start < now() - make_interval(secs => p_window_secs) then 1 else ff_rate.n + 1 end,
    window_start = case when ff_rate.window_start < now() - make_interval(secs => p_window_secs) then now() else ff_rate.window_start end
  returning n into cur;
  return cur <= p_limit;
end $$;

-- upsert a rejected/uncertain/claimed guess, counting repeats; never downgrades a reviewed row back to open
create or replace function ff_note_verdict(p_prompt text, p_norm text, p_raw text, p_verdict text, p_ai_name text,
  p_conf real, p_ttl_secs integer)
returns void language sql as $$
  insert into ff_verdicts (prompt_id, norm, raw, verdict, ai_name, confidence, expires_at)
  values (p_prompt, p_norm, left(p_raw, 120), p_verdict, left(p_ai_name, 120), p_conf,
          case when p_ttl_secs is null then null else now() + make_interval(secs => p_ttl_secs) end)
  on conflict (prompt_id, norm) do update set
    count = ff_verdicts.count + 1, last_at = now(),
    verdict = case when ff_verdicts.verdict = 'claim' and excluded.verdict <> 'claim' then ff_verdicts.verdict else excluded.verdict end,
    ai_name = coalesce(excluded.ai_name, ff_verdicts.ai_name),
    confidence = coalesce(excluded.confidence, ff_verdicts.confidence),
    expires_at = coalesce(excluded.expires_at, ff_verdicts.expires_at);
$$;

-- save an AI-validated answer (or a new spelling of one) without overwriting a reviewer's decision
create or replace function ff_add_answer(p_prompt text, p_key text, p_name text, p_aliases text[], p_source text,
  p_model text, p_conf real)
returns ff_answers language sql as $$
  insert into ff_answers (prompt_id, key, name, aliases, source, model, confidence)
  values (p_prompt, p_key, left(p_name, 80), p_aliases, p_source, p_model, p_conf)
  on conflict (prompt_id, key) do update set
    aliases = (select array(select distinct unnest(ff_answers.aliases || excluded.aliases))),
    updated_at = now()
  returning *;
$$;

create or replace function ff_bump_hit(p_prompt text, p_key text)
returns void language sql as $$ update ff_answers set hits = hits + 1 where prompt_id = p_prompt and key = p_key; $$;

-- metrics for the last p_hours: outcome counts and latency percentiles
create or replace function ff_metrics(p_hours integer default 24)
returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(outcome, jsonb_build_object('n', n, 'p50', p50, 'p95', p95)), '{}'::jsonb) from (
    select outcome, count(*) n,
      percentile_cont(0.5) within group (order by latency_ms) p50,
      percentile_cont(0.95) within group (order by latency_ms) p95
    from ff_log where at > now() - make_interval(hours => p_hours) group by outcome) x;
$$;

-- housekeeping: keep a month of logs
create or replace function ff_prune() returns void language sql as $$
  delete from ff_log where at < now() - interval '30 days';
  delete from ff_rate where window_start < now() - interval '1 day';
$$;

revoke execute on function ff_record_run, ff_stats, ff_rate_hit, ff_note_verdict, ff_add_answer, ff_bump_hit, ff_metrics, ff_prune from public, anon, authenticated;
