import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  markBacklinkOrderPaid,
  resolveAuthedWorkspace,
} from "@/backend/payments/backlink-orders";
import { verifyRazorpaySignature } from "@/backend/payments/razorpay";

export const runtime = "nodejs";

const schema = z.object({
  orderId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const me = await resolveAuthedWorkspace();
  if (!me) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const data = parsed.data;

  const valid = verifyRazorpaySignature({
    razorpayOrderId: data.razorpay_order_id,
    razorpayPaymentId: data.razorpay_payment_id,
    signature: data.razorpay_signature,
  });
  if (!valid) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 });
  }

  const result = await markBacklinkOrderPaid({
    orderId: data.orderId,
    workspaceId: me.workspaceId,
    provider: "razorpay",
    providerPaymentId: data.razorpay_payment_id,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
