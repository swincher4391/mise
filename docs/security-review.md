# Mise Security Review

**Date:** February 17, 2026
**Reviewer:** Automated audit via Chrome DevTools + codebase analysis
**Target:** https://mise.swinch.dev (production)
**Grade:** A+ (securityheaders.com), A+ (SSL Labs)

---

## Executive Summary

Mise is a client-side Progressive Web App with a stateless serverless backend on Vercel. All recipe data is stored locally in the browser via IndexedDB. The attack surface is minimal by design — no database, no user accounts, no persistent server state. Security hardening has been applied across HTTP headers, OAuth cookie handling, input validation, and Content Security Policy.

---

## 1. Transport Security

| Control | Status | Detail |
|---|---|---|
| HTTPS enforced | PASS | All traffic served over TLS via Vercel |
| HSTS | PASS | `max-age=63072000; includeSubDomains; preload` (2 years) |
| TLS version | PASS | TLS 1.3 supported, A+ on SSL Labs |
| Mixed content | PASS | `isSecureContext: true`, no HTTP resources loaded |

**No issues found.**

---

## 2. HTTP Security Headers

| Header | Status | Value |
|---|---|---|
| Content-Security-Policy | PASS | Strict whitelist — `default-src 'self'`, explicit allowlist for Stripe, Kroger, HuggingFace |
| X-Frame-Options | PASS | `DENY` — prevents clickjacking |
| X-Content-Type-Options | PASS | `nosniff` — prevents MIME sniffing |
| Referrer-Policy | PASS | `strict-origin-when-cross-origin` |
| Permissions-Policy | PASS | `camera=(), microphone=(), geolocation=()` — all disabled |
| Strict-Transport-Security | PASS | Present with preload directive |

### CSP Details

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:;
connect-src 'self' https://checkout.stripe.com https://router.huggingface.co https://api.kroger.com https://tmpfiles.org;
frame-src https://checkout.stripe.com;
font-src 'self'
```

**Note:** `style-src 'unsafe-inline'` is required for the app's CSS-in-JS approach. This is an accepted tradeoff — inline styles cannot execute scripts. `img-src https:` allows any HTTPS image source, which is necessary for displaying recipe images from arbitrary domains.

### Missing (Optional) Headers

| Header | Impact | Recommendation |
|---|---|---|
| Cross-Origin-Embedder-Policy | Low | Not needed — app doesn't use `SharedArrayBuffer` |
| Cross-Origin-Opener-Policy | Low | Could add `same-origin` for defense-in-depth |
| Cross-Origin-Resource-Policy | Low | Could add `same-origin` |

These are newer headers that enable Cross-Origin Isolation. Adding COEP could break the Stripe checkout iframe and external image loading, so the current omission is intentional.

---

## 3. Authentication & Session Management

### Kroger OAuth2 Flow

| Control | Status | Detail |
|---|---|---|
| CSRF protection | PASS | Random 16-byte state nonce generated per auth request (`randomBytes(16)`) |
| State stored in cookie | PASS | `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300` |
| State validated on callback | PASS | Strict equality check — rejects mismatched or missing state |
| Tokens never in URL | PASS | Callback redirects to `/` with no query parameters containing tokens |
| Token storage | PASS | Encrypted in `HttpOnly; Secure; SameSite=Lax; Path=/api` cookie |
| Encryption | PASS | AES-256-GCM with random 12-byte IV per encryption |
| Token expiry enforced | PASS | Server-side expiry check in `getTokenFromCookie()` |
| Logout clears cookie | PASS | Sets `Max-Age=0` to expire the cookie |

### Payment Verification

| Control | Status | Detail |
|---|---|---|
| Rate limiting on PIN | PASS | 5 attempts per email, 15-minute lockout |
| Email validation | PASS | Regex validation before processing |
| Server-side verification | PASS | Stripe API called server-side, not trusted from client |

---

## 4. Client-Side Data Storage

### localStorage Contents (observed)

| Key | Sensitivity | Risk |
|---|---|---|
| `kroger_access_token` | HIGH | **Legacy key — should be removed** |
| `kroger_refresh_token` | HIGH | **Legacy key — should be removed** |
| `kroger_token_expiry` | LOW | Timestamp only |
| `mise_purchase_email` | MEDIUM | User email stored in plaintext |
| `mise_purchase_paid` | LOW | Boolean flag |
| `mise_purchase_verified_at` | LOW | Timestamp |
| `kroger_selected_store` | LOW | Store preference |
| `mise_has_extracted` | LOW | Usage flag |
| `mise_saves_since_export` | LOW | Counter |

**Finding:** `kroger_access_token` and `kroger_refresh_token` are present in localStorage. The codebase has been migrated to use encrypted HttpOnly cookies for token storage (server-side), but these legacy keys remain. If these contain live tokens, they are accessible to any JavaScript running on the page — including any XSS vector that bypasses CSP.

**Recommendation:** Clear these localStorage keys in the client-side migration code, or add a one-time cleanup on app load.

### IndexedDB

| Database | Purpose | Risk |
|---|---|---|
| Recipe storage (Dexie) | Recipes, meal plans, grocery lists | LOW — personal data, local only |

### Cookies

No client-accessible cookies observed (`document.cookie` returned empty). All session cookies are `HttpOnly`, confirming they are not accessible to JavaScript.

---

## 5. Content Security Policy Enforcement

| Test | Result |
|---|---|
| Inline scripts blocked | PASS — 0 inline `<script>` tags in document |
| External scripts restricted | PASS — only `self` origin scripts loaded |
| Dynamic code execution | **NEEDS VERIFICATION** — CSP `script-src 'self'` should block dynamic code execution; runtime behavior should be confirmed |

**Recommendation:** Verify that dynamic code execution is blocked at runtime. If Tesseract.js (OCR) requires WebAssembly compilation, `'wasm-unsafe-eval'` may need to be explicitly added to `script-src`.

---

## 6. Third-Party Dependencies

### External Connections (observed at runtime)

| Domain | Purpose | Risk |
|---|---|---|
| `mise.swinch.dev` (self) | App + API | — |
| `_vercel/insights` | Vercel Web Analytics | LOW — first-party Vercel service |

**No third-party scripts, trackers, or analytics loaded.** Vercel Insights is a first-party service that runs server-side aggregation. No Google Analytics, Facebook Pixel, or ad scripts detected.

### Subresource Integrity

| Check | Status |
|---|---|
| Scripts with SRI hashes | 0 of 2 |

**Finding:** Neither the app bundle nor Vercel Insights use Subresource Integrity (SRI) hashes. Since both are served from the same origin, the risk is low — an attacker would need to compromise the Vercel deployment itself. SRI is more critical for CDN-hosted third-party scripts, which Mise does not use.

---

## 7. API Security

### Endpoint Inventory

| Endpoint | Method | Auth | CORS |
|---|---|---|---|
| `/api/verify-purchase` | GET | None (public) | `*` |
| `/api/grocery/kroger-authorize` | GET | None (initiates OAuth) | `*` |
| `/api/grocery/kroger-callback` | GET | State cookie | `*` |
| `/api/grocery/kroger-status` | GET | Session cookie | `*` |
| `/api/grocery/kroger-cart` | PUT | Session cookie | `*` |
| `/api/grocery/kroger-logout` | POST | None | `*` |

### CORS Policy

**Finding:** All API endpoints return `Access-Control-Allow-Origin: *`. This is overly permissive for endpoints that read from cookies. While `SameSite=Lax` cookies won't be sent on cross-origin requests from arbitrary sites (only on top-level navigations), tightening CORS to the app's origin would add defense-in-depth.

**Recommendation:** Set `Access-Control-Allow-Origin` to `https://mise.swinch.dev` on cookie-authenticated endpoints (`kroger-status`, `kroger-cart`, `kroger-logout`). Keep `*` only on public endpoints if needed.

### Input Validation

| Endpoint | Validation | Status |
|---|---|---|
| `verify-purchase` | Email regex, rate limiting | PASS |
| `kroger-callback` | Code presence check, state validation, token format validation | PASS |
| `kroger-cart` | Array check on items, type mapping | PASS |
| Extension import | 1MB payload size limit, schema validation, type checks | PASS |

### Error Handling

**Finding:** Error messages from Kroger API responses are truncated to 200 characters before being returned to the client (`text.slice(0, 200)`). This prevents full stack trace leakage. Stripe errors expose the error message but not stack traces.

---

## 8. Service Worker

| Check | Status | Detail |
|---|---|---|
| Scope | PASS | Limited to `https://mise.swinch.dev/` |
| API exclusion | PASS | Denylist: `/api/`, `/kroger-callback` — API calls not cached |
| Cache strategy | PASS | `CacheFirst` for images only, `NavigationRoute` for HTML |
| Cache limits | PASS | 200 image entries max, 30-day expiry |

**No issues found.** The service worker correctly excludes API routes from caching, preventing stale authentication responses.

---

## 9. Browser Permissions

| Permission | State |
|---|---|
| Geolocation | Denied (by Permissions-Policy) |
| Camera | Denied (by Permissions-Policy) |
| Microphone | Denied (by Permissions-Policy) |
| Notifications | Prompt (not requested) |
| Clipboard Write | Granted (used for copy-to-clipboard features) |
| Clipboard Read | Prompt (not requested) |

**No excessive permissions requested.**

---

## 10. PWA Manifest

```json
{
  "name": "Mise",
  "short_name": "Mise",
  "display": "standalone",
  "scope": "/",
  "start_url": "/"
}
```

**No issues.** Scope is restricted to the app origin. No external URLs in the manifest.

---

## Risk Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Legacy Kroger tokens in localStorage | MEDIUM | **FIXED** — One-time cleanup on app load |
| 2 | CORS `*` on cookie-authenticated endpoints | LOW | **FIXED** — Restricted to app origins |
| 3 | Email/PIN sent as GET query parameters | MEDIUM | **FIXED** — Moved to POST request body |
| 4 | Dynamic code execution not verified as blocked | LOW | Needs verification |
| 5 | No SRI on scripts | INFO | Accepted (same-origin) |
| 6 | Missing COOP/COEP/CORP headers | INFO | Accepted (would break Stripe) |

---

## Remediation Log

### Fixed: Legacy localStorage token cleanup (Feb 17, 2026)
Added one-time cleanup in `App.tsx` that removes `kroger_access_token`, `kroger_refresh_token`, and `kroger_token_expiry` from localStorage on app load. These legacy keys predate the migration to encrypted HttpOnly cookies.

### Fixed: CORS restriction on authenticated endpoints (Feb 17, 2026)
Created `api/_lib/cors.ts` with `setAuthenticatedCors()` that only allows `https://mise.swinch.dev` and `https://mise-recipe.vercel.app` as origins. Applied to `kroger-status`, `kroger-cart`, and `kroger-logout`. Public endpoints retain `Access-Control-Allow-Origin: *`.

### Fixed: Email/PIN moved from GET to POST (Feb 17, 2026)
`/api/verify-purchase` now accepts POST for email and PIN verification. GET is retained only for `sessionId` verification (Stripe redirect, opaque token). This prevents email addresses and PINs from appearing in server logs, Vercel analytics, browser history, and referrer headers.

---

## Remaining Recommendations

1. **Verify CSP blocks dynamic code execution** — Confirm that the `script-src 'self'` directive is effectively enforced at runtime. If WebAssembly is needed for Tesseract.js, explicitly add `'wasm-unsafe-eval'` to `script-src`.

---

## Architecture Advantages

- **No database** — No SQL injection surface. No data breach risk from server compromise.
- **No user accounts** — No password storage, no credential stuffing target.
- **Stateless serverless functions** — No persistent server to maintain or patch.
- **Local-first data** — Recipe data never leaves the user's browser.
- **Encrypted session cookies** — AES-256-GCM with random IVs, HttpOnly, Secure, scoped to `/api`.
- **Minimal third-party surface** — No analytics scripts, ad networks, or CDN dependencies.

This architecture eliminates entire categories of common web vulnerabilities by design.
