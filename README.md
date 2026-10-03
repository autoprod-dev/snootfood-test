# Snootfood (TEST)

*Every meal deserves a menu.* A playful, mobile-first PWA by **Autoprod**.

Three modes:

1. **Fancy Menu**: photograph any meal (yes, even two-minute noodles) and get a fine-dining menu card with a posh dish name, a pretentious description, made-up chef’s notes and a ridiculous price.
2. **Chef Roast**: Chef Gustave Crouton, the grumpy (fictional) head chef of Maison Snoot, scores your plating out of 10 and roasts it. Strictly PG, and only about the food.
3. **Fridge Chef**: photograph your fridge and get tonight’s special, chalkboard style.

Every result has a one-tap **Share** button that renders a 1080×1350 (or 1080×1920 Story) image card and opens the native share sheet where it’s supported, or downloads it everywhere else.

## Demo mode vs your own key

- **Demo mode** (the default) needs no key and makes no network calls. Results are hand-written and picked from simple image features (average colour and brightness). Four sample photos are built in.
- **Real photo analysis**: open Settings and paste your own API key. It is stored only in your browser’s localStorage and sent straight from your browser to the provider you choose. Supported: Google Gemini (free tier, recommended), OpenRouter (free models), Anthropic Claude and OpenAI. No key ever ships in this site.

## Run locally

Any static server works, for example `python3 -m http.server`, then open http://localhost:8000.

Tests: `python3 tests/e2e.py` (Playwright + Chromium). AI responses are mocked using each provider’s response shape. The test also makes one live call to Gemini with a fake key to confirm browser CORS.

## Rename

Edit `config.js`, then run `node tools/apply-config.mjs` to sync the page title and manifest.

## Credits

Fonts: Playfair Display and Caveat (SIL Open Font License, see `fonts/OFL.txt`). Sample photos, icons and the chef character are original illustrations made for this project (`tools/svg`).

This is a TEST build. It is not indexed by search engines, and it is for entertainment only.
