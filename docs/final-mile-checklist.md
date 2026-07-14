# Final-Mile Checklist

*The four audit findings that cannot be closed by code — each requires an account, a third-party login, or the passage of time. Every artifact is already produced; what remains is listed here as exact steps. Closes the "what's blocking me" question for A1, A2, A5, C2.*

---

## A1 — Post the TikTok video · ~15 min

The finished video already exists.

1. **Asset:** `videos/tiktok-paste-link-get-recipe.mp4` (12s, 9:16 vertical, H.264 — TikTok-ready). Regenerate anytime with:
   `npx playwright test scripts/record-tiktok-promo.ts --config playwright-record.config.ts`
2. Create (or use) a TikTok account for Mise.
3. Upload the MP4. Cover text and overlays are already burned in; add a trending audio track in-app.
4. Caption + first comment: link `https://mise.swinch.dev?utm_source=tiktok&utm_medium=video&utm_campaign=paste-link`.
5. The second scripted video is in `plans/tiktok-promo-video.md` — record it the same way, then commit to 2–3 posts/week (see `docs/gtm-status.md`).

*Only blocker: a TikTok account and the upload itself.*

---

## A2 — Submit the Chrome extension · ~30 min + one-time $5

The package and screenshots already exist.

1. **Assets:** `build/mise-extension-2.1.0.zip` (upload this), `build/store-1-popup.png` + `build/store-2-recipe.png` (1280×800 store screenshots). Rebuild the zip with `pwsh extension/build-zip.ps1`.
2. **Listing copy + privacy disclosure:** all written in `docs/launch-assets.md` — name, short/long description, category, and the permission-by-permission data-use justification the review needs (the `<all_urls>` "reads page content" combination triggers manual review).
3. Register a Chrome Web Store developer account ($5 one-time) at the [developer dashboard](https://chrome.google.com/webstore/devconsole).
4. New item → upload the zip → paste the listing copy → attach the two screenshots → fill the privacy practices from `launch-assets.md` → set the support URL to `https://mise.swinch.dev/support`.
5. Submit for review.

*Only blocker: the $5 developer account and the upload. Do the A7 domain decision first (below) — the listing URL should be final.*

---

## A5 — Validate Pinterest Rich Pins · ~5 min, one-time

The plumbing is fixed and live (JSON-LD now always carries a recipe `image`, verified in production).

1. Generate a share link from any saved recipe (the in-app **Share** button).
2. Paste it into the [Pinterest Rich Pin Validator](https://developers.pinterest.com/tools/url-debugger/) and click **Validate**.
3. It should pass first try (name + image + ingredients are all present). Apply — this activates Rich Pins domain-wide, one time.
4. Record the validation date in the PRD so it stops reading as open work, then start pinning share URLs to a Mise board.

*Only blocker: a Pinterest business login for the one-time validation.*

---

## C2 — Decide the 25-recipe cap · needs 4–6 weeks of data

Instrumentation is wired (first-touch UTM persisted; events fire). This one is gated on time, not effort.

1. In PostHog, build the four funnels defined in `docs/analytics-spec.md` (the events already exist; this is assembly). Needs your PostHog login.
2. Let 4–6 weeks accumulate.
3. Read the three §15.9 metrics (saves before first meal plan, saves before first checkout, % hitting the cap) and decide whether to raise, keep, or remove the cap.

*Only blocker: your PostHog access to build the funnels, then calendar time.*

---

## Also outstanding (not an audit finding, but real)

- **Confirm/create `support@swinch.dev`** — the Terms and refund policy at `/terms` and `/support` point to it. It must receive mail.
- **A7 domain decision** (see `docs/domain-decision.md`, recommends committing to `mise.swinch.dev`) — gates A2 and A3 listing URLs; decide before submitting anywhere.
