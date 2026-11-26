// Checks the REST calls the edge function makes to Supabase (URL, headers, RPC names/arguments).
import { test, expect } from 'bun:test';
import { pgStore } from '../supabase/functions/ff/store.ts';

function rec(reply: any = []) {
  const calls: any[] = [];
  const f = (async (url: string, init: any) => { calls.push({ url, ...init, body: init.body && JSON.parse(init.body) }); return new Response(JSON.stringify(reply), { status: 200 }); }) as unknown as typeof fetch;
  return { calls, f };
}
test('new-style secret key goes in apikey only; legacy JWT also as bearer', async () => {
  const a = rec(); await pgStore('https://x.supabase.co/', 'sb_secret_abc', a.f).stats(28);
  expect(a.calls[0].url).toBe('https://x.supabase.co/rest/v1/rpc/ff_stats'); expect(a.calls[0].headers.apikey).toBe('sb_secret_abc'); expect(a.calls[0].headers.Authorization).toBeUndefined();
  expect(a.calls[0].body).toEqual({ p_nbins: 28 });
  const b = rec(); await pgStore('https://x.supabase.co', 'eyJhbGc.x.y', b.f).stats(28); expect(b.calls[0].headers.Authorization).toBe('Bearer eyJhbGc.x.y');
});
test('queries are encoded; ids with quotes cannot break the filter', async () => {
  const a = rec(); const s = pgStore('https://x.supabase.co', 'k', a.f);
  await s.answers(['consoles', 'a"b,c']); expect(decodeURIComponent(a.calls[0].url)).toContain('prompt_id=in.("consoles","ab,c")');
  await s.verdict('consoles', 'pippin'); expect(a.calls[1].url).toContain('/ff_verdicts?prompt_id=eq.consoles&norm=eq.pippin&limit=1');
  await s.recordRun('u', 1, 2, 'daily', 3, 'gold', {}, 0, [{ p: 'x', a: null }]); expect(a.calls[2].body.p_answers).toEqual([{ p: 'x', a: null }]);
  await s.log('p', 'n', 'cache', 5); expect(a.calls[3].headers.Prefer).toBe('return=minimal');
});
test('db errors surface as exceptions (the handler turns them into "unavailable")', async () => {
  const f = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
  await expect(pgStore('https://x', 'k', f).stats(28)).rejects.toThrow('503');
});
