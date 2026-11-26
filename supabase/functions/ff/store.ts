// Database access through Supabase's REST API (PostgREST), using the service-role key that Supabase
// injects into edge functions. No client library: plain fetch. Tests swap in store_memory.ts.

import { AppError, redact } from './errors.ts';

export type Answer = { prompt_id: string; key: string; name: string; aliases: string[]; tier: string | null; status: 'ai' | 'approved' | 'rejected'; source: string; hits?: number; confidence?: number | null; model?: string | null; created_at?: string };
export type Verdict = { prompt_id: string; norm: string; raw: string; verdict: 'invalid' | 'uncertain' | 'claim'; ai_name: string | null; confidence: number | null; count: number; expires_at: string | null; review_status: string; last_at?: string };

export interface Store {
  answers(promptIds: string[]): Promise<Answer[]>;                 // non-rejected AND rejected (caller filters)
  verdict(promptId: string, norm: string): Promise<Verdict | null>;
  noteVerdict(promptId: string, norm: string, raw: string, verdict: string, aiName: string | null, conf: number | null, ttlSecs: number | null): Promise<void>;
  addAnswer(promptId: string, key: string, name: string, aliases: string[], source: string, model: string | null, conf: number | null): Promise<Answer>;
  bumpHit(promptId: string, key: string): Promise<void>;
  rateHit(bucket: string, limit: number, windowSecs: number): Promise<boolean>;
  recordRun(player: string, ts: number, day: number | null, mode: string, score: number, rank: string, data: unknown, bin: number, answers: { p: string; a: string | null }[]): Promise<boolean>;
  stats(nbins: number): Promise<unknown>;
  log(promptId: string | null, norm: string | null, outcome: string, latencyMs: number | null, detail?: string | null): Promise<void>;
  // review
  queue(limit: number): Promise<{ answers: Answer[]; verdicts: Verdict[] }>;
  setAnswer(promptId: string, key: string, patch: Partial<Answer>): Promise<Answer | null>;
  setVerdict(promptId: string, norm: string, patch: Partial<Verdict>): Promise<void>;
  approved(): Promise<Answer[]>;
  metrics(hours: number): Promise<unknown>;
}

export function pgStore(url: string, key: string, fetchFn: typeof fetch = fetch): Store {
  const base = url.replace(/\/$/, '') + '/rest/v1';
  const H: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) H.Authorization = 'Bearer ' + key;   // legacy JWT service_role key; new sb_secret_ keys go in apikey only
  const q = encodeURIComponent;
  async function call(method: string, path: string, body?: unknown, prefer?: string) {
    const what = `${method} ${path.split('?')[0]}`;   // table or rpc name only, never the filter values
    let r: Response;
    try { r = await fetchFn(base + path, { method, headers: prefer ? { ...H, Prefer: prefer } : H, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch (e) { throw new AppError('db', `database unreachable (${what}): ${redact((e as Error).message, [key])}`); }
    if (!r.ok) {
      // PostgREST errors look like {"code":"42501","message":"permission denied for table ff_answers",...}
      const t = await r.text().catch(() => ''); let code = '', msg = t;
      try { const j = JSON.parse(t); code = j.code || ''; msg = j.message || t; } catch { /* plain text */ }
      throw new AppError('db', `db ${what} HTTP ${r.status}${code ? ' ' + code : ''}: ${redact(msg, [key]).slice(0, 160)}`, r.status);
    }
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  const rpc = (fn: string, args: unknown) => call('POST', '/rpc/' + fn, args);
  const inList = (xs: string[]) => '(' + xs.map(x => '"' + x.replace(/["\\]/g, '') + '"').join(',') + ')';
  return {
    answers: ids => ids.length ? call('GET', `/ff_answers?select=prompt_id,key,name,aliases,tier,status,source&prompt_id=in.${q(inList(ids))}`) : Promise.resolve([]),
    verdict: async (p, n) => (await call('GET', `/ff_verdicts?prompt_id=eq.${q(p)}&norm=eq.${q(n)}&limit=1`))[0] || null,
    noteVerdict: async (p, n, raw, v, ai, c, ttl) => { await rpc('ff_note_verdict', { p_prompt: p, p_norm: n, p_raw: raw, p_verdict: v, p_ai_name: ai, p_conf: c, p_ttl_secs: ttl }); },
    addAnswer: (p, k, name, al, src, model, c) => rpc('ff_add_answer', { p_prompt: p, p_key: k, p_name: name, p_aliases: al, p_source: src, p_model: model, p_conf: c }),
    bumpHit: async (p, k) => { await rpc('ff_bump_hit', { p_prompt: p, p_key: k }); },
    rateHit: (b, l, w) => rpc('ff_rate_hit', { p_bucket: b, p_limit: l, p_window_secs: w }),
    recordRun: (pl, ts, day, mode, score, rank, data, bin, answers) => rpc('ff_record_run', { p_player: pl, p_ts: ts, p_day: day, p_mode: mode, p_score: score, p_rank: rank, p_data: data, p_bin: bin, p_answers: answers }),
    stats: n => rpc('ff_stats', { p_nbins: n }),
    log: async (p, n, o, ms, d) => { await call('POST', '/ff_log', { prompt_id: p, norm: n, outcome: o, latency_ms: ms, detail: d ? String(d).slice(0, 300) : null }, 'return=minimal'); },
    queue: async limit => ({
      answers: await call('GET', `/ff_answers?status=eq.ai&order=created_at.desc&limit=${limit}`),
      verdicts: await call('GET', `/ff_verdicts?review_status=eq.open&verdict=in.(uncertain,claim,invalid)&order=count.desc,last_at.desc&limit=${limit}`),
    }),
    setAnswer: async (p, k, patch) => (await call('PATCH', `/ff_answers?prompt_id=eq.${q(p)}&key=eq.${q(k)}`, { ...patch, updated_at: new Date().toISOString() }, 'return=representation'))[0] || null,
    setVerdict: async (p, n, patch) => { await call('PATCH', `/ff_verdicts?prompt_id=eq.${q(p)}&norm=eq.${q(n)}`, patch, 'return=minimal'); },
    approved: () => call('GET', `/ff_answers?status=eq.approved&order=prompt_id,key`),
    metrics: h => rpc('ff_metrics', { p_hours: h }),
  };
}
