// Offline tools: expansion proposal (fake Gemma 4 31B), dedupe against the bank, apply to a scratch copy of the repo.
import { test, expect } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

const ROOT = path.resolve(import.meta.dir, '..');
const reply = { new: [
  { name: 'Bandai Playdia', aliases: ['Playdia', 'プレイディア'], c: 0.9 },
  { name: 'PlayStation 2', aliases: ['PS2', 'ps two'], c: 1 },                 // already in bank -> alias proposals only
  { name: 'Pioneer LaserActive', aliases: ['LaserActive'], c: 0.85 },
  { name: 'Bandai Playdia', aliases: [], c: 0.9 },                             // duplicate
], more_aliases: [{ answer: 'Super Nintendo', aliases: ['Super Famicom Jr', 'Nintendo Super System'] }] };

test('expand -> review -> apply', { timeout: 30000 }, async () => {
  const seen: any[] = [];
  const srv = Bun.serve({ port: 0, async fetch(req) { const b = await req.json(); seen.push(b); return Response.json({ choices: [{ message: { content: '<think>x</think>' + JSON.stringify(reply) } }] }); } });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ffexp-'));
  for (const f of ['ff-core.js', 'prompts.js', 'prompts2.js', 'prompts3.js']) fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
  fs.mkdirSync(path.join(tmp, 'tests/fixtures'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'tests/fixtures/panel_answers.txt'), path.join(tmp, 'tests/fixtures/panel_answers.txt'));
  const out = path.join(tmp, 'prop.json'), envv = { ...process.env, FF_ROOT: tmp, EXPAND_API_KEY: 'k' };
  try {
    await run('node', [path.join(ROOT, 'tools/expand-bank.mjs'), '--ids', 'consoles', '--provider', 'openai', '--base', `http://localhost:${srv.port}/v1`, '--model', 'google/gemma-4-31b-it', '--no-verify', '--out', out], { env: envv });
    expect(seen[0].model).toBe('google/gemma-4-31b-it');
    expect(JSON.parse(seen[0].messages[1].content).already_accepted).toContain('PlayStation 2');
    const prop = JSON.parse(fs.readFileSync(out, 'utf8')), c = prop.prompts[0];
    const names = c.new.map((x: any) => x.name);
    // Bandai Playdia / LaserActive might already be in the bank by the time this runs: only check dedupe rules
    expect(names.filter((n: string) => n === 'Bandai Playdia').length).toBeLessThanOrEqual(1);
    expect(names).not.toContain('PlayStation 2');
    expect(c.skipped.some((s: any) => s.name === 'PlayStation 2')).toBe(true);
    expect(fs.existsSync(out.replace('.json', '.md'))).toBe(true);
    // reviewer accepts everything
    for (const x of c.new) x.accept = true; for (const a of c.aliases) a.accept = true;
    c.new.forEach((x: any) => { if (x.name === 'Pioneer LaserActive') x.tier = 'S'; });
    fs.writeFileSync(out, JSON.stringify(prop));
    const log = execFileSync('node', [path.join(ROOT, 'tools/apply-expansion.mjs'), out], { env: envv }).toString();
    expect(log).toContain('written');
    const txt = fs.readFileSync(path.join(tmp, 'prompts3.js'), 'utf8');
    if (names.includes('Pioneer LaserActive')) expect(txt).toContain('S Pioneer LaserActive | LaserActive');
    // the edited bank loads and accepts the new answers + aliases
    const chk = execFileSync('node', ['--input-type=module', '-e', `import { loadBank } from ${JSON.stringify(path.join(ROOT, 'tools/lib.mjs'))}; const { core, prompts } = loadBank(); const p = prompts.find(x => x.id === 'consoles'); console.log(JSON.stringify(['Playdia', 'LaserActive', 'Nintendo Super System', 'ps two'].map(s => (core.match(p, s).ans || {}).name || null)));`], { env: envv }).toString();
    expect(JSON.parse(chk)).toEqual(['Bandai Playdia', 'Pioneer LaserActive', 'Super Nintendo', 'PlayStation 2']);
    expect(fs.existsSync(path.join(tmp, 'supabase/functions/_shared/bank.js'))).toBe(true);
    // applying the same proposal again changes nothing
    const again = execFileSync('node', [path.join(ROOT, 'tools/apply-expansion.mjs'), out], { env: envv }).toString();
    expect(again).toContain('0 new answers, 0 new aliases');
  } finally { srv.stop(true); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('apply refuses edits that would change what existing answers mean', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ffexp-'));
  for (const f of ['ff-core.js', 'prompts.js', 'prompts2.js', 'prompts3.js']) fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
  fs.mkdirSync(path.join(tmp, 'tests/fixtures'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'tests/fixtures/panel_answers.txt'), path.join(tmp, 'tests/fixtures/panel_answers.txt'));
  // a new answer whose exact name equals a panel guess that currently fuzzy-matches another answer
  const prop = { prompts: [{ id: 'consoles', new: [{ name: 'Playstaton', accept: true, tier: 'S' }], aliases: [] }] };
  const f = path.join(tmp, 'p.json'); fs.writeFileSync(f, JSON.stringify(prop));
  const out = execFileSync('node', [path.join(ROOT, 'tools/apply-expansion.mjs'), f], { env: { ...process.env, FF_ROOT: tmp } }).toString();
  expect(out).toContain('0 new answers');   // "Playstaton" already matches PlayStation, so it is not added as a new answer
  fs.rmSync(tmp, { recursive: true, force: true });
});
