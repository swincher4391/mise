# Re-engagement Options: Reaching a Lapsed Mise User

**Status:** DECISION REQUIRED — "do nothing" is a valid choice, but it must be a *documented* choice.
**Closes:** Audit finding A8 (`docs/site-improvement-audit-2026-07.md`).
**Owner:** Devin.

---

## The problem

Mise has **no channel to reach a user who has stopped visiting.** No email capture, no web push, no newsletter. Re-engagement today is limited to the PWA install prompt and the backup nudge — both of which only fire while the user is already in the app. Once someone drifts, churn is **silent and permanent**.

This matters specifically because of the business model. Real revenue comes from the Instacart affiliate (5% on grocery orders), and the attribution window is **7 days** — which is exactly one meal-plan cycle. The affiliate model doesn't need occasional visitors; it needs *weekly* return visits. A user who plans and shops every Sunday is worth far more than the one-time $4.99 unlock. Every silent lapse is a recurring revenue stream that ends without warning.

## The constraint

Mise is **local-first, no-accounts, privacy-first.** Data lives in IndexedDB on-device; there is no user table; the privacy policy (`privacy.swinch.dev`) is a selling point, echoed in every Reddit template ("no account needed"). Any re-engagement mechanism must fit that identity — the moment re-engagement requires a mandatory account or feels like surveillance, it damages the thing that differentiates the product. This rules out anything mandatory and pushes every option toward **opt-in at a moment the user already wants it.**

---

## Option A — Optional email capture at high-intent moments → weekly digest

Ask for an email **only** where the user is already asking Mise to do something that email is the natural delivery channel for: an **"email me my grocery list"** button on the grocery page, and/or a post-checkout **"email me this order's recipes / remind me next week?"** prompt. The address feeds a lightweight weekly recipe digest ("plan next week — here are 5 ideas").

| | |
|---|---|
| **Friction** | Low *if* framed as a feature the user requested (get my list off this device / into my inbox), not a signup gate. High if it ever looks like a newsletter wall. |
| **Privacy fit** | Acceptable but the biggest departure from "no accounts" — it is the one option that creates server-side PII. Must be strictly opt-in, single-purpose, one-click unsubscribe, and stored minimally (email + cadence, nothing linked to on-device recipe data). |
| **Implementation cost** | **Highest.** Needs a stored email list, an email service provider, a digest-composition job, unsubscribe handling, and a new serverless endpoint — mind the Vercel 12-function cap (F3). This is the only option that adds durable server-side state to a deliberately stateless backend. |
| **Expected retention lift** | Highest ceiling. Email is the proven weekly-cadence channel, reaches users on any device, and the digest can carry Discover/Describe content plus affiliate-friendly meal-plan prompts. |
| **Privacy-policy needs** | Substantial: what is collected (email), why (the digest/list delivery the user requested), retention, that it is never sold/shared, unsubscribe mechanism, and the provider (sub-processor) used. |

## Option B — Web Push API: Sunday "plan next week?" nudges

Use the Web Push API to send an opt-in Sunday-evening notification ("Ready to plan next week? Your meal planner is one tap away"). Works on installed PWAs across platforms, **including iOS 16.4+** (installed-to-home-screen requirement on iOS). No email, no server-side PII — just a push subscription token.

| | |
|---|---|
| **Friction** | Low-to-moderate. One permission prompt; best requested after a completed plan/checkout, not on first load. Only reaches users who have *installed* the PWA (a smaller but far higher-intent cohort). |
| **Privacy fit** | **Best fit of the three.** No email, no identity — an anonymous push subscription tied to the browser/device. Fully consistent with local-first/no-accounts; nothing personally identifying leaves the device. |
| **Implementation cost** | Moderate. Needs VAPID keys, a service-worker `push` handler (Workbox is already in the stack), a stored set of push subscriptions, and a scheduled send (a Vercel cron hitting one function — again watch the 12-function cap). Less state than email, no ESP. |
| **Expected retention lift** | Solid for the installed cohort and precisely aligned to the weekly cycle — a Sunday nudge lands exactly at meal-plan time. Lower reach than email (installed-PWA users only), but higher intent per recipient. |
| **Privacy-policy needs** | Modest: that push subscriptions are stored to deliver the notifications the user opted into, that they carry no personal data, and how to revoke (OS/browser notification settings + in-app toggle). |

## Option C — Do nothing (deliberately)

Ship no re-engagement channel. Accept that Mise is a personal-tool-first product people return to when *they* remember a recipe need, and rely on the existing PWA install prompt + organic habit for repeat visits.

| | |
|---|---|
| **Friction** | Zero. Nothing to build, nothing to consent to. |
| **Privacy fit** | Perfect and maximal — the strongest possible expression of the no-accounts promise. |
| **Implementation cost** | Zero. |
| **Expected retention lift** | Zero. Churn stays silent and permanent; the affiliate flywheel depends entirely on unaided recall and the install prompt. |
| **Privacy-policy needs** | None (arguably a marketing asset: "we have no way to contact you, by design"). |

---

## RECOMMENDATION — but this is your call to make

**Recommended: build Option B (Web Push), and treat Option A as a later, only-if-justified step.**

Rationale:

1. **Best identity fit.** Web Push adds an anonymous, revocable subscription and no PII. It re-engages users without contradicting a single word of the "no account, privacy-first" pitch — which is the whole constraint.
2. **Precisely aligned to the money.** The retention problem is specifically a *weekly* one (7-day attribution = meal-plan cycle). A Sunday-evening "plan next week?" push targets exactly that cadence and exactly that moment.
3. **Proportionate cost.** It reuses the existing service worker (Workbox) and adds one scheduled function and a subscription store — far lighter than standing up an email program, ESP relationship, and durable PII store on a deliberately stateless backend.
4. **Targets the right cohort.** It only reaches users who cared enough to *install* the PWA — the users most likely to have a weekly habit worth reinforcing.

Escalate to Option A (email digest) **only if** measured push reach proves too small (e.g. low PWA-install rate) and there is appetite to own PII and an email program. Its ceiling is higher, but so is every cost — build, maintenance, and privacy surface.

**Option C is genuinely defensible** for a personal-tool-first product, and choosing it is not a failure. The audit's actual requirement is narrow: **"no re-engagement" must be a decision on record, not an accident.** If the choice is C, write it down here and in the PRD — "we deliberately ship no re-engagement channel to maximize the privacy promise; we accept silent churn as the cost" — so it is a stance, not an oversight.

---

## What each choice needs before it ships

- **All options:** Record the decision in this doc and the PRD (`docs/Mise_PRD_v2_1.md`).
- **Option A or B:** Update the privacy policy at `privacy.swinch.dev` per the "privacy-policy needs" row **before** the feature ships — collecting a push token or email without the policy update is the failure mode to avoid. Keep the mechanism strictly opt-in, requested at a high-intent moment (post-plan / post-checkout), with a visible in-app off switch.
- **Option A specifically:** Confirm the new endpoint fits under the Vercel 12-function cap (F3); pick an ESP; implement one-click unsubscribe before the first send.
- **Option B specifically:** Generate VAPID keys, add the `push` handler to the existing service worker, and schedule the Sunday send via Vercel cron (one function, mind the cap).
- **Option C specifically:** Add the one-line "no re-engagement, by design" statement to the PRD so the choice is auditable.
