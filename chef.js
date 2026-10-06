// The animated chef slot. One slot = one <div> with a picture inside that swaps between the
// expression files (img/chef-<expr>.webp/.png). Score bands → expression (data-react drives the motion
// in styles.css):
//   0–2  faint       drops and fades          (data-react="worst")
//   3–4  disgust     melting shudder          (data-react="low")
//   5–6  judging     raised-brow tilt         (data-react="mid")
//   7–8  slow-clap   grudging bounce          (data-react="high")
//   9–10 chefs-kiss  floats, gold glow pulse  (data-react="top")
//   no score (menu)  judging, then slow-clap on the reveal
//   shocked: the surprise beat at the drumroll slam, errors, kitchen closed
// Idle/home/wait: judging (.pop in from the corner, idle bob, .wobble while waiting).
// Reduced motion: styles.css turns every animation off and shows the end pose.
import { APP } from './config.js';

export const EXPRESSIONS = APP.chefExpressions;
const ALT = { judging: 'judging you', disgust: 'melting in disgust', faint: 'fainted, his ghost leaving', shocked: 'so shocked his hat launched', 'slow-clap': 'slow-clapping, grudgingly', 'chefs-kiss': 'doing a heavenly chef’s kiss' };
export const artFor = (expr) => `img/chef-${EXPRESSIONS.includes(expr) ? expr : 'judging'}`;

// Score band → reaction + expression.
export const bandFor = (score) => (score == null ? 'menu' : score <= 2 ? 'worst' : score <= 4 ? 'low' : score <= 6 ? 'mid' : score <= 8 ? 'high' : 'top');
const BAND_EXPR = { worst: 'faint', low: 'disgust', mid: 'judging', high: 'slow-clap', top: 'chefs-kiss', menu: 'slow-clap' };
export const exprForScore = (score) => BAND_EXPR[bandFor(score)];

export function chefSlot(expr = 'judging', cls = '') {
  const slot = document.createElement('div');
  slot.className = 'chef-slot ' + cls;
  const body = document.createElement('div'); body.className = 'chef-body';
  const pic = document.createElement('picture');
  const src = document.createElement('source'); src.type = 'image/webp';
  const img = document.createElement('img');
  img.width = APP.chefSize.w; img.height = APP.chefSize.h; img.decoding = 'async';
  pic.append(src, img);
  body.append(pic);
  slot.append(body);
  setExpr(slot, expr);
  return slot;
}

export function setExpr(slot, expr) {
  if (!slot) return;
  const a = artFor(expr);
  slot.dataset.expr = EXPRESSIONS.includes(expr) ? expr : 'judging';
  slot.querySelector('source').srcset = a + '.webp';
  const img = slot.querySelector('img');
  img.src = a + '.png';
  img.alt = `${APP.chef}, ${ALT[slot.dataset.expr]}`;
}

// Restart a CSS animation class (pop, wobble) on the slot.
export function play(slot, cls) {
  if (!slot) return;
  slot.classList.remove(cls); void slot.offsetWidth; slot.classList.add(cls);
}

// Score reaction: swap to the band's expression and let CSS play its move.
export function react(slot, score) {
  if (!slot) return;
  slot.dataset.react = bandFor(score);
  setExpr(slot, exprForScore(score));
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Warm the cache so expression swaps are instant (runs when the browser is idle).
export function preloadExpressions() {
  const go = () => EXPRESSIONS.forEach((e) => { const i = new Image(); i.src = artFor(e) + (supportsWebp() ? '.webp' : '.png'); });
  (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(go);
}
const supportsWebp = () => { try { return document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'); } catch { return false; } };

// Score stamps: one short line per band (two options each). Never repeats the verdict.
export const STAMPS = [[2, ['No.', 'Eat it fast.']], [4, ['The lettuce tried.', 'Rough.']], [6, ['Fine. Just fine.', 'It’s food.']], [8, ['Annoyingly decent.', 'Okay. Okay.']], [10, ['I’m upset about it.', 'No notes. Rude.']]];
const bare = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
export function stampLine(score, verdict = '') {
  if (score == null) return '';
  const opts = STAMPS.find(([max]) => score <= max)[1];
  const ok = opts.filter((o) => !bare(verdict).includes(bare(o)));
  const pool = ok.length ? ok : opts;
  return pool[(score + String(verdict).length) % pool.length];
}
