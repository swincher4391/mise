# Mise

**Just the Recipe.**

**Product Requirements Document**
*Version 1.9 | March 2026*

> **Design philosophy:** Personal tool first, product second. Built for our kitchen. If other people want it, they can buy it. Every decision is evaluated against: "Does this make cooking dinner easier tonight?" Not: "Will this convert at 2.3% on a landing page?"

> **Governing constraint (revised):** Minimal infrastructure, maximum leverage. The app runs in the browser with local storage. Backend is limited to stateless Vercel serverless functions (proxy, payment, grocery APIs, AI model routing). No databases, no user accounts, no ops burden. If the creator disappears for two weeks, nothing breaks.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Problem (Why Every Recipe Site Is Terrible)](#2-the-problem-why-every-recipe-site-is-terrible)
3. [Product Architecture](#3-product-architecture)
4. [Feature 1: Recipe Extraction](#4-feature-1-recipe-extraction)
5. [Feature 2: Recipe Library](#5-feature-2-recipe-library)
6. [Feature 3: Cooking Mode](#6-feature-3-cooking-mode)
7. [Feature 4: Meal Planning & Grocery Lists](#7-feature-4-meal-planning--grocery-lists)
8. [Feature 5: Grocery Integration](#8-feature-5-grocery-integration)
9. [Feature 6: Discover](#9-feature-6-discover)
10. [Ingredient Parser (The Hard, Valuable Part)](#10-ingredient-parser-the-hard-valuable-part)
11. [Data Model](#11-data-model)
12. [Competitive Landscape](#12-competitive-landscape)
13. [Packaging & Distribution](#13-packaging--distribution)
14. [Monetization](#14-monetization)
15. [Promise Boundaries](#15-promise-boundaries)
16. [What Shipped (Build History)](#16-what-shipped-build-history)
17. [Roadmap (What's Next)](#17-roadmap-whats-next)
18. [Testing Strategy](#18-testing-strategy)
19. [Security & Content Sanitization](#19-security--content-sanitization)
20. [Non-Functional Requirements](#20-non-functional-requirements)

---

## 1. Executive Summary

Mise (as in mise en place -- everything in its place) is a recipe app that does one thing well: it takes a recipe URL and gives you just the recipe. No life stories. No ads. No pop-ups. No "Jump to Recipe" button because there's nothing to jump past.

Mise is a Progressive Web App (PWA) hosted on Vercel. It runs on phones, tablets, and desktops. It works offline after first load. All recipe data is stored locally in the browser via IndexedDB.

The core workflow is: paste a URL -> get a clean recipe -> save it to your library -> cook from it. The extended workflow adds five input modes (URL extraction, photo import, video extraction, text paste, and AI generation), a discovery engine for finding new recipes, weekly meal planning, grocery list generation, and one-tap shopping via Instacart at 85,000+ retailers.

**What changed since v1.8:** PRD accuracy pass — fixed factual inconsistencies (Instacart status, grocery section header) and added strategic gaps identified by review. Documented post-save meal plan calendar prompt as shipped feature in 7.1 and 13.7. Added HuggingFace single-point-of-failure risk section (3.6). Updated Reddit distribution to reflect r/food permaban and volume constraints. Added TikTok/Facebook Groups as distribution channels (13.1) and TikTok marketing as high-priority roadmap item. Image URL extraction: pasting an image URL (Reddit, Facebook CDN, Imgur, etc.) now routes directly to vision extraction with server-side proxy for CDN-hosted images. Marked r/food whitelisting as blocked, Reddit launch as paused.

---

## 2. The Problem (Why Every Recipe Site Is Terrible)

*Unchanged from v1.2. The problem hasn't gotten better.*

Recipe websites are optimized for ad revenue, not for cooking. The incentive structure is broken: longer pages = more ad slots = more revenue. This produces a predictable pattern:

| What You Want | What You Get |
| --- | --- |
| Ingredients list | 1,200 words about how this recipe reminds the author of their grandmother's kitchen in Vermont |
| Step-by-step instructions | 17 affiliate links to kitchen gadgets, a video that auto-plays, and a newsletter popup |
| Serving size adjustment | A WordPress plugin that barely works and reloads the page with new ads |
| Grocery list for the week | 5 browser tabs, manual cross-referencing, and a Notes app |
| Quick reference while cooking | A screen that goes dark every 30 seconds, hands covered in flour, scrolling past ads to find step 4 |

The "Jump to Recipe" button is the industry's confession that the content above the recipe is not for the reader. Mise eliminates the delivery mechanism and keeps the product.

---

## 3. Product Architecture

### 3.1 Technology Stack (Actual)

| Component | Technology | Notes |
| --- | --- | --- |
| App Shell | PWA (React 19 + Vite + vite-plugin-pwa) | Installable on any device. Works offline. Single codebase. |
| Local Storage | IndexedDB (via Dexie.js) | Stores recipes, tags, meal plans, grocery lists. No server required. |
| Proxy Layer | Vercel Serverless Functions | Multiple endpoints: CORS proxy, headless browser fallback (Puppeteer), image extraction, video extraction, recipe chat, recipe discover, Stripe checkout, Instacart Shopping APIs. |
| Recipe Extraction | Client-side JSON-LD + Microdata parsers | Extracts Schema.org/Recipe structured data from HTML received via proxy. |
| Photo Import | Tesseract.js (OCR) + Qwen2.5-VL vision (HuggingFace Inference API) | Extracts recipes from cookbook photos and screenshots. |
| Video Extraction | Puppeteer + ffmpeg + Whisper + Qwen2.5-VL vision | Captures social media video, transcribes audio, reads on-screen text from frames, structures into recipe JSON. |
| Describe (LLM Generation) | Qwen3-14B (HuggingFace Inference API) | Generates structured recipes from natural language prompts. Supports @-referencing saved recipes for modifications. |
| Discover (Web Search) | DuckDuckGo + Puppeteer + JSON-LD enrichment | Searches the web for matching recipes, fetches metadata for preview cards. |
| Ingredient Parser | Custom rule-based TypeScript pipeline | Turns "2 cups finely diced onions" into structured data. 172+ test fixtures. |
| Serving Scaler | Arithmetic on parsed ingredients | Adjusts quantities proportionally with unit conversion. |
| Offline Support | Service Worker (Workbox) | Full offline capability. Recipe images cached (CacheFirst, 200 entries, 30-day TTL). |
| Payment | Stripe (one-time checkout) | $4.99 unlock via Stripe Checkout. Comp system via COMPED_EMAILS env var with PIN verification. |
| Grocery Integration | Instacart Developer Platform (primary) + Kroger Developer API (deprecating) | Instacart: recipe-level and shopping-list-level deep links via Shopping APIs with affiliate tracking via Impact. Kroger: product search, price lookup, cart management via OAuth2 (retained as internal feature). |
| Analytics | Vercel Analytics + PostHog + Pinterest Analytics | Vercel: privacy-focused aggregate metrics. PostHog: product analytics with autocapture, custom events, and conversion funnels (extract → save → meal plan → shop). Pinterest Analytics: Rich Pin impressions, click-throughs, and saves via verified domain (business account). |
| Sanitization | DOMPurify | XSS prevention on all extracted content. |

### 3.2 The CORS Problem (How It Was Solved)

Recipe websites don't set CORS headers. Three extraction paths exist, all producing the same Recipe object:

1. **CORS proxy (primary).** A Vercel serverless function fetches recipe page HTML and returns it to the client. The PWA does all extraction client-side. Includes SSRF protections (blocked private IPs, metadata endpoints, protocol restrictions).
2. **Headless browser fallback.** When the proxy gets a bot-blocked response (Cloudflare challenge, 403, empty body), a second serverless function uses Puppeteer with stealth plugin to render the page in a headless browser and return the full HTML. This catches bot-protected sites like some Food Network and NYT Cooking pages.
3. **Photo import + manual entry.** User takes a photo of a cookbook page (Tesseract.js OCR + AI vision extraction) or types a recipe manually. Always works, zero infrastructure dependency.

### 3.3 Why a PWA Instead of a Native App

*Unchanged from v1.2. Still the right call.*

- Single codebase for every device.
- No App Store review process. Ship updates instantly.
- Installable on home screen. Full-screen, no browser chrome.
- Offline-first via service workers.
- No $99/year Apple Developer fee. No app store commission.

### 3.4 Image Storage Strategy

Recipe images from extracted URLs are stored as source URLs, not blobs. The service worker caches images (CacheFirst strategy, 200 max entries, 30-day expiry) for offline use. User-uploaded photos from OCR import are stored as blobs in IndexedDB.

### 3.5 Data Loss Risk

Local-only storage means clearing site data loses all recipes. Mitigation:

- **Export Library** button exports all recipes as JSON.
- **Backup nudge** appears after every 10 new recipes.
- Cloud sync remains a future priority (see Section 17).

### 3.6 HuggingFace Single Point of Failure

Three features depend on HuggingFace Inference API (free tier): photo import (Qwen2.5-VL), video extraction (Whisper + Qwen2.5-VL), and Describe (Qwen3-14B). If HuggingFace tightens rate limits or changes pricing, all three degrade simultaneously. Mitigations:

- **Photo import:** Tesseract.js OCR fallback exists (lower quality but functional).
- **Video extraction:** No alternative — this feature is entirely dependent on HF.
- **Describe:** Could swap to another hosted model (Groq, Together, etc.) with minimal code change — the API is OpenAI-compatible.
- **Long-term:** Monitor HF usage and costs. If free tier becomes insufficient, evaluate paid tier ($0.06/hr for dedicated endpoints) or migrate to alternative providers.

---

## 4. Feature 1: Recipe Extraction

Mise supports five input modes, surfaced as tabs: Extract (URL), Photo, Paste, Describe, and Discover.

### 4.1 Layer 1: Schema.org/Recipe JSON-LD [SHIPPED]

Finds `<script type="application/ld+json">` tags, parses JSON, normalizes fields. Handles nested `@graph` arrays and multiple JSON-LD blocks. Covers ~80% of recipe URLs.

**Stub fallthrough (v1.0.3):** Some sites (e.g., wishbonekitchen.com) include JSON-LD with `@type: "Recipe"` but only stub data (name, rating) — no ingredients or steps. The extractor now checks for actual content (ingredients OR steps) before accepting a JSON-LD match. Stub JSON-LD falls through to microdata or heuristic layers, which typically have the full recipe.

### 4.2 Layer 2: Microdata / RDFa Fallback [SHIPPED]

Extracts Schema.org markup via `itemprop`/`itemscope` attributes. Catches another ~10-15% of sites.

### 4.3 Layer 2.5: Headless Browser Fallback [SHIPPED]

For bot-protected sites where the proxy gets blocked, Puppeteer with stealth plugin renders the page server-side. Waits for JSON-LD to appear in the DOM (many sites inject it via JavaScript). 30-second timeout.

### 4.4 Layer 3: Heuristic HTML Extraction [SHIPPED]

For pages with no structured data (no JSON-LD, no microdata), a heuristic extractor pattern-matches common recipe page layouts:

1. **Title extraction.** `<h1>` tag content, falling back to `<title>` or `og:title`.
2. **Ingredient detection.** Searches for headings containing "ingredient" and collects subsequent `<li>` items or line-delimited text.
3. **Step detection.** Searches for headings containing "instruction", "direction", "method", or "steps" and collects subsequent `<li>` items or `<p>` tags.
4. **Image.** Falls back to `og:image` meta tag.

This catches another ~5% of recipe URLs — typically older blogs, personal sites, and non-English recipe pages that don't use Schema.org markup. The heuristic layer runs after JSON-LD and microdata both fail, before falling back to "no recipe found" error.

### 4.5 Layer 4: Photo Import / OCR [SHIPPED]

User photographs a cookbook page or screenshot. Tesseract.js runs OCR client-side, then the extracted text is sent to Qwen2.5-VL vision model via HuggingFace Inference API for structured recipe extraction. Returns title, ingredients, steps, servings, and times. Image uploaded to tmpfiles.org as temporary hosting for the vision model.

### 4.6 Layer 5: Video Extraction [SHIPPED]

Extracts recipes from short-form social media video (TikTok, YouTube Shorts, Instagram Reels). Pipeline:

1. **Capture.** Puppeteer loads the page and extracts the video element. Supports both direct video URL extraction and MediaRecorder capture.
2. **Convert.** ffmpeg converts video to mono 16kHz WAV for transcription.
3. **Transcribe.** Whisper (openai/whisper-large-v3 via HuggingFace) transcribes the audio track.
4. **Structure.** Qwen2.5-VL vision model converts the raw transcript into structured recipe JSON.
5. **OCR-Frames (supplemental).** ffmpeg extracts keyframes, uploads to tmpfiles.org, Qwen2.5-VL reads on-screen text (ingredient lists, measurements shown in video overlays).

Constrained to short-form video for serverless timeout compliance. Gated behind per-platform free limits: 3 free extractions per platform (TikTok, YouTube, Instagram counted separately), then requires $4.99 upgrade for unlimited. Only successful extractions consume a use.

### 4.7 Layer 6: Describe (LLM Recipe Generation) [SHIPPED]

User types a natural language prompt and Qwen3-14B generates a structured recipe. Streamed via SSE for real-time output. Supports @-referencing saved recipes for modifications (e.g., "@Quit Your Day Job Chicken but vegetarian"). Recipe appears as a pending card with option to save or continue editing via conversation.

### 4.8 Text Paste [SHIPPED]

User pastes raw recipe text. First line becomes the title. Supports "Ingredients:" and "Instructions:" section headers. Parsed through the same text recipe parser used for OCR review.

**Robustness (v1.0.3):** Parser now handles recipes where the first line is a section header (e.g., "Ingredients:", "Instructions:") rather than a title. Previously these were consumed as the recipe title, leaving the ingredient section empty. Header-first recipes now get a default "Pasted Recipe" title and all sections parse correctly.

### 4.9 Image Extraction

Recipe images are extracted from JSON-LD `image` field (handles string, array, and ImageObject formats). Falls back to `og:image` meta tag when JSON-LD image is missing.

### 4.10 Extraction Error Handling

*Unchanged from v1.2.* Every failure mode lands the user in an editable form. Partial extraction in an editable form beats a blank error screen every time.

---

## 5. Feature 2: Recipe Library [SHIPPED]

### 5.1 Organization

| Feature | Status | Details |
| --- | --- | --- |
| Tags | Shipped | User-defined tags + auto-tagging on save (infers meal type from recipe category, keywords, and title). |
| Search | Shipped | Full-text search across titles, ingredients, tags. Instant, client-side. |
| Favorites | Shipped | Quick-access flag. |
| Notes | Shipped | Free-text notes per recipe. |
| Source tracking | Shipped | Every extracted recipe keeps its source URL. Original author credited. |
| Meal type filters | Shipped | Filter library by breakfast, lunch, dinner, snack, dessert, side. |
| Collections | Not shipped | Deprioritized. Tags cover most organization needs. |

### 5.2 Manual Recipe Entry [SHIPPED]

Full manual entry form with ingredient parser running on each line as user types.

### 5.3 Import / Export

| Format | Status |
| --- | --- |
| JSON export (full library) | Shipped |
| JSON import | Shipped |
| Paprika import (.paprikarecipes) | Not shipped. Deprioritized. |

---

## 6. Feature 3: Cooking Mode [SHIPPED]

### 6.1 What Shipped

- **Large text, high contrast.** Dark background, light text. Readable from 3 feet away.
- **Step-by-step progression.** One step at a time, full screen. Arrow keys or swipe to advance.
- **Screen stays on.** Wake Lock API with graceful fallback message for unsupported browsers.
- **Timers.** Time references in step text are auto-detected and become tappable timers. Multiple concurrent timers. Two-tone kitchen ding alarm on completion (C6 -> G5, repeated 3x).
- **Hands-free read-aloud.** Toggle button reads each step aloud via Web Speech API (SpeechSynthesis). Auto-reads on step navigation. Announces "Timer done" when timers finish.
- **Ingredients sidebar.** Tap to open, check off ingredients as used.
- **Timer bar.** Active timers displayed in a persistent bottom bar across all steps.
- **Keyboard navigation.** Arrow keys, spacebar to advance, `I` for ingredients, Escape to exit.
- **48px minimum touch targets.** All tappable elements meet WCAG 2.5.8.

### 6.2 What Didn't Ship

- **Voice control** ("next step", "start timer"). Read-aloud is output only. Voice commands are a future enhancement.
- **Inline step-text scaling.** Step text shows original quantities; scaled values are in the ingredient sidebar.

---

## 7. Feature 4: Meal Planning & Grocery Lists [SHIPPED]

### 7.1 Meal Planner

- Weekly calendar view with week-to-week navigation.
- Assign saved recipes to day + meal slot (breakfast, lunch, dinner, snack).
- Recipe picker modal with search.
- **Post-save meal plan prompt.** After saving a recipe, a 7-day × 3-slot calendar grid appears asking "Add to this week's meal plan?" One tap assigns the recipe to a day/slot. This bridges the save → plan gap in the funnel — the most important conversion point for driving grocery orders.
- "Shop This Week" button generates grocery list from current week's plan.

### 7.2 Grocery List Generator

| Feature | Status |
| --- | --- |
| Ingredient aggregation across recipes | Shipped |
| Unit normalization (volume-to-tsp, weight-to-gram) | Shipped |
| Category grouping (produce, dairy, meat, pantry, spices, etc.) | Shipped |
| Manual item additions | Shipped |
| Check-off while shopping | Shipped |
| Null quantity handling ("salt to taste") | Shipped |

---

## 8. Feature 5: Grocery Integration [SHIPPED — LIVE]

This is the feature that transforms Mise from a recipe tool into a commerce platform.

### 8.1 Kroger Integration (Shipped, Deprecating for Public Users)

The original grocery integration was built on the Kroger Developer API:

1. **Store selector.** User enters zip code, sees nearby Kroger-family stores with addresses.
2. **Price lookup.** Every grocery list ingredient is searched against the Kroger Product API. Returns up to 5 product matches per ingredient with images, brands, sizes, and prices (regular + promo).
3. **Product cycling.** User can cycle through alternative product matches per ingredient (store brand vs. name brand, different sizes).
4. **Quantity adjustment.** Increase/decrease quantity per item.
5. **Running total.** Live estimated total updates as products are selected/deselected and quantities change.
6. **Add to Kroger Cart.** OAuth2 login, then selected products are added to the user's real Kroger cart via the Cart API. Opens kroger.com/cart in a new tab.

**Why it's being deprecated:** The Kroger affiliate program (via FlexOffers) uses link-click attribution — it doesn't work with API-driven cart additions. Users add items via the Cart API but the affiliate cookie is never set, so Mise earns $0. The integration is technically impressive but commercially broken.

Kroger integration remains functional and may be retained as a personal/internal feature, but it will not be the public-facing grocery solution.

### 8.2 Instacart Integration (Live)

Mise has built end-to-end Instacart integration via the Instacart Developer Platform (IDP):

- **85,000+ retailers** including Kroger, Costco, Walmart, Publix, Safeway, and regional chains.
- **5% commission on cart value** via Impact affiliate tracking, built into the API integration.
- **API designed for recipe apps** — Shopping APIs accept ingredient lists and return shoppable product results.
- **URL-based checkout** — no OAuth required. Simpler architecture than Kroger.
- **Two integration points built:**
  - **Recipe-level flow** (`/idp/v1/products/recipe`): Single recipe's ingredients sent to Instacart, returns a shoppable recipe page.
  - **Shopping-list-level flow** (`/idp/v1/products/products_link`): Full grocery list (aggregated from meal plan) sent to Instacart, returns a shoppable cart link.

**Current status (March 2026):**

| Milestone | Status | Notes |
| --- | --- | --- |
| Dev API key | Done | Accepted February 2026. |
| Integration build | Done | Both recipe-level and shopping-list-level flows functional. |
| Demo video | Done | Submitted February 22. |
| Production key | Done | Approved. Live in production. |
| Impact affiliate account | Done | Active. Commission tracking operational. |

### 8.3 Why Instacart Over Kroger

| Factor | Kroger | Instacart |
| --- | --- | --- |
| Retailer coverage | Kroger-family only (~2,800 stores) | 85,000+ stores across 1,500+ retailers |
| Affiliate attribution | Broken (link-click only, incompatible with API cart) | Built into API integration (Impact tracking) |
| Commission | 0% (attribution doesn't work) | 5% of cart value |
| Auth complexity | OAuth2 authorization code flow | API key (dev) / URL attribution (prod) |
| User friction | Must have Kroger account, OAuth login | No account required for checkout link |

### 8.4 Technical Implementation (Kroger — Current)

- Kroger Developer API (developer.kroger.com) with OAuth2 client credentials for product search, authorization code flow for cart access.
- All API calls proxied through Vercel serverless functions (client never sees Kroger credentials).
- Token refresh handled server-side.
- User OAuth tokens stored in encrypted httpOnly cookies (AES-256-GCM).
- FTC affiliate disclosure displayed above "Add to Cart" button.

---

## 9. Feature 6: Discover [SHIPPED]

### 9.1 What It Does

User types what they want to cook. Mise searches the web for matching recipes, fetches metadata for preview cards (image, rating, source), and displays results. User taps a result to extract the full recipe via the standard extraction pipeline.

### 9.2 How It Works

1. **Search.** DuckDuckGo HTML search via Puppeteer (serverless). Query is appended with "recipe" for relevance.
2. **Enrichment.** Each search result is fetched to extract JSON-LD recipe metadata (image, aggregateRating, ratingCount) for rich preview cards.
3. **Blocked domains.** Results from robots.txt-restricted or problematic sites are filtered out: allrecipes.com, foodnetwork.com, food.com, cookinglight.com, eatingwell.com, myrecipes.com, southernliving.com, thekitchn.com.
4. **Fallback.** "Don't like what you see?" prompts the user to try the Describe tab for LLM-generated recipes.

### 9.3 Free Tier

Discover is unlimited on the free tier. It drives engagement and feeds the extraction + grocery funnel.

---

## 10. Ingredient Parser (The Hard, Valuable Part)

*Architecture unchanged from v1.2. Results exceeded expectations.*

### 10.1 Current State

- **172+ unit test fixtures** covering quantities, units, fractions, ranges, parentheticals, prep instructions, compound ingredients, and edge cases.
- **348 total tests** passing across 15 test files (parser, extraction, validation, scaling, aggregation, security, Instacart mapping).
- Rule-based pipeline in TypeScript. Deterministic, fast, client-side.
- Parser handles: whole numbers, fractions, unicode fractions, ranges (3-4), mixed numbers (1 1/2), absent quantities ("to taste"), standard units, informal units, container-based units, parenthetical notes, prep before/after ingredient, compound ingredients, optional flags.

### 10.2 What Changed from v1.2

- Parser accuracy exceeded the "90% case" target. Handles the vast majority of real-world ingredient strings without LLM fallback.
- LLM-assisted parsing (Phase 2) has not been needed. The rule-based parser is sufficient for production use.
- Auto-tagging (`autoTag.ts`) infers meal type tags from recipe category, keywords, and title on save.

---

## 11. Data Model

*Core schema unchanged from v1.2.* All data stored in IndexedDB via Dexie.js. Key additions:

### 11.1 Additions Since v1.2

| Entity | Status | Notes |
| --- | --- | --- |
| Recipe | Shipped | As specified in v1.2. Added `tags` auto-population via `autoTag.ts`. `extractionLayer` field tracks source (json-ld, microdata, image, video, text, chat). |
| Ingredient | Shipped | As specified. Category dictionary covers produce, dairy, meat, seafood, pantry, spices, frozen, bakery, beverages, other. |
| MealPlan | Shipped | Flat entries queried by date range. |
| GroceryList | Shipped | Aggregated items + manual items. Checked state persists. |
| Collection | Not shipped | Tags provide sufficient organization. |
| Nutrition | Shipped | Extracted from JSON-LD when available. Display only, no estimation. |

---

## 12. Competitive Landscape

*Updated to reflect current positioning.*

| App | Price | Mise's Advantage |
| --- | --- | --- |
| Paprika | $4.99/platform ($15 total) | PWA = one purchase, every device. Instacart grocery integration (85,000+ stores). Video import from TikTok/YouTube/Instagram. AI recipe generation. Modern UI. |
| JustTheRecipe | Free + $2/month subscription | No subscription. $4.99 one-time = $24/yr savings vs JTR. Meal planning + grocery list + Instacart. Five input modes (URL, photo, video, paste, AI). |
| Mela | $5.99/yr or $9.99 lifetime | Cross-platform (not Apple-only). Instacart integration. Better grocery list aggregation. |
| CookBook | Free + $2.99 premium | No ads. Photo import. Video import. Grocery integration. Recipe discovery. |
| Whisk (Samsung) | Free | No ecosystem lock-in. Privacy-first. Deeper ingredient parsing. |

**Honest assessment:** Paprika is still the gold standard for recipe management. Mise's differentiation is now clearer: (1) PWA cross-platform, (2) five input modes including video extraction and AI generation that no competitor matches, (3) Instacart grocery integration covering 85,000+ stores, (4) recipe discovery engine, (5) hands-free cook mode with read-aloud. The grocery integration is the moat — it turns a recipe app into a shopping tool. The AI features are the hook — they make recipe capture effortless from any source.

---

## 13. Packaging & Distribution

### 13.1 Current Distribution

| Channel | Status | Notes |
| --- | --- | --- |
| PWA at mise.swinch.dev | Live | Primary distribution. |
| Vercel hosting (free tier) | Live | |
| Custom domain (mise.swinch.dev) | Live | |
| Vercel Analytics | Live | |
| Reddit (organic) | Paused | Validated in r/MealPrepSunday, r/webdev. r/food permaban constrains reach. Requires careful pacing. |
| TikTok / short-form video | Not started | No gatekeepers, algorithmic reach. Best channel for recipe extraction demos. High priority. |
| Facebook Groups | Not started | Recipe-sharing groups with millions of members. Link previews work (OG tags render). |
| Chrome Extension | Not shipped | Extension code exists in repo (`/extension/`) but not published to Chrome Web Store. |
| App stores | Not shipped | PWA is sufficient. |

### 13.2 Infrastructure Costs (Actual)

| Item | Cost |
| --- | --- |
| Vercel hosting + serverless functions | $0 (free tier) |
| Domain (swinch.dev) | ~$12/year |
| Stripe | 2.9% + $0.30 per transaction |
| Instacart Developer Platform | $0 |
| HuggingFace Inference API | $0 (free tier, rate-limited) |
| PostHog | $0 (free tier, 1M events/month) |
| Pinterest Analytics | $0 (included with verified business account) |
| **Total fixed cost** | **~$12/year** |

### 13.3 Community Launch Plan (Reddit)

**Strategy:** Provide genuine value first. Every post should help someone cook dinner tonight. The product mention is secondary — it earns attention because the post is useful, not because the post is an ad. Follow the 9:1 rule: nine helpful comments/posts for every one that mentions Mise.

**Target Subreddits:**

| Subreddit | Size | Angle | Self-Promo Rules |
| --- | --- | --- | --- |
| **r/MealPrepSunday** | ~1.5M | "Here's my weekly meal plan flow — plan, list, shop in one pass" | Show-and-tell welcome. Demonstrate the meal plan → grocery list → Instacart flow as a real workflow post. |
| **r/EatCheapAndHealthy** | ~2.1M | "I built a free tool that turns any recipe URL into a grocery list" | Useful tools allowed if you're a real participant. Budget angle resonates. |
| **r/cookingforbeginners** | ~1.5M | "How I organize recipes from TikTok / Instagram without losing them" | Beginner-friendly. Focus on the problem (saving recipes from social media) not the product. |
| **r/recipes** | ~1.2M | Share actual recipes extracted via Mise, mention the tool in comments if asked | No direct promo. Participate genuinely, mention tool organically. |
| **r/cooking** | ~3M+ | Answer questions about recipe organization, meal planning workflows | Strict no-promo. Build karma, be helpful, link only when directly relevant to a question. |
| **r/MealPrepSunday** crosspost to **r/mealprep** | ~300K | Same meal plan content | Smaller but focused audience. |
| **r/SideProject** | ~500K | "I built a recipe app because every recipe site is terrible" | Explicit self-promo allowed. Builder story with demo. |
| **r/webdev** / **r/reactjs** | ~2M / ~500K | Technical build story — PWA, video extraction pipeline, Puppeteer + Whisper + Vision | Dev audience. Show the architecture, not the product. |
| **r/IndieHackers** (via indiehackers.com) | N/A | Launch post with revenue model, unit economics, lessons learned | Founder community. Be transparent about numbers. |

**Post Templates (Draft Concepts):**

1. **The workflow post** (r/MealPrepSunday, r/EatCheapAndHealthy): "Sunday meal prep: I plan 5 meals, generate one grocery list, and send it to Instacart in about 2 minutes. Here's how." Include screenshots of the actual flow. Mention Mise by name only at the end: "I built this tool — it's free, called Mise."

2. **The problem post** (r/cookingforbeginners, r/cooking): "Is there a good way to save recipes from TikTok/Instagram without screenshotting?" Answer your own question naturally in comments if someone asks. Don't shill in the OP.

3. **The builder post** (r/SideProject, r/webdev): "I built a recipe app that extracts recipes from any URL, TikTok video, or photo. Here's the tech stack and what I learned." Focus on the engineering: Puppeteer video capture, Whisper transcription, Qwen Vision OCR, serverless constraints.

4. **The comparison post** (r/EatCheapAndHealthy): "Free alternatives to Paprika/Whisk for managing recipes" — position Mise alongside other tools honestly. Don't trash competitors.

**Measurement:** Track which subreddit drives the most grocery checkouts, not just the most traffic. A post that gets 50 views in r/MealPrepSunday but converts 5 shoppers is worth more than 3,000 views in r/webdev that convert zero. Use UTM parameters on links (`?utm_source=reddit&utm_medium=post&utm_campaign=mealprepsunday`) and correlate with PostHog funnel events (extract → save → meal plan → shop).

**Timing:** Funnel is live and validated. Post opportunistically when genuine engagement arises.

**What not to do:**
- Don't post the same content to multiple subreddits on the same day (Reddit flags cross-posting spam).
- Don't use a brand-new account. Build karma first with genuine participation (2-4 weeks).
- Don't link directly to mise.swinch.dev in every post. Let people find it through your profile or ask for it.
- Don't fake being a user who "discovered" the app. Be upfront: "I built this."
- **Don't post share links in subs with domain whitelists** (r/food) without getting whitelisted first — results in permaban.

**Known constraints (March 2026):**
- **r/food permaban.** Account permanently banned for posting a non-whitelisted domain. This subreddit (3M+) is inaccessible without a new account or successful appeal.
- **Volume sensitivity.** Posting share links across multiple subs in a single day triggered spam detection. Space posts across days, not hours.

#### Validated Results (March 2026)

Reddit community sharing has been validated as an organic distribution channel:

| Subreddit | Approach | Result |
| --- | --- | --- |
| r/MealPrepSunday | Shared meal plan screenshot with Mise workflow | 3+ upvotes, positive OP response, share link clicks |
| r/webdev (Showoff Saturday) | Technical build story — PWA architecture, video extraction pipeline | Engaged developer audience, profile visits |
| r/food | Recipe conversion comments with share links | Auto-removed (domain not whitelisted). Mod message sent requesting whitelisting. |
| r/EatCheapAndHealthy | Budget-friendly recipe sharing | Planned |
| r/SideProject | Security consulting comment (rapport building) | Genuine engagement, not product-focused |

**Key learnings:**
- Share links in comments generate real traffic (8+ visitors/hour during active posting)
- Reddit does NOT unfurl link previews in comments (only in posts) — OG tags don't help in comment links
- Domain whitelisting required for some subreddits (r/food auto-removes non-whitelisted domains)
- Rapport-first approach works: genuine participation earns trust, product mentions are organic
- "Recipe digitization service" concept emerged: offering to convert recipe requests into clean digital format drives natural engagement and share link distribution

### 13.4 SEO Distribution: Share URLs as Crawlable Landing Pages

**This is the most novel distribution mechanism in the product.** Every recipe shared from Mise creates a crawlable, indexable landing page — with zero database, zero infrastructure, and zero per-page cost.

#### How It Works

Mise's share URLs encode the full recipe payload in the URL query string using gzip + base64url compression:

```
https://mise.swinch.dev/api/r?d={compressed_recipe_data}
```

When any crawler (Pinterest, Google, Facebook, Slack, iMessage) fetches this URL, a Vercel serverless function:

1. Extracts the `?d=` parameter
2. Decodes base64url → gunzip → JSON
3. Returns a full HTML page with:
   - **JSON-LD Recipe schema** (title, ingredients, instructions, cook time, servings, nutrition, image)
   - **Open Graph meta tags** (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`)
   - **Pinterest Rich Pin hint** (`<meta name="pinterest-rich-pin" content="true">`)
   - **Human-readable recipe page** with ingredients, steps, nutrition, and "Open in Mise" CTA
4. Browser users see the recipe and can click through to import it into Mise

**The URL is the database.** No storage layer is needed. The recipe data round-trips through the URL itself.

#### Why This Is Novel

Each component has prior art. The combination does not:

| Pattern | Prior Art | Mise's Twist |
| --- | --- | --- |
| URL-encoded content | itty.bitty, hashify.me, textarea.my | Those use URL **fragments** (`#`) — invisible to servers/crawlers. Mise uses the **query string** (`?d=`), so the server can decode it. |
| Edge-rendered OG tags for SPAs | Cloudflare Workers, Vercel functions | Those always look up data from a **database** by ID. Mise decodes data from the URL itself. |
| Pinterest Recipe Rich Pins | AllRecipes, Food52, Cookpad | Those are traditional database-backed sites. Mise generates Rich Pins from URL-decoded data with no database. |
| User sharing → indexable pages | Cookpad, Canva | Those create database records. Mise creates indexable pages where the URL is the record. |

No documented case exists of gzip+base64url data in URL query strings being decoded at the edge to serve structured HTML for social crawlers and search engines. The architecture emerged from a practical constraint (no database) and unlocked SEO as a side effect.

#### Immutable Recipe Snapshots

An emergent property of the URL-encoded architecture: shared recipes are immutable snapshots. When a user shares a recipe, the compressed data in the URL captures the recipe at that moment — including any edits, scaled servings, or custom images. If the user later edits their local copy, existing share links still show the original version. This is analogous to Git commits: each share is a point-in-time snapshot, and every edit-then-share creates a new "version." This property emerged naturally from the stateless design (no database to update) and turns out to be a feature: shared links never break, never change, and never depend on the sharer's continued use of the app.

#### Pinterest Rich Pins

Pinterest's crawler reads JSON-LD Recipe schema. Because every Mise share URL returns this schema, all shared recipes automatically qualify for Recipe Rich Pins, which display:

- Recipe title and image in the pin
- Cook time, servings, and ingredients natively in the Pinterest UI
- Direct link back to `mise.swinch.dev`

**Setup completed:**
- `mise.swinch.dev` claimed as verified domain in Pinterest Business account
- JSON-LD Recipe schema served on all share URLs (shipped v1.2)
- Open Graph meta tags including `og:url` (shipped v1.7)
- `<meta name="pinterest-rich-pin" content="true">` hint (shipped v1.7)
- "Pin It" button in share modal (shipped v1.7)

**Rich Pin validation:** Submit any share URL to [Pinterest's Rich Pin Validator](https://developers.pinterest.com/tools/url-debugger/). Once one URL passes, all URLs on the domain get Rich Pins.

**Precedent for impact:** AllRecipes added a "Pin It" button and saw 139M impressions and 900% click increase within three months. Food52 maintains 10M+ monthly Pinterest viewers through recipe pins. Mise's advantage: every user share creates Rich Pins automatically, with no editorial workflow.

#### Google Indexing

The same share URLs are indexable by Google. Each shared recipe becomes a long-tail SEO page for queries like "easy chicken stir fry recipe" — served with full Recipe schema that qualifies for Google's recipe rich results (the carousel at the top of recipe searches).

**Considerations:**
- Google can process URLs up to ~2,083 characters. Compressed recipe payloads typically fit in 500-1500 characters of base64url.
- Canonical URL selection: `og:url` meta tag (added in v1.7) helps Google canonicalize.
- Future enhancement: generate a sitemap of popular shared recipes to accelerate indexing.

#### Risks

**Google thin content / spam classification:** If thousands of share URLs are indexed and Google determines them to be near-identical template pages (same layout, different recipe data), the domain could face deindexing or ranking penalties. Mitigations: (1) each page has genuinely unique content (recipe title, ingredients, instructions, nutrition — not boilerplate), (2) pages include full JSON-LD Recipe schema which Google treats as structured data, not spam, (3) start with organic sharing volume rather than programmatic generation of thousands of URLs, (4) monitor Google Search Console for coverage issues. This risk is low — recipe sites like AllRecipes and Cookpad have millions of template-based recipe pages without penalty — but worth monitoring.

**URL length and canonicalization:** Long base64url parameters may cause deduplication confusion. The `og:url` meta tag (added v1.7) mitigates this by providing an explicit canonical URL for each page.

#### Cross-Platform Link Previews

This architecture solves link previews everywhere, not just Pinterest:

| Platform | What It Reads | Result |
| --- | --- | --- |
| Pinterest | JSON-LD + OG tags | Recipe Rich Pin with ingredients, cook time |
| Google | JSON-LD Recipe schema | Recipe rich results in search |
| Facebook / Messenger | OG tags | Rich link card with image and description |
| iMessage | OG tags | Link preview with image |
| Slack / Discord | OG tags | Embedded preview card |
| Twitter/X | OG tags | Summary card with image |

Every share is a marketing event across every platform, automatically.

#### The Distribution Flywheel

```
User cooks recipe → Shares to friend/Pinterest/social
    → Share URL is crawlable landing page with structured data
    → Pinterest: Rich Pin on user's board (their followers see it)
    → Google: Indexed recipe page (search traffic)
    → Social: Rich preview card (click-through to Mise)
    → New user clicks through → Imports recipe → Starts cooking
    → Saves recipes → Meal plans → Shops via Instacart (affiliate revenue)
    → Shares their own recipes → Cycle repeats
```

The key insight: **the user is the distribution mechanism.** Every share creates permanent, indexed, crawlable content that drives new users into the Instacart affiliate funnel. This costs nothing per share and compounds over time.

### 13.5 Directory Submissions (SEO Backlinks)

Strategy documented in `plans/directory-submission-strategy.md`. 51 directory targets ranked by Domain Rating (DR 40-91), targeting AI tools, software directories, and general directories. Provides backlinks for domain authority independent of the share URL strategy.

### 13.6 Pinterest Bulk Pin Script (Non-Recipe Content)

A standalone Python script (`scripts/pinterest/pin_recipes.py`) exists for bulk-creating Pinterest pins via the Pinterest API v5. This is separate from the in-app "Pin It" flow and intended for:

- Branded content pins (meal prep tips, cooking infographics)
- Canva-designed marketing pins
- Batch posting of curated recipe collections to a Mise-owned Pinterest board

The script reads recipe JSON exports, generates branded pin images (Pillow), and posts via OAuth access token. It tracks progress to avoid duplicates. See `scripts/pinterest/README.md` for setup.

### 13.7 Share-Link Visitor Conversion Flywheel

Share links bring visitors who see a specific recipe but have no context about Mise's value. The conversion flywheel addresses each drop-off point:

1. **Save hint.** Below the "Save Recipe" button: "Cooking mode, meal planning, grocery lists & offline access" — tells visitors what saving gets them.
2. **Post-save nudge.** After saving from a share link, instead of navigating to the library (which is empty), visitors see: "Recipe saved! Paste any recipe URL above to try it yourself." with buttons to "Try a Recipe" or "Go to Library".
3. **Meal plan prompt.** After saving, a 7-day × 3-slot (breakfast/lunch/dinner) calendar grid appears asking "Add to this week's meal plan?" One tap assigns the recipe. This is the most important funnel conversion point — it bridges save → plan → grocery list → Instacart in a single interaction.
4. **Install prompt.** PWA install banner triggers after first extraction, catching share-link visitors who engage further.

**Funnel:** View shared recipe → Save (hint shows value) → Meal plan prompt → Try own recipe → Become regular user → Share own recipes → Flywheel repeats.

---

## 14. Monetization

*This section is substantially rewritten from v1.2. Monetization is no longer hypothetical.*

### 14.1 Revenue Model: Two Streams

| Stream | Mechanism | Status |
| --- | --- | --- |
| **One-time unlock** | $4.99 via Stripe Checkout. Unlocks unlimited saved recipes, photo import, unlimited video extraction, and all features. | Live |
| **Grocery affiliate commission** | Instacart checkout via IDP. 5% commission on cart value tracked through Impact affiliate platform. | Live |

### 14.2 Why $4.99

The $4.99 isn't where the money is made -- the affiliate revenue is. The one-time payment serves three purposes:

1. **Filters for engaged users.** Someone who pays has committed to the app and is more likely to generate weekly grocery orders.
2. **Positions against competition.** JustTheRecipe charges $2/month ($24/year). Paprika charges $4.99 per platform. Mise is $4.99 total, forever, every device.
3. **Removes friction at the right moment.** Going higher ($9.99) loses users who would generate grocery affiliate revenue. Going lower ($2.99) undervalues the product without meaningfully reducing friction.

### 14.3 Free Tier

| Feature | Free Limit |
| --- | --- |
| URL extraction (non-video) | Unlimited |
| Photo import (single) | Paid only |
| Batch photo import | Paid only |
| Video extraction (TikTok) | 3 free, then paid |
| Video extraction (YouTube Shorts) | 3 free, then paid |
| Video extraction (Instagram) | 3 free, then paid |
| Text paste | Unlimited |
| Describe (LLM generation) | Unlimited |
| Discover (web search) | Unlimited |
| Save recipes | Up to 25 |
| Cooking mode | Unlimited |
| Meal planning & grocery lists | Unlimited |
| Grocery shopping via Instacart | Unlimited |

The free tier includes the grocery flow and AI features intentionally. A free user who shops through Instacart every week generates more affiliate revenue than a $4.99 payment. The paywall gates library size and expensive video extraction, not the commerce funnel or engagement features.

Video extraction limits are per-platform: a free user gets 3 TikTok, 3 YouTube Shorts, and 3 Instagram imports (9 total). Only successful extractions consume a use. Counters stored in localStorage.

### 14.4 Entitlement Mechanism

- Stripe Checkout (mode: 'payment', one-time, not subscription).
- On successful payment, unlock flag stored locally in IndexedDB keyed to email.
- Restore purchase on new device by entering email (verified against Stripe API via serverless function).
- Comp system: `COMPED_EMAILS` environment variable with optional PIN verification for gifted access.
- Video extraction counters: per-platform counts in localStorage (`mise_video_extract_tiktok`, `mise_video_extract_youtube`, `mise_video_extract_instagram`).

### 14.5 Affiliate Integration

Instacart Developer Platform handles affiliate attribution through the API integration itself. When a user checks out via an Instacart link generated through the Shopping APIs, the purchase is tracked via Impact affiliate platform. No separate affiliate redirect or cookie-setting step is needed — attribution is built into the checkout URL.

FTC disclosure ("Mise may earn a commission from purchases made through these links.") is displayed above the checkout button.

### 14.6 Revenue Timeline

| Milestone | Status | Notes |
| --- | --- | --- |
| Instacart dev API key | Done | Accepted February 2026. |
| Instacart integration build | Done | Recipe-level and shopping-list-level flows functional. |
| Demo video submitted | Done | Submitted February 22. |
| Production key | Done | Approved. Live in production. |
| Impact affiliate account | Done | Active. Commission tracking operational. |
| Kroger affiliate (FlexOffers) | Abandoned | Link-click attribution incompatible with API-driven cart additions. |
| **Revenue pipeline** | **Live** | **Full funnel operational: meal plan → grocery list → Instacart checkout → affiliate commission.** |
| Share-link conversion flywheel | Done | Save hints, post-save nudge, meal plan prompt improvements drive share-link visitors to save and engage. |

### 14.7 Revenue Flywheel & Unit Economics

The real business model isn't the $4.99 paywall — it's recurring grocery affiliate revenue driven by meal planning.

**The Flywheel:**

Discover/Describe (new recipes) -> Save -> Meal Plan -> Aggregated Grocery List -> Instacart (5% commission) -> repeat weekly

Each stage feeds the next. Discover and Describe drive return visits with new recipes. The meal planner turns individual recipes into a weekly plan. The grocery list aggregator combines 5+ recipes into a single large order. Instacart converts that list into a shoppable cart. The user comes back next week because they need new meals — not because Mise reminds them.

**Why meal planning is the moat:** Instacart doesn't do meal planning. Nobody opens Instacart on Sunday night to plan their week. Mise is the front wrapper that turns "what should we eat this week?" into a $150+ grocery order. Without Mise, the user places individual $30 orders. With Mise, they place one aggregated weekly order worth 5x more.

**Why the shopping-list-level flow matters more than recipe-level:** The recipe-level Instacart link (`/idp/v1/products/recipe`) sends a single recipe's ingredients — a $20-30 cart. The shopping-list-level link (`/idp/v1/products/products_link`) sends an entire week's aggregated grocery list — a $100-200 cart. Same 5% commission rate, dramatically different cart value.

**Why new recipes drive retention, not repeat shopping:** Once a user sends a recipe to Instacart, they can reorder from Instacart's order history. Mise earns nothing on repeat orders placed directly through Instacart. The user only returns to Mise when they want to cook something *new* — which is why Discover and Describe are retention features, not just input modes.

**Unit Economics (Per User):**

| Scenario | Assumption | Annual Revenue |
| --- | --- | --- |
| **Ceiling (weekly power user)** | $150 cart × 5% × 52 weeks + $4.99 | ~$395 |
| **Realistic (moderate user)** | 2 Instacart orders/month × $150 cart × 5% + $4.99 | ~$185 |
| **Conservative (occasional user)** | 1 Instacart order/month × $100 cart × 5% + $4.99 | ~$65 |
| **Free user (no paywall hit)** | 2 Instacart orders/month × $150 cart × 5% | ~$180 |

The $395 ceiling assumes every active user places a weekly $150 grocery order through Mise's Instacart flow. In practice, many users will plan meals but shop in-store, use Instacart directly for reorders (no affiliate attribution), or only use the shop flow occasionally. The realistic scenario — 2 orders/month — is still dramatically more valuable than the $4.99 paywall alone. Even at the conservative floor, a single user generates 13x the one-time payment in Year 1.

Instacart affiliate terms: 5% commission on all orders (both new user activation and repeat), first-click attribution with a 7-day referral window. Payouts are monthly (locked 1 day after month end, invoiced on the 3rd, paid 10 days after invoice month).

**Key insight:** A free user who shops twice a month through Mise (~$180/year affiliate revenue) is worth more than a paid user who saves 25 recipes and never shops ($4.99 lifetime). The paywall is a filter for engagement, not the business model.

**Implication for free tier:** Free users who meal plan and shop weekly are the most valuable users. The paywall should gate convenience features (photo import, video import, batch import), not the commerce funnel. A free user generating $7.50/week in affiliate revenue is worth more than a paid user who saves 25 recipes and never shops. The 7-day referral window aligns perfectly with the weekly meal plan cycle — a user who plans on Sunday and shops by Saturday is always within the attribution window.

### 14.8 What We Will Never Do

- **Ads.** Ever. This product exists because ads ruined recipe websites.
- **Sell user data.** There is no user data to sell. Everything is local.
- **Upsell to a subscription.** The one-time price is the price.
- **Sponsored recipes.** No promoted content.

**What changed from v1.2:** The PRD originally stated "No affiliate links in recipes. No brand partnerships." This was revised. The affiliate integration is in the shopping checkout flow, which is a feature the user explicitly initiates. The affiliate revenue aligns user and business incentives: the user gets a convenient shopping experience at their preferred retailer, and Mise earns a commission on purchases the user was already going to make. This is fundamentally different from injecting "buy this on Amazon" links into ingredient lists.

### 14.9 What Changed from v1.5 (Free Tier Strategy)

The v1.5 PRD noted "the paywall gates library size, not the commerce funnel." This remains true, but v1.6 makes the reasoning explicit: the meal plan -> grocery order flywheel is the primary revenue driver, and it must remain ungated. The 25-recipe save limit may be revisited if data shows it's blocking users from building weekly meal plans (see Section 17: analytics/funnel tracking as high-priority roadmap item).

---

## 15. Promise Boundaries

| Mise Does | Mise Does NOT Do |
| --- | --- |
| Extract recipes from URLs using structured data (JSON-LD, microdata) | Guarantee extraction from every website. Some sites have no structured data. |
| Extract recipes from photos of cookbook pages via OCR + AI vision | Guarantee OCR accuracy. Users can edit extracted text. |
| Extract recipes from short-form video (TikTok, YouTube Shorts, Instagram) | Extract from long-form video. Serverless timeout limits constrain to shorts. |
| Generate recipes from natural language descriptions via LLM | Guarantee recipe accuracy. AI-generated recipes should be reviewed by the cook. |
| Search the web for recipes matching a query | Guarantee results from every recipe site. Some domains are blocked. |
| Parse ingredients into structured data (quantity, unit, ingredient, prep) | Guarantee 100% parse accuracy. The parser is good, not perfect. |
| Store all data locally on the user's device | Store any data on our servers. Your recipes are yours. |
| Generate grocery lists from meal plans with ingredient aggregation | Order groceries for you (but it can send items to Instacart for checkout). |
| Connect you to 85,000+ stores via Instacart | Guarantee price accuracy. Prices come from retailers via Instacart and may vary. |
| Work offline after first load | Sync between devices. Cloud sync is a planned future feature. |

---

## 16. What Shipped (Build History)

The MVP build order from v1.2 is now history. Here's what actually shipped:

| Phase | What Shipped |
| --- | --- |
| **Foundation** | PWA shell, Vite + React 19, service worker, offline support, Vercel hosting |
| **Extraction** | JSON-LD parser, microdata fallback, CORS proxy, headless browser fallback (Puppeteer + stealth), og:image fallback |
| **Video Extraction** | Puppeteer video capture, ffmpeg audio conversion, Whisper transcription (openai/whisper-large-v3 via HuggingFace), Qwen2.5-VL vision structuring, OCR-frames pipeline for on-screen text, per-platform free limits (3/platform) |
| **Describe** | Qwen3-14B recipe generation via SSE streaming, @-reference to saved recipes, pending recipe preview with save/continue editing, conversational multi-turn flow |
| **Discover** | DuckDuckGo web search via Puppeteer, JSON-LD metadata enrichment for preview cards, blocked domains list, "try Describe" fallback |
| **Text Paste** | Raw text input with section header detection, shared parser with OCR review flow |
| **Parser** | Rule-based ingredient parser, 172+ fixtures, quantity/unit/ingredient/prep/notes separation, category assignment, range support, optional detection |
| **Library** | IndexedDB storage (Dexie), save/delete, tags (manual + auto), favorites, notes, search, meal type filters, JSON import/export, backup nudge |
| **Cooking Mode** | Step-by-step full-screen, keyboard navigation, wake lock, timer extraction + management, ingredient sidebar with check-off, timer bar, read-aloud (TTS), two-tone timer alarm |
| **Scaling** | Serving scaler with unit consolidation (volume-to-tsp, weight-to-gram) |
| **Meal Planning** | Weekly calendar, recipe assignment, recipe picker, week navigation |
| **Grocery** | Aggregation engine, unit normalization, category grouping, manual additions, check-off |
| **Kroger** | Store selector (zip code), product search, price display (regular + promo), product cycling, quantity adjustment, OAuth2 login, cart API, running total |
| **Instacart** | Recipe-level deep links (`/idp/v1/products/recipe`), shopping-list-level deep links (`/idp/v1/products/products_link`), ingredient name normalization for API matching |
| **Photo Import** | Tesseract.js OCR, Qwen2.5-VL vision extraction (HuggingFace Inference API), review/edit flow |
| **Monetization** | Stripe one-time checkout ($4.99), email-based restore, comp system with PIN, FTC affiliate disclosure, video extraction usage limits |
| **Instacart (Production)** | Production API key approved, Impact affiliate account active, full revenue pipeline live (meal plan → grocery list → Instacart checkout → affiliate commission) |
| **Share & SEO** | Share URLs as crawlable landing pages (JSON-LD + OG meta tags), Pinterest Rich Pin support, "Pin It" share button, `og:url` canonical tag, pinterest-rich-pin meta hint, Pinterest bulk pin script (standalone Python) |
| **v1.0.3 (March 2026)** | Layer 3 heuristic HTML extraction, stub JSON-LD fallthrough, MasterCook step splitting, sentence-splitting for single-string instruction blobs, space-separated itemprop handling in microdata, paste parser section-header robustness, editable image URL in recipe edit form, save-value hints for share-link visitors, share-link visitor conversion flywheel (post-save nudge, 7×3 meal plan calendar prompt after save), SW race condition fix for shared recipe imports, image URL extraction routing (paste image URL → vision extraction with server-side proxy for CDN-hosted images) |
| **Polish** | PWA install prompt (triggers after first extraction), DOMPurify sanitization, SSRF protection on proxy, Vercel Analytics |

---

## 17. Roadmap (What's Next)

Ranked by expected impact:

| Feature | Priority | Why |
| --- | --- | --- |
| ~~**Instacart production key**~~ | ~~Immediate~~ | ~~Done. Production key approved, live.~~ **Moved to What Shipped.** |
| ~~**Impact affiliate activation**~~ | ~~Immediate~~ | ~~Done. Impact account active, commission tracking operational.~~ **Moved to What Shipped.** |
| **Pinterest Rich Pin validation** | Immediate | Submit one share URL to Pinterest's Rich Pin Validator to activate Rich Pins domain-wide. One-time manual step. |
| **Analytics / funnel tracking** | High | PostHog integration shipped (autocapture + custom events). Need conversion funnel data (extract -> save -> meal plan -> shop) before marketing push. |
| **Reddit community launch** | Paused | Validated that share links drive traffic and saves. r/food permaban constrains the highest-value sub. Remaining subs (r/MealPrepSunday, r/Old_Recipes, r/Cooking) still viable but require careful pacing — one sub per day max. Recipe digitization service concept emerging as organic engagement driver. |
| **TikTok / short-form video marketing** | High | Reddit is gated by moderation. TikTok has no gatekeepers — post recipe extraction demos (URL → clean recipe in 3 seconds), cookbook photo digitization, meal plan workflows. No domain whitelists, no karma requirements, algorithmic reach. Should be the primary organic distribution channel. |
| **r/food domain whitelisting** | Blocked | Mod message sent but account permabanned from r/food. Whitelisting would require a new account or successful appeal. Deprioritized in favor of TikTok. |
| **Share URL sitemap generation** | High | Generate a sitemap of popular/shared recipe URLs for Google Search Console submission. Accelerates indexing of share landing pages. Could be a periodic serverless function or manual export. |
| **Video vision-transcript merging** | High | Quantities from on-screen text (video frames) are not reliably merged with audio transcript. Whisper gets the recipe steps; vision gets the measurements. Merging these two signals is the next accuracy improvement for video extraction. |
| **Chrome Extension publish** | High | Extension code exists in repo (`/extension/`, Manifest v3). Needs packaging and Chrome Web Store submission. One-click extraction from any recipe page bypasses CORS entirely. |
| **Cloud sync** | High | Users on multiple devices need recipe sync. First real infrastructure commitment (Supabase or similar). |
| **Recipe digitization service** | Medium | Offering to convert recipe requests in cooking subreddits into clean digital format (via share links). Drives organic engagement, builds rapport, and distributes share links naturally. Could evolve into a formal service or bot. |
| **OG image generation** | Medium | Generate branded recipe images at the edge for share URLs that lack an `imageUrl`. Currently OG image is only present when the source recipe has one. A generated image (recipe title + brand) would improve click-through on Pinterest, social, and search. |
| **Paprika import** | Medium | Removes switching cost from the largest competitor's user base. |
| **Voice commands in cook mode** | Medium | "Next step", "start timer" via Web Speech API recognition. Read-aloud (output) already shipped; input is the next step. |
| **Kroger deprecation** | Low | Remove Kroger integration from public UI once Instacart is live. May retain as internal/personal feature. |
| **Security audit consulting** | Low | Discovered during Reddit engagement — offering lightweight security reviews for indie developer sites. Not core product but builds credibility and community goodwill. |
| **Inline step-text scaling** | Low | Replace quantities within step prose text when servings change. Nice-to-have. |
| **Collections / smart filters** | Low | "Under 30 minutes", "Vegetarian" auto-collections. Tags cover most needs. |
| **Nutrition estimation** | Low | Map ingredients to USDA FoodData Central. Valuable but not urgent. |

---

## 18. Testing Strategy

### 18.1 Current Test Suite

- **348 tests** across 15 test files, all passing.
- **Ingredient parser:** 172 fixtures covering common cases and edge cases.
- **Extraction:** JSON-LD and microdata parsing with validation tests.
- **Scaling:** Unit conversion, range scaling, null quantities.
- **Aggregation:** Ingredient merging, unit normalization, category sorting.
- **Step timers:** Time extraction from step text.
- **Security hardening:** OAuth cookie handling, CSRF protection, token encryption, input validation, rate limiting.
- **Instacart:** Ingredient name normalization and API mapping.

### 18.2 What's Tested

- Ingredient parser (fixture-based unit tests, largest suite).
- Recipe extraction pipeline (JSON-LD, microdata, normalization).
- Validation (recipe structure, field types, edge cases).
- Serving scaler (proportional scaling, unit conversion).
- Grocery aggregation (deduplication, unit normalization, category grouping).
- Step timer extraction (parsing time references from instruction text).
- Instacart ingredient mapping (normalizing parsed ingredients to API format).

### 18.3 What's Not Tested

- E2E / Playwright (not yet implemented).
- Visual regression.
- IndexedDB CRUD (tested manually, no automated suite).
- Service worker behavior (manual testing checklist).
- Video extraction pipeline (tested manually — involves external APIs and ffmpeg).
- Describe / RecipeChat (tested manually — involves LLM streaming).
- Discover / web search (tested manually — involves Puppeteer + external search).

---

## 19. Security & Content Sanitization

### 19.1 Extracted HTML

- All extracted text is treated as **plain text**, never rendered as raw HTML.
- **DOMPurify** sanitizes any content that passes through rendering paths.
- React's default text escaping provides an additional layer.

### 19.2 CORS Proxy Security

- **SSRF protection:** Blocked private IP ranges (127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x), localhost, metadata endpoints (metadata.google.internal), non-HTTP protocols.
- Proxy returns raw HTML for client-side extraction only. Raw HTML is never displayed.

### 19.3 Kroger API Security

- Kroger client credentials (`KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`) stored in Vercel environment variables, never exposed to the client.
- OAuth2 token exchange handled server-side.
- **User OAuth tokens stored in encrypted httpOnly cookies (AES-256-GCM).** Tokens never reach client JavaScript — no localStorage, no URL hash, no request body exposure. Cookie attributes: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api`.
- **CSRF protection on OAuth flow.** Random `state` nonce stored in a short-lived httpOnly cookie, validated on callback before code exchange.
- All Kroger API calls proxied through Vercel serverless functions.

### 19.4 Payment Security

- Stripe Checkout handles all payment data. No credit card information touches Mise's code.
- `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` stored in Vercel environment variables.
- No `.env` files have ever been committed to the repository (verified via full git history scan).
- **Rate limiting on comp PIN verification.** 5 failed attempts per email triggers 15-minute lockout (in-memory, resets on cold start — acceptable for serverless model).

### 19.5 Content Security Policy

- `script-src 'self'` — no inline scripts permitted. All JavaScript served from same origin.
- `style-src 'self' 'unsafe-inline'` — inline styles allowed for React/component library compatibility.
- `connect-src` restricted to known API domains (Stripe, Kroger, Hugging Face, tmpfiles.org, Instacart).
- Additional headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- **A+ rating on SecurityHeaders.com.** A+ rating on SSL Labs. TLS 1.3 with HSTS preload (2-year max-age).

### 19.6 Input Validation

- **Recipe import payloads** (base64 hash fragment): 1MB size limit, schema validation for expected recipe fields before parsing.
- **Email format validation** on comp verification endpoint.
- **Token format validation** on OAuth callback: non-empty string, max 4096 characters.

### 19.7 CORS Policy

- **Authenticated endpoints** (`kroger-status`, `kroger-cart`, `kroger-logout`): `Access-Control-Allow-Origin` restricted to `https://mise.swinch.dev` and `https://mise-recipe.vercel.app`. Includes `Vary: Origin` and `Access-Control-Allow-Credentials: true`.
- **Public endpoints** (`verify-purchase`, `kroger-authorize`): `Access-Control-Allow-Origin: *`.

### 19.8 PII Protection

- **Email/PIN verification moved from GET to POST** (v1.5). Prevents email addresses and PINs from appearing in server logs, Vercel analytics, browser history, and referrer headers. GET retained only for Stripe `sessionId` verification (opaque token, not PII).
- **Legacy localStorage token cleanup** (v1.5). One-time cleanup on app load removes `kroger_access_token`, `kroger_refresh_token`, and `kroger_token_expiry` from localStorage. These legacy keys predate the migration to encrypted httpOnly cookies.

### 19.9 AI Model Security

- All AI model calls (Qwen2.5-VL, Qwen3-14B, Whisper) proxied through Vercel serverless functions. HuggingFace API key (`HF_API_KEY`) never exposed to the client.
- Instacart API key (`INSTACART_API_KEY`) stored server-side only.
- User-uploaded images are uploaded to tmpfiles.org (temporary file hosting, auto-expires) for vision model processing. No persistent storage of user images on any server.

### 19.10 Full Security Audit

A comprehensive security review was conducted in February 2026 and documented in `docs/security-review.md`. The audit covers transport security, HTTP headers, authentication flows, client-side storage, CSP enforcement, third-party dependencies, API security, service worker behavior, browser permissions, and PWA manifest. All findings have been addressed or accepted with documented rationale.

---

## 20. Non-Functional Requirements

### 20.1 Browser Support

*Unchanged from v1.2.*

| Browser | Support Level |
| --- | --- |
| Chrome (desktop + Android) | Full support |
| Firefox (desktop + Android) | Full support |
| Safari (macOS) | Supported |
| Safari (iOS) | Supported with caveats (Wake Lock, background timers, storage eviction) |
| Edge | Expected to work (Chromium-based) |

### 20.2 Performance

- First load: < 3 seconds on 3G.
- Extraction: < 2 seconds (proxy). < 30 seconds (headless browser fallback). < 60 seconds (video extraction).
- Library search: < 100ms across 500 recipes.
- Parser: < 50ms per ingredient string.
- Describe: First token < 2 seconds. Full recipe generation < 15 seconds.
- Discover: Search results < 10 seconds (includes enrichment fetches).

### 20.3 iOS-Specific Limitations

- **Wake Lock API:** Graceful fallback message when unsupported.
- **Background timers:** Timer state persisted; resumes on foreground. Audio alerts may not fire while backgrounded.
- **Storage eviction:** Backup export nudges mitigate data loss risk.

---

## Appendix: v1.8 to v1.9 Changelog

| Section | What Changed |
| --- | --- |
| Executive Summary (1) | Updated "what changed" for v1.9: PRD accuracy fixes, image URL extraction, distribution channel updates, HF risk section. |
| Architecture (3) | New section 3.6: HuggingFace Single Point of Failure — documents dependency risk and mitigations for photo import, video extraction, and Describe. |
| Meal Planner (7.1) | Added post-save meal plan calendar prompt as shipped feature. Documents the 7×3 grid that bridges save → plan in the funnel. |
| Grocery Integration (8) | Header updated from "SHIPPED — PIVOTING" to "SHIPPED — LIVE". |
| Distribution (13.1) | Added Reddit (paused), TikTok (not started, high priority), and Facebook Groups (not started) to channel table. |
| Reddit Plan (13.3) | Removed contradictory "wait for analytics" timing. Added r/food permaban, volume constraints, and "Known constraints" subsection. |
| Conversion Flywheel (13.7) | Updated meal plan prompt description to reflect shipped 7×3 calendar grid UI, not just copy improvements. |
| Revenue (14.1) | Fixed Instacart affiliate status: "Built, awaiting production key" → "Live". |
| Build History (16) | Updated v1.0.3 row: added image URL extraction routing, clarified meal plan calendar prompt. |
| Roadmap (17) | Reddit launch: "In Progress" → "Paused". r/food whitelisting: "High" → "Blocked". Added TikTok/short-form video marketing as high priority. |

---

## Appendix: v1.7 to v1.8 Changelog

| Section | What Changed |
| --- | --- |
| Executive Summary (1) | Updated "what changed" to reflect Layer 3 heuristic extraction, stub JSON-LD fallthrough, Reddit community validation, share-link conversion flywheel, paste parser robustness, image URL editing, and SW race condition fix. |
| Recipe Extraction (4) | New section: Layer 3 Heuristic HTML Extraction for sites without structured data. Stub JSON-LD fallthrough note added to Layer 1. Paste parser robustness note added to Text Paste section. Layers renumbered (Photo Import → Layer 4, Video → Layer 5, Describe → Layer 6). |
| Distribution (13) | Updated Reddit Community Launch (13.3) with validated results from March 2026 field testing. New section 13.7: Share-Link Visitor Conversion Flywheel. Added "Immutable Recipe Snapshots" subsection to 13.4. |
| What Shipped (16) | Added v1.0.3 build: heuristic extraction, stub fallthrough, paste parser fix, image URL editing, share-link conversion flywheel, SW race condition fix. |
| Roadmap (17) | Reddit community launch moved to "In Progress" with validation results. Added recipe digitization service (medium), r/food whitelisting (high), security audit consulting (low). |

---

## Appendix: v1.6 to v1.7 Changelog

| Section | What Changed |
| --- | --- |
| Executive Summary (1) | Updated "what changed" to reflect share URL SEO strategy, Pinterest Rich Pins, and Pin It button. |
| Instacart Integration (8.2) | Status updated from "Awaiting Production Key" to "Live." Production key approved, Impact affiliate account active. |
| Reddit Launch Plan (13.3) | Added measurement guidance: track grocery checkout conversions per subreddit, not just traffic. UTM parameter strategy documented. |
| Distribution (13) | New section 13.4: SEO Distribution — share URLs as crawlable landing pages. Documents the novel architecture (URL-encoded recipe data decoded at edge for crawlers), Pinterest Rich Pin integration, Google indexing potential, cross-platform link previews, distribution flywheel, and risks (thin content classification). Includes prior art analysis showing the combination is novel. |
| Distribution (13) | New section 13.5: Directory Submissions — references existing strategy doc. |
| Distribution (13) | New section 13.6: Pinterest Bulk Pin Script — documents standalone Python script for non-recipe content marketing. |
| Revenue Timeline (14.6) | Production key and Impact affiliate updated to Done. Added "Revenue pipeline: Live" milestone. |
| Unit Economics (14.7) | Replaced single optimistic scenario ($395/year) with three-tier model: ceiling ($395), realistic ($185), conservative ($65). Added free user scenario ($180). Documented that the $395 figure is a ceiling, not expected value. |
| What Shipped (16) | Added "Instacart (Production)" row: production key, Impact account, live revenue pipeline. Added "Share & SEO" row: crawlable share URLs, Pinterest Rich Pins, Pin It button, OG meta tags, bulk pin script. |
| Roadmap (17) | Moved Instacart production key and Impact activation to shipped (strikethrough). Added "Pinterest Rich Pin validation" (immediate). Added "Share URL sitemap generation" (high). Added "OG image generation" (medium). |

---

## Appendix: v1.5 to v1.6 Changelog

| Section | What Changed |
| --- | --- |
| Executive Summary (1) | Rewritten to reflect five input modes, video extraction, Describe, Discover, Chrome extension, and Instacart build completion. |
| Governing constraint | Added "AI model routing" to serverless function scope. |
| Tech Stack (3.1) | Hyperbolic AI → Qwen2.5-VL via HuggingFace Inference API. Added Video Extraction (Puppeteer + ffmpeg + Whisper + Qwen2.5-VL), Describe (Qwen3-14B), Discover (DuckDuckGo + Puppeteer). Instacart updated to reflect recipe-level and shopping-list-level deep links. HuggingFace Inference API added to infrastructure costs. |
| Recipe Extraction (4) | Section rewritten. Added Layer 4: Video Extraction, Layer 5: Describe (LLM Generation), Text Paste. Existing layers updated (Hyperbolic → Qwen2.5-VL, added tmpfiles.org context). |
| Discover (9) | New section. Web recipe search with enrichment, blocked domains, and Describe fallback. |
| Ingredient Parser (10) | Test count updated: 306 → 348 tests, 10 → 15 test files. Added Instacart mapping tests. |
| Competitive Landscape (12) | Updated advantages to include video import, AI generation, and five input modes. |
| Distribution (13.1) | Chrome Extension status clarified (code exists, not published). HuggingFace Inference API added to costs. |
| Monetization (14) | Free tier table expanded with all five input modes and their limits. Video extraction limits documented (3 per platform). Describe and Discover documented as unlimited free. Revenue timeline updated with Instacart build completion and demo submission status. New section 14.7: Revenue Flywheel & Unit Economics — documents the meal plan -> aggregated grocery list -> Instacart flywheel, per-user unit economics ($10 signup bonus + $7.50/week affiliate), and strategic rationale for keeping the commerce funnel ungated. |
| Promise Boundaries (15) | Added video extraction, LLM generation, and web search rows. |
| What Shipped (16) | Added Video Extraction, Describe, Discover, Text Paste, Instacart rows. Photo Import updated (Hyperbolic → Qwen2.5-VL). Monetization updated with video extraction limits. |
| Roadmap (17) | Instacart updated from "build shopping flow" to "awaiting production key review." Added analytics/funnel tracking (high priority). Added video vision-transcript merging (high priority). Chrome Extension publish added (high priority — code exists, not yet on Web Store). |
| Testing (18) | 323 → 348 tests, 10 → 15 files. Added Instacart mapping to tested list. Added video, describe, discover to "not tested" (manual only). |
| Security (19) | Added section 19.9: AI Model Security (HF API key protection, tmpfiles.org temporary storage, Instacart API key server-side). CSP connect-src updated to include Instacart. |
| Performance (20.2) | Added video extraction (< 60s), Describe (first token < 2s), Discover (< 10s) targets. |

---

## Appendix: v1.4 to v1.5 Changelog

| Section | What Changed |
| --- | --- |
| Executive Summary (1) | Rewritten to reflect Instacart pivot, security hardening, and current state. |
| Governing constraint | "Kroger API" → "grocery APIs" to reflect multi-retailer strategy. |
| Grocery Integration (8) | Section renamed from "Kroger Integration." Kroger marked as deprecating. Instacart Developer Platform added as primary grocery partner with comparison table. |
| Competitive Landscape (11) | Updated advantages to reference Instacart (85,000+ stores) instead of Kroger. |
| Infrastructure Costs (12.2) | FlexOffers removed, Instacart Developer Platform added (both $0). |
| Monetization (13) | Affiliate stream changed from FlexOffers/Kroger (broken attribution) to Instacart/Impact (5% commission). Revenue timeline replaces future opportunities table. Free tier updated. |
| Promise Boundaries (14) | Updated grocery references from Kroger to Instacart. |
| Roadmap (16) | Instacart integration is now #1 priority. FlexOffers affiliate activation removed. Kroger deprecation added as low priority. |
| Testing (17) | 306 → 323 tests. Added security hardening test suite (17 tests). |
| Security (18) | New sections: CORS policy (18.7), PII protection (18.8), full security audit reference (18.9). CSP section updated with Permissions-Policy header and A+ ratings. |

---

## Appendix: v1.3 to v1.4 Changelog

| Section | What Changed |
| --- | --- |
| Security (18.3) | Kroger OAuth tokens moved from localStorage/URL hash to encrypted httpOnly cookies (AES-256-GCM). CSRF `state` parameter added to OAuth flow. |
| Security (18.4) | Added rate limiting (5 attempts / 15 min) on comped user PIN verification. |
| Security (18.5) | New section. CSP hardened: removed `'unsafe-inline'` from `script-src`. Documented all security headers. |
| Security (18.6) | New section. Input validation on recipe import payloads, email format, and OAuth token format. |
| Kroger Integration | `addToCart` API no longer requires client-side token — read from server cookie. Auth status checked via `/api/grocery/kroger-status` endpoint. |

---

## Appendix: v1.2 to v1.3 Changelog

| Section | What Changed |
| --- | --- |
| Governing constraint | "Zero infrastructure" -> "Minimal infrastructure" (Vercel serverless functions) |
| Tech stack | Cloudflare Worker -> Vercel. Added Puppeteer, Tesseract.js, Stripe, Kroger API, Vercel Analytics. |
| Extraction | Added headless browser fallback (Layer 2.5) and photo import (Layer 3 became OCR, not heuristic HTML). |
| Cooking mode | Added read-aloud (TTS), improved timer alarm sound. |
| New section | Kroger Integration (Section 8). Entirely new feature not in v1.2. |
| Monetization | Rewrote entirely. LemonSqueezy -> Stripe. Added affiliate revenue model. Revised "What We Will Never Do" to acknowledge affiliate links in shopping flow. |
| Competitive landscape | Added JustTheRecipe. Updated advantages to emphasize Kroger integration. |
| Infrastructure costs | Updated to reflect actual Vercel + Stripe costs. |
| Build order | Replaced forward-looking MVP plan with shipped feature history. |
| Roadmap | Reset based on current state. Affiliate activation is #1 priority. |
| Testing | Updated to reflect actual test suite (306 tests, 9 files). |
| Security | Added SSRF protection, Kroger API security, payment security sections. |
| Deprioritized | Browser extension, Paprika import, Collections, Heuristic HTML parser. |
