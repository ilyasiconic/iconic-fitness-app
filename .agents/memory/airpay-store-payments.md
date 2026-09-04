---
name: Airpay store payment flow
description: Airpay v4 hosted checkout for the product store — endpoints, crypto quirks, and the unresolved credential blocker.
---

# Airpay store payments

- Flow: checkout creates order `payment_pending` + 48-hex token → `/api/pay/store/:token/start` renders auto-submit form to Airpay hosted checkout → `/api/pay/store/return` (POST+GET) decrypts encdata, one-shot flips pending→placed (wallet debit + referral credit inside try/catch, idempotent per refType/refId) or payment_failed.
- **oauth2 endpoint only accepts form-encoded bodies** (`application/x-www-form-urlencoded`); JSON → 403 "Parameters are required".
- Crypto: AES-256-CBC, key = md5hex(username~:~password) as 32 ASCII bytes; encdata = 16-char hex IV + base64(ct); checksum = sha256(sorted-values + UTC date). Docs' oauth sample uses the dashboard `secretKey` directly — code tries BOTH keys (`aesKeyCandidates`).
- RESOLVED (Aug 13 2026): after the user got fresh credentials from Airpay (and added AIRPAY_API_KEY, 16 chars), oauth decrypts fine with the standard md5(user~:~pass) key — earlier failures were wrong creds on Airpay's side, not the crypto. Note: a newly added secret needs a WORKFLOW RESTART before the server sees it (and a fresh shell; first save came through empty — re-request if length 0).
- **Why:** wrong-key decrypt = silent 502 at /start; don't re-debug the crypto — the code matches the official PHP kit exactly.
- Security hardening done after review: legacy plain securehash fallback REMOVED (forgeable); return handler binds echoed amount+merchant to the pending order; admin PATCH cannot set payment_* statuses or flip unpaid orders except to cancelled; ensureOrderPaymentColumns throws (checkout 503) instead of proceeding on a maybe-missing schema.
- Return URL to configure in Airpay dashboard: https://iconicfitnessindia.com/api/pay/store/return
- **Hosted checkout page (Aug 13 2026):** docs' `/v4/checkout/index.php` 404s — the real page is `https://payments.airpay.co.in/pay/v4/index.php?token=...` (per Airpay's official PHP/Node kits). Form fields: privatekey, merchant_id (NOT mercid), apyVer:"", encdata, checksum, chmod:"". Payload must carry BOTH `currency` and `currency_code` (356) + `iso_currency`. Airpay rejects long order ids — send 20-hex token prefix; return handler matches via `like(token, prefix%)`.
- **UNRESOLVED blocker:** with kit-faithful requests, Airpay still errors — encdata with md5(u~:~p) key → "Merchant Key Authentication Failed"; with secretKey → "Invalid checksum" (~25 combos of keys/checksums/privatekeys probed; garbage privatekey → "Invalid Domain", so pk=sha256(secret@user:|:pass) IS recognized). Conclusion: merchant-side config/creds mismatch — Airpay support must verify username/password/secret for merchant + enable hosted checkout/domain. Don't re-brute-force formulas.

## SOLVED (Aug 14 2026): checkout works
- privatekey = sha256(AIRPAY_API_KEY@user:|:pass) — the "secret" in the formula is the dashboard **API key**, NOT AIRPAY_SECRET_KEY (that gives "Merchant Key Authentication Failed").
- Payload must be KIT-EXACT: buyer_* fields, amount, orderid, iso_currency, currency_code, merchant_id — NO `currency`, NO successurl/failureurl (return URL configured in Airpay dashboard by their support; ours = https://iconicfitnessindia.com/api/pay/store/return).
- Form fields exactly: privatekey, merchant_id, checksum, encdata, chmod — NO apyVer.
- encdata key stays md5(user~:~pass). "Invalid Domain" = missing/wrong Referer (domain whitelist); browser posts from the site so prod is fine.
- Verified end-to-end in dev: Airpay payment page reached via /pay/store/:token/start.

## NOT actually solved (Aug 14 2026) — blocked on Airpay
- The 15kb "payment page" is a Next.js SHELL — server-side fetch can't tell success from error. In a real browser (Playwright tester) it ALWAYS lands on payments.airpay.co.in/error.php "Payment Error / Oops!" with NO payment options; no /pay/payment_api.php XHR fires, Airpay's own assets 401.
- Real rejection reason extracted by re-POSTing a used orderid (Airpay returns a 2715-byte auto-submit error form whose `msg` field is readable): **"Transaction Update Failed - Merchant Transaction Id not valid"** → orderid must be NUMERIC. Fixed: `airpay_order_ref` column (additive DDL), ref = `${order.id}${Date.now()}`, assigned ONCE per order (conditional update WHERE ref='', re-read after; never overwrite — an overwritten ref orphans a paid return). Return handler matches eq(airpayOrderRef), regex `/^[0-9]{6,32}$/`.
- Even with numeric ids, ALL 3 privatekey secret candidates (API_KEY default, SECRET_KEY, CLIENT_SECRET via `AIRPAY_PK_SECRET` env selector in airpayPrivateKey) render the same generic error page. OAuth token succeeds, so creds are valid. Conclusion: merchant-account/config problem on Airpay's side (payment methods not enabled for MID 363086?) — evidence sent to user to forward to Airpay support. Don't re-brute-force request formats; the payload is kit-exact (compared field-by-field against their official Node kit at docs.airpay.co.in/kits/v4/airpay_nodejs_v4.rar).
- Debug trick: to read Airpay's real error, POST the checkout form twice server-side — the duplicate returns the readable error form; error.php shows the msg as visible text.

## Aug 14 2026 — Airpay WORKING again; Razorpay kept as dormant fallback
- User confirmed Airpay checkout works now (their side got fixed). Store routes use Airpay.
- A complete Razorpay integration exists dormant: `artifacts/api-server/src/lib/razorpay.ts` (orders API + HMAC signature verify) plus `razorpay_order_id`/`razorpay_payment_id` columns in schema+DDL. To switch: swap imports/flow in store routes (see commit "Implement Razorpay integration", later reverted).
- RAZORPAY_KEY_ID/SECRET secrets exist but were rejected 401 by Razorpay (user pasted a mismatched test key pair) — must be re-collected before any switch.
