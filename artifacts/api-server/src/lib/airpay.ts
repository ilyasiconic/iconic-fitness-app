import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// ── Airpay payment gateway (docs.airpay.co.in, API v4 "Dash Checkout") ──────
//
// Flow:
//   1. oauth2 token   → POST kraken.airpay.co.in/airpay/pay/v4/api/oauth2
//   2. hosted checkout→ auto-submit an HTML form to
//                       payments.airpay.co.in/v4/checkout/index.php?token=<t>
//   3. Airpay POSTs the result back to our return URL as `encdata` we decrypt.
//
// Crypto (per Airpay v4 docs):
//   key       = md5(username + "~:~" + password)            (32 hex chars)
//   cipher    = AES-256-CBC, PKCS5 padding
//   encdata   = <16-char random IV><base64(ciphertext)>
//   checksum  = sha256(concat(values sorted by key) + YYYY-MM-DD)
//   privatekey= sha256(secret + "@" + username + ":|:" + password)

const OAUTH_URL = "https://kraken.airpay.co.in/airpay/pay/v4/api/oauth2";
// NOTE: the docs page shows /v4/checkout/index.php but that path 404s in
// production — Airpay's own official Node.js integration kit posts to
// /pay/v4/index.php, which is the working hosted payment page.
const CHECKOUT_URL = "https://payments.airpay.co.in/pay/v4/index.php";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function airpayConfigured(): boolean {
  return Boolean(
    env("AIRPAY_MERCHANT_ID") &&
      env("AIRPAY_USERNAME") &&
      env("AIRPAY_PASSWORD") &&
      env("AIRPAY_CLIENT_ID") &&
      env("AIRPAY_CLIENT_SECRET") &&
      env("AIRPAY_API_KEY"),
  );
}

/** AES key: md5 hex digest of "username~:~password" (32 bytes as ASCII). */
function aesKey(): Buffer {
  const digest = createHash("md5")
    .update(`${env("AIRPAY_USERNAME")}~:~${env("AIRPAY_PASSWORD")}`)
    .digest("hex");
  return Buffer.from(digest, "utf8");
}

/** All plausible AES-256 keys per Airpay docs: md5(user~:~pass), plus the
 *  dashboard secret key when it is exactly 32 chars (the oauth2 sample code
 *  encrypts/decrypts with `secretKey` directly). */
function aesKeyCandidates(): Buffer[] {
  const keys = [aesKey()];
  const secret = env("AIRPAY_SECRET_KEY");
  if (secret.length === 32) keys.push(Buffer.from(secret, "utf8"));
  return keys;
}

export function airpayEncrypt(
  payload: Record<string, unknown>,
  key: Buffer = aesKey(),
): string {
  const iv = randomBytes(8).toString("hex"); // 16 ASCII chars
  const cipher = createCipheriv("aes-256-cbc", key, Buffer.from(iv, "utf8"));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return iv + data.toString("base64");
}

/** Decrypt an Airpay `encdata` blob, trying every candidate key. Returns null
 *  when it can't be decrypted (wrong key/garbage — treat as unauthenticated). */
export function airpayDecrypt(encdata: string): Record<string, unknown> | null {
  const iv = encdata.slice(0, 16);
  const body = encdata.slice(16);
  for (const key of aesKeyCandidates()) {
    try {
      const decipher = createDecipheriv(
        "aes-256-cbc",
        key,
        Buffer.from(iv, "utf8"),
      );
      const out = Buffer.concat([
        decipher.update(Buffer.from(body, "base64")),
        decipher.final(),
      ]).toString("utf8");
      return JSON.parse(out) as Record<string, unknown>;
    } catch {
      /* try next key */
    }
  }
  return null;
}

/** sha256 of all values (sorted by key) concatenated + today's date (UTC). */
export function airpayChecksum(payload: Record<string, unknown>): string {
  const concatenated = Object.keys(payload)
    .sort()
    .map((k) => String(payload[k] ?? ""))
    .join("");
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return createHash("sha256").update(concatenated + today).digest("hex");
}

export function airpayPrivateKey(): string {
  // privatekey = sha256(secret + "@" + username + ":|:" + password).
  // Which credential is "the secret" is ambiguous in Airpay's docs; the env
  // var AIRPAY_PK_SECRET (name of another AIRPAY_* env var, default
  // AIRPAY_API_KEY) selects it so we can probe candidates without code edits.
  const source = env("AIRPAY_PK_SECRET") || "AIRPAY_API_KEY";
  return createHash("sha256")
    .update(
      `${env(source)}@${env("AIRPAY_USERNAME")}:|:${env("AIRPAY_PASSWORD")}`,
    )
    .digest("hex");
}

/** Fetch a short-lived (~5 min) OAuth2 access token. Returns null on failure. */
export async function airpayAccessToken(): Promise<string | null> {
  const payload = {
    client_id: env("AIRPAY_CLIENT_ID"),
    client_secret: env("AIRPAY_CLIENT_SECRET"),
    grant_type: "client_credentials",
    merchant_id: env("AIRPAY_MERCHANT_ID"),
  };
  let lastError = "";
  // The docs' oauth2 sample encrypts with the dashboard secret key, while the
  // generic encryption guide says md5(user~:~pass) — try each until one works.
  for (const key of aesKeyCandidates()) {
  try {
    // Airpay's oauth2 endpoint only accepts form-encoded bodies (JSON → 403).
    const res = await fetch(OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        encdata: airpayEncrypt(payload, key),
        checksum: airpayChecksum(payload),
        merchant_id: env("AIRPAY_MERCHANT_ID"),
      }).toString(),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* non-JSON body — fall through to error log */
    }
    // The token may come back in plain JSON or wrapped in encdata.
    const direct =
      (json.access_token as string | undefined) ??
      ((json.data as Record<string, unknown> | undefined)?.access_token as
        | string
        | undefined);
    if (direct) return direct;
    const enc =
      (json.response as string | undefined) ??
      (json.encdata as string | undefined) ??
      ((json.data as Record<string, unknown> | undefined)?.encdata as
        | string
        | undefined);
    if (enc) {
      const dec = airpayDecrypt(enc);
      const tok =
        (dec?.access_token as string | undefined) ??
        ((dec?.data as Record<string, unknown> | undefined)?.access_token as
          | string
          | undefined);
      if (tok) return tok;
    }
    lastError = `${res.status} ${text.slice(0, 300)}`;
  } catch (err) {
    lastError = String(err);
  }
  }
  console.error("[airpay] oauth2 failed:", lastError);
  return null;
}

export interface AirpayCheckoutInput {
  orderId: string; // our alphanumeric order reference
  amountInr: number; // whole rupees
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string; // 10 digits
  buyerAddress: string;
  buyerCity: string;
  buyerPincode: string;
  successUrl: string;
  failureUrl: string;
}

export interface AirpayCheckoutForm {
  action: string; // form POST target (includes ?token=)
  fields: Record<string, string>; // hidden inputs
}

/**
 * Build the hosted-checkout form. The caller renders it as an auto-submitting
 * HTML page; the buyer lands on Airpay's payment page (UPI/cards/netbanking).
 */
export async function airpayCheckoutForm(
  input: AirpayCheckoutInput,
): Promise<AirpayCheckoutForm | null> {
  const token = await airpayAccessToken();
  if (!token) return null;
  const [firstName, ...rest] = input.buyerName.trim().split(/\s+/);
  const payload: Record<string, string> = {
    buyer_email: input.buyerEmail,
    buyer_firstname: firstName || "Customer",
    buyer_lastname: rest.join(" ") || firstName || "Customer",
    buyer_phone: input.buyerPhone,
    buyer_address: input.buyerAddress,
    buyer_city: input.buyerCity,
    buyer_state: "Karnataka",
    buyer_country: "India",
    buyer_pincode: input.buyerPincode,
    amount: input.amountInr.toFixed(2),
    orderid: input.orderId,
    // KIT-EXACT payload (verified live Aug 2026): only iso_currency +
    // currency_code — adding `currency` or successurl/failureurl makes Airpay
    // reject the request. Return URLs are configured in the Airpay merchant
    // dashboard (Airpay support set https://iconicfitnessindia.com/api/pay/store/return).
    iso_currency: "INR",
    currency_code: "356",
    merchant_id: env("AIRPAY_MERCHANT_ID"),
  };
  const checksum = airpayChecksum(payload);
  // Field names per Airpay's official Node kit: exactly privatekey,
  // merchant_id, checksum, encdata, chmod — no apyVer.
  return {
    action: `${CHECKOUT_URL}?token=${encodeURIComponent(token)}`,
    fields: {
      privatekey: airpayPrivateKey(),
      merchant_id: env("AIRPAY_MERCHANT_ID"),
      checksum,
      encdata: airpayEncrypt(payload),
      chmod: "",
    },
  };
}

/** Parsed, authenticated payment result from an Airpay return POST/GET. */
export interface AirpayReturnResult {
  ok: boolean; // payment success?
  orderId: string; // our order reference
  airpayTxnId: string;
  amountInr: number | null; // amount echoed by the gateway (null if absent)
  merchantId: string | null; // merchant id echoed by the gateway
  raw: Record<string, unknown>;
}

/** crc32 (IEEE, unsigned) — matches PHP's crc32() used by Airpay's securehash. */
function crc32Unsigned(input: string): number {
  let crc = 0xffffffff;
  const buf = Buffer.from(input, "utf8");
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Verify an Airpay return callback. Only encrypted `encdata` responses are
 * accepted — the blob must decrypt with OUR merchant key to well-formed JSON.
 * When the payload carries `ap_securehash` (per Airpay's official kit) it is
 * additionally verified: crc32(orderid:aptxnid:amount:status:message:mercid:
 * username[:vpa]) must match, or the result is rejected. The caller must
 * additionally bind amount/merchant to the pending order before settling.
 */
export function parseAirpayReturn(
  body: Record<string, unknown>,
): AirpayReturnResult | null {
  const enc =
    (body.encdata as string | undefined) ??
    (body.response as string | undefined);
  if (!enc || typeof enc !== "string") return null;
  const outer = airpayDecrypt(enc);
  if (!outer) return null;
  // The kit nests the fields under `data`; accept both shapes.
  const dec = (
    outer.data && typeof outer.data === "object" ? outer.data : outer
  ) as Record<string, unknown>;
  const statusRaw = String(
    dec.transaction_payment_status ??
      dec.transaction_status ??
      dec.status ??
      "",
  );
  const status = statusRaw.toUpperCase();
  const orderId = String(dec.orderid ?? dec.order_id ?? "");
  const airpayTxnId = String(dec.ap_transactionid ?? dec.apTransactionID ?? "");
  const amountRaw = dec.amount ?? dec.transaction_amount ?? dec.AMOUNT;
  // Verify Airpay's securehash when present (official kit formula).
  const secureHash = String(dec.ap_securehash ?? "");
  if (secureHash) {
    const message = String(dec.message ?? "");
    const chmod = String(dec.chmod ?? "").toLowerCase();
    const vpa =
      chmod === "upi" && body.CUSTOMERVPA !== undefined
        ? `:${String(body.CUSTOMERVPA).trim()}`
        : "";
    const expected = crc32Unsigned(
      `${orderId}:${airpayTxnId}:${String(amountRaw ?? "")}:${statusRaw}:${message}:${env("AIRPAY_MERCHANT_ID")}:${env("AIRPAY_USERNAME")}${vpa}`,
    ).toString();
    if (expected !== secureHash) {
      console.error(
        `[airpay] securehash MISMATCH for order ${orderId} — rejecting return`,
      );
      return null;
    }
  }
  return {
    ok: status === "SUCCESS" || status === "200",
    orderId,
    airpayTxnId,
    amountInr: amountRaw === undefined ? null : Number(amountRaw),
    merchantId: String(dec.merchant_id ?? dec.mercid ?? "") || null,
    raw: dec,
  };
}
