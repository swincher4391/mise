# Mise — Analytics Spec

*Closes audit finding A4. Defines the funnels and attribution needed to answer the PRD's own §15.9 questions, so channel spend (time) can be judged by revenue, not vanity metrics.*

---

## Why this exists

PRD §15.9 conditions the 25-recipe-cap decision on three metrics; §14.3 says to judge subreddits by grocery checkouts, not traffic. Neither was answerable: PostHog fires ~25 events but no funnels are built, and no attribution tied a channel click to a checkout days later. This spec makes both answerable.

## First-touch attribution (shipped)

`src/infrastructure/analytics/track.ts` now captures the first campaign a user arrives on (`utm_*` → `first_utm_*`), persists it in `localStorage` (`mise_first_touch`), and registers it as PostHog **super-properties** so it rides on *every* event — including `upgrade_completed` and `instacart_*_click` that happen in a later session. Organic visits record no first touch, so a later UTM'd visit can still be the first attributed one.

This means every conversion event can be broken down by `first_utm_source` / `first_utm_medium` / `first_utm_campaign` in PostHog with no extra work.

## The four funnels to build in PostHog

Build these as saved Funnel insights. Events already fire (see `trackEvent` call sites); the work is assembling and saving the funnels, not instrumentation.

### 1. Core activation funnel
`$pageview` → `recipe_extracted` → `recipe_saved` → meal-plan action → `instacart_*_click`
- **Answers:** where first-time users drop off; §15.9 "saves before first meal plan / before first checkout" (read the step-to-step conversion and the recipe-count property).

### 2. Share-link visitor funnel
Landing with `first_landing_path = /api/r` (or an `?import=` param) → `recipe_saved` (or "try your own" click) → `recipe_extracted`
- **Answers:** does the viral loop convert viewers into users? This is the flywheel's efficiency.

### 3. Upgrade funnel
`upgrade_initiated` → `upgrade_completed`, broken down by the feature that triggered the prompt and by `first_utm_campaign`.
- **Answers:** which paywall moment converts, and which channels send paying users.

### 4. Per-campaign revenue funnel
Breakdown of funnel #1's `instacart_*_click` and `upgrade_completed` by `first_utm_campaign`.
- **Answers:** §14.3 — judge each channel/subreddit/video by checkouts, not upvotes.

## Metrics to track for the §15.9 cap decision

| Metric | How | Decision it feeds |
| --- | --- | --- |
| Saves before first meal plan | Funnel #1, recipe-count property at meal-plan step | Is 25 saves enough runway before the primary funnel step? |
| Saves before first checkout | Funnel #1, count at `instacart_*_click` | Same, against the revenue step |
| % of free users hitting the 25 cap | Cohort: users with ≥25 `recipe_saved` and no `upgrade_completed` | Is the cap a churn risk or a rarely-hit ceiling? |

Run 4–6 weeks after the funnels exist, then decide the cap (audit C2).

## The measurement gap this does NOT close

`instacart_*_click` is the last **observable** step — actual checkout and commission truth live only in Impact. Reconcile monthly: pull Impact commission data and compare against PostHog `instacart_*_click` counts per `first_utm_campaign`. Document the ratio; that's the real per-channel ROI.

## Consent caveat

Attribution relies on `person_profiles: 'always'` + autocapture, which is in tension with the privacy-first positioning — see `docs/analytics-consent-posture.md`. Align the config before scaling EU-facing channels.
