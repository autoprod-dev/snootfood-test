# Snootfood relay: Cloudflare Worker version

Alternative to `relay-gas/` (Apps Script). Same job: keep the Gemini key out of the browser.

- Key: Worker secret `GEMINI_API_KEY` (never in code or `wrangler.toml`).
- Only accepts browsers whose `Origin` is `https://autoprod-dev.github.io` **and** whose `Referer` path
  starts with `/snootfood-test` (the app sends the full page URL to the relay for this), plus
  `http://localhost` / `127.0.0.1` while `ALLOW_LOCALHOST = "true"`.
- Only `POST /v1beta/models/{gemini-2.5-flash | gemini-flash-latest | gemini-3.5-flash-lite}:generateContent`,
  JSON, one image max (JPEG/PNG/WebP, ≤ 2 MB), no tools, output ≤ 4096 tokens. `gemini-2.5-flash` falls back to `gemini-flash-latest` on 404/5xx.
- 10 requests/minute per IP (Workers Rate Limiting binding, Free plan OK) and ~100/day per IP (KV counter;
  KV Free allows 1,000 writes/day, so that's also a ~1,000 requests/day overall ceiling).
- Friendly JSON errors: `{ "error": { "code", "message" } }`. Google's raw errors are never passed through.

## Deploy

```bash
cd relay
npx wrangler@latest login
npx wrangler kv namespace create RL_DAILY        # paste the printed id into wrangler.toml
npx wrangler secret put GEMINI_API_KEY           # paste the key when prompted
npx wrangler deploy                              # prints https://snootfood-relay.<subdomain>.workers.dev
curl -s https://snootfood-relay.<subdomain>.workers.dev/health
```

Then set `relayUrl` in the site's `config.js` to that URL. After testing, set `ALLOW_LOCALHOST = "false"`
and redeploy. Local dev: copy `.dev.vars.example` to `.dev.vars` and run `npx wrangler dev`.
