/**
 * Shared helpers for the backlink-order API routes: auth → workspace resolution,
 * link validation, and the "mark paid + notify" transition.
 */
import { z } from "zod";
import { auth } from "@/backend/auth";
import { prisma } from "@/backend/db";
import { notifyBacklinkOrderPaid } from "./backlink-notify";

export const linkSchema = z.object({
  url: z.string().trim().min(3, "Enter a URL"),
  anchorText: z.string().trim().max(200).optional().default(""),
});

export const createOrderSchema = z.object({
  packageKey: z.string().min(1),
  provider: z.enum(["razorpay", "paypal"]),
  links: z.array(linkSchema).min(1, "Add at least one URL"),
});

export type AuthedWorkspace = {
  workspaceId: string;
  userId: string;
  email: string;
  name: string | null;
};

/** Resolve the signed-in user's primary workspace, or null when unauthenticated. */
export async function resolveAuthedWorkspace(): Promise<AuthedWorkspace | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { workspace: true, user: true },
  });
  if (!membership) return null;

  return {
    workspaceId: membership.workspace.id,
    userId: membership.user.id,
    email: membership.user.email,
    name: membership.user.name,
  };
}

/**
 * Idempotently mark a PENDING order as PAID and fire the notification email.
 * No-ops (returns the row) if the order is already PAID, so a double webhook /
 * verify callback never double-sends.
 */
export async function markBacklinkOrderPaid(args: {
  orderId: string;
  workspaceId: string;
  provider: string;
  providerPaymentId: string;
}): Promise<{ ok: boolean; alreadyPaid?: boolean }> {
  const order = await prisma.backlinkOrder.findUnique({ where: { id: args.orderId } });
  if (!order || order.workspaceId !== args.workspaceId) {
    return { ok: false };
  }
  if (order.status === "PAID") {
    return { ok: true, alreadyPaid: true };
  }

  const updated = await prisma.backlinkOrder.update({
    where: { id: order.id },
    data: {
      status: "PAID",
      provider: args.provider,
      providerPaymentId: args.providerPaymentId,
      paidAt: new Date(),
    },
  });

  try {
    await notifyBacklinkOrderPaid(updated);
  } catch (err) {
    // Notification failures must not fail the payment confirmation.
    console.error("[backlink-order] notify failed:", err);
  }

  return { ok: true };
}
