# AI answer validation — setup and operations

Branch: `ai-validation`. **Not merged into `main`.** Until you merge it, the live site is unchanged.

## How an answer is judged

```
player types an answer
  │
  ├─ 1. built-in answer list (prompts*.js), exact alias ──────────── instant, in the browser
  ├─ 2. same list, typo / short form / "geralt of rivia" matching ─── instant, in the browser
  ├─ 3. answers other players already got validated ───────────────── instant, in the browser
  │      (preloaded from the shared database when the game starts)
  │
  │   only if all three miss: the timer pauses and the browser asks the backend
  ▼
  backend (Supabase Edge Function `ff`)
  ├─ same checks 1–3 against the latest shared database ─────────── ~30–70 ms
  ├─ remembered "no" (7 days) / "unsure" (1 hour) / reviewer decisions
  ├─ identical requests in flight are merged into one model call
  ├─ rate limits (per player, per IP, global)
  └─ 4. Gemma 4 26B A4B, thinking off, temperature 0, ≤60 output tokens
         yes (confidence ≥ 0.75) → accepted, saved for everyone, rarity capped at B until a person approves
         no  (confidence ≥ 0.9)  → miss, remembered for 7 days (not forever), listed for review
         anything else          → "sent for review", no miss
         timeout / error / rate limit → "couldn't check", no miss
```

What did not change: cutscenes, tiers, combat, scoring, the 30 s timer, 3 misses, the answer list and the matching rules (the shared matcher is checked against 5,069 recorded answers and gives identical results). With no backend configured the game behaves exactly as it does today.

### Rarity safeguards
- Rarity still comes only from real players' answers (plus the fading starter pool). The model never assigns rarity.
- An answer nobody has reviewed (AI-accepted, or an AI-suggested new spelling of a listed answer) **can never score above B (Epic)**. So a never-before-seen answer can't land at Mythic just because its count is zero.
- When you approve an answer you can give it a tier; after 50 plays of that prompt, live stats take over as usual.

### What's in the branch

| Path | What it is |
|---|---|
| `ff-core.js` | The matcher, moved out of `index.html` so the browser and the server run the same file |
| `ff-config.js` | The only file you edit to switch the backend on (`api:` URL). No secrets. |
| `index.html` | Checks the backend for unknown answers, pauses the timer while checking, sends runs/claims to the shared database |
| `supabase/migrations/…sql` | Tables, functions, locked down: the public key can read or write nothing |
| `supabase/functions/ff/` | The backend (no dependencies): `handler.ts` logic, `ai.ts` model call, `store.ts` database calls |
| `supabase/functions/_shared/` | Generated copy of `ff-core.js` + the answer list (`node tools/build-server-data.mjs`) |
| `admin/review.html` | Review page: approve/reject AI answers, decide uncertain guesses and player claims, see latency and cache stats |
| `tools/expand-bank.mjs` | Offline: Gemma 4 31B proposes missing answers/aliases/translations → reviewable proposal file |
| `tools/apply-expansion.mjs` | Applies the entries you accepted to `prompts*.js`, refuses if any existing answer would change meaning |
| `tools/pull-approved.mjs` | Turns answers you approved on the review page into a proposal for the built-in list |
| `tools/bench-live.mjs` | Measures the deployed backend's latency and cache hits |
| `tests/` | Unit, SQL, browser, and benchmark tests (see Testing) |

---

## Setup (one time, about 20 minutes)

You need: a Supabase account (free tier is fine), a Google AI Studio API key (or OpenRouter), and Node.js 20+ on your computer.

### 1. Get a model API key
**Option A — Google AI Studio (default):** go to https://aistudio.google.com/apikey → *Create API key*. The backend uses model `gemma-4-26b-a4b-it` with thinking set to minimal.

**Option B — OpenRouter:** https://openrouter.ai/keys → create a key. Model `google/gemma-4-26b-a4b-it`, reasoning turned off.

**Option C — your own server (vLLM, SGLang, Cloud Run):** any OpenAI-compatible endpoint; thinking is turned off with `chat_template_kwargs.enable_thinking=false`.

### 2. Create the Supabase project
1. https://supabase.com/dashboard → *New project*. Pick the region closest to most players (e.g. East US). Save the database password somewhere safe.
2. Note the **project ref**: the part of the project URL `https://supabase.com/dashboard/project/<REF>`.

### 3. Deploy the database and the function
On your computer:
```bash
git clone https://github.com/Shafin1016/final-form.git
cd final-form
git checkout ai-validation

npx supabase login                         # opens the browser once
npx supabase link --project-ref <REF>      # asks for the database password
npx supabase db push                       # creates the tables, functions and service_role grants
```

Make an admin token (a long random password for the review page):
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Set the function's secrets — these stay on Supabase's servers and are never sent to the browser:
```bash
# Option A (Google AI Studio)
npx supabase secrets set AI_PROVIDER=gemini AI_API_KEY=<your AI Studio key> ADMIN_TOKEN=<token from above> ALLOWED_ORIGINS=https://shafin1016.github.io,http://localhost:8765

# Option B (OpenRouter) — instead of the line above
npx supabase secrets set AI_PROVIDER=openrouter AI_API_KEY=<your OpenRouter key> ADMIN_TOKEN=<token> ALLOWED_ORIGINS=https://shafin1016.github.io,http://localhost:8765
```

Deploy:
```bash
npx supabase functions deploy ff --no-verify-jwt
```
`--no-verify-jwt` lets the game call the function without a Supabase login (players are anonymous). The function protects itself with the origin allowlist, rate limits, input checks, and the admin token.

Check it's alive (should print `"ai":true`):
```bash
curl https://<REF>.supabase.co/functions/v1/ff/health
```

### 4. Try the branch locally before merging
Edit `ff-config.js`:
```js
api: 'https://<REF>.supabase.co/functions/v1/ff',
```
Then serve the folder and play:
```bash
python3 -m http.server 8765
# open http://localhost:8765
```
Try an answer that isn't on the list (for "Name a video game console": *Bandai Playdia*, *Pioneer LaserActive*). You'll see "Checking…" for about a second, then the attack. Try it again — instant. Open `http://localhost:8765/admin/review.html`, paste the same URL and your admin token, and you'll see it waiting for approval.

Measure the real latency:
```bash
FF_API=https://<REF>.supabase.co/functions/v1/ff node tools/bench-live.mjs
```
Run it twice: the first run shows the model path, the second shows the cache path.

### 5. Go live (merge)
When you're happy:
```bash
git checkout main && git merge ai-validation && git push
```
GitHub Pages redeploys in a minute or two. To turn the backend off at any time, set `api: ''` in `ff-config.js` and push: the game goes back to list-only checking and on-device scores.

Note: the Claude-hosted practice artifact keeps using its own built-in database; it isn't affected.

---

## Settings (function secrets)

Set with `npx supabase secrets set NAME=value`, then redeploy (`npx supabase functions deploy ff --no-verify-jwt`).

| Secret | Default | Meaning |
|---|---|---|
| `AI_PROVIDER` | `gemini` | `gemini` (AI Studio), `openrouter`, or `openai` (any OpenAI-compatible server) |
| `AI_API_KEY` | — | Model provider key. **Without it, AI checking is off** (everything else still works) |
| `AI_MODEL` | `gemma-4-26b-a4b-it` / `google/gemma-4-26b-a4b-it` | Model id |
| `AI_BASE_URL` | provider default | For `openai`, e.g. `https://my-vllm.example.com/v1` |
| `AI_EXTRA_BODY` | per provider | JSON merged into the request; replaces the default "thinking off" switch for that provider |
| `AI_TIMEOUT_MS` | `2500` | Give up on the model after this long (player gets "couldn't check", no miss) |
| `AI_MAX_TOKENS` | `60` | Output cap |
| `AI_ACCEPT_CONF` / `AI_REJECT_CONF` | `0.75` / `0.9` | Confidence needed for an automatic yes / no (a less-sure "no" becomes "sent for review", no miss) |
| `NEG_TTL_SECS` | `604800` (7 days) | How long an AI "no" is remembered |
| `UNSURE_TTL_SECS` | `3600` | How long an AI "unsure" is remembered |
| `RL_PLAYER_PER_MIN` / `RL_IP_PER_MIN` / `RL_GLOBAL_PER_MIN` | `20` / `40` / `600` | Model-call rate limits (cache hits aren't limited) |
| `RL_RUNS_PER_HOUR` | `60` | Run submissions per IP per hour |
| `CACHE_TTL_MS` / `STATS_TTL_MS` | `15000` / `20000` | In-memory caches inside the function |
| `ALLOWED_ORIGINS` | GitHub Pages + localhost:8765 | Comma-separated sites allowed to call the backend (`*` = any) |
| `ADMIN_TOKEN` | — | Required for the review page and `/admin/*` |

Browser settings live in `ff-config.js`: `api`, `aiCheck` (on/off), `aiPerRound` (max backend checks per round, default 5), `validateTimeoutMs` (default 4500).

---

## Reviewing answers
Open `/admin/review.html` (on the live site once merged: `https://shafin1016.github.io/final-form/admin/review.html`), paste the backend URL and admin token.
- **AI-accepted answers**: already playable, capped at B. *Approve* (optionally fix the name and set a tier) removes the cap. *Reject* removes it from play; the bank answer it pointed to (if any) is never affected.
- **Waiting for a decision**: AI "unsure", AI "no" (in case it was wrong), and "I think this is an answer" claims. *Accept* makes it a valid answer (you choose the display name and tier), *Not an answer* rejects it permanently, *Skip* hides it.
- The top of the page shows the last 24 hours: share of checks answered without the model, cache and model latency (p50/p95), errors and rate-limit hits.

To fold approved answers into the built-in list (so they work even without the backend):
```bash
FF_API=https://<REF>.supabase.co/functions/v1/ff ADMIN_TOKEN=<token> node tools/pull-approved.mjs
node tools/apply-expansion.mjs expansions/approved-<date>.json
git diff prompts*.js     # check, then commit
```

## Expanding the answer list offline (Gemma 4 31B)
Runs on your computer, never during play.
```bash
EXPAND_API_KEY=<AI Studio key> node tools/expand-bank.mjs --ids consoles,game-studios
EXPAND_API_KEY=<key> node tools/expand-bank.mjs --open --per 25          # every open-ended prompt
EXPAND_PROVIDER=openrouter EXPAND_API_KEY=<key> node tools/expand-bank.mjs --all
```
It writes `expansions/expansion-<time>.json` plus a readable `.md`. Each proposed answer has already been checked against the current list (anything the game accepts is turned into an alias suggestion or dropped), and against the series' Fandom wiki or Wikipedia — `verified` shows the matching page, `null` means no page was found (not necessarily wrong). Entries that might overlap an existing answer are flagged.

Review: set `"accept": true` on what you want (edit names, aliases, `"tier"` freely), then
```bash
node tools/apply-expansion.mjs expansions/expansion-<time>.json --dry-run    # preview
node tools/apply-expansion.mjs expansions/expansion-<time>.json              # or add --accept-verified
git diff prompts*.js
```
The apply step refuses to write if any of the 5,069 recorded panel answers would change meaning, and refreshes the server copy automatically. Redeploy the function afterwards (`npx supabase functions deploy ff --no-verify-jwt`) so the server has the new list.

**After any edit to `prompts*.js` or `ff-core.js`:** run `node tools/build-server-data.mjs`, commit, and redeploy the function. (`npm test` fails if you forget.)

---

## Testing
Tools: Node 20+ and Bun (https://bun.sh) for tests; Postgres 16 for the SQL test; Python Playwright + Chrome for browser tests. GitHub Actions runs the unit, SQL and benchmark tests on every push (`.github/workflows/test.yml`).

```bash
bun test tests/                                  # 58 tests: matcher parity, backend, errors, store, offline tools
PGHOST=... PGUSER=... bash tests/sql.test.sh     # migration + functions + concurrency + lockdown on real Postgres
bun tests/dev-server.ts &                        # local backend: in-memory DB + fake model (or AI_API_KEY=... for the real one)
python3 tests/browser_test.py                    # full game in Chrome against it
python3 -m http.server 8765 & python3 tests/offline_test.py   # game with no backend = unchanged behaviour
bun tests/bench.ts                               # latency + cache-hit simulation
```

Covered: recognized, misspelled, ambiguous, obscure-valid, invalid, uncertain answers; cache hits across players; model errors, HTTP 500, timeouts, unparseable output, AI switched off; prompt-injection attempts; duplicate run submissions; 50 simultaneous identical guesses (one model call); 40 simultaneous run writes (exact counts); rate limits; timer paused during checks and not charged; double-submit while checking; reviewer approve/reject; RLS lockdown of every table and function.

### Results on this branch (simulated network)
`bun tests/bench.ts`, 300 players, database 30 ms per call, model ~700 ms:
- Off-list guesses answered without the model: **97.7%** (85–88% of the ones that reach the server; the rest are matched in the browser from preloaded answers)
- Shared-cache path: **p50 31 ms, p95 41 ms** (target < 1 s)
- Model path: **p50 790 ms, p95 1,040 ms** (target < 2 s) — with a 1.3 s model: p50 1.5 s, p95 1.7 s

These use a simulated model. Real numbers depend on the provider and region — run `tools/bench-live.mjs` after deploying. If the model is regularly slower than 2 s, try OpenRouter's fastest provider for the model, a region closer to your Supabase project, or lower `AI_TIMEOUT_MS` (slow checks become "couldn't check", never a miss).

---

## When checks fail
A failed check is never a miss for the player ("Couldn't check … right now"). Each failure is recorded with its cause:

| `ff_log.outcome` | Player `reason` | Cause | What to do |
|---|---|---|---|
| `err-ai-rate` | `ai-rate-limited` | Provider returned 429 / quota exhausted (retried once first) | Free-tier limits are low; add billing or switch provider (`AI_PROVIDER=openrouter`) |
| `err-ai-timeout` | `timeout` | No reply within `AI_TIMEOUT_MS` | Raise `AI_TIMEOUT_MS` a little, or use a faster provider/region |
| `err-ai-http` | `ai-error` | Provider error (5xx retried once; 4xx = bad key/model id/request) | Check the message in the review page / function logs |
| `err-ai-network` | `ai-error` | Provider unreachable (retried once) | Usually transient |
| `err-ai-response` | `ai-error` | Provider replied with something that isn't its JSON format | Check `AI_BASE_URL` / provider |
| *(function logs only)* | `db-error` | Database error, e.g. `42501 permission denied` | Run `npx supabase db push` (grants migration) |
| `rate` | `rate` | Our own per-player/IP/global limit | Adjust `RL_*` secrets |

The review page shows each failure type separately. Database errors can't be written to the database, so they appear in Supabase → Edge Functions → `ff` → Logs as one JSON line, e.g. `{"at":"validate","kind":"db","status":403,"msg":"db GET /ff_answers HTTP 403 42501: permission denied for table ff_answers"}`. Every logged message passes through redaction: the configured keys, admin token, Supabase keys/JWTs, Google/OpenRouter-style keys, bearer tokens, `key=` query values and connection strings are replaced with `[redacted]`.

`tools/bench-live.mjs` lists unavailable responses with their reason and leaves them out of the hit rate and latency figures.

## Security notes
- The model key, the database secret key and the admin token exist only as Supabase function secrets. The browser knows only the function URL.
- Every table has row-level security on with no policies, and the public roles have no table, sequence or function grants: the publishable/anon key can't read or write anything. `service_role` (used only inside the function) gets explicit table, sequence and function grants in `20261126010000_service_role_grants.sql`.
- Player text is untrusted: control characters stripped, length-capped, instruction-like text rejected before the model, sent to the model as a JSON field (never mixed into the instructions), and the reply must match a 3-field schema or it counts as "unsure". The worst a successful injection can do is get one answer accepted — rarity-capped and in the review queue.
- The server only counts answer keys it recognizes when recording runs, and ignores duplicate run submissions.

## Toward server-authoritative multiplayer
The pieces are already server-side: the answer list, matcher, validation and stats all run in the function. Next steps, without changing the game's structure:
1. `POST /match/start` → server picks the prompts and returns a match id + signed round tokens (server clock starts).
2. `/validate` takes the match id: the server records accepted answers and the time it received them (it already returns its own `ms`).
3. Score and rarity computed on the server from those records; `/run` becomes "finish match" instead of a client-reported score.
4. Live head-to-head: Supabase Realtime channels keyed by match id broadcast each player's accepted answer.
