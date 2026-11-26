// Latency + cache-hit benchmark of the real handler with simulated network delays.
//   bun tests/bench.ts                       defaults: 30 ms per DB call, model 700 ms ± 300
//   DB_MS=60 AI_MS=1200 PLAYERS=400 bun tests/bench.ts
// Simulates players the way the browser behaves: bank answers never reach the server; validated answers are preloaded
// at game start; only unknown guesses are sent. Unknown guesses follow a long-tail distribution, so many players
// type the same few rare answers (that's when the shared cache pays off).
import { makeApp } from '../supabase/functions/ff/handler.ts';
import { memoryStore } from './memory-store.ts';
import { BANK } from '../supabase/functions/_shared/bank.js';
import '../supabase/functions/_shared/ff-core.js';
const C = (globalThis as any).FFCore;

const DB_MS = Number(process.env.DB_MS || 30), AI_MS = Number(process.env.AI_MS || 700), PLAYERS = Number(process.env.PLAYERS || 300), WAVE = 25;
const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
let modelCalls = 0;
const fakeModel = (async (url: string, init: any) => {
  modelCalls++; const body = JSON.parse(init.body), text = body.contents[0].parts[0].text, a = JSON.parse(text.slice(text.indexOf('INPUT:\n') + 7)).answer;
  await new Promise(r => setTimeout(r, Math.max(150, AI_MS + (Math.random() - 0.5) * 600)));
  const h = hash(a) % 10, out = h < 4 ? { v: 'yes', name: a, c: 0.9 } : h < 9 ? { v: 'no', name: '', c: 0.9 } : { v: 'unsure', name: '', c: 0.3 };
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }));
}) as unknown as typeof fetch;
const store = memoryStore({ latencyMs: DB_MS });
const app = makeApp(store, { provider: 'gemini', model: 'gemma-4-26b-a4b-it', baseUrl: '', apiKey: 'x', timeoutMs: 2500, maxTokens: 60, extraBody: null },
  { allowedOrigins: ['*'], rlPlayerPerMin: 1000, rlIpPerMin: 1000, rlGlobalPerMin: 100000 }, { fetchFn: fakeModel });
const call = async (path: string, body?: any) => (await app(new Request('http://f/ff' + path, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, headers: { 'x-forwarded-for': '9.9.9.' + Math.floor(Math.random() * 255) } }))).json() as Promise<any>;

const prompts = (BANK as any[]).filter(b => b.lvl >= 5).map(b => ({ ...b, ...C.parseAnswers(b.a) }));
const unknownPool = (p: any) => Array.from({ length: 40 }, (_, i) => `${p.src} rare ${i}`.replace(/any /i, 'x'));   // 40 candidate unknowns per prompt
const zipf = (n: number) => { const r = Math.random(); return Math.min(n - 1, Math.floor(Math.pow(n + 1, r) - 1)); };
const lat: Record<string, number[]> = {}; let sent = 0, localExtra = 0;
async function player(i: number) {
  const set = Array.from({ length: 7 }, () => prompts[Math.floor(Math.random() * prompts.length)]);
  const pre = await call('/answers?p=' + set.map(p => p.id).join(','));
  const local = set.map(p => { const v = { ...p, answers: p.answers.slice() }; C.addExtra(v, pre.answers[p.id] || []); return v; });
  for (const p of local) for (let g = 0; g < 2; g++) {          // ~2 guesses per round are off-list for hard prompts
    const guess = unknownPool(p)[zipf(40)];
    if (C.match(p, guess).ans) { localExtra++; continue; }     // already validated by someone: instant, no request
    const t0 = performance.now(); const r = await call('/validate', { p: p.id, raw: guess, player: 'p' + i }); const ms = performance.now() - t0; sent++;
    const k = r.deduped ? 'dedupe' : r.source === 'ai' ? 'model' : 'cache'; (lat[k] = lat[k] || []).push(ms);
    if (r.status === 'valid') C.addExtra(p, [{ key: r.answer.key, name: r.answer.name, aliases: [C.norm(guess)], status: 'ai' }]);
  }
}
const t0 = performance.now();
for (let i = 0; i < PLAYERS; i += WAVE) await Promise.all(Array.from({ length: Math.min(WAVE, PLAYERS - i) }, (_, j) => player(i + j)));
const q = (xs: number[], f: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * f))]) : 0; };
console.log(`${PLAYERS} players · DB ${DB_MS} ms/call · model ~${AI_MS} ms · ${((performance.now() - t0) / 1000).toFixed(1)} s total`);
console.log(`off-list guesses: ${sent + localExtra}  · resolved in the browser from preloaded answers: ${localExtra}  · sent to server: ${sent}  · model calls: ${modelCalls}`);
for (const [k, xs] of Object.entries(lat)) console.log(`  ${k.padEnd(7)} n=${String(xs.length).padStart(5)}  p50 ${q(xs, .5)} ms  p95 ${q(xs, .95)} ms  max ${q(xs, 1)} ms`);
const noModel = sent + localExtra - modelCalls;
console.log(`answered without the model: ${(noModel / (sent + localExtra) * 100).toFixed(1)}% of off-list guesses (${((sent - modelCalls) / sent * 100).toFixed(1)}% of server checks)`);
