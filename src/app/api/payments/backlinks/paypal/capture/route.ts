import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/db";
import {
  markBacklinkOrderPaid,
  resolveAuthedWorkspace,
} from "@/backend/payments/backlink-orders";
import { capturePaypalOrder } from "@/backend/payments/paypal";

export const runtime = "nodejs";

const schema = z.object({
  orderId: z.string().min(1),
  paypalOrderId: z.string().min(1),
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
  const { orderId, paypalOrderId } = parsed.data;

  // Confirm the PayPal order belongs to our pending order before capturing.
  const order = await prisma.backlinkOrder.findUnique({ where: { id: orderId } });
  if (!order || order.workspaceId !== me.workspaceId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.providerOrderId && order.providerOrderId !== paypalOrderId) {
    return NextResponse.json({ error: "Order mismatch" }, { status: 400 });
  }

  let capture;
  try {
    capture = await capturePaypalOrder(paypalOrderId);
  } catch (err) {
    console.error("[backlinks/paypal/capture] error:", err);
    return NextResponse.json({ error: "Capture failed" }, { status: 502 });
  }

  if (!capture.completed) {
    return NextResponse.json({ error: "Payment not completed" }, { status: 402 });
  }

  const result = await markBacklinkOrderPaid({
    orderId,
    workspaceId: me.workspaceId,
    provider: "paypal",
    providerPaymentId: capture.captureId ?? paypalOrderId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
