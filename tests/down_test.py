"""When the answer checker is down, the game must not keep showing "Checking…" for nothing.
   python3 -m http.server 8765 &   then   python3 tests/down_test.py
A: backend unreachable at game start -> unknown answers are instant misses (no spinner).
B: backend up at start but every check fails -> 2 "couldn't check" notices (no miss), then list-only misses."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765')
CFG = "window.FF_CONFIG = { api: 'https://backend.test/functions/v1/ff', aiCheck: true, aiPerRound: 5, validateTimeoutMs: 4500 };"
async def run(b, health_ok):
    pg = await b.new_page(); errs = []; calls = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.route('**/ff-config.js', lambda r: r.fulfill(content_type='text/javascript', body=CFG))
    async def backend(route):
        u = route.request.url; calls.append(u.split('/ff')[-1])
        if not health_ok: return await route.abort()
        if u.endswith('/health'): return await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'ok': True, 'ai': True}))
        if '/validate' in u: return await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'status': 'unavailable', 'reason': 'ai-rate-limited'}))
        return await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"answers":{},"stats":null}')
    await pg.route('https://backend.test/**', backend)
    await pg.goto(BASE + '/index.html?fast&set=' + ','.join(['consoles'] * 7))
    await pg.wait_for_function("!document.getElementById('playDaily').disabled", timeout=90000)
    await pg.click('#playPractice'); await pg.wait_for_selector('#ans', state='visible'); await pg.wait_for_timeout(600)
    out = []
    for g in ['my microwave', 'a toaster oven', 'the fridge thing']:
        await pg.fill('#ans', g); await pg.press('#ans', 'Enter'); await pg.wait_for_timeout(80)
        spin = await pg.evaluate("__ff.state().checking"); await pg.wait_for_function("!__ff.state().checking", timeout=8000)
        out.append({'spinner': spin, 'strikes': await pg.evaluate("__ff.state().strikes"), 'fb': await pg.text_content('#fb')})
    await pg.close(); return out, calls, errs
async def main():
    fails = []
    def ok(n, c, x=''): print(('  ok   ' if c else '  FAIL ') + n + (f'  ({x})' if x else '')); (None if c else fails.append(n))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        out, calls, errs = await run(b, False)
        ok('A: backend down -> no spinner, instant misses', [o['spinner'] for o in out] == [False] * 3 and [o['strikes'] for o in out[:2]] == [1, 2] and "isn't on our list" in out[0]['fb'], str(out))
        ok('A: no validate calls attempted', not any('/validate' in c for c in calls), str(calls)); ok('A: no page errors', not errs, '; '.join(errs))
        out, calls, errs = await run(b, True)
        ok('B: first two failures are not misses', [o['strikes'] for o in out[:2]] == [0, 0], str(out))
        ok('B: second failure says checking is offline', 'offline' in out[1]['fb'], out[1]['fb'])
        ok('B: then plain list-only miss, no spinner', out[2]['spinner'] is False and out[2]['strikes'] == 1, str(out[2]))
        ok('B: only 2 validate calls', sum('/validate' in c for c in calls) == 2, str(calls)); ok('B: no page errors', not errs, '; '.join(errs))
        await b.close()
    print('DOWN: all passed' if not fails else 'DOWN: FAILED'); sys.exit(1 if fails else 0)
asyncio.run(main())
