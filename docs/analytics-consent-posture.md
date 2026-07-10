# Analytics Consent Posture

Closes finding **B2** of `docs/site-improvement-audit-2026-07.md` (P1). Documents the current analytics configuration, the tension with Mise's "privacy-first — everything is local" positioning and EU privacy law, a recommended defensible posture, and a concrete config-change checklist.

---

## 1. Current configuration (as built)

Grounded in the actual code, not intent.

### PostHog — `src/infrastructure/analytics/track.ts`

```ts
posthog.init(POSTHOG_KEY, {
  api_host: 'https://us.i.posthog.com',
  ui_host: 'https://us.posthog.com',
  autocapture: true,
  capture_pageview: true,
  capture_pageleave: true,
  persistence: 'localStorage',
  person_profiles: 'always',
})
```

What this means concretely:

- **`person_profiles: 'always'`** — PostHog creates a persistent *person profile* for **every** visitor, anonymous or not. This is the most identifying of the three modes (`always` / `identified_only` / `never`) and is the setting most in tension with the positioning.
- **`autocapture: true`** — PostHog auto-instruments clicks, form interactions, and other DOM events without per-event opt-in. Text content of the page can be captured in element metadata unless masked (`mask_all_text` is **not** set — it defaults to off).
- **`capture_pageview` / `capture_pageleave: true`** — automatic pageview and dwell-time events.
- **`persistence: 'localStorage'`** — the distinct-id and session state live in `localStorage`, not a cookie. This is a meaningful mitigation for the ePrivacy "cookie" analysis, but does **not** exempt the processing from GDPR (localStorage identifiers are still "storage of information on the user's terminal equipment" under ePrivacy and personal data under GDPR).
- **Host: `us.i.posthog.com`** — a **US-hosted** PostHog Cloud instance. For EU visitors this is a US data transfer.
- **Explicit identification** — `identifyUser(email)` is called from `src/presentation/hooks/usePurchase.ts`, i.e. the visitor's **email address** is attached to their PostHog profile at purchase time. Combined with `person_profiles: 'always'`, the pre-purchase anonymous profile is then merged into an email-identified one.
- **Event volume** — `trackEvent` is called across ~10 components (Extract, Grocery, MealPlan, Discover, Chat, install prompt, recipe display), so behavioural analytics is broad, not incidental.
- **Init gate** — analytics only initializes when `VITE_POSTHOG_KEY` is present (`initAnalytics()` early-returns otherwise). There is **no consent gate** — if the key is set, capture begins on load.

### Vercel Analytics — `src/App.tsx`

```tsx
import { Analytics } from '@vercel/analytics/react'
// ...
<Analytics />
```

`@vercel/analytics` runs alongside PostHog. Vercel's Web Analytics is cookieless and does not build cross-site profiles, but it is still a **second** third-party processor collecting pageview/usage telemetry, and it is currently **undisclosed** on any user-facing page.

### Consent surface

- **No consent banner exists.** A grep for `consent` / `CookieConsent` across `src/` returns nothing.
- **No user-facing privacy page in the repo.** The only privacy surface is an external footer link to `privacy.swinch.dev` (see finding B1). Neither PostHog nor Vercel Analytics is named there as far as this repo shows.

**Summary of current posture:** always-on person-level profiling + DOM autocapture for every visitor, email-identified at purchase, sent to a US processor, with a second analytics processor also running, and **no consent step and no disclosure** naming either tool.

---

## 2. Why this is a problem

### 2.1 It contradicts Mise's own positioning

Mise's public identity — in the static marketing HTML, Reddit drafts, and directory copy — is **"privacy-first — everything is local."** That claim is largely *true* of the core product (recipes live in IndexedDB on-device). But "everything is local" and "every visitor gets an always-on behavioural profile with DOM autocapture shipped to a US analytics vendor" cannot both be true. This is the sharper risk than the legal one: the target audience — the kind of privacy-conscious, technically literate user who is *persuaded* by "everything is local" and who filters through a $4.99 paywall — is exactly the audience that opens devtools, sees `us.i.posthog.com` autocapture firing on page load, and posts about it. A single Reddit comment ("their 'privacy-first' app autocaptures everything to PostHog") converts the strongest marketing claim into the strongest attack line.

### 2.2 GDPR / ePrivacy exposure for EU visitors

For visitors in the EU/UK, the current setup is hard to defend:

- **ePrivacy (the "cookie law")** governs *any* storage of/access to information on the user's device — including `localStorage` identifiers, not just cookies. Non-strictly-necessary analytics storage requires **prior consent**. Analytics is not "strictly necessary," so consent is required *before* the identifier is written. Today it is written on load.
- **GDPR lawful basis** — a persistent person profile plus autocapture plus (at purchase) an email is personal data processing. With no consent and no banner, there is no clean lawful basis for the pre-consent analytics processing; legitimate interest is a weak fit for always-on profiling of every visitor.
- **US transfer** — sending EU personal data to `us.i.posthog.com` adds a transfer dimension that a consent banner or EU-region hosting is normally used to address.
- **Transparency (Arts. 13–14)** — even setting consent aside, GDPR requires *naming* the processors and what they collect. PostHog and Vercel are currently undisclosed.

The realistic near-term risk is **not** a regulator fine at this scale; it is (a) the brand/positioning damage above, and (b) blocking factors for distribution — Chrome Web Store, app directories, and partner (Impact/Instacart) reviews increasingly check for a privacy policy that matches actual data flows.

---

## 3. Recommended posture

The goal is to **pick a position and make the config match it**, so the code can't contradict the marketing. Two coherent positions; the first is recommended.

### Option A (recommended): Privacy-aligned analytics, no consent banner

Keep analytics, but reconfigure so it is defensible *without* a banner — i.e. so the processing is low-identifiability enough to live under legitimate interest / a strict-necessity-adjacent posture, and so it stops contradicting "everything is local."

- **`person_profiles: 'identified_only'`** — no person profile for anonymous visitors; a profile is created only when we explicitly `identify()` (i.e. at purchase, for a paying customer who has a billing relationship). This is the single most important change. Anonymous browsing becomes event-only, not profile-building.
- **`mask_all_text: true`** (and `mask_all_element_attributes: true`) — autocapture stops capturing on-page text/attribute content, collecting only structural interaction signal. If autocapture value is low, consider `autocapture: false` and rely on the ~10 explicit `trackEvent` calls, which are already the useful signal.
- **Disable session recording** (it is not enabled today — keep it off explicitly).
- **Consider EU/cookieless options** — PostHog offers an **EU-hosted** cloud region (`eu.i.posthog.com`) and a **cookieless / memory-persistence** mode (`persistence: 'memory'`). Either materially reduces ePrivacy exposure. Given the US host today, moving to EU hosting *or* documenting the transfer basis is the follow-up decision.
- **Disclose both tools** — add a privacy page (pairs with finding B1) that names **PostHog** and **Vercel Analytics**, what each collects (product usage / pageviews), where it goes (region), retention, and that recipe data itself stays on-device. This turns "everything is local" into a *credible, specific* claim ("your recipes are local; we measure anonymous product usage to improve the app, via PostHog and Vercel — here's exactly what").

Under Option A, the identifiability is low enough and the disclosure honest enough that a banner is not strictly required for most jurisdictions — while remaining *consistent* with the brand.

### Option B (fallback): Keep person-level profiles, add a consent banner

If `person_profiles: 'always'` must stay (e.g. product wants full-funnel anonymous→identified stitching), then a **consent banner is mandatory**, not optional:

- Gate `initAnalytics()` behind an explicit opt-in for EU/UK visitors (geo-gated or shown to all).
- Do **not** call `posthog.init()` (or load Vercel Analytics) until consent is granted; PostHog supports `opt_out_capturing_by_default: true` + `posthog.opt_in_capturing()` on consent.
- Persist the consent choice; provide a way to withdraw.
- Still disclose both tools on the privacy page.

Option B is more engineering and adds a banner to a product that markets itself on cleanliness — which is why Option A is recommended.

---

## 4. Config-change checklist (actionable next step)

Concrete edits to `src/infrastructure/analytics/track.ts` for **Option A**:

- [ ] Change `person_profiles: 'always'` → **`person_profiles: 'identified_only'`**.
- [ ] Add **`mask_all_text: true`** and **`mask_all_element_attributes: true`** to the `posthog.init` config.
- [ ] Decide autocapture: keep with masking, **or** set `autocapture: false` and rely on the existing explicit `trackEvent` calls.
- [ ] Add **`opt_out_capturing_by_default`** consideration only if going with Option B; for Option A leave capture on but profile-gated.
- [ ] Evaluate **EU host** (`api_host: 'https://eu.i.posthog.com'`) and/or **`persistence: 'memory'`** (cookieless); pick one and record the transfer/retention decision.
- [ ] Confirm `identifyUser(email)` in `usePurchase.ts` still fires only at purchase (correct — that's the one legitimate identification point).
- [ ] Explicitly disable session recording in config (defensive; it is off by default).
- [ ] **Disclosure:** add/extend the privacy page (finding B1) to name **PostHog** and **Vercel Analytics**, region, what's collected, retention, and the on-device recipe stance. Link it in the footer next to Privacy.
- [ ] Verify the `VITE_POSTHOG_KEY`-absent path still no-ops cleanly (local dev / previews with no analytics).
- [ ] Bump the `app-version` element on deploy (per CLAUDE.md) so the SW ships the change.

**One-line summary for the audit:** flip `person_profiles` to `identified_only`, mask autocapture text, name PostHog + Vercel on a privacy page — this aligns the config with "everything is local" without a consent banner; the banner is the fallback only if always-on profiles are retained.
