# StorySkip

**Just the Recipe.**

**Product Requirements Document**
*Version 1.2 | February 2026*

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
16. [Testing Strategy](#16-testing-strategy)
17. [Security & Content Sanitization](#17-security--content-sanitization)
18. [Non-Functional Requirements](#18-non-functional-requirements)

---

## 1. Executive Summary

StorySkip (as in mise en place — everything in its place) is a recipe app that does one thing well: it takes a recipe URL and gives you just the recipe. No life stories. No ads. No pop-ups. No "Jump to Recipe" button because there's nothing to jump past.

StorySkip is a Progressive Web App (PWA) that runs entirely in the browser with local storage. It works on phones, tablets, and desktops. It works offline after first load. It has zero backend infrastructure, zero telemetry, and zero ongoing server costs.

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

StorySkip eliminates the delivery mechanism and keeps the product.

---

## 3. Product Architecture

### 3.1 Technology Stack

| Component | Technology | Why |
| --- | --- | --- |
| App Shell | PWA (React + Vite + vite-plugin-pwa) | Installable on any device. Works offline. No app store review process. Single codebase for phone, tablet, desktop. React chosen over Solid for ecosystem depth: Workbox integration, PWA plugin maturity, prior team experience, and 50x larger talent pool if we ever need help. Solid is technically superior for this use case (smaller bundle, faster reactivity) but the marginal performance difference doesn't matter for a recipe app. Ship speed matters. |
| Local Storage | IndexedDB (via Dexie.js) | Stores recipes, tags, meal plans, grocery lists. Survives browser restarts. No size limits that matter for recipe data. No server required. |
| CORS Proxy (MVP) | Cloudflare Worker | Lightweight proxy that fetches recipe page HTML and returns it to the client. The PWA does the JSON-LD extraction client-side. Required for Week 1 "paste URL" flow because browsers block direct cross-origin fetches. Free tier: 100K requests/day. See 3.2 for details. |
| Recipe Extraction | Client-side JSON-LD parser | Extracts Schema.org/Recipe structured data from HTML (received via proxy or extension). Falls back to microdata parsing. Runs entirely in the browser. |
| Ingredient Parser | Custom NLP parser (rule-based + ML fallback) | Turns "2 cups finely diced onions" into {qty: 2, unit: "cup", ingredient: "onion", prep: "finely diced"}. The hard, valuable, defensible piece. |
| Serving Scaler | Arithmetic on parsed ingredients | Adjusts quantities proportionally. Handles unit conversions (tbsp to cup when scaling up). Only works because the ingredient parser produces structured data. |
| Offline Support | Service Worker + cache | Full offline capability after first load. Recipes stored locally. No network needed to browse, cook, or plan. |

### 3.2 The CORS Problem (And How to Solve It)

The biggest technical constraint for a client-side recipe extractor is CORS. Recipe websites don't set Access-Control-Allow-Origin headers, so a browser-based app can't fetch their HTML directly.

Three solutions, all shipping at different stages:

- **Option 1 (MVP Week 1): CORS proxy.** A minimal Cloudflare Worker that receives a URL, fetches the page, and returns the raw HTML to the PWA. The PWA does all extraction client-side. This is not a "backend" — it's a stateless proxy with no storage, no auth, no database. Cost: $0 (free tier covers 100K requests/day). This enables the "paste URL, get recipe" flow on **both desktop and mobile** from Day 1.
- **Option 2 (MVP Week 3): Browser extension.** A companion Chrome extension that reads the current page's DOM directly, bypassing CORS entirely. User clicks the extension on any recipe page, it extracts the JSON-LD and sends the structured recipe to the PWA. More convenient than pasting a URL for desktop users, but not required for the core flow.
- **Option 3 (Always available): Manual entry + import.** User pastes raw text or types a recipe manually. No extraction needed. Always works, always available, zero infrastructure. Supports import from Paprika, CookBook, and other apps via standard formats.

MVP ships with Options 1 and 3. Option 2 is added in Week 3. All three paths produce the same standardized Recipe object.

**Why the proxy is acceptable under the "zero infrastructure" constraint:** The Cloudflare Worker is a single stateless function (~20 lines). It stores nothing. It has no database, no auth, no state. If it goes down, the extension and manual entry still work. If the creator disappears for two weeks, nothing breaks — the worker runs on Cloudflare's free tier with zero maintenance. It's more like a CDN rule than a server.

### 3.3 Extension to PWA Communication

The browser extension needs to send extracted recipe data to the PWA. Three mechanisms, used in priority order:

1. **BroadcastChannel API.** If the PWA is already open, the extension posts the extracted recipe JSON to a well-known channel name (`mise-recipe-import`). The PWA listens on this channel and immediately opens the recipe in the edit/preview form. Lowest latency, no URL size limits.
2. **Hash fragment handoff.** If the PWA is not open, the extension opens the PWA URL with the recipe data as a base64-encoded JSON payload in the hash fragment (e.g., `https://mise.recipes/#import=eyJ...`). Hash fragments are never sent to the server, so this is zero-infrastructure and privacy-safe. The PWA reads the hash on load, decodes the recipe, and clears the fragment.
3. **Extension-hosted mini UI.** The extension has its own minimal popup UI that shows the extracted recipe with a "Save to StorySkip" button. This provides immediate feedback even when the PWA isn't open and handles edge cases where the hash fragment would exceed URL length limits (very large recipes). The button triggers mechanism 1 or 2.

All three mechanisms use the same serialized Recipe JSON format.

### 3.4 Why a PWA Instead of a Native App

- Single codebase for every device. No maintaining iOS + Android + web separately.
- No App Store review process. Ship updates instantly. No 3-day review delay, no guideline compliance risk.
- Installable on home screen. Looks and feels like a native app. Full-screen, no browser chrome.
- Offline-first is built into the PWA model via service workers.
- No $99/year Apple Developer Program fee. No Google Play fee. No app store commission on in-app purchases.
- The only trade-off: no push notifications on iOS (partially resolved in iOS 16.4+). This doesn't matter for a recipe app.

### 3.5 Image Storage Strategy and Data Loss Risk

Recipe images from extracted URLs are stored as source URLs, not blobs. The PWA caches images via the service worker for offline use, but the canonical storage is the URL reference. This keeps IndexedDB lean and avoids Safari's storage pressure eviction on iOS (~1GB limit).

Only user-uploaded photos (manual entries, personal recipe photos) are stored as blobs in IndexedDB. These are the user's own data and cannot be re-fetched.

A "Storage usage" indicator in settings shows current IndexedDB usage. If Safari evicts cached data under storage pressure, recipe text/JSON survives — only cached source images would need re-fetching on next view. This is a known limitation documented in settings.

**Data loss risk:** Local-only storage means a browser reset, device wipe, or clearing site data **loses all recipes permanently.** There is no server-side backup at launch. This is the primary motivation for cloud sync (Month 2-3 in the roadmap). Until then, the mitigation strategy is:

- **Prominent "Export Library" button** in settings that exports all recipes as a JSON file. The app nudges users to export periodically (e.g., after every 10 new recipes: "You have 10 unsaved recipes. Export a backup?").
- Settings page clearly states: "Your recipes live on this device only. Export regularly to protect your collection."
- Cloud sync is the real fix. Until it ships, export is the safety net.

---

## 4. Feature 1: Recipe Extraction

The extraction pipeline has three layers, tried in order. If layer 1 succeeds, layers 2 and 3 are skipped.

### 4.1 Layer 1: Schema.org/Recipe JSON-LD

Google requires recipe sites to include structured data for rich search results. Most major recipe sites embed a JSON-LD block with @type: Recipe in their HTML. This block contains: name, description, recipeIngredient (array of strings), recipeInstructions (array of steps), prepTime, cookTime, totalTime, recipeYield (servings), nutrition, image, author, and datePublished.

Extraction is trivial: find the `<script type="application/ld+json">` tag, parse the JSON, and normalize the fields. This works for an estimated 80%+ of recipe URLs because Google incentivizes compliance.

**Key advantage:** This is not fragile HTML scraping. JSON-LD is a structured contract between the site and search engines. Sites are incentivized to keep it accurate because it drives Google traffic. If they break it, they lose SEO ranking. This means the extraction pipeline is maintained by Google's incentive structure, not by us.

**Legal note:** JSON-LD extraction reads publicly published structured data that sites intentionally embed for consumption by search engines and other automated tools. This is materially different from scraping proprietary content — the data is published specifically to be machine-read. That said, we are not lawyers, and if a site's robots.txt or ToS explicitly prohibits automated access, the CORS proxy should respect that. The extension reads data already loaded in the user's browser, which has no legal ambiguity.

### 4.2 Layer 2: Microdata / RDFa Fallback

Some older sites use Schema.org markup via microdata attributes (itemprop, itemscope) or RDFa instead of JSON-LD. The parser checks for these and extracts the same fields. This catches another 10-15% of sites.

### 4.3 Layer 3: Heuristic HTML Parsing (Post-MVP)

> **Note:** Layer 3 is described here for architectural completeness but is **not part of the MVP.** It ships in Month 3-4 (see Section 15). Until then, sites without structured data fall through to manual entry.

For the ~5-10% of recipe pages with no structured data, a heuristic parser looks for common patterns: ingredient lists (usually `<ul>` elements with quantity patterns), instruction lists (usually `<ol>` elements or numbered paragraphs), and metadata in common CSS classes or heading patterns. This layer is inherently less reliable and is flagged as "best-effort" in the UI. Users can manually correct extracted data.

**Important:** Layer 3 is not a maintenance commitment. If a specific site doesn't extract cleanly via heuristics, the user can paste the recipe manually (Option 3). There are no site-specific parsers to maintain. This is the critical lesson from VaultFolio: don't promise to parse every format.

### 4.4 Extraction Output

Regardless of which layer succeeds, the output is a standardized Recipe object (see Section 9: Data Model). The user sees: recipe title, source URL, servings, prep/cook/total time, ingredients (parsed into structured form), and steps. They can edit any field before saving. The extraction is a starting point, not a final answer.

### 4.5 Extraction Error Handling

Extraction should never be a dead end. Every failure mode lands the user in an editable form where they can fix or complete the recipe manually.

| Failure | User Experience |
| --- | --- |
| **403 / paywall / Cloudflare challenge** | "Couldn't access this page. Try the browser extension (it can read the page directly) or paste the recipe manually." Pre-fills source URL so the user doesn't lose it. |
| **No structured data found** (layers 1-2 fail, layer 3 not yet shipped) | "No recipe data found on this page. You can paste the recipe text below and we'll try to parse it, or enter it manually." Opens the manual entry form with the source URL pre-filled. |
| **Malformed / incomplete JSON-LD** (e.g., missing `recipeIngredient`) | Extract what's available, flag missing fields with a visual indicator (yellow outline, "needs review" badge). The recipe opens in edit mode with missing fields highlighted. User fills in gaps. |
| **Multiple `@type: Recipe` blocks** on one page | Show a picker: "This page has 3 recipes — which one?" Display title and thumbnail for each. User selects one, extraction proceeds. |
| **Partial parse** (ingredients extracted but steps missing, or vice versa) | Save what was extracted, flag the incomplete section. User can add missing data manually. Partial is always better than nothing. |
| **CORS proxy failure** (worker down, rate-limited) | "Couldn't fetch this page right now. Try again in a moment, use the browser extension, or enter the recipe manually." Three paths, never a dead end. |

The guiding principle: **partial extraction in an editable form beats a blank error screen every time.**

---

## 5. Feature 2: Recipe Library

The library is the personal recipe collection. It's the reason StorySkip becomes a daily-use app rather than a one-shot extraction tool.

### 5.1 Organization

| Feature | Details |
| --- | --- |
| Tags | User-defined tags (e.g., "weeknight", "slow cooker", "kid-friendly", "Brittany's favorites"). A recipe can have multiple tags. Tags are the primary organization mechanism. |
| Collections | Optional groupings larger than tags (e.g., "Thanksgiving 2026", "Meal prep rotation"). A recipe can belong to multiple collections. See Section 9.6 for schema. |
| Search | Full-text search across recipe titles, ingredients, tags, and notes. Instant, client-side (IndexedDB query or in-memory index). No server round-trip. |
| Favorites | Quick-access flag. Favorites surface first in browse and meal planning. |
| Notes | Free-text notes per recipe (e.g., "Double the garlic", "Kids prefer less spice", "Last made 2/9/2026"). Notes are personal and never overwritten by re-extraction. |
| Source tracking | Every extracted recipe keeps its source URL. Original author is credited. StorySkip is a recipe organizer, not a recipe plagiarizer. |

### 5.2 Manual Recipe Entry

Not every recipe comes from a URL. Family recipes, cookbook adaptations, and original creations need manual entry. The manual entry form has the same fields as an extracted recipe but is pre-populated blank. The ingredient parser runs on each line as the user types, providing real-time structured previews (quantity, unit, ingredient, prep). If the parser misinterprets something, the user can override.

### 5.3 Import / Export

- **Import from Paprika (.paprikarecipes):** Paprika is the most popular paid recipe app. Supporting import from Paprika is the single most effective acquisition channel because it removes the switching cost. Note: the `.paprikarecipes` format is a gzipped SQLite database with an undocumented schema. Reverse-engineering this is a focused task — see Week 4 in the build order.
- **Import from generic formats:** JSON (StorySkip native format), Recipe Keeper (.zip), CookBook (.html export).
- **Export:** Full library export as JSON. Individual recipe export as JSON, printable HTML, or plain text. Your data is always yours. No lock-in.

---

## 6. Feature 3: Cooking Mode

Cooking mode is the "in the kitchen with flour on your hands" experience. Everything else in StorySkip is browsing and planning; cooking mode is doing.

### 6.1 Design Principles

- **Large text, high contrast.** Readable from 3 feet away on a counter. No squinting at a phone propped against a paper towel holder.
- **Step-by-step progression.** One step at a time, full screen. Swipe or tap to advance. Current step is always obvious. Ingredients referenced in the current step are highlighted.
- **Screen stays on.** Wake lock API keeps the screen active while cooking mode is open. No re-unlocking with wet hands. (See Section 18 for iOS limitations.)
- **Timers.** Any time mentioned in a step ("bake for 25 minutes") becomes a tappable timer. Multiple concurrent timers supported. Timers work even if you leave cooking mode.
- **Ingredients sidebar.** Swipe left (or tap a tab) to see the full ingredient list at any time. Ingredients can be checked off as they're used.
- **No navigation chrome.** Full-screen, distraction-free. Back button exits cooking mode with a confirmation prompt.

### 6.2 Scaling in Cooking Mode

Servings can be adjusted before or during cooking. When servings change, all ingredient quantities update in real-time in the **ingredient sidebar** and the **servings display**. Unit conversions happen automatically when scaling makes the original unit awkward (e.g., "0.25 cups" becomes "4 tablespoons"; "48 teaspoons" becomes "1 cup").

**Inline step-text scaling** (replacing quantities within the prose of step instructions) is a **post-MVP enhancement.** It requires identifying ingredient references within freeform text and contextually replacing quantities — significantly harder than scaling a structured ingredient list. In the MVP, step text displays the original quantities, and the ingredient sidebar shows the scaled values. A visual indicator ("Scaled to X servings — see sidebar for adjusted quantities") makes this clear. Inline replacement is targeted for Month 2.

### 6.3 Accessibility

Cooking mode is inherently an accessibility challenge: users have wet hands, are standing 3 feet from the screen, and can't easily interact with small UI elements. Accessibility features aren't just compliance — they're core usability for the flour-on-hands use case.

**MVP requirements:**

- **ARIA landmarks** on all cooking mode regions (current step, ingredient sidebar, timer panel) so screen readers can navigate the interface.
- **Keyboard navigation.** Spacebar or right arrow to advance steps. Left arrow to go back. `T` to start/stop the current step's timer. `I` to toggle the ingredient sidebar. All actions reachable without a mouse.
- **High-contrast mode.** Cooking mode defaults to high-contrast (dark background, light text, large touch targets). A reduced-motion option disables transitions for users who need it.
- **Semantic HTML.** Steps are an ordered list, ingredients are a list, timers are `<time>` elements. Screen readers get meaningful structure without extra ARIA hacks.
- **Focus management.** When advancing steps, focus moves to the new step content. When a timer completes, focus moves to the timer alert.
- **Minimum touch targets.** All tappable elements in cooking mode are at least 48x48px (WCAG 2.5.8).

**Post-MVP:**

- **Voice control.** "Next step", "start timer", "read ingredients" via the Web Speech API. This is a genuine differentiator for the kitchen use case — not just accessibility, but the best way to interact while cooking. Noted in the roadmap (Section 15).

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

The ingredient parser is the core intellectual property of StorySkip. Everything else — extraction, library, cooking mode, meal planning, grocery lists — depends on the parser producing structured data from raw ingredient strings. If the parser is good, every downstream feature works well. If the parser is bad, everything is a hack.

### 8.1 What the Parser Does

Input: a raw ingredient string as it appears on a recipe website.
Output: a structured object with separated fields.

| Raw Input | qty | unit | ingredient | prep | notes |
| --- | --- | --- | --- | --- | --- |
| "2 cups finely diced onions" | 2 | cup | onion | finely diced | |
| "1 (14.5 oz) can diced tomatoes, drained" | 1 | can (14.5 oz) | diced tomatoes | | drained |
| "3-4 cloves garlic, minced" | 3-4 | clove | garlic | minced | |
| "salt and pepper to taste" | | | salt and pepper | | to taste |
| "1/2 cup (1 stick) unsalted butter, softened" | 0.5 | cup | unsalted butter | softened | 1 stick |
| "zest of 1 lemon" | 1 | | lemon | zested | |
| "2 lbs boneless skinless chicken breasts, cut into 1-inch cubes" | 2 | lb | boneless skinless chicken breast | cut into 1-inch cubes | |

### 8.2 Why This Is Hard

Ingredient strings are a natural language problem on a constrained domain. The grammar is semi-structured but wildly inconsistent across sources:

- Quantities can be: whole numbers (2), fractions (1/2), unicode fractions (3/4), ranges (3-4), mixed numbers (1 1/2), or absent entirely ("salt to taste").
- Units can be: standard (cup, tbsp, oz), informal ("a handful", "a pinch"), container-based ("1 can", "1 bag"), or absent ("3 eggs").
- Parenthetical notes appear everywhere: "1 (14.5 oz) can", "1/2 cup (1 stick) butter", "2 cups (about 3 medium) diced apples."
- Prep instructions can be before the ingredient ("finely diced onions") or after ("onions, finely diced").
- Compound ingredients: "salt and pepper" is one item. "olive oil and vinegar" might be one item or two depending on context.
- The word "or" introduces alternatives: "1 cup chicken or vegetable broth" is one ingredient with a substitution, not two.

### 8.3 Parser Architecture

Two-phase approach:

**Phase 1 (MVP): Rule-based parser.** A pipeline of regex patterns + heuristics that handles the 90% case. Quantity extraction, unit extraction, parenthetical handling, prep/note splitting, ingredient name normalization. This is deterministic, fast, runs entirely client-side, and is testable with a large fixture set. Open-source ingredient parsers exist (NYT Cooking's ingredient-parser, Zestful API) that provide a starting point, but most are server-side Python. The StorySkip parser is JavaScript/TypeScript for client-side execution.

**Phase 2 (Post-MVP): LLM-assisted fallback.** For strings the rule-based parser can't handle confidently, an optional LLM call (local or API) provides a structured parse. This is the "last 10%" solution. It's optional because it requires either a network call or a local model, and the rule-based parser should handle the vast majority of inputs. The LLM fallback is a quality improvement, not a requirement.

### 8.4 Parser Test Suite

The parser test suite grows continuously. Target milestones:

- **Week 1:** 50-100 fixture strings covering the common cases (simple quantities, standard units, basic prep separation). Enough to validate the 70% parser.
- **Week 5 (end of MVP):** 150-200 fixtures covering the edge cases encountered during real-world use.
- **Month 3:** 500+ fixtures including user-reported corrections (Section 8.5). This is the quality gate that prevents regressions.

Every parser change runs the full fixture suite. Any regression fails the build. New fixtures are added from real recipe sites and from user-reported parsing errors.

This fixture set is also the moat. Over time, the breadth and accuracy of the parser's training data becomes the most defensible part of the product.

### 8.5 Parser Feedback Loop

When a user sees an ingredient that parsed incorrectly, they can tap a "Report parsing error" button on the ingredient. This captures: the raw ingredient string, the parser's output, and the user's correction. The report is sent via a simple mechanism (GitHub Issue template pre-filled with the data, or a mailto: link) — zero infrastructure.

This is not telemetry. It's user-initiated, explicit, and directly feeds the parser fixture set. Every correction becomes a new test case. The parser improves from real-world usage without any analytics infrastructure.

---

## 9. Data Model

All data is stored in IndexedDB. The schema is versioned for future migrations (including eventual cloud sync).

### 9.1 Recipe

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | Generated at save time. |
| title | string | Recipe name. |
| sourceUrl | string or null | Original URL. Null for manual entries. |
| sourceAuthor | string or null | Original author credit. |
| description | string or null | Brief description or tagline. |
| servings | number | Default serving count. |
| prepTime | number or null | Minutes. |
| cookTime | number or null | Minutes. |
| totalTime | number or null | Minutes. May differ from prep + cook (e.g., includes resting time). |
| ingredients | Ingredient[] | Array of parsed ingredients (see Section 9.2). |
| steps | Step[] | Array of instruction steps (see Section 9.3). |
| tags | string[] | User-defined tags. |
| collections | string[] | Collection IDs this recipe belongs to (see Section 9.6). |
| notes | string or null | User's personal notes. |
| favorite | boolean | Favorite flag. |
| imageUrl | string or null | Source URL for the recipe photo. Cached by service worker for offline use. |
| imageBlob | Blob or null | User-uploaded photo (manual entries only). Only used when no source URL exists. |
| nutrition | Nutrition or null | Per-serving nutrition if available from source (see Section 9.7). |
| extractionLayer | string or null | `jsonld`, `microdata`, `heuristic`, or `manual`. Which extraction layer produced this recipe. Null for imported recipes. |
| parserVersion | string | Version of the ingredient parser used at extraction time. Enables re-parsing when the parser improves. |
| createdAt | ISO datetime | When saved to library. |
| updatedAt | ISO datetime | Last modified. |
| schemaVersion | number | Data model version for migrations. |

### 9.2 Ingredient (Parsed)

Each ingredient has a stable ID so that steps can reference ingredients without relying on fragile array indices.

| Field | Type | Notes |
| --- | --- | --- |
| id | string | Stable unique ID within the recipe (e.g., `ing_1`, `ing_2`). Generated at parse/save time. Survives reordering and editing. |
| raw | string | Original ingredient string as extracted. Preserved for display and re-parsing. |
| qty | number or Range or null | Parsed quantity. Range for "3-4" (see Section 9.8). Null for "to taste". |
| unit | string or null | Normalized unit (cup, tbsp, oz, lb, g, ml, etc.). Null for countable items. |
| unitCanonical | string or null | Canonical unit key for aggregation (e.g., "tbsp" and "tablespoon" both map to `tablespoon`). Used by grocery list generator for unit normalization. |
| ingredient | string | Core ingredient name, singular, normalized. |
| prep | string or null | Preparation instructions (diced, minced, softened, etc.). |
| notes | string or null | Parenthetical notes, alternatives, or qualifiers. |
| category | string or null | Grocery category: `produce`, `dairy`, `meat`, `seafood`, `pantry`, `spices`, `frozen`, `bakery`, `beverages`, `other`. Auto-assigned from built-in dictionary, user-overridable. |
| optional | boolean | Flagged if ingredient string contains "optional." |

### 9.3 Step

| Field | Type | Notes |
| --- | --- | --- |
| id | string | Stable unique ID within the recipe (e.g., `step_1`, `step_2`). Generated at parse/save time. |
| order | number | Step sequence number. |
| text | string | Full instruction text. |
| timerSeconds | number or null | Extracted timer duration if a time reference is found in the text. |
| ingredientRefs | string[] | IDs of ingredients mentioned in this step (references `Ingredient.id`, not array indices). Survives ingredient reordering. |

### 9.4 MealPlan

Individual meal plan entries. A "week" is not a separate entity — it's a date-range query on these entries (e.g., all entries where `date` falls within Monday-Sunday). This keeps the model flat and avoids artificial week boundaries.

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | |
| date | ISO date | The day. |
| meal | string | One of: `breakfast`, `lunch`, `dinner`, `snack`. |
| recipeId | UUID or null | Null for quick-add entries ("Leftovers", "Eat out"). |
| label | string or null | Display label for quick-add entries. |
| servings | number | Override serving count for grocery list calculation. |

### 9.5 GroceryList

The grocery list has its own entity because it carries state (checked items, manual additions) that outlives the meal plan query that generated it. Regenerating the list from the meal plan merges with existing state rather than replacing it.

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | |
| weekStartDate | ISO date | The Monday of the week this list covers. |
| generatedAt | ISO datetime | When the list was last regenerated from the meal plan. |
| items | GroceryItem[] | Aggregated ingredient items from planned recipes. |
| manualItems | ManualGroceryItem[] | User-added items not tied to any recipe. Persist across regenerations. |

**GroceryItem:**

| Field | Type | Notes |
| --- | --- | --- |
| ingredient | string | Normalized ingredient name (aggregation key). |
| aggregatedQty | number or null | Total quantity across all planned recipes. |
| unit | string or null | Normalized unit after aggregation/conversion. |
| category | string | Grocery aisle category (see Section 9.2 category values). |
| checked | boolean | Checked off while shopping. |
| sourceRecipeIds | UUID[] | Which recipes contributed to this item. |

**ManualGroceryItem:**

| Field | Type | Notes |
| --- | --- | --- |
| label | string | Free-text item name ("paper towels", "dog food"). |
| checked | boolean | Checked off while shopping. |

### 9.6 Collection

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | Referenced by `Recipe.collections`. |
| name | string | Collection name (e.g., "Thanksgiving 2026", "Meal prep rotation"). |
| description | string or null | Optional description. |
| createdAt | ISO datetime | When created. |

### 9.7 Nutrition

Per-serving nutrition data, if available from the recipe source. All fields are nullable because sources rarely provide complete data.

| Field | Type | Notes |
| --- | --- | --- |
| calories | number or null | kcal per serving. |
| protein | number or null | Grams. |
| carbohydrates | number or null | Grams. |
| fat | number or null | Grams. |
| fiber | number or null | Grams. |
| sodium | number or null | Milligrams. |
| sugar | number or null | Grams. |

### 9.8 Range

Used for ingredient quantities that specify a range (e.g., "3-4 cloves garlic").

| Field | Type | Notes |
| --- | --- | --- |
| min | number | Lower bound. |
| max | number | Upper bound. |

When scaling a Range, both min and max are multiplied by the scaling factor. When aggregating for grocery lists, the max value is used (better to buy slightly more than run short).

### 9.9 Schema Migration Rules

- Every record includes a `schemaVersion` field. When the app loads data with an older version, it runs migrations in order (v1 to v2 to v3, etc.).
- Migrations are forward-only. No downgrade path.
- When `parserVersion` on a recipe is older than the current parser, the app offers to re-parse ingredients from their `raw` strings. This is opt-in, never automatic — users may have manually corrected parsed data.
- All migrations are tested as part of the IndexedDB CRUD test suite (Section 16.3).

---

## 10. Competitive Landscape

| App | Price | Strengths | Weaknesses | StorySkip's Advantage |
| --- | --- | --- | --- | --- |
| Paprika | $4.99 (one-time per platform) | Excellent extraction, strong library, good scaling, meal planning + grocery lists. The gold standard. | Separate purchases per platform ($15 total for iOS + Mac + Windows). Syncs via proprietary cloud. Ingredient parser is decent but not great for grocery aggregation. UI is functional but dated. | PWA = one purchase, every device. Better ingredient parser for grocery aggregation. Modern UI. Open export format. |
| Mela | $5.99/yr or $9.99 lifetime | Beautiful UI. Good extraction. Apple-ecosystem native. | iOS/Mac only. No Android. No web. Limited meal planning. Grocery list is basic. | Cross-platform. Better grocery list generation via structured parsing. |
| CookBook | Free + $2.99 premium | Free tier. Decent extraction. Large user base. | Ad-supported free tier. Premium features locked. Extraction quality varies. | No ads ever. All features included in one-time purchase. Better extraction pipeline. |
| Whisk (Samsung) | Free | Good grocery list integration. Samsung ecosystem. | Samsung ecosystem lock-in. Data practices unclear. Feature-heavy but shallow. | Privacy-first. No ecosystem lock-in. Deeper ingredient parsing. |
| Copy Me That | Free + $2.99 premium | Browser extension is excellent. Simple and clean. | Free tier is limited. No meal planning. No scaling. Grocery list is basic. | All features, one-time purchase. Scaling. Meal planning. Grocery aggregation. |

Honest assessment: Paprika is the real competitor. It's been around since 2010, has a loyal user base, and does 80% of what StorySkip does. StorySkip's differentiation is: (1) PWA cross-platform (one purchase, every device), (2) better ingredient parser driving better grocery list aggregation, (3) modern UI designed around cooking mode, and (4) open data format with easy export. The pitch to Paprika users: "You already know you want this. StorySkip does it on every device with a better grocery list."

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
| CORS proxy (Cloudflare Worker) | $0 | Free tier. 100K requests/day. Stateless proxy. |
| Domain name (.recipes TLD) | ~$50/year | mise.recipes or similar. `.recipes` TLDs run $40-60/year. |
| Chrome Web Store | $5 one-time | Developer registration. |
| **Total at launch** | **~$55 first year** | |

**When monetization begins (additional costs):**

| Item | Cost | Notes |
| --- | --- | --- |
| Payment provider (LemonSqueezy / Gumroad) | 5-8% per transaction | Handles checkout, license keys, tax/VAT, refunds. No custom infrastructure. |
| Support (email) | Time, not money | FAQ page + email. No ticketing system needed at less than 1K users. |

This is the ultimate vacation-test product. There is no server. There is no database. There is no infrastructure that can fail while you're away. The app is static files on a CDN. The CORS proxy is a stateless Cloudflare Worker. If Cloudflare goes down, the PWA still works because it's cached locally on every user's device via the service worker.

---

## 12. Monetization (If It Gets That Far)

Reminder: This product is being built because Brittany is annoyed, not because a financial model says to build it. Monetization is a bonus, not a requirement. The app has value at zero revenue because it makes our kitchen better.

### 12.1 If We Decide to Charge

| Model | Price | What's Included |
| --- | --- | --- |
| Free tier | $0 | Extract and view recipes. Save up to 25 recipes locally. Manual entry. Basic cooking mode. |
| One-time unlock | $4.99-$9.99 | Unlimited recipes. Meal planning. Grocery list generation. Scaling. Import/export. Full cooking mode with timers. All current and future features. |

No subscription. One payment, everything, forever. This is a deliberate positioning choice against the subscription fatigue that's driving users away from Mela and similar apps.

The free tier caps at 25 saved recipes. The natural conversion trigger is saving recipe #26 — the moment the user has clearly adopted StorySkip as their recipe tool. This is a fair value exchange, not a dark pattern.

### 12.2 Entitlement Mechanism (How "One Purchase, Every Device" Works)

The zero-backend constraint creates a real question: how does a user who pays on their laptop unlock the app on their phone?

**Solution: Third-party license keys.**

- Payment is handled by **LemonSqueezy** (or Gumroad). The user pays on the website, receives a license key via email.
- To unlock on any device, the user enters their license key (or the email used for purchase) in the app's settings.
- The app makes a single validation call to LemonSqueezy's API to verify the key. On success, the unlock flag is stored locally in IndexedDB.
- **Offline resilience:** Once validated, the unlock is stored locally and never re-checked. The app works fully offline forever after. If LemonSqueezy goes down temporarily, already-unlocked devices are unaffected.
- **Device limit:** LemonSqueezy supports activation limits per key (e.g., 5 devices). This is configurable but generous — the goal is not DRM, it's preventing key-sharing abuse.
- **No custom backend.** The payment provider handles checkout, license generation, tax/VAT compliance, refunds, and key validation. This is zero infrastructure from our side.

**"All current and future features" caveat:** This commitment applies to features that run client-side at zero marginal cost. If a future feature has per-user recurring costs (e.g., LLM-assisted parsing via API, cloud sync storage), it may require a separate optional add-on. This should be stated transparently at purchase time: "Your one-time purchase unlocks all features that run on your device. Cloud-based features (sync, AI parsing) may be offered as optional add-ons."

### 12.3 What We Will Never Do

- **Ads.** Ever. This product exists because ads ruined recipe websites. Putting ads in the solution would be absurd.
- **Sell user data.** There is no user data. Everything is local. There is nothing to sell.
- **Upsell to a subscription.** The one-time price is the price. No "premium tier" later.
- **Affiliate links in recipes.** No "buy this ingredient on Amazon" links.
- **Sponsored recipes.** No brand partnerships. No promoted content.

Revenue ceiling estimate: Even at modest scale (5,000 paid users at $7.99 = $40,000), this is meaningful side income from a product with near-zero operating costs. But if it never makes a dollar and we just use it every night, it was worth building.

---

## 13. Promise Boundaries

| StorySkip Does | StorySkip Does NOT Do |
| --- | --- |
| Extract recipes from URLs using structured data (JSON-LD, microdata) that sites already publish | Guarantee extraction from every recipe website. Some sites have no structured data. Use manual entry for those. |
| Parse ingredients into structured data (quantity, unit, ingredient, prep) | Guarantee 100% parse accuracy. The parser is good, not perfect. Users can edit. |
| Store all data locally on the user's device | Store any data on our servers (at launch). Your recipes are yours. |
| Generate grocery lists from meal plans with ingredient aggregation | Order groceries for you or integrate with delivery services. |
| Work offline after first load | Sync between devices (at launch). Cloud sync is a planned future feature. |
| Scale recipe servings with unit conversion | Convert between weight and volume without density data (e.g., "1 cup flour" to "120g flour" is not automatic). |
| Support import from Paprika and other common formats | Import from every recipe app ever made. Supported formats are listed explicitly. |

The overarching promise: StorySkip gives you just the recipe. Everything else is in service of that promise. If a feature doesn't make it easier to find, save, cook, or plan recipes, it doesn't belong in StorySkip.

---

## 14. MVP Build Order

Target: usable in our kitchen in 2 weeks. Fully featured MVP in **5 weeks.** Week 1 is "Brittany can use it tonight" quality — a working prototype, not production polish. The long tail of parser edge cases and UI refinement is ongoing.

### 14.1 Week 1: Extract + View (Prototype)

- PWA shell with service worker and offline support (Vite + vite-plugin-pwa).
- **CORS proxy:** Deploy a minimal Cloudflare Worker (~20 lines) that fetches recipe page HTML and returns it to the client.
- URL input: paste a URL, proxy fetches HTML, client extracts JSON-LD (Layer 1), display recipe.
- Ingredient parser v1: regex-based pipeline for the 70% case — fractions, common units, simple structures. Parentheticals, ranges, and compound ingredients are refinement work driven by the fixture set over subsequent weeks.
- Recipe display: clean, readable layout with ingredients and steps.
- Serving scaler: adjust servings, ingredient sidebar quantities update.
- Parser test suite: 50-100 initial fixtures.
- Test: extract 20 recipes from popular sites (AllRecipes, Food Network, Bon Appetit, Budget Bytes, Serious Eats). Parser accuracy >70% on ingredient strings (targeting 85%+ by Week 4 as fixtures accumulate).
- **Deliverable:** Brittany can paste a URL and read a recipe while cooking. It works on her phone and laptop. It's not perfect.

### 14.2 Week 2: Save + Library

- IndexedDB storage: save extracted recipes locally.
- Library view: browse saved recipes with search and tag filtering.
- Tag management: add/remove tags on recipes.
- Manual recipe entry form.
- Favorite flag.
- Notes field per recipe.
- Export as JSON (full library + individual recipes).
- Backup nudge: after every 10 new recipes, prompt to export a backup.
- Test: save 50 recipes, search and filter reliably. Data persists across browser restarts.
- **Deliverable:** Brittany has a personal recipe collection she uses instead of bookmarks.

### 14.3 Week 3: Cooking Mode

- Cooking mode: step-by-step full-screen view with large text.
- ARIA landmarks, keyboard navigation (spacebar/arrows to advance).
- Wake lock (screen stays on).
- Timer extraction from step text and tappable timer UI.
- Ingredient sidebar with check-off. Scaled quantities display here (not inline in step text — see Section 6.2).
- High-contrast defaults, 48px touch targets.
- "Report parsing error" button on ingredients (see Section 8.5).
- Test: cook 5 recipes using cooking mode. Timers work. Scaling works in sidebar.
- **Deliverable:** The primary cooking interface. This is where daily use starts.

### 14.4 Week 4: Browser Extension + Paprika Import

- Chrome extension: one-click extraction from any recipe page. Communication via BroadcastChannel + hash fragment fallback (see Section 3.3).
- Microdata/RDFa fallback (Layer 2).
- Paprika import: reverse-engineer `.paprikarecipes` format (gzipped SQLite), map fields to StorySkip Recipe schema, validate with a real Paprika export.
- Parser fixture count target: 150-200.
- Test: extension works on 20 sites. Import a real Paprika library with 50+ recipes.
- **Deliverable:** Desktop users get one-click extraction. Paprika users can switch.

### 14.5 Week 5: Meal Planning + Grocery Lists

- Weekly meal planner view.
- Grocery list generator: aggregate ingredients across planned recipes.
- Unit normalization and deduplication.
- Grocery category grouping.
- Manual grocery list additions.
- Check-off while shopping.
- Share list as plain text.
- Test: plan a full week of meals, generate a grocery list, go shopping with it.
- **Deliverable:** Complete kitchen workflow. Extract, save, plan, shop, cook.

---

## 15. Post-MVP Roadmap

None of these are commitments. They're ideas ranked by likely value:

| Feature | When | Why | Vacation Test |
| --- | --- | --- | --- |
| Inline step-text scaling | Month 2 | Replace quantities within step prose text when servings change. Requires NLP-level parsing of steps, not just ingredients. | Client-side. No infra. |
| Cloud sync between devices | Month 2-3 | Brittany and I both edit the same library from different devices. Requires a backend (Supabase, Firebase, or Cloudflare D1). First infrastructure commitment. | Managed service. Auto-scales to zero. |
| LLM-assisted ingredient parsing | Month 2-3 | Catches the 10-15% of ingredient strings the rule-based parser mishandles. Optional, quality improvement only. | API call. No infra to maintain. |
| Voice control in cooking mode | Month 2-3 | "Next step", "start timer", "read ingredients" via Web Speech API. Not just accessibility — the best UX for cooking with flour on your hands. | Client-side API. No infra. |
| Nutrition estimation | Month 3-4 | Map parsed ingredients to USDA FoodData Central for per-serving macro estimates. Valuable for health-conscious users. | Static dataset. No live dependency. |
| Heuristic HTML parser (Layer 3) | Month 3-4 | Covers the ~5-10% of sites without Schema.org markup. Best-effort quality. Not a maintenance commitment. | No maintenance. Heuristic either works or user enters manually. |
| Sharing recipes with non-users | Month 3 | Generate a shareable link or printable HTML for a single recipe. "Here's the recipe" via text/email. | Static HTML generation. No server. |
| Collections and smart filters | Month 4 | Auto-collections like "Under 30 minutes", "Vegetarian" (based on ingredient analysis). | Client-side filtering. No infra. |
| Multi-language ingredient parsing | Month 6+ | Parse ingredient strings in Spanish, French, German, etc. Expands addressable market significantly. | Parser extension. Same architecture. |
| Native app wrapper (Capacitor) | If demand warrants | Wrap PWA for iOS/Android app stores. Better discoverability. | Same app, different shell. Low incremental effort. |

---

## 16. Testing Strategy

### 16.1 Ingredient Parser: Fixture-Based Unit Tests

The parser has the most rigorous testing because it's the highest-risk component. Fixture count grows with the product: 50-100 at Week 1, 150-200 by end of MVP, 500+ by Month 3. Each fixture is a raw ingredient string with an expected structured output. Every parser change runs the full fixture suite. Any regression fails the build. New fixtures are added from real recipe sites and from user-reported parsing errors (Section 8.5).

### 16.2 Recipe Extraction: Snapshot Integration Tests

A set of real recipe pages (HTML saved locally as snapshot files, not fetched live) are run through the extraction pipeline. Each snapshot has an expected Recipe output. This tests the full pipeline (JSON-LD, parse, normalize, structured output) without depending on external sites. Snapshots are updated periodically but tests never break because a recipe blog redesigned their page.

### 16.3 IndexedDB: CRUD Integration Tests

All data access operations (save recipe, update tags, search, delete, generate grocery list) are tested against Dexie's in-memory IndexedDB adapter. This runs in Node without a browser, is fast, and catches schema migration issues. Tests cover: create, read, update, delete, search queries, cross-entity operations (meal plan to grocery list generation), and schema migrations (v1 to v2, etc.).

### 16.4 Service Worker: Manual Testing Checklist

Service worker behavior is notoriously hard to automate. A manual testing checklist covers:

- Fresh install: first load caches all assets.
- Offline load: airplane mode, app loads and functions (browse library, open cooking mode, view grocery list).
- Cache invalidation: deploy a new version, reload, verify updated assets load.
- Image caching: recipe images load offline after first view.
- Storage eviction recovery: clear site data, reload, verify app shell loads (recipes must be re-synced once cloud sync exists).

### 16.5 End-to-End: Playwright

Playwright tests cover the critical user path: paste URL, extract recipe, edit fields, save to library, open in cooking mode, advance steps, scale servings. This is the "smoke test" that catches integration failures between components. Runs in CI against the built PWA served locally.

### 16.6 What We Don't Test

- Visual regression (pixel-perfect screenshots). Not worth the maintenance cost at this stage.
- Performance benchmarks. The app is small and fast by architecture. If it gets slow, profile then.
- Cross-browser compatibility beyond Chrome and Firefox. Safari PWA quirks are tested manually (see Section 18).

---

## 17. Security and Content Sanitization

### 17.1 Extracted HTML

Recipe extraction involves parsing HTML from third-party websites. Any content rendered in the StorySkip UI must be sanitized to prevent XSS attacks.

- All extracted text (recipe titles, step instructions, ingredient strings, notes) is treated as **plain text**, never rendered as raw HTML.
- If any extracted field contains HTML tags, they are stripped or escaped before display.
- The extraction pipeline outputs structured JSON, not HTML fragments. The rendering layer uses React's default text escaping.
- **DOMPurify** (or equivalent) is used as a safety net for any content that passes through raw HTML rendering paths — but the architecture should avoid raw HTML rendering entirely.

### 17.2 Imported Data

Paprika imports, JSON imports, and other file-based imports carry the same risk. All imported string fields are sanitized on ingestion. Import validation checks for:

- Reasonable field lengths (e.g., recipe title < 500 chars, ingredient string < 1000 chars).
- No embedded HTML or script tags in text fields.
- Valid data types for all fields (numbers are numbers, dates are dates).
- Malformed or unexpected fields are dropped, not rendered.

### 17.3 CORS Proxy

The Cloudflare Worker proxy returns raw HTML that is parsed client-side. The proxy itself does no rendering — it's a pass-through. The client-side parser extracts structured data from the HTML, and only that structured data enters the UI layer. The raw HTML is never displayed.

---

## 18. Non-Functional Requirements

### 18.1 Browser Support

| Browser | Support Level | Notes |
| --- | --- | --- |
| Chrome (desktop + Android) | **Full support** | Primary development and testing target. |
| Firefox (desktop + Android) | **Full support** | Second testing target. Extension published on Firefox Add-ons. |
| Safari (macOS) | **Supported** | PWA install works. Tested manually. Some IndexedDB quirks (see below). |
| Safari (iOS) | **Supported with caveats** | PWA install works (iOS 16.4+). Wake Lock API may not function — fallback is a "tap to keep screen on" button. Background timers may pause when app is backgrounded. Storage eviction under pressure (see Section 3.5). |
| Edge | **Expected to work** | Chromium-based, not separately tested. |

### 18.2 Performance Targets

- **First load:** < 3 seconds on 3G. The PWA is static files; Vite's tree-shaking and code splitting keep the bundle small.
- **Extraction:** < 2 seconds from URL paste to recipe display (proxy round-trip + client-side JSON-LD parse).
- **Library search:** < 100ms for client-side filtering across 500 recipes.
- **Parser:** < 50ms per ingredient string. At 30 ingredients per recipe, parsing a full recipe takes < 1.5 seconds.

### 18.3 Storage Budget

- **Recipe text/JSON:** ~2-5 KB per recipe. At 1,000 recipes: ~5 MB. Well within IndexedDB limits on all browsers.
- **User-uploaded images (blobs):** ~200 KB-2 MB per photo. At 100 manual recipes with photos: ~200 MB. Approaching Safari's comfort zone. Storage indicator in settings warns at 500 MB.
- **Cached source images:** Managed by service worker cache, not IndexedDB. Evictable under storage pressure with no data loss.

### 18.4 iOS-Specific Limitations

These are PWA limitations on iOS that affect StorySkip, documented here so they're not surprises:

- **Wake Lock API:** Not reliably supported on iOS Safari. Cooking mode includes a fallback: a visible "Tap to keep screen on" button that resets the screen timeout via a harmless user interaction.
- **Background timers:** When the PWA is backgrounded on iOS, setTimeout/setInterval may be throttled or paused. Timer state is persisted so timers resume correctly when the app returns to foreground, but audio alerts may not fire while backgrounded.
- **Storage eviction:** iOS Safari can evict IndexedDB data under storage pressure (typically after ~7 days of non-use or when device storage is low). Mitigation: backup export nudges (Section 3.5) and cloud sync (post-MVP).
- **No push notifications:** Partially available since iOS 16.4 but unreliable. Not relevant for StorySkip's use case.
