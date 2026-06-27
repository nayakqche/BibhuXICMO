/**
 * Razorpay payments for the premium-backlink checkout.
 *
 * Uses the REST API + Node `crypto` directly (no SDK dependency):
 *  - createRazorpayOrder → POST /v1/orders (Basic auth key_id:key_secret)
 *  - verifyRazorpaySignature → HMAC-SHA256(orderId|paymentId, key_secret)
 *
 * Both server secret (RAZORPAY_KEY_SECRET) and the public key id
 * (NEXT_PUBLIC_RAZORPAY_KEY_ID / RAZORPAY_KEY_ID) are required for a working
 * checkout. `razorpayReady()` reflects that.
 */
import crypto from "node:crypto";
import { env } from "@/shared/env";

const RAZORPAY_API = "https://api.razorpay.com/v1";

/** Public key id sent to the browser (falls back to the server key id). */
export function razorpayKeyId(): string | undefined {
  return env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || env.RAZORPAY_KEY_ID?.trim();
}

export function razorpayReady(): boolean {
  return Boolean(razorpayKeyId() && env.RAZORPAY_KEY_SECRET?.trim());
}

export type RazorpayOrder = {
  id: string;
  amount: number; // in the smallest currency unit (cents for USD)
  currency: string;
  receipt?: string;
  status: string;
};

export async function createRazorpayOrder(args: {
  amountCents: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const keyId = env.RAZORPAY_KEY_ID?.trim() || env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured");
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(`${RAZORPAY_API}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: args.amountCents,
      currency: args.currency ?? "USD",
      receipt: args.receipt,
      notes: args.notes,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Razorpay order failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as RazorpayOrder;
}

export function razorpayWebhookReady(): boolean {
  return Boolean(env.RAZORPAY_WEBHOOK_SECRET?.trim());
}

/**
 * Verify a Razorpay webhook. The signature header is HMAC-SHA256 of the raw
 * request body using the **webhook secret** (distinct from the key secret).
 */
export function verifyRazorpayWebhook(rawBody: string, signature: string | null): boolean {
  const secret = env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Verify the checkout callback. Razorpay signs `${order_id}|${payment_id}` with
 * the key secret; a matching HMAC proves the payment is genuine.
 */
export function verifyRazorpaySignature(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): boolean {
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  if (!keySecret) return false;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${args.razorpayOrderId}|${args.razorpayPaymentId}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(args.signature)
    );
  } catch {
    return false;
  }
}
