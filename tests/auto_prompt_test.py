"""An AI-written prompt scheduled for a day (prompts-auto.js) takes its level's slot that day only.
   python3 -m http.server 8765 &   then   python3 tests/auto_prompt_test.py"""
import asyncio, os, sys, json
from playwright.async_api import async_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765')
async def main():
    fails = []
    def ok(n, c, x=''): print(('  ok   ' if c else '  FAIL ') + n + (f'  ({x})' if x else '')); (None if c else fails.append(n))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        ctx = await b.new_context(); pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await ctx.route('**/ff-config.js', lambda r: r.fulfill(content_type='text/javascript', body="window.FF_CONFIG={api:''};"))
        await pg.goto(BASE + '/index.html'); await pg.wait_for_function("!document.getElementById('playDaily').disabled", timeout=90000)
        day = await pg.evaluate("__ff.DAY"); before = await pg.evaluate("[__ff.DAY, __ff.DAY+1].map(d => __ff.dailySet(d).map(p => p.id))")
        auto = {'id': f'auto-{day}-3', 'day': day, 'lvl': 3, 'open': True, 'cat': 'Anime', 'src': 'Any series', 'q': 'Name a test prompt', 'a': '\nE Alpha | a1\nS Beta', 'auto': True}
        js = "window.FF_PROMPTS.push(...[" + json.dumps(auto) + "]);"
        await ctx.route('**/prompts-auto.js', lambda r: r.fulfill(content_type='text/javascript', body=js))
        await pg.goto(BASE + '/index.html'); await pg.wait_for_function("!document.getElementById('playDaily').disabled", timeout=90000)
        after = await pg.evaluate("[__ff.DAY, __ff.DAY+1].map(d => __ff.dailySet(d).map(p => p.id))")
        ok('today: round 3 is the AI prompt', after[0][2] == auto['id'], after[0])
        ok('today: other rounds unchanged', [x for i, x in enumerate(after[0]) if i != 2] == [x for i, x in enumerate(before[0]) if i != 2])
        ok('tomorrow unchanged', after[1] == before[1])
        ok('answers parsed (alias works)', await pg.evaluate(f"(() => {{ const p = __ff.PROMPTS.find(x => x.id === '{auto['id']}'); return p.keys.get('a1').name; }})()") == 'Alpha')
        ok('no page errors', not errs, errs[:2])
        await b.close()
    print('FAILED' if fails else 'ALL PASS'); sys.exit(1 if fails else 0)
asyncio.run(main())
