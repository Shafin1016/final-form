"""Browser test for "Did you mean …?" (works with or without a backend).
   python3 -m http.server 8765 &   then   python3 tests/suggest_test.py
Checks: a near-miss shows the suggestion in quotes with no miss counted; Enter accepts; clicking accepts;
"No, I meant …" submits the original guess (normal miss); editing the text clears the offer."""
import asyncio, os, sys
from playwright.async_api import async_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765')
async def main():
    fails = []
    def ok(n, c, x=''): print(('  ok   ' if c else '  FAIL ') + n + (f'  ({x})' if x else '')); (None if c else fails.append(n))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1100, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        # run as if no backend is configured, whatever ff-config.js says
        await pg.route('**/ff-config.js', lambda r: r.fulfill(content_type='text/javascript', body="window.FF_CONFIG = { api: '' };"))
        await pg.goto(BASE + '/index.html?fast&set=' + ','.join(['op-strawhats'] * 7))
        await pg.wait_for_function("!document.getElementById('playDaily').disabled", timeout=90000)
        await pg.click('#playPractice'); await pg.wait_for_selector('#ans', state='visible'); await pg.wait_for_timeout(300)
        st = lambda: pg.evaluate("(()=>{const G=__ff.state();return {round:G.round,strikes:G.strikes,res:G.res.map(r=>r&&{name:r.name,sug:!!r.sug,raw:r.raw})}})()")
        async def nxt(k): await pg.wait_for_function(f"__ff.state().round==={k}&&!__ff.state().locked&&document.getElementById('ans').offsetParent", timeout=10000); await pg.wait_for_timeout(100)

        # 1) suggestion appears, no miss; Enter accepts
        await pg.fill('#ans', 'Frankie'); await pg.press('#ans', 'Enter'); await pg.wait_for_timeout(150)
        fb = await pg.text_content('#fb'); s = await st()
        ok('suggestion shown in quotes', '“Franky”' in fb and 'Did you mean' in fb, fb)
        ok('no miss for a suggestion', s['strikes'] == 0 and not s['res'])
        await pg.screenshot(path='/tmp/sug.png', clip={'x': 60, 'y': 600, 'width': 980, 'height': 240})
        await pg.press('#ans', 'Enter'); await pg.wait_for_function("__ff.state().res[0]", timeout=5000); s = await st()
        ok('Enter accepts it', s['res'][0]['name'] == 'Franky' and s['res'][0]['sug'], str(s['res'][0]))
        await nxt(1)
        # 2) clicking the quoted name accepts
        await pg.fill('#ans', 'Ussop'); await pg.press('#ans', 'Enter'); await pg.wait_for_selector('#fb .sug', timeout=3000)
        await pg.click('#fb .sug'); await pg.wait_for_function("__ff.state().res[1]", timeout=5000); s = await st()
        ok('clicking the suggestion accepts it', s['res'][1]['name'] == 'Usopp')
        await nxt(2)
        # 3) editing clears it; "No, I meant" submits the original guess
        await pg.fill('#ans', 'Frankie'); await pg.press('#ans', 'Enter'); await pg.wait_for_selector('#fb .sug', timeout=3000)
        await pg.type('#ans', 'x'); ok('typing clears the offer', await pg.locator('#fb .sug').count() == 0)
        await pg.fill('#ans', 'Frankie'); await pg.press('#ans', 'Enter'); await pg.wait_for_selector('#fb .sug', timeout=3000)
        await pg.click('#fb .claim'); await pg.wait_for_timeout(200); s = await st()
        ok('"No, I meant …" submits the original guess as typed (a normal miss offline)', s['strikes'] == 1 and not s['res'][2] if len(s['res']) > 2 else s['strikes'] == 1, str(s))
        # 4) short name sound-alike on another prompt is covered by unit tests; exact answers are untouched and instant
        await pg.fill('#ans', 'Nami'); await pg.press('#ans', 'Enter'); await pg.wait_for_function("__ff.state().res[2]", timeout=5000)
        ok('exact answers unchanged', (await st())['res'][2]['name'] == 'Nami')
        ok('no page errors', not errs, '; '.join(errs))
        await b.close()
    print('SUGGEST: all passed' if not fails else 'SUGGEST: FAILED'); sys.exit(1 if fails else 0)
asyncio.run(main())
