# Snootfood (TEST)

*Every meal deserves a menu.* A playful, mobile-first PWA by **Autoprod**.

Three modes:

1. **Fancy Menu**: snap any meal (yes, even instant noodles) and get a fancy menu card with an over-the-top dish name, a playful description, made-up chef’s notes and a ridiculous price.
2. **Chef Roast**: Chef Gerardo, the grumpy-but-secretly-sweet (fictional) head chef of The Snoot Room, scores your plating out of 10 and roasts it. Cheeky, strictly PG, and only about the food.
3. **Fridge Chef**: snap your fridge, confirm the ingredient checklist it reads (tick, untick, edit, add), then get tonight’s special made only from what you confirmed, chalkboard style.

Every result has a one-tap **Share** button that renders a 1080×1350 (or 1080×1920 Story) image card and opens the native share sheet where it’s supported, or downloads it everywhere else.

## Growth features

- **Demo first.** Sample photos and tab switches always show Chef’s demo take, so they never spend the relay’s daily cap. A real read only happens for your own photo, at most `realCallsPerDay` (3) per device per Pacific day, after a one-time “are you 18+?” check. When the relay says the day’s limit is gone, the app shows “Chef’s off duty till …” and stays in demo mode until midnight Pacific. A per-minute limit gets a short countdown and up to two retries. New visitors see a no-network roast teaser.
- **Share.** One tap shares the card and copies a caption with a link and `#ChefGerardo #SnootfoodChallenge`, plus a mode tag. iOS gets the file only (the caption is on the clipboard). The button says “Save image” where files can’t be shared.
- **Challenge links.** `?challenge=roast&s=4`, `?challenge=menu&p=189` and `?challenge=fridge` open the right mode with a “Your friend scored 4/10…” banner. Roast answers get a beat/lose line and a card sticker. “Roast a friend’s plate” sends just the text and link.
- **Story-safe cards.** On 1080×1920 cards, nothing is drawn below y=1560, which leaves room for the reply bar and a link sticker. Every card carries a three-line watermark. Demo takes of your own photo are tagged DEMO TAKE.
- **Link previews.** Open Graph and Twitter tags, plus `og.png` (1200×630). `node tools/apply-config.mjs` rewrites their URLs from `APP.url`.
- **Plate of the day and streaks.** There are 35 rotating themes, numbered from `launchDate`. A daily streak gets one freeze a week, and 3, 7 and 30 days earn a small celebration.
- **Install nudge.** It appears after your first share or second result, never on load. It snoozes for 30 days on “Not now”. iOS shows the Add to Home Screen steps instead. The manifest includes screenshots for the richer install dialog.

`python3 tools/render_assets.py og screenshots` re-renders `og.png` and the manifest screenshots.

## Demo mode vs your own key

- **Demo mode** (the default) needs no key and makes no network calls. Results are hand-written and picked from simple image features (average color and brightness). Four sample photos are built in.
- **Real photo analysis**: open Settings and paste your own API key. It is stored only in your browser’s localStorage and sent straight from your browser to the provider you choose. Supported: Google Gemini (free tier, recommended), OpenRouter (free models), Anthropic Claude and OpenAI. No key ever ships in this site.

- **Relay (no key in the browser)**: set `relayUrl` in `config.js` to the deployed Cloudflare Worker in `relay/`. The Gemini key lives only in the Worker as a secret. See `relay/README.md`.

Voice: modern, playful, American-style. Light, punchy and conversational; cheeky roasts that tease the food, never the person.

## Run locally

Any static server works, for example `python3 -m http.server`, then open http://localhost:8000.

Tests: `python3 tests/unit.py` (image handling, JSON parsing, budget, streak and link-preview checks, in Chromium), `python3 tests/e2e.py` (Playwright + Chromium), `python3 tests/fridge_flow.py` and `node tests/relay_test.mjs`. AI responses are mocked using each provider’s response shape. The test also makes one live call to Gemini with a fake key to confirm browser CORS.

## Rename

Edit `config.js`, then run `node tools/apply-config.mjs` to sync the page title and manifest.

## Credits

Fonts: Playfair Display and Caveat (SIL Open Font License, see `fonts/OFL.txt`). Sample photos, icons and the small chef logo are original illustrations made for this project (`tools/svg`). The Chef Gerardo mascot art (snooty for Fancy Menu, sassy for Chef Roast, excited for Fridge Chef) lives in `img/` as WebP with alpha plus a PNG fallback; `tools/chef-art/cutout.py` rebuilds it from the white-background originals.

This is a TEST build. It is not indexed by search engines, and it is for entertainment only.
