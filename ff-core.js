/* Final Form — answer matching core.
   One file, used unchanged by the browser game (window.FFCore) and the backend (globalThis.FFCore),
   so a typed answer is judged exactly the same way on both sides. */
(function (root) {
  const TIER_ORDER = 'SABCDE';
  const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/♀/g, ' f').replace(/♂/g, ' m').replace(/&/g, ' and ').replace(/^\s*the\s+/, '').replace(/[^a-z0-9]/g, '');

  // "TIER Display name | alias | alias" lines -> { answers, keys }
  function parseAnswers(text, tiers) {
    const answers = [], keys = new Map();
    for (const line of String(text || '').trim().split('\n')) {
      const t = line.trim(), tier = t[0], parts = t.slice(1).split('|').map(x => x.trim()).filter(Boolean);
      if (!(tiers ? tiers[tier] : TIER_ORDER.includes(tier)) || !parts.length) continue;
      const ans = { tier, name: parts[0], key: norm(parts[0]) }; answers.push(ans);
      for (const al of parts) { const k = norm(al); if (k && !keys.has(k)) keys.set(k, ans); }
    }
    return { answers, keys };
  }

  // add answers that came from the shared validated-answer store (AI-checked or reviewed) to a parsed prompt
  // extra: [{ key, name, aliases:[...], tier|null, status:'ai'|'approved' }]
  function addExtra(p, extra) {
    p.extraKeys = p.extraKeys || new Map();
    for (const e of extra || []) {
      if (!e || !e.key || !e.name) continue;
      let ans = p.answers.find(a => a.key === e.key), target;
      if (!ans) { ans = target = { tier: e.tier || null, name: String(e.name).slice(0, 80), key: e.key, ai: e.status !== 'approved', extra: true, status: e.status }; p.answers.push(ans); }
      else if (ans.extra) { ans.status = e.status; ans.ai = e.status !== 'approved'; if (e.tier) ans.tier = e.tier; target = ans; }
      // a new spelling of a hand-written answer: counts as that answer, but stays rarity-capped until a person approves the spelling
      else target = e.status === 'approved' ? ans : Object.assign({}, ans, { ai: true, via: 'alias' });
      for (const al of [e.key, ...(e.aliases || [])]) { const k = norm(al); if (k && !p.keys.has(k) && !p.extraKeys.has(k)) p.extraKeys.set(k, target); }
    }
    return p;
  }

  function osa(a, b, max) { const la = a.length, lb = b.length; if (Math.abs(la - lb) > max) return max + 1; let prev2 = null, prev = Array.from({ length: lb + 1 }, (_, j) => j);
    for (let i = 1; i <= la; i++) { const cur = [i]; let best = i; for (let j = 1; j <= lb; j++) { const c = a[i - 1] === b[j - 1] ? 0 : 1; let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c); if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1); cur.push(v); if (v < best) best = v; } if (best > max) return max + 1; prev2 = prev; prev = cur; } return prev[lb]; }

  // exact alias -> small typo -> known answer inside a longer phrase -> unique short form
  function matchKeys(keys, raw) { const k = norm(raw); if (!k) return { none: true };
    if (keys.has(k)) return { ans: keys.get(k) };
    let best = 9, hits = new Set(); for (const [key, ans] of keys) { if (key.length < 5) continue; const tol = key.length <= 7 ? 1 : 2, d = osa(k, key, tol); if (d <= tol) { if (d < best) { best = d; hits = new Set([ans]); } else if (d === best) hits.add(ans); } }
    if (hits.size === 1) return { ans: [...hits][0], fuzzy: true }; if (hits.size > 1) return { ambiguous: true };
    const toks = (raw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean), spans = new Set();
    for (let i = 0; i < toks.length; i++) { let acc = ''; for (let j = i; j < toks.length; j++) { acc += toks[j]; spans.add(acc); } }
    let bl = 0, cands = new Set(); for (const [key, ans] of keys) { if (key.length < 4 || key.length < k.length * 0.25 || !spans.has(key)) continue; if (key.length > bl) { bl = key.length; cands = new Set([ans]); } else if (key.length === bl) cands.add(ans); }
    if (cands.size === 1) return { ans: [...cands][0], fuzzy: true }; if (cands.size > 1) return { ambiguous: true };
    if (k.length >= 6) { const pre = new Set(); for (const [key, ans] of keys) if (key.startsWith(k) && k.length >= key.length * 0.5) pre.add(ans); if (pre.size === 1) return { ans: [...pre][0], fuzzy: true }; if (pre.size > 1) return { ambiguous: true }; }
    return { none: true }; }

  // hand-written bank first; shared validated answers only if the bank has nothing
  function match(p, raw) { const m = matchKeys(p.keys, raw); if (!m.none || !p.extraKeys || !p.extraKeys.size) return m;
    const e = matchKeys(p.extraKeys, raw); if (e.ans) e.extra = true; return e; }

  // rarity safeguard: an answer nobody has reviewed yet can never score above this tier,
  // so a freshly AI-validated answer doesn't land at Mythic just because no one has given it before
  const UNREVIEWED_CAP = 'B';
  function capTier(ans, tier) { if (!ans || !ans.ai) return tier; return TIER_ORDER.indexOf(tier) < TIER_ORDER.indexOf(UNREVIEWED_CAP) ? UNREVIEWED_CAP : tier; }

  root.FFCore = { norm, parseAnswers, addExtra, osa, matchKeys, match, capTier, UNREVIEWED_CAP, TIER_ORDER };
})(typeof window !== 'undefined' ? window : globalThis);
