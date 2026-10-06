// ─────────────────────────────────────────────────────────────
// Single source of truth for branding. Change the name here, then
// run `node tools/apply-config.mjs` to sync <title> and the manifest.
// ─────────────────────────────────────────────────────────────
export const APP = {
  name: 'Snootfood',
  tagline: 'Every meal deserves a menu.',
  restaurant: 'The Snoot Room',
  chef: 'Chef Gerardo',
  chefShort: 'Gerardo',
  // Chef Gerardo's expressions. Each one is img/chef-<name>.webp (alpha) + img/chef-<name>.png (fallback),
  // made from the final art by tools/prep_chef.py. To swap art, drop in files with the same names
  // (keep the transparent background) and bump the sw.js VERSION. See img/README.md.
  chefExpressions: ['judging', 'disgust', 'faint', 'shocked', 'slow-clap', 'chefs-kiss'],
  chefSize: { w: 360, h: 360 },
  brand: 'Autoprod',
  url: 'https://autoprod-dev.github.io/snootfood-test/',
  shortUrl: 'autoprod-dev.github.io/snootfood-test',
  isTest: true,
  themeColour: '#0b0b0b',
  backgroundColour: '#0b0b0b',
  // Real photo reading without a user key goes through a relay that holds the Gemini key, so the key
  // is never in this site. Two interchangeable relays live in the repo:
  //   • Google Apps Script web app (/relay-gas):  'https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec'
  //   • Cloudflare Worker (/relay):               'https://snootfood-relay.<subdomain>.workers.dev'
  // The app picks the right protocol from the URL. Leave empty ('') to stay in demo mode.
  relayUrl: 'https://script.google.com/macros/s/AKfycbyAmADXEFf9Ip28A72p-9Z-OuCOyktvXD9y71VwenmWAW6c3I7hz5y_hLVpPbuuPK_ZJw/exec',
  // Optional shared token for the Apps Script relay (must match APP_TOKEN in Script Properties).
  // It is visible to anyone who reads this file, so it is only light protection.
  relayToken: '',
  // Real AI reads per device per Pacific day (honour system; the relay's own 40/day per client stays the hard limit).
  realCallsPerDay: 3,
  // Ask "are you 18+?" once, before the first real AI call (Gemini is for adults only).
  ageGate: true,
  // Day 1 of "Plate of the day" (local date). Plate #N counts up from here.
  launchDate: '2026-10-05',
};
