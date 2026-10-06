/**
 * Snootfood relay: Google Apps Script web app.
 *
 * Lets the Snootfood TEST site use Gemini without the API key ever reaching the browser.
 *
 *  - Deploy: web app, execute as the deploying user (the Autoprod account), access "Anyone" (anonymous).
 *  - Key: Script Properties -> GEMINI_API_KEY. Never in source, never returned to the client.
 *  - Request: POST, body = JSON sent as Content-Type text/plain (a "simple" request, so no CORS preflight):
 *      { "v": 1, "model": "gemini-flash-latest", "request": { ...Gemini generateContent body... },
 *        "clientId": "random id from the app's localStorage", "token": "optional APP_TOKEN" }
 *  - Response: always HTTP 200 (Apps Script can't set status codes), JSON:
 *      { "ok": true,  "data": { ...Gemini response... }, "model": "<model used>" }
 *      { "ok": false, "error": { "code": "quota|too_big|bad_request|upstream|forbidden", "message": "friendly text" } }
 *  - Limits: global 8/min and 200/day (under the Gemini free tier), soft per-client 4/min and 40/day,
 *    image base64 ≤ 2.5 MB, one image max, no tools, capped output tokens, allowlisted models only.
 *
 * Apps Script web apps can't see request headers (no Origin/Referer), so there is no origin check here.
 * The optional APP_TOKEN travels in the JSON body (`token`) and is visible in the site's code, so it is
 * light protection only. The real protection is the global limit + the Google-side quota on the key.
 */

var MODEL_PRIMARY = 'gemini-flash-latest';   // gemini-2.5-flash is closed to new users
var MODEL_FALLBACK = 'gemini-3.5-flash-lite'; // only used if the primary returns 404/5xx
var ALLOWED_MODELS = [MODEL_PRIMARY, MODEL_FALLBACK];
var UPSTREAM = 'https://generativelanguage.googleapis.com/v1beta/models/';

var MAX_IMAGE_B64_CHARS = Math.floor(2.5 * 1024 * 1024);
var MAX_TEXT_CHARS = 20000;
var MAX_OUTPUT_TOKENS = 4096;
var GLOBAL_PER_MIN = 8;
var GLOBAL_PER_DAY = 200;
var CLIENT_PER_MIN = 4;
var CLIENT_PER_DAY = 40;

var IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
var BODY_KEYS = ['contents', 'systemInstruction', 'generationConfig', 'safetySettings'];
var VOICE_RULE = 'House voice (added by the relay, always applies): dry, deadpan and short, like a judgy friend. Any verdict or headline is 2-6 words and names something actually visible or listed. Good and fix lines are 8 words max. No puns, no fake French, no emoji, no exclamation marks.';
var GEN_KEYS = ['responseMimeType', 'responseSchema', 'temperature', 'maxOutputTokens', 'topP', 'topK'];

var MESSAGES = {
  quota: 'Busy kitchen. Try again in a minute.',
  quota_day: 'Real reads hit the daily limit. Back tomorrow.',
  too_big: 'Photo’s too big. Try a smaller one.',
  bad_request: 'Scrambled request. Try again.',
  forbidden: 'This kitchen only serves Snootfood.',
  upstream: 'The AI is having a moment. Try again.',
  upstream_auth: 'Kitchen key isn’t working. Demo for now.',
  upstream_blocked: 'Chef passed on that one. Different photo.',
  not_configured: 'Photo reading isn’t set up yet. Demo for now.'
};

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(code, messageKey) {
  return reply_({ ok: false, error: { code: code, message: MESSAGES[messageKey || code] || MESSAGES.upstream } });
}

/** Health check. Reveals nothing sensitive. */
function doGet() {
  return reply_({ ok: true, service: 'snootfood-relay', configured: !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') });
}

function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var key = props.getProperty('GEMINI_API_KEY');
    if (!key) return fail_('upstream', 'not_configured');

    var raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > MAX_IMAGE_B64_CHARS + 200000) return fail_(raw ? 'too_big' : 'bad_request');
    var msg;
    try { msg = JSON.parse(raw); } catch (err) { return fail_('bad_request'); }
    if (!msg || typeof msg !== 'object') return fail_('bad_request');

    var appToken = props.getProperty('APP_TOKEN');
    if (appToken && msg.token !== appToken) return fail_('forbidden');

    var model = String(msg.model || MODEL_PRIMARY);
    if (model === 'gemini-2.5-flash') model = MODEL_PRIMARY;   // older clients
    if (ALLOWED_MODELS.indexOf(model) < 0) return fail_('bad_request');

    var v = validate_(msg.request);
    if (v.error) return fail_(v.error);

    var clientId = String(msg.clientId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'anon';
    var limit = takeToken_(clientId);
    if (limit) return fail_('quota', limit);

    var models = model === MODEL_PRIMARY ? [MODEL_PRIMARY, MODEL_FALLBACK] : [model];
    var last = null, skipped = [];
    for (var i = 0; i < models.length; i++) {
      var res = callGemini_(models[i], v.body, key);
      if (res.ok) return reply_(skipped.length ? { ok: true, model: models[i], skipped: skipped, data: res.data } : { ok: true, model: models[i], data: res.data });
      skipped.push({ model: models[i], status: res.status || 0 });   // HTTP status only, never Google's text
      last = res;
      if (!res.tryFallback) break;
    }
    return fail_(last.code, last.messageKey);
  } catch (err) {
    console.error('relay error: ' + (err && err.message));
    return fail_('upstream');
  }
}

/** Checks the Gemini request body and returns a cleaned copy (or an error code). */
function validate_(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'bad_request' };
  for (var k in body) if (BODY_KEYS.indexOf(k) < 0) return { error: 'bad_request' };
  var contents = body.contents;
  if (!Array.isArray(contents) || contents.length < 1 || contents.length > 2) return { error: 'bad_request' };
  var counts = { images: 0, chars: 0 };

  function checkParts(parts) {
    if (!Array.isArray(parts) || parts.length < 1 || parts.length > 4) return 'bad_request';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p || typeof p !== 'object') return 'bad_request';
      var keys = Object.keys(p);
      if (keys.length === 1 && typeof p.text === 'string') { counts.chars += p.text.length; continue; }
      if (keys.length === 1 && p.inlineData && typeof p.inlineData.data === 'string' && IMAGE_TYPES.indexOf(p.inlineData.mimeType) >= 0) {
        counts.images++;
        if (p.inlineData.data.length > MAX_IMAGE_B64_CHARS) return 'too_big';
        if (!/^[A-Za-z0-9+\/=]+$/.test(p.inlineData.data.slice(0, 1000))) return 'bad_request';
        continue;
      }
      return 'bad_request';
    }
    return '';
  }

  for (var c = 0; c < contents.length; c++) {
    var item = contents[c];
    if (!item || typeof item !== 'object' || (item.role && item.role !== 'user')) return { error: 'bad_request' };
    var r = checkParts(item.parts);
    if (r) return { error: r };
  }
  if (body.systemInstruction !== undefined) {
    var s = checkParts(body.systemInstruction && body.systemInstruction.parts);
    if (s) return { error: 'bad_request' };
  }
  if (counts.images > 1 || counts.chars > MAX_TEXT_CHARS) return { error: counts.images > 1 ? 'bad_request' : 'too_big' };

  var gen = {};
  var g = body.generationConfig || {};
  if (typeof g !== 'object' || Array.isArray(g)) return { error: 'bad_request' };
  for (var gk in g) {
    if (GEN_KEYS.indexOf(gk) < 0) return { error: 'bad_request' };
    gen[gk] = g[gk];
  }
  gen.maxOutputTokens = Math.min(Number(gen.maxOutputTokens) || 2048, MAX_OUTPUT_TOKENS);
  if (gen.temperature !== undefined) gen.temperature = Math.max(0, Math.min(2, Number(gen.temperature) || 1));

  var clean = { contents: contents, generationConfig: gen };
  if (body.systemInstruction) clean.systemInstruction = withVoice_(body.systemInstruction);
  if (Array.isArray(body.safetySettings) && body.safetySettings.length <= 6) clean.safetySettings = body.safetySettings;
  return { body: clean };
}

/**
 * Appends the house voice to every copy-writing request. Fridge scans (the
 * inventory prompt) are about accuracy, so they are left alone.
 */
function withVoice_(sys) {
  var parts = (sys && sys.parts) || [];
  var text = '';
  for (var i = 0; i < parts.length; i++) text += (parts[i] && parts[i].text) || '';
  if (/inventory assistant/i.test(text) || text.indexOf('House voice (added by the relay') >= 0) return sys;
  return { parts: parts.concat([{ text: VOICE_RULE }]) };
}

/**
 * Rate limits. Returns '' if allowed, or a MESSAGES key if not.
 * Global per-minute + per-client counters live in CacheService; the global daily counter lives in
 * Script Properties (cache entries expire after 6 h at most). The day follows the script time zone
 * (America/Los_Angeles, same as the Gemini free-tier reset).
 */
function takeToken_(clientId) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return 'quota';
  try {
    var cache = CacheService.getScriptCache();
    var props = PropertiesService.getScriptProperties();
    var now = new Date();
    var minute = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMddHHmm');
    var day = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd');

    var gMinKey = 'g:m:' + minute;
    var gMin = Number(cache.get(gMinKey)) || 0;
    if (gMin >= GLOBAL_PER_MIN) return 'quota';

    var cMinKey = 'c:m:' + clientId + ':' + minute;
    var cMin = Number(cache.get(cMinKey)) || 0;
    if (cMin >= CLIENT_PER_MIN) return 'quota';

    var cDayKey = 'c:d:' + clientId + ':' + day;
    var cDay = Number(cache.get(cDayKey)) || 0;     // soft: cache can forget after 6 h
    if (cDay >= CLIENT_PER_DAY) return 'quota_day';

    var gDayKey = 'RL_DAY_' + day;
    var gDay = Number(props.getProperty(gDayKey)) || 0;
    if (gDay >= GLOBAL_PER_DAY) return 'quota_day';

    cache.put(gMinKey, String(gMin + 1), 120);
    cache.put(cMinKey, String(cMin + 1), 120);
    cache.put(cDayKey, String(cDay + 1), 21600);
    props.setProperty(gDayKey, String(gDay + 1));
    // Tidy up yesterday's (and older) daily counters.
    var all = props.getKeys();
    for (var i = 0; i < all.length; i++) if (all[i].indexOf('RL_DAY_') === 0 && all[i] !== gDayKey) props.deleteProperty(all[i]);
    return '';
  } finally {
    lock.releaseLock();
  }
}

function callGemini_(model, body, key) {
  var resp;
  try {
    resp = UrlFetchApp.fetch(UPSTREAM + encodeURIComponent(model) + ':generateContent', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': key },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
      followRedirects: true
    });
  } catch (err) {
    return { ok: false, code: 'upstream', messageKey: 'upstream', tryFallback: true };
  }
  var status = resp.getResponseCode();
  var text = resp.getContentText();
  if (status === 200) {
    try { return { ok: true, data: JSON.parse(text) }; } catch (err) { return { ok: false, status: status, code: 'upstream', messageKey: 'upstream', tryFallback: false }; }
  }
  // Never pass Google's raw error text to the client (it can mention the project or key).
  console.warn('gemini ' + model + ' -> ' + status);
  var r = callGeminiError_(status, text); r.status = status; return r;
}

function callGeminiError_(status, text) {
  if (status === 429) return { ok: false, code: 'quota', messageKey: 'quota', tryFallback: false };
  if (status === 401 || status === 403 || (status === 400 && /api key|API_KEY/i.test(text))) return { ok: false, code: 'upstream', messageKey: 'upstream_auth', tryFallback: false };
  if (status === 404 || status >= 500) return { ok: false, code: 'upstream', messageKey: 'upstream', tryFallback: true };
  if (status === 400) return { ok: false, code: 'bad_request', messageKey: 'bad_request', tryFallback: false };
  return { ok: false, code: 'upstream', messageKey: 'upstream', tryFallback: false };
}

/**
 * One-off helper to store the key from the editor, if you prefer code over the Script Properties UI.
 * The trailing underscore makes it private: it is NOT callable from the web app or google.script.run,
 * and it does not show in the editor's Run menu. To use it: temporarily add
 *   function runOnce() { setKey_('YOUR_KEY'); }
 * run runOnce once, then DELETE runOnce (and the key) from the file before saving/pushing.
 * Recommended instead: Project Settings -> Script Properties -> add GEMINI_API_KEY.
 */
function setKey_(key) {
  if (!key || typeof key !== 'string') throw new Error('Pass the key as a string.');
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key.trim());
  return 'GEMINI_API_KEY saved to Script Properties.';
}
