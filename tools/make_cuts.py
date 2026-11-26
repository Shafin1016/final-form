import re
SRC={'i':'intro.html','s':'index.html','a':'a.html','a2':'a2.html','b':'b.html','c':'c.html','d':'d.html','d2':'d2.html','e':'e.html','e2':'e2.html','x':'x.html','k':'k.html'}
HEAD="""<script>window.EMBED=/[?&]embed/.test(location.search);if(window.EMBED)document.documentElement.classList.add('embed')</script>
<style>.embed body{padding:0!important;background:#000!important;min-height:0!important;display:block!important;overflow:hidden}.embed h1,.embed .sub,.embed .nav,.embed .row,.embed .note,.embed .play{display:none!important}.embed .stage{max-width:none!important;border-radius:0!important;box-shadow:none!important}</style>
</head>"""
CTRL=r"""
if (window.EMBED) { const ID = new URLSearchParams(location.search).get('id'); window.__freeze = true; let watch = 0, live = false; window.__realT = () => realT;
  const done = () => { clearInterval(watch); if (!live) return; live = false; AUD.paused = true; window.__freeze = true; parent.postMessage({ ff: 'done', id: ID }, '*'); };
  addEventListener('message', e => { const m = e.data || {}; if (!m.ff) return;
    if (m.rival && window.__setRival) window.__setRival(m.rival);
    if (m.ff === 'play') { window.__pts = m.pts; AUD.currentTime = 0; AUD.paused = true; if (window.__at) { try { window.__at(0); } catch (e) { } } window.__freeze = false; live = true; start(); clearInterval(watch); watch = setInterval(() => { if (!playing) done(); }, 100); }
    else if (m.ff === 'clock') { AUD.currentTime = m.t; AUD.paused = !!m.paused; if (!m.paused && playing && realT - m.t > .2 && performance.now() - (window.__lastSeek || 0) > 600) { window.__lastSeek = performance.now(); parent.postMessage({ ff: 'seek', id: ID, t: realT }, '*'); } }
    else if (m.ff === 'warm') { if (!live && window.__at) { const was = window.__freeze; window.__freeze = true; try { window.__at(1.2); window.__at(0); } catch (e) { } window.__freeze = was; } }
    else if (m.ff === 'stop') { playing = false; done(); }
    else if (m.ff === 'still') { live = false; clearInterval(watch); window.__pts = null; window.__freeze = true; if (window.__at) window.__at(m.t || 0); } });
  parent.postMessage({ ff: 'ready', id: ID }, '*'); }
"""
PTS=r"""ctx.fillText(dmg, 0, 136); if (window.__pts != null && s > .5) { const n = Math.round(window.__pts * E.o(clamp((s - .55) / .55))); ctx.globalAlpha = a * clamp((s - .5) / .2); ctx.font = '800 44px Inter, sans-serif'; const pg = ctx.createLinearGradient(-70, 160, 70, 200); pg.addColorStop(0, '#ffffff'); pg.addColorStop(.5, col); pg.addColorStop(1, '#ffffff'); ctx.fillStyle = pg; ctx.fillText('+' + n, 0, 184); ctx.font = '600 10px Inter, sans-serif'; ctx.fillStyle = 'rgba(233,230,223,.75)'; ctx.fillText('P O I N T S', 0, 214); } ctx.restore(); }"""
for cid,fn in SRC.items():
    s=open(fn).read()
    s=s.replace("</head>",HEAD,1)
    a="const AUD = window.__aud = new Audio(); AUD.preload = 'auto'; AUD.setAttribute('playsinline', ''); let audReady = false, realT = 0;"
    assert a in s, (fn,'aud')
    s=s.replace(a,"const AUD = window.__aud = window.EMBED ? { currentTime: 0, paused: true, muted: false, playbackRate: 1, src: '', play() { return Promise.resolve(); }, pause() { this.paused = true; }, load() { } } : new Audio(); if (!window.EMBED) { AUD.preload = 'auto'; AUD.setAttribute('playsinline', ''); } let audReady = false, realT = 0;")
    a="renderSoundtrack().then(blob => { AUD.src = URL.createObjectURL(blob);"
    assert a in s, (fn,'rs')
    # in the game the soundtrack is pre-rendered to cut/snd/<id>.mp3 (no audio rendering on the player's device)
    s=s.replace(a,"if (window.EMBED) { audReady = true; const __id = new URLSearchParams(location.search).get('id'); parent.postMessage({ ff: 'audio', id: __id, url: new URL('snd/' + __id + '.mp3', location.href).href }, '*'); } else renderSoundtrack().then(blob => { AUD.src = URL.createObjectURL(blob);")
    a="const DPR = Math.min(2, devicePixelRatio || 1);"
    assert a in s, (fn,'dpr')
    # in the game, size canvases to the screen the cutscene is actually shown on (phones show it ~360px wide);
    # iOS Safari caps total canvas memory, and 11 full-size cutscenes can hit that cap, so a new rival never gets drawn
    s=s.replace(a,"const DPR = window.EMBED ? Math.min(1.5, Math.max(.75, (devicePixelRatio || 1) * Math.min(1, (innerWidth || (screen && screen.width) || 960) / 960))) : Math.min(2, devicePixelRatio || 1);")
    a="const vig = (() => { const c = document.createElement('canvas'); c.width = W * DPR; c.height = H * DPR; const g = c.getContext('2d'); g.scale(DPR, DPR);"
    assert a in s, (fn,'vig')
    s=s.replace(a,"const vig = (() => { const VD = window.EMBED ? Math.min(DPR, .5) : DPR; const c = document.createElement('canvas'); c.width = W * VD; c.height = H * VD; const g = c.getContext('2d'); g.scale(VD, VD);")
    # rival 'none' = an empty stage (between a rival's death and the next one's entrance)
    a="window.__setRival = k => { if (RIVALS[k] || k === 'red') RIVAL_KIND = k; };"
    assert a in s, (fn,'setRival')
    s=s.replace(a,"window.__setRival = k => { if (RIVALS[k] || k === 'red' || k === 'none') RIVAL_KIND = k; };")
    a="const fn = RIVALS[RIVAL_KIND]; if (!fn) return drawRivalOld(g, J, o);"
    assert a in s, (fn,'drawKind')
    s=s.replace(a,"if (RIVAL_KIND === 'none') return; const fn = RIVALS[RIVAL_KIND]; if (!fn) return drawRivalOld(g, J, o);")
    s=s.replace("[rJ.hip[0], 64, .55]]","[rJ.hip[0], 64, RIVAL_KIND === 'none' ? 0 : .55]]")
    i=s.index("const start = () => {"); j=s.index("\n",i)+1
    s=s[:j]+CTRL+s[j:]
    a="ctx.fillText(dmg, 0, 136); ctx.restore(); }"
    assert s.count(a)==1, (fn,'pts')
    s=s.replace(a,PTS)
    open(f'/home/claude/game/cut/{cid}.html','w').write(s)
    print('ok',cid)
