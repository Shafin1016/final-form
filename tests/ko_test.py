"""K.O. sequence with real cutscenes: attack -> death scene of the beaten rival -> empty stage during the banner ->
next rival leaps in. Run: python3 -m http.server 8765 &  then  python3 tests/ko_test.py   (takes ~40 s)"""
import asyncio, os, sys, time
from playwright.async_api import async_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765')
async def main():
    fails = []
    def ok(n, c, x=''): print(('  ok   ' if c else '  FAIL ') + n + (f'  ({x})' if x else '')); (None if c else fails.append(n))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1100, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/ff-config.js', lambda r: r.fulfill(content_type='text/javascript', body="window.FF_CONFIG={api:''};"))
        await pg.goto(BASE + '/index.html?set=' + ','.join(['op-strawhats'] * 7))
        await pg.wait_for_function("!document.getElementById('playDaily').disabled", timeout=120000)
        await pg.click('#playPractice'); await pg.wait_for_selector('#ans', state='visible', timeout=60000); await pg.wait_for_timeout(400)
        await pg.evaluate("__ff.state().rv = 1")
        await pg.fill('#ans', 'Nami'); await pg.press('#ans', 'Enter')
        seq = []; shots = 0; t0 = time.time()
        # rival drawn on the empty-stage backdrop: read it from the x iframe's canvas region is hard; instead record visible cut + banner
        while time.time() - t0 < 45:
            v = await pg.evaluate("(()=>{const f=[...document.querySelectorAll('.stage iframe.vis')].map(x=>x.dataset.id).join(',');const bn=document.getElementById('banner').classList.contains('on');const nb=getComputedStyle(document.getElementById('nextBtn')).display!=='none';return f+(bn?'+banner':'')+(nb?'+next':'')})()")
            if not seq or seq[-1] != v:
                seq.append(v)
                if shots < 12: await pg.screenshot(path=f'/tmp/ko_{shots:02d}_{v.replace(",","_").replace("+","-")}.png', clip={'x': 60, 'y': 80, 'width': 980, 'height': 560}); shots += 1
            if '+next' in v: break
            await asyncio.sleep(.05)
        print('  sequence:', ' -> '.join(seq))
        order = [s.split('+')[0] for s in seq]
        def idx(x): return next((i for i, s in enumerate(order) if s == x), -1)
        ok('death scene plays after the attack', 0 <= idx('e') < idx('k') or 0 <= idx('d') < idx('k') or 0 <= idx('e2') < idx('k') or 0 <= idx('d2') < idx('k'), str(order))
        ok('banner shows on the backdrop after the death scene', any(s.startswith('x+banner') for s in seq) and idx('k') < [i for i, s in enumerate(seq) if 'banner' in s][0])
        ok('next rival enters with the leap-in after the banner', idx('i') > idx('k') and order[-1] == 'x')
        ok('rival changed', (await pg.evaluate("__ff.state().rvN")) == 1)
        ok('no page errors', not errs, '; '.join(errs))
        await b.close()
    print('KO: all passed' if not fails else 'KO: FAILED'); sys.exit(1 if fails else 0)
asyncio.run(main())
