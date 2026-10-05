// Syncs the app name from config.js into index.html <title>, the manifest and sw cache name.
import { readFileSync, writeFileSync } from 'node:fs';
import { APP } from '../config.js';
const root = new URL('../', import.meta.url);
const suffix = APP.isTest ? ' (TEST)' : '';
const html = readFileSync(new URL('index.html', root), 'utf8')
  .replace(/<title>.*?<\/title>/, `<title>${APP.name}${suffix} · ${APP.tagline}</title>`)
  .replace(/(name="apple-mobile-web-app-title" content=")[^"]*"/, `$1${APP.name}"`)
  .replace(/(name="application-name" content=")[^"]*"/, `$1${APP.name}"`);
writeFileSync(new URL('index.html', root), html);
const m = JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
m.name = `${APP.name}${suffix}`; m.short_name = APP.name; m.description = `${APP.tagline} A just-for-fun ${APP.brand} experiment.`;
m.theme_color = APP.themeColour; m.background_color = APP.backgroundColour;
writeFileSync(new URL('manifest.webmanifest', root), JSON.stringify(m, null, 2) + '\n');
console.log('Applied', APP.name);
