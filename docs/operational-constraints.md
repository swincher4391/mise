# Mise — Operational Constraints

*Production-critical constraints that are easy to violate and fail in non-obvious ways. Closes audit finding E2. Keep this current — these have each already cost a debugging session.*

---

## 1. Vercel serverless function cap: 12

The plan allows **12 serverless functions**. Exceeding it does **not** fail loudly — production deploys silently stop shipping, and the site keeps serving the last good build. A new endpoint can appear to deploy while returning `NOT_FOUND` because it was never actually created.

- **Count = `api/**/*.ts` minus `api/_lib/`** (helpers under `_lib/` are not functions).
- **Currently 11/12** — one slot of headroom.
- Pre-deploy check:
  ```sh
  ls api/*.ts api/grocery/*.ts | wc -l    # must be <= 12
  ```
- **When adding an endpoint, prefer merging** into an existing one behind a query param over a new file. Precedents:
  - `api/grocery/instacart.ts` — `?type=recipe|list`
  - `api/yt-transcript.ts` — GET (fetch captions) vs POST (structure transcript)
- The per-recipe OG-image feature (audit A6) must share an existing function, not add one.

## 2. HuggingFace provider pinning

Models called through the HF router (`https://router.huggingface.co/v1/chat/completions`) **must be pinned to an enabled provider** with a `:provider` suffix. An un-pinned model name lets the router auto-select, but only from providers enabled on the account — a model no enabled provider serves fails with `model_not_supported`, and endpoints used to swallow that into degraded output.

- **Enabled providers:** Hyperbolic, featherless-ai.
- **Current pinned models** (all overridable by env var):

  | Use | Model | Env override |
  | --- | --- | --- |
  | Transcript structuring | `Qwen/Qwen3-30B-A3B-Instruct-2507:featherless-ai` | `STRUCTURE_MODEL` |
  | Recipe chat (Describe) | `Qwen/Qwen3-14B:featherless-ai` | `CHAT_MODEL` |
  | Ingredient normalize | `Qwen/Qwen2.5-7B-Instruct:featherless-ai` | `NORMALIZE_MODEL` |
  | Photo / frame vision | `Qwen/Qwen2.5-VL-7B-Instruct:hyperbolic` | (in `extract-image.ts` / `proxy-browser.ts`) |

- **To find which providers serve a model:**
  ```sh
  curl -s "https://huggingface.co/api/models/<org>/<model>?expand[]=inferenceProviderMapping"
  ```
- GGUF repos are local-inference only (llama.cpp/Ollama) and **cannot** be used via the router.

## 3. YouTube extraction is extension-only

Server-side YouTube extraction is **structurally blocked** — not a bug to fix:

1. **Captions:** YouTube blocks datacenter IPs from the timedtext endpoint. Supadata is used as a relay (free tier: **100 credits/month** — a hard monthly ceiling).
2. **Audio:** YouTube serves DRM-protected `blob:` streams; Puppeteer `captureStream()` and direct fetch both fail, so the whisper fallback stalls to the function's `maxDuration`. The client caps the YouTube whisper attempt at 45s.

The **Chrome extension is the only reliable YouTube path** — it reads captions in the user's own browser and POSTs the transcript to `/api/yt-transcript` for structuring. Marketing copy promising YouTube extraction depends on the extension being installable (audit A2).

Extension gotcha: content scripts run in the **isolated world** and cannot see `window.ytInitialPlayerResponse`; it must be parsed out of the inline `<script>` in the DOM. `"world": "MAIN"` is not a fix — MAIN world can't call `chrome.runtime.sendMessage`.

## 4. Datacenter-IP publisher blocking

Some recipe sites block Vercel's datacenter IP ranges outright — **both** `/api/proxy` and the Puppeteer `/api/proxy-browser` fallback get a bot/paywall page, never the recipe (Puppeteer runs from the same IP range, so it does not help).

- **People Inc.** network serves **HTTP 402** to datacenter ranges: `simplyrecipes.com`, `seriouseats.com`, `foodandwine.com`, `marthastewart.com`, plus `allrecipes.com`, `eatingwell.com`. These are listed in `BLOCKED_DOMAINS` in `src/presentation/hooks/useRecipeExtraction.ts` so a paste short-circuits to the recovery UI instead of a ~60s dead-end.
- Expect more publishers to follow. The extension is the hedge.
- To test whether a site blocks the IP:
  ```sh
  curl -sD - "https://mise.swinch.dev/api/proxy?url=<recipe-url>" -o /dev/null | grep -i x-upstream-status
  ```
  A `402`/`403`, or a body under ~1500 bytes, means blocked.

## 5. Rate limiting depends on Vercel KV

`api/_lib/rateLimit.ts` uses Vercel KV so its counters are shared across serverless instances. Env vars: **`KV_REST_API_URL`, `KV_REST_API_TOKEN`** (exactly these names — `@vercel/kv` reads no others).

- Without them, the limiter **degrades to a per-instance in-memory window** — an attacker gets a fresh bucket per warm lambda, and the PIN lockout stops being shared. This is logged loudly (`console.error`) in production, once per cold start.
- The rate limits are the real cost control for the unauthenticated cost-bearing endpoints; free-tier gating in the client is trivially bypassable (accepted — see PRD).

## 6. Do not load-test production

Bursting an endpoint (dozens of requests to `/api/proxy` from one IP in a couple of minutes) trips **Vercel's automatic DDoS mitigation**, which enables Attack Challenge Mode **site-wide** — every path returns `403 X-Vercel-Mitigated: challenge` to any client that can't run JS (crawlers, unfurlers, monitoring). Real browsers pass invisibly; it does not decay quickly and is cleared from **Vercel → Firewall**.

Verify rate-limit *behaviour* with unit tests (`tests/unit/security/rateLimit*.test.ts`). Against production, send at most a handful of spaced requests and read `X-RateLimit-Remaining` — a counter decrementing across distinct `X-Vercel-Id` values already proves it's shared and KV-backed.
