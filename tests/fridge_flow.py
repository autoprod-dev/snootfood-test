"""Fridge Chef real-photo path, with Gemini (and the relays) MOCKED. No key needed.

Usage: python3 tests/fridge_flow.py [BASE_URL]     (screenshots go to $SHOTS, default ./shots)
Covers: scan → editable checklist (tick/untick/edit/add/remove) → recipe from confirmed items only,
"Edit ingredients" round trip, photo quality warnings, errors (bad key, quota, network, blank photo,
empty fridge), and both relay protocols (Apps Script + Cloudflare Worker) with no key in the browser.
"""
import functools, http.server, io, json, os, pathlib, socket, sys, threading
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = pathlib.Path(os.environ.get('SHOTS', str(ROOT / 'shots'))); SHOTS.mkdir(parents=True, exist_ok=True)
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok))); print(('PASS ' if ok else 'FAIL ') + name + (f' — {detail}' if detail else ''), flush=True)

def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Q, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{port}/'

BASE = sys.argv[1] if len(sys.argv) > 1 else serve()
PHONE = dict(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
GEMINI = 'https://generativelanguage.googleapis.com/**'
SCAN = {'isFood': True, 'photoQuality': 'good', 'summary': 'Solid haul. The eggs are clearly in charge.', 'items': [
    {'name': 'eggs', 'quantity': 'about 6', 'confidence': 'high', 'note': ''},
    {'name': 'milk', 'quantity': '1 carton', 'confidence': 'high', 'note': ''},
    {'name': 'cheddar cheese', 'quantity': 'half a block', 'confidence': 'medium', 'note': 'label partly hidden'},
    {'name': 'tomatoes', 'quantity': '4', 'confidence': 'high', 'note': ''},
    {'name': 'butter', 'quantity': 'unknown', 'confidence': 'low', 'note': 'could be butter or cream cheese'},
    {'name': 'lettuce', 'quantity': '1 head', 'confidence': 'medium', 'note': 'back of the crisper'}]}
RECIPE = {'isFood': True, 'specialName': 'Spinach and Cheddar Victory Omelet', 'description': 'Fluffy eggs hugging melty cheddar and baby spinach. Brunch called, it wants this back.',
          'ingredients': ['eggs', 'cheddar cheese', 'baby spinach', 'bacon', 'salt'], 'steps': ['Whisk the eggs with salt.', 'Cook gently, add cheddar and spinach.', 'Fold and slide onto a plate.'], 'price': '$58', 'note': 'Spinach showed up last minute and stole the show.'}

def gemini_reply(payload):
    return json.dumps({'candidates': [{'content': {'parts': [{'text': json.dumps(payload)}]}, 'finishReason': 'STOP'}]})

def setup(ctx, pg, key=True):
    pg.goto(BASE); pg.wait_for_load_state('networkidle')
    if key:
        pg.evaluate("localStorage.setItem('snootfood.settings.v1', JSON.stringify({provider:'gemini', keys:{gemini:'TEST-KEY-not-real'}}))"); pg.reload(); pg.wait_for_load_state('networkidle')
    pg.click('.modes [data-mode=fridge]')

def upload(pg, color=(200, 200, 200), noise=True, size=(4032, 3024)):
    im = Image.new('RGB', size, color)
    if noise:
        for i in range(40): im.paste(((i * 53) % 255, (i * 91) % 255, (i * 17) % 255), ((i * 97) % (size[0] - 300), (i * 61) % (size[1] - 300), (i * 97) % (size[0] - 300) + 300, (i * 61) % (size[1] - 300) + 300))
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=90)
    pg.set_input_files('#uploadInput', files=[{'name': 'fridge.jpg', 'mimeType': 'image/jpeg', 'buffer': buf.getvalue()}])

with sync_playwright() as p:
    browser = p.chromium.launch()
    errs = []

    # ── 1. Happy path: scan → checklist → edit → recipe ──
    ctx = browser.new_context(**PHONE, accept_downloads=True)
    calls = []
    def handler(route, req):
        body = req.post_data_json; txt = json.dumps(body); calls.append(body)
        payload = SCAN if 'Scan these fridge contents' in txt else RECIPE
        route.fulfill(status=200, headers={'access-control-allow-origin': '*', 'content-type': 'application/json'}, body=gemini_reply(payload))
    ctx.route(GEMINI, handler)
    pg = ctx.new_page(); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text)); pg.on('pageerror', lambda e: errs.append(str(e)))
    setup(ctx, pg)
    upload(pg)
    pg.wait_for_selector('#checklist', timeout=10000); pg.wait_for_timeout(500)
    scan_req = calls[0]
    img = scan_req['contents'][0]['parts'][0]['inlineData']['data']
    from base64 import b64decode
    w, h = Image.open(io.BytesIO(b64decode(img))).size
    check('scan request: image sent, long edge 1600 px (4032×3024 upload)', (w, h) == (1600, 1200), f'{w}x{h}')
    check('scan request: under 2 MB', len(img) * 3 / 4 < 2 * 1024 * 1024, f'{len(img) * 3 / 4 / 1024:.0f} KB')
    gc = scan_req['generationConfig']
    check('scan request: structured JSON (responseMimeType + schema with confidence enum)', gc['responseMimeType'] == 'application/json' and gc['responseSchema']['properties']['items']['items']['properties']['confidence']['enum'] == ['high', 'medium', 'low'])
    check('scan request: low temperature for accuracy', gc['temperature'] <= 0.3, str(gc['temperature']))
    sysmsg = scan_req['systemInstruction']['parts'][0]['text']
    check('scan prompt: only clearly visible items, never invent', 'ONLY items that are clearly visible' in sysmsg and 'better to miss an item than to invent one' in sysmsg)
    names = pg.eval_on_selector_all('#checklist .ck-name', 'els => els.map(e => e.value)')
    checked = pg.eval_on_selector_all('#checklist .ck-check', 'els => els.map(e => e.checked)')
    check('checklist shows every detected item', names == [i['name'] for i in SCAN['items']], str(names))
    check('low-confidence item starts unticked, others ticked', checked == [True, True, True, True, False, True], str(checked))
    check('confidence badges + notes shown', pg.inner_text('#checklist li:nth-child(5) .ck-conf').lower() == 'not sure?' and 'cream cheese' in pg.inner_text('#checklist li:nth-child(5)'))
    check('cook button counts ticked items', '(5 items)' in pg.inner_text('#cookBtn'), pg.inner_text('#cookBtn'))
    pg.screenshot(path=str(SHOTS / 'mobile-fridge-checklist.png'), full_page=True)
    # edit: untick milk, rename lettuce → baby spinach, remove tomatoes, add "hot sauce"
    pg.uncheck('#checklist li:nth-child(2) .ck-check')
    pg.fill('#checklist li:nth-child(6) .ck-name', 'baby spinach')
    pg.click('#checklist li:nth-child(4) .ck-del')
    pg.fill('#ckAddInput', 'hot sauce'); pg.press('#ckAddInput', 'Enter')
    check('add / remove / untick update the count', '(4 items)' in pg.inner_text('#cookBtn'), pg.inner_text('#cookBtn'))
    pg.screenshot(path=str(SHOTS / 'mobile-fridge-checklist-edited.png'), full_page=True)
    overflow = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
    check('checklist fits 390 px (no horizontal scroll)', overflow <= 0, str(overflow))
    pg.click('#cookBtn')
    pg.wait_for_selector('#panel.fridge:not(.checklist):not([hidden])', timeout=10000); pg.wait_for_timeout(500)
    rec_req = calls[-1]; rtxt = json.dumps(rec_req)
    check('recipe request is text-only (no photo re-sent)', 'inlineData' not in rtxt)
    conf_block = rec_req['contents'][0]['parts'][0]['text']
    conf_block = conf_block[conf_block.find('Confirmed ingredients'):conf_block.find('Give it')]
    check('recipe prompt has exactly the confirmed items', all(x in conf_block for x in ['eggs (about 6)', 'cheddar cheese (half a block)', 'baby spinach (1 head)', 'hot sauce']) and not any(x in conf_block for x in ['milk', 'tomatoes', 'butter', 'lettuce']), conf_block)
    text = pg.inner_text('#panel')
    check('recipe rendered, step 2 label, no demo banner', 'Spinach and Cheddar Victory Omelet' in text and 'STEP 2 OF 2' in text.upper() and 'demo result' not in text.lower())
    check('invented ingredient (bacon) filtered out of the recipe', 'bacon' not in pg.inner_text('#panel .ingr').lower(), pg.inner_text('#panel .ingr'))
    pg.screenshot(path=str(SHOTS / 'mobile-fridge-ai-recipe.png'), full_page=True)
    with pg.expect_download() as d: pg.click('#shareBtn')
    d.value.save_as(SHOTS / 'card-fridge-ai.png')
    check('share card still works for AI recipe', Image.open(SHOTS / 'card-fridge-ai.png').size == (1080, 1350))
    pg.click('#editBtn'); pg.wait_for_selector('#checklist')
    check('"Edit ingredients" goes back to the checklist with edits kept', 'baby spinach' in pg.eval_on_selector_all('#checklist .ck-name', 'els => els.map(e => e.value)'))
    n_calls = len(calls)
    pg.click('#cookBtn'); pg.wait_for_selector('#panel.fridge:not(.checklist):not([hidden])'); pg.click('#againBtn'); pg.wait_for_timeout(800)
    check('"Ask again" re-runs only the recipe (no re-scan)', len(calls) == n_calls + 2 and all('inlineData' not in json.dumps(c) for c in calls[n_calls:]))
    ctx.close()

    # ── 2. Quality warnings + empty fridge + manual entry ──
    for quality, items, needle in [('blurry', SCAN['items'][:2], 'blurry'), ('dark', SCAN['items'][:2], 'dark in there'), ('no_food', [], 'couldn’t spot any food')]:
        ctx = browser.new_context(**PHONE)
        def make(q, it):
            return lambda r: r.fulfill(status=200, headers={'access-control-allow-origin': '*', 'content-type': 'application/json'}, body=gemini_reply({'isFood': bool(it), 'photoQuality': q, 'items': it}))
        ctx.route(GEMINI, make(quality, items))
        pg = ctx.new_page(); setup(ctx, pg); upload(pg); pg.wait_for_selector('#ckAdd', timeout=10000); pg.wait_for_timeout(300)
        check(f'photo quality "{quality}" → friendly warning', needle in pg.inner_text('#panel'), pg.inner_text('.ck-warning') if pg.is_visible('.ck-warning') else '')
        if quality == 'blurry': pg.screenshot(path=str(SHOTS / 'mobile-fridge-checklist-blurry.png'), full_page=True)
        if quality == 'no_food':
            check('empty scan → cook button disabled until something is added', pg.is_disabled('#cookBtn'))
            pg.fill('#ckAddInput', 'eggs'); pg.click('#ckAdd button')
            check('typing an ingredient enables cooking', not pg.is_disabled('#cookBtn'))
        ctx.close()

    # ── 3. Errors ──
    def err_case(label, route_fn, needle, key=True, photo=None):
        ctx = browser.new_context(**PHONE)
        if route_fn: ctx.route(GEMINI, route_fn)
        pg = ctx.new_page(); setup(ctx, pg, key=key)
        upload(pg, **(photo or {}))
        pg.wait_for_selector('#error:not([hidden])', timeout=10000)
        msg = pg.inner_text('#error')
        check(f'error: {label}', needle in msg, msg[:120])
        return ctx, pg
    ctx, pg = err_case('bad key', lambda r: r.fulfill(status=400, headers={'access-control-allow-origin': '*'}, body='{"error":{"message":"API key not valid. Please pass a valid API key."}}'), 'key didn’t work'); ctx.close()
    ctx, pg = err_case('quota (429)', lambda r: r.fulfill(status=429, headers={'access-control-allow-origin': '*'}, body='{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'), 'quota'); ctx.close()
    ctx, pg = err_case('network down', lambda r: r.abort('internetdisconnected'), 'Can’t reach the AI')
    check('error offers demo + "type my ingredients" fallbacks', pg.is_visible('#error button') and pg.is_visible('#typeInsteadBtn'))
    pg.click('#typeInsteadBtn'); pg.wait_for_selector('#ckAdd')
    check('"type my ingredients" opens an empty manual checklist', 'What’ve you got?' in pg.inner_text('#panel'))
    ctx.close()
    ctx, pg = err_case('blank / pitch-black photo caught before sending', None, 'pitch black', photo={'color': (0, 0, 0), 'noise': False})
    pg.screenshot(path=str(SHOTS / 'mobile-fridge-error-blank.png'), full_page=True); ctx.close()

    # ── 4. Relays: no key in the browser ──
    def with_relay(ctx, url):
        def cfg(route):
            body = route.fetch().text().replace("relayUrl: '',", f"relayUrl: '{url}',")
            route.fulfill(status=200, headers={'content-type': 'text/javascript'}, body=body)
        ctx.route('**/config.js', cfg)
    # Apps Script: POST text/plain to /exec → 302 → googleusercontent → JSON {ok, data}
    ctx = browser.new_context(**PHONE)
    with_relay(ctx, 'https://script.google.com/macros/s/TESTDEPLOYMENT/exec')
    gas = []
    # (Playwright can't route redirect hops, so the 302 hop itself is tested for real in section 5.)
    def gas_exec(route, req):
        gas.append({'ct': req.headers.get('content-type'), 'body': json.loads(req.post_data), 'method': req.method})
        payload = SCAN if 'Scan these fridge contents' in req.post_data else RECIPE
        out = {'ok': True, 'model': 'gemini-2.5-flash', 'data': json.loads(gemini_reply(payload))}
        route.fulfill(status=200, headers={'access-control-allow-origin': '*', 'content-type': 'application/json'}, body=json.dumps(out))
    ctx.route('https://script.google.com/**', gas_exec)
    hit_gemini = []
    ctx.route(GEMINI, lambda r: (hit_gemini.append(1), r.abort()))
    pg = ctx.new_page(); pg.on('console', lambda m: m.type == 'error' and errs.append('gas: ' + m.text)); setup(ctx, pg, key=False)
    check('relay configured → demo pill hidden (no key needed)', not pg.is_visible('#demoPill'))
    upload(pg); pg.wait_for_selector('#checklist', timeout=10000)
    first = gas[0]
    check('apps script: POST text/plain (no preflight) with model, request, clientId, no key', first['method'] == 'POST' and first['ct'].startswith('text/plain') and first['body']['model'] == 'gemini-2.5-flash' and 'contents' in first['body']['request'] and len(first['body']['clientId']) >= 8 and sorted(first['body']) == ['clientId', 'model', 'request', 'v'] and 'TEST-KEY' not in json.dumps(first['body']) and 'AIza' not in json.dumps(first['body']), str(sorted(first['body'])))
    pg.click('#cookBtn'); pg.wait_for_selector('#panel.fridge:not(.checklist):not([hidden])', timeout=10000)
    check('apps script: checklist → recipe works through the relay, Gemini never called directly', 'Victory Omelet' in pg.inner_text('#panel') and not hit_gemini)
    ctx.close()
    ctx = browser.new_context(**PHONE)
    with_relay(ctx, 'https://script.google.com/macros/s/TESTDEPLOYMENT/exec')
    ctx.route('https://script.google.com/**', lambda r: r.fulfill(status=200, headers={'access-control-allow-origin': '*', 'content-type': 'application/json'}, body=json.dumps({'ok': False, 'error': {'code': 'quota', 'message': 'That’s the daily limit for real photo reading. Come back tomorrow, or grab a demo result.'}})))
    pg = ctx.new_page(); setup(ctx, pg, key=False); upload(pg); pg.wait_for_selector('#error:not([hidden])', timeout=10000)
    check('apps script: friendly relay error shown as-is', 'daily limit' in pg.inner_text('#error'))
    ctx.close()
    # Cloudflare Worker
    ctx = browser.new_context(**PHONE)
    with_relay(ctx, 'https://snootfood-relay.example.workers.dev')
    wk = []
    def worker(route, req):
        wk.append({'url': req.url, 'headers': req.headers}); txt = req.post_data
        payload = SCAN if 'Scan these fridge contents' in txt else RECIPE
        route.fulfill(status=200, headers={'access-control-allow-origin': '*', 'content-type': 'application/json'}, body=gemini_reply(payload))
    ctx.route('https://snootfood-relay.example.workers.dev/**', worker)
    pg = ctx.new_page(); setup(ctx, pg, key=False); upload(pg); pg.wait_for_selector('#checklist', timeout=10000)
    check('worker: Gemini-shaped path, no key header, Referer carries page path', wk[0]['url'].endswith('/v1beta/models/gemini-2.5-flash:generateContent') and 'x-goog-api-key' not in wk[0]['headers'] and wk[0]['headers'].get('referer', '').startswith(BASE.rstrip('/')), str(wk[0]['headers'].get('referer')))
    ctx.close()

    # ── 5. Apps Script-style redirect, for real: POST text/plain → 302 to another origin → JSON ──
    hits = {'options': 0, 'post': 0, 'get': 0}
    class Exec(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def do_OPTIONS(self): hits['options'] += 1; self.send_response(405); self.end_headers()
        def do_POST(self):
            hits['post'] += 1; n = int(self.headers.get('content-length', 0)); hits['body'] = json.loads(self.rfile.read(n)); hits['ct'] = self.headers.get('content-type')
            self.send_response(302); self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Location', f'http://localhost:{echo_port}/macros/echo?user_content_key=abc'); self.end_headers()  # Apps Script's 302 carries ACAO: *
    class Echo(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def do_GET(self):
            hits['get'] += 1; out = json.dumps({'ok': True, 'data': {'echo': hits['body']['model']}}).encode()
            self.send_response(200); self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(out))); self.end_headers(); self.wfile.write(out)
    def start(h):
        srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), h); threading.Thread(target=srv.serve_forever, daemon=True).start(); return srv.server_address[1]
    exec_port, echo_port = start(Exec), start(Echo)
    ctx = browser.new_context(bypass_csp=True)   # the real CSP allows script.google.com / script.googleusercontent.com
    pg = ctx.new_page(); pg.goto(BASE)
    out = pg.evaluate("""async (url) => { const m = await import('./ai.js'); return m.postAppsScript(url, { v: 1, model: 'gemini-2.5-flash', request: {}, clientId: 'abcdef123456' }); }""", f'http://127.0.0.1:{exec_port}/macros/s/X/exec')
    check('apps script redirect: fetch follows the 302 cross-origin and reads JSON', out == {'echo': 'gemini-2.5-flash'}, str(out))
    check('apps script redirect: no CORS preflight (text/plain simple request)', hits['options'] == 0 and hits['post'] == 1 and hits['get'] == 1 and hits['ct'].startswith('text/plain'), str(hits))
    ctx.close()

    check('no console errors / page errors', not errs, ' | '.join(errs)[:400])
    browser.close()

failed = [r for r in results if not r[1]]
print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
