# Mise — Cloud Sync / Data Durability Design

*Design document · No code changes. Closes finding **C1** ("Cloud sync / data durability — P1, rising") in `docs/site-improvement-audit-2026-07.md`. Grounded in the current storage layer (`src/infrastructure/db/`), the data models under `src/domain/models/`, the existing export path (`src/application/export/exportRecipes.ts`), and the serverless infrastructure under `api/`.*

**Status:** Proposal for review. Nothing here is built.

---

## 1. Problem statement

Mise stores the entire user library **locally, in IndexedDB, via Dexie** (`src/infrastructure/db/database.ts`, database name `MiseDB`, schema version 6). Five object stores hold everything the user has:

- `recipes` — `SavedRecipe` (the recipe plus `savedAt`/`updatedAt`)
- `groceryLists` — `GroceryList`
- `mealPlans` — `MealPlan`
- `extractionCache` / `nutritionCache` — derived caches, not user data

There is no server-side copy of any of this. That is the deliberate "zero infrastructure / local-first / no accounts" posture the README leads with — and it is also the single biggest trust ceiling on the product. Three ordinary events destroy a user's whole library with no recovery:

1. **Browser storage eviction.** IndexedDB is not durable storage by default. On **iOS Safari** the 7-day cap on script-writable storage evicts IndexedDB for sites the user hasn't engaged with recently unless the PWA is installed to the Home Screen — and even installed PWAs are subject to eviction under storage pressure. This is the worst-case environment and it is exactly where our growth is pointed (see below).
2. **Device loss / replacement / reset.** A new phone starts with an empty library. There is no "sign in and it's back."
3. **Clearing site data / browser reset.** One "Clear History and Website Data" wipes everything.

Today's mitigations are real but **manual and partial**:

- **Export** (`buildExportData` / `downloadJson`) writes a JSON file the user has to remember to download and store somewhere. It also **only exports `recipes`** — grocery lists and meal plans are not in `ExportData` — so it is a recipe backup, not a library backup.
- **Backup nudge** (`src/infrastructure/backup/backupNudge.ts`) prompts after 10 saves since the last export, tracked in `localStorage` (`mise_saves_since_export`). If site data is cleared, that counter is cleared too — the nudge cannot fire for the user who most needs it.

Neither survives the failure modes above, because both depend on the user having *already* acted, on the same device, before the loss.

**Why this is now urgent, not theoretical.** The go-to-market plan (audit A1) makes **TikTok the primary acquisition channel**. TikTok traffic is overwhelmingly **mobile Safari** — the most eviction-prone environment we support. Every GTM success therefore *increases* the rate of silent library loss. A user who saves 15 recipes, comes back three weeks later to an empty app, and churns is invisible to us (audit A8: "churn is silent and permanent") and lethal to the affiliate model, which depends on weekly return visits.

**Cloud sync is also the multi-device unlock.** The audit (C1) and the competitive framing both name multi-device as *the* top claim against Paprika, which charges per platform. "Save on your phone, plan on your laptop" is impossible today because the library lives in one browser's IndexedDB. Durability and multi-device are the same feature.

---

## 2. Design constraints from Mise's identity

Mise's public identity is **local-first, no-accounts, privacy-first**. The README's headline promises are "Works offline. No account required." and "All data stored in IndexedDB. No database, no user accounts." A privacy-conscious Reddit audience is a stated brand risk surface (audit B2). Any sync design that quietly turns Mise into a conventional account-based cloud app forfeits the thing that differentiates it.

Constraints the design must respect:

- **C-1 Local-first stays the default.** The app must remain fully functional with zero network and zero account. Sync is an *addition* to the local store, never a replacement. IndexedDB stays the working set; the app never blocks on the server.
- **C-2 Sync is opt-in.** No account is created, and nothing leaves the device, until the user explicitly turns sync on. The no-accounts promise holds for everyone who doesn't opt in.
- **C-3 Minimize what the server can see.** The stronger the privacy guarantee we can keep, the better it fits the brand. "Server can't read your recipes" is a *marketing asset*, not just a compliance nicety.
- **C-4 Low operational surface.** Mise is a solo-maintained, stateless-backend product. A sync backend that needs babysitting (a stateful service, a queue, a realtime server) is a poor fit. Prefer managed, serverless-shaped infrastructure.
- **C-5 The Vercel 12-function cap is a hard budget.** Audit E2 documents the deploy is at **11/12 serverless functions**, and exceeding the cap makes deploys *fail silently* (stale build served). Sync cannot assume "just add a few endpoints." Endpoint count is a first-class design constraint here.

### Candidate infrastructure already in the repo

Two pieces of infrastructure are already present and inform the options:

- **Vercel KV** (Redis-shaped) — in use today for rate limiting and the sitemap (`api/_lib/rateLimit.ts`, `api/sitemap-xml.ts`). Good for counters and ephemeral state; **not** a good primary store for a growing per-user recipe library (no relational queries, value-size and cost characteristics wrong for document storage).
- **Neon (Postgres)** — a Neon MCP is available to this project. Serverless Postgres fits C-4 well: managed, scales to zero, branch-per-environment, HTTP driver works from Vercel functions. This is the natural candidate for a durable per-user store.
- **Existing auth-shaped primitives.** We are not starting from zero on identity:
  - `api/verify-purchase.ts` already establishes an **email-based identity** with a **PIN** credential (comped path), constant-time PIN comparison, and a **shared PIN-attempt lockout** via the KV failure counters in `rateLimit.ts`.
  - `api/_lib/crypto.ts` provides **AES-256-GCM** encrypt/decrypt (used for httpOnly cookies via `COOKIE_SECRET`).
  - `api/_lib/cookies.ts` sets encrypted httpOnly cookies.
  These reduce the cost of a "lightweight auth" option considerably — the hard parts (a shared, abuse-resistant credential check) already exist.

---

## 3. Options analysis

Four options, each judged on **privacy fit**, **multi-device**, **implementation cost**, and **failure modes**. All costs are relative to a solo maintainer with the constraints above.

### Option A — Opt-in account-based sync (Neon/Postgres + lightweight auth)

The server stores each opted-in user's library in Postgres, keyed by an identity (email, or a device-generated sync ID). The client pushes local changes and pulls remote changes. Server sees plaintext recipes.

- **Privacy fit — weak-to-moderate.** The server can read every recipe, note, meal plan, and grocery list. Defensible with a clear privacy policy, but it *contradicts the "everything is local" headline* for opted-in users and is the least on-brand option. Adds a real PII/data-breach surface that doesn't exist today.
- **Multi-device — full.** This is the straightforward, well-trodden path; multi-device "just works."
- **Implementation cost — moderate.** Auth (can lean on the existing email+PIN primitives, or issue a random sync ID + secret), one Neon schema, and a sync endpoint. Server-side conflict resolution is easy because the server can read the data. Costs ~1–2 serverless functions against the 12-cap (C-5).
- **Failure modes.** Server outage degrades to local-only (acceptable if designed for it). Data-breach blast radius is the whole plaintext library. Account-recovery becomes a support burden (audit B1 notes there's no support page yet). Puts us squarely in GDPR data-controller territory for recipe content and email.

### Option B — End-to-end-encrypted sync (server stores ciphertext only)

Same transport as A, but the client encrypts each record with a key **derived from a user secret the server never receives** (e.g. a passphrase run through a KDF, or a generated recovery key). The server stores opaque blobs keyed by an opaque account ID; it can count and route records but cannot read them.

- **Privacy fit — strongest, and on-brand.** "We sync your library and we *can't read it*" is the privacy-first positioning made literal — a genuine differentiator and a Reddit-proof answer. The server holds ciphertext + minimal metadata.
- **Multi-device — full, with one caveat:** the user must bring their key/passphrase to each new device (typical E2EE UX). Lose the key → lose the ability to decrypt the cloud copy (the local copy is unaffected).
- **Implementation cost — moderate-to-high.** The transport and storage are the same as A; the added cost is **key management UX** (generating, displaying, re-entering a recovery key; the "I forgot my passphrase = data is unrecoverable" support conversation) and **client-side crypto** (WebCrypto: AES-GCM + a KDF like PBKDF2/Argon2). Conflict resolution is trickier because the server can't inspect content — but for our single-user-multi-device case (Section 5) it stays manageable. Similar function-count cost to A.
- **Failure modes.** Lost passphrase is unrecoverable *by design* — must be communicated honestly and softened by keeping the local copy and export as the escape hatch. Encrypted blobs are opaque to server-side migrations, so record shape must be versioned inside the ciphertext.

### Option C — User-provided storage (export to their own Google Drive / Dropbox)

Mise writes the library file to a cloud drive the user owns, via that provider's OAuth + API. Mise stores nothing.

- **Privacy fit — good in principle** (Mise sees nothing), **but** it hands the data — and an OAuth relationship — to Google/Dropbox, and requires sending users through a third-party consent screen that reads oddly for a "no accounts" app. Trades "trust Mise" for "trust Mise's Google integration."
- **Multi-device — weak/manual.** Nearest-neighbor to today's export: it can *auto-save* the backup file, but restore and cross-device merge are clunky. Two devices writing the same Drive file is a conflict problem with no good UX. It's durable backup, not live sync.
- **Implementation cost — moderate, and front-loaded on integration risk.** OAuth flows, provider SDKs, token storage/refresh, Google's app-verification review (a real, slow gate for Drive scopes), and per-provider quirks. Every provider added is another integration to maintain (C-4 cost).
- **Failure modes.** Provider API changes, token expiry, review rejections, and the "which device wins" merge problem. High surface for a maintainer, and it still doesn't deliver the seamless multi-device story we're selling against Paprika.

### Option D — Do nothing / rely on export + nudge

Keep the current manual export and backup nudge; maybe improve them (include grocery lists and meal plans; make the nudge harder to miss; add auto-download).

- **Privacy fit — perfect** (unchanged; nothing leaves the device unless the user saves a file).
- **Multi-device — none.** Manual file shuttling only. The Paprika differentiator stays unrealized.
- **Implementation cost — near-zero.** Small improvements to existing code.
- **Failure modes.** The exact failure modes in Section 1 persist. The nudge counter lives in the same `localStorage` that gets cleared alongside the data (`backupNudge.ts`), so it cannot protect the user who clears site data. This is the status quo, and the audit already ranks it insufficient and "rising."

### Summary

| Option | Privacy fit | Multi-device | Impl. cost | Headline failure mode |
|---|---|---|---|---|
| **A** Account + Neon | Weak–moderate (server reads all) | Full | Moderate | Breach exposes plaintext library |
| **B** E2E-encrypted | **Strongest, on-brand** | Full (bring your key) | Moderate–high | Lost passphrase = cloud copy unrecoverable |
| **C** User's own Drive | Good but delegated | Weak/manual | Moderate (OAuth + review) | Provider/OAuth churn; merge UX |
| **D** Do nothing | Perfect | None | ~Zero | The Section 1 losses persist |

---

## 4. Recommendation

**Recommended: Option B — opt-in, end-to-end-encrypted sync on Neon/Postgres — reached via a phased path whose first shippable step is a server-side *encrypted backup* (Section 7).**

Rationale:

1. **It resolves both problems at once.** Durability (Section 1) and multi-device (the Paprika differentiator) are the same feature; B delivers both, C and D deliver at most one.
2. **It's the only option that keeps the privacy promise intact and turns it into a marketing weapon.** For a product whose identity is "everything is local, privacy-first," Option A's "we can now read all your recipes" is a strategic own-goal; C delegates trust to Google; D delivers nothing new. B lets us say, truthfully, *"cross-device sync, and we can't read your library."* That line is worth more than the feature is hard.
3. **The infrastructure fits.** Neon (serverless Postgres, MCP available) satisfies C-4. The server stores opaque blobs, so it barely cares what's inside — small, stable schema. It costs ~1 shared serverless endpoint if designed as a single multiplexed sync handler, respecting the 12-function cap (C-5).
4. **We already have the hard primitives.** Email+PIN identity, constant-time credential checks, KV-backed lockout, and AES-256-GCM are all in the repo (Section 2). B's incremental cost over A is mostly *client-side* key management, and the local copy + export always remain as the safety net that makes "lost passphrase" survivable.

Honest tradeoff being accepted: **key-management UX is the real cost of B**, and "forget your passphrase and the cloud copy is unreadable" is a support conversation we are choosing to have — in exchange for a privacy guarantee no account-based competitor can match. We mitigate it by (a) never making the cloud the source of truth (Section 5), so the local library and export still work, and (b) offering a downloadable recovery key at setup.

If key-management UX proves too costly to land well, the fallback is **Option A with a very explicit privacy policy** — same transport and schema, drop the client-side crypto. The phased plan (Section 7) is deliberately structured so the transport ships first and the encryption decision can be confirmed before the multi-device merge work.

---

## 5. Sync model sketch (for the recommended option)

### Source of truth

**The local IndexedDB store is the working source of truth; the cloud is a durable, syncable replica.** This preserves C-1: the app always reads and writes locally and never blocks on the network. Sync runs in the background and reconciles.

### What data syncs

Sync the **user-authored** stores, not the derived caches:

- `recipes` (`SavedRecipe`) — the library. Primary target.
- `mealPlans` (`MealPlan`).
- `groceryLists` (`GroceryList`).
- **Not** `extractionCache` / `nutritionCache` — these are regenerable derived data; syncing them wastes bandwidth and leaks browsing history (which URLs were extracted). Also **not** `usdaNames` on `Recipe`, which is already marked transient/not-persisted.

### Conflict resolution: last-write-wins, per record

For a **single user across their own devices** (not multi-user collaboration), a CRDT is overkill. Recommend the simplest thing that is correct here: **per-record last-write-wins (LWW)** using the timestamps the data model *already carries*:

- `SavedRecipe.updatedAt`, `MealPlan.updatedAt`, `GroceryList.updatedAt` are all maintained today (`recipeRepository.ts` stamps `updatedAt` on every write; the meal-plan and grocery repositories do the same).
- Every record already has a stable `id`. Reconciliation is: for each `id`, the version with the newer `updatedAt` wins; ties broken deterministically (e.g. by device ID).

This is coarse — a LWW recipe overwrite loses a concurrent edit to a *different field* of the same recipe made on another device in the same window. For a personal recipe library that is an acceptable, rare loss, and far cheaper than field-level CRDT merge. Records are independent (editing recipe A never conflicts with recipe B), so cross-record consistency isn't required. If real-world conflicts prove painful, field-level merge can be added later without changing the transport.

**One gap to close: deletions.** `deleteRecipe` (`recipeRepository.ts`) is a **hard delete** — the row is gone, leaving no record to propagate. Under LWW that makes a delete on device 1 indistinguishable from "device 2 has a recipe device 1 never saw," so the recipe would resurrect on next sync. Sync therefore requires **tombstones**: a soft-delete marker (`deletedAt`) that syncs like any other change and is garbage-collected after all devices have seen it. This is the one schema addition the current model lacks, and it should land with the sync work (it need not change the local delete UX).

### Transport sketch (conceptual)

- A **sync cursor** per device: the timestamp/version of the last successful pull.
- **Push:** client sends records whose `updatedAt` > last-pushed watermark (encrypted blobs, under Option B). Server upserts by `id`, keeping the max `updatedAt`.
- **Pull:** client requests records changed since its cursor; applies LWW locally; advances the cursor.
- **Encryption (Option B):** each record is encrypted client-side (WebCrypto AES-GCM) under a key derived from the user's passphrase/recovery key. The server row is `{ account_id, record_id, record_type, updated_at, ciphertext, schema_version }`. The server orders and routes by `updated_at`/`id` but never sees plaintext. `record_type` and `updated_at` are the only content-adjacent metadata exposed (needed for routing and LWW); recipe titles, ingredients, and notes are all inside the ciphertext.
- **Endpoint budget:** implement as **one** multiplexed `/api/sync` handler (push+pull actions in a single function) to respect C-5 rather than one endpoint per store.

### Migration from the current local-only store

No destructive migration. On first opt-in:

1. The existing IndexedDB library is treated as the initial local state (nothing to convert — same records).
2. The client performs an initial **push** of all `recipes`/`mealPlans`/`groceryLists` to seed the cloud replica.
3. Subsequent devices opt in, pull, and LWW-merge into whatever they already have locally.
4. The Dexie schema gains a version bump (currently v6 in `database.ts`) to add the `deletedAt` tombstone field and any per-record sync bookkeeping (e.g. a dirty flag / last-synced watermark). Dexie's existing `.upgrade()` pattern (see the v2 upgrade in `database.ts`) is the mechanism; default `deletedAt = null` for existing rows.

Users who never opt in see none of this and keep the exact current behavior.

---

## 6. Privacy stance

### Under the recommended Option B

- **What the server can see:** an opaque account identifier, per-record `record_type` (recipe / meal plan / grocery list), `updated_at` timestamps, record counts and sizes, and **ciphertext it cannot decrypt**. It cannot see recipe titles, ingredients, notes, source URLs, meal plans, or grocery contents. It sees the email/identifier used to authenticate (needed for account recovery and abuse control) — so *that* an account exists and roughly how large/active it is, but not what's in it.
- **What it cannot see:** the plaintext of any user content. This is the guarantee that lets the marketing claim "we sync your recipes and we can't read them" be literally true.

### Privacy-policy additions required (ties to audit B1/B2)

The audit already flags that Mise has **no in-repo privacy page** (only an external `privacy.swinch.dev` link) and an **undocumented analytics posture**. Shipping sync forces this to be fixed, and the policy must state:

- Sync is **opt-in**; with sync off, nothing leaves the device (the existing promise, now explicit).
- For opted-in users: what is stored server-side (encrypted library blobs + auth identifier + minimal routing metadata), where (Neon/Vercel region), and that **the content is end-to-end encrypted and unreadable by Mise**.
- Retention and deletion: a user can delete their cloud data; local data is theirs regardless.
- The **lost-key consequence**, stated plainly: a forgotten passphrase makes the *cloud copy* unrecoverable; the local copy and JSON export are the backstops.
- If Option A is chosen instead, the policy must instead disclose that **Mise can read stored recipe content** — a materially weaker statement, which is itself a reason to pay the cost of B.

### Data-controller posture

Even under B, holding an email + ciphertext for EU users makes Mise a data controller for that metadata. Keep the identifier minimal, support deletion, and document a lawful basis (consent, via the opt-in). This dovetails with the B1/B2 legal-surface work rather than being separate.

---

## 7. Phased rollout — smallest shippable first step

Sequenced so each phase ships value and de-risks the next, and so the transport lands before the hardest UX.

**Phase 0 — Cheap durability wins now (Option D improvements; ship immediately, independent of everything else).**
Make export a real *library* backup, not just recipes: include `groceryLists` and `mealPlans` in `ExportData` (currently `exportRecipes.ts` exports only `recipes`). Add an "import to restore" round-trip if not already complete. Optionally strengthen the nudge. This costs almost nothing, helps every user today, and doesn't touch the account question. *This is the true smallest shippable step and should not wait on the sync design.*

**Phase 1 — Encrypted cloud backup (single device; the real first step toward B).**
Opt-in. Generate a recovery key, encrypt the library client-side, push it to Neon via a single `/api/sync` function. **Restore on the same account** (e.g. after clearing site data or on a reinstall) is the only cross-device operation. This directly kills the Section 1 durability failures for opted-in users, validates the Neon schema, the encryption UX, and the endpoint-budget approach (C-5) — **without** yet solving live multi-device merge. It is a backup product, honestly labeled as such.

**Phase 2 — Two-way sync + tombstones (multi-device).**
Add the pull path, per-record LWW, the `deletedAt` tombstone (the delete-propagation gap in Section 5), and the Dexie schema bump. This turns backup into sync and delivers the Paprika-beating multi-device claim.

**Phase 3 — Polish.**
Background/periodic sync, conflict surfacing UX if needed, recovery-key management, and account deletion flow. Reassess whether field-level merge is warranted based on real conflict rates.

**Decision gate before Phase 1:** confirm Option B vs. the Option A fallback. The two share Phase 1's transport and schema; the only divergence is whether the client encrypts before upload. Deciding here keeps the fallback cheap while defaulting to the on-brand, privacy-preserving design.

---

*Cross-references: audit findings C1 (this doc), A8 (silent churn / re-engagement), B1 (missing legal/support pages), B2 (analytics/privacy posture), E2 (Vercel 12-function cap). Current implementation anchors: `src/infrastructure/db/database.ts`, `src/infrastructure/db/recipeRepository.ts`, `src/domain/models/{Recipe,SavedRecipe,MealPlan,GroceryList}.ts`, `src/application/export/exportRecipes.ts`, `src/infrastructure/backup/backupNudge.ts`, `api/verify-purchase.ts`, `api/_lib/{rateLimit,crypto,cookies}.ts`.*
