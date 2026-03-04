# Mise

**Just the Recipe.**

Mise (as in *mise en place* — everything in its place) strips the ads, life stories, and pop-ups from recipe websites and gives you a clean recipe card. Extract from any URL, TikTok video, cookbook photo, or just describe what you want to cook. Save recipes, plan your week, build a grocery list, and send it all to Instacart in one tap.

Works offline. No account required. Runs on any device.

**[mise.swinch.dev](https://mise.swinch.dev)**

![Mise screenshot](screenshots/03-recipe-extracted.png)

## Features

### Five ways to get a recipe
- **URL extraction** — Paste a link, get a clean recipe. Parses JSON-LD/Microdata with headless browser fallback for bot-protected sites
- **Video extraction** — Paste a TikTok, YouTube Short, or Instagram Reel link. Whisper transcribes the audio, vision AI reads on-screen text, structured recipe comes out
- **Photo import** — Snap a cookbook page or handwritten recipe card. Tesseract.js OCR + Qwen2.5-VL vision model extracts a structured recipe
- **Describe** — Type what you want to cook in natural language. @-reference saved recipes for modifications (e.g., "@Chicken Pot Pie but vegetarian")
- **Text paste** — Paste raw recipe text and it gets structured automatically

### Cook, plan, shop
- **Cooking mode** — Full-screen step-by-step with auto-detected timers, hands-free read-aloud, ingredients sidebar, and screen wake lock
- **Recipe library** — Save recipes locally with tags, notes, favorites, search, and meal type filters. Auto-tagging on save
- **Serving scaler** — Adjust servings and all quantities update with unit conversion
- **Meal planner** — Weekly calendar with day + meal slot assignment
- **Grocery list** — Auto-generated from your meal plan with ingredient aggregation, unit normalization, and category grouping
- **Instacart integration** — Send a single recipe's ingredients or your entire week's grocery list to Instacart
- **Discover** — Search the web for recipes directly in the app
- **Share** — Share recipes via link or QR code. No account needed on the receiving end
- **Import/Export** — Full library backup and restore as JSON

### Zero infrastructure
- **PWA** — Installs on any device, works offline, caches recipe images
- **Local-first** — All data stored in IndexedDB. No database, no user accounts
- **Stateless backend** — Vercel serverless functions handle CORS proxy, headless browser, video extraction, AI routing, Stripe checkout, and Instacart APIs

## Tech Stack

| Component | Technology |
|-----------|-----------|
| App | React 19, TypeScript, Vite |
| Storage | IndexedDB via Dexie.js |
| Offline | Workbox PWA + service workers |
| Vision AI | Qwen2.5-VL via HuggingFace Inference API |
| Audio | Whisper (openai/whisper-large-v3) |
| LLM | Qwen3-14B via HuggingFace |
| OCR | Tesseract.js |
| Payment | Stripe (one-time $4.99) |
| Grocery | Instacart Developer Platform |
| Hosting | Vercel |
| Analytics | PostHog |

## Development

```bash
npm install
npm run dev
```

```bash
npx vitest run       # unit tests
npx tsc -b --noEmit  # type check
```

## License

Private — all rights reserved.
