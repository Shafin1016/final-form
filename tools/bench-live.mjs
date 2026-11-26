#!/usr/bin/env node
// Measures the deployed backend: cold (model) vs warm (cache) latency, cache hit rate, and an AI-outage check.
//   FF_API=https://REF.supabase.co/functions/v1/ff node tools/bench-live.mjs
//   FF_API=... node tools/bench-live.mjs --prompt consoles --answers "Bandai Playdia;Pioneer LaserActive;Toaster oven"
// Note: real answers it validates go into the review queue like any player's would (reject them there if you like).
const api = (process.env.FF_API || '').replace(/\/$/, '');
if (!api) { console.error('set FF_API'); process.exit(2); }
const args = process.argv.slice(2), opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const prompt = opt('prompt') || 'consoles';
const answers = (opt('answers') || 'Bandai Playdia;Pioneer LaserActive;Tapwave Zodiac;VTech Socrates;Koei PasoGo;Epoch Cassette Vision;a toaster;my fridge').split(';');
const player = 'bench-' + Date.now();
async function v(raw) { const t = performance.now(); const r = await fetch(api + '/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p: prompt, raw, player }) }); const j = await r.json(); return { raw, ms: Math.round(performance.now() - t), ...j }; }
const q = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : 0; };
const h = await (await fetch(api + '/health')).json(); console.log('health', h);
console.log('\nfirst pass (calls the model only if no one has sent these before — run twice to see both paths):');
const cold = []; for (const a of answers) { const r = await v(a); cold.push(r); console.log(`  ${String(r.ms).padStart(5)} ms  ${r.status.padEnd(11)} ${String(r.source || r.reason || '').padEnd(7)} ${a}`); }
console.log('\nwarm (same answers again — shared cache):');
const warm = []; for (const a of answers) { const r = await v(a); warm.push(r); console.log(`  ${String(r.ms).padStart(5)} ms  ${r.status.padEnd(11)} ${String(r.source || r.reason || '').padEnd(7)} ${a}`); }
console.log('\nconcurrent duplicates (10 at once, a never-seen guess):');
const fresh = 'Console ' + Date.now().toString(36); const dup = await Promise.all(Array.from({ length: 10 }, () => v(fresh)));
console.log(`  model calls ~${dup.filter(r => r.source === 'ai' && !r.deduped).length}, deduped ${dup.filter(r => r.deduped).length}, p50 ${q(dup.map(r => r.ms), .5)} ms`);
const coldModel = cold.filter(r => r.source === 'ai').map(r => r.ms), warmMs = warm.map(r => r.ms);
console.log(`\nmodel path p50 ${q(coldModel, .5)} ms / p95 ${q(coldModel, .95)} ms (target < 2000)`);
console.log(`cached path p50 ${q(warmMs, .5)} ms / p95 ${q(warmMs, .95)} ms (target < 1000)`);
console.log(`warm hit rate ${Math.round(warm.filter(r => r.source !== 'ai').length / warm.length * 100)}%`);
