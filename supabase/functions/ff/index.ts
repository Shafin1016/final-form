// Supabase Edge Function entry point. All settings come from function secrets (see docs/AI_VALIDATION.md).
import { makeApp, DEFAULTS } from './handler.ts';
import { pgStore } from './store.ts';
import type { AiConfig } from './ai.ts';

const env = (k: string, d = '') => Deno.env.get(k) ?? d;
const num = (k: string, d: number) => { const v = Number(env(k)); return env(k) !== '' && isFinite(v) ? v : d; };

const provider = (env('AI_PROVIDER', 'gemini') as AiConfig['provider']);
const ai: AiConfig | null = env('AI_API_KEY') || provider === 'openai' ? {
  provider,
  model: env('AI_MODEL', provider === 'openrouter' ? 'google/gemma-4-26b-a4b-it' : provider === 'gemini' ? 'gemma-4-26b-a4b-it' : 'google/gemma-4-26B-A4B-it'),
  baseUrl: env('AI_BASE_URL'),
  apiKey: env('AI_API_KEY'),
  timeoutMs: num('AI_TIMEOUT_MS', 2500),
  maxTokens: num('AI_MAX_TOKENS', 60),
  extraBody: env('AI_EXTRA_BODY') ? JSON.parse(env('AI_EXTRA_BODY')) : null,
} : null;

// server-only key: the new-style secret key if the project has one, else the legacy service_role key
const secretKey = (() => { try { const k = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}'); if (k.default) return k.default; } catch { /* fall through */ } return env('SUPABASE_SERVICE_ROLE_KEY'); })();
const store = pgStore(env('SUPABASE_URL'), secretKey);
const bg = (p: Promise<unknown>) => { const q = p.catch(e => console.warn('bg', e)); const rt = (globalThis as any).EdgeRuntime; if (rt && rt.waitUntil) rt.waitUntil(q); };

const handle = makeApp(store, ai, {
  allowedOrigins: env('ALLOWED_ORIGINS') ? env('ALLOWED_ORIGINS').split(',').map(s => s.trim()).filter(Boolean) : DEFAULTS.allowedOrigins,
  adminToken: env('ADMIN_TOKEN'),
  acceptConf: num('AI_ACCEPT_CONF', DEFAULTS.acceptConf),
  rejectConf: num('AI_REJECT_CONF', DEFAULTS.rejectConf),
  negTtlSecs: num('NEG_TTL_SECS', DEFAULTS.negTtlSecs),
  unsureTtlSecs: num('UNSURE_TTL_SECS', DEFAULTS.unsureTtlSecs),
  cacheTtlMs: num('CACHE_TTL_MS', DEFAULTS.cacheTtlMs),
  statsTtlMs: num('STATS_TTL_MS', DEFAULTS.statsTtlMs),
  rlPlayerPerMin: num('RL_PLAYER_PER_MIN', DEFAULTS.rlPlayerPerMin),
  rlIpPerMin: num('RL_IP_PER_MIN', DEFAULTS.rlIpPerMin),
  rlGlobalPerMin: num('RL_GLOBAL_PER_MIN', DEFAULTS.rlGlobalPerMin),
  rlRunsPerHour: num('RL_RUNS_PER_HOUR', DEFAULTS.rlRunsPerHour),
}, { bg, secrets: [secretKey, env('SUPABASE_SERVICE_ROLE_KEY'), env('SUPABASE_SECRET_KEYS'), env('SUPABASE_DB_URL')] });

Deno.serve(handle);
