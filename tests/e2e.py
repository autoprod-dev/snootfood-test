"""End-to-end checks for Snootfood (Playwright + Chromium, headless).

Usage:  python3 tests/e2e.py [BASE_URL]
Without BASE_URL a local static server is started on a free port.
Writes screenshots and share-card PNGs to $SHOTS (default ./shots).
Real AI providers are NOT called: their HTTP responses are mocked with each provider's documented response shape.
"""
import base64, http.server, io, json, os, socket, sys, threading, functools, pathlib
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = pathlib.Path(os.environ.get('SHOTS', str(ROOT / 'shots'))); SHOTS.mkdir(parents=True, exist_ok=True)
AXE = os.environ.get('AXE', '/tmp/axe.min.js')
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail)); print(('PASS ' if ok else 'FAIL ') + name + (f' — {detail}' if detail else ''), flush=True)

def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Q, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{port}/'

BASE = sys.argv[1] if len(sys.argv) > 1 else serve()
BASE_HOST = urlparse(BASE).netloc
PHONE = dict(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
DESKTOP = dict(viewport={'width': 1280, 'height': 860})

def instrument(ctx, label):
    errs, hosts = [], []
    ctx.on('request', lambda r: hosts.append(urlparse(r.url).netloc or urlparse(r.url).scheme))
    def page_hook(pg):
        pg.on('console', lambda m: m.type == 'error' and errs.append(f'{label}: {m.text}'))
        pg.on('pageerror', lambda e: errs.append(f'{label}: {e}'))
    ctx.on('page', page_hook)
    return errs, hosts

# The deployed config points at the real relay. Demo-mode checks force demo via the app's own
# "Always use demo mode" setting so they never spend real AI quota.
FORCE_DEMO = "try { if (!localStorage.getItem('snootfood.settings.v1')) localStorage.setItem('snootfood.settings.v1', JSON.stringify({forceDemo: true})) } catch (e) {}"

def card_dims(path):
    from PIL import Image
    with Image.open(path) as im: return im.size

AGE_OK = "try { localStorage.setItem('snootfood.age.v1', 'yes') } catch (e) {}"

def upload_sample(pg, sample):
    # Same pixels as the sample, but uploaded as the user's own photo (samples never use real AI).
    pg.set_input_files('#uploadInput', str(ROOT / 'samples' / f'{sample}.jpg'))

def run_mode(pg, mode, sample, shot=None, card=None, story=False, upload=False):
    if pg.is_visible('#newBtn'): pg.click('#newBtn')
    pg.click(f'.modes [data-mode={mode}]')
    if upload: upload_sample(pg, sample)
    else: pg.click(f'[data-sample={sample}]')
    pg.wait_for_selector('#panel:not([hidden])', timeout=10000)
    if pg.is_visible('#cookBtn'):   # Fridge Chef with real AI: confirm the checklist first
        pg.click('#cookBtn'); pg.wait_for_selector('#panel.fridge:not(.checklist):not([hidden])', timeout=10000)
    pg.wait_for_timeout(600)
    text = pg.inner_text('#panel')
    if story: pg.check('input[name=cardSize][value=story]')
    if shot: pg.screenshot(path=str(SHOTS / shot), full_page=True)
    with pg.expect_download(timeout=15000) as d: pg.click('#shareBtn')
    out = SHOTS / (card or f'_tmp-{mode}.png'); d.value.save_as(out)
    if story: pg.check('input[name=cardSize][value=post]')
    return text, out

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ── 1. Phone, demo mode, every mode + share cards ──
    ctx = browser.new_context(**PHONE, accept_downloads=True); ctx.add_init_script(FORCE_DEMO)
    errs, hosts = instrument(ctx, 'phone')
    pg = ctx.new_page()
    pg.goto(BASE); pg.wait_for_load_state('networkidle')
    check('title has (TEST)', '(TEST)' in pg.title(), pg.title())
    check('noindex meta present', 'noindex' in (pg.get_attribute('meta[name=robots]', 'content') or ''))
    check('demo pill visible without key', pg.is_visible('#demoPill'))
    pg.screenshot(path=str(SHOTS / 'phone-1-home.png'), full_page=True)
    intro = {}
    for m in ('menu', 'roast', 'fridge'):
        pg.click(f'.modes [data-mode={m}]'); pg.wait_for_function("() => { const i = document.querySelector('#introChef'); return i.complete && i.naturalWidth > 0; }")
        intro[m] = pg.evaluate("() => { const i = document.querySelector('#introChef'); return [i.alt, i.currentSrc.split('/').pop(), i.getBoundingClientRect().height]; }")
    check('home: chef art swaps per mode (snooty / sassy / excited), fixed height, alt text', intro['menu'][0].endswith('snooty') and intro['roast'][0].endswith('sassy') and intro['fridge'][0].endswith('excited') and 'fancy-menu' in intro['menu'][1] and 'chef-roast' in intro['roast'][1] and all(v[2] > 100 for v in intro.values()), str(intro))
    pg.click('.modes [data-mode=menu]')
    expect = {'menu': ('noodles', 'CHEF’S NOTES'), 'roast': ('beans', '/10'), 'fridge': ('fridge', 'Made with:')}
    for mode, (sample, marker) in expect.items():
        text, card = run_mode(pg, mode, sample, shot=f'phone-{ {"menu":2,"roast":3,"fridge":4}[mode] }-{mode}.png', card=f'card-{mode}.png')
        check(f'{mode}: demo result rendered', marker in text and 'DEMO' in text, text[:70].replace('\n', ' '))
        check(f'{mode}: demo banner says it is not a read of the photo', 'demo result' in text.lower() and ('not a read of your photo' in text or 'not what’s in your fridge' in text))
        check(f'{mode}: share card PNG 1080x1350', card_dims(card) == (1080, 1350), str(card_dims(card)))
        if mode == 'roast': check('roast: signed by Chef Gerardo', '— Chef Gerardo' in text, text[-120:].replace('\n', ' '))
        sign = pg.evaluate("() => { const i = document.querySelector('#panel .sign-chef img'); return i && [i.complete && i.naturalWidth > 0, i.alt, i.getAttribute('width'), i.getAttribute('height'), i.currentSrc]; }")
        mood = {'menu': 'snooty', 'roast': 'sassy', 'fridge': 'excited'}[mode]
        check(f'{mode}: result shows Chef Gerardo ({mood}) art, loaded, with alt + size', bool(sign) and sign[0] and sign[1] == f'Chef Gerardo, looking {mood}' and sign[2] and sign[3], str(sign))
    text, card = run_mode(pg, 'roast', 'pie', card='card-roast-story.png', story=True)
    check('story-size card 1080x1920', card_dims(card) == (1080, 1920), str(card_dims(card)))
    # variety: "Another take" changes the result for an uploaded (non-sample) photo
    from PIL import Image
    big = io.BytesIO(); Image.new('RGB', (3000, 2000), (60, 140, 50)).save(big, 'JPEG'); big.seek(0)
    pg.click('#newBtn'); pg.click('.modes [data-mode=menu]')
    pg.set_input_files('#uploadInput', files=[{'name': 'salad.jpg', 'mimeType': 'image/jpeg', 'buffer': big.getvalue()}])
    pg.wait_for_selector('#panel:not([hidden])'); first = pg.inner_text('#panel h2')
    seen = {first}
    for _ in range(3):
        pg.click('#againBtn'); pg.wait_for_selector('#panel:not([hidden])'); pg.wait_for_timeout(100); seen.add(pg.inner_text('#panel h2'))
    check('upload works + green photo gets a green-tone dish', any(w in first for w in ('Garden', 'Salad')), first)
    check('"Another take" gives varied results', len(seen) >= 2, ' | '.join(seen))
    nat = pg.evaluate("() => { const i = document.querySelector('#photo'); return [i.naturalWidth, i.naturalHeight]; }")
    check('upload resized client-side (≤1600 px, no upscaling)', max(nat) <= 1600, str(nat))
    # keyboard tabs
    pg.click('#newBtn'); pg.focus('#tab-menu'); pg.keyboard.press('ArrowRight')
    check('arrow keys move between mode tabs', pg.get_attribute('#tab-roast', 'aria-selected') == 'true')
    # settings screenshot
    pg.click('#settingsBtn'); pg.wait_for_selector('#settings[open]'); pg.wait_for_timeout(400)
    pg.screenshot(path=str(SHOTS / 'phone-5-settings.png'))
    check('settings has free-key link', pg.get_attribute('#keyLink', 'href') == 'https://aistudio.google.com/apikey')
    pg.keyboard.press('Escape')
    check('phone demo: no network outside the site', set(hosts) <= {BASE_HOST, 'data', 'blob'}, str(sorted(set(hosts))))
    ctx.close()

    # ── 2. Desktop ──
    ctx = browser.new_context(**DESKTOP, accept_downloads=True); ctx.add_init_script(FORCE_DEMO)
    derrs, dhosts = instrument(ctx, 'desktop')
    pg = ctx.new_page(); pg.goto(BASE); pg.wait_for_load_state('networkidle')
    pg.screenshot(path=str(SHOTS / 'desktop-1-home.png'))
    for mode, (sample, marker) in expect.items():
        text, _ = run_mode(pg, mode, sample, shot=f'desktop-2-{mode}.png' if mode == 'roast' else None)
        check(f'desktop {mode}: rendered', marker in text)
    check('desktop demo: no network outside the site', set(dhosts) <= {BASE_HOST, 'data', 'blob'}, str(sorted(set(dhosts))))
    errs += derrs
    ctx.close()

    # ── 3. PWA: manifest, installability, offline shell ──
    ctx = browser.new_context(**PHONE, accept_downloads=True); ctx.add_init_script(FORCE_DEMO)
    perrs, _ = instrument(ctx, 'pwa')
    pg = ctx.new_page(); pg.goto(BASE); pg.wait_for_load_state('networkidle')
    pg.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true)", timeout=15000)
    pg.reload(); pg.wait_for_load_state('networkidle')
    check('service worker controls page', pg.evaluate('!!navigator.serviceWorker.controller'))
    cdp = ctx.new_cdp_session(pg)
    man = cdp.send('Page.getAppManifest')
    errors = man.get('errors', [])
    check('manifest parses without errors', not errors, json.dumps(errors)[:200])
    inst = cdp.send('Page.getInstallabilityErrors')['installabilityErrors']
    check('Chromium reports installable (no installability errors)', not inst, json.dumps(inst)[:300])
    check('iOS meta tags present', pg.evaluate("""() => ['apple-mobile-web-app-capable','apple-mobile-web-app-title','apple-mobile-web-app-status-bar-style'].every(n => document.querySelector(`meta[name=${n}]`)) && !!document.querySelector('link[rel=apple-touch-icon]')"""))
    ctx.set_offline(True)
    pg.goto(BASE + '?source=pwa'); pg.wait_for_selector('#sampleList button', timeout=10000)
    check('offline: app shell loads', 'Snootfood' in pg.inner_text('header'))
    text, card = run_mode(pg, 'menu', 'pie')
    check('offline: demo mode + share card work', 'CHEF’S NOTES' in text and card_dims(card) == (1080, 1350))
    ctx.set_offline(False)
    errs += perrs
    ctx.close()

    # ── 4. Key set: requests go ONLY to the chosen provider (responses mocked) ──
    def mock_payload(mode):
        return {
            'menu': {'isFood': True, 'dishName': 'Mock Soufflé de Test', 'description': 'A mocked description.', 'chefNotes': 'Mock notes.', 'price': '$999', 'pairing': 'Mock cordial', 'spotted': ['pie']},
            'roast': {'isFood': True, 'score': 12, 'headline': 'Mock headline', 'roast': 'Mock roast, damn.', 'compliment': 'Mock compliment', 'fix': 'Mock fix'},
            'scan': {'isFood': True, 'photoQuality': 'good', 'summary': 'Mock haul', 'items': [{'name': 'eggs', 'quantity': 'about 6', 'confidence': 'high'}]},
            'fridge': {'isFood': True, 'specialName': 'Mock Special', 'description': 'Mock.', 'ingredients': ['eggs'], 'steps': ['a', 'b', 'c'], 'price': '$1', 'note': 'n'},
        }[mode]
    shapes = {
        'gemini': ('generativelanguage.googleapis.com', lambda t: {'candidates': [{'content': {'parts': [{'text': t}]}, 'finishReason': 'STOP'}]}),
        'openrouter': ('openrouter.ai', lambda t: {'choices': [{'message': {'role': 'assistant', 'content': '```json\n' + t + '\n```'}}]}),
        'openai': ('api.openai.com', lambda t: {'choices': [{'message': {'role': 'assistant', 'content': t}}]}),
        'anthropic': ('api.anthropic.com', lambda t: {'content': [{'type': 'text', 'text': t}]}),
    }
    for prov, (host, shape) in shapes.items():
        ctx = browser.new_context(**PHONE, accept_downloads=True); ctx.add_init_script(AGE_OK)
        kerrs, khosts = instrument(ctx, prov)
        captured = []
        def handler(route, req, shape=shape):
            body = req.post_data_json; captured.append((req.url, req.headers, body))
            txt = json.dumps(body)
            mode = 'roast' if 'Rate the plating' in txt else 'scan' if 'Scan these fridge contents' in txt else 'fridge' if 'Confirmed ingredients' in txt else 'menu'
            route.fulfill(status=200, headers={'access-control-allow-origin': '*', 'content-type': 'application/json'}, body=json.dumps(shape(json.dumps(mock_payload(mode)))))
        ctx.route(f'https://{host}/**', handler)
        pg = ctx.new_page(); pg.goto(BASE); pg.wait_for_load_state('networkidle')
        if prov == 'gemini':   # set the key through the real settings UI
            pg.click('#settingsBtn'); pg.select_option('#provider', 'gemini'); pg.fill('#apiKey', 'TEST-KEY-not-real'); pg.click('#saveSettings')
        else:
            pg.evaluate(f"localStorage.setItem('snootfood.settings.v1', JSON.stringify({{provider:'{prov}', keys:{{{prov}:'TEST-KEY-not-real'}}, models:{{}}}}))"); pg.reload()
        check(f'{prov}: demo pill hidden once key set', not pg.is_visible('#demoPill'))
        for mode, sample in [('menu', 'pie'), ('roast', 'beans'), ('fridge', 'fridge')]:
            text, card = run_mode(pg, mode, sample, card=f'_tmp-{prov}-{mode}.png', upload=True)
            check(f'{prov} {mode}: mocked AI result rendered', 'Mock' in text and 'DEMO' not in text, text[:60].replace('\n', ' '))
            if mode == 'roast': check(f'{prov}: score clamped to 10 and PG filter applied', '10/10' in text.replace('\n', '') and 'damn' not in text)
        url, headers, body = captured[0]
        check(f'{prov}: key not in URL', 'TEST-KEY' not in url)
        if prov == 'gemini':
            img_b64 = body['contents'][0]['parts'][0]['inlineData']['data']
            from PIL import Image as I
            w, h = I.open(io.BytesIO(base64.b64decode(img_b64))).size
            check('gemini: request shape (x-goog-api-key header, JSON schema, model)', headers.get('x-goog-api-key') == 'TEST-KEY-not-real' and body['generationConfig']['responseMimeType'] == 'application/json' and 'gemini-3.5-flash-lite' in url, url)
            check('gemini: image resized before sending (≤1024 px)', max(w, h) <= 1024, f'{w}x{h}')
        if prov == 'anthropic':
            check('anthropic: browser-access header sent', headers.get('anthropic-dangerous-direct-browser-access') == 'true')
        allowed = {BASE_HOST, host, 'data', 'blob'}
        check(f'{prov}: network only to site + {host}', set(khosts) <= allowed, str(sorted(set(khosts))))
        errs += kerrs
        ctx.close()

    # ── 5. Provider error path (429) shows friendly message + demo fallback ──
    ctx = browser.new_context(**PHONE); ctx.add_init_script(AGE_OK)
    pg = ctx.new_page()
    ctx.route('https://generativelanguage.googleapis.com/**', lambda r: r.fulfill(status=429, headers={'access-control-allow-origin': '*'}, body='{"error":{"code":429}}'))
    pg.goto(BASE); pg.evaluate("localStorage.setItem('snootfood.settings.v1', JSON.stringify({provider:'gemini', keys:{gemini:'X'}}))"); pg.reload()
    upload_sample(pg, 'noodles'); pg.wait_for_selector('#error:not([hidden])')
    t1 = pg.inner_text('#error'); pg.wait_for_timeout(2100); t2 = pg.inner_text('#error')
    check('429 → "Kitchen’s slammed" countdown that ticks down', 'trying again in' in t1 and t1 != t2, f'{t1[:50]} → {t2[:50]}')
    pg.click('#demoNowBtn'); pg.wait_for_selector('#panel:not([hidden])')
    check('error → demo fallback works', 'DEMO' in pg.inner_text('#panel'))
    ctx.close()

    # ── 6. Accessibility (axe-core, test-only injection) ──
    if os.path.exists(AXE):
        ctx = browser.new_context(**PHONE, bypass_csp=True); ctx.add_init_script(FORCE_DEMO)
        pg = ctx.new_page(); pg.goto(BASE); pg.wait_for_load_state('networkidle')
        axe = open(AXE).read()
        def audit(label):
            pg.add_script_tag(content=axe)
            v = pg.evaluate("async () => (await axe.run(document, {runOnly: ['wcag2a','wcag2aa']})).violations.map(v => v.id + ':' + v.impact + ':' + v.nodes.length)")
            check(f'axe WCAG A/AA: {label}', not v, ', '.join(v))
        audit('home')
        for mode, (sample, _) in expect.items():
            pg.click(f'.modes [data-mode={mode}]') if not pg.is_visible('#newBtn') else (pg.click('#newBtn'), pg.click(f'.modes [data-mode={mode}]'))
            pg.click(f'[data-sample={sample}]'); pg.wait_for_selector('#panel:not([hidden])'); pg.wait_for_timeout(800)
            audit(mode)
        ctx.close()

    # ── 7. Live CORS smoke test against the REAL Gemini endpoint with a fake key (no quota used) ──
    if os.environ.get('LIVE_CORS', '1') == '1':
        ctx = browser.new_context(**PHONE)
        ctx.add_init_script(AGE_OK); pg = ctx.new_page(); pg.goto(BASE)
        pg.evaluate("localStorage.setItem('snootfood.settings.v1', JSON.stringify({provider:'gemini', keys:{gemini:'AIzaFAKE-not-a-real-key'}}))"); pg.reload()
        upload_sample(pg, 'noodles'); pg.wait_for_selector('#error:not([hidden])', timeout=20000)
        msg = pg.inner_text('#error')
        check('live Gemini from browser: CORS allowed, fake key rejected with friendly message', 'key didn’t work' in msg, msg[:90])
        ctx.close()

    # ── 8. QW1: demo-first, 18+ check, budget, quota (relay MOCKED: nothing reaches Google) ──
    def relay_ctx(reply=None):
        ctx = browser.new_context(**PHONE, accept_downloads=True)
        calls = []
        def gas(route, req):
            calls.append(req.post_data or '')
            txt = req.post_data or ''
            mode = 'roast' if 'Rate the plating' in txt else 'scan' if 'Scan these fridge contents' in txt else 'fridge' if 'Confirmed ingredients' in txt else 'menu'
            out = reply or {'ok': True, 'model': 'gemini-flash-latest', 'data': shapes['gemini'][1](json.dumps(mock_payload(mode)))}
            route.fulfill(status=200, headers={'access-control-allow-origin': '*', 'content-type': 'application/json'}, body=json.dumps(out))
        ctx.route('https://script.google.com/**', gas)
        ctx.route('https://script.googleusercontent.com/**', gas)
        ctx.route('https://generativelanguage.googleapis.com/**', lambda r: (calls.append('DIRECT'), r.abort()))
        qerrs, _ = instrument(ctx, 'qw1')
        return ctx, calls, qerrs
    ctx, calls, qerrs = relay_ctx()
    pg = ctx.new_page(); pg.goto(BASE); pg.wait_for_load_state('networkidle')
    check('teaser: first load shows a roast teaser (score, headline, CTA) with no AI call', pg.is_visible('#teaser') and '/10' in pg.inner_text('#teaser') and 'Now roast yours' in pg.inner_text('#teaser') and not calls)
    pg.screenshot(path=str(SHOTS / 'qw1-teaser.png'))
    for sample in ('noodles', 'beans', 'fridge'):
        if pg.is_visible('#newBtn'): pg.click('#newBtn')
        pg.click(f'[data-sample={sample}]'); pg.wait_for_selector('#panel:not([hidden])')
    check('samples never call the relay (always demo), even with real AI on', not calls and 'DEMO' in pg.inner_text('#panel'), str(len(calls)))
    pg.click('#newBtn'); pg.click('.modes [data-mode=roast]'); upload_sample(pg, 'beans')
    pg.wait_for_selector('#ageGate[open]', timeout=5000)
    check('18+ dialog appears before the first real call (nothing sent yet)', pg.is_visible('#ageGate') and not calls and 'Google Gemini' in pg.inner_text('#ageGate'))
    pg.screenshot(path=str(SHOTS / 'qw1-age-gate.png'))
    pg.click('#ageYes'); pg.wait_for_selector('#panel.roast:not([hidden])')
    check('after "Yes": one real call, AI result shown', len(calls) == 1 and 'Mock headline' in pg.inner_text('#panel'), str(len(calls)))
    pg.click('.modes [data-mode=menu]'); pg.wait_for_selector('#panel.menu:not([hidden])'); pg.wait_for_timeout(300)
    check('tab switch after an AI result: no new call, demo take + "real take" button', len(calls) == 1 and 'DEMO' in pg.inner_text('#panel') and 'uses 1 of today’s 2' in pg.inner_text('#runNote'), pg.inner_text('#runNote'))
    pg.click('#realTakeBtn'); pg.wait_for_selector('#panel.menu:not([hidden])'); pg.wait_for_function("() => document.querySelector('#panel').innerText.includes('Mock Soufflé')")
    check('"Get Chef’s real take" spends exactly one call, no second 18+ prompt', len(calls) == 2 and not pg.is_visible('#ageGate'), str(len(calls)))
    pg.click('#againBtn'); pg.wait_for_function("() => !document.querySelector('#panel').hidden && document.querySelector('#panel').innerText.includes('Mock')")
    check('budget: 3rd real call allowed', len(calls) == 3, str(len(calls)))
    pg.click('#newBtn'); pg.click('.modes [data-mode=roast]'); upload_sample(pg, 'pie'); pg.wait_for_selector('#panel:not([hidden])')
    check('budget used up → demo take + "Fresh reads at …" note, no call', len(calls) == 3 and 'DEMO' in pg.inner_text('#panel') and 'Fresh reads at' in pg.inner_text('#runNote'), pg.inner_text('#runNote'))
    used = pg.evaluate("JSON.parse(localStorage.getItem('snootfood.budget.v1'))")
    check('spend counted per successful call, keyed by Pacific day', used['used'] == 3 and len(used['day']) == 10, str(used))
    errs += qerrs; ctx.close()

    ctx, calls, qerrs = relay_ctx({'ok': False, 'error': {'code': 'quota', 'message': 'That’s the daily limit for real photo reading. Come back tomorrow, or grab a demo result.'}})
    ctx.add_init_script(AGE_OK)
    pg = ctx.new_page(); pg.goto(BASE); pg.wait_for_load_state('networkidle')
    pg.click('.modes [data-mode=roast]'); upload_sample(pg, 'beans'); pg.wait_for_selector('#panel:not([hidden])')
    check('daily limit reply → kitchen closed banner + demo take straight away', pg.is_visible('#kitchenBanner') and 'off duty' in pg.inner_text('#runNote') and 'DEMO' in pg.inner_text('#panel') and len(calls) == 1)
    pg.screenshot(path=str(SHOTS / 'qw1-kitchen-closed.png'))
    pg.click('#newBtn'); upload_sample(pg, 'pie'); pg.wait_for_selector('#panel:not([hidden])'); pg.reload(); pg.wait_for_load_state('networkidle')
    check('kitchen stays closed for the rest of the Pacific day (no more calls, banner on reload)', len(calls) == 1 and pg.is_visible('#kitchenBanner'), str(len(calls)))
    errs += qerrs; ctx.close()

    ctx, calls, qerrs = relay_ctx()
    pg = ctx.new_page(); pg.goto(BASE); pg.wait_for_load_state('networkidle')
    upload_sample(pg, 'noodles'); pg.wait_for_selector('#ageGate[open]'); pg.click('#ageNo'); pg.wait_for_selector('#panel:not([hidden])')
    check('18+ "No" → demo mode on, nothing sent, demo pill back', not calls and 'DEMO' in pg.inner_text('#panel') and pg.is_visible('#demoPill') and pg.evaluate("JSON.parse(localStorage.getItem('snootfood.settings.v1')).forceDemo === true"))
    pg.reload(); pg.wait_for_load_state('networkidle')
    check('teaser only on the very first load', not pg.is_visible('#teaser'))
    errs += qerrs; ctx.close()

    # ── 9. QW2: one-tap share (Web Share mocked; demo only) ──
    SHARE_MOCK = '''window.__shares = []; window.__shareMode = 'ok';
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d) => !!(d && d.files && d.files.length) });
      Object.defineProperty(navigator, 'share', { configurable: true, value: (d) => { window.__shares.push({ files: (d.files || []).map((f) => f.name), title: d.title, text: d.text, keys: Object.keys(d).sort() });
        return window.__shareMode === 'ok' ? Promise.resolve() : Promise.reject(new DOMException('mock', window.__shareMode)); } });'''
    def share_ctx(**extra):
        c = browser.new_context(**{**PHONE, **extra}, accept_downloads=True); c.add_init_script(FORCE_DEMO); c.add_init_script(SHARE_MOCK)
        c.grant_permissions(['clipboard-read', 'clipboard-write'], origin=BASE.rstrip('/'))
        e, _ = instrument(c, 'share'); return c, e
    ctx, serrs = share_ctx()
    pg = ctx.new_page(); pg.goto(BASE); pg.wait_for_load_state('networkidle')
    downloads = []; pg.on('download', lambda d: downloads.append(d))
    pg.click('.modes [data-mode=menu]'); pg.click('[data-sample=noodles]'); pg.wait_for_selector('#panel:not([hidden])')
    pg.wait_for_function("() => document.querySelector('#shareBtn span').textContent === 'Share'", timeout=5000)
    check('share button says "Share" when files can be shared', pg.inner_text('#shareBtn span') == 'Share')
    pg.click('#shareBtn'); pg.wait_for_function("() => window.__shares.length === 1"); pg.wait_for_timeout(300)
    sh = pg.evaluate('window.__shares[0]'); clip = pg.evaluate('navigator.clipboard.readText()')
    check('share: card file + caption with link and #ChefGerardo #SnootfoodChallenge #FancyMenu', len(sh['files']) == 1 and sh['title'] == 'Snootfood' and '#ChefGerardo #SnootfoodChallenge #FancyMenu' in sh['text'] and 'autoprod-dev.github.io/snootfood-test/' in sh['text'] and 'Get your dinner a fancy menu' in sh['text'], str(sh))
    check('share: caption copied to clipboard + "Caption copied" note', clip == sh['text'] and 'Caption copied' in pg.inner_text('#shareNote'), pg.inner_text('#shareNote'))
    pg.screenshot(path=str(SHOTS / 'qw2-share-caption-note.png'))
    for mode_, want in (('AbortError', 0), ('InvalidStateError', 0), ('NotAllowedError', 1)):
        n0 = len(downloads); pg.evaluate(f"window.__shareMode = '{mode_}'"); pg.click('#shareBtn'); pg.wait_for_timeout(700)
        check(f'share: {mode_} → {"download fallback" if want else "ignored, no download"}', len(downloads) - n0 == want, str(len(downloads) - n0))
    pg.evaluate("window.__shareMode = 'ok'; window.__shares = []")
    pg.evaluate("() => { document.querySelector('input[name=cardSize][value=story]').click(); document.querySelector('#shareBtn').click(); }")
    check('share tapped before the card is ready → "One sec…", nothing awaited in the tap', 'One sec' in pg.inner_text('#shareNote') and pg.evaluate('window.__shares.length') == 0)
    pg.wait_for_function("() => document.querySelector('#shareNote').textContent.includes('Tap Share again')", timeout=8000)
    pg.click('#shareBtn'); pg.wait_for_function("() => window.__shares.length === 1")
    check('…second tap shares the story card', len(pg.evaluate('window.__shares[0].files')) == 1)
    pg.click('#newBtn'); pg.click('.modes [data-mode=roast]'); pg.click('[data-sample=beans]'); pg.wait_for_selector('#panel:not([hidden])'); pg.wait_for_timeout(800)
    pg.evaluate("window.__shares = []"); pg.click('#shareBtn'); pg.wait_for_function("() => window.__shares.length === 1")
    t = pg.evaluate('window.__shares[0].text')
    check('roast caption: score, American copy, #RateMyPlate', '/10 😤 Think your plate can beat it?' in t and '#RateMyPlate' in t and 'Reckon' not in t and 'mate' not in t.lower().replace('#ratemyplate', ''), t)
    errs += serrs; ctx.close()
    ctx, serrs = share_ctx(user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')
    pg = ctx.new_page(); pg.goto(BASE); pg.wait_for_load_state('networkidle')
    pg.click('[data-sample=noodles]'); pg.wait_for_selector('#panel:not([hidden])'); pg.wait_for_timeout(800); pg.click('#shareBtn'); pg.wait_for_function("() => window.__shares.length === 1")
    check('iOS: shares the file only (caption goes via clipboard)', pg.evaluate('window.__shares[0].keys') == ['files'], str(pg.evaluate('window.__shares[0]')))
    errs += serrs; ctx.close()
    ctx = browser.new_context(**PHONE); ctx.add_init_script(FORCE_DEMO); pg = ctx.new_page(); pg.goto(BASE); pg.wait_for_load_state('networkidle')
    pg.click('[data-sample=noodles]'); pg.wait_for_selector('#panel:not([hidden])'); pg.wait_for_timeout(800)
    check('no Web Share (desktop Linux Chromium) → button says "Save image"', pg.inner_text('#shareBtn span') == 'Save image', pg.inner_text('#shareBtn span'))
    ctx.close()

    check('no console errors / page errors', not errs, ' | '.join(errs)[:500])
    browser.close()

for f in SHOTS.glob('_tmp-*.png'): f.unlink()
failed = [r for r in results if not r[1]]
print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
