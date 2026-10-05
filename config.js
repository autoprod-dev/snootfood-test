// ─────────────────────────────────────────────────────────────
// Single source of truth for branding. Change the name here, then
// run `node tools/apply-config.mjs` to sync <title> and the manifest.
// ─────────────────────────────────────────────────────────────
export const APP = {
  name: 'Snootfood',
  tagline: 'Every meal deserves a menu.',
  restaurant: 'The Snoot Room',
  chef: 'Chef Gus Crouton',
  chefShort: 'Chef Gus',
  brand: 'Autoprod',
  url: 'https://autoprod-dev.github.io/snootfood-test/',
  shortUrl: 'autoprod-dev.github.io/snootfood-test',
  isTest: true,
  themeColour: '#1b1411',
  backgroundColour: '#f6efe1',
  // Real photo reading without a user key goes through a relay that holds the Gemini key, so the key
  // is never in this site. Two interchangeable relays live in the repo:
  //   • Google Apps Script web app (/relay-gas):  'https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec'
  //   • Cloudflare Worker (/relay):               'https://snootfood-relay.<subdomain>.workers.dev'
  // The app picks the right protocol from the URL. Leave empty ('') to stay in demo mode.
  relayUrl: 'https://script.google.com/macros/s/AKfycbyAmADXEFf9Ip28A72p-9Z-OuCOyktvXD9y71VwenmWAW6c3I7hz5y_hLVpPbuuPK_ZJw/exec',
  // Optional shared token for the Apps Script relay (must match APP_TOKEN in Script Properties).
  // It is visible to anyone who reads this file, so it is only light protection.
  relayToken: '',
};
