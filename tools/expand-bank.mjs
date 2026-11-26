#!/usr/bin/env node
// Offline answer-bank expansion with Gemma 4 31B. Never runs during gameplay.
// Asks the model for correct answers the bank is missing (plus nicknames, abbreviations and other-language names),
// drops anything the bank already accepts, checks candidates against Wikipedia / the series' Fandom wiki,
// and writes a proposal file for a person to review. Nothing is changed until you run apply-expansion.mjs.
//
//   EXPAND_API_KEY=... node tools/expand-bank.mjs --ids consoles,game-studios
//   EXPAND_API_KEY=... node tools/expand-bank.mjs --all --per 25
// Options: --provider gemini|openrouter|openai  --model ID  --base URL  --per N (answers asked per prompt)
//          --ids a,b | --all | --open (only open-ended prompts)  --no-verify  --concurrency N  --out FILE
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadBank, fileOf, env } from './lib.mjs';

const args = process.argv.slice(2), opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
const provider = opt('provider') || env('EXPAND_PROVIDER', 'gemini');
const model = opt('model') || env('EXPAND_MODEL', provider === 'gemini' ? 'gemma-4-31b-it' : 'google/gemma-4-31b-it');
const base = (opt('base') || env('EXPAND_BASE_URL') || { gemini: 'https://generativelanguage.googleapis.com/v1beta', openrouter: 'https://openrouter.ai/api/v1', openai: 'http://localhost:8000/v1' }[provider]).replace(/\/$/, '');
const key = env('EXPAND_API_KEY', env('AI_API_KEY'));
const per = Number(opt('per') || 20), verify = !opt('no-verify'), conc = Number(opt('concurrency') || 3);
const { core, prompts } = loadBank();
let todo = opt('all') ? prompts : opt('open') ? prompts.filter(p => p.open) : String(opt('ids') || '').split(',').filter(Boolean).map(id => prompts.find(p => p.id === id) || (() => { throw new Error('unknown prompt ' + id); })());
if (!todo.length) { console.error('choose prompts: --ids a,b  or  --all  or  --open'); process.exit(2); }
if (!key && provider !== 'openai') { console.error('set EXPAND_API_KEY'); process.exit(2); }

const INSTR = `You are expanding the answer list for a trivia game about anime and video games.
For the prompt below, list correct answers that are MISSING from "already_accepted". Only include answers you are confident are correct; do not invent anything.
Prefer answers real players might type, including obscure-but-correct ones. For every answer give its official English name, plus "aliases": common nicknames, abbreviations, alternate spellings, and original-language / romanized names (for example Japanese romaji).
Also, for answers already accepted, list useful aliases that are missing ("more_aliases").
Reply with JSON only: {"new":[{"name":"...","aliases":["..."],"c":0.0-1.0}],"more_aliases":[{"answer":"exact accepted name","aliases":["..."]}]}`;

async function ask(p) {
  const data = JSON.stringify({ prompt: p.q, topic: `${p.cat} · ${p.src}`, already_accepted: p.answers.map(a => a.name), how_many_new: per });
  let url, init;
  if (provider === 'gemini') {
    url = `${base}/models/${encodeURIComponent(model)}:generateContent`;
    init = { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: INSTR + '\n\nINPUT:\n' + data }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 8000 } }) };
  } else {
    url = `${base}/chat/completions`;
    init = { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) }, body: JSON.stringify({ model, temperature: 0.2, max_tokens: 8000, messages: [{ role: 'system', content: INSTR }, { role: 'user', content: data }] }) };
  }
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, init);
    if (r.status === 429 || r.status >= 500) { if (attempt >= 4) throw new Error('model http ' + r.status); await new Promise(res => setTimeout(res, 2000 * 2 ** attempt)); continue; }
    if (!r.ok) throw new Error('model http ' + r.status + ': ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    const text = provider === 'gemini' ? (j.candidates?.[0]?.content?.parts || []).filter(x => !x.thought).map(x => x.text || '').join('') : String(j.choices?.[0]?.message?.content || '');
    const body = text.replace(/<think>[\s\S]*?<\/think>/g, ''), a = body.indexOf('{'), b = body.lastIndexOf('}');
    if (a < 0) throw new Error('no JSON in reply');
    return JSON.parse(body.slice(a, b + 1));
  }
}

// light source check: a Wikipedia or Fandom page whose title matches the candidate
const fandomSlug = src => src && !/^any\b/i.test(src) ? src.toLowerCase().replace(/pok[eé]mon/, 'pokemon').replace(/[^a-z0-9]/g, '') : null;
async function check(p, name) {
  if (!verify) return null;
  const tries = [];
  const slug = fandomSlug(p.src); if (slug) tries.push({ site: `${slug}.fandom.com`, url: `https://${slug}.fandom.com/api.php?action=query&list=search&srlimit=3&format=json&srsearch=${encodeURIComponent(name)}` });
  tries.push({ site: 'en.wikipedia.org', url: `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=5&format=json&srsearch=${encodeURIComponent(name + ' ' + (slug ? p.src : p.cat))}` });
  const n = core.norm(name);
  for (const t of tries) {
    try {
      const r = await fetch(t.url, { headers: { 'User-Agent': 'FinalForm-bank-expansion/1.0' } }); if (!r.ok) continue;
      const hits = ((await r.json()).query?.search || []).map(h => h.title);
      const hit = hits.find(h => { const k = core.norm(h.replace(/\s*\(.*\)$/, '')); return k === n || (k.length >= 4 && (k.includes(n) || n.includes(k))); });
      if (hit) return { site: t.site, title: hit, url: `https://${t.site}/wiki/${encodeURIComponent(hit.replace(/ /g, '_'))}` };
    } catch { /* offline or blocked: leave unverified */ }
  }
  return null;
}

function dedupe(p, reply) {
  const out = { id: p.id, file: fileOf(p.id), q: p.q, new: [], aliases: [], skipped: [] }, seen = new Set();
  const addAlias = (ans, al) => { const k = core.norm(al); if (!k || k.length < 2) return;
    const owner = p.keys.get(k); if (owner) { if (owner !== ans) out.skipped.push({ alias: al, reason: `already means ${owner.name}` }); return; }
    let e = out.aliases.find(x => x.key === ans.key); if (!e) out.aliases.push(e = { answer: ans.name, key: ans.key, add: [], accept: null });
    if (!e.add.some(x => core.norm(x) === k)) e.add.push(al); };
  for (const c of reply.new || []) {
    const name = String(c.name || '').trim().slice(0, 80); if (!name) continue;
    const names = [name, ...(c.aliases || []).map(String)];
    const hit = names.map(x => core.match(p, x)).find(m => m.ans);
    if (hit) { for (const al of names) addAlias(hit.ans, al); out.skipped.push({ name, reason: `already accepted as ${hit.ans.name}` }); continue; }
    const k = core.norm(name); if (seen.has(k)) continue; seen.add(k);
    const aliases = [...new Set(names.slice(1).map(a => a.trim()).filter(a => { const ak = core.norm(a); return ak && ak !== k && ak.length >= 2 && !p.keys.has(ak); }))];
    const warn = [...p.keys.keys()].filter(x => x.length >= 4 && (k.includes(x) || x.startsWith(k))).slice(0, 3);
    out.new.push({ name, aliases, c: Math.max(0, Math.min(1, Number(c.c) || 0)), suggested_tier: 'A', verified: null, overlap_warning: warn.length ? warn : undefined, accept: null });
  }
  for (const m of reply.more_aliases || []) { const ans = p.answers.find(a => a.name === m.answer) || core.match(p, String(m.answer || '')).ans; if (ans) for (const al of m.aliases || []) addAlias(ans, String(al)); }
  return out;
}

const results = [], queue = [...todo];
await Promise.all(Array.from({ length: Math.min(conc, queue.length) }, async () => {
  for (let p; (p = queue.shift());) {
    try {
      const d = dedupe(p, await ask(p));
      for (const c of d.new) c.verified = await check(p, c.name);
      results.push(d); console.log(`${p.id}: ${d.new.length} new (${d.new.filter(c => c.verified).length} verified), ${d.aliases.reduce((s, a) => s + a.add.length, 0)} aliases, ${d.skipped.length} skipped`);
    } catch (e) { console.error(`${p.id}: ${e.message}`); results.push({ id: p.id, error: e.message, new: [], aliases: [], skipped: [] }); }
  }
}));
results.sort((a, b) => todo.indexOf(prompts.find(p => p.id === a.id)) - todo.indexOf(prompts.find(p => p.id === b.id)));
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = opt('out') || path.join(ROOT, 'expansions', `expansion-${stamp}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ created: new Date().toISOString(), model, provider, note: 'Set "accept": true on entries to add (or run apply-expansion.mjs --accept-verified). Edit names/aliases/tiers freely.', prompts: results }, null, 2));
const md = [`# Answer-bank expansion — ${new Date().toISOString().slice(0, 10)} (${model})`, ''];
for (const r of results) { md.push(`## ${r.id} — ${r.q || ''}`, r.error ? `Error: ${r.error}` : '');
  for (const c of r.new) md.push(`- [ ] **${c.name}**${c.aliases.length ? ' (' + c.aliases.join(', ') + ')' : ''} · c=${c.c} · ${c.verified ? `[${c.verified.site}](${c.verified.url})` : 'unverified'}${c.overlap_warning ? ' · ⚠ overlaps ' + c.overlap_warning.join(', ') : ''}`);
  for (const a of r.aliases) md.push(`- [ ] alias for ${a.answer}: ${a.add.join(', ')}`); md.push(''); }
fs.writeFileSync(out.replace(/\.json$/, '.md'), md.join('\n'));
console.log(`\nproposal: ${path.relative(process.cwd(), out)}  (+ .md summary). Review it, then: node tools/apply-expansion.mjs ${path.relative(process.cwd(), out)}`);
