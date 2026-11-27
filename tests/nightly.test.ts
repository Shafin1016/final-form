// Nightly autopilot with a fake model and a fake wiki: review decisions, prompt gates, schedule file round trip.
import { test, expect } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-ignore
import { review, vetCandidate, makePrompts, tooSimilar, readAuto, writeAuto, dayIndex, SET } from '../tools/nightly.mjs';
// @ts-ignore
import { loadBank } from '../tools/lib.mjs';

const { core, prompts } = loadBank();
const cfg = { provider: 'gemini', model: 'fake', base: '', key: 'k', gapMs: 0 };
const quiet = () => {};

test('day numbering matches the game (17 Nov 2026 = day 0, New York date)', () => {
  expect(dayIndex(new Date('2026-11-17T12:00:00Z'))).toBe(0);
  expect(dayIndex(new Date('2026-11-27T03:00:00Z'))).toBe(9);   // still 26 Nov in New York
  expect(dayIndex(new Date('2026-11-27T06:00:00Z'))).toBe(10);
});

test('review: approves only confident + wiki-confirmed, rejects confident no, leaves the rest', async () => {
  const calls: any[] = [];
  const queue = {
    answers: [
      { prompt_id: 'op-strawhats', key: 'kaya', name: 'Kaya', status: 'ai' },              // model yes 0.95, wiki has it -> approve
      { prompt_id: 'op-strawhats', key: 'buggy', name: 'Buggy', status: 'ai' },            // model no 0.95 -> reject
      { prompt_id: 'op-strawhats', key: 'vivi', name: 'Vivi', status: 'ai' },              // yes but low confidence -> left
      { prompt_id: 'op-strawhats', key: 'madeup', name: 'Madeup', status: 'ai' },          // yes 0.95 but no wiki page -> left
      { prompt_id: 'no-such-prompt', key: 'x', name: 'X', status: 'ai' },                  // unknown prompt -> skipped
    ],
    verdicts: [{ prompt_id: 'op-strawhats', norm: 'carrot', raw: 'Carrot', verdict: 'claim', review_status: 'open' }],   // yes -> approve with name
  };
  const api = async (m: string, p: string, b?: any) => { calls.push([m, p, b]); return m === 'GET' ? queue : { ok: true }; };
  const say: any = { Kaya: { v: 'yes', c: .95, name: 'Kaya' }, Buggy: { v: 'no', c: .95 }, Vivi: { v: 'yes', c: .7 }, Madeup: { v: 'yes', c: .95, name: 'Madeup' }, Carrot: { v: 'yes', c: .92, name: 'Carrot' } };
  const ask = async (_c: any, _i: string, d: any) => say[d.answer];
  const wiki = async (_c: any, _p: any, name: string) => name === 'Madeup' ? null : { site: 'onepiece.fandom.com', title: name };
  const r = await review({ api, core, prompts, cfg, ask, wiki, log: quiet });
  expect(r.approved.map((x: any) => x.text).sort()).toEqual(['Carrot', 'Kaya']);
  expect(r.rejected.map((x: any) => x.text)).toEqual(['Buggy']);
  expect(r.left.map((x: any) => x.text).sort()).toEqual(['Madeup', 'Vivi']);
  const decides = calls.filter(c => c[1] === '/admin/decide').map(c => c[2]);
  expect(decides).toContainEqual({ type: 'answer', p: 'op-strawhats', key: 'kaya', action: 'approve' });
  expect(decides).toContainEqual({ type: 'answer', p: 'op-strawhats', key: 'buggy', action: 'reject' });
  expect(decides).toContainEqual({ type: 'verdict', p: 'op-strawhats', norm: 'carrot', action: 'approve', name: 'Carrot' });
  expect(decides.length).toBe(3);
  // AUTO_APPROVE=off: same report, no database writes
  calls.length = 0; await review({ api, core, prompts, cfg, ask, wiki, apply: false, log: quiet });
  expect(calls.filter(c => c[1] === '/admin/decide').length).toBe(0);
});

const fakeAnswers = (n: number, prefix = 'Hero') => Array.from({ length: n }, (_, i) => ({ name: `${prefix} ${i + 1}`, aliases: [`h${i + 1}`], tier: 'EDCBAS'[i % 6] }));
const okCritic = async () => ({ ok: true, clear: .95, family_friendly: true, stable: true });

test('prompt gates: repeats, too few answers, unconfirmed answers, critic', async () => {
  const existing = prompts.map((p: any) => p.q), wikiAll = async () => ({ site: 'w', title: 't' });
  expect(tooSimilar('Name a member of the Straw Hat Pirates', existing)).toBe(true);
  expect(tooSimilar('Name a Legend of Zelda dungeon item', existing)).toBe(false);
  const base = { q: 'Name a Legend of Zelda dungeon item', cat: 'Video games', src: 'The Legend of Zelda', open: false };
  expect((await vetCandidate({ ...base, q: 'Name a member of the Straw Hat Pirates', answers: fakeAnswers(40) }, { core, existing, cfg, ask: okCritic, wiki: wikiAll, log: quiet })).reason).toMatch(/existing/);
  expect((await vetCandidate({ ...base, answers: fakeAnswers(12) }, { core, existing, cfg, ask: okCritic, wiki: wikiAll, log: quiet })).reason).toMatch(/only 12/);
  const half = async (_c: any, _p: any, n: string) => Number(n.split(' ')[1]) % 2 ? { site: 'w', title: n } : null;
  expect((await vetCandidate({ ...base, answers: fakeAnswers(60) }, { core, existing, cfg, ask: okCritic, wiki: half, log: quiet })).reason).toMatch(/confirmed/);
  const no = async () => ({ ok: false, clear: .4, reason: 'two readings' });
  expect((await vetCandidate({ ...base, answers: fakeAnswers(40) }, { core, existing, cfg, ask: no, wiki: wikiAll, log: quiet })).reason).toMatch(/critic/);
  const good = await vetCandidate({ ...base, answers: [...fakeAnswers(40), { name: 'Bad | `name`', tier: 'S', aliases: [] }] }, { core, existing, cfg, ask: okCritic, wiki: wikiAll, log: quiet });
  expect(good.prompt.q).toBe('Name a Legend of Zelda dungeon item');
  expect(good.prompt.a).not.toMatch(/`/);
  const parsed = core.parseAnswers(good.prompt.a);
  expect(parsed.answers.length).toBe(41);
  expect(parsed.keys.get('h7').name).toBe('Hero 7');                 // aliases work
});

test('makePrompts fills the next days, skips days already stocked, and the file round-trips into the game bank', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ffn-'));
  fs.copyFileSync(path.resolve(import.meta.dir, '../prompts-auto.js'), path.join(tmp, 'prompts-auto.js'));
  const auto: any[] = readAuto(tmp); expect(auto).toEqual([]);
  auto.push({ id: 'auto-11-3', day: 11, lvl: 3, q: 'Name an existing auto prompt', cat: 'Anime', src: 'Any series', open: true, a: '\nE A' });
  let n = 0;
  const ask = async (_c: any, instr: string) => instr.includes('write prompts') ? { prompts: [{ q: `Name a fake thing number ${++n} zz${n}`, cat: 'Anime', src: 'Any series', open: true, answers: fakeAnswers(40, 'Thing' + n) }] } : okCritic();
  const r = await makePrompts({ core, prompts, auto, cfg, today: 10, ask, wiki: async () => ({ site: 'w', title: 't' }), log: quiet });
  // days 11..14 × levels 3,6 minus the one already there
  expect(r.added.length).toBe(SET.leadDays * SET.newLevels.length - 1);
  expect(new Set(auto.map(p => p.id)).size).toBe(auto.length);
  writeAuto(auto, tmp);
  const back = readAuto(tmp);
  expect(back.length).toBe(auto.length);
  expect(back.every((p: any) => p.day >= 11 && p.day <= 14 && p.auto)).toBe(true);
  expect(fs.readFileSync(path.join(tmp, 'prompts-auto.js'), 'utf8')).toMatch(/^\/\* Final Form/);
});
