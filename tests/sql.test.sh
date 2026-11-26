#!/usr/bin/env bash
# Runs the migration on a throwaway local Postgres and checks the SQL functions, concurrency and lockdown.
#   PGHOST=/tmp PGPORT=5499 PGUSER=postgres bash tests/sql.test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=ff_test_$$
psql -q -c "drop database if exists $DB" -c "create database $DB" >/dev/null
trap 'psql -q -c "drop database if exists $DB" >/dev/null' EXIT
q() { psql -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB" -c "$1"; }
for r in anon authenticated service_role; do psql -q -c "do \$\$ begin create role $r nologin; exception when duplicate_object then null; end \$\$" >/dev/null; done
fail=0; ok() { if [ "$2" == "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1: expected [$3] got [$2]"; fail=1; fi; }
asrole() { psql -X -q -t -A -d "$DB" -c "set role $1; $2" 2>&1 || true; }

echo "migrations"
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/20261126000000_final_form.sql >/dev/null
# regression for 42501: with only the first migration, a role without default privileges can't read ff_answers
psql -q -c "do \$\$ begin create role svc_nodefaults nologin bypassrls; exception when duplicate_object then null; end \$\$" >/dev/null
ok "role without grants gets 42501" "$(asrole svc_nodefaults "select count(*) from ff_answers" | grep -c 'permission denied for table ff_answers')" "1"
for f in $(ls supabase/migrations/*.sql | sort | tail -n +2); do psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null; done
for f in supabase/migrations/2026112601*.sql; do psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null; done   # re-running is harmless
ok "all migrations applied (and re-applied) cleanly" "ok" "ok"

echo "service_role can do everything the function does"
ok "select/insert/update/delete answers" "$(asrole service_role "insert into ff_answers (prompt_id,key,name) values ('t','k','n'); update ff_answers set name='m' where key='k'; select name from ff_answers where key='k'; delete from ff_answers where key='k';" | tr -d '\n')" "m"
ok "insert log (sequence)" "$(asrole service_role "insert into ff_log (outcome) values ('test') returning outcome" | head -1)" "test"
ok "insert run via rpc (sequence)" "$(asrole service_role "select ff_record_run('svc', 999, 1, 'daily', 10, 'b', '{}', 0, '[]')")" "t"
ok "rpc execute" "$(asrole service_role "select ff_rate_hit('svc', 5, 60)::text || (ff_stats(28)->>'n')" )" "true1"
ok "verdict + answer rpcs" "$(asrole service_role "select ff_note_verdict('c','x','x','claim',null,null,null); select (ff_add_answer('c','y','Y','{y}','ai',null,null)).key; select ff_bump_hit('c','y'); select ff_metrics(1) is not null; select ff_prune();" | grep -v '^$' | tr '\n' ' ')" "y t "
q "delete from ff_runs where player = 'svc'; delete from ff_bins; delete from ff_counts; delete from ff_verdicts; delete from ff_answers; delete from ff_log; delete from ff_rate"

echo "runs + stats"
ok "first run recorded"  "$(q "select ff_record_run('u1', 1, 3, 'daily', 420, 'gold', '{}', 16, '[{\"p\":\"consoles\",\"a\":\"ps2\"},{\"p\":\"op\",\"a\":null}]')")" "t"
ok "duplicate ignored"   "$(q "select ff_record_run('u1', 1, 3, 'daily', 420, 'gold', '{}', 16, '[{\"p\":\"consoles\",\"a\":\"ps2\"}]')")" "f"
ok "stats shape"         "$(q "select ff_stats(28)->>'n', ff_stats(28)->'pn'->>'consoles', ff_stats(28)->'ans'->'consoles'->>'ps2', jsonb_array_length(ff_stats(28)->'bins'), ff_stats(28)->'bins'->>16, ff_stats(28)->'pn'->>'op'")" "1|1|1|28|1|1"

echo "concurrent runs (40 at once)"
for i in $(seq 1 40); do psql -X -q -t -d "$DB" -c "select ff_record_run('c$i', $i, 3, 'daily', 100, 'b', '{}', 4, '[{\"p\":\"consoles\",\"a\":\"ps2\"}]')" >/dev/null & done; wait
ok "counts exact" "$(q "select ff_stats(28)->>'n', ff_stats(28)->'ans'->'consoles'->>'ps2', ff_stats(28)->'bins'->>4")" "41|41|40"

echo "rate limit"
ok "within limit" "$(q "select ff_rate_hit('t', 2, 60)")" "t"
q "select ff_rate_hit('t', 2, 60)" >/dev/null
ok "over limit"   "$(q "select ff_rate_hit('t', 2, 60)")" "f"
q "update ff_rate set window_start = now() - interval '2 minutes' where bucket = 't'"
ok "window resets" "$(q "select ff_rate_hit('t', 2, 60)")" "t"

echo "verdicts"
q "select ff_note_verdict('consoles', 'pippin', 'Pippin', 'claim', null, null, null)"
q "select ff_note_verdict('consoles', 'pippin', 'pippin', 'uncertain', 'Apple Pippin', 0.4, 3600)"
ok "claim kept, count, ttl set" "$(q "select verdict, count, ai_name, expires_at > now() from ff_verdicts where norm = 'pippin'")" "claim|2|Apple Pippin|t"

echo "answers"
q "select ff_add_answer('consoles', 'bandaiplaydia', 'Bandai Playdia', '{bandaiplaydia}', 'ai', 'gemma', 0.9)" >/dev/null
q "update ff_answers set status = 'approved', tier = 'A' where key = 'bandaiplaydia'"
q "select ff_add_answer('consoles', 'bandaiplaydia', 'X', '{playdia}', 'ai', 'gemma', 0.5)" >/dev/null
ok "alias merged, review kept" "$(q "select name, status, tier, array_to_string(aliases, ',') from ff_answers where key = 'bandaiplaydia'")" "Bandai Playdia|approved|A|bandaiplaydia,playdia"

echo "metrics"
q "insert into ff_log (outcome, latency_ms) values ('cache', 10), ('cache', 30), ('ai-valid', 900)"
ok "percentiles" "$(q "select ff_metrics(24)->'cache'->>'n', ff_metrics(24)->'cache'->>'p50', ff_metrics(24)->'ai-valid'->>'p95'")" "2|20|900"

echo "public key can't touch anything"
for t in ff_answers ff_verdicts ff_runs ff_counts ff_bins ff_rate ff_log; do
  out=$(psql -X -q -t -A -d "$DB" -c "set role anon; select count(*) from $t" 2>&1 || true); ok "anon select $t denied" "$(echo "$out" | grep -c 'permission denied')" "1"
done
out=$(psql -X -q -t -A -d "$DB" -c "set role anon; select ff_stats(28)" 2>&1 || true); ok "anon rpc denied" "$(echo "$out" | grep -c 'permission denied')" "1"
out=$(psql -X -q -t -A -d "$DB" -c "set role authenticated; insert into ff_answers (prompt_id,key,name) values ('a','b','c')" 2>&1 || true); ok "authenticated insert denied" "$(echo "$out" | grep -c 'permission denied')" "1"
out=$(asrole anon "select ff_record_run('a',1,1,'d',1,'r','{}',0,'[]')"); ok "anon rpc write denied" "$(echo "$out" | grep -c 'permission denied')" "1"
out=$(asrole anon "select nextval('ff_log_id_seq')"); ok "anon sequence denied" "$(echo "$out" | grep -c 'permission denied')" "1"
ok "no anon/authenticated table grants" "$(q "select count(*) from information_schema.role_table_grants where table_name like 'ff\_%' and grantee in ('anon','authenticated','PUBLIC')")" "0"
ok "rls on every table" "$(q "select count(*) from pg_class where relname like 'ff\_%' and relkind = 'r' and relrowsecurity")" "7"

[ $fail == 0 ] && echo "SQL: all passed" || { echo "SQL: FAILURES"; exit 1; }
