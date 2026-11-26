"""The game with no backend configured (ff-config.js api: '') must behave exactly as before:
unknown answers are instant misses, no network calls, scores saved on the device.
   (cd .. && python3 -m http.server 8765) &   then   python3 tests/offline_test.py"""
import asyncio, os, sys
from playwright.async_api import async_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765')
async def main():
    fails = []
    def ok(n, c, x=''): print(('  ok   ' if c else '  FAIL ') + n + (f'  ({x})' if x else '')); (None if c else fails.append(n))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        pg = await b.new_page(); errs = []; net = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('request', lambda r: net.append(r.url) if not r.url.startswith(BASE) and 'fonts.g' not in r.url else None)
        await pg.goto(BASE + '/index.html?fast&set=consoles,consoles,consoles,consoles,consoles,consoles,consoles')
        await pg.wait_for_function("!document.getElementById('playDaily').disabled", timeout=90000)
        await pg.click('#playPractice'); await pg.wait_for_selector('#ans', state='visible'); await pg.wait_for_timeout(300)
        await pg.fill('#ans', 'Bandai Playdia'); await pg.press('#ans', 'Enter'); await pg.wait_for_timeout(100)
        ok('unknown answer is an instant miss', await pg.evaluate("__ff.state().strikes") == 1)
        for k, a in enumerate(['PlayStation 2', 'Xbox', 'GameCube', 'Sega Saturn', 'Wii', 'Game Boy', 'Nintendo 64']):
            await pg.fill('#ans', a); await pg.press('#ans', 'Enter')
            if k < 6: await pg.wait_for_function(f"__ff.state().round==={k+1}&&!__ff.state().locked", timeout=10000); await pg.wait_for_timeout(80)
        await pg.wait_for_function("window.__resultsReady === true", timeout=20000)
        ok('results shown, saved on device', 'device' in (await pg.text_content('#foot')))
        ok('no outside network calls', not net, ', '.join(net)); ok('no page errors', not errs, '; '.join(errs))
        await b.close()
    print('OFFLINE: all passed' if not fails else 'OFFLINE: FAILED'); sys.exit(1 if fails else 0)
asyncio.run(main())
