#!/usr/bin/env node
// Measures the deployed backend: model vs cache latency, cache hit rate, duplicate merging, failures.
//   FF_API=https://REF.supabase.co/functions/v1/ff node tools/bench-live.mjs
//   FF_API=... node tools/bench-live.mjs --prompt consoles --answers "Bandai Playdia;Pioneer LaserActive;Toaster oven"
// Run it twice: the first pass calls the model for answers nobody has sent before, the second shows the cache.
// Unavailable responses (timeouts, rate limits, errors) are listed with their reason and excluded from hit rate and latency.
// Note: answers it validates go into the review queue like any player's would.
import { pathOf, summarize } from './bench-stats.mjs';

const api = (process.env.FF_API || '').replace(/\/$/, '');
if (!api) { console.error('set FF_API'); process.exit(2); }
const args = process.argv.slice(2), opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const prompt = opt('prompt') || 'consoles';
const answers = (opt('answers') || 'Bandai Playdia;Pioneer LaserActive;Tapwave Zodiac;VTech Socrates;Koei PasoGo;Epoch Cassette Vision;a toaster;my fridge').split(';');
const player = 'bench-' + Date.now();
async function v(raw) {
  const t = performance.now();
  try {
    const r = await fetch(api + '/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p: prompt, raw, player }) });
    const j = await r.json().catch(() => ({ status: 'error', reason: 'non-JSON response' }));
    return { raw, ms: Math.round(performance.now() - t), ...(r.ok ? {} : { http: r.status }), ...j };
  } catch (e) { return { raw, ms: Math.round(performance.now() - t), status: 'error', reason: 'network: ' + e.message }; }
}
const line = r => `  ${String(r.ms).padStart(5)} ms  ${String(r.status).padEnd(11)} ${pathOf(r).padEnd(11)} ${r.raw}${pathOf(r) === 'unavailable' ? '  <- ' + (r.reason || r.error || 'http ' + r.http) : ''}`;
const show = s => {
  console.log(`  answered ${s.answered}/${s.total}` + (s.unavailable ? `, unavailable ${s.unavailable} (${Object.entries(s.reasons).map(([k, n]) => k + ' ×' + n).join(', ')}) — excluded below` : ''));
  if (s.model.n) console.log(`  model  n=${s.model.n}  p50 ${s.model.p50} ms  p95 ${s.model.p95} ms  (target < 2000)`);
  if (s.cache.n) console.log(`  cache  n=${s.cache.n}  p50 ${s.cache.p50} ms  p95 ${s.cache.p95} ms  (target < 1000)`);
  if (s.hitRate != null) console.log(`  answered without the model: ${Math.round(s.hitRate * 100)}%`);
};

console.log('health', await (await fetch(api + '/health')).json());
console.log('\npass 1:'); const p1 = []; for (const a of answers) { const r = await v(a); p1.push(r); console.log(line(r)); } show(summarize(p1));
console.log('\npass 2 (same answers):'); const p2 = []; for (const a of answers) { const r = await v(a); p2.push(r); console.log(line(r)); } show(summarize(p2));
console.log('\n10 identical never-seen guesses at once:');
const fresh = 'Console ' + Date.now().toString(36), dup = await Promise.all(Array.from({ length: 10 }, () => v(fresh)));
const sd = summarize(dup);
console.log(`  model calls ${dup.filter(r => pathOf(r) === 'model').length}, merged ${dup.filter(r => r.deduped).length}, unavailable ${sd.unavailable}`);
console.log('\nboth passes:'); show(summarize([...p1, ...p2]));
