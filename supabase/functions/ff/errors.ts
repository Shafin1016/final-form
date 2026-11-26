// Typed, secret-free errors so logs say *what* failed (provider rate limit, model error, timeout, database)
// without ever echoing keys, tokens or connection strings.

export type ErrKind =
  | 'ai-rate-limited'   // provider said 429 / quota exhausted
  | 'ai-timeout'        // no answer within AI_TIMEOUT_MS
  | 'ai-http'           // provider returned another non-2xx (model error, bad request, 5xx)
  | 'ai-network'        // couldn't reach the provider at all
  | 'ai-bad-response'   // 2xx but the body wasn't the provider's JSON format
  | 'db'                // Supabase REST / Postgres error (permissions, outage...)
  | 'internal';

export class AppError extends Error {
  kind: ErrKind; status?: number;
  constructor(kind: ErrKind, message: string, status?: number) { super(message); this.name = 'AppError'; this.kind = kind; this.status = status; }
}

// how each kind is recorded in ff_log.outcome and returned to the browser as `reason`
export const OUTCOME: Record<ErrKind, string> = {
  'ai-rate-limited': 'err-ai-rate', 'ai-timeout': 'err-ai-timeout', 'ai-http': 'err-ai-http', 'ai-network': 'err-ai-network',
  'ai-bad-response': 'err-ai-response', db: 'err-db', internal: 'err-internal',
};
export const REASON: Record<ErrKind, string> = {
  'ai-rate-limited': 'ai-rate-limited', 'ai-timeout': 'timeout', 'ai-http': 'ai-error', 'ai-network': 'ai-error',
  'ai-bad-response': 'ai-error', db: 'db-error', internal: 'error',
};

const PATTERNS: RegExp[] = [
  /sb_(secret|publishable)_[A-Za-z0-9_-]+/g,               // Supabase API keys
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,  // JWTs (legacy service_role / anon)
  /AIza[0-9A-Za-z_-]{20,}/g,                                // Google API keys
  /sk-(or-)?[A-Za-z0-9_-]{16,}/g,                           // OpenRouter / OpenAI-style keys
  /(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]+/gi,
  /([?&](key|api_key|apikey|token|access_token)=)[^&\s"']+/gi,
  /postgres(ql)?:\/\/[^\s"']+/gi,                            // connection strings
];

// strip anything secret-shaped, plus the exact values we know are secret
export function redact(text: unknown, secrets: string[] = []): string {
  let s = String(text ?? '');
  for (const sec of secrets) if (sec && sec.length >= 6) s = s.split(sec).join('[redacted]');
  for (const re of PATTERNS) s = s.replace(re, (_m, p1) => (typeof p1 === 'string' && /[?&]/.test(p1) ? p1 : '') + '[redacted]');
  return s.replace(/\s+/g, ' ').trim().slice(0, 300);
}

export function classify(err: unknown): { kind: ErrKind; status?: number; msg: string } {
  if (err instanceof AppError) return { kind: err.kind, status: err.status, msg: err.message };
  const e = err as Error;
  if (e && e.name === 'AbortError') return { kind: 'ai-timeout', msg: 'aborted' };
  return { kind: 'internal', msg: String((e && e.message) || err) };
}
