"""End-to-end browser test against tests/dev-server.ts (real backend handler, in-memory DB, fake model).
   bun tests/dev-server.ts &   then   python3 tests/browser_test.py
Checks: bank answers stay instant (no network), unknown answers pause the timer while checked, valid AI answers attack with
the rarity cap, invalid ones strike, uncertain/unavailable ones don't strike, cached answers resolve with no backend call,
double-submits while checking are ignored, the run is recorded once on the server."""
import asyncio, json, os, sys, time, urllib.request
from playwright.async_api import async_playwright

BASE = os.environ.get('BASE', 'http://localhost:8790')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
SET = 'consoles,consoles,consoles,consoles,consoles,consoles,consoles'
fails = []
def ok(name, cond, extra=''):
    print(('  ok   ' if cond else '  FAIL ') + name + (f'  ({extra})' if extra else '')); (None if cond else fails.append(name))
def server_stats(): return json.load(urllib.request.urlopen(BASE + '/__stats'))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1100, 'height': 900}); errs = []; reqs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('request', lambda r: reqs.append(r.url) if '/functions/v1/ff/' in r.url else None)
        await pg.goto(BASE + '/index.html?fast&set=' + SET)
        await pg.wait_for_function("!document.getElementById('playDaily').disabled", timeout=90000)
        await pg.click('#playPractice')
        await pg.wait_for_selector('#ans', state='visible', timeout=30000); await pg.wait_for_timeout(200)
        ok('answers preloaded at game start', any('/answers?p=' in u for u in reqs))

        async def nxt():   # ?fast auto-advances to the next round
            await pg.wait_for_function("(()=>{const G=__ff.state();return G.res.length===G.round&&!G.locked&&document.getElementById('ans').offsetParent})()", timeout=10000); await pg.wait_for_timeout(100)
        async def submit(txt):
            await pg.fill('#ans', txt); t = time.time(); await pg.press('#ans', 'Enter'); return t
        state = lambda: pg.evaluate("(()=>{const G=__ff.state();return {round:G.round, strikes:G.strikes, checking:!!G.checking, left:G.timeLeft?G.timeLeft():null, res:G.res.map(r=>r&&{tier:r.tier,name:r.name,ms:r.ms})}})()")

        # 1) bank answer: instant, no validate request
        n0 = len([u for u in reqs if '/validate' in u]); t = await submit('PlayStation 2')
        await pg.wait_for_function("__ff.state().res[0]", timeout=5000); dt = time.time() - t
        ok('bank answer resolves instantly without the backend', len([u for u in reqs if '/validate' in u]) == n0 and dt < 0.5, f'{dt*1000:.0f}ms')
        await nxt()

        # 2) uncertain: no strike, timer paused during the check, then resumes
        await pg.wait_for_timeout(1200); before = (await state())['left']
        await submit('Nuon'); await pg.wait_for_timeout(120); s = await state()
        ok('timer paused while checking', s['checking'] and abs(s['left'] - before) < 400, f"left {before:.0f}->{s['left']:.0f}")
        dbl = await pg.evaluate("(()=>{document.getElementById('ans').value='Nuon';document.getElementById('ansForm').requestSubmit();return __ff.state().aiN})()")
        ok('second submit while checking is ignored', dbl == 1, f'aiN={dbl}')
        await pg.wait_for_function("!__ff.state().checking", timeout=8000); s = await state()
        ok('uncertain answer: no strike', s['strikes'] == 0); fb = await pg.text_content('#fb'); ok('uncertain message shown', 'review' in fb, fb)
        ok('time spent checking was not charged', before - s['left'] < 700, f"{before - s['left']:.0f}ms")
        # 3) API failure: no strike
        await submit('crash me'); await pg.wait_for_function("!__ff.state().checking", timeout=8000); s = await state()
        ok('backend failure: no strike', s['strikes'] == 0, await pg.text_content('#fb'))
        # 4) invalid: strike
        await submit('toaster'); await pg.wait_for_function("!__ff.state().checking", timeout=8000); s = await state()
        ok('invalid answer: strike', s['strikes'] == 1)
        ok('claim button offered on AI rejection', await pg.locator('#fb .claim').count() == 1)
        # 5) obscure valid answer: attack, capped tier
        await submit('Bandai Playdia'); await pg.wait_for_function("__ff.state().res[1]", timeout=8000); s = await state()
        r1 = s['res'][1]; ok('obscure valid answer attacks', r1['name'] == 'Bandai Playdia', str(r1))
        ok('unreviewed answer is rarity-capped (never above B)', r1['tier'] in 'BCDE', r1['tier'])
        await nxt()

        # 6) same answer again: now known locally -> instant, no backend call
        n0 = len([u for u in reqs if '/validate' in u]); t = await submit('bandai playdia')
        await pg.wait_for_function("__ff.state().res[2]", timeout=5000); dt = time.time() - t
        ok('validated answer is instant the second time (local cache)', len([u for u in reqs if '/validate' in u]) == n0 and dt < 0.5, f'{dt*1000:.0f}ms')
        await nxt()

        # 7) alias of a bank answer suggested by the model
        await submit('sfc'); await pg.wait_for_function("__ff.state().res[3]", timeout=8000); s = await state()
        ok('model maps a new spelling to a bank answer', s['res'][3]['name'] == 'Super Nintendo', str(s['res'][3]))
        ok('…and that unreviewed spelling is capped too', s['res'][3]['tier'] in 'BCDE', s['res'][3]['tier'])
        await nxt()

        # 8) timeout on the client side: model hangs -> client gives up, no strike
        await submit('slowpoke'); await pg.wait_for_function("!__ff.state().checking", timeout=12000); s = await state()
        ok('model timeout: no strike', s['strikes'] == 0, await pg.text_content('#fb'))
        # finish the round + game with bank answers
        for k in range(3):
            await submit(['Xbox 360', 'GameCube', 'Sega Saturn'][k])
            if k < 2: await nxt()
        await pg.wait_for_function("window.__resultsReady === true", timeout=20000)
        foot = await pg.text_content('#foot'); ok('results say scores are shared', 'shared' in foot, foot)
        st = server_stats(); ok('run recorded on the server once', st['runs'] == 1, str(st['runs']))
        # second browser: the answer validated above is already known
        pg2 = await b.new_page(); reqs2 = []
        pg2.on('request', lambda r: reqs2.append(r.url) if '/validate' in r.url else None)
        await pg2.goto(BASE + '/index.html?fast&set=' + SET); await pg2.wait_for_function("!document.getElementById('playDaily').disabled", timeout=90000)
        await pg2.click('#playPractice'); await pg2.wait_for_selector('#ans', state='visible'); await pg2.wait_for_timeout(600)
        await pg2.fill('#ans', 'Bandai Playdai'); await pg2.press('#ans', 'Enter'); await pg2.wait_for_function("__ff.state().res[0]", timeout=5000)
        ok('another player gets the shared answer with no backend call', not reqs2 and (await pg2.evaluate("__ff.state().res[0].name")) == 'Bandai Playdia')
        ai_log = await pg.evaluate("window.__aiLog")
        print('  client check latencies (ms):', [(x['raw'], x['status'], x['ms']) for x in ai_log])
        ok('no page errors', not errs, '; '.join(errs))
        await b.close()
    print('BROWSER: all passed' if not fails else f'BROWSER: {len(fails)} FAILED: {fails}'); sys.exit(1 if fails else 0)
asyncio.run(main())
