// Renders the shareable image card on a <canvas>. Portrait 1080×1350 (feed/WhatsApp) or 1080×1920 (Stories).
import { APP } from './config.js';

const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif';
const HAND = 'Caveat, "Segoe Print", "Bradley Hand", cursive';
let chefImg;
const chefArt = {};   // Chef Gerardo mood art per mode, loaded once

async function loadArt(base) {
  for (const ext of ['.webp', '.png']) {   // WebP with alpha, PNG fallback
    const img = new Image();
    img.src = base + ext;
    try { await img.decode(); return img; } catch { /* try the next format */ }
  }
  return null;
}

export async function prepareCardAssets(mode) {
  const fonts = ['600 40px "Playfair Display"', '800 40px "Playfair Display"', 'italic 500 40px "Playfair Display"', '600 40px Caveat'];
  await Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => null)));
  if (!chefImg) {
    chefImg = new Image();
    chefImg.src = 'chef.svg';
    await chefImg.decode().catch(() => null);
  }
  const modes = mode ? [mode] : Object.keys(APP.chefArt || {});
  await Promise.all(modes.map(async (m) => { if (!chefArt[m] && APP.chefArt?.[m]) chefArt[m] = await loadArt(APP.chefArt[m].file); }));
}

// Draws the mode's Chef Gerardo standing at the lower-left of the photo, a little in front of it.
function drawChef(ctx, mode, photoLeft, bottomY, h, overlap = 0.38) {
  const img = chefArt[mode];
  if (!img) return;
  const w = h * img.naturalWidth / img.naturalHeight;
  const x = Math.max(40, photoLeft - w * (1 - overlap));
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 10;
  ctx.drawImage(img, x, bottomY - h, w, h);
  ctx.restore();
}

function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !line) line = t;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

// Shrinks the font until the text fits in maxLines; ellipsises as a last resort.
function fit(ctx, text, fontFor, maxW, maxLines, start, min) {
  let size = start, lines;
  for (; size >= min; size -= 2) {
    ctx.font = fontFor(size);
    lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines) return { size, lines, lh: size * 1.25 };
  }
  size = min; ctx.font = fontFor(size);
  lines = wrap(ctx, text, maxW);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxW && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' '));
    lines[maxLines - 1] = last + '…';
  }
  return { size, lines, lh: size * 1.25 };
}

function drawLines(ctx, block, fontFor, x, y, align = 'center') {
  ctx.font = fontFor(block.size);
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  block.lines.forEach((l, i) => ctx.fillText(l, x, y + i * block.lh));
  return y + block.lines.length * block.lh;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function archPath(ctx, x, y, w, h) {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function drawCover(ctx, img, x, y, w, h) {
  const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function grain(ctx, W, H, alpha, colour = '0,0,0', count = 6000) {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = `rgba(${colour},${alpha})`;
  for (let i = 0; i < count; i++) ctx.fillRect(rnd() * W, rnd() * H, 1.6, 1.6);
}

function footer(ctx, W, H, { ink, sub }) {
  const y = H - 124;
  const url = APP.shortUrl + (APP.isTest ? '  ·  TEST' : '');
  ctx.font = `800 30px ${SERIF}`; const w1 = ctx.measureText(APP.name).width;
  ctx.font = `500 22px ${SERIF}`; const w2 = ctx.measureText(url).width;
  const x = W / 2 - (60 + Math.max(w1, w2)) / 2;
  if (chefImg?.complete) ctx.drawImage(chefImg, x, y - 2, 46, 55);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = ink; ctx.font = `800 30px ${SERIF}`; ctx.fillText(APP.name, x + 60, y);
  ctx.fillStyle = sub; ctx.font = `500 22px ${SERIF}`; ctx.fillText(url, x + 60, y + 36);
}

function ornament(ctx, cx, y, w, colour) {
  ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx - 14, y); ctx.moveTo(cx + 14, y); ctx.lineTo(cx + w / 2, y); ctx.stroke();
  ctx.save(); ctx.translate(cx, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-6, -6, 12, 12); ctx.restore();
}

function spaced(ctx, text, x, y, spacing) {
  // Letter-spaced centred text (canvas letterSpacing isn't everywhere yet).
  const chars = [...text];
  const total = chars.reduce((s, c) => s + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  ctx.textAlign = 'left';
  for (const c of chars) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + spacing; }
}

// ───────────── Fancy Menu ─────────────
function menuCard(ctx, W, H, r, photo) {
  const g = ctx.createRadialGradient(W / 2, H * 0.4, 100, W / 2, H / 2, H * 0.8);
  g.addColorStop(0, '#fbf6ea'); g.addColorStop(1, '#e8dcc2');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, 0.05);
  ctx.strokeStyle = '#b8913a'; ctx.lineWidth = 4; ctx.strokeRect(34, 34, W - 68, H - 68);
  ctx.lineWidth = 1.5; ctx.strokeRect(48, 48, W - 96, H - 96);

  ctx.fillStyle = '#2a1f1a'; ctx.textBaseline = 'top';
  ctx.font = `600 30px ${SERIF}`;
  spaced(ctx, APP.restaurant.toUpperCase(), W / 2, 92, 10);
  ornament(ctx, W / 2, 146, 300, '#b8913a');
  ctx.font = `italic 500 28px ${SERIF}`; ctx.fillStyle = '#6b5446'; ctx.textAlign = 'center';
  ctx.fillText('On the menu tonight', W / 2, 162);

  const tw = W - 200;
  const name = fit(ctx, r.dishName, (s) => `italic 500 ${s}px ${SERIF}`, tw, 3, 74, 44);
  const desc = fit(ctx, r.description, (s) => `500 ${s}px ${SERIF}`, tw, 4, 34, 26);
  const notes = fit(ctx, '“' + r.chefNotes + '”', (s) => `italic 500 ${s}px ${SERIF}`, tw - 40, 3, 28, 22);
  const pair = fit(ctx, 'Pair it with: ' + r.pairing, (s) => `600 ${s}px ${SERIF}`, tw, 2, 24, 20);
  const textH = name.lines.length * name.lh + 22 + desc.lines.length * desc.lh + 30 + 76 + 26 + 34 + notes.lines.length * notes.lh + 18 + pair.lines.length * pair.lh;
  const top = 222, bottom = H - 150;
  const photoH = Math.max(320, Math.min(H > 1500 ? 900 : 560, bottom - top - textH - 60));
  const photoW = Math.min(W - 240, photoH * 1.05);
  const px = (W - photoW) / 2, py = top;

  ctx.save(); archPath(ctx, px, py, photoW, photoH); ctx.clip(); drawCover(ctx, photo, px, py, photoW, photoH); ctx.restore();
  ctx.strokeStyle = '#b8913a'; ctx.lineWidth = 6; archPath(ctx, px - 10, py - 10, photoW + 20, photoH + 20); ctx.stroke();
  drawChef(ctx, 'menu', px, py + photoH + 12, H > 1500 ? 330 : 250, 0.24);

  let y = py + photoH + Math.max(30, (bottom - top - photoH - textH) / 2.2);
  ctx.fillStyle = '#2a1f1a';
  y = drawLines(ctx, name, (s) => `italic 500 ${s}px ${SERIF}`, W / 2, y) + 22;
  ctx.fillStyle = '#4a3b33';
  y = drawLines(ctx, desc, (s) => `500 ${s}px ${SERIF}`, W / 2, y) + 30;

  // Dotted leader + price
  ctx.font = `800 58px ${SERIF}`; ctx.textAlign = 'center';
  const pw = ctx.measureText(r.price).width;
  ctx.fillStyle = '#8c1c13';
  ctx.fillText(r.price, W / 2, y);
  ctx.fillStyle = '#b8913a';
  for (let x = 110; x < W / 2 - pw / 2 - 24; x += 18) ctx.fillRect(x, y + 36, 5, 5);
  for (let x = W / 2 + pw / 2 + 24; x < W - 110; x += 18) ctx.fillRect(x, y + 36, 5, 5);
  y += 76 + 26;

  ctx.fillStyle = '#8a6d3b'; ctx.font = `600 22px ${SERIF}`;
  spaced(ctx, 'CHEF’S NOTES', W / 2, y, 6); y += 34;
  ctx.fillStyle = '#4a3b33';
  y = drawLines(ctx, notes, (s) => `italic 500 ${s}px ${SERIF}`, W / 2, y) + 18;
  ctx.fillStyle = '#6b5446';
  drawLines(ctx, pair, (s) => `600 ${s}px ${SERIF}`, W / 2, y);
  footer(ctx, W, H, { ink: '#2a1f1a', sub: '#7a6656' });
}

// ───────────── Chef Roast ─────────────
function roastCard(ctx, W, H, r, photo) {
  ctx.fillStyle = '#16100e'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.3, 50, W / 2, H * 0.3, H * 0.75);
  g.addColorStop(0, 'rgba(200,40,30,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, 0.06, '255,255,255', 4000);

  ctx.fillStyle = '#ff5a3c'; ctx.textBaseline = 'top'; ctx.font = `800 34px ${SERIF}`;
  spaced(ctx, 'CHEF ROAST', W / 2, 70, 12);
  ctx.fillStyle = '#f3e9dc'; ctx.font = `600 40px ${HAND}`; ctx.textAlign = 'center';
  ctx.fillText('judged by ' + APP.chef, W / 2, 114);

  const tw = W - 180;
  const head = fit(ctx, r.headline, (s) => `800 ${s}px ${SERIF}`, tw, 2, 66, 42);
  const roast = fit(ctx, r.roast, (s) => `italic 500 ${s}px ${SERIF}`, tw - 40, 6, 36, 26);
  const comp = fit(ctx, '✓ ' + r.compliment, (s) => `600 ${s}px ${SERIF}`, tw, 2, 26, 20);
  const fix = fit(ctx, 'Pro tip: ' + r.fix, (s) => `600 ${s}px ${SERIF}`, tw, 2, 26, 20);
  const textH = head.lines.length * head.lh + 26 + roast.lines.length * roast.lh + 26 + (comp.lines.length * comp.lh) + 10 + fix.lines.length * fix.lh;
  const top = 190, bottom = H - 150;
  const photoH = Math.max(300, Math.min(H > 1500 ? 860 : 500, bottom - top - textH - 110));
  const photoW = Math.min(W - 260, photoH * 1.2);

  // Polaroid, slightly askew
  ctx.save();
  ctx.translate(W / 2, top + photoH / 2 + 10); ctx.rotate(-0.03);
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
  ctx.fillStyle = '#f7f2ea'; ctx.fillRect(-photoW / 2 - 18, -photoH / 2 - 18, photoW + 36, photoH + 36);
  ctx.shadowColor = 'transparent';
  drawCover(ctx, photo, -photoW / 2, -photoH / 2, photoW, photoH);
  ctx.restore();

  // Score stamp
  const sx = W / 2 + photoW / 2 - 20, sy = top + photoH - 50;
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(0.18);
  ctx.fillStyle = '#c8102e'; ctx.beginPath(); ctx.arc(0, 0, 100, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f7f2ea'; ctx.lineWidth = 5; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.arc(0, 0, 85, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 84px ${SERIF}`; ctx.fillText(String(r.score), r.score === 10 ? -22 : -14, -6);
  ctx.font = `800 30px ${SERIF}`; ctx.fillText('/10', r.score === 10 ? 52 : 44, 26);
  ctx.restore();
  drawChef(ctx, 'roast', W / 2 - photoW / 2 - 18, top + photoH + 36, H > 1500 ? 400 : 310);

  let y = top + photoH + 80 + Math.max(0, (bottom - top - photoH - textH - 80) / 2.4);
  ctx.fillStyle = '#ffffff';
  y = drawLines(ctx, head, (s) => `800 ${s}px ${SERIF}`, W / 2, y) + 26;
  ctx.fillStyle = '#ff5a3c'; ctx.font = `800 120px ${SERIF}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('“', 56, y - 34);
  ctx.fillStyle = '#efe4d6';
  y = drawLines(ctx, roast, (s) => `italic 500 ${s}px ${SERIF}`, W / 2, y) + 26;
  ctx.fillStyle = '#9fd49a';
  y = drawLines(ctx, comp, (s) => `600 ${s}px ${SERIF}`, W / 2, y) + 10;
  ctx.fillStyle = '#f2c46d';
  drawLines(ctx, fix, (s) => `600 ${s}px ${SERIF}`, W / 2, y);
  footer(ctx, W, H, { ink: '#ffffff', sub: '#b9a99a' });
}

// ───────────── Fridge Chef (chalkboard special) ─────────────
function fridgeCard(ctx, W, H, r, photo) {
  ctx.fillStyle = '#5b3a22'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1e352b'; ctx.fillRect(30, 30, W - 60, H - 60);
  for (let i = 0; i < 9; i++) {
    const gx = (i * 397) % W, gy = (i * 613) % H;
    const sm = ctx.createRadialGradient(gx, gy, 10, gx, gy, 320);
    sm.addColorStop(0, 'rgba(255,255,255,.05)'); sm.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sm; ctx.fillRect(30, 30, W - 60, H - 60);
  }
  grain(ctx, W, H, 0.05, '255,255,255', 5000);

  const chalk = '#f4f1e8';
  ctx.fillStyle = chalk; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = `600 76px ${HAND}`; ctx.fillText('Tonight’s Special', W / 2, 62);
  ctx.font = `italic 500 26px ${SERIF}`; ctx.fillStyle = '#cfe3d4';
  ctx.fillText(`${APP.restaurant} · straight from your fridge`, W / 2, 146);

  const tw = W - 180;
  const name = fit(ctx, r.specialName, (s) => `italic 500 ${s}px ${SERIF}`, tw, 2, 64, 40);
  const desc = fit(ctx, r.description, (s) => `500 ${s}px ${SERIF}`, tw, 3, 30, 24);
  const ingr = fit(ctx, 'Made with: ' + r.ingredients.join(' · '), (s) => `600 ${s}px ${HAND}`, tw, 2, 38, 28);
  const steps = r.steps.slice(0, 3).map((s, i) => fit(ctx, `${i + 1}. ${s}`, (z) => `600 ${z}px ${HAND}`, tw - 40, 2, 38, 28));
  const note = fit(ctx, '“' + r.note + '”', (s) => `italic 500 ${s}px ${SERIF}`, tw, 2, 26, 20);
  const stepsH = steps.reduce((s, b) => s + b.lines.length * b.lh + 4, 0);
  const textH = name.lines.length * name.lh + 18 + desc.lines.length * desc.lh + 20 + ingr.lines.length * ingr.lh + 18 + stepsH + 18 + note.lines.length * note.lh;
  const top = 222, bottom = H - 150;
  const photoH = Math.max(280, Math.min(H > 1500 ? 820 : 450, bottom - top - textH - 50));
  const photoW = Math.min(W - 300, photoH * 1.25);
  const px = (W - photoW) / 2, py = top;

  ctx.save(); ctx.translate(W / 2, py + photoH / 2); ctx.rotate(0.02);
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
  roundRect(ctx, -photoW / 2, -photoH / 2, photoW, photoH, 18); ctx.fillStyle = '#000'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save(); roundRect(ctx, -photoW / 2, -photoH / 2, photoW, photoH, 18); ctx.clip(); drawCover(ctx, photo, -photoW / 2, -photoH / 2, photoW, photoH); ctx.restore();
  ctx.fillStyle = 'rgba(245,235,200,.8)';
  ctx.save(); ctx.translate(-photoW / 2 + 14, -photoH / 2 + 10); ctx.rotate(-0.6); ctx.fillRect(-46, -15, 92, 30); ctx.restore();
  ctx.save(); ctx.translate(photoW / 2 - 14, -photoH / 2 + 10); ctx.rotate(0.6); ctx.fillRect(-46, -15, 92, 30); ctx.restore();
  ctx.restore();

  // Price tag
  ctx.save(); ctx.translate(px + photoW + 10, py + photoH - 30); ctx.rotate(-0.12);
  ctx.font = `800 40px ${SERIF}`;
  const tagW = Math.max(150, ctx.measureText(r.price).width + 50);
  roundRect(ctx, -tagW / 2, -40, tagW, 80, 40); ctx.fillStyle = '#f2c14e'; ctx.fill();
  ctx.fillStyle = '#2a1f1a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r.price, 0, 2);
  ctx.restore();
  drawChef(ctx, 'fridge', px, py + photoH + 14, H > 1500 ? 380 : 290);

  let y = py + photoH + Math.max(32, (bottom - top - photoH - textH) / 2.3);
  ctx.fillStyle = chalk;
  y = drawLines(ctx, name, (s) => `italic 500 ${s}px ${SERIF}`, W / 2, y) + 18;
  ctx.fillStyle = '#dfe9e2';
  y = drawLines(ctx, desc, (s) => `500 ${s}px ${SERIF}`, W / 2, y) + 20;
  ctx.fillStyle = '#f2c14e';
  y = drawLines(ctx, ingr, (s) => `600 ${s}px ${HAND}`, W / 2, y) + 18;
  ctx.fillStyle = chalk;
  for (const b of steps) y = drawLines(ctx, b, (s) => `600 ${s}px ${HAND}`, W / 2, y) + 4;
  y += 14;
  ctx.fillStyle = '#b9d3c1';
  drawLines(ctx, note, (s) => `italic 500 ${s}px ${SERIF}`, W / 2, y);
  footer(ctx, W, H, { ink: chalk, sub: '#b9d3c1' });
}

export async function renderCard(mode, result, photo, { story = false } = {}) {
  await prepareCardAssets(mode);
  const W = 1080, H = story ? 1920 : 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ({ menu: menuCard, roast: roastCard, fridge: fridgeCard })[mode](ctx, W, H, result, photo);
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png'));
}
