// Real-AI budget, kitchen-closed state and the 18+ answer. All per device, in localStorage.
// The relay's own limits (8/min, 200/day overall, 40/day per client) stay the hard stop; this is the polite one.
import { APP } from './config.js';

const BUDGET = 'snootfood.budget.v1';
const CLOSED = 'snootfood.closed.v1';
const AGE = 'snootfood.age.v1';
const LA = 'America/Los_Angeles';   // the relay (and Gemini free tier) resets at midnight Pacific

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: fine */ } };

export const pacificDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: LA }).format(d);

// Next midnight in Los Angeles, shown in the user's own time zone ("6:00 PM" in Sydney).
export function nextReset(from = new Date()) {
  const today = pacificDay(from);
  const t = new Date(from); t.setUTCMinutes(0, 0, 0);   // LA's offset is whole hours, so midnight there is on a UTC hour
  for (let i = 0; i < 30; i++) {
    t.setTime(t.getTime() + 3600e3);
    if (pacificDay(t) !== today) return t;
  }
  return t;
}
export const nextResetLocal = (from = new Date()) => nextReset(from).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function budget() {
  let b;
  try { b = JSON.parse(read(BUDGET) || 'null'); } catch { b = null; }
  const day = pacificDay();
  if (!b || b.day !== day || typeof b.used !== 'number') b = { day, used: 0 };
  return { ...b, limit: APP.realCallsPerDay, left: Math.max(0, APP.realCallsPerDay - b.used) };
}
export function spend(n = 1) {
  const b = budget();
  write(BUDGET, JSON.stringify({ day: b.day, used: b.used + n }));
  return budget();
}

export const kitchenClosed = () => read(CLOSED) === pacificDay();
export const closeKitchen = () => write(CLOSED, pacificDay());

export const ageOk = () => read(AGE) === 'yes';
export const setAge = (yes) => write(AGE, yes ? 'yes' : 'no');
