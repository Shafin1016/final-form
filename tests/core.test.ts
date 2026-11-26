// The shared matcher must judge answers exactly as the game did before the AI work (frozen from main),
// and the browser and server copies must be identical.
import { test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dir, '..');
const ctx: any = { window: {} }; vm.createContext(ctx);
for (const f of ['ff-core.js', 'prompts.js', 'prompts2.js', 'prompts3.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
const C = ctx.window.FFCore, PROMPTS = ctx.window.FF_PROMPTS.map((p: any) => ({ ...p, ...C.parseAnswers(p.a) }));

test('5,000+ panel answers match exactly as before', () => {
  const exp = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/panel_expected.json'), 'utf8'));
  const diffs: string[] = [];
  for (const [k, want] of Object.entries(exp)) { const [id, raw] = k.split('\t'), p = PROMPTS.find((x: any) => x.id === id); const m = C.match(p, raw); const got = m.ans ? m.ans.key : m.ambiguous ? 'AMB' : 'NONE'; if (got !== want) diffs.push(`${id} "${raw}": ${want} -> ${got}`); }
  expect(diffs).toEqual([]);
});
test('server copy of the core and bank is up to date', () => {
  expect(fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/ff-core.js'), 'utf8')).toBe(fs.readFileSync(path.join(ROOT, 'ff-core.js'), 'utf8'));
  const bank = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/bank.js'), 'utf8');
  expect(JSON.parse(bank.slice(bank.indexOf('['), bank.lastIndexOf(']') + 1)).length).toBe(PROMPTS.length);
});
test('extra answers: matched only after the bank, unreviewed ones are capped', () => {
  const p = { ...PROMPTS.find((x: any) => x.id === 'consoles') }; p.answers = p.answers.slice();
  C.addExtra(p, [{ key: 'bandaiplaydia', name: 'Bandai Playdia', aliases: ['playdia'], tier: null, status: 'ai' },
                 { key: 'supernintendo', name: 'Super Nintendo', aliases: ['sfc'], tier: null, status: 'ai' },
                 { key: 'pioneerlaseractive', name: 'Pioneer LaserActive', aliases: [], tier: 'S', status: 'approved' }]);
  const a = C.match(p, 'playdia'); expect(a.ans.name).toBe('Bandai Playdia'); expect(a.extra).toBe(true); expect(C.capTier(a.ans, 'S')).toBe('B');
  const b = C.match(p, 'sfc'); expect(b.ans.key).toBe('supernintendo'); expect(b.ans.ai).toBe(true); expect(C.capTier(b.ans, 'S')).toBe('B');
  expect(C.match(p, 'Super Nintendo').ans.ai).toBeUndefined();               // the bank answer itself is untouched
  const c = C.match(p, 'pioneer laseractive'); expect(C.capTier(c.ans, 'S')).toBe('S');  // reviewed: no cap
  expect(C.capTier(a.ans, 'D')).toBe('D');                                   // cap only lowers
  expect(C.match(p, 'Playstaton 2').ans.name).toBe('PlayStation 2');
});
