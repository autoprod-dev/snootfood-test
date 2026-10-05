"""Render committed assets with Playwright (outputs are committed; re-run only when the art changes).

    python3 tools/render_assets.py                 # everything
    python3 tools/render_assets.py og              # og.png (1200×630 link preview)
    python3 tools/render_assets.py screenshots     # manifest screenshots (2 narrow 1080×1920 + 1 wide 1280×800)
    python3 tools/render_assets.py samples icons   # sample photos + PWA icons from tools/svg
"""
import functools, http.server, pathlib, socket, sys, threading
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
svg = root / "tools" / "svg"
chef = (svg / "chef.svg").read_text()
targets = set(sys.argv[1:]) or {"samples", "icons", "og", "screenshots"}

def icon_html(size, maskable=False):
    pad = 0.18 if maskable else 0.08
    return f"""<html><body style="margin:0"><div style="width:{size}px;height:{size}px;background:radial-gradient(circle at 50% 40%,#2a1f1a,#140e0b);display:flex;align-items:center;justify-content:center;{'' if maskable else 'border-radius:'+str(int(size*.22))+'px;'}overflow:hidden">
<div style="width:{size*(1-2*pad)}px;height:{size*(1-2*pad)}px;border-radius:50%;background:#f6efe1;box-shadow:0 0 0 {max(2,size//64)}px #c9a24a inset;display:flex;align-items:center;justify-content:center">
<div style="width:72%;height:86%">{chef.replace('width="200" height="240"','width="100%" height="100%"')}</div></div></div></body></html>"""

# Link preview: sassy Chef Gerardo + a sample plate stamped 4/10 + the pitch. Rendered from the repo's own fonts and art.
OG_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: P; src: url(fonts/playfair.woff2); font-weight: 400 900; }
@font-face { font-family: P; src: url(fonts/playfair-italic.woff2); font-style: italic; font-weight: 500; }
@font-face { font-family: C; src: url(fonts/caveat.woff2); font-weight: 600; }
html, body { margin: 0; }
.og { position: relative; width: 1200px; height: 630px; overflow: hidden; background: radial-gradient(ellipse at 62% 38%, rgba(200,40,30,.45), rgba(0,0,0,0) 62%), #16100e; color: #f3e9dc; font-family: P, Georgia, serif; }
.chef { position: absolute; left: 18px; bottom: -8px; height: 560px; filter: drop-shadow(0 18px 24px rgba(0,0,0,.5)); z-index: 3; }
.polaroid { position: absolute; left: 258px; top: 92px; width: 330px; height: 330px; padding: 16px 16px 54px; background: #f7f2ea; transform: rotate(-4deg); box-shadow: 0 24px 50px rgba(0,0,0,.6); }
.polaroid img { width: 330px; height: 330px; object-fit: cover; display: block; }
.polaroid figcaption { font: 600 30px/1 C, cursive; color: #2a1f1a; text-align: center; margin-top: 10px; }
.stamp { position: absolute; left: 492px; top: 246px; width: 170px; height: 170px; border-radius: 50%; background: #c8102e; transform: rotate(12deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 26px rgba(0,0,0,.45); z-index: 4; }
.stamp::before { content: ''; position: absolute; inset: 13px; border: 4px dashed #f7f2ea; border-radius: 50%; }
.stamp b { font: 800 82px/1 P; color: #fff; } .stamp small { font: 800 30px/1 P; color: #fff; margin: 34px 0 0 2px; }
.copy { position: absolute; left: 700px; top: 70px; width: 450px; }
.eyebrow { font: 800 20px/1 P; letter-spacing: .32em; color: #ff5a3c; margin: 0 0 18px; }
h1 { font: 800 60px/1.04 P; margin: 0 0 18px; color: #fff; letter-spacing: -.5px; }
.sub { font: italic 500 26px/1.35 P; color: #efe4d6; margin: 0 0 26px; }
.modes { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 30px; }
.modes span { font: 700 17px/1 P; padding: 9px 12px; border-radius: 999px; background: #2c2220; border: 1px solid #5b443a; }
.brand { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.brand b { font: 800 34px/1 P; } .brand small { flex-basis: 100%; font: 600 20px/1.3 P; color: #d8c9ba; }
.brand .tag { font: 800 14px/1 P; letter-spacing: .1em; background: #ffcf5a; color: #2a1f1a; padding: 6px 8px; border-radius: 6px; }
</style></head><body><div class="og">
<figure class="polaroid" style="margin:0"><img src="samples/noodles.jpg" alt=""><figcaption>instant noodles</figcaption></figure>
<div class="stamp"><b>4</b><small>/10</small></div>
<img class="chef" src="img/chef-gerardo-chef-roast.png" alt="">
<div class="copy">
  <p class="eyebrow">CHEF ROAST</p>
  <h1>Chef Gerardo will roast your dinner.</h1>
  <p class="sub">Snap any meal. Think your plate can beat a 4/10?</p>
  <div class="modes"><span>🍽️ Fancy Menu</span><span>🔥 Chef Roast</span><span>🧊 Fridge Chef</span></div>
  <div class="brand"><b>Snootfood</b>__TAG__<small>__URL__</small></div>
</div></div></body></html>"""

def serve():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Q, directory=str(root)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{port}/"

def app_config():
    import json, re, subprocess
    out = subprocess.run(["node", "--input-type=module", "-e", f"import {{ APP }} from '{(root / 'config.js').as_uri()}'; console.log(JSON.stringify(APP))"], capture_output=True, text=True, check=True).stdout
    return json.loads(out)

FORCE_DEMO = "localStorage.setItem('snootfood.settings.v1', JSON.stringify({forceDemo: true})); localStorage.setItem('snootfood.seen.v1', '1');"

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 900, "height": 900})
    if "samples" in targets:
        for name in ["noodles", "beans", "pie", "fridge"]:
            pg.goto((svg / f"{name}.svg").as_uri())
            pg.screenshot(path=str(root / "samples" / f"{name}.jpg"), type="jpeg", quality=82)
    if "icons" in targets:
        for size, fname, mask in [(192, "icon-192.png", False), (512, "icon-512.png", False), (512, "maskable-512.png", True), (180, "apple-touch-icon.png", True), (32, "favicon-32.png", False)]:
            pg.goto("about:blank"); pg.set_viewport_size({"width": size, "height": size})
            pg.set_content(icon_html(size, mask))
            pg.screenshot(path=str(root / "icons" / fname), omit_background=not mask)
    base = serve() if targets & {"og", "screenshots"} else None
    if "og" in targets:
        app = app_config()
        html = OG_HTML.replace("__URL__", app["shortUrl"]).replace("__TAG__", ' <span class="tag">TEST</span>' if app.get("isTest") else "")
        (root / "_og.html").write_text(html)
        try:
            pg.set_viewport_size({"width": 1200, "height": 630}); pg.goto(base + "_og.html"); pg.wait_for_load_state("networkidle")
            pg.evaluate("document.fonts.ready"); pg.wait_for_timeout(200)
            pg.screenshot(path=str(root / "og.png"), clip={"x": 0, "y": 0, "width": 1200, "height": 630})
            from PIL import Image   # keep it small: WhatsApp skips preview images over ~300 KB
            Image.open(root / "og.png").convert("RGB").quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(root / "og.png", optimize=True)
        finally:
            (root / "_og.html").unlink()
    if "screenshots" in targets:
        (root / "screenshots").mkdir(exist_ok=True)
        for name, mode, sample, vp, scale in [("narrow-roast", "roast", "beans", (360, 640), 3), ("narrow-menu", "menu", "noodles", (360, 640), 3), ("wide-roast", "roast", "pie", (1280, 800), 1)]:
            ctx = b.new_context(viewport={"width": vp[0], "height": vp[1]}, device_scale_factor=scale, is_mobile=scale > 1, has_touch=scale > 1)
            ctx.add_init_script(FORCE_DEMO)
            sp = ctx.new_page(); sp.goto(base + "#" + mode); sp.wait_for_load_state("networkidle")
            sp.click(f"[data-sample={sample}]"); sp.wait_for_selector("#panel:not([hidden])"); sp.wait_for_timeout(900)
            sp.evaluate("document.querySelectorAll('.demo-banner, .demo-tag, #demoPill, .toast').forEach((e) => e.style.display = 'none')")   # store-style shots: no test chrome
            sp.evaluate("document.querySelector('#photoWrap').scrollIntoView({block: 'start'}); window.scrollBy(0, -70)" if scale > 1 else "window.scrollTo(0, 0)")
            sp.wait_for_timeout(300)
            out = root / "screenshots" / f"{name}.png"
            sp.screenshot(path=str(out))
            from PIL import Image
            Image.open(out).convert("RGB").quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(out, optimize=True)
            ctx.close()
    b.close()
print("ok", sorted(targets))
