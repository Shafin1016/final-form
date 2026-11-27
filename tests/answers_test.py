"""Results screen: per-prompt answer browser (tier chips, search, scroll list).
   python3 -m http.server 8765 &   then   python3 tests/answers_test.py"""
import asyncio, os, sys
from playwright.async_api import async_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765')
SET = ['op-strawhats', 'pkmn-151'] + ['op-strawhats'] * 5
ANS = ['Nami', 'Pikachu', 'Sanji', 'Brook', 'Jinbe', 'Franky', 'Usopp']
async def main():
    fails = []
    def ok(n, c, x=''): print(('  ok   ' if c else '  FAIL ') + n + (f'  ({x})' if x else '')); (None if c else fails.append(n))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1000, 'height': 1300})
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await ctx.route('**/ff-config.js', lambda r: r.fulfill(content_type='text/javascript', body="window.FF_CONFIG={api:''};"))
        await pg.goto(BASE + '/index.html?fast&set=' + ','.join(SET))
        await pg.wait_for_function("!document.getElementById('playDaily').disabled", timeout=90000)
        await pg.click('#playPractice'); await pg.wait_for_selector('#ans', state='visible'); await pg.wait_for_timeout(300)
        for k, a in enumerate(ANS):
            await pg.fill('#ans', a); await pg.press('#ans', 'Enter')
            if k < 6: await pg.wait_for_function(f"__ff.state().round==={k+1}&&!__ff.state().locked", timeout=10000); await pg.wait_for_timeout(80)
        await pg.wait_for_function("window.__resultsReady === true", timeout=20000); await pg.wait_for_timeout(300)
        ok('every round has an All answers button', await pg.locator('.abtog').count() == 7)
        await pg.locator('.abtog').nth(1).click(); box = pg.locator('.ab').nth(1)
        n = await box.locator('.ab-it').count(); ok('pokemon list shows all answers', n > 100, n)
        ok('your answer highlighted', 'Pikachu' in await box.locator('.ab-it.me').inner_text())
        chips = await box.locator('.ab-chip').all_inner_texts(); ok('tier chips with counts', len(chips) >= 3 and chips[0].startswith('All'), chips)
        await box.locator('.ab-chip').nth(1).click(); k1 = await box.locator('.ab-it').count()
        ok('tier filter narrows', 0 < k1 < n, k1)
        await box.locator('.ab-chip').nth(0).click(); await box.locator('.ab-q').fill('char')
        names = await box.locator('.ab-it .nm').all_inner_texts(); ok('search filters', len(names) >= 3 and all('char' in x.lower() for x in names), names)
        await box.locator('.ab-q').fill('')
        await pg.locator('.abtog').nth(1).scroll_into_view_if_needed(); await pg.wait_for_timeout(200)
        await pg.screenshot(path='/tmp/ab.png', clip={'x': 0, 'y': (await pg.locator('.abtog').nth(1).bounding_box())['y'] - 150, 'width': 1000, 'height': 700})
        await pg.locator('.abtog').nth(1).click(); ok('collapses again', await pg.locator('.ab-row').nth(1).is_hidden())
        ok('no page errors', not errs, errs[:2])
        await b.close()
    print('FAILED' if fails else 'ALL PASS'); sys.exit(1 if fails else 0)
asyncio.run(main())
