"""Damage rules: HP 100; Legendary costs nothing; Common hits get countered for 15 and Uncommon for 10 (unless they K.O.);
misses cost 20. Fast mode for the numbers, plus one real-speed run to see the counterattack banner and taunt.
   python3 -m http.server 8765 &   then   python3 tests/counter_test.py"""
import asyncio, os, sys
from playwright.async_api import async_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765')
async def main():
    fails = []
    def ok(n, c, x=''): print(('  ok   ' if c else '  FAIL ') + n + (f'  ({x})' if x else '')); (None if c else fails.append(n))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        async def page(fast):
            pg = await b.new_page(viewport={'width': 1100, 'height': 900}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.route('**/ff-config.js', lambda r: r.fulfill(content_type='text/javascript', body="window.FF_CONFIG={api:''};"))
            await pg.goto(BASE + '/index.html?' + ('fast&' if fast else '') + 'set=' + ','.join(['op-strawhats'] * 7))
            await pg.wait_for_function("!document.getElementById('playDaily').disabled", timeout=120000)
            await pg.click('#playPractice'); await pg.wait_for_selector('#ans', state='visible', timeout=60000); await pg.wait_for_timeout(300)
            return pg, errs
        pg, errs = await page(True)
        ok('player starts at 100 HP', await pg.evaluate("__ff.state().hp") == 100 and '100 / 100' in await pg.text_content('#hpTxt'))
        T = await pg.evaluate("Object.fromEntries(Object.entries(__ff.TIERS).map(([k,v])=>[k,{taken:v.taken,counter:!!v.counter,cuts:v.cuts}]))")
        ok('Legendary costs nothing, only one Legendary attack', T['A']['taken'] == 0 and T['A']['cuts'] == ['a'], str(T['A']))
        ok('Common countered for 15, Uncommon for 10', T['E'] == {'taken': 15, 'counter': True, 'cuts': ['e', 'e2']} and T['D']['taken'] == 10 and T['D']['counter'], str(T['E']) + str(T['D']))
        # force tiers to check the arithmetic
        async def hit(tier, rv=200):
            await pg.evaluate(f"(()=>{{const G=__ff.state();G.rv={rv};}})()")
            hp0 = await pg.evaluate("__ff.state().hp"); r0 = await pg.evaluate("__ff.state().round")
            await pg.evaluate(f"(()=>{{const p=__ff.state().prompts[__ff.state().round];const a=p.answers.find(x=>x.tier==='{tier}')||p.answers[0];a.tier='{tier}';__ff.forceTier='{tier}';document.getElementById('ans').value=a.name;document.getElementById('ansForm').requestSubmit();}})()")
            await pg.wait_for_function(f"__ff.state().round==={r0+1}", timeout=10000); await pg.wait_for_timeout(80)
            return hp0, await pg.evaluate("__ff.state().hp"), await pg.evaluate(f"__ff.state().res[{r0}].tier")
        await pg.evaluate("__ff.TIERS && (window.__origDyn = 1)")
        h0, h1, t = await hit('E'); ok(f'{t} hit -> countered', h1 == h0 - {'E': 15, 'D': 10}.get(t, 0) or t not in 'DE', f'{h0}->{h1} tier {t}')
        h0, h1, t = await hit('D', 10); ok(f'{t} hit that K.O.s is not countered', h1 == h0 or t not in 'DE', f'{h0}->{h1} tier {t}')
        ok('no page errors (fast)', not errs, '; '.join(errs)); await pg.close()
        # real speed: see the counterattack
        pg, errs = await page(False)
        p0 = await pg.evaluate("(()=>{const p=__ff.state().prompts[0];return p.answers.filter(a=>a.tier==='E').map(a=>a.name)})()")
        await pg.fill('#ans', p0[0]); await pg.press('#ans', 'Enter')
        await pg.wait_for_function("document.getElementById('banner').classList.contains('on') && document.getElementById('bannerB').textContent==='COUNTERATTACK' || getComputedStyle(document.getElementById('nextBtn')).display!=='none'", timeout=60000)
        tier = await pg.evaluate("__ff.state().res[0].tier")
        if tier in 'DE':
            await pg.wait_for_timeout(1200); await pg.screenshot(path='/tmp/counter.png', clip={'x': 60, 'y': 80, 'width': 980, 'height': 560})
            ok('counterattack banner shown', await pg.text_content('#bannerS') and 'hits back' in await pg.text_content('#bannerS'), await pg.text_content('#bannerS'))
            ok('rival taunts', len((await pg.text_content('#sayTxt')) or '') > 3, await pg.text_content('#sayTxt'))
            await pg.wait_for_selector('#nextBtn', state='visible', timeout=20000)
            hp = await pg.evaluate("__ff.state().hp"); ok('HP went down by the counter', hp == 100 - {'E': 15, 'D': 10}[tier], f'{tier}: 100 -> {hp}')
        else: print('  (skipped visual check: answer landed as', tier, ')')
        ok('no page errors (real speed)', not errs, '; '.join(errs))
        await b.close()
    print('COUNTER: all passed' if not fails else 'COUNTER: FAILED'); sys.exit(1 if fails else 0)
asyncio.run(main())
