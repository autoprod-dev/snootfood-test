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

# Link preview (direction C, camera-first): a full-bleed plate, a yellow score stamp, the verdict on black
# bands, Chef Gerardo (disgusted, as a 4/10 deserves) in the corner. Rendered from the repo's own font and art.
OG_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: T; src: url(fonts/intertight.woff2); font-weight: 600 900; }
html, body { margin: 0; }
.og { position: relative; width: 1200px; height: 630px; overflow: hidden; background: #0b0b0b; color: #fff; font-family: T, system-ui, sans-serif; }
.photo { position: absolute; inset: 0 0 0 0; width: 760px; height: 630px; object-fit: cover; }
.fade { position: absolute; left: 520px; top: 0; width: 260px; height: 630px; background: linear-gradient(90deg, rgba(11,11,11,0), #0b0b0b); }
.stamp { position: absolute; left: 470px; top: 54px; width: 200px; height: 200px; border-radius: 50%; background: #ffe600; color: #0f0f0f; transform: rotate(-10deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 14px 30px rgba(0,0,0,.45); }
.stamp b { font: 900 120px/1 T; letter-spacing: -4px; } .stamp small { font: 900 34px/1 T; margin: 58px 0 0 2px; }
.verdict { position: absolute; left: 44px; bottom: 56px; margin: 0; font: 900 64px/1.18 T; letter-spacing: -1.5px; }
.verdict span { background: #0f0f0f; color: #fff; padding: 2px 16px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.pill { position: absolute; left: 44px; top: 44px; font: 900 26px/1 T; padding: 12px 18px; border-radius: 999px; background: rgba(0,0,0,.62); }
.pill i { font-style: normal; margin-left: 10px; font-size: 16px; background: #ffe600; color: #0f0f0f; padding: 4px 8px; border-radius: 6px; vertical-align: 4px; }
.copy { position: absolute; left: 790px; top: 56px; width: 380px; }
h1 { font: 900 54px/1.02 T; margin: 0 0 18px; letter-spacing: -1.5px; }
.sub { font: 700 24px/1.3 T; color: #d9d9d9; margin: 0 0 22px; }
.modes { display: flex; gap: 10px; }
.modes span { font: 800 20px/1 T; padding: 11px 16px; border-radius: 999px; background: #222; }
.modes span:first-child { background: #ffe600; color: #0f0f0f; }
.url { position: absolute; left: 790px; top: 330px; font: 700 18px/1 T; color: #9a9a9a; }
.chef { position: absolute; right: 24px; bottom: -4px; height: 270px; transform: scaleX(-1); filter: drop-shadow(0 16px 24px rgba(0,0,0,.6)); }
</style></head><body><div class="og">
<img class="photo" src="samples/beans.jpg" alt=""><div class="fade"></div>
<div class="pill">Snootfood__TAG__</div>
<div class="stamp"><b>4</b><small>/10</small></div>
<p class="verdict"><span>The beans won.</span></p>
<div class="copy">
  <h1>Show Chef Gerardo what you’re eating.</h1>
  <p class="sub">Snap it. Get judged. Beat a 4/10.</p>
  <div class="modes"><span>Roast</span><span>Menu</span><span>Fridge</span></div>
</div>
<p class="url">__URL__</p>
<img class="chef" src="img/chef-disgust.png" alt="">
</div></body></html>"""

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
        html = OG_HTML.replace("__URL__", app["shortUrl"]).replace("__TAG__", '<i>TEST</i>' if app.get("isTest") else "")
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
            sp.click(f"[data-sample={sample}]"); sp.wait_for_selector("#result[data-reveal=done]"); sp.wait_for_timeout(1400)
            sp.evaluate("document.querySelectorAll('.demo-banner, .demo-tag, #demoPill, .toast').forEach((e) => e.style.display = 'none')")   # store-style shots: no test chrome
            sp.evaluate("window.scrollTo(0, 0)" if scale > 1 else "window.scrollTo(0, 0)")
            sp.wait_for_timeout(300)
            out = root / "screenshots" / f"{name}.png"
            sp.screenshot(path=str(out))
            from PIL import Image
            Image.open(out).convert("RGB").quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(out, optimize=True)
            ctx.close()
    b.close()
print("ok", sorted(targets))
