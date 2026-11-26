// Shared helpers for the offline tools and tests: load the prompt bank and the matching core exactly as the browser does.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = process.env.FF_ROOT ? path.resolve(process.env.FF_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROMPT_FILES = ['prompts.js', 'prompts2.js', 'prompts3.js'];

export function loadBrowserScripts(files) {
  const ctx = { window: {}, console };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.window;
}
export function loadBank() {
  const w = loadBrowserScripts(['ff-core.js', ...PROMPT_FILES]);
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
