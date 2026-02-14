# StorySkip

**Paste a recipe URL, get a clean recipe.** No ads, no life stories, no pop-ups.

StorySkip extracts structured recipes from any cooking website — or from a photo of a cookbook page — and gives you a distraction-free cooking experience. Save recipes to your library, plan your week, build a grocery list, and check prices at your local Kroger. It works offline and installs as an app on your phone.

**[storyskip.swinch.dev](https://storyskip.swinch.dev)**

![StorySkip screenshot](screenshots/03-recipe-extracted.png)

## Features

- **Recipe extraction** — Paste a URL and get a clean, structured recipe parsed from JSON-LD, Microdata, or headless browser fallback for bot-protected sites
- **Photo import** — Snap a picture of a cookbook page; OCR + AI vision extracts the recipe
- **Cook mode** — Full-screen, step-by-step view with hands-free read-aloud (text-to-speech), built-in timers, and screen wake lock
- **Recipe library** — Save recipes locally with tags, notes, favorites, and search/filter
- **Serving scaler** — Adjust servings and all ingredient quantities update automatically
- **Meal planner** — Drag recipes onto a weekly calendar
- **Grocery list** — Auto-generated from your meal plan with smart ingredient aggregation, unit consolidation, and category grouping
- **Kroger integration** — Search products, compare prices, and add to your Kroger cart directly from the grocery list
- **PWA** — Installs on mobile, works offline, caches recipe images

## Tech Stack

React 19, TypeScript, Vite, Dexie (IndexedDB), Workbox PWA, Tesseract.js (OCR), Stripe (one-time payment), Vercel serverless functions.

## Development

```bash
npm install
npm run dev
```

```bash
npx vitest run     # unit tests
npx tsc -b --noEmit  # type check
```

## License

Private — all rights reserved.
