import { format } from "date-fns";
import { CheckCircle2, Link2, XCircle } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { razorpayKeyId, razorpayReady } from "@/backend/payments/razorpay";
import { paypalClientId, paypalReady } from "@/backend/payments/paypal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { formatUsd } from "@/shared/backlink-packages";
import { BacklinkOrderForm } from "./order-form";

export const metadata = { title: "Backlink Marketplace — Xicmo" };

type LinkRow = { url?: string; anchorText?: string };

export default async function BacklinkMarketplacePage(props: {
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ workspace, user }, { status }] = await Promise.all([
    requireWorkspace(),
    props.searchParams,
  ]);

  const orders = await prisma.backlinkOrder.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const rzp = razorpayReady();
  const pp = paypalReady();

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-2">
        <Link2 className="mt-1 h-5 w-5 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Premium Backlinks
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Buy clean, contextual, niche-matched backlinks. Pick a package, add
            your target URLs and anchor text, and check out securely.
          </p>
        </div>
      </div>

      {status === "success" ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          Payment received — your order is in. We&apos;ll start placing your links
          shortly.
        </div>
      ) : status === "canceled" ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <XCircle className="h-4 w-4" />
          Checkout canceled — no charge was made. You can try again anytime.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Order backlinks</CardTitle>
            <CardDescription>
              Three quick steps: choose a package, add your links, then pay.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BacklinkOrderForm
              razorpayReady={rzp}
              paypalReady={pp}
              razorpayKeyId={razorpayKeyId() ?? null}
              paypalClientId={paypalClientId() ?? null}
              user={{ name: user.name, email: user.email }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your orders</CardTitle>
            <CardDescription>Recent backlink purchases.</CardDescription>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
                No orders yet. Your first purchase will show up here.
              </p>
            ) : (
              <ul className="divide-y">
                {orders.map((o) => {
                  const links = Array.isArray(o.links)
                    ? (o.links as LinkRow[])
                    : [];
                  return (
                    <li key={o.id} className="flex items-start justify-between py-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{o.packageLabel}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatUsd(o.amountUsdCents)}</span>
                          <span>·</span>
                          <span>
                            {links.length} URL{links.length === 1 ? "" : "s"}
                          </span>
                          <span>·</span>
                          <span>{format(o.createdAt, "MMM d · HH:mm")}</span>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          "text-[10px] " +
                          (o.status === "PAID"
                            ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                            : o.status === "FAILED"
                              ? "border-red-500/40 text-red-600 dark:text-red-400"
                              : "")
                        }
                      >
                        {o.status === "PENDING_PAYMENT"
                          ? "pending"
                          : o.status.toLowerCase()}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
