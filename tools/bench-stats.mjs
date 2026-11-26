// Pure helpers for tools/bench-live.mjs (and its tests): which path answered a request, and the summary numbers.
// Unavailable/error responses are counted separately and never enter hit rates or latency percentiles —
// a timed-out or rate-limited check isn't a cache hit, and its latency isn't the cache's latency.

export function pathOf(r) {
  if (!r || !r.status || r.status === 'unavailable' || r.status === 'error' || r.http >= 400 || r.error) return 'unavailable';
  if (r.deduped) return 'dedupe';
  if (r.source === 'ai') return 'model';
  return 'cache';                      // bank, cache, review decisions, negative cache, input checks
}

export function pct(xs, f) { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : null; }

export function summarize(results) {
  const by = { model: [], cache: [], dedupe: [], unavailable: [] };
  for (const r of results) by[pathOf(r)].push(r);
  const reasons = {};
  for (const r of by.unavailable) { const k = r.reason || r.error || (r.http ? 'http ' + r.http : 'unknown'); reasons[k] = (reasons[k] || 0) + 1; }
  const answered = by.model.length + by.cache.length + by.dedupe.length;
  const ms = xs => xs.map(r => r.ms);
  return {
    total: results.length, answered, unavailable: by.unavailable.length, reasons,
    hitRate: answered ? (by.cache.length + by.dedupe.length) / answered : null,       // share of answered checks that skipped the model
    cache: { n: by.cache.length, p50: pct(ms(by.cache), .5), p95: pct(ms(by.cache), .95) },
    model: { n: by.model.length, p50: pct(ms(by.model), .5), p95: pct(ms(by.model), .95) },
  };
}
