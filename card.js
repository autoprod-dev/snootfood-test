// Renders the shareable image card on a <canvas>, in the camera-first look: the photo full-bleed on top,
// the yellow stamp, the black verdict band, Chef Gerardo in the corner, short lines on a dark sheet.
// Portrait 1080×1350 (feed/WhatsApp) or 1080×1920 (Stories).
import { APP } from './config.js';
import { artFor, exprForScore, stampLine } from './chef.js';

const FONT = 'InterT, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const F = (w, s) => `${w} ${s}px ${FONT}`;
const C = { sheet: '#0b0b0b', ink: '#ffffff', accent: '#ffe600', hot: '#ff3d2e', black: '#0f0f0f', soft: '#e9e9e9' };
const chefArt = {};   // expression → Image, loaded once

async function loadArt(base) {
  for (const ext of ['.webp', '.png']) {   // WebP with alpha, PNG fallback
    const img = new Image();
    img.src = base + ext;
    try { await img.decode(); return img; } catch { /* try the next format */ }
  }
  return null;
}

export async function prepareCardAssets(expr) {
  await Promise.all(['900 40px InterT', '800 40px InterT', '700 40px InterT', '600 40px InterT'].map((f) => document.fonts.load(f).catch(() => null)));
  const list = [...new Set(['judging', expr || 'judging'])];
  await Promise.all(list.map(async (e) => { if (!chefArt[e]) chefArt[e] = await loadArt(artFor(e)); }));
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
function fit(ctx, text, weight, maxW, maxLines, start, min, lh = 1.18) {
  let size = start, lines;
  for (; size >= min; size -= 2) {
    ctx.font = F(weight, size);
    lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines) return { size, lines, lh: size * lh, weight };
  }
  size = min; ctx.font = F(weight, size);
  lines = wrap(ctx, text, maxW);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxW && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' '));
    lines[maxLines - 1] = last + '…';
  }
  return { size, lines, lh: size * lh, weight };
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

function drawCover(ctx, img, x, y, w, h) {
  const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function pill(ctx, text, x, y, { font = F(800, 30), bg = 'rgba(0,0,0,.66)', fg = '#fff', h = 58, align = 'left' } = {}) {
  ctx.font = font;
  const w = ctx.measureText(text).width + 40;
  const left = align === 'right' ? x - w : x;
  roundRect(ctx, left, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, left + 20, y + h / 2 + 1);
  return w;
}

// Layout (QW4). Story cards keep the bottom 360 px (y ≥ 1560) as plain background: that's where Instagram/TikTok
// put the reply bar and where people drop a link sticker. Feed cards just clear the watermark.
const FOOTER_H = 112;                                    // three watermark lines
const footerY = (H, story) => story ? H - 360 - FOOTER_H - 8 : H - 164;
export const contentBottom = (H, story) => footerY(H, story) - 20;
export const STORY_SAFE_Y = 1560;
// Where the challenge sticker sits (tests sample its background colour here).
export const STICKER = { x: 48, y: 196, h: 116 };

function footer(ctx, W, H, opts = {}) {
  const y = footerY(H, opts.story);
  const url = APP.shortUrl + (APP.isTest ? '  ·  TEST' : '');
  const tag = '#ChefGerardo  ·  Get judged →';
  ctx.font = F(900, 36); const w1 = ctx.measureText(APP.name).width;
  ctx.font = F(700, 28); const w2 = ctx.measureText(url).width;
  ctx.font = F(800, 26); const w3 = ctx.measureText(tag).width;
  const x = W / 2 - (84 + Math.max(w1, w2, w3)) / 2;
  const face = chefArt.judging;
  if (face) { const k = Math.min(72 / face.naturalWidth, 96 / face.naturalHeight); ctx.drawImage(face, x + (72 - face.naturalWidth * k) / 2, y + 2 + (96 - face.naturalHeight * k), face.naturalWidth * k, face.naturalHeight * k); }
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = C.ink; ctx.font = F(900, 36); ctx.fillText(APP.name, x + 84, y - 2);
  ctx.fillStyle = C.soft; ctx.font = F(700, 28); ctx.fillText(url, x + 84, y + 42);
  ctx.fillStyle = C.accent; ctx.font = F(800, 26); ctx.fillText(tag, x + 84, y + 80);
}

// "You beat your friend · 7 vs 4" sticker for challenge answers (QW3). Yellow when you win, white otherwise.
function challengeSticker(ctx, { mine, theirs }) {
  const won = mine > theirs, tie = mine === theirs;
  const top = won ? 'YOU BEAT YOUR FRIEND' : tie ? 'TIE WITH YOUR FRIEND' : 'YOUR FRIEND WINS';
  const big = won || tie ? `${mine} vs ${theirs}` : `${theirs} vs ${mine}`;
  ctx.save();
  ctx.font = F(900, 24); const w = Math.max(300, ctx.measureText(top).width + 48);
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
  roundRect(ctx, STICKER.x, STICKER.y, w, STICKER.h, 20); ctx.fillStyle = won ? C.accent : '#ffffff'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = C.black; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(top, STICKER.x + w / 2, STICKER.y + 34);
  ctx.font = F(900, 50); ctx.fillStyle = won ? C.black : C.hot; ctx.fillText(big, STICKER.x + w / 2, STICKER.y + 80);
  ctx.restore();
}

// The yellow stamp circle: "4/10" (score) or the price.
function stamp(ctx, cx, cy, R, score, price, kind) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.17);
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
  ctx.beginPath(); ctx.arc(0, 0, R + 12, 0, Math.PI * 2); ctx.fillStyle = C.black; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill();
  ctx.fillStyle = C.black; ctx.textBaseline = 'alphabetic';
  if (score != null) {
    ctx.font = F(900, R * 1.05); const n = String(score), nw = ctx.measureText(n).width;
    ctx.font = F(900, R * 0.36); const sw = ctx.measureText('/10').width;
    const x0 = -(nw + sw) / 2;
    ctx.textAlign = 'left';
    ctx.font = F(900, R * 1.05); ctx.fillText(n, x0, R * 0.36);
    ctx.font = F(900, R * 0.36); ctx.fillText('/10', x0 + nw + 2, R * 0.36);
    if (kind) { ctx.font = F(900, R * 0.17); ctx.textAlign = 'center'; ctx.fillText(kind.toUpperCase(), 0, -R * 0.5); }
  } else {
    const t = (String(price || '').match(/\$\s?[\d,.]+[kKmM]?/) || [String(price || '$∞').slice(0, 7)])[0].replace(/\s/g, '');
    let size = R * 0.62; ctx.font = F(900, size);
    while (ctx.measureText(t).width > R * 1.6 && size > 30) { size -= 4; ctx.font = F(900, size); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, 0, 4);
  }
  ctx.restore();
}

// Black verdict band, bottom-aligned at `bottom`. Returns the band's top y.
function verdictBand(ctx, text, x, bottom, maxW, story) {
  const b = fit(ctx, text, 900, maxW - 36, 3, story ? 100 : 92, 56, 1.12);
  const lh = b.size * 1.12, padX = 18;
  const top = bottom - b.lines.length * lh;
  ctx.font = F(900, b.size); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  b.lines.forEach((l, i) => {
    const y = top + i * lh, w = ctx.measureText(l).width;
    ctx.fillStyle = C.black; ctx.fillRect(x, y, w + padX * 2, lh + 1);
    ctx.fillStyle = '#ffffff'; ctx.fillText(l, x + padX, y + lh / 2 + 2);
  });
  return top;
}

function drawChef(ctx, expr, right, bottom, boxW, boxH) {
  const img = chefArt[expr] || chefArt.judging;
  if (!img) return;
  const k = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);   // fit the pose into the box
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  ctx.save();
  ctx.shadowColor = expr === 'chefs-kiss' ? 'rgba(255,214,64,.75)' : 'rgba(0,0,0,.45)'; ctx.shadowBlur = expr === 'chefs-kiss' ? 40 : 26; ctx.shadowOffsetY = expr === 'chefs-kiss' ? 0 : 12;
  ctx.translate(right, bottom - h); ctx.scale(-1, 1);   // facing into the card, like the app
  ctx.drawImage(img, 0, 0, w, h);
  ctx.restore();
}

// Lays out the sheet's text blocks top-down; shrinks, then drops low-priority blocks until they fit.
function sheetText(ctx, blocks, x, y, bottom, wNarrow, wFull, narrowUntil) {
  let scale = 1, laid;
  const layout = (list) => {
    let yy = y; const out = [];
    for (const b of list) {
      const maxW = yy < narrowUntil ? wNarrow : wFull;
      if (b.chip) { ctx.font = F(900, Math.round(b.size * scale)); out.push({ ...b, y: yy, s: Math.round(b.size * scale) }); yy += b.size * scale * 1.5 + 18; continue; }
      const f = fit(ctx, b.text, b.weight, maxW, b.lines, Math.round(b.size * scale), Math.round(b.min * scale), b.lh || 1.22);
      out.push({ ...b, f, y: yy }); yy += f.lines.length * f.lh + (b.gap ?? 14);
    }
    return { out, end: yy };
  };
  let list = blocks;
  for (;;) {
    laid = layout(list);
    if (laid.end <= bottom) break;
    if (scale > 0.8) { scale -= 0.05; continue; }
    const drop = list.reduce((m, b, i) => (b.prio != null && (m < 0 || b.prio < list[m].prio) ? i : m), -1);
    if (drop < 0) break;
    list = list.filter((_, i) => i !== drop); scale = 1;
  }
  for (const b of laid.out) {
    if (b.chip) {
      ctx.save(); ctx.font = F(900, b.s); const w = ctx.measureText(b.text).width + 32, h = b.s * 1.4;
      ctx.translate(x, b.y); ctx.rotate(-0.03);
      roundRect(ctx, 0, 0, w, h, 12); ctx.fillStyle = b.bg || C.hot; ctx.fill();
      ctx.fillStyle = b.fg || '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(b.text, 16, h / 2 + 2);
      ctx.restore(); continue;
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    b.f.lines.forEach((l, i) => {
      const ly = b.y + i * b.f.lh;
      if (i === 0 && b.label) {
        ctx.font = F(900, b.f.size); ctx.fillStyle = b.labelColor || C.ink; ctx.fillText(b.label, x, ly);
        const lw = ctx.measureText(b.label + ' ').width;
        ctx.font = F(b.weight, b.f.size); ctx.fillStyle = b.color || C.ink; ctx.fillText(l.slice(b.label.length + 1), x + lw, ly);
      } else { ctx.font = F(b.weight, b.f.size); ctx.fillStyle = b.color || C.ink; ctx.fillText(l, x, ly); }
    });
  }
}

const L = (label, text, o = {}) => ({ label, text: `${label} ${text}`, weight: 700, size: 40, min: 30, lines: 2, ...o });

export async function renderCard(mode, r, photo, opts = {}) {
  const score = mode === 'menu' || r.score == null || !Number.isFinite(Number(r.score)) ? null : Math.max(0, Math.min(10, Math.round(Number(r.score))));
  const expr = exprForScore(score);
  await prepareCardAssets(expr);
  const W = 1080, H = opts.story ? 1920 : 1350, story = !!opts.story;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const verdict = mode === 'roast' ? r.headline : r.verdict || r.dishName || r.specialName || '';

  // Photo, full-bleed, then the sheet with rounded top corners over its bottom edge.
  const photoH = story ? 960 : (mode === 'fridge' ? 640 : 680);
  ctx.fillStyle = C.sheet; ctx.fillRect(0, 0, W, H);
  drawCover(ctx, photo, 0, 0, W, photoH);
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(0, 0, W, photoH);
  roundRect(ctx, 0, photoH - 56, W, H - photoH + 56, 56); ctx.fillStyle = C.sheet; ctx.fill();

  // Floating pills
  pill(ctx, APP.name, 40, 40, { font: F(900, 34), h: 64 });
  if (opts.demo) pill(ctx, 'DEMO TAKE', W - 40, 44, { bg: C.accent, fg: C.black, align: 'right', font: F(900, 26), h: 54 });
  const d = opts.daily;
  if (d) pill(ctx, `Plate of the day #${d.n}${d.streak ? '  ·  🔥' + d.streak : ''}`, 40, 120, { font: F(800, 24), h: 48 });
  if (opts.challenge) challengeSticker(ctx, opts.challenge);

  stamp(ctx, W - 200, story ? 300 : 270, story ? 150 : 136, score, r.price, mode === 'fridge' && score != null ? 'fridge' : '');
  drawChef(ctx, expr, W - 6, photoH + (story ? 300 : 250), story ? 420 : 350, story ? 470 : 400);
  verdictBand(ctx, verdict, 40, photoH - 84, W - 330, story);

  // Sheet text
  const sx = 52, sy = photoH + 22, bottom = contentBottom(H, story);
  const narrowUntil = photoH + (story ? 300 : 250) - 10;
  const blocks = [];
  if (mode === 'roast') {
    blocks.push({ chip: true, text: stampLine(score, verdict), size: 46 });
    if (r.compliment) blocks.push(L('Good:', r.compliment, { prio: 3 }));
    if (r.fix) blocks.push(L('Fix:', r.fix, { prio: 2 }));
  } else if (mode === 'menu') {
    blocks.push({ text: 'ON THE MENU TONIGHT', weight: 900, size: 28, min: 24, lines: 1, color: C.hot, gap: 10 });
    blocks.push({ text: r.dishName, weight: 900, size: 56, min: 40, lines: 2, lh: 1.08, gap: 16 });
    if (r.description) blocks.push({ text: r.description, weight: 600, size: 36, min: 28, lines: 2, prio: 1 });
    blocks.push(L('Price:', r.price, { size: 36, lines: 1, prio: 2 }));
    if (r.pairing) blocks.push(L('Pair it with:', r.pairing, { size: 36, lines: 1, prio: 0 }));
  } else {
    if (score != null) blocks.push({ chip: true, text: stampLine(score, verdict), size: 40 });
    blocks.push({ text: r.specialName, weight: 900, size: 52, min: 38, lines: 2, lh: 1.08, gap: 14 });
    blocks.push({ text: 'Made with: ' + r.ingredients.join(' · '), weight: 700, size: 32, min: 26, lines: 2, prio: 2 });
    r.steps.slice(0, 3).forEach((s, i) => blocks.push({ text: `${i + 1}. ${s}`, weight: 700, size: 34, min: 26, lines: 1, gap: 8, prio: 1 }));
    blocks.push(L('Price:', r.price, { size: 32, lines: 1, prio: 0 }));
  }
  blocks.push({ text: '— ' + APP.chef, weight: 900, size: 36, min: 30, lines: 1, prio: -1, gap: 0 });
  if (story) blocks.forEach((b) => { b.size = Math.round(b.size * 1.18); if (b.min) b.min = Math.round(b.min * 1.12); if (b.gap != null) b.gap = Math.round(b.gap * 1.3); });
  sheetText(ctx, blocks, sx, sy, bottom, W - sx - 300, W - sx * 2, narrowUntil);
  footer(ctx, W, H, opts);
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png'));
}
