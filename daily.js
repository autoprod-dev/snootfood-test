// Plate of the day + streak (QW6). Everything is per device, in localStorage, in the user's own time zone.
import { APP } from './config.js';

export const THEMES = [
  'Toast, priced like rent', 'Leftovers glow-up', 'Beige food day', 'Breakfast for dinner', 'The sad desk lunch',
  'Something green. Really.', 'Two-minute noodles', 'The fridge’s last stand', 'Snack plate supreme', 'Something on a stick',
  'Midnight snack', 'A sandwich, structurally', 'Soup weather', 'Pasta. Obviously.', 'Anything with cheese on top',
  'The gas station gourmet', 'Brunch at home', 'Taco night', 'One-pan wonder', 'Dessert first',
  'Mystery leftovers', 'Pizza, any pizza', 'A salad, trying', 'Cereal as a meal', 'Grandma’s recipe',
  'Food truck energy', 'Microwave masterpiece', 'Eggs, your way', 'Something spicy', 'The packed lunch',
  'Rice bowl roulette', 'Fancy drink, plain glass', 'Game day snacks', 'Bake sale reject', 'Whatever’s in the freezer',
];

const KEY = 'snootfood.streak.v1';
const DAY = 86400e3;
const pad = (n) => String(n).padStart(2, '0');
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayIndex = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };   // calendar days, DST-proof
const weekKey = (s) => String(Math.floor((dayIndex(s) + 3) / 7));   // Monday-based week number

export const dayNumber = (d = new Date()) => Math.max(1, dayIndex(localDay(d)) - dayIndex(APP.launchDate || '2026-10-05') + 1);
export const plateOfTheDay = (d = new Date()) => THEMES[dayNumber(d) % THEMES.length];

function read() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s.count === 'number' && s.last) return s; } catch { /* reset */ }
  return { last: '', count: 0, freezes: 1, freezeWeek: '' };
}
const write = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } };
function refill(s, today) { if (s.freezeWeek !== weekKey(today)) { s.freezes = 1; s.freezeWeek = weekKey(today); } return s; }

// Current streak as of today (0 if it's already broken).
export function getStreak(d = new Date()) {
  const today = localDay(d), s = refill(read(), today);
  if (!s.last) return 0;
  const gap = dayIndex(today) - dayIndex(s.last);
  return gap <= 1 || (gap === 2 && s.freezes > 0) ? s.count : 0;
}

// Once per local day, when any result shows (demo or AI). One missed day spends the week's freeze.
export function bumpStreak(d = new Date()) {
  const today = localDay(d), s = refill(read(), today);
  if (s.last === today) return { count: s.count, bumped: false, milestone: false, usedFreeze: false };
  const gap = s.last ? dayIndex(today) - dayIndex(s.last) : Infinity;
  let usedFreeze = false;
  if (gap === 1) s.count += 1;
  else if (gap === 2 && s.freezes > 0) { s.count += 1; s.freezes -= 1; usedFreeze = true; }
  else s.count = 1;
  s.last = today;
  write(s);
  return { count: s.count, bumped: true, milestone: [3, 7, 30].includes(s.count), usedFreeze };
}

export function markShared(d = new Date()) {
  const s = read(); s.shared = localDay(d); s.shares = (s.shares || 0) + 1; write(s);
  return s.shares;
}

export const daily = (d = new Date()) => ({ n: dayNumber(d), theme: plateOfTheDay(d), streak: getStreak(d) });
