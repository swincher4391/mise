# Domain Decision: `mise.swinch.dev` vs. a Product Domain

**Status:** DECISION REQUIRED before directory submissions (A3) and the backlink campaign (A5) begin.
**Closes:** Audit finding A7 (`docs/site-improvement-audit-2026-07.md`).
**Owner:** Devin.

---

## The decision in one sentence

Either commit **permanently** to `mise.swinch.dev` (a subdomain of the personal domain `swinch.dev`, $0), or buy a product domain (e.g. `miseapp.io`) and **301-redirect before any directory submission or backlink goes out** — but pick one now, because indecision is the only genuinely expensive option.

---

## Why this blocks A3/A5

Every off-site asset points at, and accrues authority to, whichever domain is on the link:

- **Directory listings** (PeerPush and the ~50 targets in `plans/directory-submission-strategy.md`) hard-code a URL. Editing a live listing later ranges from annoying to impossible.
- **Pinterest domain verification** binds to one host. Re-verifying on a new domain means re-doing the claim and losing accrued pin authority.
- **Search Console** history (impressions, queries, average position, manual-action record) is per-property and does **not** transfer. A new domain starts from zero history.
- **Indexed share URLs** are the marketing asset. Mise's share links encode the full recipe in the query string and each one is a crawlable SEO page — they are already being indexed on `mise.swinch.dev`. Every one indexed under the current host is a page you would be asking Google to re-crawl and re-attribute after a migration.

The audit's core point: **this gets more expensive every week A3/A5 run.** A migration done today moves a handful of indexed pages and one directory listing (PeerPush). The same migration after the backlink campaign moves dozens of listings, a verified Pinterest domain, months of Search Console history, and a large corpus of indexed share pages.

---

## Current state (confirmed 2026-07)

- Production is `mise.swinch.dev`, a subdomain of the personal domain `swinch.dev`. Marginal cost: **$0**.
- Google has indexed the homepage **and** share pages on `mise.swinch.dev`.
- The app, PRD, and all Reddit templates use `mise.swinch.dev`.
- Only `plans/directory-submission-strategy.md` diverges — it references "`https://miseapp.io` or similar." That is the sole inconsistency, and it is unresolved.
- The privacy policy lives at `privacy.swinch.dev` (same personal-domain family).
- Only one directory (PeerPush) has been submitted. **The migration window is as cheap as it will ever be.**

---

## Option A — Stay on `mise.swinch.dev` permanently

| Dimension | Assessment |
|---|---|
| **SEO — subdomain vs. apex** | Google treats subdomains adequately. The "subdomains don't inherit authority" concern is largely legacy folklore; for a site with no meaningful root-domain authority to inherit anyway, the practical SEO delta vs. an apex domain is negligible. |
| **Cost** | $0 forever. No registration, no renewal, no DNS/redirect maintenance. |
| **Sunk-cost preservation** | Keeps 100% of what already exists — indexed homepage, indexed share pages, Search Console history, and future directory/Pinterest equity all compound on one host from day one. |
| **Brand perception** | Weakest point. `mise.swinch.dev` reads as a personal side-project, not a product. On directory listings and in `r/SideProject`/`r/webdev` it is slightly less credible than a product domain. For a personal-tool-first product this is an acceptable trade. |
| **Migration cost if deferred** | None — there is no migration. |
| **Consistency fix required** | Correct `plans/directory-submission-strategy.md` to `mise.swinch.dev`. One edit. |

## Option B — Buy a product domain (e.g. `miseapp.io`) and 301 now

| Dimension | Assessment |
|---|---|
| **SEO — subdomain vs. apex** | A dedicated apex on a clean product TLD is the textbook-cleanest setup and the best long-term brand-equity container. A well-implemented 301 preserves the large majority of existing link equity, but transfer is never 100% and Google takes weeks to fully re-attribute. |
| **Cost** | Registration + annual renewal (a `.io` is typically ~$30–60/yr; `.app`/`.com` vary). Ongoing, not one-time. |
| **Sunk-cost preservation** | Partial. 301s pass most equity, but Search Console history is per-property (starts fresh — you'd run both properties during transition), and every indexed share page must be re-crawled. Cheap **now** (little indexed), expensive **later**. |
| **Brand perception** | Strongest. A product domain reads as a real product, helps in directories and dev-community posts, and is the domain you'd want if Mise ever grows past a personal tool. |
| **Migration cost if deferred** | Escalates weekly. Every directory listing, Pinterest verification, and indexed share URL added under `mise.swinch.dev` becomes another thing to redirect, re-verify, or re-submit. |
| **Consistency fix required** | Buy domain, configure DNS + TLS, stand up a site-wide 301 from `mise.swinch.dev`, re-point the app/PRD/Reddit templates, and keep the redirect alive indefinitely. |

---

## RECOMMENDATION

**Commit permanently to `mise.swinch.dev`.**

Rationale:

1. **It matches what Mise actually is today** — a privacy-first, local-first, personal-tool-first product. The PRD and CLAUDE.md frame it as a tool built first for the author's own kitchen. A $0 subdomain is congruent with that identity; paying annual rent for a product domain implies a growth ambition that isn't the current thesis.
2. **The SEO gap is small and shrinking.** Subdomain-vs-apex ranking differences are marginal in practice, and the site has no root-domain authority for an apex to inherit anyway. The realistic upside of Option B is brand perception, not rankings.
3. **It preserves 100% of the sunk cost with zero migration risk.** The homepage and share pages are already indexed here; Search Console history is already accruing here. Staying keeps all of it and eliminates the (small but nonzero) equity leakage inherent in any 301.
4. **It removes the recurring cost and the redirect as a permanent point of failure.** A broken or lapsed redirect after a migration would silently sever the entire backlink corpus.

Option B is defensible **only** if the plan is to grow Mise into a standalone product/brand and you accept paying and maintaining the redirect for that upside. If that becomes the goal, **execute the buy-and-301 immediately** — its cost is lower this week than in any future week. Do not adopt Option B and then defer the migration; that is the one path the audit explicitly warns against, because you'd be pouring backlink and index equity into a domain you intend to abandon.

---

## What must happen before directory submissions begin — either way

1. **Record the decision.** Update the PRD (`docs/Mise_PRD_v2_1.md`) with the committed domain and this doc's rationale.
2. **Eliminate the inconsistency.** Fix the `miseapp.io`/`mise.swinch.dev` divergence in `plans/directory-submission-strategy.md` so every submission asset, screenshot caption, and description uses the committed domain.
3. **If Option A (recommended):** Confirm Search Console is verified for `mise.swinch.dev`, confirm the share-page sitemap is submitted, then unblock A3/A5.
4. **If Option B:** Register the domain, configure DNS + TLS, deploy a site-wide 301 from `mise.swinch.dev` (including `/?d=…` share URLs), verify the new property in Search Console, re-point the app/PRD/Reddit templates, and only **then** begin submissions — so no listing is ever created against the soon-to-be-old host.

**Do not begin directory submissions or the backlink campaign until step 1 and step 2 are complete.** A committed, consistent domain is the prerequisite the rest of the GTM plan hangs on.
