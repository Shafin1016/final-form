// Final Form backend: one edge function, several routes.
//   POST /validate   tiered answer check: bank -> shared validated answers -> negative cache -> Gemma
//   GET  /answers    validated answers for some prompts (the game preloads these so cached hits are instant)
//   POST /run        record a finished run (deduped), feeds the shared rarity stats
//   GET  /stats      shared stats in the shape the game already uses
//   POST /claim      "I think this is an answer"
//   /admin/*         review queue, decisions, metrics, export (needs ADMIN_TOKEN)
import '../_shared/ff-core.js';
import { BANK } from '../_shared/bank.js';
import { askAi, cleanInput, type AiConfig } from './ai.ts';
import type { Store, Answer } from './store.ts';
import { classify, redact, OUTCOME, REASON } from './errors.ts';

const C = (globalThis as any).FFCore;
const BIN = 25, NBINS = 28;

export type Settings = {
  allowedOrigins: string[];        // ['*'] or exact origins
  adminToken: string;
  acceptConf: number;              // AI "yes" needs at least this confidence
  rejectConf: number;              // AI "no" needs at least this confidence to count as a miss
  negTtlSecs: number;              // how long an AI "no" is remembered before asking again
  unsureTtlSecs: number;           // how long an AI "unsure" is remembered
  cacheTtlMs: number;              // per-instance cache of validated answers
  statsTtlMs: number;
  rlPlayerPerMin: number; rlIpPerMin: number; rlGlobalPerMin: number; rlRunsPerHour: number;
};
export const DEFAULTS: Settings = {
  allowedOrigins: ['https://shafin1016.github.io', 'http://localhost:8765'], adminToken: '',
  acceptConf: 0.75, rejectConf: 0.9, negTtlSecs: 7 * 86400, unsureTtlSecs: 3600, cacheTtlMs: 15000, statsTtlMs: 20000,
  rlPlayerPerMin: 20, rlIpPerMin: 40, rlGlobalPerMin: 600, rlRunsPerHour: 60,
};

// text that is trying to talk to the model rather than name something never reaches it
export function looksLikeInstructions(raw: string): boolean {
  if (/[{}<>`\\]/.test(raw) || raw.split(/\s+/).length > 10) return true;
  return /\b(ignore|disregard|forget|override)\s+(all|any|the|your|previous|prior|above|earlier)\b/i.test(raw)
    || /\b(say|answer|reply|respond|output|return|mark|treat)\s+(it\s+|this\s+|with\s+|as\s+)*["']?(yes|valid|true|correct)\b/i.test(raw)
    || /\byou (must|should|will|are now|are an? (ai|assistant|model|judge|grader))\b/i.test(raw) || /\b(system|developer)\s*(prompt|message|instruction)/i.test(raw);
}

type View = { at: number; rows: Answer[]; keys: Map<string, any>; extraKeys: Map<string, any>; answers: any[]; rejected: Set<string> };

export function makeApp(store: Store, ai: AiConfig | null, settings: Partial<Settings> = {}, deps: { fetchFn?: typeof fetch; now?: () => number; bg?: (p: Promise<unknown>) => void; secrets?: string[]; logger?: (line: string) => void } = {}) {
  const S: Settings = { ...DEFAULTS, ...settings };
  const now = deps.now || (() => Date.now());
  const secrets = [S.adminToken, ai ? ai.apiKey : '', ...(deps.secrets || [])].filter(Boolean);
  const logger = deps.logger || ((line: string) => console.warn(line));
  const bg = deps.bg || ((p: Promise<unknown>) => { p.catch(e => logger(JSON.stringify({ at: 'background', ...safeErr(e) }))); });
  // classify + redact: the function log and ff_log say what failed, never with a key in it
  function safeErr(e: unknown) { const c = classify(e); return { kind: c.kind, status: c.status, msg: redact(c.msg, secrets) }; }
  function fail(where: string, pid: string | null, n: string | null, t0: number, e: unknown) {
    const c = safeErr(e); logger(JSON.stringify({ at: where, prompt: pid, ...c }));
    if (c.kind !== 'db') bg(store.log(pid, n, OUTCOME[c.kind], elapsed(t0), `${c.status ?? ''} ${c.msg}`.trim()));  // db down: logging to it would fail too
    return { status: 'unavailable', reason: REASON[c.kind], ms: elapsed(t0) };
  }
  const PROMPTS = new Map<string, any>();
  for (const b of BANK as any[]) {
    const parsed = C.parseAnswers(b.a);
    const examples = [...parsed.answers].sort((x: any, y: any) => C.TIER_ORDER.indexOf(y.tier) - C.TIER_ORDER.indexOf(x.tier)).slice(0, 6).map((x: any) => x.name);
    PROMPTS.set(b.id, { id: b.id, q: b.q, cat: b.cat, src: b.src, examples, ...parsed });
  }
  const views = new Map<string, View>();
  const inflight = new Map<string, Promise<any>>();
  let statsCache: { at: number; v: unknown } | null = null;

  function buildView(pid: string, rows: Answer[]): View {
    const p = PROMPTS.get(pid), live = rows.filter(r => r.status !== 'rejected');
    const v: any = { at: now(), rows, keys: p.keys, answers: p.answers.slice(), rejected: new Set<string>() };
    for (const r of rows) if (r.status === 'rejected') for (const k of [r.key, ...(r.aliases || [])]) if (!p.keys.has(k)) v.rejected.add(k);  // a rejected spelling never blocks the bank answer itself
    C.addExtra(v, live.map(r => ({ key: r.key, name: r.name, aliases: r.aliases, tier: r.tier, status: r.status })));
    return v;
  }
  async function getViews(pids: string[]): Promise<Map<string, View>> {
    const out = new Map<string, View>(), need: string[] = [];
    for (const id of pids) { const v = views.get(id); if (v && now() - v.at < S.cacheTtlMs) out.set(id, v); else need.push(id); }
    if (need.length) {
      const rows = await store.answers(need);
      for (const id of need) { const v = buildView(id, rows.filter(r => r.prompt_id === id)); views.set(id, v); out.set(id, v); }
    }
    return out;
  }
  const pubAnswer = (a: any, status: string, alias = false) => ({ key: a.key, name: a.name, tier: a.tier || null, status, alias });
  const elapsed = (t0: number) => now() - t0;

  async function validate(pid: string, rawIn: string, player: string, ip: string) {
    const t0 = now();
    try { return await validateInner(pid, rawIn, player, ip, t0); }
    catch (e) { return fail('validate', pid, C.norm(cleanInput(rawIn)), t0, e); }  // e.g. database error before the model step
  }
  async function validateInner(pid: string, rawIn: string, player: string, ip: string, t0: number) {
    const p = PROMPTS.get(pid);
    if (!p) return { http: 400, status: 'error', reason: 'unknown prompt' };
    const raw = cleanInput(rawIn), n = C.norm(raw);
    if (!n || n.length > 60) return { status: 'invalid', source: 'input', ms: elapsed(t0) };
    // tier 1+2: hand-written bank with aliases and fuzzy matching (same code as the game)
    const m = C.matchKeys(p.keys, raw);
    if (m.ans) { bg(store.log(pid, n, 'bank', elapsed(t0))); return { status: 'valid', source: 'bank', answer: pubAnswer(m.ans, 'bank'), ms: elapsed(t0) }; }
    if (m.ambiguous) return { status: 'ambiguous', source: 'bank', ms: elapsed(t0) };
    if (looksLikeInstructions(raw)) { bg(store.log(pid, n, 'input', elapsed(t0), 'instruction-like')); return { status: 'invalid', source: 'input', ms: elapsed(t0) }; }
    // tier 3: answers already validated for this prompt (by AI or a reviewer), shared by every player
    const [vm, ver] = await Promise.all([getViews([pid]), store.verdict(pid, n)]); const view = vm.get(pid)!;
    if (view.rejected.has(n)) { bg(store.log(pid, n, 'cache', elapsed(t0), 'rejected')); return { status: 'invalid', source: 'review', ms: elapsed(t0) }; }
    const e = C.matchKeys(view.extraKeys, raw);
    if (e.ans) { bg(store.bumpHit(pid, e.ans.key)); bg(store.log(pid, n, 'cache', elapsed(t0))); return { status: 'valid', source: 'cache', answer: pubAnswer(e.ans, e.ans.status || (e.ans.ai ? 'ai' : 'approved'), !e.ans.extra), ms: elapsed(t0) }; }
    if (e.ambiguous) return { status: 'ambiguous', source: 'cache', ms: elapsed(t0) };
    if (ver) {
      const live = !ver.expires_at || Date.parse(ver.expires_at) > now();
      if (ver.review_status === 'rejected') { bg(store.log(pid, n, 'neg', elapsed(t0), 'reviewed')); return { status: 'invalid', source: 'review', ms: elapsed(t0) }; }
      if (live && ver.verdict === 'invalid') { bg(store.log(pid, n, 'neg', elapsed(t0))); return { status: 'invalid', source: 'cache', ms: elapsed(t0) }; }
      if (live && ver.verdict === 'uncertain') { bg(store.log(pid, n, 'neg', elapsed(t0), 'uncertain')); return { status: 'uncertain', source: 'cache', ms: elapsed(t0) }; }
    }
    if (!ai) return { status: 'unavailable', reason: 'ai-off', ms: elapsed(t0) };
    // tier 4: live model, once per prompt+spelling no matter how many players send it at the same moment
    const fk = pid + '|' + n, running = inflight.get(fk);
    if (running) { const r = await running; bg(store.log(pid, n, 'dedupe', elapsed(t0))); return { ...r, deduped: true, ms: elapsed(t0) }; }
    const job = (async () => { try {
      const ok = await Promise.all([store.rateHit('p:' + player, S.rlPlayerPerMin, 60), store.rateHit('ip:' + ip, S.rlIpPerMin, 60), store.rateHit('global', S.rlGlobalPerMin, 60)]);
      if (ok.includes(false)) { bg(store.log(pid, n, 'rate', elapsed(t0))); return { status: 'unavailable', reason: 'rate' }; }
      let out;
      try { out = await askAi(ai, p, raw, deps.fetchFn); }
      catch (err) { return fail('model', pid, n, t0, err); }
      if (out.v === 'yes' && out.c >= S.acceptConf) {
        const name = out.name || raw, key = C.norm(name) || n;
        if (view.rejected.has(key)) { bg(store.log(pid, n, 'ai-invalid', elapsed(t0), 'canonical was rejected in review')); return { status: 'invalid', source: 'review' }; }
        const bank = C.matchKeys(p.keys, name), known = bank.ans ? null : C.matchKeys(view.extraKeys, name);
        const target = bank.ans || (known && known.ans) || null;
        const row = await store.addAnswer(pid, target ? target.key : key, target ? target.name : name, [...new Set([n, key])], bank.ans ? 'ai-alias' : 'ai', ai.model, out.c);
        views.delete(pid);
        if (row && row.status === 'rejected') {   // a reviewer already turned this one down: a person decides again
          await store.noteVerdict(pid, n, raw, 'uncertain', name, out.c, S.unsureTtlSecs);
          bg(store.log(pid, n, 'ai-uncertain', elapsed(t0), 'matches a rejected answer')); return { status: 'uncertain', source: 'review' };
        }
        bg(store.log(pid, n, 'ai-valid', elapsed(t0), `${name} c=${out.c} ai=${out.ms}ms${out.attempts > 1 ? ' retried' : ''}`));
        const st = row && row.status === 'approved' ? 'approved' : 'ai';
        return { status: 'valid', source: 'ai', answer: bank.ans ? { ...pubAnswer(bank.ans, 'ai', true) } : pubAnswer({ key: row.key, name: row.name, tier: row.tier }, st), confidence: out.c };
      }
      if (out.v === 'no' && out.c >= S.rejectConf) {
        await store.noteVerdict(pid, n, raw, 'invalid', out.name || null, out.c, S.negTtlSecs);
        bg(store.log(pid, n, 'ai-invalid', elapsed(t0), `c=${out.c} ai=${out.ms}ms`)); return { status: 'invalid', source: 'ai', confidence: out.c };
      }
      // not sure: no strike for the player, and a person decides later
      await store.noteVerdict(pid, n, raw, 'uncertain', out.name || null, out.c, S.unsureTtlSecs);
      bg(store.log(pid, n, 'ai-uncertain', elapsed(t0), `${out.v} c=${out.c} ai=${out.ms}ms`)); return { status: 'uncertain', source: 'ai', confidence: out.c };
    } catch (e) { return fail('validate-save', pid, n, t0, e); } })();   // the job never rejects, so deduped waiters get the same answer
    inflight.set(fk, job);
    try { const r = await job; return { ...r, ms: elapsed(t0) }; }
    finally { inflight.delete(fk); }
  }

  async function answers(ids: string[]) {
    ids = [...new Set(ids)].filter(id => PROMPTS.has(id)).slice(0, 12);
    const vm = await getViews(ids), out: Record<string, unknown[]> = {};
    for (const id of ids) out[id] = vm.get(id)!.rows.filter(r => r.status !== 'rejected').map(r => ({ key: r.key, name: r.name, aliases: r.aliases, tier: r.tier, status: r.status }));
    return { answers: out };
  }

  async function recordRun(body: any, ip: string) {
    const run = body && body.run, player = String(body && body.player || '').slice(0, 64);
    if (!run || !player || typeof run.ts !== 'number' || !Array.isArray(run.ans) || run.ans.length > 10) return { http: 400, error: 'bad run' };
    const score = Math.round(Number(run.score)); if (!isFinite(score) || score < 0 || score > 5000) return { http: 400, error: 'bad score' };
    if (!(await store.rateHit('run:' + ip, S.rlRunsPerHour, 3600))) return { http: 429, error: 'slow down' };
    const ids = run.ans.map((a: any) => String(a && a.p || '')).filter((id: string) => PROMPTS.has(id));
    const vm = await getViews(ids);
    // only count answer keys the server itself recognises for that prompt
    const ans = run.ans.filter((a: any) => a && PROMPTS.has(a.p)).map((a: any) => {
      const p = PROMPTS.get(a.p), v = vm.get(a.p)!, k = typeof a.a === 'string' ? a.a : null;
      const ok = k && (p.answers.some((x: any) => x.key === k) || v.rows.some(r => r.key === k && r.status !== 'rejected'));
      return { p: a.p, a: ok ? k : null };
    });
    const data = JSON.parse(JSON.stringify(run)); if (JSON.stringify(data).length > 12000) return { http: 413, error: 'run too large' };
    const recorded = await store.recordRun(player, Math.round(run.ts), Number.isInteger(run.day) ? run.day : null, String(run.mode || '').slice(0, 12), score, String(run.rank || '').slice(0, 12), data, Math.min(NBINS - 1, Math.floor(score / BIN)), ans);
    statsCache = null;
    return { ok: true, recorded };
  }

  async function stats() {
    if (statsCache && now() - statsCache.at < S.statsTtlMs) return statsCache.v;
    const v = { stats: await store.stats(NBINS) }; statsCache = { at: now(), v }; return v;
  }

  async function claim(body: any, ip: string) {
    const pid = String(body && body.p || ''), raw = cleanInput(body && body.raw), n = C.norm(raw);
    if (!PROMPTS.has(pid) || !n) return { http: 400, error: 'bad claim' };
    if (!(await store.rateHit('claim:' + ip, 60, 3600))) return { http: 429, error: 'slow down' };
    await store.noteVerdict(pid, n, raw, 'claim', null, null, null); return { ok: true };
  }

  async function admin(path: string, req: Request, body: any) {
    if (path === '/admin/queue') {
      const q = await store.queue(300), info = (id: string) => { const p = PROMPTS.get(id); return p ? { q: p.q, src: p.src } : null; };
      return { answers: q.answers.map(a => ({ ...a, prompt: info(a.prompt_id) })), verdicts: q.verdicts.map(v => ({ ...v, prompt: info(v.prompt_id) })) };
    }
    if (path === '/admin/metrics') return { metrics: await store.metrics(Number(new URL(req.url).searchParams.get('hours')) || 24) };
    if (path === '/admin/export') return { approved: await store.approved() };
    if (path === '/admin/decide') {
      const pid = String(body.p || ''), tier = body.tier && C.TIER_ORDER.includes(body.tier) ? body.tier : null;
      if (!PROMPTS.has(pid)) return { http: 400, error: 'unknown prompt' };
      views.delete(pid);
      if (body.type === 'answer') {
        const key = String(body.key || '');
        if (body.action === 'approve') return { ok: true, answer: await store.setAnswer(pid, key, { status: 'approved', tier, ...(body.name ? { name: String(body.name).slice(0, 80) } : {}), reviewed_at: new Date(now()).toISOString() } as any) };
        if (body.action === 'reject') return { ok: true, answer: await store.setAnswer(pid, key, { status: 'rejected', reviewed_at: new Date(now()).toISOString() } as any) };
      }
      if (body.type === 'verdict') {
        const n = String(body.norm || '');
        if (body.action === 'approve') {
          const name = String(body.name || '').slice(0, 80); if (!name) return { http: 400, error: 'name required' };
          const p = PROMPTS.get(pid), bank = C.matchKeys(p.keys, name), key = bank.ans ? bank.ans.key : C.norm(name);
          await store.addAnswer(pid, key, bank.ans ? bank.ans.name : name, [...new Set([n, key, ...((body.aliases || []) as string[]).map((x: string) => C.norm(x)).filter(Boolean)])], 'review', null, null);
          const a = await store.setAnswer(pid, key, { status: 'approved', tier, reviewed_at: new Date(now()).toISOString() } as any);
          await store.setVerdict(pid, n, { review_status: 'approved' }); return { ok: true, answer: a };
        }
        if (body.action === 'reject') { await store.setVerdict(pid, n, { review_status: 'rejected', verdict: 'invalid', expires_at: null }); return { ok: true }; }
        if (body.action === 'dismiss') { await store.setVerdict(pid, n, { review_status: 'dismissed' }); return { ok: true }; }
      }
      return { http: 400, error: 'bad decision' };
    }
    return { http: 404, error: 'not found' };
  }

  function cors(req: Request): Record<string, string> {
    const o = req.headers.get('origin') || '', any = S.allowedOrigins.includes('*');
    const h: Record<string, string> = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info', Vary: 'Origin' };
    if (any) h['Access-Control-Allow-Origin'] = '*'; else if (S.allowedOrigins.includes(o)) h['Access-Control-Allow-Origin'] = o;
    return h;
  }
  const safeEq = (a: string, b: string) => { if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

  return async function handle(req: Request): Promise<Response> {
    const H = cors(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
    const send = (o: any, extra: Record<string, string> = {}) => { const status = o && o.http || 200; if (o && o.http) delete o.http; return new Response(JSON.stringify(o), { status, headers: { ...H, 'Content-Type': 'application/json', ...extra } }); };
    try {
      const url = new URL(req.url), path = url.pathname.replace(/^.*?\/ff(?=\/|$)/, '').replace(/\/$/, '') || '/';
      const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
      let body: any = {};
      if (req.method === 'POST') { const t = await req.text(); if (t.length > 16000) return send({ http: 413, error: 'too large' }); try { body = t ? JSON.parse(t) : {}; } catch { return send({ http: 400, error: 'bad json' }); } }
      if (path.startsWith('/admin/')) {
        const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
        if (!safeEq(tok, S.adminToken)) return send({ http: 401, error: 'unauthorized' });
        return send(await admin(path, req, body), { 'Cache-Control': 'no-store' });
      }
      if (path === '/validate' && req.method === 'POST') return send(await validate(String(body.p || ''), String(body.raw || ''), String(body.player || 'anon').slice(0, 64), ip), { 'Cache-Control': 'no-store' });
      if (path === '/answers' && req.method === 'GET') return send(await answers((url.searchParams.get('p') || '').split(',').filter(Boolean)), { 'Cache-Control': 'public, max-age=15' });
      if (path === '/run' && req.method === 'POST') return send(await recordRun(body, ip));
      if (path === '/stats' && req.method === 'GET') return send(await stats(), { 'Cache-Control': 'public, max-age=15' });
      if (path === '/claim' && req.method === 'POST') return send(await claim(body, ip));
      if (path === '/health') return send({ ok: true, prompts: PROMPTS.size, ai: !!ai, model: ai ? ai.model : null });
      return send({ http: 404, error: 'not found' });
    } catch (e) {
      const c = safeErr(e); logger(JSON.stringify({ at: 'request', ...c }));
      return send({ http: c.kind === 'db' ? 503 : 500, status: 'unavailable', reason: REASON[c.kind], error: c.kind === 'db' ? 'database unavailable' : 'server error' });
    }
  };
}
