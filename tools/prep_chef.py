"""Prepare the final Chef Gerardo art for the app (re-run when new art lands).

    python3 tools/prep_chef.py /path/to/final        # reads chef-gerardo-<name>.png, writes img/chef-<expr>.{webp,png}

The sources were cut out with a flood fill: hard 1-bit alpha with a light fringe from the old white
background. This pass erodes the alpha 1 px, un-mattes the outer ring against white (so leftover light
pixels go see-through instead of glowing on dark bands), anti-aliases the edge, trims, and writes a
WebP (q86) plus a 256-colour PNG fallback. chefs-kiss keeps its glow: no erosion, and its pale outer
ring is turned into a soft fade instead of being cut away.
"""
import pathlib, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/snootfood-chef/final')
NAMES = {'judging': 'judging', 'disgust': 'disgust', 'faint': 'faint', 'shocked': 'shocked', 'slow-clap': 'slow-clap', 'chefs-kiss': 'chefs-kiss'}

def shift_or(m):
    o = m.copy(); o[1:] |= m[:-1]; o[:-1] |= m[1:]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]; return o

def erode(m): return ~shift_or(~m)

def fill_outside(rgb, inside, rounds=6):
    """Bleed edge colours outward so the anti-aliased rim never picks up the old white."""
    rgb = rgb.copy(); have = inside.copy()
    for _ in range(rounds):
        acc = np.zeros(rgb.shape, float); n = np.zeros(have.shape, float)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            h = np.roll(have, (dy, dx), (0, 1)); c = np.roll(rgb, (dy, dx), (0, 1))
            acc += c * h[..., None]; n += h
        new = (~have) & (n > 0)
        rgb[new] = acc[new] / n[new][:, None]; have |= new
    return rgb

def drop_edge_scraps(alpha):
    """Remove small pieces that touch the border: slivers of the neighbouring pose from the sheet cut."""
    from collections import deque
    m = alpha > 127; h, w = m.shape; seen = np.zeros_like(m); total = m.sum()
    for y0, x0 in zip(*np.nonzero(m)):
        if seen[y0, x0]: continue
        q, comp, edge = deque([(y0, x0)]), [], False; seen[y0, x0] = True
        while q:
            y, x = q.popleft(); comp.append((y, x))
            if y in (0, h - 1) or x in (0, w - 1): edge = True
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not seen[yy, xx]: seen[yy, xx] = True; q.append((yy, xx))
        if edge and len(comp) < 0.03 * total:
            ys, xs = zip(*comp); alpha[list(ys), list(xs)] = 0
    return alpha

def prep(src, glow=False):
    im = np.array(Image.open(src).convert('RGBA')).astype(float)
    im[..., 3] = drop_edge_scraps(im[..., 3])
    pad = 8
    im = np.pad(im, ((pad, pad), (pad, pad), (0, 0)))
    rgb, a = im[..., :3], im[..., 3] > 127
    m = a if glow else erode(a)
    ring = m & ~erode(m)
    factor = np.ones(m.shape)
    # un-matte the outer ring against white: alpha = how far from white, colour = recovered foreground
    whiteness = (255 - rgb).max(-1) / 255
    if glow:
        # glow: soften a 5 px band so the pale rim fades into the background
        band = m.copy(); inner = m.copy()
        for _ in range(5): inner = erode(inner)
        band &= ~inner
        factor[band] = np.clip(0.25 + whiteness[band] * 2.2, 0.25, 1)
    else:
        light = ring & (rgb.min(-1) > 150)
        factor[light] = np.clip(whiteness[light] * 2.5, 0.15, 1)
    core = m & ~ring
    rgb = fill_outside(np.where(core[..., None], rgb, 0), core, rounds=10)
    alpha = (m * factor * 255).astype(np.uint8)
    # gentle anti-alias of the 1-bit edge (2x supersample + tiny blur)
    A = Image.fromarray(alpha).resize((alpha.shape[1] * 2, alpha.shape[0] * 2), Image.NEAREST).filter(ImageFilter.GaussianBlur(0.9)).resize((alpha.shape[1], alpha.shape[0]), Image.LANCZOS)
    alpha = np.minimum(np.array(A), alpha.max())
    out = np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    box = Image.fromarray((alpha > 6).astype(np.uint8) * 255).getbbox()
    box = (max(0, box[0] - 2), max(0, box[1] - 2), min(img.width, box[2] + 2), min(img.height, box[3] + 2))
    return img.crop(box)

if __name__ == '__main__':
    for name, expr in NAMES.items():
        img = prep(SRC / f'chef-gerardo-{name}.png', glow=(name == 'chefs-kiss'))
        webp, png = ROOT / 'img' / f'chef-{expr}.webp', ROOT / 'img' / f'chef-{expr}.png'
        img.save(webp, 'WEBP', quality=86, method=6, alpha_quality=90)
        img.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(png, optimize=True)
        print(f'{expr:11s} {img.size}  webp {webp.stat().st_size // 1024} KB  png {png.stat().st_size // 1024} KB')
