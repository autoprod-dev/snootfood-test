"""Chef Gerardo art: white background -> true alpha, trimmed, 512 px tall WebP (alpha) + PNG fallback.
Usage: python3 tools/chef-art/cutout.py /path/to/originals   (needs opencv-python, numpy, Pillow; originals are never modified)
Background = flood fill of near-white from the top/left/right edges (so white inside the hat and jacket stays),
soft 2 px edge with the white un-mixed (no halos), stray bits from neighbouring art dropped, faded hems closed."""
import cv2, numpy as np, json, sys, pathlib
from PIL import Image
SRC = (sys.argv[1] if len(sys.argv) > 1 else '.').rstrip('/') + '/'   # folder with the original white-background PNGs
OUT = pathlib.Path(__file__).resolve().parents[2] / 'img'
JOBS = {'fancy-menu': {'drop_edges': ''},
        'chef-roast': {'drop_edges': 'tr', 'fade': (80, 305, 575, 606, 622, 87, 294)},
        'fridge-chef': {'drop_edges': '', 'fade': (26, 230, 588, 604, 622, 35, 221)}}
T, N0, MARGIN = 24, 6, 10
info = {}
for name, job in JOBS.items():
    rgb = np.asarray(Image.open(SRC + f'chef-gerardo-{name}.png').convert('RGB')).astype(np.float32)
    H, W, _ = rgb.shape
    d = 255 - rgb.min(2)
    light = (d < T).astype(np.uint8)
    fade = job.get('fade'); hem = {}
    if fade:   # the jacket hem fades into white in the art: extend the side outlines down and close the bottom
        xl, xr, ya, ys_, ye, L, R = fade
        for y in range(ya, ye + 1):
            idx = np.where(d[y, xl:xr + 1] >= 40)[0]
            if len(idx) >= 2 and idx[-1] - idx[0] > (xr - xl) * 0.6:   # follow the outline only while it stays roughly vertical
                if abs(xl + idx[0] - L) <= 3: L = xl + idx[0]
                if abs(xl + idx[-1] - R) <= 3: R = xl + idx[-1]
            hem[y] = (L, R)
            light[y, L:L + 2] = 0; light[y, R - 1:R + 1] = 0
        light[ye - 1:ye + 1, L:R + 1] = 0
    n, lab, st, _ = cv2.connectedComponentsWithStats(light, connectivity=4)
    seeds = set(np.unique(np.concatenate([lab[0], lab[:, 0], lab[:, -1]]))) - {0}   # top/left/right only (fancy runs off the bottom)
    seeds |= {l for l in np.unique(lab[-1]) if l and st[l, cv2.CC_STAT_AREA] > 0 and (lab[-1] == l).sum() and l in seeds}
    bg = np.isin(lab, list(seeds)) & (light == 1)
    fg = (~bg).astype(np.uint8)
    m, flab, fst, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
    comps = []
    for i in range(1, m):
        x, y, w, h, a = fst[i]
        if a < 12: bg[flab == i] = True; continue      # specks
        edges = ('t' if y == 0 else '') + ('b' if y + h == H else '') + ('l' if x == 0 else '') + ('r' if x + w == W else '')
        drop = (bool(edges) and any(e in job['drop_edges'] for e in edges)) or (bool(edges) and a < 60)
        comps.append(dict(i=i, area=int(a), x=int(x), y=int(y), w=int(w), h=int(h), edges=edges, dropped=drop))
    # small bits (e.g. light-bulb rays) sitting next to a dropped neighbour belong to it: drop them too
    for c in comps:
        if not c['dropped'] and c['area'] < 300 and any(o['dropped'] and o['area'] >= 60 and c['x'] < o['x'] + o['w'] + 25 and o['x'] < c['x'] + c['w'] + 25 and c['y'] < o['y'] + o['h'] + 25 and o['y'] < c['y'] + c['h'] + 25 for o in comps):
            c['dropped'] = True
    for c in comps:
        if c['dropped']: bg[flab == c['i']] = True
    if fade:
        L, R = hem[ye]
        bg[ye + 1:, L:R + 1] = True
    fg = ~bg
    # soft alpha: interior opaque; within 2 px of the background, alpha from how far the pixel is from white,
    # relative to the darkest nearby pixel (the outline), then un-mix the white so no halo is left.
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    near_bg = cv2.dilate(bg.astype(np.uint8), k) > 0
    near_fg = cv2.dilate(fg.astype(np.uint8), k) > 0
    band = near_bg & near_fg
    dmax = cv2.dilate(d, np.ones((5, 5), np.uint8))
    a_band = np.clip((d - N0) / np.maximum(dmax - N0, 1), 0, 1)
    alpha = np.where(fg, 1.0, 0.0)
    alpha = np.where(band, np.where(fg, np.maximum(a_band, 0.0), a_band), alpha)
    alpha = np.where(band & fg & (d >= T), np.maximum(alpha, a_band), alpha)
    # un-mix white: c = a*F + (1-a)*255  ->  F = (c - (1-a)*255)/a
    if fade:
        xl, xr, ya, ys_, ye = fade[:5]
        ramp = np.clip((ye - np.arange(H)) / (ye - ys_), 0, 1)[:, None]
        cols = np.zeros(W, bool); cols[xl:xr + 1] = True
        alpha = np.where(cols[None, :] & (np.arange(H)[:, None] >= ys_), alpha * ramp, alpha)
    a3 = alpha[..., None]
    F = np.where(a3 > 0.01, (rgb - (1 - a3) * 255) / np.maximum(a3, 0.01), 0)
    F = np.clip(F, 0, 255)
    rgba = np.dstack([F, alpha * 255]).round().astype(np.uint8)
    ys, xs = np.where(rgba[..., 3] > 8)
    y0, y1, x0, x1 = max(ys.min() - MARGIN, 0), min(ys.max() + 1 + MARGIN, H), max(xs.min() - MARGIN, 0), min(xs.max() + 1 + MARGIN, W)
    im = Image.fromarray(rgba[y0:y1, x0:x1], 'RGBA')
    h = 512; w = round(im.width * h / im.height)
    sm = im.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')   # premultiplied resize: no dark/white fringes
    sm.save(OUT / f'chef-gerardo-{name}.webp', 'WEBP', quality=85, method=6, alpha_quality=90)
    sm.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(OUT / f'chef-gerardo-{name}.png', optimize=True)
    info[name] = dict(src=(W, H), trimmed=im.size, box=(int(x0), int(y0), int(x1), int(y1)), comps=comps)
print(json.dumps(info, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)))
