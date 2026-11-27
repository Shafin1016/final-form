// Shared helpers for the offline tools and tests: load the prompt bank and the matching core exactly as the browser does.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = process.env.FF_ROOT ? path.resolve(process.env.FF_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROMPT_FILES = ['prompts.js', 'prompts2.js', 'prompts3.js'];
// AI-written prompts, each scheduled for one day (tools/nightly.mjs). Loaded after the hand-written files when present.
export const AUTO_FILE = 'prompts-auto.js';

export function loadBrowserScripts(files) {
  const ctx = { window: {}, console };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.window;
}
export function loadBank() {
  const w = loadBrowserScripts(['ff-core.js', ...PROMPT_FILES, ...(fs.existsSync(path.join(ROOT, AUTO_FILE)) ? [AUTO_FILE] : [])]);
  const core = w.FFCore;
  const prompts = w.FF_PROMPTS.map(p => Object.assign({}, p, core.parseAnswers(p.a)));
  return { core, prompts, raw: w.FF_PROMPTS };
}
// which prompts file defines a prompt id
export function fileOf(id) {
  for (const f of PROMPT_FILES) if (fs.readFileSync(path.join(ROOT, f), 'utf8').includes(`id: '${id}'`)) return f;
  return null;
}
export function env(k, d = '') { return process.env[k] ?? d; }

// ---- model + source checks shared by the offline tools ----
// One JSON-returning model call. provider: gemini (Google AI Studio, Gemma is free there) | openrouter | openai (any compatible server).
export function modelConfig(prefix = 'EXPAND') {
  const provider = env(prefix + '_PROVIDER', 'gemini');
  return {
    provider,
    model: env(prefix + '_MODEL', provider === 'gemini' ? 'gemma-4-31b-it' : 'google/gemma-4-31b-it'),
    base: (env(prefix + '_BASE_URL') || { gemini: 'https://generativelanguage.googleapis.com/v1beta', openrouter: 'https://openrouter.ai/api/v1', openai: 'http://localhost:8000/v1' }[provider]).replace(/\/$/, ''),
    key: env(prefix + '_API_KEY', env('AI_API_KEY')),
    gapMs: Number(env(prefix + '_GAP_MS', '2500')),   // pause between calls: stays under the free tier's per-minute limit
  };
}
let lastCall = 0;
export async function askModel(cfg, instr, data, { temperature = 0.2, maxTokens = 8000, fetchFn = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const wait = lastCall + cfg.gapMs - Date.now(); if (wait > 0) await sleep(wait); lastCall = Date.now();
  const input = typeof data === 'string' ? data : JSON.stringify(data);
  let url, init;
  if (cfg.provider === 'gemini') {
    url = `${cfg.base}/models/${encodeURIComponent(cfg.model)}:generateContent`;
    init = { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: instr + '\n\nINPUT:\n' + input }] }], generationConfig: { temperature, maxOutputTokens: maxTokens } }) };
  } else {
    url = `${cfg.base}/chat/completions`;
    init = { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cfg.key ? { Authorization: 'Bearer ' + cfg.key } : {}) }, body: JSON.stringify({ model: cfg.model, temperature, max_tokens: maxTokens, messages: [{ role: 'system', content: instr }, { role: 'user', content: input }] }) };
  }
  for (let attempt = 0; ; attempt++) {
    let r;
    try { r = await fetchFn(url, init); } catch (e) { if (attempt >= 4) throw new Error('model unreachable'); await sleep(3000 * 2 ** attempt); continue; }
    if (r.status === 429 || r.status >= 500) { if (attempt >= 4) throw new Error('model http ' + r.status); await sleep(5000 * 2 ** attempt); continue; }
    if (!r.ok) throw new Error('model http ' + r.status + ': ' + (await r.text()).slice(0, 200).replace(cfg.key || '\u0000', '***'));
    const j = await r.json();
    const text = cfg.provider === 'gemini' ? (j.candidates?.[0]?.content?.parts || []).filter(x => !x.thought).map(x => x.text || '').join('') : String(j.choices?.[0]?.message?.content || '');
    const body = text.replace(/<think>[\s\S]*?<\/think>/g, '');
    const a = Math.min(...['{', '['].map(c => body.indexOf(c)).filter(i => i >= 0)), b = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
    if (!isFinite(a) || b < a) throw new Error('no JSON in reply');
    return JSON.parse(body.slice(a, b + 1));
  }
}
// light source check: a Wikipedia (or the series' Fandom wiki) page whose title matches the name
export const fandomSlug = src => src && !/^any\b/i.test(src) ? src.toLowerCase().replace(/pok[eé]mon/, 'pokemon').replace(/[^a-z0-9]/g, '') : null;
export async function wikiCheck(core, p, name, fetchFn = fetch) {
  const tries = [], slug = fandomSlug(p.src);
  if (slug) tries.push({ site: `${slug}.fandom.com`, url: `https://${slug}.fandom.com/api.php?action=query&list=search&srlimit=3&format=json&srsearch=${encodeURIComponent(name)}` });
  tries.push({ site: 'en.wikipedia.org', url: `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=5&format=json&srsearch=${encodeURIComponent(name + ' ' + (slug ? p.src : p.cat))}` });
  const n = core.norm(name);
  for (const t of tries) {
    try {
      const r = await fetchFn(t.url, { headers: { 'User-Agent': 'FinalForm-nightly/1.0 (github.com/Shafin1016/final-form)' } }); if (!r.ok) continue;
      const hits = ((await r.json()).query?.search || []).map(h => h.title);
      const hit = hits.find(h => { const k = core.norm(h.replace(/\s*\(.*\)$/, '')); return k === n || (k.length >= 4 && n.length >= 4 && (k.includes(n) || n.includes(k))); });
      if (hit) return { site: t.site, title: hit };
    } catch { /* blocked or offline: unverified */ }
  }
  return null;
}
