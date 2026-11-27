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
      const ans = { tier, name: parts[0], key: norm(parts[0]), alts: parts }; answers.push(ans);
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
      if (!ans) { ans = target = { tier: e.tier || null, name: String(e.name).slice(0, 80), key: e.key, alts: [String(e.name).slice(0, 80)], ai: e.status !== 'approved', extra: true, status: e.status }; p.answers.push(ans); p._sug = null; }
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
  // sequel numbers must agree for any match that isn't exact: "Persona 4" is not "Persona 3", "Mega Man X5" is not "X4"
  const digits = s => (s.match(/\d+/g) || []).map(Number).sort((a, b) => a - b).join(',');
  function matchKeys(keys, raw) { const k = norm(raw); if (!k) return { none: true };
    if (keys.has(k)) return { ans: keys.get(k) };
    // (a listed series with no number, like "Tekken", still accepts "Tekken 5")
    const dk = digits(k), sameNum = key => { const d = digits(key); return !d || !dk || d === dk; };
    let best = 9, hits = new Set(); for (const [key, ans] of keys) { if (key.length < 5 || !sameNum(key)) continue; const tol = key.length <= 7 ? 1 : 2, d = osa(k, key, tol); if (d <= tol) { if (d < best) { best = d; hits = new Set([ans]); } else if (d === best) hits.add(ans); } }
    if (hits.size === 1) return { ans: [...hits][0], fuzzy: true }; if (hits.size > 1) return { ambiguous: true };
    const toks = (raw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean), spans = new Set();
    for (let i = 0; i < toks.length; i++) { let acc = ''; for (let j = i; j < toks.length; j++) { acc += toks[j]; spans.add(acc); } }
    let bl = 0, cands = new Set(); for (const [key, ans] of keys) { if (key.length < 4 || key.length < k.length * 0.25 || !spans.has(key) || !sameNum(key)) continue; if (key.length > bl) { bl = key.length; cands = new Set([ans]); } else if (key.length === bl) cands.add(ans); }
    if (cands.size === 1) return { ans: [...cands][0], fuzzy: true }; if (cands.size > 1) return { ambiguous: true };
    if (k.length >= 6) { const pre = new Set(); for (const [key, ans] of keys) if (key.startsWith(k) && k.length >= key.length * 0.5 && sameNum(key)) pre.add(ans); if (pre.size === 1) return { ans: [...pre][0], fuzzy: true }; if (pre.size > 1) return { ambiguous: true }; }
    return { none: true }; }

  // hand-written bank first; shared validated answers only if the bank has nothing
  function match(p, raw) { const m = matchKeys(p.keys, raw); if (!m.none || !p.extraKeys || !p.extraKeys.size) return m;
    const e = matchKeys(p.extraKeys, raw); if (e.ans) e.extra = true; return e; }

  // "Did you mean …?" — a looser, order-insensitive comparison used only AFTER match() found nothing.
  // Never auto-accepts: the player sees the suggestion and confirms it. Returns one answer or null (null when unsure
  // or when two different answers are equally close, so it never picks between them for the player).
  const toks = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(t => t && t !== 'the');
  const NUMW = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
  // sequel numbers must agree: "Resident Evil Zero" is never "Resident Evil 3"
  const nums = ts => ts.map(t => NUMW[t] || (/^\d+$/.test(t) ? String(+t) : (t.match(/\d+/g) || []).join(','))).filter(Boolean).sort().join('|');
  // rough sound-alike key: first letter + consonants ("levey" / "leve" / "levi" -> "lv", "frankie" / "franky" -> "frnk")
  const skel = t => { const w = t.replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/[cq]/g, 'k').replace(/z/g, 's').replace(/x/g, 'ks');
    const c = w.replace(/(.)\1+/g, '$1'); return c[0] + c.slice(1).replace(/[aeiouyhw]/g, ''); };
  function sugIndex(p) {
    if (p._sug && p._sug.n === p.answers.length) return p._sug;
    const items = [], freq = new Map();
    for (const ans of p.answers) { const seen = new Set();
      for (const alt of ans.alts || [ans.name]) { const ts = toks(alt); if (!ts.length) continue; items.push({ ans, key: ts.join(''), sorted: ts.slice().sort().join(''), ts, num: nums(ts), sk: ts.length === 1 && !/\d/.test(ts[0]) ? skel(ts[0]) : null }); for (const t of ts) seen.add(t); }
      for (const t of seen) freq.set(t, (freq.get(t) || 0) + 1); }
    for (const [key, ans] of (p.extraKeys || [])) items.push({ ans, key, sorted: key, ts: [key], num: nums([key]) });
    return (p._sug = { n: p.answers.length, items, freq });
  }
  function suggest(p, raw) {
    const it = toks(raw), k = it.join(''), sk = it.slice().sort().join('');
    if (k.length < 3) return null;
    const short = k.length < 5, ks = it.length === 1 && !/\d/.test(k) ? skel(k) : null;
    const ix = sugIndex(p), nk = nums(it); let best = null, bs = Infinity, tie = false;
    const take = (ans, sc) => { if (sc < bs - 1e-9) { best = ans; bs = sc; tie = false; } else if (sc < bs + 1e-9 && best && ans.key !== best.key) tie = true; };
    for (const x of ix.items) {
      if (x.key.length < 3 || x.num !== nk) continue;
      // short names ("Levi", "Eren", "Goku"): only a sound-alike with the same first letter and a similar length
      if (ks && x.sk && ks.length >= 2 && ks === x.sk && k.slice(0, 2) === x.key.slice(0, 2) && Math.abs(k.length - x.key.length) <= 2 && x.key.length <= 8) take(x.ans, 0.15 + Math.abs(k.length - x.key.length) * 0.01);
      if (short) continue;
      for (const [a, b] of [[k, x.key], [sk, x.sorted]]) {          // as typed, and with words in any order
        const L = Math.max(a.length, b.length), tol = Math.min(4, Math.floor(L * 0.3));   // roughly 1 slip per 3–4 letters
        const d = a === b ? 0 : osa(a, b, tol); if (d <= tol) take(x.ans, d / L + (a === sk && a !== k ? 0.02 : 0));
      }
      // one remembered word with a slip ("Socrattes"), only if that word belongs to a single answer
      if (it.length === 1 && k.length >= x.key.length * 0.45) for (const t of x.ts) if (t.length >= 5 && ix.freq.get(t) === 1) { const d = osa(k, t, 1); if (d <= 1) take(x.ans, 0.3 + d * 0.05); }
    }
    return best && !tie ? best : null;
  }

  // rarity safeguard: an answer nobody has reviewed yet can never score above this tier,
  // so a freshly AI-validated answer doesn't land at Mythic just because no one has given it before
  const UNREVIEWED_CAP = 'B';
  // Rarity by RANK inside one prompt: answers sorted from most to least popular, each tier takes a fixed slice of
  // the list, so every prompt is a pyramid (lots of Common/Uncommon, a few Legendary, 1-3 Mythic).
  // list: [{ key, sh: share of players 0..1 (null before a prompt has enough plays), hand: hand-written tier }]
  const QUOTA = [['E', 0.30], ['D', 0.25], ['C', 0.20], ['B', 0.14]];
  function mythicSlots(n) { return n < 4 ? 0 : n < 30 ? 1 : n < 60 ? 2 : 3; }
  function rankTiers(list) {
    const ord = 'EDCBAS', n = list.length, map = new Map();
    const sorted = list.slice().sort((x, y) => ((y.sh == null ? -1 : y.sh) - (x.sh == null ? -1 : x.sh)) || ord.indexOf(x.hand) - ord.indexOf(y.hand) || (x.key < y.key ? -1 : 1));
    // plan the counts top-down so the pyramid rules hold: Legendary >= 3 x Mythic, Epic >= 2 x Legendary.
    // A Mythic is only offered when its Legendary/Epic entourage fits in the rarest ~45% of the list.
    let nS = mythicSlots(n), nA, nB;
    for (;; nS--) { nA = n < 5 ? 0 : Math.max(1, Math.round(n * 0.08), 3 * nS); nB = Math.max(n < 5 ? 0 : Math.round(n * 0.14), 2 * nA); if (nS <= 0 || (nA >= 3 * nS && nS + nA + nB <= n * 0.45)) break; }
    nS = Math.max(0, nS); while (nA && nS + nA + nB > n - Math.min(n, 3)) { nA--; nB = Math.max(0, nB - 2); }   // tiny prompts: keep 3 for C/D/E
    const m = n - nS - nA - nB, W = QUOTA.slice(0, 3).reduce((a, q) => a + q[1], 0); let i = 0;
    QUOTA.slice(0, 3).forEach(([t, q], j) => { const take = j === 2 ? m - i : Math.min(m - i, Math.max(t === 'E' && m ? 1 : 0, Math.round(m * q / W))); for (let k = 0; k < take; k++) sorted[i + k].tier = t; i += Math.max(0, take); });
    for (let k = 0; k < nB; k++) sorted[i++].tier = 'B';
    for (; i < n; i++) sorted[i].tier = i >= n - nS ? 'S' : 'A';
    // never call something rare when a real share of players gives it
    for (const r of sorted) { if (r.sh != null && r.tier === 'S' && r.sh >= 0.005) r.tier = 'A'; if (r.sh != null && r.tier === 'A' && r.sh >= 0.02) r.tier = 'B'; }
    // the pyramid rules: at least 3 Legendary for every Mythic (otherwise the Mythic becomes Legendary),
    // and at least 2 Epic for every Legendary (the rarest Rare answers move up; with none left, a Legendary moves down)
    const cnt = t => sorted.filter(r => r.tier === t).length, last = t => { for (let j = sorted.length - 1; j >= 0; j--) if (sorted[j].tier === t) return sorted[j]; return null; }, first = t => sorted.find(r => r.tier === t) || null;
    for (let guard = 0; guard < 4 * n + 4; guard++) {
      if (cnt('S') && cnt('A') < 3 * cnt('S')) { first('S').tier = 'A'; continue; }
      if (cnt('A') && cnt('B') < 2 * cnt('A')) { const c = last('C'); if (c) c.tier = 'B'; else first('A').tier = 'B'; continue; }
      break;
    }
    for (const r of sorted) map.set(r.key, r.tier);
    return { map, sorted };
  }
  function capTier(ans, tier) { if (!ans || !ans.ai) return tier; return TIER_ORDER.indexOf(tier) < TIER_ORDER.indexOf(UNREVIEWED_CAP) ? UNREVIEWED_CAP : tier; }

  root.FFCore = { rankTiers, mythicSlots, norm, parseAnswers, addExtra, osa, matchKeys, match, suggest, capTier, UNREVIEWED_CAP, TIER_ORDER };
})(typeof window !== 'undefined' ? window : globalThis);
