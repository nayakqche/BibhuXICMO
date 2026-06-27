import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/backend/db";
import { getBacklinkPackage } from "@/shared/backlink-packages";
import {
  createOrderSchema,
  resolveAuthedWorkspace,
} from "@/backend/payments/backlink-orders";
import {
  createRazorpayOrder,
  razorpayKeyId,
  razorpayReady,
} from "@/backend/payments/razorpay";
import { createPaypalOrder, paypalReady } from "@/backend/payments/paypal";

export const runtime = "nodejs";

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

  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const { packageKey, provider, links } = parsed.data;

  // Resolve the package server-side — never trust a client-sent price.
  const pkg = getBacklinkPackage(packageKey);
  if (!pkg) {
    return NextResponse.json({ error: "Unknown package" }, { status: 400 });
  }

  if (provider === "razorpay" && !razorpayReady()) {
    return NextResponse.json({ error: "Razorpay is not configured" }, { status: 503 });
  }
  if (provider === "paypal" && !paypalReady()) {
    return NextResponse.json({ error: "PayPal is not configured" }, { status: 503 });
  }

  // Persist a pending order first so the payment can be reconciled to it later.
  const order = await prisma.backlinkOrder.create({
    data: {
      workspaceId: me.workspaceId,
      packageKey: pkg.key,
      packageLabel: pkg.label,
      backlinkCount: pkg.backlinkCount,
      amountUsdCents: pkg.amountUsdCents,
      currency: "USD",
      links,
      provider,
      contactEmail: me.email,
    },
  });

  try {
    if (provider === "razorpay") {
      const rzpOrder = await createRazorpayOrder({
        amountCents: pkg.amountUsdCents,
        currency: "USD",
        receipt: order.id,
        notes: { backlinkOrderId: order.id, workspaceId: me.workspaceId },
      });
      await prisma.backlinkOrder.update({
        where: { id: order.id },
        data: { providerOrderId: rzpOrder.id },
      });
      return NextResponse.json({
        orderId: order.id,
        razorpay: {
          keyId: razorpayKeyId(),
          orderId: rzpOrder.id,
          amount: rzpOrder.amount,
          currency: rzpOrder.currency,
          name: pkg.label,
        },
        prefill: { name: me.name ?? "", email: me.email },
      });
    }

    // PayPal
    const ppOrder = await createPaypalOrder({
      amountUsdCents: pkg.amountUsdCents,
      referenceId: order.id,
      description: `${pkg.label} — premium backlinks`,
    });
    await prisma.backlinkOrder.update({
      where: { id: order.id },
      data: { providerOrderId: ppOrder.id },
    });
    return NextResponse.json({ orderId: order.id, paypalOrderId: ppOrder.id });
  } catch (err) {
    await prisma.backlinkOrder
      .update({ where: { id: order.id }, data: { status: "FAILED" } })
      .catch(() => {});
    console.error("[backlinks/create] provider error:", err);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 502 }
    );
  }
}
