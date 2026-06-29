import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/backend/db";
import {
  razorpayWebhookReady,
  verifyRazorpayWebhook,
} from "@/backend/payments/razorpay";
import { markBacklinkOrderPaid } from "@/backend/payments/backlink-orders";

export const runtime = "nodejs";

/**
 * Backup confirmation path for Razorpay. The browser `verify` callback is the
 * primary way orders flip to PAID; this webhook catches cases where the user
 * closed the tab before the callback ran. `markBacklinkOrderPaid` is idempotent,
 * so a double-confirmation never double-notifies.
 */
export async function POST(req: NextRequest) {
  if (!razorpayWebhookReady()) {
    return NextResponse.json({ received: false, reason: "unconfigured" }, { status: 200 });
  }

  const signature = req.headers.get("x-razorpay-signature");
  const raw = await req.text();
  if (!verifyRazorpayWebhook(raw, signature)) {
    return NextResponse.json({ error: "signature" }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const payment = event.payload?.payment?.entity;
      const providerOrderId = payment?.order_id;
      const paymentId = payment?.id;
      if (providerOrderId && paymentId) {
        const order = await prisma.backlinkOrder.findFirst({
          where: { providerOrderId },
        });
        if (order) {
          await markBacklinkOrderPaid({
            orderId: order.id,
            workspaceId: order.workspaceId,
            provider: "razorpay",
            providerPaymentId: paymentId,
          });
        }
      }
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[razorpay/webhook] handler error:", err);
    return NextResponse.json({ error: "handler" }, { status: 500 });
  }
}
