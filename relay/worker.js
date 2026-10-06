// Snootfood relay: a tiny Cloudflare Worker that lets the TEST site use Gemini without ever
// putting the API key in the browser.
//
//  - Key: Worker secret GEMINI_API_KEY (never in code, never sent to the client).
//  - Who: only browsers on https://autoprod-dev.github.io/snootfood-test… (Origin + Referer path),
//         plus http://localhost / 127.0.0.1 while ALLOW_LOCALHOST = "true".
//  - What: only POST /v1beta/models/<allowed model>:generateContent, JSON body, at most one image
//          (JPEG/PNG/WebP, ≤ 2 MB), no tools, capped output tokens.
//  - How much: 10 requests/minute per IP (Rate Limiting binding) and 100/day per IP (KV counter).
//  - Errors: always friendly JSON: { "error": { "code": "...", "message": "..." } }.
//
// Note: Origin/Referer checks stop other websites from using the relay from a browser, but a
// determined script can fake those headers. The per-IP limits and the Google-side quota on the key
// are the real backstop, so keep the key restricted to the Generative Language API.

const ALLOWED_ORIGIN = 'https://autoprod-dev.github.io';
const ALLOWED_PATH_PREFIX = '/snootfood-test';
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const ALLOWED_MODELS = ['gemini-flash-latest', 'gemini-3.5-flash-lite'];
const PRIMARY_MODEL = 'gemini-flash-latest';     // gemini-2.5-flash is closed to new users
const FALLBACK_MODEL = 'gemini-3.5-flash-lite';  // used if the primary returns 404/5xx
const UPSTREAM = 'https://generativelanguage.googleapis.com';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = 3 * 1024 * 1024;   // 2 MB image ≈ 2.7 MB as base64, plus prompt
const MAX_TEXT_CHARS = 20000;
const MAX_OUTPUT_TOKENS = 4096;
const DAILY_LIMIT_DEFAULT = 100;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VOICE_RULE = 'House voice (added by the relay, always applies): dry, deadpan and short, like a judgy friend. Any verdict or headline is 2-6 words and names something actually visible or listed. Good and fix lines are 8 words max. No puns, no fake French, no emoji, no exclamation marks.';
// Appends the house voice to copy-writing requests; fridge scans (inventory prompt) stay as they are.
export function withVoice(sys) {
  const parts = sys?.parts || [];
  const text = parts.map((p) => p?.text || '').join('');
  if (/inventory assistant/i.test(text) || text.includes('House voice (added by the relay')) return sys;
  return { parts: [...parts, { text: VOICE_RULE }] };
}
const ALLOWED_BODY_KEYS = ['contents', 'systemInstruction', 'generationConfig', 'safetySettings'];
const ALLOWED_GEN_KEYS = ['responseMimeType', 'responseSchema', 'temperature', 'maxOutputTokens', 'topP', 'topK'];

const MESSAGES = {
  bad_origin: 'This kitchen only serves the Snootfood test site.',
  not_found: 'Nothing on the menu here.',
  method: 'This kitchen only takes POST orders.',
  bad_model: 'That model isn’t on the menu here.',
  too_big: 'Photo’s too big (2 MB max). Try a smaller one.',
  bad_request: 'Scrambled request. Try again.',
  rate_minute: 'Too many in a minute. Try again shortly.',
  rate_day: 'Real reads hit the daily limit. Back tomorrow.',
  upstream_quota: 'Busy kitchen. Try again later.',
  upstream_auth: 'Kitchen key isn’t working. Demo for now.',
  upstream_blocked: 'Chef passed on that one. Different photo.',
  upstream_error: 'The AI is having a moment. Try again.',
  not_configured: 'Photo reading isn’t set up yet. Demo for now.',
};

function corsHeaders(origin) {
  return origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  } : { Vary: 'Origin' };
}

function json(status, body, origin, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...corsHeaders(origin), ...extra },
  });
}
const fail = (status, code, origin, extra) => json(status, { error: { code, message: MESSAGES[code] || MESSAGES.upstream_error } }, origin, extra);

// Origin must be the GitHub Pages host (or localhost in testing). For the GitHub host we also
// require the Referer path to start with /snootfood-test, so other autoprod-dev pages can't use it.
export function originAllowed(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (env.ALLOW_LOCALHOST === 'true' && LOCAL_ORIGIN.test(origin)) return origin;
  if (origin !== ALLOWED_ORIGIN) return null;
  const referer = request.headers.get('Referer') || '';
  let path = '';
  try { const u = new URL(referer); if (u.origin !== ALLOWED_ORIGIN) return null; path = u.pathname; } catch { return null; }
  if (path === ALLOWED_PATH_PREFIX || path.startsWith(ALLOWED_PATH_PREFIX + '/')) return origin;
  return null;
}

const base64Bytes = (b64) => Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

// Returns a cleaned body to forward, or an error code.
export function validateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'bad_request' };
  for (const k of Object.keys(body)) if (!ALLOWED_BODY_KEYS.includes(k)) return { error: 'bad_request' };
  const { contents, systemInstruction, generationConfig = {}, safetySettings } = body;
  if (!Array.isArray(contents) || contents.length < 1 || contents.length > 2) return { error: 'bad_request' };
  let images = 0, chars = 0;
  const textOf = (parts) => {
    if (!Array.isArray(parts) || parts.length > 4) return false;
    for (const p of parts) {
      if (!p || typeof p !== 'object') return false;
      const keys = Object.keys(p);
      if (keys.length === 1 && typeof p.text === 'string') { chars += p.text.length; continue; }
      if (keys.length === 1 && p.inlineData && typeof p.inlineData.data === 'string' && IMAGE_TYPES.includes(p.inlineData.mimeType)) {
        images++;
        if (base64Bytes(p.inlineData.data) > MAX_IMAGE_BYTES) return 'too_big';
        if (!/^[A-Za-z0-9+/=]+$/.test(p.inlineData.data.slice(0, 1000))) return false;
        continue;
      }
      return false;
    }
    return true;
  };
  for (const c of contents) {
    if (!c || typeof c !== 'object' || (c.role && c.role !== 'user')) return { error: 'bad_request' };
    const r = textOf(c.parts);
    if (r === 'too_big') return { error: 'too_big' };
    if (!r) return { error: 'bad_request' };
  }
  if (systemInstruction !== undefined) {
    const r = textOf(systemInstruction?.parts);
    if (r !== true) return { error: 'bad_request' };
  }
  if (images > 1 || chars > MAX_TEXT_CHARS) return { error: 'bad_request' };
  if (typeof generationConfig !== 'object' || Array.isArray(generationConfig)) return { error: 'bad_request' };
  const gen = {};
  for (const [k, v] of Object.entries(generationConfig)) {
    if (!ALLOWED_GEN_KEYS.includes(k)) return { error: 'bad_request' };
    gen[k] = v;
  }
  gen.maxOutputTokens = Math.min(Number(gen.maxOutputTokens) || 2048, MAX_OUTPUT_TOKENS);
  if (gen.temperature !== undefined) gen.temperature = Math.max(0, Math.min(2, Number(gen.temperature) || 1));
  const clean = { contents, generationConfig: gen };
  if (systemInstruction) clean.systemInstruction = withVoice(systemInstruction);
  if (Array.isArray(safetySettings) && safetySettings.length <= 6) clean.safetySettings = safetySettings;
  return { body: clean };
}

async function dailyCount(env, ip) {
  if (!env.RL_DAILY) return { ok: true };
  const limit = Number(env.DAILY_LIMIT) || DAILY_LIMIT_DEFAULT;
  const key = `d:${new Date().toISOString().slice(0, 10)}:${ip}`;
  const n = Number(await env.RL_DAILY.get(key)) || 0;
  if (n >= limit) return { ok: false };
  // KV is eventually consistent, so this is an approximate cap, which is fine for abuse protection.
  await env.RL_DAILY.put(key, String(n + 1), { expirationTtl: 60 * 60 * 48 });
  return { ok: true };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = originAllowed(request, env);

    if (request.method === 'OPTIONS') {
      return origin ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : fail(403, 'bad_origin', null);
    }
    if (request.method === 'GET' && url.pathname === '/health') return json(200, { ok: true }, origin);
    if (!origin) return fail(403, 'bad_origin', null);
    if (request.method !== 'POST') return fail(405, 'method', origin);

    const m = url.pathname.match(/^\/v1beta\/models\/([a-z0-9.-]+):generateContent$/);
    if (!m) return fail(404, 'not_found', origin);
    if (!ALLOWED_MODELS.includes(m[1])) return fail(400, 'bad_model', origin);
    if (url.search) return fail(400, 'bad_request', origin);   // no ?key=… or other passthroughs
    if (!env.GEMINI_API_KEY) return fail(503, 'not_configured', origin);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.RL_MINUTE) {
      const { success } = await env.RL_MINUTE.limit({ key: ip });
      if (!success) return fail(429, 'rate_minute', origin, { 'retry-after': '60' });
    }

    const len = Number(request.headers.get('content-length') || 0);
    if (len > MAX_BODY_BYTES) return fail(413, 'too_big', origin);
    if (!(request.headers.get('content-type') || '').includes('application/json')) return fail(415, 'bad_request', origin);
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return fail(413, 'too_big', origin);
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return fail(400, 'bad_request', origin); }
    const v = validateBody(parsed);
    if (v.error) return fail(v.error === 'too_big' ? 413 : 400, v.error, origin);

    if (!(await dailyCount(env, ip)).ok) return fail(429, 'rate_day', origin, { 'retry-after': '3600' });

    const call = (model) => fetch(`${UPSTREAM}/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(v.body),
    });
    let up;
    try {
      up = await call(m[1]);
      if ((up.status === 404 || up.status >= 500) && m[1] === PRIMARY_MODEL) up = await call(FALLBACK_MODEL);
    } catch {
      return fail(502, 'upstream_error', origin);
    }
    const text = await up.text();
    if (up.ok) return new Response(text, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders(origin) } });
    // Never echo Google's raw error back (it can mention the key or project); map it instead.
    if (up.status === 429) return fail(429, 'upstream_quota', origin, { 'retry-after': '60' });
    if (up.status === 401 || up.status === 403 || (up.status === 400 && /api key|API_KEY/i.test(text))) return fail(502, 'upstream_auth', origin);
    if (up.status === 400) return fail(400, 'bad_request', origin);
    return fail(502, 'upstream_error', origin);
  },
};
