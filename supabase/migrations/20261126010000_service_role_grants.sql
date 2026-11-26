-- Final Form: the edge function's server-only role needs explicit privileges.
-- Without these, projects whose default privileges don't cover new objects fail with
-- 42501 "permission denied for table ff_answers". Mirrors the fix applied by hand in the SQL editor.
-- Safe to run more than once. Public roles stay locked out and RLS stays on.

grant usage on schema public to service_role;

grant select, insert, update, delete on table
  ff_answers, ff_verdicts, ff_runs, ff_counts, ff_bins, ff_rate, ff_log
to service_role;

-- bigserial ids on ff_runs and ff_log
grant usage, select, update on sequence ff_runs_id_seq, ff_log_id_seq to service_role;

grant execute on function
  ff_record_run(text, bigint, integer, text, integer, text, jsonb, integer, jsonb),
  ff_stats(integer),
  ff_rate_hit(text, integer, integer),
  ff_note_verdict(text, text, text, text, text, real, integer),
  ff_add_answer(text, text, text, text[], text, text, real),
  ff_bump_hit(text, text),
  ff_metrics(integer),
  ff_prune()
to service_role;

-- keep the public (publishable/anon) and signed-in roles out entirely
revoke all on table ff_answers, ff_verdicts, ff_runs, ff_counts, ff_bins, ff_rate, ff_log from anon, authenticated, public;
revoke all on sequence ff_runs_id_seq, ff_log_id_seq from anon, authenticated, public;
revoke execute on function
  ff_record_run(text, bigint, integer, text, integer, text, jsonb, integer, jsonb),
  ff_stats(integer),
  ff_rate_hit(text, integer, integer),
  ff_note_verdict(text, text, text, text, text, real, integer),
  ff_add_answer(text, text, text, text[], text, text, real),
  ff_bump_hit(text, text),
  ff_metrics(integer),
  ff_prune()
from anon, authenticated, public;

-- future ff_ objects created by the migration owner: service_role only
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- RLS stays on (service_role bypasses it; anon/authenticated have no policies)
alter table ff_answers  enable row level security;
alter table ff_verdicts enable row level security;
alter table ff_runs     enable row level security;
alter table ff_counts   enable row level security;
alter table ff_bins     enable row level security;
alter table ff_rate     enable row level security;
alter table ff_log      enable row level security;
