"""Render sample photos and PWA icons from the SVG sources (run once; outputs are committed)."""
import pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
svg = root / "tools" / "svg"
chef = (svg / "chef.svg").read_text()

def icon_html(size, maskable=False):
    pad = 0.18 if maskable else 0.08
    return f"""<html><body style="margin:0"><div style="width:{size}px;height:{size}px;background:radial-gradient(circle at 50% 40%,#2a1f1a,#140e0b);display:flex;align-items:center;justify-content:center;{'' if maskable else 'border-radius:'+str(int(size*.22))+'px;'}overflow:hidden">
<div style="width:{size*(1-2*pad)}px;height:{size*(1-2*pad)}px;border-radius:50%;background:#f6efe1;box-shadow:0 0 0 {max(2,size//64)}px #c9a24a inset;display:flex;align-items:center;justify-content:center">
<div style="width:72%;height:86%">{chef.replace('width="200" height="240"','width="100%" height="100%"')}</div></div></div></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 900, "height": 900})
    for name in ["noodles", "beans", "pie", "fridge"]:
        pg.goto((svg / f"{name}.svg").as_uri())
        pg.screenshot(path=str(root / "samples" / f"{name}.jpg"), type="jpeg", quality=82)
    for size, fname, mask in [(192, "icon-192.png", False), (512, "icon-512.png", False), (512, "maskable-512.png", True), (180, "apple-touch-icon.png", True), (32, "favicon-32.png", False)]:
        pg.goto("about:blank"); pg.set_viewport_size({"width": size, "height": size})
        pg.set_content(icon_html(size, mask))
        pg.screenshot(path=str(root / "icons" / fname), omit_background=not mask)
    b.close()
print("ok")
