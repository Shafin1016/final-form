// Regression tests from the first live deployment:
//  - 42501 permission errors and other DB failures must come back as "unavailable" (no strike) and be logged as db errors
//  - provider rate limits, model errors, timeouts and network failures are told apart, retried once when it helps
//  - nothing logged or returned contains a key
//  - a not-quite-sure "no" (VTech Socrates) is not a strike
import { test, expect, describe } from 'bun:test';
import { makeApp } from '../supabase/functions/ff/handler.ts';
import { pgStore } from '../supabase/functions/ff/store.ts';
import { askAi, type AiConfig } from '../supabase/functions/ff/ai.ts';
import { redact, AppError } from '../supabase/functions/ff/errors.ts';
import { memoryStore } from './memory-store.ts';
import { pathOf, summarize } from '../tools/bench-stats.mjs';

const KEY = 'AIzaSyD-test-key-0123456789abcdefghij', ADMIN = 'admin-token-abcdef123456', DBKEY = 'sb_secret_TESTdbKEY987654321';
const P = 'consoles';
const cfg = (over: Partial<AiConfig> = {}): AiConfig => ({ provider: 'gemini', model: 'gemma-4-26b-a4b-it', baseUrl: '', apiKey: KEY, timeoutMs: 1500, maxTokens: 60, extraBody: null, ...over });
const ok = (o: any) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] }), { status: 200 });

// scripted provider: each call takes the next step
function provider(steps: (() => Response | Promise<Response>)[]) {
  const st = { calls: 0 };
  const f = (async (_url: string, init: any) => {
    const step = steps[Math.min(st.calls, steps.length - 1)]; st.calls++;
    return await new Promise<Response>((res, rej) => {
      init.signal?.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
      Promise.resolve().then(step).then(res, rej);
    });
  }) as unknown as typeof fetch;
  return { f, st };
}
function app(fetchFn: typeof fetch, store = memoryStore(), settings: any = {}) {
  const lines: string[] = [];
  const h = makeApp(store, cfg(), { allowedOrigins: ['*'], adminToken: ADMIN, cacheTtlMs: 0, ...settings }, { fetchFn, bg: p => { p.catch(() => {}); }, secrets: [DBKEY], logger: l => lines.push(l) });
  const v = async (raw: string) => { const r = await h(new Request('http://f/ff/validate', { method: 'POST', body: JSON.stringify({ p: P, raw, player: 'u' }) })); return { http: r.status, ...(await r.json() as any) }; };
  return { h, v, lines, store };
}
const outcomes = (s: any) => s._.logs.map((l: any) => l.o);
const allText = (a: any) => JSON.stringify(a.lines) + JSON.stringify(a.store._ ? a.store._.logs : []);

describe('provider failures are classified, never a strike', () => {
  test('429 rate limit: retried once, then "ai-rate-limited"', async () => {
    const pr = provider([() => new Response(`{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for key ${KEY}"}}`, { status: 429 })]);
    const a = app(pr.f); const r = await a.v('Koei PasoGo');
    expect(r.status).toBe('unavailable'); expect(r.reason).toBe('ai-rate-limited'); expect(pr.st.calls).toBe(2);
    expect(outcomes(a.store)).toContain('err-ai-rate');
    expect(allText(a)).not.toContain(KEY); expect(allText(a)).toContain('429');
  });
  test('transient 429 then success: the player just gets the answer', async () => {
    const pr = provider([() => new Response('rate limited', { status: 429 }), () => ok({ v: 'yes', name: 'Koei PasoGo', c: 0.9 })]);
    const a = app(pr.f); const r = await a.v('Koei PasoGo');
    expect(r.status).toBe('valid'); expect(pr.st.calls).toBe(2); expect(a.store._.logs.find((l: any) => l.o === 'ai-valid').d).toContain('retried');
  });
  test('5xx model error: retried once, then "ai-error" / err-ai-http', async () => {
    const pr = provider([() => new Response('{"error":{"code":503,"message":"The model is overloaded"}}', { status: 503 })]);
    const a = app(pr.f); const r = await a.v('Epoch Cassette Vision');
    expect(r.reason).toBe('ai-error'); expect(pr.st.calls).toBe(2); expect(outcomes(a.store)).toContain('err-ai-http');
    expect(a.lines.some(l => l.includes('"kind":"ai-http"') && l.includes('503'))).toBe(true);
  });
  test('4xx (bad request / bad key) is not retried, and the key is redacted', async () => {
    const pr = provider([() => new Response(`API key not valid: ${KEY} (key=${KEY})`, { status: 400 })]);
    const a = app(pr.f); const r = await a.v('Pioneer LaserActive');
    expect(r.reason).toBe('ai-error'); expect(pr.st.calls).toBe(1); expect(allText(a)).not.toContain(KEY);
  });
  test('timeout: "timeout", not retried, inside the time budget', async () => {
    const pr = provider([() => new Promise<Response>(() => {})]);
    const a = app(pr.f); const t0 = Date.now(); const r = await a.v('Tapwave Zodiac');
    expect(r.reason).toBe('timeout'); expect(pr.st.calls).toBe(1); expect(Date.now() - t0).toBeLessThan(2200); expect(outcomes(a.store)).toContain('err-ai-timeout');
  });
  test('network failure: retried, then err-ai-network', async () => {
    const pr = provider([() => { throw new TypeError('fetch failed: getaddrinfo ENOTFOUND'); }]);
    const a = app(pr.f); const r = await a.v('Nuon'); expect(r.status).toBe('unavailable'); expect(pr.st.calls).toBe(2); expect(outcomes(a.store)).toContain('err-ai-network');
  });
  test('200 with a non-JSON body: err-ai-response', async () => {
    const pr = provider([() => new Response('<html>proxy error</html>', { status: 200 })]);
    const a = app(pr.f); expect((await a.v('Nuon')).reason).toBe('ai-error'); expect(outcomes(a.store)).toContain('err-ai-response');
  });
  test('200 with an error object (quota) counts as a rate limit', async () => {
    const pr = provider([() => new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED' } }), { status: 200 })]);
    const a = app(pr.f); expect((await a.v('Nuon')).reason).toBe('ai-rate-limited');
  });
  test('no retry when the budget is nearly spent', async () => {
    const pr = provider([async () => { await new Promise(r => setTimeout(r, 700)); return new Response('busy', { status: 429 }); }]);
    const t0 = Date.now(); await expect(askAi(cfg({ timeoutMs: 1500 }), { q: 'q', cat: 'c', src: 's', examples: [] }, 'x', pr.f)).rejects.toMatchObject({ kind: 'ai-rate-limited' });
    expect(pr.st.calls).toBe(1); expect(Date.now() - t0).toBeLessThan(1500);
  });
  test('players waiting on the same failing check all get "unavailable" from one attempt', async () => {
    const pr = provider([async () => { await new Promise(r => setTimeout(r, 50)); return new Response('x', { status: 400 }); }]);
    const a = app(pr.f); const rs = await Promise.all(Array.from({ length: 8 }, () => a.v('Koei PasoGo')));
    expect(rs.every(r => r.status === 'unavailable')).toBe(true); expect(pr.st.calls).toBe(1);
  });
});

describe('database failures (e.g. 42501 permission denied)', () => {
  const denied = (async () => new Response(JSON.stringify({ code: '42501', message: 'permission denied for table ff_answers', hint: null }), { status: 403 })) as unknown as typeof fetch;
  test('pgStore turns PostgREST errors into typed db errors without the key', async () => {
    try { await pgStore('https://x.supabase.co', DBKEY, denied).answers([P]); throw new Error('should fail'); }
    catch (e) { expect(e).toBeInstanceOf(AppError); expect((e as AppError).kind).toBe('db'); expect((e as Error).message).toContain('42501'); expect((e as Error).message).toContain('ff_answers'); expect((e as Error).message).not.toContain(DBKEY); }
    const down = (async () => { throw new TypeError(`connect ECONNREFUSED apikey=${DBKEY}`); }) as unknown as typeof fetch;
    await expect(pgStore('https://x', DBKEY, down).stats(28)).rejects.toMatchObject({ kind: 'db' });
    try { await pgStore('https://x', DBKEY, down).stats(28); } catch (e) { expect((e as Error).message).not.toContain(DBKEY); }
  });
  test('validate with a broken database: unavailable (no strike), logged as db, bank answers still work', async () => {
    const pr = provider([() => ok({ v: 'yes', name: 'x', c: 1 })]);
    const store = pgStore('https://x.supabase.co', DBKEY, denied);
    const lines: string[] = [];
    const h = makeApp(store, cfg(), { allowedOrigins: ['*'], cacheTtlMs: 0 }, { fetchFn: pr.f, bg: p => { p.catch(() => {}); }, secrets: [DBKEY], logger: l => lines.push(l) });
    const v = async (raw: string) => { const r = await h(new Request('http://f/ff/validate', { method: 'POST', body: JSON.stringify({ p: P, raw }) })); return { http: r.status, ...(await r.json() as any) }; };
    const r = await v('VTech Socrates');
    expect(r.http).toBe(200); expect(r.status).toBe('unavailable'); expect(r.reason).toBe('db-error'); expect(pr.st.calls).toBe(0);
    expect(lines.some(l => l.includes('"kind":"db"') && l.includes('42501'))).toBe(true); expect(lines.join()).not.toContain(DBKEY);
    expect((await v('PlayStation 2')).status).toBe('valid');                  // tier 1 needs no database
    const s = await h(new Request('http://f/ff/stats')); expect(s.status).toBe(503); expect(((await s.json()) as any).reason).toBe('db-error');
  });
  test('database failing after the model answered (saving) is still unavailable, not a crash', async () => {
    const pr = provider([() => ok({ v: 'yes', name: 'Bandai Playdia', c: 0.95 })]);
    const store = memoryStore(); store.addAnswer = async () => { throw new AppError('db', 'db POST /rpc/ff_add_answer HTTP 403 42501: permission denied for function ff_add_answer', 403); };
    const a = app(pr.f, store); const r = await a.v('Bandai Playdia');
    expect(r.status).toBe('unavailable'); expect(r.reason).toBe('db-error'); expect(a.lines.some(l => l.includes('validate-save') && l.includes('42501'))).toBe(true);
  });
});

describe('false negatives', () => {
  test('a "no" below 0.9 confidence is "unsure" (no strike, goes to review)', async () => {
    const pr = provider([() => ok({ v: 'no', name: '', c: 0.85 })]);
    const a = app(pr.f); const r = await a.v('VTech Socrates'); expect(r.status).toBe('uncertain');
  });
  test('a confident "no" is still a miss, and shows up in the review queue so it can be overturned', async () => {
    const pr = provider([() => ok({ v: 'no', name: '', c: 0.95 })]);
    const a = app(pr.f); expect((await a.v('VTech Socrates')).status).toBe('invalid');
    const q = await (await a.h(new Request('http://f/ff/admin/queue', { headers: { authorization: 'Bearer ' + ADMIN } }))).json() as any;
    expect(q.verdicts.find((x: any) => x.norm === 'vtechsocrates').verdict).toBe('invalid');
    await a.h(new Request('http://f/ff/admin/decide', { method: 'POST', headers: { authorization: 'Bearer ' + ADMIN }, body: JSON.stringify({ type: 'verdict', p: P, norm: 'vtechsocrates', action: 'approve', name: 'VTech Socrates' }) }));
    expect((await a.v('vtech socrates')).status).toBe('valid'); expect(pr.st.calls).toBe(1);
  });
  test('the prompt tells the model obscure/niche things count', async () => {
    const pr = provider([() => ok({ v: 'yes', name: 'x', c: 1 })]); let body = '';
    const f = (async (u: string, i: any) => { body = i.body; return pr.f(u, i); }) as unknown as typeof fetch;
    await askAi(cfg(), { q: 'q', cat: 'c', src: 's', examples: [] }, 'x', f); expect(body).toContain('educational, niche');
  });
});

describe('redaction', () => {
  test('known secrets and secret-shaped strings are removed', () => {
    const s = redact(`key ${KEY} admin ${ADMIN} sb_secret_abcDEF123 eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.c2lnbmF0dXJlX19f Bearer abc.def ?key=zzz&x=1 postgresql://u:p@h:5432/db sk-or-v1-0123456789abcdefghij`, [ADMIN]);
    for (const bad of [KEY, ADMIN, 'sb_secret_abc', 'eyJhbGci', 'abc.def', 'zzz', 'u:p@h', 'sk-or-v1']) expect(s).not.toContain(bad);
    expect(s).toContain('?key=[redacted]&x=1');
  });
});

describe('bench-live stats', () => {
  test('unavailable responses are excluded from hit rate and cached latency', () => {
    const rs = [
      { status: 'valid', source: 'ai', ms: 1300 }, { status: 'invalid', source: 'ai', ms: 1800 },
      { status: 'valid', source: 'cache', ms: 30 }, { status: 'invalid', source: 'cache', ms: 60 },
      { status: 'unavailable', reason: 'ai-rate-limited', ms: 2600 }, { status: 'unavailable', reason: 'timeout', ms: 2500 },
      { status: 'error', http: 500, error: 'server error', ms: 40 }, { status: 'valid', source: 'ai', deduped: true, ms: 900 },
    ];
    expect(rs.map(pathOf)).toEqual(['model', 'model', 'cache', 'cache', 'unavailable', 'unavailable', 'unavailable', 'dedupe']);
    const s = summarize(rs);
    expect(s.unavailable).toBe(3); expect(s.answered).toBe(5); expect(s.reasons).toEqual({ 'ai-rate-limited': 1, timeout: 1, 'server error': 1 });
    expect(s.hitRate).toBe(3 / 5); expect(s.cache).toEqual({ n: 2, p50: 60, p95: 60 }); expect(s.model.n).toBe(2);
  });
  test('all unavailable -> no hit rate rather than a fake 100%', () => {
    expect(summarize([{ status: 'unavailable', reason: 'db-error', ms: 20 }]).hitRate).toBe(null);
  });
});
