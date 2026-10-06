// Node tests for both relays (no network: upstream Gemini is stubbed).
// Usage: node tests/relay_test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import worker, { originAllowed, validateBody } from '../relay/worker.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const b64 = (n) => 'A'.repeat(n);
const goodBody = (img = 1000) => ({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: b64(img) } }, { text: 'hi' }] }], systemInstruction: { parts: [{ text: 'sys' }] }, generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 99999 } });

// ───────── Cloudflare Worker ─────────
const env = { GEMINI_API_KEY: 'SECRET-KEY', ALLOW_LOCALHOST: 'true', RL_MINUTE: { n: 0, async limit() { return { success: ++this.n <= 10 }; } }, RL_DAILY: { m: new Map(), async get(k) { return this.m.get(k) ?? null; }, async put(k, v) { this.m.set(k, v); } } };
const req = (headers, body, path = '/v1beta/models/gemini-flash-latest:generateContent', method = 'POST') => new Request('https://relay.example' + path, { method, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', ...headers }, body: method === 'POST' ? JSON.stringify(body) : undefined });
const GH = { Origin: 'https://autoprod-dev.github.io', Referer: 'https://autoprod-dev.github.io/snootfood-test/#fridge' };

check('worker origin: test site allowed', originAllowed(req(GH, {}), env) === GH.Origin);
check('worker origin: other github.io path rejected', originAllowed(req({ ...GH, Referer: 'https://autoprod-dev.github.io/snootfood/' }), env) === null);
check('worker origin: lookalike path rejected', originAllowed(req({ ...GH, Referer: 'https://autoprod-dev.github.io/snootfood-test-evil/' }), env) === null);
check('worker origin: no referer rejected', originAllowed(req({ Origin: GH.Origin }), env) === null);
check('worker origin: evil.com rejected', originAllowed(req({ Origin: 'https://evil.com', Referer: 'https://autoprod-dev.github.io/snootfood-test/' }), env) === null);
check('worker origin: localhost allowed in testing', originAllowed(req({ Origin: 'http://localhost:8000' }), env) === 'http://localhost:8000');
check('worker origin: localhost blocked when ALLOW_LOCALHOST=false', originAllowed(req({ Origin: 'http://localhost:8000' }), { ...env, ALLOW_LOCALHOST: 'false' }) === null);

const v = validateBody(goodBody());
check('worker validate: good body accepted, output tokens capped at 4096', !v.error && v.body.generationConfig.maxOutputTokens === 4096);
check('worker validate: tools rejected', validateBody({ ...goodBody(), tools: [{}] }).error === 'bad_request');
check('worker validate: >2 MB image rejected as too_big', validateBody(goodBody(Math.ceil(2.1 * 1024 * 1024 * 4 / 3))).error === 'too_big');
check('worker validate: two images rejected', validateBody({ contents: [{ parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }, { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }] }] }).error === 'bad_request');
check('worker validate: non-image mime rejected', validateBody({ contents: [{ parts: [{ inlineData: { mimeType: 'application/pdf', data: 'AAAA' } }] }] }).error === 'bad_request');
check('worker validate: model role rejected', validateBody({ contents: [{ role: 'model', parts: [{ text: 'x' }] }] }).error === 'bad_request');

let upstreamCalls = [];
let upstreamStatus = [200];
globalThis.fetch = async (url, init) => { upstreamCalls.push({ url, key: init.headers['x-goog-api-key'], body: JSON.parse(init.body) }); const s = upstreamStatus.shift() ?? 200; return new Response(s === 200 ? JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }] }) : `{"error":{"message":"API key not valid SECRET"}}`, { status: s }); };
const call = async (r) => { const res = await worker.fetch(r, env); return { status: res.status, cors: res.headers.get('access-control-allow-origin'), body: await res.json().catch(() => null) }; };

let r = await call(req(GH, goodBody()));
check('worker: happy path 200 + CORS for test origin', r.status === 200 && r.cors === GH.Origin && r.body.candidates);
check('worker: key added server-side via header, not URL', upstreamCalls[0].key === 'SECRET-KEY' && !upstreamCalls[0].url.includes('SECRET'));
check('worker: house voice appended to the system instruction', upstreamCalls[0].body.systemInstruction.parts.length === 2 && /2-6 words/.test(upstreamCalls[0].body.systemInstruction.parts[1].text));
r = await call(req({ Origin: 'https://evil.com' }, goodBody()));
check('worker: bad origin → 403 friendly JSON', r.status === 403 && r.body.error.code === 'bad_origin' && !r.cors);
r = await call(req(GH, goodBody(), '/v1beta/models/gemini-3.1-pro-preview:generateContent'));
check('worker: non-allowlisted model → 400 bad_model', r.status === 400 && r.body.error.code === 'bad_model');
r = await call(req(GH, goodBody(), '/v1beta/models/gemini-flash-latest:streamGenerateContent'));
check('worker: other endpoint → 404', r.status === 404);
r = await call(req(GH, goodBody(), '/v1beta/models/gemini-flash-latest:generateContent?key=x'));
check('worker: query string rejected', r.status === 400);
upstreamCalls = []; upstreamStatus = [404, 200];
r = await call(req(GH, goodBody()));
check('worker: gemini-flash-latest 404 → falls back to gemini-3.5-flash-lite', r.status === 200 && upstreamCalls.length === 2 && upstreamCalls[1].url.includes('gemini-3.5-flash-lite'));
upstreamStatus = [400];
r = await call(req(GH, goodBody()));
check('worker: upstream bad key mapped, raw Google error not leaked', r.status === 502 && r.body.error.code === 'upstream_auth' && !JSON.stringify(r.body).includes('SECRET'));
upstreamStatus = [429];
r = await call(req(GH, goodBody()));
check('worker: upstream 429 → friendly quota', r.status === 429 && r.body.error.code === 'upstream_quota');
r = await call(req(GH, goodBody()));   // 11th request this minute
for (let i = 0; i < 8; i++) r = await call(req(GH, goodBody()));
check('worker: per-minute rate limit → 429 rate_minute', r.status === 429 && r.body.error.code === 'rate_minute');
env.RL_MINUTE.n = 0; env.DAILY_LIMIT = '2'; env.RL_DAILY.m.clear(); upstreamStatus = [];
await call(req(GH, goodBody())); await call(req(GH, goodBody())); r = await call(req(GH, goodBody()));
check('worker: per-day limit → 429 rate_day', r.status === 429 && r.body.error.code === 'rate_day');
env.DAILY_LIMIT = '100'; env.RL_MINUTE.n = 0;
r = await call(req(GH, null, '/v1beta/models/gemini-flash-latest:generateContent', 'OPTIONS'));
check('worker: preflight OK for test origin', r.status === 204 && r.cors === GH.Origin);
r = await call(req(GH, goodBody(Math.ceil(2.2 * 1024 * 1024 * 4 / 3))));
check('worker: oversized image → 413 too_big', r.status === 413 && r.body.error.code === 'too_big');
r = await worker.fetch(req(GH, goodBody()), { ...env, GEMINI_API_KEY: '' }).then((x) => x.json());
check('worker: missing secret → not_configured', r.error.code === 'not_configured');

// ───────── Google Apps Script ─────────
function gasSandbox({ key = 'SECRET-KEY', token = null, statuses = [] } = {}) {
  const props = new Map(Object.entries({ GEMINI_API_KEY: key, ...(token ? { APP_TOKEN: token } : {}) }).filter(([, v]) => v));
  const cache = new Map();
  const fetches = [];
  const sb = {
    console,
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ text: s, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k), getKeys: () => [...props.keys()] }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => 'America/Los_Angeles' },
    Utilities: { formatDate: (d, tz, f) => (f === 'yyyyMMdd' ? '20261005' : '202610050101') },
    UrlFetchApp: { fetch: (url, opt) => { fetches.push({ url, opt }); const s = statuses.shift() ?? 200; return { getResponseCode: () => s, getContentText: () => (s === 200 ? '{"candidates":[{"content":{"parts":[{"text":"{}"}]}}]}' : '{"error":{"message":"API key not valid SECRET"}}') }; } },
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(new URL('../relay-gas/Code.gs', import.meta.url), 'utf8'), sb);
  const post = (obj) => JSON.parse(sb.doPost({ postData: { contents: typeof obj === 'string' ? obj : JSON.stringify(obj) } }).text);
  return { sb, post, props, cache, fetches };
}
const msg = (extra = {}) => ({ v: 1, model: 'gemini-flash-latest', request: goodBody(), clientId: 'abc123def456', ...extra });

let g = gasSandbox();
r = g.post(msg());
check('gas: happy path ok:true with Gemini data', r.ok === true && r.data.candidates && r.model === 'gemini-flash-latest');
check('gas: old clients asking for gemini-2.5-flash are mapped to the primary', gasSandbox().post(msg({ model: 'gemini-2.5-flash' })).model === 'gemini-flash-latest');
check('gas: key sent as header from Script Properties, not in URL', g.fetches[0].opt.headers['x-goog-api-key'] === 'SECRET-KEY' && !g.fetches[0].url.includes('SECRET'));
check('gas: output tokens capped', JSON.parse(g.fetches[0].opt.payload).generationConfig.maxOutputTokens === 4096);
{
  const sys = JSON.parse(g.fetches[0].opt.payload).systemInstruction.parts;
  check('gas: house voice appended to copy requests (2–6 word verdict, no puns)', sys.length === 2 && sys[0].text === 'sys' && /2-6 words/.test(sys[1].text) && /No puns/.test(sys[1].text));
  const g2 = gasSandbox();
  g2.post(msg({ request: { ...goodBody(), systemInstruction: { parts: [{ text: 'You are a careful kitchen inventory assistant' }] } } }));
  check('gas: fridge scan prompt left untouched (no voice rule)', JSON.parse(g2.fetches[0].opt.payload).systemInstruction.parts.length === 1);
  const cs = fs.readFileSync(new URL('../relay-gas/Code.gs', import.meta.url), 'utf8');
  check('gas: server caps unchanged (8/min, 200/day, 4/min, 40/day per client)', /GLOBAL_PER_MIN = 8;/.test(cs) && /GLOBAL_PER_DAY = 200;/.test(cs) && /CLIENT_PER_MIN = 4;/.test(cs) && /CLIENT_PER_DAY = 40;/.test(cs));
}
check('gas: doGet health reveals nothing secret', !g.sb.doGet().text.includes('SECRET') && JSON.parse(g.sb.doGet().text).configured === true);
check('gas: bad JSON → bad_request', g.post('not json').error.code === 'bad_request');
check('gas: non-allowlisted model → bad_request', g.post(msg({ model: 'gemini-3.1-pro-preview' })).error.code === 'bad_request');
check('gas: tools rejected', g.post(msg({ request: { ...goodBody(), tools: [{}] } })).error.code === 'bad_request');
check('gas: image base64 > 2.5 MB → too_big', g.post(msg({ request: goodBody(Math.floor(2.6 * 1024 * 1024)) })).error.code === 'too_big');
check('gas: image base64 2.4 MB accepted', gasSandbox().post(msg({ request: goodBody(Math.floor(2.4 * 1024 * 1024)) })).ok === true);
g = gasSandbox({ token: 'tok' });
check('gas: APP_TOKEN mismatch → forbidden', g.post(msg()).error.code === 'forbidden' && g.post(msg({ token: 'tok' })).ok === true);
g = gasSandbox({ statuses: [404, 200] });
r = g.post(msg());
check('gas: gemini-flash-latest 404 → fallback to gemini-3.5-flash-lite', r.ok && r.model === 'gemini-3.5-flash-lite' && g.fetches[1].url.includes('gemini-3.5-flash-lite'));
check('gas: fallback reply names the skipped model + HTTP status only', JSON.stringify(r.skipped) === JSON.stringify([{ model: 'gemini-flash-latest', status: 404 }]));
g = gasSandbox({ statuses: [200] }); r = g.post(msg());
check('gas: no skipped field when the primary works', r.ok && r.model === 'gemini-flash-latest' && !('skipped' in r));
g = gasSandbox({ statuses: [429] });
check('gas: Gemini 429 → quota', g.post(msg()).error.code === 'quota');
g = gasSandbox({ statuses: [400] });
r = g.post(msg());
check('gas: bad key → upstream, raw error not leaked', r.error.code === 'upstream' && !JSON.stringify(r).includes('SECRET'));
g = gasSandbox();

for (let i = 0; i < 4; i++) g.post(msg());
r = g.post(msg());
check('gas: per-client soft limit (4/min) → quota', r.error?.code === 'quota');
g = gasSandbox();
const res8 = []; for (let i = 0; i < 9; i++) res8.push(g.post(msg({ clientId: 'client' + i })).ok);
check('gas: global limit 8/min → 9th is quota', res8.slice(0, 8).every(Boolean) && res8[8] === false);
g = gasSandbox(); g.props.set('RL_DAY_20261005', '200');
r = g.post(msg());
check('gas: global daily limit 200 → quota with daily message', r.error.code === 'quota' && /daily limit/.test(r.error.message));
g = gasSandbox({ key: '' });
check('gas: no key configured → upstream not set up message', /isn’t set up/.test(g.post(msg()).error.message));
check('gas: setKey_ is private (underscore) and stores the key', typeof gasSandbox().sb.setKey_ === 'function' && (() => { const s = gasSandbox({ key: '' }); s.sb.setKey_(' NEWKEY '); return s.props.get('GEMINI_API_KEY') === 'NEWKEY'; })());
const manifest = JSON.parse(fs.readFileSync(new URL('../relay-gas/appsscript.json', import.meta.url)));
check('gas manifest: V8, USER_DEPLOYING, ANYONE_ANONYMOUS, only external_request scope', manifest.runtimeVersion === 'V8' && manifest.webapp.executeAs === 'USER_DEPLOYING' && manifest.webapp.access === 'ANYONE_ANONYMOUS' && JSON.stringify(manifest.oauthScopes) === '["https://www.googleapis.com/auth/script.external_request"]');
const src = fs.readFileSync(new URL('../relay-gas/Code.gs', import.meta.url), 'utf8') + fs.readFileSync(new URL('../relay/worker.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../config.js', import.meta.url), 'utf8');
check('no API key literal in relay sources or site config', !/AIza[0-9A-Za-z_-]{20,}/.test(src));

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
