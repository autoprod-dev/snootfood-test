// "Add to home screen" nudge (QW8). Never on load: only after a first share or a 2nd result in a session.
import { APP } from './config.js';

const INSTALLED = 'snootfood.installed.v1';
const NUDGE = 'snootfood.installNudge.v1';   // { dismissed: ms, shown: ms }
const DAY = 86400e3;
let deferred = null, shownThisSession = false, hideTimer;

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const ua = () => navigator.userAgent || '';
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
export const isInApp = () => /Instagram|TikTok|musical_ly|Bytedance|FBAN|FBAV|FB_IAB/i.test(ua());
const isIOSSafari = () => (/iPhone|iPad|iPod/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && /Safari/.test(ua()) && !/CriOS|FxiOS|EdgiOS/.test(ua()) && !isInApp();

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
window.addEventListener('appinstalled', () => { write(INSTALLED, Date.now()); hide(); });

function hide() { clearTimeout(hideTimer); const b = document.querySelector('#installBar'); if (b) b.hidden = true; }

export function maybeNudgeInstall(reason) {
  if (shownThisSession || isStandalone() || read(INSTALLED)) return false;
  const n = read(NUDGE) || {};
  if (n.dismissed && Date.now() - n.dismissed < 30 * DAY) return false;
  if (n.shown && Date.now() - n.shown < 3 * DAY) return false;   // it timed out unanswered recently
  const ios = !deferred && isIOSSafari();
  if (!deferred && !ios) return false;
  shownThisSession = true;
  write(NUDGE, { ...n, shown: Date.now(), reason });
  const bar = document.querySelector('#installBar');
  bar.querySelector('#installMsg').textContent = ios
    ? `Keep ${APP.chef} on your home screen for tomorrow’s Plate of the day: tap Share ⬆︎, then “Add to Home Screen.”`
    : `Keep ${APP.chef} on your home screen for tomorrow’s Plate of the day?`;
  bar.querySelector('#installAdd').hidden = ios;
  bar.querySelector('#installLater').textContent = ios ? 'Got it' : 'Not now';
  bar.hidden = false;
  const arm = () => { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 6000); };
  bar.onpointerenter = bar.onfocusin = () => clearTimeout(hideTimer);   // don't vanish under a finger
  bar.onpointerleave = arm;
  arm();
  bar.querySelector('#installAdd').onclick = async () => {
    hide();
    const e = deferred; deferred = null;
    if (!e) return;
    try { await e.prompt(); const c = await e.userChoice; if (c?.outcome === 'accepted') write(INSTALLED, Date.now()); else write(NUDGE, { ...read(NUDGE), dismissed: Date.now() }); } catch { /* prompt already used */ }
  };
  bar.querySelector('#installLater').onclick = () => { hide(); write(NUDGE, { ...read(NUDGE), dismissed: Date.now() }); };
  return true;
}

// Instagram/TikTok in-app browsers often can't share files or install: point people to their real browser.
export function inAppHint() {
  const h = document.querySelector('#inAppHint');
  if (!h || !isInApp()) return;
  try { if (sessionStorage.getItem('snootfood.inapp.v1')) return; } catch { /* fine */ }
  h.hidden = false;
  h.querySelector('button').onclick = () => { h.hidden = true; try { sessionStorage.setItem('snootfood.inapp.v1', '1'); } catch { /* fine */ } };
}
