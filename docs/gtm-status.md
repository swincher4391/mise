# Mise — GTM Status

*Living operational state doc. Created July 2026 to close finding **F2** in `docs/site-improvement-audit-2026-07.md`.*

**Purpose.** This is the single "what was actually done and measured" view of go-to-market. Strategy lives elsewhere (PRD §14–15, `docs/reddit-playbook.md`, `plans/directory-submission-strategy.md`, `plans/tiktok-promo-video.md`, `docs/launch-assets.md`); **this doc keeps state, not strategy.** GTM state was previously scattered across those docs with no record of execution or results — this consolidates it.

**Review cadence:** weekly. Each review, update every row's *Last action* / *Next action*, re-check the blocked-on-decision item, and note any measurement now available. If a status claim here conflicts with the audit or the code, the audit/code wins — fix this doc.

*Last reviewed: 2026-07-10 (initial).*

---

## Channel status

| Channel | Status | Last action | Next action | Primary metric |
|---|---|---|---|---|
| **TikTok** | **Not started (P0)** | Shot plan written (`plans/tiktok-promo-video.md`); uncommitted `record-tiktok-*` entry in `playwright.config.ts`. No account, no posts. | Create account; post the 2 scripted videos; commit to a 2–3/week cadence. Tag `utm_campaign` per video. | Grocery checkouts attributed to TikTok UTM (proxy: `instacart_*_click`); video views/saves secondary |
| **Chrome Web Store** | **Built, unsubmitted (P0)** | `extension/` complete — Manifest V3, v2.1.0. Listing copy + privacy disclosure written in `docs/launch-assets.md` §1. Not submitted. | Register Chrome developer account ($5); capture screenshots; ensure privacy + support pages live (B1); submit for review. | Store installs; secondarily YouTube-path extractions enabled |
| **Directory submissions** | **Assets prepped, none submitted (P1)** | Strategy + 51-target inventory (`plans/directory-submission-strategy.md`); Phase-1 asset kit + 16-row tracker written (`docs/launch-assets.md` §3–4). Tracker all "Not started." Only PeerPush ever submitted. | **Blocked on domain (A7).** Once decided, batch Phase 1 (Tier 1 + AI/software directories); fill the tracker as you go. | Referring domains / backlinks live (domain-authority input to SEO flywheel) |
| **Pinterest Rich Pins** | **Plumbing shipped, validation pending (P1)** | JSON-LD on share pages, `pinterest-rich-pin` meta, Pin It button, verified business domain, bulk-pin script all shipped. Rich Pin Validator step never run. | Submit one share URL to the Rich Pin Validator (one-time); confirm a pinned URL renders as a Rich Pin; start bulk-pin cadence on a Mise board. Record validation date. | Pin-driven visits → saves; Rich Pin activation (yes/no) |
| **Reddit** | **Paused (suspension history)** | Playbook exists (`docs/reddit-playbook.md`); 4 draft posts sit in `docs/` unposted. Paused per account-suspension history, r/food permaban, one-sub-per-day pacing. | Keep paused. Before any resumption: refresh stale template numbers, resolve the budget-post share-link TODO, pre-generate share links. | Grocery checkouts per subreddit (not upvotes/traffic) |
| **SEO / share-pages** | **Live and indexed (confirmed)** | URL-as-database share pages with edge JSON-LD/OG, canonical tags, bot-vs-human routing live. KV-backed sitemap (`api/sitemap-xml.ts`) + robots.txt reference shipped. **Confirmed Google-indexed as of 2026-07.** | Grow referring domains (see Directory/Pinterest rows) to lift ranking; per-recipe OG image (A6) is a later lift. | Organic impressions/clicks (Search Console); share-page → save rate |
| **PWA install** | **Live** | Manifest strong: maskable icon, `share_target`, theme color, SW update prompt. Install prompt fires after first extraction. | Add `screenshots` (narrow + wide) to upgrade the install sheet (D3) — assets shared with Chrome/directory work. | Install prompt → install rate; installed-user retention |
| **PeerPush** | **Submitted** | Submitted (the one directory-type action executed to date). | No further action; fold results into the directory measurement review. | Referral visits from listing |

---

## Blocked on decision

**The domain decision (finding A7) blocks directory, Pinterest verification, and backlink work.** Production is `mise.swinch.dev` (a subdomain of a personal domain); the directory strategy doc still assumes `miseapp.io` or similar. Every backlink, directory listing, Pinterest domain verification, Search Console history, and indexed share URL accrues to whichever domain is committed — migrating later forfeits or complicates all of it. `docs/launch-assets.md` gates **all** submissions on this ("commit the domain, then submit"). Decide first: commit to `mise.swinch.dev` permanently ($0) or buy a product domain and 301-redirect *before* submissions begin, then record the decision in the PRD. **Directory (P1) and Pinterest (P1) rows above stay blocked until this is settled.**

---

## Measurement gaps (prerequisite for judging any channel)

Per finding **A4**, no channel can yet be judged on the metrics the PRD actually cares about. PostHog is integrated (~25 events, extract → save → meal plan → Instacart click), **but**: no documented funnels or dashboards exist; first-touch UTM is **not persisted** (autocapture only), so a Reddit/TikTok click can't be tied to an Instacart click days later; and `instacart_*_click` is the last observable step (real checkout/commission truth lives only in Impact). PRD §15.9 conditions the 25-recipe-cap decision on three metrics (saves before first meal plan, saves before first checkout, % hitting the cap) — none answerable today. **A4 is the prerequisite for the "Primary metric" column above to mean anything; until it's done, A1/A3 fly blind.** Fix: build the 4 PostHog funnels, persist first-touch UTM in localStorage and attach it to `instacart_*_click` / `upgrade_completed`, and run a monthly Impact-vs-PostHog reconciliation.

---

## Next actions, prioritized

From the audit's Prioritized Action List (items 1, 3, 4, 6):

1. **Decide domain strategy (P0, decision — A7)** — commit to `swinch.dev` subdomain or buy a product domain. **Blocks directory + Pinterest work below.**
2. **Publish Chrome extension to Web Store (P0, M — A2)** — developer account, screenshots, listing copy (ready in launch-assets), privacy disclosure; ensure trust pages live first.
3. **Launch TikTok (P0, M — A1)** — account + post the 2 scripted videos, commit to cadence, tag UTM per video.
4. **Validate Pinterest Rich Pins (P1, XS — A5)** — one-time validator submission, then start the bulk-pin cadence. (Domain-dependent for verification — see A7.)

*Not listed but prerequisite to measuring all of the above: build the A4 funnels + persist first-touch UTM (action #2 in the audit).*
