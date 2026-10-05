# Snootfood relay: Google Apps Script version

A tiny Apps Script web app that lets the Snootfood **TEST** site use Gemini without the API key
ever touching the browser. The key lives only in this script's **Script Properties**.

## Files

- `Code.gs`: `doPost` (the relay), `doGet` (health check), private helpers, and `setKey_()`.
- `appsscript.json`: V8 runtime, web app executes as the deploying user (the Autoprod account),
  access `ANYONE_ANONYMOUS`, and only one OAuth scope: `script.external_request` (needed for UrlFetchApp).
  CacheService, LockService and PropertiesService need no extra scopes.

## Set the key (never in source)

Recommended: Apps Script editor → **Project Settings** (gear) → **Script Properties** → **Add script property**

| Property | Value |
| --- | --- |
| `GEMINI_API_KEY` | your Gemini API key from https://aistudio.google.com/apikey |
| `APP_TOKEN` (optional) | any random string; must match `relayToken` in the site's `config.js` |

`setKey_()` in `Code.gs` is a private one-off helper (trailing underscore = not callable from the web
or `google.script.run`, not in the Run menu). Only use it if you can't use the UI, and follow the
comment above it (temporary wrapper, run once, delete the wrapper and key).

## Deploy (clasp)

```bash
npm i -g @google/clasp
clasp login                                   # as the Autoprod Google account
cd relay-gas
clasp create --type standalone --title "Snootfood relay" --rootDir .   # first time only (creates .clasp.json)
clasp push -f
clasp deploy --description "snootfood relay v1"   # prints the deployment ID
```

Then the web app URL is `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`.
First deploy: open the script once in the editor and run `doGet` (or open the URL) to approve the
`external_request` scope for the Autoprod account. Later updates: `clasp push -f && clasp deploy -i <DEPLOYMENT_ID>`
to keep the same URL.

Smoke test (should print `{"ok":true,...,"configured":true}`):

```bash
curl -sL "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec"
```

Then set `relayUrl` in the site's `config.js` to that `/exec` URL and push the TEST site.

## Protocol

POST body (sent as `Content-Type: text/plain` so browsers skip the CORS preflight; the app follows
Apps Script's 302 redirect to `script.googleusercontent.com`):

```json
{ "v": 1, "model": "gemini-2.5-flash", "request": { "contents": [], "generationConfig": {} },
  "clientId": "random id from localStorage", "token": "optional APP_TOKEN" }
```

Reply (always HTTP 200; Apps Script can't set status codes):

```json
{ "ok": true, "model": "gemini-2.5-flash", "data": { "candidates": [] } }
{ "ok": false, "error": { "code": "quota | too_big | bad_request | upstream | forbidden", "message": "friendly text" } }
```

## Limits and protection

- Models: `gemini-2.5-flash`, falling back to `gemini-flash-latest` if 2.5 Flash returns 404/5xx
  (Google currently limits 2.5 models to keys that already used them, so a brand-new key may hit the fallback).
- Image: base64 ≤ 2.5 MB, max one image, text ≤ 20k chars, output ≤ 4096 tokens, no tools.
- Global: 8 requests/minute and 200/day (day = Pacific time, matching the Gemini free-tier reset).
- Per client (random id the app keeps in localStorage): soft 4/minute and 40/day. It's "soft" because a
  client can clear its id; the global limit is the hard cap.
- Apps Script can't read request headers, so there is no Origin check. `APP_TOKEN` is visible in the
  site's code, so it only stops casual reuse. The real protection is the global cap plus the
  Google-side quota on the key. Use a key in its own Google Cloud project with only the Generative
  Language API enabled, so a leak or abuse can't touch anything else.
- Google's raw error text is never passed through to the browser.
