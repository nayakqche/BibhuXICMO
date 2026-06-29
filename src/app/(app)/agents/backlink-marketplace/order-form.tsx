"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import {
  BACKLINK_PACKAGES,
  formatUsd,
  getBacklinkPackage,
} from "@/shared/backlink-packages";

declare global {
  interface Window {
    Razorpay?: any;
    paypal?: any;
  }
}

type LinkRow = { url: string; anchorText: string };
type Step = "configure" | "review" | "pay";
type Method = "razorpay" | "paypal";

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export function BacklinkOrderForm({
  razorpayReady,
  paypalReady,
  razorpayKeyId,
  paypalClientId,
  user,
}: {
  razorpayReady: boolean;
  paypalReady: boolean;
  razorpayKeyId: string | null;
  paypalClientId: string | null;
  user: { name: string | null; email: string };
}) {
  const [step, setStep] = useState<Step>("configure");
  const [packageKey, setPackageKey] = useState<string>(BACKLINK_PACKAGES[0].key);
  const [links, setLinks] = useState<LinkRow[]>([{ url: "", anchorText: "" }]);
  const [method, setMethod] = useState<Method | null>(
    razorpayReady ? "razorpay" : paypalReady ? "paypal" : null
  );
  const [busy, setBusy] = useState(false);

  const pkg = getBacklinkPackage(packageKey) ?? BACKLINK_PACKAGES[0];
  const cleanLinks = links
    .map((l) => ({ url: l.url.trim(), anchorText: l.anchorText.trim() }))
    .filter((l) => l.url.length > 0);
  const canContinue = cleanLinks.length > 0;
  const anyProvider = razorpayReady || paypalReady;

  function updateLink(i: number, field: keyof LinkRow, value: string) {
    setLinks((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setLinks((rows) => [...rows, { url: "", anchorText: "" }]);
  }
  function removeRow(i: number) {
    setLinks((rows) => (rows.length <= 1 ? rows : rows.filter((_, idx) => idx !== i)));
  }
  function clearRows() {
    setLinks([{ url: "", anchorText: "" }]);
  }

  if (!anyProvider) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Payments aren&apos;t configured yet. Set Razorpay or PayPal keys in the
        environment to enable backlink checkout.
      </p>
    );
  }

  // ---------------------------------------------------------------- Configure
  if (step === "configure") {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Label>How many backlinks do you need?</Label>
          <div className="grid gap-2">
            {BACKLINK_PACKAGES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPackageKey(p.key)}
                className={
                  "flex items-center justify-between rounded-md border px-4 py-3 text-left transition-colors " +
                  (packageKey === p.key
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "hover:border-primary/40 hover:bg-muted/40")
                }
              >
                <span className="flex items-center gap-3">
                  <span
                    className={
                      "flex h-4 w-4 items-center justify-center rounded-full border " +
                      (packageKey === p.key
                        ? "border-primary"
                        : "border-muted-foreground/40")
                    }
                  >
                    {packageKey === p.key ? (
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    ) : null}
                  </span>
                  <span className="text-sm font-medium">{p.label}</span>
                </span>
                <span className="text-sm font-semibold">
                  {formatUsd(p.amountUsdCents)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>
            Add the URLs you want us to link to, plus the anchor text. Leave the
            anchor blank and we&apos;ll choose it.
          </Label>
          <div className="overflow-hidden rounded-md border">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>URL</span>
              <span>Anchor Text (must be English)</span>
              <span className="w-8" />
            </div>
            <div className="divide-y">
              {links.map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 px-3 py-2"
                >
                  <Input
                    value={row.url}
                    onChange={(e) => updateLink(i, "url", e.target.value)}
                    placeholder="https://example.com/page"
                  />
                  <Input
                    value={row.anchorText}
                    onChange={(e) => updateLink(i, "anchorText", e.target.value)}
                    placeholder="(optional)"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={links.length <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
                    aria-label="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
            <button
              type="button"
              onClick={clearRows}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Clear
            </button>
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          disabled={!canContinue}
          onClick={() => setStep("review")}
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // ------------------------------------------------------------------- Review
  if (step === "review") {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold">Please review your submission</h3>
          <p className="text-sm text-muted-foreground">
            Update any details before paying.
          </p>
        </div>

        <div className="space-y-4 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Package</span>
            <span className="text-sm font-semibold">
              {pkg.label} ({formatUsd(pkg.amountUsdCents)})
            </span>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">URLs &amp; anchor text</span>
            <ul className="mt-2 space-y-1.5">
              {cleanLinks.map((l, i) => (
                <li key={i} className="text-sm">
                  <span className="font-mono">{l.url}</span>
                  {l.anchorText ? (
                    <span className="text-muted-foreground"> — {l.anchorText}</span>
                  ) : (
                    <span className="text-muted-foreground"> — (auto anchor)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => setStep("configure")}>
            <ArrowLeft className="h-4 w-4" />
            Edit
          </Button>
          <Button type="button" size="lg" onClick={() => setStep("pay")}>
            Continue to payment
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------- Pay
  return (
    <PayStep
      pkg={pkg}
      links={cleanLinks}
      method={method}
      setMethod={setMethod}
      razorpayReady={razorpayReady}
      paypalReady={paypalReady}
      razorpayKeyId={razorpayKeyId}
      paypalClientId={paypalClientId}
      user={user}
      busy={busy}
      setBusy={setBusy}
      onBack={() => setStep("review")}
    />
  );
}

function PayStep({
  pkg,
  links,
  method,
  setMethod,
  razorpayReady,
  paypalReady,
  razorpayKeyId,
  paypalClientId,
  user,
  busy,
  setBusy,
  onBack,
}: {
  pkg: { key: string; label: string; amountUsdCents: number };
  links: LinkRow[];
  method: Method | null;
  setMethod: (m: Method) => void;
  razorpayReady: boolean;
  paypalReady: boolean;
  razorpayKeyId: string | null;
  paypalClientId: string | null;
  user: { name: string | null; email: string };
  busy: boolean;
  setBusy: (b: boolean) => void;
  onBack: () => void;
}) {
  const paypalContainer = useRef<HTMLDivElement | null>(null);
  const paypalOurOrderId = useRef<string | null>(null);

  async function createOrder(provider: Method): Promise<any> {
    const res = await fetch("/api/payments/backlinks/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageKey: pkg.key, provider, links }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Could not start payment");
    return json;
  }

  function goSuccess() {
    window.location.href = "/agents/backlink-marketplace?status=success";
  }

  async function payWithRazorpay() {
    setBusy(true);
    try {
      await loadScript(RAZORPAY_SCRIPT);
      const data = await createOrder("razorpay");
      const rzp = new window.Razorpay({
        key: data.razorpay.keyId ?? razorpayKeyId,
        order_id: data.razorpay.orderId,
        amount: data.razorpay.amount,
        currency: data.razorpay.currency,
        name: "Premium Backlinks",
        description: data.razorpay.name,
        prefill: { name: data.prefill?.name, email: data.prefill?.email },
        handler: async (resp: any) => {
          try {
            const v = await fetch("/api/payments/backlinks/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: data.orderId,
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              }),
            });
            const vj = await v.json();
            if (!v.ok) throw new Error(vj.error || "Verification failed");
            goSuccess();
          } catch (e) {
            toast.error("Payment verification failed", {
              description: e instanceof Error ? e.message : undefined,
            });
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on("payment.failed", (resp: any) => {
        toast.error("Payment failed", { description: resp?.error?.description });
        setBusy(false);
      });
      rzp.open();
    } catch (e) {
      toast.error("Could not start Razorpay", {
        description: e instanceof Error ? e.message : undefined,
      });
      setBusy(false);
    }
  }

  // Render PayPal buttons when PayPal is the chosen method.
  useEffect(() => {
    if (method !== "paypal" || !paypalReady || !paypalClientId) return;
    let cancelled = false;
    const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      paypalClientId
    )}&currency=USD&intent=capture`;

    loadScript(src)
      .then(() => {
        if (cancelled || !paypalContainer.current || !window.paypal) return;
        paypalContainer.current.innerHTML = "";
        window.paypal
          .Buttons({
            style: { layout: "vertical", shape: "rect", label: "pay" },
            createOrder: async () => {
              const data = await createOrder("paypal");
              paypalOurOrderId.current = data.orderId;
              return data.paypalOrderId;
            },
            onApprove: async (data: any) => {
              try {
                const res = await fetch(
                  "/api/payments/backlinks/paypal/capture",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      orderId: paypalOurOrderId.current,
                      paypalOrderId: data.orderID,
                    }),
                  }
                );
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || "Capture failed");
                goSuccess();
              } catch (e) {
                toast.error("Payment capture failed", {
                  description: e instanceof Error ? e.message : undefined,
                });
              }
            },
            onError: (err: any) => {
              toast.error("PayPal error", {
                description: err?.message ?? String(err),
              });
            },
          })
          .render(paypalContainer.current);
      })
      .catch(() => toast.error("Could not load PayPal"));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, paypalReady, paypalClientId, pkg.key, JSON.stringify(links)]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-3">
        <span className="text-sm font-medium">{pkg.label}</span>
        <span className="text-lg font-bold">{formatUsd(pkg.amountUsdCents)}</span>
      </div>

      <div className="space-y-2">
        <Label>Choose a payment method</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {razorpayReady ? (
            <MethodCard
              active={method === "razorpay"}
              label="Razorpay"
              hint="Cards, UPI, netbanking"
              onClick={() => setMethod("razorpay")}
            />
          ) : null}
          {paypalReady ? (
            <MethodCard
              active={method === "paypal"}
              label="PayPal"
              hint="PayPal balance or card"
              onClick={() => setMethod("paypal")}
            />
          ) : null}
        </div>
      </div>

      {method === "razorpay" ? (
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={payWithRazorpay}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Opening checkout…
            </>
          ) : (
            <>Pay {formatUsd(pkg.amountUsdCents)} with Razorpay</>
          )}
        </Button>
      ) : null}

      {method === "paypal" ? (
        <div ref={paypalContainer} className="min-h-[48px]" />
      ) : null}

      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to review
      </button>
    </div>
  );
}

function MethodCard({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md border px-4 py-3 text-left transition-colors " +
        (active
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "hover:border-primary/40 hover:bg-muted/40")
      }
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </button>
  );
}
