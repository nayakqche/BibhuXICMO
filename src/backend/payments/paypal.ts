/**
 * PayPal payments for the premium-backlink checkout.
 *
 * Uses the REST v2 Orders API directly (no SDK dependency):
 *  - getPaypalAccessToken → OAuth2 client-credentials
 *  - createPaypalOrder → POST /v2/checkout/orders (intent CAPTURE)
 *  - capturePaypalOrder → POST /v2/checkout/orders/{id}/capture
 *
 * Base URL is chosen by PAYPAL_ENV ("sandbox" | "live").
 */
import { env } from "@/shared/env";

function paypalBaseUrl(): string {
  return env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function paypalReady(): boolean {
  return Boolean(env.PAYPAL_CLIENT_ID?.trim() && env.PAYPAL_CLIENT_SECRET?.trim());
}

/** Public client id sent to the browser (falls back to the server client id). */
export function paypalClientId(): string | undefined {
  return env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() || env.PAYPAL_CLIENT_ID?.trim();
}

async function getPaypalAccessToken(): Promise<string> {
  const id = env.PAYPAL_CLIENT_ID?.trim();
  const secret = env.PAYPAL_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error("PayPal is not configured");

  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`PayPal auth failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

/** Create a CAPTURE-intent order. `amountUsdCents` → "450.00" value string. */
export async function createPaypalOrder(args: {
  amountUsdCents: number;
  referenceId: string;
  description?: string;
}): Promise<{ id: string }> {
  const token = await getPaypalAccessToken();
  const value = (args.amountUsdCents / 100).toFixed(2);

  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: args.referenceId,
          description: args.description?.slice(0, 127),
          amount: { currency_code: "USD", value },
        },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`PayPal create order failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { id: string };
  return { id: json.id };
}

export type PaypalCaptureResult = {
  completed: boolean;
  captureId: string | null;
};

/** Capture an approved order. Returns whether it COMPLETED + the capture id. */
export async function capturePaypalOrder(paypalOrderId: string): Promise<PaypalCaptureResult> {
  const token = await getPaypalAccessToken();
  const res = await fetch(
    `${paypalBaseUrl()}/v2/checkout/orders/${paypalOrderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`PayPal capture failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    status?: string;
    purchase_units?: Array<{
      payments?: { captures?: Array<{ id?: string; status?: string }> };
    }>;
  };
  const capture = json.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    completed: json.status === "COMPLETED" || capture?.status === "COMPLETED",
    captureId: capture?.id ?? null,
  };
}
