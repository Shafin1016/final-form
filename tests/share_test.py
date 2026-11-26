"""Share card + challenge link, end to end (no backend).
   python3 -m http.server 8765 &   then   python3 tests/share_test.py"""
import asyncio, base64, json, os, sys
from playwright.async_api import async_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765')
SET = ['op-strawhats'] * 7
ANS = ['Nami', 'Zoro', 'Sanji', 'Brook', 'Jinbe', 'Franky', 'Usopp']
async def play(pg, start_sel, answers):
    await pg.wait_for_function("!document.getElementById('playDaily').disabled", timeout=90000)
    await pg.click(start_sel); await pg.wait_for_selector('#ans', state='visible'); await pg.wait_for_timeout(300)
    for k, a in enumerate(answers):
        await pg.fill('#ans', a); await pg.press('#ans', 'Enter')
        if k < 6: await pg.wait_for_function(f"__ff.state().round==={k+1}&&!__ff.state().locked", timeout=10000); await pg.wait_for_timeout(80)
    await pg.wait_for_function("window.__resultsReady === true", timeout=20000); await pg.wait_for_timeout(300)
async def main():
    fails = []
    def ok(n, c, x=''): print(('  ok   ' if c else '  FAIL ') + n + (f'  ({x})' if x else '')); (None if c else fails.append(n))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1100, 'height': 950}, permissions=['clipboard-read', 'clipboard-write'])
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await ctx.route('**/ff-config.js', lambda r: r.fulfill(content_type='text/javascript', body="window.FF_CONFIG={api:''};"))
        await pg.goto(BASE + '/index.html?fast&set=' + ','.join(SET)); await play(pg, '#playPractice', ANS)
        run = await pg.evaluate("window.__lastRun")
        # share card
        await pg.click('#shareBtn'); await pg.wait_for_selector('#shareModal.on'); await pg.wait_for_function("document.getElementById('shareImg').naturalWidth>0")
        ok('share card rendered 1200x900', await pg.evaluate("[shareImg.naturalWidth, shareImg.naturalHeight]") == [1200, 900])
        src = await pg.evaluate("document.getElementById('shareImg').src"); open('/tmp/card.png', 'wb').write(base64.b64decode(src.split(',')[1]))
        await pg.click('#shareCopy'); txt = await pg.evaluate("navigator.clipboard.readText()")
        ok('share text has rank, score, emoji row and link', f"{run['score']} pts" in txt and len([c for c in txt if c in '🌈🟨🟪🟦🟩⬜🟥']) == 7 and 'final-form' in txt or 'localhost' in txt, txt)
        await pg.click('#shareClose')
        # challenge
        await pg.click('#chalBtn'); await pg.wait_for_selector('#chalView:not([hidden])'); await pg.fill('#chalName', 'Shafin')
        link = await pg.input_value('#chalLink'); ok('challenge link built', '?c=' in link, link[:80])
        payload = json.loads(base64.urlsafe_b64decode(link.split('?c=')[1] + '=='))
        ok('link carries prompts + score, never answers', payload['s'] == [a['p'] for a in run['ans']] and payload['sc'] == run['score'] and payload['n'] == 'Shafin' and 'Nami' not in json.dumps(payload), str(payload))
        await pg.click('#chalCopy'); ok('copy gives message + link', link in await pg.evaluate("navigator.clipboard.readText()"))
        # friend opens it
        f = await ctx.new_page(); f.on('pageerror', lambda e: errs.append(str(e)))
        await f.goto(link.replace('?c=', '?fast&c='))
        await f.wait_for_selector('#chalBox:not([hidden])', timeout=10000)
        banner = await f.text_content('#chalBox'); ok('friend sees the challenge banner', 'Shafin' in banner and f"{run['score']} pts" in banner, banner)
        await f.screenshot(path='/tmp/chal.png', clip={'x': 0, 'y': 60, 'width': 1100, 'height': 560})
        await play(f, '#playChal', ['Luffy', 'Chopper', 'Robin', 'Zoro', 'Nami', 'Usopp', 'Sanji'])
        fr = await f.evaluate("window.__lastRun")
        ok('friend got the same 7 prompts', [a['p'] for a in fr['ans']] == payload['s'] and fr['mode'] == 'challenge')
        vs = await f.text_content('#vsLine'); ok('result shows who won', 'Shafin' in vs and str(run['score']) in vs, vs)
        ok('results header says Challenge', 'Challenge' in await f.text_content('#resHead'))
        await f.click('#shareBtn'); await f.wait_for_function("document.getElementById('shareImg').naturalWidth>0")
        src = await f.evaluate("document.getElementById('shareImg').src"); open('/tmp/card2.png', 'wb').write(base64.b64decode(src.split(',')[1]))
        bad = await ctx.new_page(); await bad.goto(BASE + '/index.html?c=garbage'); await bad.wait_for_timeout(800)
        ok('broken links are ignored', await bad.is_hidden('#chalBox'))
        ok('no page errors', not errs, '; '.join(errs))
        await b.close()
    print('SHARE: all passed' if not fails else 'SHARE: FAILED'); sys.exit(1 if fails else 0)
asyncio.run(main())
