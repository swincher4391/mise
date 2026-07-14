# Mise — Site Improvement Audit

*July 2026 · Documentation only — no code changes. Compiled against PRD v2.0 (March 2026), the go-to-market strategy (PRD §14–15, `docs/reddit-playbook.md`, `plans/directory-submission-strategy.md`, `plans/tiktok-promo-video.md`), a repo-state verification, and git history through 2026-07-10.*

**How to read this:** Each finding states what's true today, why it matters against the PRD/GTM strategy, and the best-practice recommendation. Priorities: **P0** (blocking the stated GTM strategy or a trust/revenue risk), **P1** (high-leverage, do soon), **P2** (worthwhile, not urgent).

---

## Closeout Status — 2026-07-14

Every finding's disposition. **Done** = resolved in code/docs and deployed. **Staged** = every producible artifact is built; the only remaining step is a human account action or elapsed time (see `docs/final-mile-checklist.md`). No finding is un-addressed.

| # | Finding | Disposition | Where |
| --- | --- | --- | --- |
| A1 | TikTok channel | **Staged** — 12s 9:16 promo video rendered (`videos/tiktok-paste-link-get-recipe.mp4`); needs a TikTok account + upload | final-mile-checklist |
| A2 | Chrome extension unpublished | **Staged** — upload-ready zip + 1280×800 store screenshots + listing copy built; needs $5 dev account + upload | launch-assets, final-mile-checklist |
| A3 | Directory submissions | **Staged** — asset kit + pre-filled Phase-1 tracker written; needs logins (and A7 decided) | launch-assets |
| A4 | Measurement | **Done** — first-touch UTM persisted; four funnels specced | `track.ts`, analytics-spec |
| A5 | Pinterest Rich Pins | **Staged** — plumbing verified, a real JSON-LD `image` gap fixed + deployed; needs one-time validator login | recipeHtml, final-mile-checklist |
| A6 | Per-recipe OG image | **Deferred (P2)** — brand-card fallback shipped; edge title-card left as roadmap (function-cap constrained) | recipeHtml |
| A7 | Domain strategy | **Decision doc** — recommends committing to `mise.swinch.dev`; user's call | domain-decision |
| A8 | Re-engagement | **Decision doc** — recommends Web Push; user's call | re-engagement-options |
| A9 | Reddit playbook drift | **Done** — counts/TODOs/YouTube note corrected | reddit-playbook |
| B1 | No ToS/refund/support | **Done** — three trust pages live at `/terms`, `/support`, `/affiliate-disclosure` | public/*.html |
| B2 | Consent posture | **Done** — `person_profiles: identified_only`; posture documented | track.ts, analytics-consent-posture |
| B3 | Unthrottled Stripe endpoints | **Done** — both rate-limited | create-checkout, verify-purchase |
| B4 | Repo hygiene | **Done** — artifacts gitignored; `.env` confirmed never committed | .gitignore |
| C1 | Cloud sync / durability | **Design doc** — E2E-encrypted sync via Neon; flagged two real bugs | cloud-sync-design |
| C2 | 25-recipe cap decision | **Staged** — instrumentation wired; needs PostHog funnels + 4–6 weeks data | analytics-spec, final-mile-checklist |
| C3 | Video accuracy | **Deferred (P2)** — confirmed roadmap in PRD v2.1 | PRD v2.1 |
| C4 | Paprika import misdescribed | **Done** — corrected in PRD v2.1 | PRD v2.1 |
| D1 | Dead-end empty library | **Done** — one-tap example seeding | LibraryPage, demoRecipe |
| D2 | No offline indicator | **Done** — offline banner | OfflineBanner |
| D3 | No manifest screenshots | **Done** — narrow + wide added | vite.config |
| D4 | Accessibility | **Done** — modal focus traps, Escape, reduced-motion | useModalA11y |
| D5 | Hardcoded version | **Done** — build-time injection | vite.config, App |
| E1 | No e2e coverage | **Done** — Playwright smoke suite | tests/e2e |
| E2 | Tribal operational knowledge | **Done** — operational-constraints.md | operational-constraints |
| E3 | Dependency fragility | **Done** — dependency-risk.md | dependency-risk |
| E4 | Client-side gating | **Done** — documented as accepted risk in PRD v2.1 | PRD v2.1 |
| F1 | Stale PRD | **Done** — PRD v2.1 (local; `*_PRD_*` gitignored) | Mise_PRD_v2_1 |
| F2 | Scattered GTM state | **Done** — gtm-status.md | gtm-status |

**Summary (28 lettered findings):** 18 Done + 1 design doc delivered (C1) + 2 decision docs for the user (A7, A8) + 2 P2 roadmap deferrals (A6, C3) = 23 resolved in code/docs. 5 Staged (A1, A2, A3, A5, C2): every producible artifact is complete; each awaits a user account action or elapsed time. The Staged and Decision items are documented human actions, not open engineering work. Nothing is un-addressed.

---

## Executive Summary

The product is in better shape than the marketing. The revenue pipeline (meal plan → grocery list → Instacart → affiliate commission) is live, extraction is hardened, security posture is strong (A+ headers, SSRF closed, rate limiting on cost-bearing endpoints), and the share-URL SEO architecture is genuinely novel. What's missing is almost entirely on the **distribution, trust, and measurement** side:

1. **The #1 GTM channel (TikTok) has never been started** despite being the PRD's own top distribution priority since v1.9. Assets exist (video script, recording harness); no account, no posts.
2. **The Chrome extension — the only reliable YouTube path — is finished but unpublished.** This is a distribution task, not an engineering task, and it gates both a marketed feature and a whole acquisition channel (Chrome Web Store discovery).
3. **Trust surface is too thin for a paid product**: no Terms of Service, no refund policy, no support/contact page, privacy policy is an external link, and the two Stripe endpoints are the only API endpoints without rate limiting.
4. **Measurement can't yet answer the PRD's own questions** (§15.9): saves-before-first-meal-plan, saves-before-first-checkout, % of free users hitting the 25-recipe cap. Events fire, but no documented funnels/dashboards exist, and attribution from UTM → checkout isn't persisted.
5. **The PRD is four months stale** and now materially misdescribes the product (YouTube extraction, Paprika import, Kroger UI, test counts, sitemap). For a project whose stated philosophy is "program the process," the source-of-truth doc drifting is itself a defect.

---

## A. Go-to-Market Execution Gaps

### A1. TikTok channel: not started — **P0**
- **State:** PRD roadmap lists TikTok as the primary organic channel ("no gatekeepers, algorithmic reach… should be the primary organic distribution channel"). A complete 10-second shot plan exists (`plans/tiktok-promo-video.md`), and `playwright.config.ts` has an uncommitted `record-tiktok-*` entry — recording tooling is being built. No account, no published video.
- **Why it matters:** Reddit — the only validated channel — is paused (account suspension history, r/food permaban, one-sub-per-day pacing). The strategy explicitly pivoted to TikTok in v1.9. Four months later the pivot hasn't produced a single post. The GTM plan currently has **zero active acquisition channels**.
- **Best practice:** Ship volume over polish on short-form video. The documented script is good; the standard failure mode is over-producing video #1. Establish the account, post the two scripted videos, then commit to a cadence (2–3/week) and let PostHog + TikTok analytics pick the winning format. Track `utm_campaign` per video.

### A2. Chrome extension built but not on the Web Store — **P0**
- **State:** `extension/` is Manifest V3, version 2.1.0, complete (popup, background worker, content script, YouTube caption reading, Share/Pin buttons, icons). Not submitted to the Chrome Web Store.
- **Why it matters:** (a) Server-side YouTube extraction is *structurally blocked* (datacenter IPs blocked from captions; DRM blob streams) — the extension is the only reliable YouTube path, yet marketing copy promises YouTube Shorts extraction. (b) The in-app bot-blocked error recovery tells users to use the extension — a dead-end recommendation until it's installable. (c) The Web Store is itself a discovery channel with reviews and search.
- **Best practice:** Treat store submission as a launch task with its own checklist: developer account, listing copy, screenshots, privacy-practices disclosure (it reads page content — expect review scrutiny), support URL. Screenshots produced here are reusable for directory submissions and the PWA manifest (see D3).

### A3. Directory submissions: strategy written, zero executed — **P1**
- **State:** `plans/directory-submission-strategy.md` ranks 51 targets and recommends a blended strategy; the tracking table is empty. Only PeerPush was submitted. The asset checklist (logo, screenshots, descriptions) is unchecked — and it references "`https://miseapp.io` or similar" while everything else uses `mise.swinch.dev` (see A7).
- **Why it matters:** Backlinks are the domain-authority input the share-URL SEO flywheel depends on. A `.dev` subdomain with near-zero referring domains will struggle to rank recipe pages regardless of how good the structured data is.
- **Best practice:** Prepare the asset kit once (it's shared with A2 and D3), then batch submissions per the doc's own Phase 1 (Tier 1 + AI/software directories). Fill in the tracking table as you go — an empty tracking table means the strategy doc is a wish, not a process.

### A4. Measurement can't answer the PRD's own questions — **P0**
- **State:** PostHog is properly integrated (~25 custom events covering extract → save → meal plan → Instacart click; upgrade initiated/completed). But: no documented funnels or dashboards; UTM capture relies on PostHog autocapture with no persisted first-touch attribution; nothing correlates a Reddit/TikTok UTM to an eventual Instacart click days later; and `instacart_*_click` is the last observable step — actual checkout/commission truth lives only in Impact.
- **Why it matters:** PRD §15.9 explicitly conditions the 25-recipe-cap decision on three metrics (saves before first meal plan, saves before first checkout, % hitting the cap). §14.3 says to judge subreddits by grocery checkouts, not traffic. Neither is answerable today. Marketing spend (time) without per-channel revenue attribution repeats the Reddit mistake of optimizing for upvotes.
- **Best practice:** Document a small analytics spec: (1) build the four PostHog funnels (visit → extract → save → meal-plan → instacart_click; share-link visitor variant; upgrade funnel; per-UTM-campaign breakdown); (2) persist first-touch UTM in localStorage and attach it as a property on `instacart_*_click` and `upgrade_completed`; (3) a monthly ritual reconciling Impact commission data against PostHog clicks. This is prerequisite to scaling any channel — otherwise A1/A3 fly blind.

### A5. Pinterest: Rich Pin validation still unverified — **P1**
- **State:** All the plumbing shipped (JSON-LD on share pages, `pinterest-rich-pin` meta, Pin It button, verified business domain, bulk-pin script). The PRD roadmap has carried "submit one URL to the Rich Pin Validator — one-time manual step" as *Immediate* since v1.7.
- **Why it matters:** It's the highest ROI-per-minute item on the roadmap — one manual validation activates Rich Pins domain-wide, and Pinterest is the platform whose crawler most rewards recipe schema (AllRecipes precedent cited in PRD §14.4).
- **Best practice:** Validate, confirm a pinned share URL renders as a Rich Pin, then start the bulk-pin cadence on a Mise-owned board. Record the validation date in the PRD so it stops appearing as open work.

### A6. Share-page conversion: generic OG image, no per-recipe branding — **P2**
- **State:** Share pages have full JSON-LD, OG/Twitter tags, canonical, and a static `og-image.png` fallback when a recipe lacks an image. The roadmap's "OG image generation" (branded title-card at the edge) remains open.
- **Why it matters:** The share URL *is* the marketing asset — the flywheel's click-through rate on Pinterest/iMessage/Discord is largely determined by the preview image. Recipes without images currently present a generic brand card.
- **Best practice:** Keep as roadmap item; when prioritized, an edge-rendered SVG→PNG title card (recipe name + macros + brand) is the standard pattern. Watch the Vercel 12-function cap (F3) — it should share an existing function.

### A7. Brand/domain strategy is undecided — **P1**
- **State:** Production is `mise.swinch.dev` (subdomain of a personal domain). The directory strategy doc assumes "`miseapp.io` or similar." Reddit templates, PRD, and app all say `mise.swinch.dev`.
- **Why it matters:** Every backlink, directory listing, Pinterest domain verification, Search Console history, and indexed share URL accrues to whichever domain you commit to. Migrating later forfeits or complicates all of it (redirects, re-verification, re-submission). This decision gets more expensive every week that A3/A5 execute.
- **Best practice:** Decide now, before the backlink campaign: either commit to `mise.swinch.dev` permanently (fine — Google treats subdomains adequately; it costs $0) or buy the product domain and 301 before submissions begin. Document the decision in the PRD.

### A8. No retention/re-engagement mechanism — **P2**
- **State:** No email capture, no web push, no newsletter. Re-engagement is limited to the PWA install prompt and the backup nudge. The PRD's own retention thesis is "new recipes drive return visits" (Discover/Describe).
- **Why it matters:** The affiliate model depends on *weekly* return visits (the 7-day attribution window matches the meal-plan cycle). A local-first, no-account app has no channel at all to reach a lapsed user — churn is silent and permanent.
- **Best practice:** Lowest-friction options consistent with the no-accounts philosophy: (1) optional email capture at high-intent moments ("email me my grocery list" / post-purchase), feeding a simple weekly-recipe digest; (2) Web Push API for "your meal plan for next week?" Sunday nudges (works on installed PWAs, including iOS 16.4+). Either should be opt-in and documented in the privacy policy. Decide deliberately; "no re-engagement" is a defensible choice for a personal-tool-first product, but it should be a documented decision, not an accident.

### A9. Reddit: playbook drift and stalled prerequisites — **P2**
- **State:** Channel paused (correctly, given the suspension history). Drift has accumulated: the builder-post template cites "419 tests across 18 files" (stale), the budget-post playbook has an unresolved TODO ("generate actual Mise share links before posting"), and four draft posts sit in `docs/` unposted.
- **Best practice:** Before any resumption, refresh the templates against current reality and pre-generate the share-link assets. Keep the one-sub-per-day and karma-first rules — they were learned expensively.

---

## B. Trust, Legal & Compliance

### B1. No Terms of Service, refund policy, or support page — **P0**
- **State:** The only legal surface is an external privacy link (`privacy.swinch.dev`) in the footer. No ToS, no refund policy, no contact/support page, no in-repo privacy page. (Partner agreement PDFs sit in the repo root, unserved.)
- **Why it matters:** Mise takes money (Stripe, $4.99) and earns affiliate commission. Stripe's terms expect merchants to post terms of sale and a refund policy; Impact/Instacart partnership terms typically require disclosure pages; directory reviewers and Chrome Web Store reviewers check for these. Beyond compliance, a paid app with no ToS/support link reads as abandonable to exactly the engaged users the $4.99 filter is meant to select.
- **Best practice:** Ship three static pages (zero serverless cost): Terms of Service (including refund policy — even "all sales final, contact us for issues" is fine if stated), a combined About/Contact/Support page with a real contact method, and the affiliate disclosure as a linkable page (the inline FTC line above the checkout button is good; a canonical page version strengthens it). Link all three plus Privacy in the footer.

### B2. Analytics consent posture undocumented — **P1**
- **State:** PostHog runs with `person_profiles: 'always'` and autocapture; Vercel Analytics also active. No consent banner, no documented data-processing rationale. The product's public identity is "privacy-first — everything is local."
- **Why it matters:** Always-on person profiles + autocapture without consent is at odds with GDPR/ePrivacy for EU visitors, and more importantly with Mise's own positioning — a Reddit commenter noticing PostHog autocapture on a "privacy-first" app is a brand risk.
- **Best practice:** Document a position and align the config to it. Common defensible setup for this posture: anonymous/identified-only-on-purchase profiles, `mask_all_text` where feasible, EU-hosted PostHog or a cookieless config, and a privacy page that names PostHog/Vercel and what's collected. A consent banner is the fallback if person-level profiles must stay.

### B3. Payment endpoints are the only unthrottled endpoints — **P1**
- **State:** Eight endpoints use `api/_lib/rateLimit.ts`; `api/create-checkout.ts` and `api/verify-purchase.ts` do not.
- **Why it matters:** `create-checkout` can be scripted to mass-create Stripe Checkout sessions (cost/noise/fraud-signal risk on the Stripe account); `verify-purchase` accepts emails and, unthrottled, is an enumeration oracle for who has purchased — a small but real PII leak, and inconsistent with the care taken elsewhere (PIN lockout, POST-for-PII).
- **Best practice:** Same per-IP limiter the other endpoints use; conservative ceilings are fine (checkout creation and restore are rare, human-paced actions). Documented here per the no-coding scope — this is the top item for the next hardening pass.

### B4. Repo hygiene: files that don't belong in the tree — **P2**
- **State:** Repo root contains dev/debug artifacts: `test-kroger*.mjs`, a `nul` file, screenshots, a `.webp`, zips, partner-agreement PDFs, `New Text Document.txt`, and two stray icons (`icon-192 (1).png`, `icon-192.svg` at root — the manifest correctly uses `public/`). `.env`/`.env.local` exist in the working tree (verify they're gitignored and have never been committed — PRD §20.4 says history was scanned, keep it true).
- **Why it matters:** Low direct risk, but PDFs of signed partner agreements and ad-hoc scripts in a repo root are the kind of thing that leaks scope when a repo is ever shared, and clutter erodes the "program the process" discipline.
- **Best practice:** Sweep into `scripts/`/`docs/private/` or delete; add gitignore entries for the artifact patterns.

---

## C. Product Gaps That Bound Growth (roadmap confirmation)

These are PRD roadmap items this audit confirms are still the right ones, with sharpened rationale:

### C1. Cloud sync / data durability — **P1 (rising)**
Local-only IndexedDB remains the single biggest trust ceiling: browser storage eviction (especially iOS), device loss, and clearing site data all destroy a user's library. Export + backup nudge are good mitigations but are manual. Every GTM success makes this worse — users acquired via TikTok are mobile-Safari-heavy, the most eviction-prone environment. The PRD already ranks cloud sync High; this audit concurs and notes it's also the unlock for multi-device usage (the top competitive claim vs. Paprika's per-platform pricing).

### C2. The 25-recipe cap decision is blocked on A4 — **P1**
The PRD defined the decision rule in §15.9 but the instrumentation to evaluate it isn't assembled. Resolve A4, run 4–6 weeks of data, then decide. Until then, the cap is an unvalidated churn risk sitting on the primary funnel.

### C3. Video extraction accuracy: vision/transcript merging — **P2**
Still the right next accuracy investment (quantities from frames + steps from audio). Note the constraint landscape shifted since the PRD: YouTube is extension-only (see A2), Supadata relay is capped at 100 credits/month — the merging work applies primarily to TikTok/Instagram server paths.

### C4. Paprika import — shipped, PRD says otherwise — see F1
`ImportDialog` accepts `.paprikarecipes` via `parsePaprika.ts`. The PRD (§5.3, §18) still lists it as "Not shipped. Deprioritized." This is a *marketing asset being left on the table* — "switch from Paprika in one import" is a directory-listing and Reddit-comparison-post differentiator. Update the PRD and use it in copy.

---

## D. UX, Onboarding & Accessibility

### D1. First-run experience is good-but-thin — **P2**
- **State:** Static pre-hydration marketing HTML (H1, how-it-works, features), a "Try with an example recipe" demo, tailored empty states, iOS shortcut tip. No guided tour; no sample library.
- **Best practice:** The current approach (demo recipe over tour) is correct for this product. The gap is on the *share-link visitor* path: they land on someone's recipe with the save-hint (good), but the post-save "try your own" nudge is the only bridge to the five input modes. Consider documenting/testing one addition: seed the library empty-state with 2–3 one-tap example recipes so a fresh library is never a dead end. Validate with the A4 funnels before building anything.

### D2. No live offline indicator — **P2**
Offline support is passive (cache + "ready for offline" toast). A user in a grocery store with bad signal — Mise's own marketing scenario — gets silent failures on any network action. Best practice: `online`/`offline` event listener driving a small banner, and disabled-with-explanation states on network-dependent buttons (Extract, Discover, Instacart).

### D3. PWA install surface: no manifest screenshots — **P2**
Manifest is otherwise strong (maskable icon, share_target, theme color, update prompt). Adding `screenshots` (narrow + wide) upgrades Chrome/Edge install UI from a bare prompt to a rich app-store-style sheet — cheap conversion lift on the install prompt that fires after first extraction, and the screenshots are the same assets A2/A3 need anyway.

### D4. Accessibility is below best practice — **P1**
Sparse `aria-*` usage, no focus traps in modal dialogs (e.g., import dialog overlay), no documented keyboard-navigation audit outside cooking mode (which is genuinely good — wake lock, key bindings, 48px targets, WCAG 2.5.8). Recipe apps have a real low-vision/motor-impaired kitchen audience, and cooking mode's quality shows the intent. Best practice: run an axe/Lighthouse a11y pass, fix the modal focus management, label icon-only buttons, and add a `prefers-reduced-motion` check. Also an SEO input: Lighthouse a11y feeds Google's page-experience picture.

### D5. Hardcoded version string — **P2**
`v2.1` is a hardcoded string in `App.tsx` while the process doc (CLAUDE.md) makes version-bump-per-deploy a rule the SW update flow depends on users noticing. Best practice: inject the version from `package.json` (or the git SHA) at build time via Vite `define`, so the displayed version can't drift from the deployed build. Documented here; one-line change when coding resumes.

---

## E. Engineering Quality (as it affects the site's reliability)

### E1. No end-to-end test coverage — **P1**
- **State:** 33 unit/security test files pass under Vitest (parser, extraction, scaling, aggregation, security — genuinely strong coverage of pure logic). Playwright exists but `testDir: './scripts'` matches only demo-recording and platform-probe scripts; there is no `tests/e2e/`. IndexedDB CRUD, service-worker behavior, and the five extraction UI flows are manual-only.
- **Why it matters:** The highest-value user journeys (paste URL → recipe → save → meal plan → grocery list → Instacart link) have zero automated regression protection, while the deploy cadence is high (60+ commits since March) and the SW `autoUpdate` config pushes every deploy to every user immediately.
- **Best practice:** A thin smoke suite beats a broad one: 3–5 Playwright specs against a local build (extract demo recipe, save, meal-plan, generate grocery list, share URL round-trip). Run in CI on PRs. Keep the existing recording scripts, but separate them from test config so "Playwright is configured" stops implying "e2e exists."

### E2. Operational constraints are tribal knowledge — **P1**
Three production-critical constraints live only in session memory/commit messages, not in the repo:
1. **Vercel 12-function cap** — currently 11/12; exceeding it makes deploys *fail silently* (site serves stale build). This already burned a debugging session.
2. **HF provider pinning** — un-pinned models fail with `model_not_supported`; the git log shows five model-churn commits in a row.
3. **YouTube extraction is extension-only** — server-side is structurally blocked (datacenter IP caption block, DRM streams); Supadata relay capped at 100 credits/month.

Best practice: a short `docs/operational-constraints.md` (or CLAUDE.md section) so these survive context loss. The function cap especially warrants a pre-deploy check (the one-liner already exists in memory notes) and eventually a CI guard.

### E3. External-dependency fragility has widened since the PRD — **P2**
PRD §3.6 covers the HuggingFace SPOF. Since then the dependency list grew: Supadata (YouTube captions, 100/month free), tmpfiles.org (vision-model image hosting — an uptime and privacy-optics dependency), DuckDuckGo HTML scraping (Discover breaks silently if markup changes), Vercel KV (rate limiting + sitemap; the KV-downgrade commit suggests this already wobbled), and People Inc sites now hard-blocking the extractor's IP (first sign of *targeted* counter-measures — expect more publishers to follow; the extension is again the hedge). Best practice: fold these into §3.6's risk table with per-dependency fallbacks, and add a lightweight uptime check (even a weekly manual smoke of extract/discover/video against known URLs).

### E4. Free-tier gating is client-side only — **P2**
Video-extraction counters and the unlock flag live in localStorage/IndexedDB, trivially resettable. The PRD implicitly accepts this (the paywall is a filter, not the moat), and that's a defensible position — but it should be *stated* in §15.4 as an accepted risk, with the note that per-IP rate limiting on the expensive endpoints (already in place) is the real cost control.

---

## F. Documentation & Process Debt

### F1. PRD v2.0 materially misdescribes the shipped product — **P1**
Four months of drift; the specific corrections a v2.1 PRD needs:

| PRD claim | Reality (July 2026) |
| --- | --- |
| Video extraction supports YouTube Shorts server-side (§4.6) | Server-side YouTube is structurally blocked; caption relay (Supadata) + Chrome extension are the actual paths |
| Paprika import "Not shipped. Deprioritized." (§5.3) | Shipped — `ImportDialog` + `parsePaprika.ts` |
| Kroger deprecation pending (§18, Low) | Done — Kroger UI removed; only a localStorage cleanup shim remains |
| Playwright/e2e "not yet implemented" (§19.3) | Playwright configured, but only as demo-recording scripts (still no e2e — but the doc should say what exists) |
| Share URL sitemap "High priority, not built" (§18) | Shipped — `api/sitemap-xml.ts`, KV-backed, robots.txt reference |
| 505 tests / 24 files (§1, §19) | 33 test files; re-count and reconcile (Reddit playbook says 419/18 — three documents, three numbers) |
| Photo import model / structuring model per §3.1 | Model lineup churned repeatedly (Qwen3-30B-A3B pinned via featherless-ai for structuring); document current pinned models and the pinning requirement |
| No mention of first-visit static marketing HTML, People Inc blocking, crawler cost-controls | All shipped in the GTM-hardening PR |

Also carry forward: the app displays **v2.1** while the newest PRD is v2.0 — version the PRD with the app.

### F2. Strategy docs need a single "GTM status" view — **P2**
GTM state is scattered across PRD §14, the Reddit playbook, the directory strategy (empty tracker), the TikTok script, and Reddit draft posts. None records what was *actually done and measured*. Best practice: one living `docs/gtm-status.md` — channel, last action, next action, metric — reviewed on a fixed cadence. The PRD keeps strategy; the status doc keeps state. (The empty directory tracking table and the four unposted Reddit drafts are the symptom.)

---

## Prioritized Action List

| # | Action | Priority | Effort | Section |
| --- | --- | --- | --- | --- |
| 1 | Decide domain strategy (commit to swinch.dev subdomain or buy product domain) — blocks 3, 4 | P0 | Decision | A7 |
| 2 | Build the 4 PostHog funnels + persist first-touch UTM; document the analytics spec | P0 | S | A4 |
| 3 | Publish Chrome extension to Web Store (assets: screenshots, listing, privacy disclosure) | P0 | M | A2 |
| 4 | Launch TikTok: account + post the 2 scripted videos, commit to cadence | P0 | M | A1 |
| 5 | Ship ToS, refund policy, support/contact, affiliate-disclosure pages; link in footer | P0 | S | B1 |
| 6 | Validate Pinterest Rich Pins (one-time) and start bulk-pin cadence | P1 | XS | A5 |
| 7 | Rate-limit `create-checkout` and `verify-purchase` | P1 | XS | B3 |
| 8 | Document + align analytics consent posture (PostHog config vs privacy-first positioning) | P1 | S | B2 |
| 9 | Write `docs/operational-constraints.md` (function cap, HF pinning, YouTube limits) + pre-deploy function count check | P1 | XS | E2 |
| 10 | Update PRD to v2.1 (corrections table in F1) | P1 | S | F1 |
| 11 | Thin Playwright e2e smoke suite (5 core journeys) in CI | P1 | M | E1 |
| 12 | Accessibility pass: modal focus traps, icon-button labels, axe/Lighthouse audit | P1 | M | D4 |
| 13 | Execute directory submissions Phase 1 with shared asset kit; fill tracking table | P1 | M | A3 |
| 14 | Run the 25-recipe-cap analysis once funnels have 4–6 weeks of data | P1 | S | C2 |
| 15 | Cloud sync design doc (storage choice, sync model, privacy stance) | P1 | M | C1 |
| 16 | Decide + document re-engagement approach (email capture vs web push vs none) | P2 | Decision | A8 |
| 17 | Manifest screenshots; offline indicator; seeded empty-state examples | P2 | S | D1–D3 |
| 18 | Repo hygiene sweep (root artifacts, PDFs, stray icons, gitignore) | P2 | XS | B4 |
| 19 | Per-recipe OG image generation (edge title-card) | P2 | M | A6 |
| 20 | Widen §3.6 dependency-risk table (Supadata, tmpfiles, DDG, KV, publisher blocking) | P2 | XS | E3 |
| 21 | Build-time version injection replacing hardcoded `v2.1` | P2 | XS | D5 |
| 22 | Refresh Reddit playbook numbers + pre-generate share-link assets before resuming | P2 | XS | A9 |

*Effort: XS < 1h · S = hours · M = days.*

---

## What's Already Good (don't churn these)

Recorded so future audits don't re-litigate solved problems:

- **Security**: A+ headers/SSL, SSRF closed across redirect hops and IPv6, KV-downgrade alerting, PII moved to POST, encrypted httpOnly cookies, no secrets ever committed. `docs/security-review.md` exists and was acted on.
- **Rate limiting** on all cost-bearing endpoints (the two Stripe endpoints in B3 are the only stragglers).
- **Share-URL architecture**: URL-as-database with edge-rendered JSON-LD/OG, bot-vs-human routing, og:image fallback, canonical tags, immutable snapshots, and deliberate omission of full instruction text from JSON-LD (copyright posture). This is the moat-adjacent asset; protect it.
- **Extraction resilience**: four fallback layers plus editable-form failure mode; blocked-site errors route to recovery (paste/extension) rather than dead ends.
- **Crawler cost-control**: robots.txt allows only the share endpoint, blocking crawlers from money-spending APIs.
- **SW update flow**: autoUpdate + skipWaiting + user-visible "Update" prompt — the stale-build problem is solved.
- **Unit/security test discipline** on the pure-logic core (parser, aggregation, scaling, SSRF, rate limiter).
- **PRD candor**: honest competitive assessment, three-tier unit economics, documented failure post-mortems (Kroger attribution, Reddit bans). Keep writing it this way — F1 is about freshness, not quality.
