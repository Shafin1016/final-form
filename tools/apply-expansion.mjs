#!/usr/bin/env node
// Applies the reviewed entries of a proposal file to prompts*.js, then checks nothing broke.
//   node tools/apply-expansion.mjs expansions/expansion-....json              (entries with "accept": true)
//   node tools/apply-expansion.mjs FILE --accept-verified                      (also entries with a source match)
//   node tools/apply-expansion.mjs FILE --dry-run                              (show what would change)
// Afterwards: review `git diff`, then commit. The server copy is refreshed automatically.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, loadBank, PROMPT_FILES } from './lib.mjs';
const TOOLS = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--'));
const dry = args.includes('--dry-run'), autoVerified = args.includes('--accept-verified');
if (!file) { console.error('usage: node tools/apply-expansion.mjs PROPOSAL.json [--accept-verified] [--dry-run]'); process.exit(2); }
const prop = JSON.parse(fs.readFileSync(file, 'utf8'));
const clean = s => String(s || '').replace(/[|`\n\r\\]/g, ' ').replace(/\$\{/g, '$ {').replace(/\s+/g, ' ').trim().slice(0, 80);
const TIERS = 'SABCDE';
const before = loadBank();
const panel = fs.existsSync(path.join(ROOT, 'tests/fixtures/panel_answers.txt')) ? fs.readFileSync(path.join(ROOT, 'tests/fixtures/panel_answers.txt'), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => { const i = l.indexOf(':'); return { id: l.slice(0, i).trim(), xs: l.slice(i + 1).split(';').map(s => s.trim()).filter(Boolean) }; }) : [];
const snapshot = bank => panel.flatMap(({ id, xs }) => { const p = bank.prompts.find(q => q.id === id); return p ? xs.map(x => { const m = bank.core.match(p, x); return [id + ': ' + x, m.ans ? m.ans.name : m.ambiguous ? '(ambiguous)' : null]; }) : []; });
const snap0 = new Map(snapshot(before));

const texts = Object.fromEntries(PROMPT_FILES.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
let added = 0, aliased = 0; const planned = [];
for (const pr of prop.prompts || []) {
  const p = before.prompts.find(q => q.id === pr.id); if (!p) { console.warn('skip unknown prompt', pr.id); continue; }
  const f = PROMPT_FILES.find(x => texts[x].includes(`id: '${pr.id}'`)); if (!f) continue;
  let t = texts[f]; const at = t.indexOf(`id: '${pr.id}'`), aStart = t.indexOf('a: `', at) + 4, aEnd = t.indexOf('`', aStart);
  let block = t.slice(aStart, aEnd);
  // new spellings for answers already in the bank
  for (const a of pr.aliases || []) {
    if (a.accept !== true) continue;
    const add = (a.add || []).map(clean).filter(x => { const k = before.core.norm(x); return k && !p.keys.has(k); }); if (!add.length) continue;
    const lines = block.split('\n'), i = lines.findIndex(l => { const s = l.trim(); return TIERS.includes(s[0]) && s.slice(1).split('|')[0].trim() === a.answer; });
    if (i < 0) { console.warn(`${pr.id}: answer line not found for "${a.answer}"`); continue; }
    lines[i] = lines[i].replace(/\s+$/, '') + ' | ' + add.join(' | '); block = lines.join('\n'); aliased += add.length; planned.push(`${pr.id}: ${a.answer} += ${add.join(', ')}`);
  }
  // brand-new answers
  const newLines = [];
  for (const c of pr.new || []) {
    if (!(c.accept === true || (autoVerified && c.verified && c.accept !== false))) continue;
    const name = clean(c.name), tier = TIERS.includes(c.tier) ? c.tier : TIERS.includes(c.suggested_tier) ? c.suggested_tier : 'A';
    if (!name || before.core.match(p, name).ans) continue;
    const als = [...new Set((c.aliases || []).map(clean).filter(x => x && before.core.norm(x) !== before.core.norm(name) && !p.keys.has(before.core.norm(x))))];
    newLines.push(`${tier} ${name}${als.length ? ' | ' + als.join(' | ') : ''}`); added++; planned.push(`${pr.id}: + ${newLines[newLines.length - 1]}`);
  }
  if (newLines.length) block = block.replace(/\s*$/, '') + '\n' + newLines.join('\n');
  texts[f] = t.slice(0, aStart) + block + t.slice(aEnd);
}
console.log(planned.join('\n') || '(nothing accepted)');
console.log(`\n${added} new answers, ${aliased} new aliases`);
if (dry || !planned.length) process.exit(0);

// write to a scratch copy first and prove it still loads and behaves
const tmp = fs.mkdtempSync(path.join(ROOT, '.apply-'));
try {
  fs.copyFileSync(path.join(ROOT, 'ff-core.js'), path.join(tmp, 'ff-core.js'));
  for (const f of PROMPT_FILES) fs.writeFileSync(path.join(tmp, f), texts[f]);
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', `import { loadBank } from ${JSON.stringify(path.join(TOOLS, 'lib.mjs'))}; const b = loadBank(); console.log(JSON.stringify({ n: b.prompts.length }));`], { env: { ...process.env, FF_ROOT: tmp } }).toString();
  if (JSON.parse(out).n !== before.prompts.length) throw new Error('prompt count changed');
  var ORIG_ROOT = process.env.FF_ROOT; process.env.FF_ROOT = tmp;
} catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); console.error('edited files do not load — nothing written:', e.message); process.exit(1); }
const after = await import(path.join(TOOLS, 'lib.mjs') + '?after').then(m => m.loadBank());
fs.rmSync(tmp, { recursive: true, force: true });
if (ORIG_ROOT === undefined) delete process.env.FF_ROOT; else process.env.FF_ROOT = ORIG_ROOT;
const changed = snapshot(after).filter(([k, v]) => snap0.get(k) && snap0.get(k) !== v);
if (changed.length) { console.error('\nthese previously-accepted panel answers would now mean something else — nothing written:'); for (const [k, v] of changed) console.error(`  ${k}: ${snap0.get(k)} -> ${v}`); process.exit(1); }
const gained = snapshot(after).filter(([k, v]) => !snap0.get(k) && v).length;
for (const f of PROMPT_FILES) fs.writeFileSync(path.join(ROOT, f), texts[f]);
execFileSync(process.execPath, [path.join(TOOLS, 'build-server-data.mjs')], { stdio: 'inherit' });
console.log(`written. ${gained} previously-rejected panel answers are now accepted. Review with: git diff ${PROMPT_FILES.join(' ')}`);
