# Mise

**Just the Recipe.**

**Product Requirements Document**
*Version 1.0 | February 2026*

> **Design philosophy:** Personal tool first, product second. Built for our kitchen. If other people want it, they can buy it. Every decision is evaluated against: "Does this make cooking dinner easier tonight?" Not: "Will this convert at 2.3% on a landing page?"

> **Governing constraint:** Zero infrastructure at launch. No servers, no databases, no ops burden. The app runs entirely in the browser with local storage. Cloud sync is a future add-on, not a launch requirement. If the creator disappears for two weeks, nothing breaks because there is nothing running.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Problem (Why Every Recipe Site Is Terrible)](#2-the-problem-why-every-recipe-site-is-terrible)
3. [Product Architecture](#3-product-architecture)
4. [Feature 1: Recipe Extraction](#4-feature-1-recipe-extraction)
5. [Feature 2: Recipe Library](#5-feature-2-recipe-library)
6. [Feature 3: Cooking Mode](#6-feature-3-cooking-mode)
7. [Feature 4: Meal Planning & Grocery Lists](#7-feature-4-meal-planning--grocery-lists)
8. [Ingredient Parser (The Hard, Valuable Part)](#8-ingredient-parser-the-hard-valuable-part)
9. [Data Model](#9-data-model)
10. [Competitive Landscape](#10-competitive-landscape)
11. [Packaging & Distribution](#11-packaging--distribution)
12. [Monetization (If It Gets That Far)](#12-monetization-if-it-gets-that-far)
13. [Promise Boundaries](#13-promise-boundaries)
14. [MVP Build Order](#14-mvp-build-order)
15. [Post-MVP Roadmap](#15-post-mvp-roadmap)

---

## 1. Executive Summary

Mise (as in mise en place — everything in its place) is a recipe app that does one thing well: it takes a recipe URL and gives you just the recipe. No life stories. No ads. No pop-ups. No "Jump to Recipe" button because there's nothing to jump past.

Mise is a Progressive Web App (PWA) that runs entirely in the browser with local storage. It works on phones, tablets, and desktops. It works offline after first load. It has zero backend infrastructure, zero telemetry, and zero ongoing server costs.

The core workflow is: paste a URL → get a clean recipe → save it to your library → cook from it. Over time, you build a personal recipe collection that you can search, tag, scale, and use for meal planning and grocery list generation.

Why this exists: Because Brittany and I are tired of scrolling past 2,000 words of someone's Tuscan vacation to find "preheat oven to 375°F."

---

## 2. The Problem (Why Every Recipe Site Is Terrible)

Recipe websites are optimized for ad revenue, not for cooking. The incentive structure is broken: longer pages = more ad slots = more revenue. This produces a predictable pattern:

| What You Want | What You Get |
| --- | --- |
| Ingredients list | 1,200 words about how this recipe reminds the author of their grandmother's kitchen in Vermont |
| Step-by-step instructions | 17 affiliate links to kitchen gadgets, a video that auto-plays, and a newsletter popup |
| Serving size adjustment | A WordPress plugin that barely works and reloads the page with new ads |
| Grocery list for the week | 5 browser tabs, manual cross-referencing, and a Notes app |
| Quick reference while cooking | A screen that goes dark every 30 seconds, hands covered in flour, scrolling past ads to find step 4 |

The "Jump to Recipe" button is the industry's confession that the content above the recipe is not for the reader. It exists because Google's SEO algorithm historically rewarded longer content, so recipe bloggers pad their posts with stories, tips, and keyword-rich filler. The recipe is the product; everything else is the ad delivery mechanism.

Mise eliminates the delivery mechanism and keeps the product.

---

## 3. Product Architecture

### 3.1 Technology Stack

| Component | Technology | Why |
| --- | --- | --- |
| App Shell | PWA (React or Solid) | Installable on any device. Works offline. No app store review process. Single codebase for phone, tablet, desktop. |
| Local Storage | IndexedDB (via Dexie.js or idb) | Stores recipes, tags, meal plans, grocery lists. Survives browser restarts. No size limits that matter for recipe data. No server required. |
| Recipe Extraction | Client-side fetch + JSON-LD parser | Extracts Schema.org/Recipe structured data from URLs. Falls back to HTML parsing for sites without schema markup. Runs in the browser (or via a lightweight proxy for CORS). |
| Ingredient Parser | Custom NLP parser (rule-based + ML fallback) | Turns "2 cups finely diced onions" into {qty: 2, unit: "cup", ingredient: "onion", prep: "finely diced"}. The hard, valuable, defensible piece. |
| Serving Scaler | Arithmetic on parsed ingredients | Adjusts quantities proportionally. Handles unit conversions (tbsp → cup when scaling up). Only works because the ingredient parser produces structured data. |
| Offline Support | Service Worker + cache | Full offline capability after first load. Recipes stored locally. No network needed to browse, cook, or plan. |

### 3.2 The CORS Problem (And How to Solve It)

The biggest technical constraint for a client-side recipe extractor is CORS. Recipe websites don't set Access-Control-Allow-Origin headers, so a browser-based app can't fetch their HTML directly.

Three solutions, in order of preference:

- **Option 1 (MVP): Browser extension.** A companion browser extension can read the current page's DOM directly, bypassing CORS entirely. User clicks the extension on any recipe page, it extracts the JSON-LD and/or parses the HTML, and sends the structured recipe to the PWA. This is the simplest approach and requires zero server infrastructure.
- **Option 2: Share target / clipboard.** On mobile, user shares a URL to the PWA (using the Web Share Target API) or pastes it. The PWA sends the URL to a lightweight serverless function (Cloudflare Worker or Vercel Edge Function) that fetches the page, extracts the recipe, and returns structured JSON. Serverless = no ops, pennies per invocation, scales to zero.
- **Option 3: Manual entry + import.** User pastes raw text or types a recipe manually. No extraction needed. Always works, always available, zero infrastructure. Supports import from Paprika, CookBook, and other apps via standard formats.

MVP ships with Options 1 and 3. Option 2 is added when mobile usage justifies a serverless function.

### 3.3 Why a PWA Instead of a Native App

- Single codebase for every device. No maintaining iOS + Android + web separately.
- No App Store review process. Ship updates instantly. No 3-day review delay, no guideline compliance risk.
- Installable on home screen. Looks and feels like a native app. Full-screen, no browser chrome.
- Offline-first is built into the PWA model via service workers.
- No $99/year Apple Developer Program fee. No Google Play fee. No app store commission on in-app purchases.
- The only trade-off: no push notifications on iOS (partially resolved in iOS 16.4+). This doesn't matter for a recipe app.

---

## 4. Feature 1: Recipe Extraction

The extraction pipeline has three layers, tried in order. If layer 1 succeeds, layers 2 and 3 are skipped.

### 4.1 Layer 1: Schema.org/Recipe JSON-LD

Google requires recipe sites to include structured data for rich search results. Most major recipe sites embed a JSON-LD block with @type: Recipe in their HTML. This block contains: name, description, recipeIngredient (array of strings), recipeInstructions (array of steps), prepTime, cookTime, totalTime, recipeYield (servings), nutrition, image, author, and datePublished.

Extraction is trivial: find the `<script type="application/ld+json">` tag, parse the JSON, and normalize the fields. This works for an estimated 80%+ of recipe URLs because Google incentivizes compliance.

**Key advantage:** This is not fragile HTML scraping. JSON-LD is a structured contract between the site and search engines. Sites are incentivized to keep it accurate because it drives Google traffic. If they break it, they lose SEO ranking. This means the extraction pipeline is maintained by Google's incentive structure, not by us.

### 4.2 Layer 2: Microdata / RDFa Fallback

Some older sites use Schema.org markup via microdata attributes (itemprop, itemscope) or RDFa instead of JSON-LD. The parser checks for these and extracts the same fields. This catches another 10–15% of sites.

### 4.3 Layer 3: Heuristic HTML Parsing

For the ~5–10% of recipe pages with no structured data, a heuristic parser looks for common patterns: ingredient lists (usually `<ul>` elements with quantity patterns), instruction lists (usually `<ol>` elements or numbered paragraphs), and metadata in common CSS classes or heading patterns. This layer is inherently less reliable and is flagged as "best-effort" in the UI. Users can manually correct extracted data.

**Important:** Layer 3 is not a maintenance commitment. If a specific site doesn't extract cleanly via heuristics, the user can paste the recipe manually (Option 3). There are no site-specific parsers to maintain. This is the critical lesson from VaultFolio: don't promise to parse every format.

### 4.4 Extraction Output

Regardless of which layer succeeds, the output is a standardized Recipe object (see Section 9: Data Model). The user sees: recipe title, source URL, servings, prep/cook/total time, ingredients (parsed into structured form), and steps. They can edit any field before saving. The extraction is a starting point, not a final answer.

---

## 5. Feature 2: Recipe Library

The library is the personal recipe collection. It's the reason Mise becomes a daily-use app rather than a one-shot extraction tool.

### 5.1 Organization

| Feature | Details |
| --- | --- |
| Tags | User-defined tags (e.g., "weeknight", "slow cooker", "kid-friendly", "Brittany's favorites"). A recipe can have multiple tags. Tags are the primary organization mechanism. |
| Collections | Optional groupings larger than tags (e.g., "Thanksgiving 2026", "Meal prep rotation"). A recipe can belong to multiple collections. |
| Search | Full-text search across recipe titles, ingredients, tags, and notes. Instant, client-side (IndexedDB query or in-memory index). No server round-trip. |
| Favorites | Quick-access flag. Favorites surface first in browse and meal planning. |
| Notes | Free-text notes per recipe (e.g., "Double the garlic", "Kids prefer less spice", "Last made 2/9/2026"). Notes are personal and never overwritten by re-extraction. |
| Source tracking | Every extracted recipe keeps its source URL. Original author is credited. Mise is a recipe organizer, not a recipe plagiarizer. |

### 5.2 Manual Recipe Entry

Not every recipe comes from a URL. Family recipes, cookbook adaptations, and original creations need manual entry. The manual entry form has the same fields as an extracted recipe but is pre-populated blank. The ingredient parser runs on each line as the user types, providing real-time structured previews (quantity, unit, ingredient, prep). If the parser misinterprets something, the user can override.

### 5.3 Import / Export

- **Import from Paprika (.paprikarecipes):** Paprika is the most popular paid recipe app. Supporting import from Paprika is the single most effective acquisition channel because it removes the switching cost.
- **Import from generic formats:** JSON (Mise native format), Recipe Keeper (.zip), CookBook (.html export).
- **Export:** Full library export as JSON. Individual recipe export as JSON, printable HTML, or plain text. Your data is always yours. No lock-in.

---

## 6. Feature 3: Cooking Mode

Cooking mode is the "in the kitchen with flour on your hands" experience. Everything else in Mise is browsing and planning; cooking mode is doing.

### 6.1 Design Principles

- **Large text, high contrast.** Readable from 3 feet away on a counter. No squinting at a phone propped against a paper towel holder.
- **Step-by-step progression.** One step at a time, full screen. Swipe or tap to advance. Current step is always obvious. Ingredients referenced in the current step are highlighted.
- **Screen stays on.** Wake lock API keeps the screen active while cooking mode is open. No re-unlocking with wet hands.
- **Timers.** Any time mentioned in a step ("bake for 25 minutes") becomes a tappable timer. Multiple concurrent timers supported. Timers work even if you leave cooking mode.
- **Ingredients sidebar.** Swipe left (or tap a tab) to see the full ingredient list at any time. Ingredients can be checked off as they're used.
- **No navigation chrome.** Full-screen, distraction-free. Back button exits cooking mode with a confirmation prompt.

### 6.2 Scaling in Cooking Mode

Servings can be adjusted before or during cooking. When servings change, all ingredient quantities update in real-time — both in the ingredient sidebar and inline within step text. Unit conversions happen automatically when scaling makes the original unit awkward (e.g., "0.25 cups" becomes "4 tablespoons"; "48 teaspoons" becomes "1 cup").

---

## 7. Feature 4: Meal Planning & Grocery Lists

### 7.1 Meal Planner

A simple calendar view where you assign recipes to days and meals (breakfast, lunch, dinner, snack). Drag-and-drop or tap-to-assign. The meal plan is the input to the grocery list generator.

| Feature | Details |
| --- | --- |
| Weekly view | 7-day default view. Scrollable to future weeks. |
| Recipe assignment | Assign any saved recipe to any meal slot. Same recipe can appear multiple times. |
| Serving override | Each meal plan entry can override the recipe's default serving count. "Wednesday dinner: Chicken Tikka Masala, 6 servings" (instead of default 4). |
| Quick add | Add a meal without a recipe (e.g., "Leftovers", "Eat out"). These don't generate grocery items. |
| History | Past meal plans are saved. Useful for "what did we have last Tuesday?" and for recurring weekly rotations. |

### 7.2 Grocery List Generator

The grocery list is generated from the meal plan. It aggregates all ingredients across all planned recipes, deduplicates, converts units, and groups by category.

| Feature | Details |
| --- | --- |
| Aggregation | If Monday needs 1 cup diced onion and Thursday needs 2 cups diced onion, the grocery list shows 3 cups onion. This only works because the ingredient parser produces structured data. |
| Unit normalization | Combines "4 tbsp butter" + "0.5 cup butter" into the appropriate total. Keeps weight and volume separate (doesn't combine "100g flour" with "1 cup flour" unless density is known). |
| Category grouping | Ingredients grouped by aisle/category: produce, dairy, meat, pantry, spices, frozen, etc. Category assignment uses a built-in dictionary with user override. |
| Manual additions | Add non-recipe items to the list ("paper towels", "dog food"). These persist across list regenerations. |
| Check-off | Tap to check off items while shopping. Checked items move to bottom but remain visible. |
| Sharing | Copy list as plain text (for texting) or share via the Web Share API. |

Why this feature matters commercially: Grocery list generation is the feature that separates a recipe saver from a kitchen tool. It's also the feature most competitors do poorly because it requires a good ingredient parser. This is where the investment in structured ingredient data pays off.

---

## 8. Ingredient Parser (The Hard, Valuable Part)

The ingredient parser is the core intellectual property of Mise. Everything else — extraction, library, cooking mode, meal planning, grocery lists — depends on the parser producing structured data from raw ingredient strings. If the parser is good, every downstream feature works well. If the parser is bad, everything is a hack.

### 8.1 What the Parser Does

Input: a raw ingredient string as it appears on a recipe website.
Output: a structured object with separated fields.

| Raw Input | qty | unit | ingredient | prep | notes |
| --- | --- | --- | --- | --- | --- |
| "2 cups finely diced onions" | 2 | cup | onion | finely diced | |
| "1 (14.5 oz) can diced tomatoes, drained" | 1 | can (14.5 oz) | diced tomatoes | | drained |
| "3-4 cloves garlic, minced" | 3–4 | clove | garlic | minced | |
| "salt and pepper to taste" | | | salt and pepper | | to taste |
| "½ cup (1 stick) unsalted butter, softened" | 0.5 | cup | unsalted butter | softened | 1 stick |
| "zest of 1 lemon" | 1 | | lemon | zested | |
| "2 lbs boneless skinless chicken breasts, cut into 1-inch cubes" | 2 | lb | boneless skinless chicken breast | cut into 1-inch cubes | |

### 8.2 Why This Is Hard

Ingredient strings are a natural language problem on a constrained domain. The grammar is semi-structured but wildly inconsistent across sources:

- Quantities can be: whole numbers (2), fractions (½), unicode fractions (¾), ranges (3-4), mixed numbers (1 ½), or absent entirely ("salt to taste").
- Units can be: standard (cup, tbsp, oz), informal ("a handful", "a pinch"), container-based ("1 can", "1 bag"), or absent ("3 eggs").
- Parenthetical notes appear everywhere: "1 (14.5 oz) can", "½ cup (1 stick) butter", "2 cups (about 3 medium) diced apples."
- Prep instructions can be before the ingredient ("finely diced onions") or after ("onions, finely diced").
- Compound ingredients: "salt and pepper" is one item. "olive oil and vinegar" might be one item or two depending on context.
- The word "or" introduces alternatives: "1 cup chicken or vegetable broth" is one ingredient with a substitution, not two.

### 8.3 Parser Architecture

Two-phase approach:

**Phase 1 (MVP): Rule-based parser.** A pipeline of regex patterns + heuristics that handles the 90% case. Quantity extraction → unit extraction → parenthetical handling → prep/note splitting → ingredient name normalization. This is deterministic, fast, runs entirely client-side, and is testable with a large fixture set. Open-source ingredient parsers exist (NYT Cooking's ingredient-parser, Zestful API) that provide a starting point, but most are server-side Python. The Mise parser is JavaScript/TypeScript for client-side execution.

**Phase 2 (Post-MVP): LLM-assisted fallback.** For strings the rule-based parser can't handle confidently, an optional LLM call (local or API) provides a structured parse. This is the "last 10%" solution. It's optional because it requires either a network call or a local model, and the rule-based parser should handle the vast majority of inputs. The LLM fallback is a quality improvement, not a requirement.

### 8.4 Parser Test Suite

The parser ships with a comprehensive test fixture set: 500+ ingredient strings from real recipe sites, each with an expected structured output. The test suite runs in CI. Any parser change that breaks an existing fixture fails the build. New fixtures are added continuously. This is the quality gate that prevents parser regressions.

This fixture set is also the moat. Over time, the breadth and accuracy of the parser's training data becomes the most defensible part of the product.

---

## 9. Data Model

All data is stored in IndexedDB. The schema is versioned for future migrations (including eventual cloud sync).

### 9.1 Recipe

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | Generated at save time. |
| title | string | Recipe name. |
| sourceUrl | string \| null | Original URL. Null for manual entries. |
| sourceAuthor | string \| null | Original author credit. |
| description | string \| null | Brief description or tagline. |
| servings | number | Default serving count. |
| prepTime | number \| null | Minutes. |
| cookTime | number \| null | Minutes. |
| totalTime | number \| null | Minutes. May differ from prep + cook (e.g., includes resting time). |
| ingredients | Ingredient[] | Array of parsed ingredients (see below). |
| steps | Step[] | Array of instruction steps. |
| tags | string[] | User-defined tags. |
| collections | string[] | Collection IDs this recipe belongs to. |
| notes | string \| null | User's personal notes. |
| favorite | boolean | Favorite flag. |
| image | Blob \| null | Recipe photo (stored locally). |
| nutrition | Nutrition \| null | Per-serving nutrition if available from source. |
| createdAt | ISO datetime | When saved to library. |
| updatedAt | ISO datetime | Last modified. |
| schemaVersion | number | Data model version for migrations. |

### 9.2 Ingredient (Parsed)

| Field | Type | Notes |
| --- | --- | --- |
| raw | string | Original ingredient string as extracted. Preserved for display and re-parsing. |
| qty | number \| Range \| null | Parsed quantity. Range for "3-4". Null for "to taste". |
| unit | string \| null | Normalized unit (cup, tbsp, oz, lb, g, ml, etc.). Null for countable items. |
| ingredient | string | Core ingredient name, singular, normalized. |
| prep | string \| null | Preparation instructions (diced, minced, softened, etc.). |
| notes | string \| null | Parenthetical notes, alternatives, or qualifiers. |
| category | string \| null | Grocery category (produce, dairy, meat, pantry, etc.). Auto-assigned, user-overridable. |
| optional | boolean | Flagged if ingredient string contains "optional." |

### 9.3 Step

| Field | Type | Notes |
| --- | --- | --- |
| order | number | Step sequence number. |
| text | string | Full instruction text. |
| timerSeconds | number \| null | Extracted timer duration if a time reference is found in the text. |
| ingredientRefs | number[] | Indices into the ingredients array for ingredients mentioned in this step. |

### 9.4 MealPlan

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | |
| date | ISO date | The day. |
| meal | enum | breakfast \| lunch \| dinner \| snack |
| recipeId | UUID \| null | Null for quick-add entries ("Leftovers", "Eat out"). |
| label | string \| null | Display label for quick-add entries. |
| servings | number | Override serving count for grocery list calculation. |

---

## 10. Competitive Landscape

| App | Price | Strengths | Weaknesses | Mise's Advantage |
| --- | --- | --- | --- | --- |
| Paprika | $4.99 (one-time per platform) | Excellent extraction, strong library, good scaling, meal planning + grocery lists. The gold standard. | Separate purchases per platform ($15 total for iOS + Mac + Windows). Syncs via proprietary cloud. Ingredient parser is decent but not great for grocery aggregation. UI is functional but dated. | PWA = one purchase, every device. Better ingredient parser for grocery aggregation. Modern UI. Open export format. |
| Mela | $5.99/yr or $9.99 lifetime | Beautiful UI. Good extraction. Apple-ecosystem native. | iOS/Mac only. No Android. No web. Limited meal planning. Grocery list is basic. | Cross-platform. Better grocery list generation via structured parsing. |
| CookBook | Free + $2.99 premium | Free tier. Decent extraction. Large user base. | Ad-supported free tier. Premium features locked. Extraction quality varies. | No ads ever. Full features without upsell. Better extraction pipeline. |
| Whisk (Samsung) | Free | Good grocery list integration. Samsung ecosystem. | Samsung ecosystem lock-in. Data practices unclear. Feature-heavy but shallow. | Privacy-first. No ecosystem lock-in. Deeper ingredient parsing. |
| Copy Me That | Free + $2.99 premium | Browser extension is excellent. Simple and clean. | Free tier is limited. No meal planning. No scaling. Grocery list is basic. | Full features without paywall. Scaling. Meal planning. Grocery aggregation. |

Honest assessment: Paprika is the real competitor. It's been around since 2010, has a loyal user base, and does 80% of what Mise does. Mise's differentiation is: (1) PWA cross-platform (one purchase, every device), (2) better ingredient parser driving better grocery list aggregation, (3) modern UI designed around cooking mode, and (4) open data format with easy export. The pitch to Paprika users: "You already know you want this. Mise does it on every device with a better grocery list."

---

## 11. Packaging & Distribution

### 11.1 PWA Distribution

- **Primary:** Hosted on a static site (Cloudflare Pages, Vercel, or Netlify — all free tier). Users visit the URL and install to home screen.
- **Browser extension:** Chrome Web Store (free to publish after one-time $5 fee). Firefox Add-ons (free). The extension is the extraction companion, not the app itself.
- **No app store:** Not on iOS App Store or Google Play at launch. PWA is sufficient. If demand warrants it, the PWA can be wrapped in Capacitor for native distribution later — but this is a post-product-market-fit decision.

### 11.2 Infrastructure Cost at Launch

| Item | Cost | Why |
| --- | --- | --- |
| Static hosting (Cloudflare Pages) | $0 | Free tier. PWA is static files. |
| Domain name | ~$12/year | mise.recipes or similar. |
| Chrome Web Store | $5 one-time | Developer registration. |
| Serverless function (Option 2, post-MVP) | $0–$5/month | Cloudflare Workers: 100K free requests/day. Recipe extraction is lightweight. |
| **Total at launch** | **~$17 first year** | |

This is the ultimate vacation-test product. There is no server. There is no database. There is no infrastructure that can fail while you're away. The app is static files on a CDN. If Cloudflare goes down, the PWA still works because it's cached locally on every user's device via the service worker.

---

## 12. Monetization (If It Gets That Far)

Reminder: This product is being built because Brittany is annoyed, not because a financial model says to build it. Monetization is a bonus, not a requirement. The app has value at zero revenue because it makes our kitchen better.

### 12.1 If We Decide to Charge

| Model | Price | What's Included |
| --- | --- | --- |
| Free tier | $0 | Extract and view recipes. Save up to 25 recipes locally. Manual entry. Basic cooking mode. |
| One-time unlock | $4.99–$9.99 | Unlimited recipes. Meal planning. Grocery list generation. Scaling. Import/export. Full cooking mode with timers. All current and future features. |

No subscription. One payment, everything, forever. This is a deliberate positioning choice against the subscription fatigue that's driving users away from Mela and similar apps.

### 12.2 What We Will Never Do

- **Ads.** Ever. This product exists because ads ruined recipe websites. Putting ads in the solution would be absurd.
- **Sell user data.** There is no user data. Everything is local. There is nothing to sell.
- **Upsell to a subscription.** The one-time price is the price. No "premium tier" later.
- **Affiliate links in recipes.** No "buy this ingredient on Amazon" links.
- **Sponsored recipes.** No brand partnerships. No promoted content.

Revenue ceiling estimate: Even at modest scale (5,000 paid users at $7.99 = $40,000), this is meaningful side income from a product with near-zero operating costs. But if it never makes a dollar and we just use it every night, it was worth building.

---

## 13. Promise Boundaries

| Mise Does | Mise Does NOT Do |
| --- | --- |
| Extract recipes from URLs using structured data (JSON-LD, microdata) that sites already publish | Guarantee extraction from every recipe website. Some sites have no structured data. Use manual entry for those. |
| Parse ingredients into structured data (quantity, unit, ingredient, prep) | Guarantee 100% parse accuracy. The parser is good, not perfect. Users can edit. |
| Store all data locally on the user's device | Store any data on our servers (at launch). Your recipes are yours. |
| Generate grocery lists from meal plans with ingredient aggregation | Order groceries for you or integrate with delivery services. |
| Work offline after first load | Sync between devices (at launch). Cloud sync is a planned future feature. |
| Scale recipe servings with unit conversion | Convert between weight and volume without density data (e.g., "1 cup flour" ≠ "120g flour" is not automatic). |
| Support import from Paprika and other common formats | Import from every recipe app ever made. Supported formats are listed explicitly. |

The overarching promise: Mise gives you just the recipe. Everything else is in service of that promise. If a feature doesn't make it easier to find, save, cook, or plan recipes, it doesn't belong in Mise.

---

## 14. MVP Build Order

Target: usable in our kitchen in 2 weeks. Fully featured MVP in 4 weeks.

### 14.1 Week 1: Extract + View

- PWA shell with service worker and offline support.
- URL input: paste a URL, extract the recipe using JSON-LD (Layer 1).
- Ingredient parser v1: regex-based pipeline for quantity, unit, ingredient, prep separation.
- Recipe display: clean, readable layout with ingredients and steps.
- Serving scaler: adjust servings, all quantities update.
- Test: extract 20 recipes from popular sites (AllRecipes, Food Network, Bon Appétit, Budget Bytes, Serious Eats). Parser accuracy >85% on ingredient strings.
- **Deliverable:** Brittany can paste a URL and read a recipe while cooking.

### 14.2 Week 2: Save + Library

- IndexedDB storage: save extracted recipes locally.
- Library view: browse saved recipes with search and tag filtering.
- Tag management: add/remove tags on recipes.
- Manual recipe entry form.
- Favorite flag.
- Notes field per recipe.
- Export as JSON.
- Test: save 50 recipes, search and filter reliably. Data persists across browser restarts.
- **Deliverable:** Brittany has a personal recipe collection she uses instead of bookmarks.

### 14.3 Week 3: Cooking Mode + Browser Extension

- Cooking mode: step-by-step full-screen view with large text.
- Wake lock (screen stays on).
- Timer extraction from step text and tappable timer UI.
- Ingredient sidebar with check-off.
- Chrome extension: one-click extraction from any recipe page.
- Microdata/RDFa fallback (Layer 2).
- Test: cook 5 recipes using cooking mode. Timer works. Scaling works in step text.
- **Deliverable:** The primary cooking interface. This is where daily use starts.

### 14.4 Week 4: Meal Planning + Grocery Lists

- Weekly meal planner view.
- Grocery list generator: aggregate ingredients across planned recipes.
- Unit normalization and deduplication.
- Grocery category grouping.
- Manual grocery list additions.
- Check-off while shopping.
- Share list as plain text.
- Paprika import.
- Test: plan a full week of meals, generate a grocery list, go shopping with it.
- **Deliverable:** Complete kitchen workflow. Extract → save → plan → shop → cook.

---

## 15. Post-MVP Roadmap

None of these are commitments. They're ideas ranked by likely value:

| Feature | When | Why | Vacation Test |
| --- | --- | --- | --- |
| Cloud sync between devices | Month 2–3 | Brittany and I both edit the same library from different devices. Requires a backend (Supabase, Firebase, or Cloudflare D1). First infrastructure commitment. | Managed service. Auto-scales to zero. |
| LLM-assisted ingredient parsing | Month 2–3 | Catches the 10–15% of ingredient strings the rule-based parser mishandles. Optional, quality improvement only. | API call. No infra to maintain. |
| Nutrition estimation | Month 3–4 | Map parsed ingredients to USDA FoodData Central for per-serving macro estimates. Valuable for health-conscious users. | Static dataset. No live dependency. |
| Heuristic HTML parser (Layer 3) | Month 3–4 | Covers the ~5–10% of sites without Schema.org markup. Best-effort quality. | No maintenance. Heuristic either works or user enters manually. |
| Sharing recipes with non-users | Month 3 | Generate a shareable link or printable HTML for a single recipe. "Here's the recipe" via text/email. | Static HTML generation. No server. |
| Collections and smart filters | Month 4 | Auto-collections like "Under 30 minutes", "Vegetarian" (based on ingredient analysis). | Client-side filtering. No infra. |
| Multi-language ingredient parsing | Month 6+ | Parse ingredient strings in Spanish, French, German, etc. Expands addressable market significantly. | Parser extension. Same architecture. |
| Native app wrapper (Capacitor) | If demand warrants | Wrap PWA for iOS/Android app stores. Better discoverability. | Same app, different shell. Low incremental effort. |
