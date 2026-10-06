// Sound effects (synthesised with WebAudio: no audio files) and lightweight canvas confetti.
// Sound is MUTED by default; the speaker toggle's choice is remembered on this device.
const KEY = 'snootfood.sound.v1';
export const soundOn = () => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } };
export function setSound(on) { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ } if (on) ac(); else ctx?.suspend?.(); }

let ctx = null;
function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function out(c, gain = 0.5) { const g = c.createGain(); g.gain.value = gain; g.connect(c.destination); return g; }
function noise(c, secs) {
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * secs), c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = b; return s;
}
function hit(c, t, dest, { f = 180, dur = 0.08, vol = 0.6, type = 'bandpass' } = {}) {
  const n = noise(c, dur), fl = c.createBiquadFilter(), g = c.createGain();
  fl.type = type; fl.frequency.value = f; fl.Q.value = 0.8;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(fl).connect(g).connect(dest); n.start(t); n.stop(t + dur);
}
function tone(c, t, dest, { f = 440, to = null, dur = 0.3, vol = 0.4, type = 'sine' } = {}) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
const play = (fn) => { if (!soundOn()) return; const c = ac(); if (!c) return; try { fn(c, c.currentTime + 0.01, out(c)); } catch { /* never break the reveal */ } };

export const sfx = {
  // Snare roll that speeds up over `secs`.
  drumroll: (secs = 1.2) => play((c, t, o) => { let x = 0, gap = 0.07; while (x < secs) { hit(c, t + x, o, { f: 1800, dur: 0.05, vol: 0.25 + 0.35 * (x / secs) }); x += gap; gap = Math.max(0.03, gap * 0.94); } }),
  // Low stamp thud.
  thud: () => play((c, t, o) => { tone(c, t, o, { f: 120, to: 45, dur: 0.25, vol: 0.9 }); hit(c, t, o, { f: 300, dur: 0.12, vol: 0.5, type: 'lowpass' }); }),
  ding: () => play((c, t, o) => { tone(c, t, o, { f: 1318, dur: 0.9, vol: 0.25 }); tone(c, t, o, { f: 2637, dur: 0.5, vol: 0.06 }); }),
  // "Wah-wah": four falling, muted brass-ish notes.
  trombone: () => play((c, t, o) => { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(o); [[311, 0], [293, 0.45], [277, 0.9], [262, 1.35]].forEach(([f, d], i) => tone(c, t + d, lp, { f, to: i === 3 ? 220 : f * 0.97, dur: i === 3 ? 1.0 : 0.42, vol: 0.35, type: 'sawtooth' })); }),
  // Applause: a burst of short filtered noise claps.
  applause: () => play((c, t, o) => { for (let i = 0; i < 70; i++) hit(c, t + Math.random() * 1.6, o, { f: 1200 + Math.random() * 1600, dur: 0.03, vol: 0.12 + Math.random() * 0.15 }); }),
};

// Confetti: ~90 paper bits on a fixed canvas, ~1.8 s, then the canvas removes itself.
export function confetti() {
  const cv = document.createElement('canvas');
  cv.className = 'confetti'; cv.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  document.body.append(cv);
  const x = cv.getContext('2d'); x.scale(dpr, dpr);
  const colors = ['#ffe600', '#ff3d2e', '#ffffff', '#2ec4ff', '#0f0f0f'];
  const bits = Array.from({ length: 90 }, () => ({ x: W * (0.2 + Math.random() * 0.6), y: H * 0.28, vx: (Math.random() - 0.5) * 9, vy: -6 - Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, w: 6 + Math.random() * 6, h: 10 + Math.random() * 8, c: colors[(Math.random() * colors.length) | 0] }));
  const t0 = performance.now();
  const frame = (now) => {
    const t = now - t0;
    x.clearRect(0, 0, W, H);
    for (const b of bits) { b.vy += 0.32; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr; x.save(); x.translate(b.x, b.y); x.rotate(b.r); x.fillStyle = b.c; x.globalAlpha = Math.max(0, 1 - t / 1800); x.fillRect(-b.w / 2, -b.h / 2, b.w, Math.abs(Math.cos(b.r * 2)) * b.h + 2); x.restore(); }
    if (t < 1800) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
  return cv;
}
