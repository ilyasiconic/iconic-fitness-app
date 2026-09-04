import { createHmac, timingSafeEqual } from "node:crypto";

// ── Razorpay payment gateway (razorpay.com, Orders API + Standard Checkout) ──
//
// Flow:
//   1. Create an order server-side: POST api.razorpay.com/v1/orders
//      (basic auth key_id:key_secret, amount in PAISE).
//   2. Render Razorpay's hosted Standard Checkout (checkout.js) with that
//      order_id and redirect:true + callback_url.
//   3. On success Razorpay POSTs razorpay_payment_id / razorpay_order_id /
//      razorpay_signature to the callback; we verify
//      HMAC_SHA256(order_id + "|" + payment_id, key_secret) === signature.
//      On failure (redirect mode) it POSTs error[...] fields instead.

const API_BASE = "https://api.razorpay.com/v1";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function razorpayKeyId(): string {
  return env("RAZORPAY_KEY_ID");
}

export function razorpayConfigured(): boolean {
  return Boolean(env("RAZORPAY_KEY_ID") && env("RAZORPAY_KEY_SECRET"));
}

function authHeader(): string {
  return (
    "Basic " +
    Buffer.from(`${env("RAZORPAY_KEY_ID")}:${env("RAZORPAY_KEY_SECRET")}`).toString(
      "base64",
    )
  );
}

export interface RazorpayOrder {
  id: string; // "order_..."
  amountPaise: number;
}

/** Create a Razorpay order. Returns null on failure (logged). */
export async function createRazorpayOrder(input: {
  amountInr: number; // whole rupees
  receipt: string; // our order reference, shows in the Razorpay dashboard
}): Promise<RazorpayOrder | null> {
  try {
    const res = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(),
      },
      body: JSON.stringify({
        amount: Math.round(input.amountInr * 100),
        currency: "INR",
        receipt: input.receipt.slice(0, 40),
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[razorpay] order create failed: ${res.status} ${text.slice(0, 300)}`);
      return null;
    }
    const json = JSON.parse(text) as { id?: string; amount?: number };
    if (!json.id || typeof json.amount !== "number") {
      console.error("[razorpay] order create: malformed response");
      return null;
    }
    return { id: json.id, amountPaise: json.amount };
  } catch (err) {
    console.error("[razorpay] order create error:", err);
    return null;
  }
}

/** Verify Razorpay's payment signature (constant-time compare). */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  if (!orderId || !paymentId || !signature) return false;
  const expected = createHmac("sha256", env("RAZORPAY_KEY_SECRET"))
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
