import { format } from "date-fns";
import { ShieldAlert } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { isAdminEmail } from "@/backend/admin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { formatUsd } from "@/shared/backlink-packages";

export const metadata = { title: "Admin · Backlink orders" };

type LinkRow = { url?: string; anchorText?: string };

export default async function AdminBacklinkOrdersPage() {
  const { user } = await requireWorkspace({ skipOnboardingCheck: true });

  if (!isAdminEmail(user.email)) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <CardTitle>Admin only</CardTitle>
            </div>
            <CardDescription>
              You don&apos;t have access to this page. Add your email to{" "}
              <code className="rounded bg-muted px-1">ADMIN_EMAILS</code> to enable it.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const orders = await prisma.backlinkOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { workspace: { select: { name: true, slug: true } } },
  });

  const paid = orders.filter((o) => o.status === "PAID");
  const revenueCents = paid.reduce((sum, o) => sum + o.amountUsdCents, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Backlink orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All backlink orders across every workspace.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total orders" value={orders.length.toString()} />
        <Stat label="Paid orders" value={paid.length.toString()} />
        <Stat label="Paid revenue" value={formatUsd(revenueCents)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent orders</CardTitle>
          <CardDescription>Most recent 200 orders.</CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No orders yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Package</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 pr-4 font-medium">Submitter</th>
                    <th className="py-2 pr-4 font-medium">Workspace</th>
                    <th className="py-2 pr-4 font-medium">URLs</th>
                    <th className="py-2 pr-4 font-medium">Via</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.map((o) => {
                    const links = Array.isArray(o.links)
                      ? (o.links as LinkRow[])
                      : [];
                    return (
                      <tr key={o.id} className="align-top">
                        <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                          {format(o.createdAt, "MMM d · HH:mm")}
                        </td>
                        <td className="py-2 pr-4">
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
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">{o.packageLabel}</td>
                        <td className="py-2 pr-4 whitespace-nowrap font-medium">
                          {formatUsd(o.amountUsdCents)}
                        </td>
                        <td className="py-2 pr-4">{o.contactEmail ?? "—"}</td>
                        <td className="py-2 pr-4">{o.workspace?.name ?? "—"}</td>
                        <td className="py-2 pr-4">
                          <div className="max-w-xs space-y-0.5">
                            {links.length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              links.map((l, i) => (
                                <div key={i} className="truncate font-mono text-xs">
                                  {l.url}
                                  {l.anchorText ? (
                                    <span className="text-muted-foreground">
                                      {" "}
                                      — {l.anchorText}
                                    </span>
                                  ) : null}
                                </div>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap capitalize text-muted-foreground">
                          {o.provider ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
