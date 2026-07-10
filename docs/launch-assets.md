# Mise — Launch Assets

*Prepared July 2026 · Supports audit findings **A2** (Chrome Web Store submission) and **A3** (directory submissions) in `docs/site-improvement-audit-2026-07.md`.*

This document holds every listing asset that can be written **before** the accounts exist. The actual submissions require the user's Chrome developer account and the directory logins — those are tracked in the "Blocked on User" section at the end.

> ⚠️ **Do not submit anything until the domain is committed (finding A7).** Every URL below is written as `https://mise.swinch.dev`, the current production domain. If the user buys a product domain (`miseapp.io` or similar) and 301-redirects, every listing URL, screenshot chrome, and support link here must be updated first. Submitting to backlink directories against a domain you later abandon forfeits the domain authority the submissions were meant to build. **Commit the domain, then submit.**

---

## 0. Canonical facts (single source of truth for all copy)

Every claim below is verified against `README.md`, `extension/manifest.json`, `extension/popup.html`, `docs/reddit-playbook.md`, and the audit's "What's Already Good" section. **Do not add features not on this list.**

- **Name:** Mise (as in *mise en place* — everything in its place)
- **Tagline:** *Just the Recipe.*
- **Production URL:** `https://mise.swinch.dev`
- **Pricing:** Free to use. $4.99 one-time unlock for power features (not a subscription). Grocery list and Instacart flow are free.
- **Platform:** PWA — installs on any device, works offline, no account required. Local-first (all data in IndexedDB).

**Verified feature list (use only these):**
- Five ways to get a recipe: (1) **URL** — paste a link, JSON-LD/Microdata parsing with headless-browser fallback for bot-protected sites; (2) **Video** — TikTok, YouTube Short, or Instagram Reel; Whisper transcribes audio, a vision model reads on-screen text; (3) **Photo** — cookbook page or handwritten card via OCR + vision model; (4) **Describe** — natural language to recipe, with @-references to saved recipes for modifications; (5) **Text paste** — paste raw recipe text, get structure.
- **Cooking mode** — full-screen step-by-step, auto-detected timers, hands-free read-aloud, ingredients sidebar, screen wake lock.
- **Recipe library** — save locally with tags, notes, favorites, search, meal-type filters, auto-tagging on save.
- **Serving scaler** — adjust servings, all quantities update with unit conversion.
- **Meal planner** — weekly calendar with day + meal-slot assignment.
- **Grocery list** — auto-generated from the meal plan; ingredient aggregation, unit normalization, category grouping.
- **Instacart integration** — send one recipe's ingredients or the whole week's list to Instacart in one tap.
- **Discover** — search the web for recipes inside the app.
- **Share** — share any recipe via link or QR code; no account needed on the receiving end. Share URLs encode the full recipe in the query string (gzip + base64url) — no database.
- **Import / Export** — full library backup and restore as JSON; **Paprika import** (`.paprikarecipes`) is shipped (audit F1/C4).
- **Chrome extension** — one-click recipe extraction from the current page (see §1).

---

## 1. Chrome Web Store Listing (finding A2)

Describes `extension/` — Manifest V3, version **2.1.0**. Verified behavior: a popup with **Extract** and **Paste** tabs, a nutrition preview, serving scaler, ingredient list, and **Open in Mise / Save to Mise / Share / Pin to Pinterest** actions. A content script runs on the active page to read recipe content; `host_permissions` cover `youtube.com` and `googlevideo.com` for reading video captions.

### Name
**Mise — Recipe Extractor**
*(Store name field; matches the manifest `name`. Keep under 45 chars.)*

### Short description (132 char max)
> Extract the recipe from any page in one click. Nutrition preview, ingredient parsing, and instant save to your Mise library.

*(124 characters. This mirrors the manifest `description` but is tuned for the store search snippet.)*

### Detailed description
```
Just the recipe — no ads, no life story, no pop-ups.

Mise pulls a clean, structured recipe off the page you're on with a single
click. It reads the recipe content, parses the ingredients into real
quantities, previews the estimated nutrition per serving, and lets you scale
the servings right in the popup — before you save anything.

WHAT IT DOES
• Extract — one click grabs the recipe from the active tab
• Paste — drop in recipe text from a comment, DM, or anywhere; the first line
  becomes the title
• Nutrition preview — estimated calories, protein, fat, carbs, and fiber per
  serving
• Serving scaler — change the serving count and every quantity updates
• Save to Mise — send the recipe straight to your Mise library
• Share — get a clean shareable link, or pin the recipe to Pinterest

WORKS WITH VIDEO
On YouTube, Mise reads the video's captions so you can capture cooking
recipes from videos, not just blog posts.

PAIRS WITH THE MISE APP (mise.swinch.dev)
Mise is a free recipe app that runs entirely in your browser — no account
needed. Save recipes, scale servings, cook with step-by-step timers and
hands-free read-aloud, plan your week, auto-build a grocery list, and send it
to Instacart in one tap. Your recipes are stored locally on your device.

Free to use. A one-time $4.99 unlock adds power features in the app.
```

### Category
**Primary:** Productivity. *(The extension's job is capturing/organizing content from the current page — this is where recipe clippers and read-later tools live. "Shopping" is a weaker fit; the extension itself doesn't shop.)*

### Privacy practices disclosure (required — expect review scrutiny)

The extension reads page content, so a reviewer will look hard at the single-purpose statement and data-use answers. Write them honestly and narrowly:

**Single purpose (one sentence):**
> Mise extracts the recipe from the page the user is actively viewing and lets the user save, scale, share, or send it to their Mise recipe library.

**Permission justifications:**
- **`activeTab`** — Read the content of the tab the user is on *only when they click the Mise toolbar button*, in order to find and extract the recipe on that page. No background or cross-tab reading.
- **`contextMenus`** — Adds a right-click menu entry to trigger extraction on the current page.
- **Host permissions `*://*.youtube.com/*`, `*://*.googlevideo.com/*`** — Read the caption/transcript track of a YouTube video so a recipe spoken or shown in the video can be extracted. Used only on YouTube pages.
- **Content script on `<all_urls>`** — The recipe the user wants can be on any recipe site, so the extractor must be able to run on any page — but it only acts on the page when the user explicitly invokes it via the popup or context menu.

**Data-use answers (Chrome Web Store privacy form):**
- **What user data is collected?** Website content (the recipe text/structured data on the active page) is read and processed to produce a recipe. When the user chooses "Save to Mise," the extracted recipe is sent to the user's own Mise library (`mise.swinch.dev`), stored locally on their device.
- **Is data sold to third parties?** No.
- **Is data used for anything unrelated to the single purpose?** No.
- **Is data used for creditworthiness / lending?** No.
- **Data handling certification:** The extension does not collect personally identifiable information, health information, financial information, authentication data, personal communications, location, or web-browsing history. It reads page content solely on user action to perform recipe extraction.
- **Privacy policy URL:** `https://privacy.swinch.dev` *(confirm this page names the extension's page-content reading before submitting — see Blocked on User).*

**Reviewer-friction notes to expect:**
- The `<all_urls>` content script plus "reads page content" is the exact combination that draws manual review. The mitigation to state clearly (and to keep true in code) is that extraction only fires on explicit user action (popup click / context menu), never passively in the background.
- Have the **support/contact URL** and **privacy policy URL** live and reachable at submission time — reviewers check both. (Audit B1 flags that the trust pages don't exist yet.)

---

## 2. Screenshot shot-list (shared across Chrome Web Store, PWA manifest, and directories)

Capture once, reuse everywhere. Three consumers with different size needs:

| Consumer | Size / format | Count | Notes |
|---|---|---|---|
| Chrome Web Store | **1280×800** (or 640×400) PNG/JPG | up to 5 | First screenshot is the store hero — make it the strongest. |
| PWA manifest `screenshots` (audit D3) | **narrow** ~720×1280 (`form_factor: "narrow"`) + **wide** ~1280×800 (`form_factor: "wide"`) | 1 narrow + 1 wide min | Upgrades the install prompt to a rich app-store sheet. |
| Directory listings (A3) | 1280×800 desktop + one mobile/narrow | 2–4 | Most directories accept the same wide shots; a couple want a mobile shot. |

**Shots to capture** (each described by content; capture at desktop 1280×800 AND mobile ~720×1280 where the screen is mobile-relevant so both the wide and narrow needs are covered):

1. **Extracted recipe card (HERO).** A clean recipe result page — title, hero image, ingredients, steps, macros badge — visibly stripped of ads/clutter. This is the "just the recipe" promise in one image and should be the Web Store's first screenshot and the manifest **wide** shot.
2. **Extraction input / five modes.** The screen showing the input options (URL, video, photo, describe, text paste) so the "five ways to get a recipe" claim is visual. Good directory shot.
3. **Cooking mode.** Full-screen step view with a running timer and the ingredients sidebar — shows the depth beyond clipping. Strong mobile/**narrow** shot.
4. **Meal planner → grocery list.** The weekly calendar with recipes assigned, or the aggregated grocery list grouped by category. This is the revenue story (leads to Instacart).
5. **Instacart hand-off.** The grocery list with the "Send to Instacart" action visible — shows the one-tap shopping payoff.
6. **Chrome extension popup.** The extension popup over a recipe page: Extract tab, nutrition preview, serving scaler, ingredient list, Save/Share/Pin buttons. **Required for the Web Store listing**; also a nice directory shot to show the extension exists.
7. **Share page / QR.** A shared recipe link (with QR) rendering on a phone — shows "no account needed on the receiving end."

Minimum viable set: **1, 3, 4, 6** covers the Web Store hero + range; **1 (wide) + 3 (narrow)** satisfy the PWA manifest; **1, 2, 3, 4** are the best directory set.

---

## 3. Directory submission asset kit (finding A3)

### Logo / icon references (already in repo)
- **512×512 PNG (primary square logo):** `public/icon-512.png`
- **192×192 PNG (small square logo / favicon-scale):** `public/icon-192.png`
- **Extension icons:** `extension/icons/icon128.png`, `icon48.png`, `icon16.png`
- Most directories want a square high-res PNG → use `public/icon-512.png`.

### Canonical tagline
> **Mise — Just the Recipe.**

### One-liner (≈15 words)
> Mise strips the ads and life stories from any recipe and turns it into a clean, cookable card.

### ~50-word description
> Mise is a free recipe app that extracts a clean recipe from any URL, TikTok video, or cookbook photo — or just describe what you want to cook. Save recipes, scale servings, cook with step-by-step timers, plan your week, auto-build a grocery list, and send it to Instacart in one tap. Works offline, no account needed.

### ~100-word description
> Mise (as in *mise en place*) strips the ads, life stories, and pop-ups from recipe websites and gives you a clean recipe card. Get a recipe five ways: paste any URL, drop in a TikTok / YouTube Short / Instagram Reel, snap a cookbook photo, describe what you want in plain language, or paste raw text. Then cook with a full-screen mode that has auto-detected timers and hands-free read-aloud, scale servings with automatic unit conversion, plan your week on a calendar, and auto-generate a category-grouped grocery list you can send to Instacart in one tap. It's a PWA — installs on any device, works offline, and needs no account. Free to use, with a one-time $4.99 unlock for power features.

### Category tags
`recipes` · `meal planning` · `grocery` · `AI` · `cooking` · `nutrition` · `food` · `PWA` · `productivity`
*(Use AI + software + productivity tags on AI/software directories; recipes/cooking/food/meal-planning on general and niche directories.)*

### Pricing line
> **Free to use. One-time $4.99 unlock for power features (no subscription). The grocery list and Instacart checkout are free.**

### Social / repo links
- Website: `https://mise.swinch.dev`
- Privacy: `https://privacy.swinch.dev`
- Twitter/X, GitHub: *see Blocked on User — confirm which, if any, are public before listing.*

---

## 4. Submission tracking table — Phase 1 (finding A3)

Per the **Blended (Recommended)** strategy in `plans/directory-submission-strategy.md`, Phase 1 = **all Tier 1 directories + every AI/Software/launchpad directory across tiers**. Batch these first (highest authority + best niche relevance), then fill Phase 2 (Tier 2 general) and Phase 3 (Tier 3 remaining) later.

**Do not begin until the domain is committed (A7).**

| # | Directory | DR | Type | Listing URL | Status | Date | Notes |
|---|---|---|---|---|---|---|---|
| 1 | AI Tools | 91 | AI Directory | | Not started | | Tier 1; niche match |
| 2 | DEV Community | 90 | Community | | Not started | | Consider a launch *post*, not a listing (strategy note) |
| 3 | FinancesOnline.com | 87 | Software Directory | | Not started | | Tier 1; may have stricter review |
| 4 | Alternativeto | 80 | Software Directory | | Not started | | List as alternative to Paprika / recipe clippers |
| 5 | StackShare | 80 | Software Directory | | Not started | | Tech-stack angle (React 19, Vercel) |
| 6 | SaaSHub | 74 | Software Directory | | Not started | | |
| 7 | Alternative.me | 73 | Software Directory | | Not started | | |
| 8 | sitelike.org | 71 | Software Directory | | Not started | | |
| 9 | SideProjectors | 71 | Software Directory | | Not started | | Indie / side-project positioning |
| 10 | AI Tools Directory | 67 | AI Directory | | Not started | | |
| 11 | Future Tools | 64 | AI Directory | | Not started | | |
| 12 | Sprout24 | 64 | Startup Directory | | Not started | | |
| 13 | TinyLaunch | 63 | Launchpad | | Not started | | Indie / side-project positioning |
| 14 | DealMirror | 61 | Software Directory | | Not started | | |
| 15 | ToolsFine.com | 57 | AI Directory | | Not started | | |
| 16 | Ben's Bites | 53 | AI Directory | | Not started | | Newsletter component — may lead to featured coverage |

*Status values: Not started → Submitted → Approved → Backlink live. Record the submission date and any per-directory quirks (login required, paid tier, review pending) in Notes.*

**Phase 2 (Tier 2 general directories)** and **Phase 3 (Tier 3 remaining)**: pull from the full inventory in `plans/directory-submission-strategy.md` once Phase 1 is submitted. Keep the same column format.

---

## 5. Blocked on user (accounts & decisions required)

Everything writable is above. These need the user:

1. **Domain decision (finding A7) — blocks everything.** Commit to `mise.swinch.dev` permanently, or buy a product domain and 301-redirect *before* any submission. Every URL in this doc, the Web Store listing, and all 16 Phase 1 directory entries must reflect the final domain. **No submissions until this is settled** — backlinks to an abandoned domain are wasted.
2. **Chrome Web Store developer account.** One-time **$5** registration fee (Google account required). Needed to create the listing and upload the `extension/` package.
3. **Extension package.** Zip the `extension/` directory for upload (confirm the manifest version is bumped if any change is made post-audit; currently 2.1.0).
4. **Trust pages must be live before Web Store review (finding B1).** The Chrome reviewer checks the **privacy policy URL** and a **support/contact URL**. Confirm `https://privacy.swinch.dev` explicitly covers the extension's "reads active-page content on user action" behavior, and stand up a support/contact page (B1 recommends About/Contact/Support + ToS). Without these the listing risks rejection.
5. **Directory accounts / logins.** Most Phase 1 directories require creating an account and, for a few (FinancesOnline, DealMirror), may involve review queues or paid placement — the user decides whether to pursue paid tiers.
6. **Social links.** Confirm whether a public Twitter/X and/or GitHub should be listed (the repo license is "Private — all rights reserved," so GitHub may not be public). Leave blank in listings if none.
7. **Screenshots.** The shot-list (§2) specifies what to capture, but the actual capture happens against the live app in the user's browser (or via the demo-recording harness).
```
