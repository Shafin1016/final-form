// Rarity pyramid rules (FFCore.rankTiers): Legendary >= 3 x Mythic, Epic >= 2 x Legendary, Common is the biggest tier.
import { test, expect } from 'bun:test';
// @ts-ignore
import { loadBank } from '../tools/lib.mjs';
const { core, prompts } = loadBank();
const count = (m: Map<string, string>) => { const t: any = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 }; for (const v of m.values()) t[v]++; return t; };
const rules = (t: any) => t.A >= 3 * t.S && t.B >= 2 * t.A;

test('every prompt in the bank follows the pyramid rules', () => {
  for (const p of prompts) { const t = count(core.rankTiers(p.answers.map((a: any) => ({ key: a.key, sh: null, hand: a.tier }))).map); expect(rules(t), p.id + ' ' + JSON.stringify(t)).toBe(true); }
});
test('random answer lists and shares follow the rules too', () => {
  let seed = 7; const r = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let it = 0; it < 2000; it++) {
    const n = 1 + Math.floor(r() * 150);
    const t = count(core.rankTiers(Array.from({ length: n }, (_, i) => ({ key: 'k' + i, sh: r() < .5 ? r() ** 4 * .3 : 0, hand: 'EDCBAS'[Math.floor(r() * 6)] }))).map);
    expect(rules(t), JSON.stringify(t)).toBe(true);
    if (n >= 10) expect(t.E).toBeGreaterThanOrEqual(Math.max(t.A, t.S));
  }
});
test('Mythic only where it fits; most popular answers are Common', () => {
  const tiers = (n: number) => count(core.rankTiers(Array.from({ length: n }, (_, i) => ({ key: 'k' + i, sh: (n - i) / (n * n), hand: 'C' }))).map);
  expect(tiers(12).S).toBe(0); expect(tiers(30).S).toBe(1); expect(tiers(120).S).toBe(3);
  const r = core.rankTiers([{ key: 'top', sh: .4, hand: 'S' }, ...Array.from({ length: 20 }, (_, i) => ({ key: 'k' + i, sh: .01, hand: 'E' }))]);
  expect(r.map.get('top')).toBe('E');
});
