// In-memory Store with the same behaviour as the SQL functions, plus optional artificial DB latency.
import type { Store, Answer, Verdict } from '../supabase/functions/ff/store.ts';

export function memoryStore(opts: { latencyMs?: number; now?: () => number } = {}) {
  const now = opts.now || (() => Date.now());
  const wait = () => new Promise(r => setTimeout(r, opts.latencyMs || 0));
  const A = new Map<string, Answer>(), V = new Map<string, Verdict>(), R = new Map<string, { start: number; n: number }>();
  const runs = new Map<string, any>(), counts = new Map<string, number>(), bins = new Map<number, number>(), logs: any[] = [];
  const k2 = (a: string, b: string) => a + '\u0000' + b;
  const calls: Record<string, number> = {};
  const hit = (m: string) => { calls[m] = (calls[m] || 0) + 1; };
  const store: Store & { _: any } = {
    _: { A, V, runs, counts, bins, logs, calls },
    async answers(ids) { hit('answers'); await wait(); return [...A.values()].filter(a => ids.includes(a.prompt_id)).map(a => ({ ...a, aliases: [...a.aliases] })); },
    async verdict(p, n) { hit('verdict'); await wait(); const v = V.get(k2(p, n)); return v ? { ...v } : null; },
    async noteVerdict(p, n, raw, verdict, ai, c, ttl) { hit('noteVerdict'); await wait(); const k = k2(p, n), cur = V.get(k), exp = ttl == null ? null : new Date(now() + ttl * 1000).toISOString();
      if (!cur) V.set(k, { prompt_id: p, norm: n, raw: raw.slice(0, 120), verdict: verdict as any, ai_name: ai, confidence: c, count: 1, expires_at: exp, review_status: 'open' });
      else { cur.count++; if (!(cur.verdict === 'claim' && verdict !== 'claim')) cur.verdict = verdict as any; cur.ai_name = ai ?? cur.ai_name; cur.confidence = c ?? cur.confidence; cur.expires_at = exp ?? cur.expires_at; } },
    async addAnswer(p, key, name, al, src, model, c) { hit('addAnswer'); await wait(); const k = k2(p, key), cur = A.get(k);
      if (cur) { cur.aliases = [...new Set([...cur.aliases, ...al])]; return { ...cur }; }
      const row: Answer = { prompt_id: p, key, name: name.slice(0, 80), aliases: al, tier: null, status: 'ai', source: src, model, confidence: c, hits: 0 }; A.set(k, row); return { ...row }; },
    async bumpHit(p, key) { const r = A.get(k2(p, key)); if (r) r.hits = (r.hits || 0) + 1; },
    async rateHit(b, limit, win) { hit('rateHit'); await wait(); const t = now(), cur = R.get(b); if (!cur || cur.start < t - win * 1000) { R.set(b, { start: t, n: 1 }); return 1 <= limit; } cur.n++; return cur.n <= limit; },
    async recordRun(pl, ts, day, mode, score, rank, data, bin, answers) { hit('recordRun'); await wait(); const k = k2(pl, String(ts)); if (runs.has(k)) return false; runs.set(k, { pl, ts, day, mode, score, rank, data });
      bins.set(bin, (bins.get(bin) || 0) + 1); for (const a of answers) { counts.set(k2(a.p, ''), (counts.get(k2(a.p, '')) || 0) + 1); if (a.a) counts.set(k2(a.p, a.a), (counts.get(k2(a.p, a.a)) || 0) + 1); } return true; },
    async stats(nb) { hit('stats'); await wait(); const pn: any = {}, ans: any = {}; for (const [k, n] of counts) { const [p, a] = k.split('\u0000'); if (!a) pn[p] = n; else (ans[p] = ans[p] || {})[a] = n; }
      return { n: [...bins.values()].reduce((s, x) => s + x, 0), bins: Array.from({ length: nb }, (_, i) => bins.get(i) || 0), pn, ans }; },
    async log(p, n, o, ms, d) { logs.push({ p, n, o, ms, d }); },
    async queue(limit) { return { answers: [...A.values()].filter(a => a.status === 'ai').slice(0, limit), verdicts: [...V.values()].filter(v => v.review_status === 'open').slice(0, limit) }; },
    async setAnswer(p, key, patch) { const r = A.get(k2(p, key)); if (!r) return null; Object.assign(r, patch); return { ...r }; },
    async setVerdict(p, n, patch) { const r = V.get(k2(p, n)); if (r) Object.assign(r, patch); },
    async approved() { return [...A.values()].filter(a => a.status === 'approved'); },
    async metrics() { const m: any = {}; for (const l of logs) { const x = m[l.o] = m[l.o] || { n: 0, ms: [] as number[] }; x.n++; if (l.ms != null) x.ms.push(l.ms); }
      for (const o in m) { const s = m[o].ms.sort((a: number, b: number) => a - b); m[o] = { n: m[o].n, p50: s[Math.floor(s.length * .5)] ?? null, p95: s[Math.floor(s.length * .95)] ?? null }; } return m; },
  };
  return store;
}
