# Mise

**Just the Recipe.**

**Product Requirements Document**
*Version 1.3 | February 2026*

> **Design philosophy:** Personal tool first, product second. Built for our kitchen. If other people want it, they can buy it. Every decision is evaluated against: "Does this make cooking dinner easier tonight?" Not: "Will this convert at 2.3% on a landing page?"

> **Governing constraint (revised):** Minimal infrastructure, maximum leverage. The app runs in the browser with local storage. Backend is limited to stateless Vercel serverless functions (proxy, payment, Kroger API). No databases, no user accounts, no ops burden. If the creator disappears for two weeks, nothing breaks.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Problem (Why Every Recipe Site Is Terrible)](#2-the-problem-why-every-recipe-site-is-terrible)
3. [Product Architecture](#3-product-architecture)
4. [Feature 1: Recipe Extraction](#4-feature-1-recipe-extraction)
5. [Feature 2: Recipe Library](#5-feature-2-recipe-library)
6. [Feature 3: Cooking Mode](#6-feature-3-cooking-mode)
7. [Feature 4: Meal Planning & Grocery Lists](#7-feature-4-meal-planning--grocery-lists)
8. [Feature 5: Kroger Integration](#8-feature-5-kroger-integration)
9. [Ingredient Parser (The Hard, Valuable Part)](#9-ingredient-parser-the-hard-valuable-part)
10. [Data Model](#10-data-model)
11. [Competitive Landscape](#11-competitive-landscape)
12. [Packaging & Distribution](#12-packaging--distribution)
13. [Monetization](#13-monetization)
14. [Promise Boundaries](#14-promise-boundaries)
15. [What Shipped (Build History)](#15-what-shipped-build-history)
16. [Roadmap (What's Next)](#16-roadmap-whats-next)
17. [Testing Strategy](#17-testing-strategy)
18. [Security & Content Sanitization](#18-security--content-sanitization)
19. [Non-Functional Requirements](#19-non-functional-requirements)

---

## 1. Executive Summary

Mise (as in mise en place -- everything in its place) is a recipe app that does one thing well: it takes a recipe URL and gives you just the recipe. No life stories. No ads. No pop-ups. No "Jump to Recipe" button because there's nothing to jump past.

Mise is a Progressive Web App (PWA) hosted on Vercel. It runs on phones, tablets, and desktops. It works offline after first load. All recipe data is stored locally in the browser via IndexedDB.

The core workflow is: paste a URL -> get a clean recipe -> save it to your library -> cook from it. The extended workflow is: plan your week -> generate a grocery list -> check prices at your local Kroger -> add to cart and shop.

**What changed since v1.2:** The product shipped, found users, and evolved. The "zero infrastructure" constraint relaxed to accommodate Vercel serverless functions for the proxy layer, Stripe payments, and the Kroger API integration. The monetization model shifted from "if it gets that far" to a deliberate two-revenue-stream strategy: one-time $4.99 unlock + grocery affiliate commission. Photo import via OCR shipped. Cook mode got hands-free read-aloud. The browser extension and Paprika import were deprioritized in favor of features that drive the grocery-to-checkout pipeline.

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
| Proxy Layer | Vercel Serverless Functions | Multiple endpoints: CORS proxy, headless browser fallback (Puppeteer), image extraction (Hyperbolic AI), Stripe checkout, Kroger OAuth + API. |
| Recipe Extraction | Client-side JSON-LD + Microdata parsers | Extracts Schema.org/Recipe structured data from HTML received via proxy. |
| Photo Import | Tesseract.js (OCR) + Hyperbolic AI vision | Extracts recipes from cookbook photos and screenshots. |
| Ingredient Parser | Custom rule-based TypeScript pipeline | Turns "2 cups finely diced onions" into structured data. 172+ test fixtures. |
| Serving Scaler | Arithmetic on parsed ingredients | Adjusts quantities proportionally with unit conversion. |
| Offline Support | Service Worker (Workbox) | Full offline capability. Recipe images cached (CacheFirst, 200 entries, 30-day TTL). |
| Payment | Stripe (one-time checkout) | $4.99 unlock via Stripe Checkout. Comp system via COMPED_EMAILS env var with PIN verification. |
| Grocery Integration | Kroger Developer API | Product search, price lookup, cart management via OAuth2. |
| Analytics | Vercel Analytics | Privacy-focused, no cookies, aggregate data only. |
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
- Cloud sync remains a future priority (see Section 16).

---

## 4. Feature 1: Recipe Extraction

### 4.1 Layer 1: Schema.org/Recipe JSON-LD [SHIPPED]

Finds `<script type="application/ld+json">` tags, parses JSON, normalizes fields. Handles nested `@graph` arrays and multiple JSON-LD blocks. Covers ~80% of recipe URLs.

### 4.2 Layer 2: Microdata / RDFa Fallback [SHIPPED]

Extracts Schema.org markup via `itemprop`/`itemscope` attributes. Catches another ~10-15% of sites.

### 4.3 Layer 2.5: Headless Browser Fallback [SHIPPED]

For bot-protected sites where the proxy gets blocked, Puppeteer with stealth plugin renders the page server-side. Waits for JSON-LD to appear in the DOM (many sites inject it via JavaScript). 30-second timeout.

### 4.4 Layer 3: Photo Import / OCR [SHIPPED]

User photographs a cookbook page or screenshot. Tesseract.js runs OCR client-side, then the extracted text is sent to Hyperbolic AI vision model for structured recipe extraction. Returns title, ingredients, steps, servings, and times.

### 4.5 Image Extraction

Recipe images are extracted from JSON-LD `image` field (handles string, array, and ImageObject formats). Falls back to `og:image` meta tag when JSON-LD image is missing.

### 4.6 Extraction Error Handling

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

## 8. Feature 5: Kroger Integration [SHIPPED]

This is the feature that transforms Mise from a recipe tool into a commerce platform.

### 8.1 What It Does

1. **Store selector.** User enters zip code, sees nearby Kroger-family stores with addresses.
2. **Price lookup.** Every grocery list ingredient is searched against the Kroger Product API. Returns up to 5 product matches per ingredient with images, brands, sizes, and prices (regular + promo).
3. **Product cycling.** User can cycle through alternative product matches per ingredient (store brand vs. name brand, different sizes).
4. **Quantity adjustment.** Increase/decrease quantity per item.
5. **Running total.** Live estimated total updates as products are selected/deselected and quantities change.
6. **Add to Kroger Cart.** OAuth2 login, then selected products are added to the user's real Kroger cart via the Cart API. Opens kroger.com/cart in a new tab.

### 8.2 Technical Implementation

- Kroger Developer API (developer.kroger.com) with OAuth2 client credentials for product search, authorization code flow for cart access.
- All API calls proxied through Vercel serverless functions (client never sees Kroger credentials).
- Token refresh handled server-side.
- FTC affiliate disclosure displayed above "Add to Cart" button.

### 8.3 Why This Matters

The Kroger integration is the primary revenue driver (see Section 13). Every user who plans meals, generates a grocery list, and checks out through Kroger generates affiliate commission. The one-time $4.99 payment is the funnel gate; grocery affiliate revenue is the recurring business model.

---

## 9. Ingredient Parser (The Hard, Valuable Part)

*Architecture unchanged from v1.2. Results exceeded expectations.*

### 9.1 Current State

- **172+ unit test fixtures** covering quantities, units, fractions, ranges, parentheticals, prep instructions, compound ingredients, and edge cases.
- **306 total tests** passing across the test suite (parser, extraction, validation, scaling, aggregation).
- Rule-based pipeline in TypeScript. Deterministic, fast, client-side.
- Parser handles: whole numbers, fractions, unicode fractions, ranges (3-4), mixed numbers (1 1/2), absent quantities ("to taste"), standard units, informal units, container-based units, parenthetical notes, prep before/after ingredient, compound ingredients, optional flags.

### 9.2 What Changed from v1.2

- Parser accuracy exceeded the "90% case" target. Handles the vast majority of real-world ingredient strings without LLM fallback.
- LLM-assisted parsing (Phase 2) has not been needed. The rule-based parser is sufficient for production use.
- Auto-tagging (`autoTag.ts`) infers meal type tags from recipe category, keywords, and title on save.

---

## 10. Data Model

*Core schema unchanged from v1.2.* All data stored in IndexedDB via Dexie.js. Key additions:

### 10.1 Additions Since v1.2

| Entity | Status | Notes |
| --- | --- | --- |
| Recipe | Shipped | As specified in v1.2. Added `tags` auto-population via `autoTag.ts`. |
| Ingredient | Shipped | As specified. Category dictionary covers produce, dairy, meat, seafood, pantry, spices, frozen, bakery, beverages, other. |
| MealPlan | Shipped | Flat entries queried by date range. |
| GroceryList | Shipped | Aggregated items + manual items. Checked state persists. |
| Collection | Not shipped | Tags provide sufficient organization. |
| Nutrition | Shipped | Extracted from JSON-LD when available. Display only, no estimation. |

---

## 11. Competitive Landscape

*Updated to reflect current positioning.*

| App | Price | Mise's Advantage |
| --- | --- | --- |
| Paprika | $4.99/platform ($15 total) | PWA = one purchase, every device. Kroger price check + cart integration. Modern UI. |
| JustTheRecipe | Free + $2/month subscription | No subscription. $4.99 one-time = $24/yr savings vs JTR. Meal planning + grocery list + Kroger. |
| Mela | $5.99/yr or $9.99 lifetime | Cross-platform (not Apple-only). Kroger integration. Better grocery list aggregation. |
| CookBook | Free + $2.99 premium | No ads. Photo import. Kroger integration. |
| Whisk (Samsung) | Free | No ecosystem lock-in. Privacy-first. Deeper ingredient parsing. |

**Honest assessment:** Paprika is still the gold standard for recipe management. Mise's differentiation is now clearer: (1) PWA cross-platform, (2) Kroger price check and cart integration (no competitor has this), (3) photo import from cookbooks, (4) hands-free cook mode with read-aloud. The Kroger integration is the moat — it turns a recipe app into a shopping tool.

---

## 12. Packaging & Distribution

### 12.1 Current Distribution

| Channel | Status |
| --- | --- |
| PWA at mise.swinch.dev | Live |
| Vercel hosting (free tier) | Live |
| Custom domain (mise.swinch.dev) | Live |
| Vercel Analytics | Live |
| Browser extension | Not shipped. Deprioritized. |
| App stores | Not shipped. PWA is sufficient. |

### 12.2 Infrastructure Costs (Actual)

| Item | Cost |
| --- | --- |
| Vercel hosting + serverless functions | $0 (free tier) |
| Domain (swinch.dev) | ~$12/year |
| Stripe | 2.9% + $0.30 per transaction |
| Kroger Developer API | $0 |
| FlexOffers affiliate network | $0 (pending approval) |
| **Total fixed cost** | **~$12/year** |

---

## 13. Monetization

*This section is substantially rewritten from v1.2. Monetization is no longer hypothetical.*

### 13.1 Revenue Model: Two Streams

| Stream | Mechanism | Status |
| --- | --- | --- |
| **One-time unlock** | $4.99 via Stripe Checkout. Unlocks unlimited saved recipes, photo import, and all features. | Live |
| **Grocery affiliate commission** | Kroger checkout links routed through FlexOffers affiliate network. 1.6% on delivery, 4.8% on shipped orders, 7-day cookie. | Pending (FlexOffers approval) |

### 13.2 Why $4.99

The $4.99 isn't where the money is made -- the affiliate revenue is. The one-time payment serves three purposes:

1. **Filters for engaged users.** Someone who pays has committed to the app and is more likely to generate weekly grocery orders.
2. **Positions against competition.** JustTheRecipe charges $2/month ($24/year). Paprika charges $4.99 per platform. Mise is $4.99 total, forever, every device.
3. **Removes friction at the right moment.** Going higher ($9.99) loses users who would generate grocery affiliate revenue. Going lower ($2.99) undervalues the product without meaningfully reducing friction.

### 13.3 Free Tier

- Extract and view recipes (unlimited).
- Save up to 25 recipes.
- Cooking mode with timers and read-aloud.
- Meal planning and grocery list generation.
- Kroger price check and cart integration.

The free tier includes the Kroger flow intentionally. A free user who shops through Kroger every week generates more affiliate revenue than a $4.99 payment. The paywall gates library size, not the commerce funnel.

### 13.4 Entitlement Mechanism

- Stripe Checkout (mode: 'payment', one-time, not subscription).
- On successful payment, unlock flag stored locally in IndexedDB keyed to email.
- Restore purchase on new device by entering email (verified against Stripe API via serverless function).
- Comp system: `COMPED_EMAILS` environment variable with optional PIN verification for gifted access.

### 13.5 Affiliate Integration

The affiliate link is a one-line change in `KrogerPriceView.tsx` line 118. Currently opens `kroger.com/cart` directly. Once FlexOffers approves, the URL becomes an affiliate redirect that sets the tracking cookie before landing the user on their cart page. Cart is already populated via the Kroger Cart API.

FTC disclosure ("Mise may earn a commission from purchases made through these links.") is displayed above the "Add to Cart" button.

### 13.6 Future Revenue Opportunities

| Opportunity | When | Notes |
| --- | --- | --- |
| Instacart Developer Platform | After Kroger affiliate is live | $10 per new customer + ongoing commission. Covers users without a nearby Kroger. |
| CJ Affiliate / Sovrn (additional Kroger networks) | After FlexOffers | Redundancy. Same commission structure, different approval criteria. |
| Direct Kroger partnership | After 50K+ active users | Better terms than affiliate networks. Requires traction data. |

### 13.7 What We Will Never Do

- **Ads.** Ever. This product exists because ads ruined recipe websites.
- **Sell user data.** There is no user data to sell. Everything is local.
- **Upsell to a subscription.** The one-time price is the price.
- **Sponsored recipes.** No promoted content.

**What changed from v1.2:** The PRD originally stated "No affiliate links in recipes. No brand partnerships." This was revised. The Kroger affiliate link is not in recipes -- it's in the shopping checkout flow, which is a feature the user explicitly initiates. The affiliate revenue aligns user and business incentives: the user gets a convenient shopping experience, and Mise earns a commission on purchases the user was already going to make. This is fundamentally different from injecting "buy this on Amazon" links into ingredient lists.

---

## 14. Promise Boundaries

| Mise Does | Mise Does NOT Do |
| --- | --- |
| Extract recipes from URLs using structured data (JSON-LD, microdata) | Guarantee extraction from every website. Some sites have no structured data. |
| Extract recipes from photos of cookbook pages via OCR | Guarantee OCR accuracy. Users can edit extracted text. |
| Parse ingredients into structured data (quantity, unit, ingredient, prep) | Guarantee 100% parse accuracy. The parser is good, not perfect. |
| Store all data locally on the user's device | Store any data on our servers. Your recipes are yours. |
| Generate grocery lists from meal plans with ingredient aggregation | Order groceries for you (but it can add items to your Kroger cart). |
| Show real prices at your local Kroger store | Guarantee price accuracy. Prices come from Kroger's API and may vary. |
| Work offline after first load | Sync between devices. Cloud sync is a planned future feature. |

---

## 15. What Shipped (Build History)

The MVP build order from v1.2 is now history. Here's what actually shipped:

| Phase | What Shipped |
| --- | --- |
| **Foundation** | PWA shell, Vite + React 19, service worker, offline support, Vercel hosting |
| **Extraction** | JSON-LD parser, microdata fallback, CORS proxy, headless browser fallback (Puppeteer + stealth), og:image fallback |
| **Parser** | Rule-based ingredient parser, 172+ fixtures, quantity/unit/ingredient/prep/notes separation, category assignment, range support, optional detection |
| **Library** | IndexedDB storage (Dexie), save/delete, tags (manual + auto), favorites, notes, search, meal type filters, JSON import/export, backup nudge |
| **Cooking Mode** | Step-by-step full-screen, keyboard navigation, wake lock, timer extraction + management, ingredient sidebar with check-off, timer bar, read-aloud (TTS), two-tone timer alarm |
| **Scaling** | Serving scaler with unit consolidation (volume-to-tsp, weight-to-gram) |
| **Meal Planning** | Weekly calendar, recipe assignment, recipe picker, week navigation |
| **Grocery** | Aggregation engine, unit normalization, category grouping, manual additions, check-off |
| **Kroger** | Store selector (zip code), product search, price display (regular + promo), product cycling, quantity adjustment, OAuth2 login, cart API, running total |
| **Photo Import** | Tesseract.js OCR, Hyperbolic AI vision extraction, review/edit flow |
| **Monetization** | Stripe one-time checkout ($4.99), email-based restore, comp system with PIN, FTC affiliate disclosure |
| **Polish** | PWA install prompt (triggers after first extraction), DOMPurify sanitization, SSRF protection on proxy, Vercel Analytics |

---

## 16. Roadmap (What's Next)

Ranked by expected impact:

| Feature | Priority | Why |
| --- | --- | --- |
| **Affiliate link activation** | Immediate | FlexOffers approval pending. One-line URL change. Revenue starts. |
| **Instacart integration** | High | Covers non-Kroger users. Instacart Developer Platform has formal partner tiers. |
| **Cloud sync** | High | Users on multiple devices need recipe sync. First real infrastructure commitment (Supabase or similar). |
| **Browser extension** | Medium | One-click extraction from any recipe page. Bypasses CORS entirely. Deprioritized earlier because proxy + headless browser cover most cases. |
| **Paprika import** | Medium | Removes switching cost from the largest competitor's user base. |
| **Voice commands in cook mode** | Medium | "Next step", "start timer" via Web Speech API recognition. Read-aloud (output) already shipped; input is the next step. |
| **Inline step-text scaling** | Low | Replace quantities within step prose text when servings change. Nice-to-have. |
| **Collections / smart filters** | Low | "Under 30 minutes", "Vegetarian" auto-collections. Tags cover most needs. |
| **Nutrition estimation** | Low | Map ingredients to USDA FoodData Central. Valuable but not urgent. |

---

## 17. Testing Strategy

### 17.1 Current Test Suite

- **306 tests** across 9 test files, all passing.
- **Ingredient parser:** 172 fixtures covering common cases and edge cases.
- **Extraction:** JSON-LD and microdata parsing with validation tests (45 tests).
- **Scaling:** 20 tests covering unit conversion, range scaling, null quantities.
- **Aggregation:** 9 tests covering ingredient merging, unit normalization, category sorting.
- **Step timers:** 14 tests for time extraction from step text.

### 17.2 What's Tested

- Ingredient parser (fixture-based unit tests, largest suite).
- Recipe extraction pipeline (JSON-LD, microdata, normalization).
- Validation (recipe structure, field types, edge cases).
- Serving scaler (proportional scaling, unit conversion).
- Grocery aggregation (deduplication, unit normalization, category grouping).
- Step timer extraction (parsing time references from instruction text).

### 17.3 What's Not Tested

- E2E / Playwright (not yet implemented).
- Visual regression.
- IndexedDB CRUD (tested manually, no automated suite).
- Service worker behavior (manual testing checklist).
- Kroger API integration (tested manually against live API).

---

## 18. Security & Content Sanitization

### 18.1 Extracted HTML

- All extracted text is treated as **plain text**, never rendered as raw HTML.
- **DOMPurify** sanitizes any content that passes through rendering paths.
- React's default text escaping provides an additional layer.

### 18.2 CORS Proxy Security

- **SSRF protection:** Blocked private IP ranges (127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x), localhost, metadata endpoints (metadata.google.internal), non-HTTP protocols.
- Proxy returns raw HTML for client-side extraction only. Raw HTML is never displayed.

### 18.3 Kroger API Security

- Kroger client credentials (`KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`) stored in Vercel environment variables, never exposed to the client.
- OAuth2 token exchange handled server-side.
- All Kroger API calls proxied through Vercel serverless functions.

### 18.4 Payment Security

- Stripe Checkout handles all payment data. No credit card information touches Mise's code.
- `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` stored in Vercel environment variables.
- No `.env` files have ever been committed to the repository (verified via full git history scan).

---

## 19. Non-Functional Requirements

### 19.1 Browser Support

*Unchanged from v1.2.*

| Browser | Support Level |
| --- | --- |
| Chrome (desktop + Android) | Full support |
| Firefox (desktop + Android) | Full support |
| Safari (macOS) | Supported |
| Safari (iOS) | Supported with caveats (Wake Lock, background timers, storage eviction) |
| Edge | Expected to work (Chromium-based) |

### 19.2 Performance

- First load: < 3 seconds on 3G.
- Extraction: < 2 seconds (proxy). < 30 seconds (headless browser fallback).
- Library search: < 100ms across 500 recipes.
- Parser: < 50ms per ingredient string.

### 19.3 iOS-Specific Limitations

- **Wake Lock API:** Graceful fallback message when unsupported.
- **Background timers:** Timer state persisted; resumes on foreground. Audio alerts may not fire while backgrounded.
- **Storage eviction:** Backup export nudges mitigate data loss risk.

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
