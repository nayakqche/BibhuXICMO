"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Pause,
  Play,
  Eye,
  KeyRound,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Textarea } from "@/frontend/components/ui/textarea";
import { Badge } from "@/frontend/components/ui/badge";
import { cn } from "@/shared/utils";
import { runAgentAction } from "@/app/(app)/agents/actions";
import {
  createIGCampaignAction,
  deleteIGCampaignAction,
  toggleIGCampaignAutopilotAction,
  updateIGCampaignStatusAction,
  addInfluencersManualAction,
  previewDmsAction,
  sendTestDmAction,
  testIGCookiesAction,
  saveIGCookiesAction,
  clearIGCookiesAction,
} from "./actions";

export type NegotiationView = {
  id: string;
  handle: string;
  followers: number;
  profilePicture: string | null;
  status: string;
  agreedPrice: number | null;
  lastMessage: string | null;
  lastRole: string | null;
};

export type NegCampaign = {
  id: string;
  name: string;
  brand: string;
  budgetMin: number;
  budgetMax: number;
  status: string;
  autopilot: boolean;
  negotiations: NegotiationView[];
};

const NEGOTIATING = new Set(["DM_SENT", "REPLIED", "NEGOTIATING"]);
const CLOSED = new Set(["AGREED", "CLOSED"]);

function statusBadge(status: string) {
  switch (status) {
    case "DM_SENT":
      return { label: "contacted", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" };
    case "REPLIED":
      return { label: "replied", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" };
    case "NEGOTIATING":
      return { label: "negotiating", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
    case "AGREED":
    case "CLOSED":
      return { label: "closed", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
    case "DECLINED":
      return { label: "rejected", cls: "bg-red-500/15 text-red-600 dark:text-red-400" };
    default:
      return { label: "prospect", cls: "bg-muted text-muted-foreground" };
  }
}

export function NegotiateView({
  campaigns,
  hasCookies,
}: {
  campaigns: NegCampaign[];
  hasCookies: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const selected = campaigns.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="rounded-2xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/10 via-purple-500/5 to-transparent p-5">
      {selected ? (
        <CampaignDetail campaign={selected} hasCookies={hasCookies} onBack={() => setSelectedId(null)} />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                AI Negotiation <span className="text-fuchsia-500">Agent</span>
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your AI handles the deal — it reads creator replies and crafts the
                perfect response, negotiating within budget (max 2 follow-ups).
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowSettings(true)} className="gap-1.5">
                <Settings className="h-4 w-4" /> Settings
              </Button>
              <Button
                onClick={() => setShowNew(true)}
                className="gap-1.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:from-fuchsia-600 hover:to-purple-700"
              >
                <Plus className="h-4 w-4" /> New Campaign
              </Button>
            </div>
          </div>

          {!hasCookies && (
            <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
              Add your Instagram session cookies (the <strong>Cookies</strong> button at the top of
              this page) so the AI can read replies and send DMs.
            </div>
          )}

          <div className="mt-4 space-y-2">
            {campaigns.length === 0 ? (
              <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                No campaigns yet. Click <strong>New Campaign</strong> to start.
              </p>
            ) : (
              campaigns.map((c) => (
                <CampaignRow key={c.id} campaign={c} onOpen={() => setSelectedId(c.id)} />
              ))
            )}
          </div>
        </>
      )}

      {showNew && <NewCampaignModal onClose={() => setShowNew(false)} />}
      {showSettings && <SettingsModal hasCookies={hasCookies} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function spentOf(c: NegCampaign): number {
  return c.negotiations
    .filter((n) => CLOSED.has(n.status))
    .reduce((sum, n) => sum + (n.agreedPrice ?? 0), 0);
}

function CampaignRow({ campaign: c, onOpen }: { campaign: NegCampaign; onOpen: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card/60 p-4">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500/30 to-purple-500/20">
          <Rocket className="h-4 w-4 text-fuchsia-500" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold">{c.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {c.brand} · ${c.budgetMin.toLocaleString()}–${c.budgetMax.toLocaleString()} ·{" "}
            {c.negotiations.length} influencer{c.negotiations.length === 1 ? "" : "s"}
          </div>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-4">
        <div className="text-right">
          <div className="text-sm font-bold text-fuchsia-500">${spentOf(c).toLocaleString()}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Spent</div>
        </div>
        <button
          onClick={() =>
            start(async () => {
              await deleteIGCampaignAction(c.id);
              router.refresh();
            })
          }
          disabled={pending}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Delete campaign"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CampaignDetail({
  campaign: c,
  hasCookies,
  onBack,
}: {
  campaign: NegCampaign;
  hasCookies: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "autopilot" | "check">(null);
  const [showAdd, setShowAdd] = useState(false);

  const stats = {
    total: c.negotiations.length,
    negotiating: c.negotiations.filter((n) => NEGOTIATING.has(n.status)).length,
    closed: c.negotiations.filter((n) => CLOSED.has(n.status)).length,
    rejected: c.negotiations.filter((n) => n.status === "DECLINED").length,
    spent: spentOf(c),
  };

  async function toggleAutopilot() {
    setBusy("autopilot");
    try {
      if (!c.autopilot && c.status !== "ACTIVE") {
        await updateIGCampaignStatusAction(c.id, "ACTIVE");
      }
      const res = await toggleIGCampaignAutopilotAction(c.id, !c.autopilot);
      if (res.ok) {
        toast.success(c.autopilot ? "Autopilot stopped" : "Autopilot started — AI will auto-respond");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function checkNow() {
    if (!hasCookies) {
      toast.error("Add your Instagram cookies first (Cookies button at top).");
      return;
    }
    setBusy("check");
    try {
      const res = await runAgentAction("instagram", { mode: "negotiate" });
      if (res.ok) {
        const out = res.output as { surfaced?: number; message?: string } | undefined;
        toast.success(
          out?.surfaced ? `${out.surfaced} reply/replies handled` : out?.message ?? "Inbox checked — no new replies"
        );
        router.refresh();
      } else {
        toast.error("Check failed", { description: res.error, duration: 8000 });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div>
            <h2 className="text-xl font-bold">{c.name}</h2>
            <p className="text-xs text-muted-foreground">
              {c.brand} · Budget ${c.budgetMin.toLocaleString()}–${c.budgetMax.toLocaleString()}
            </p>
          </div>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-1.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:from-fuchsia-600 hover:to-purple-700">
          <Plus className="h-4 w-4" /> Add Influencers
        </Button>
      </div>
      {showAdd && <AddInfluencersModal campaign={c} onClose={() => setShowAdd(false)} />}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/60 p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className={cn("h-2.5 w-2.5 rounded-full", c.autopilot ? "bg-emerald-500" : "bg-muted-foreground/40")} />
          <span className="font-medium">Autopilot {c.autopilot ? "On" : "Off"}</span>
          <span className="text-xs text-muted-foreground">
            {c.autopilot ? "AI auto-reads replies and responds (every ~10 min)." : "Click start — AI will auto-read replies and respond."}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={checkNow} disabled={busy !== null} className="gap-1.5">
            {busy === "check" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Check Now
          </Button>
          <Button
            size="sm"
            onClick={toggleAutopilot}
            disabled={busy !== null}
            className={cn(
              "gap-1.5",
              c.autopilot
                ? ""
                : "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:from-fuchsia-600 hover:to-purple-700"
            )}
            variant={c.autopilot ? "outline" : "default"}
          >
            {busy === "autopilot" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : c.autopilot ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {c.autopilot ? "Stop Autopilot" : "Start Autopilot"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Total" value={stats.total} className="text-foreground" />
        <Stat label="Negotiating" value={stats.negotiating} className="text-amber-500" />
        <Stat label="Closed" value={stats.closed} className="text-emerald-500" />
        <Stat label="Rejected" value={stats.rejected} className="text-red-500" />
        <Stat label="Spent" value={`$${stats.spent.toLocaleString()}`} className="text-fuchsia-500" />
      </div>

      <div className="space-y-2">
        {c.negotiations.length === 0 ? (
          <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            No influencers yet. Click <strong>Add Influencers</strong> — the AI finds creators and sends the first DM.
          </p>
        ) : (
          c.negotiations.map((n) => {
            const b = statusBadge(n.status);
            return (
              <div key={n.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card/60 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 text-[11px] font-semibold text-white">
                    {n.handle.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">@{n.handle}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {n.followers.toLocaleString()} followers
                      {n.lastMessage ? ` · ${n.lastRole === "us" ? "→ " : "← "}${n.lastMessage.slice(0, 60)}` : ""}
                    </div>
                  </div>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", b.cls)}>
                  {b.label}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number | string; className?: string }) {
  return (
    <div className="rounded-xl border bg-card/60 p-3 text-center">
      <div className={cn("text-2xl font-bold tabular-nums", className)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function NewCampaignModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [budgetMin, setBudgetMin] = useState(100);
  const [budgetMax, setBudgetMax] = useState(500);
  const [brief, setBrief] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!name.trim() || !brand.trim()) {
      toast.error("Name and brand are required");
      return;
    }
    start(async () => {
      const res = await createIGCampaignAction({ name, brand, budgetMin, budgetMax, brief, autopilot: false });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Campaign created");
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">New Negotiation Campaign</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Campaign Name*</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Germany - Udemy" className="mt-1" />
            </div>
            <div>
              <Label>Brand*</Label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Udemy" className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Budget Min ($)</Label>
              <Input type="number" value={budgetMin} onChange={(e) => setBudgetMin(Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label>Budget Max ($)</Label>
              <Input type="number" value={budgetMax} onChange={(e) => setBudgetMax(Number(e.target.value))} className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Brief / Pitch to creators</Label>
            <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What's the collab about? The AI uses this in the first DM." className="mt-1" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button onClick={submit} disabled={pending} className="gap-1.5">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Campaign
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Influencers modal (Send DMs Now / Just Track) — mirrors the reference.
// ---------------------------------------------------------------------------

const TEMPLATE_VARS = [
  "first_name",
  "username",
  "full_name",
  "followers",
  "category",
  "brand",
  "product",
  "collab_type",
  "budget_min",
  "budget_max",
];

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddInfluencersModal({ campaign, onClose }: { campaign: NegCampaign; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"send" | "track">("send");
  const [creators, setCreators] = useState("");
  const [template, setTemplate] = useState(
    "Hey {{first_name}}! Loved your content 🙌 I'm from {{brand}} — we're lining up a {{collab_type}} around our {{product}}. Budget around {{budget_min}}. Interested?"
  );
  const [firstMessage, setFirstMessage] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(45);
  const [maxDms, setMaxDms] = useState(30);
  const [reDm, setReDm] = useState(false);
  const [samples, setSamples] = useState<Array<{ handle: string; message: string }> | null>(null);
  const [pending, start] = useTransition();

  function insertVar(v: string) {
    setTemplate((t) => `${t}{{${v}}}`);
  }

  function preview() {
    start(async () => {
      const res = await previewDmsAction({ campaignId: campaign.id, creatorsText: creators, messageTemplate: template });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSamples(res.samples);
    });
  }

  function submit() {
    start(async () => {
      const res = await addInfluencersManualAction({
        campaignId: campaign.id,
        creatorsText: creators,
        mode,
        messageTemplate: mode === "send" ? template : undefined,
        firstMessage: mode === "track" ? firstMessage : undefined,
        delaySeconds,
        maxDms,
        reDm,
      });
      if (!res.ok) {
        toast.error("Could not add", { description: res.error, duration: 8000 });
        return;
      }
      toast.success(
        mode === "send"
          ? `Queued ${res.added} DM(s) — sending now (staggered)`
          : `Tracking ${res.added} creator(s)`
      );
      router.refresh();
      onClose();
    });
  }

  return (
    <ModalShell title="Add Influencers" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode("send")}
          className={cn(
            "rounded-md border px-3 py-2 text-sm font-medium",
            mode === "send" ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300" : "text-muted-foreground"
          )}
        >
          🚀 Send DMs Now
        </button>
        <button
          onClick={() => setMode("track")}
          className={cn(
            "rounded-md border px-3 py-2 text-sm font-medium",
            mode === "track" ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300" : "text-muted-foreground"
          )}
        >
          📋 Just Track (already DMed)
        </button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {mode === "send"
          ? "Send a personalized initial DM to this list right from here. No copy-pasting on Instagram."
          : "Just track creators you already messaged on Instagram manually. Replies from them will show up here."}
      </p>

      <div className="mt-3">
        <Label>Creators (one per line: username or username,Full Name, or paste JSON)</Label>
        <Textarea
          value={creators}
          onChange={(e) => setCreators(e.target.value)}
          className="mt-1.5 min-h-[96px] font-mono text-xs"
          placeholder={"aryan_fitness,Aryan Sharma\npriya.yoga,Priya Kapoor\nrohit_travels"}
        />
      </div>

      {mode === "send" ? (
        <>
          <div className="mt-3">
            <Label>Message Template</Label>
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="mt-1.5 min-h-[90px] text-sm"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TEMPLATE_VARS.map((v) => (
                <button
                  key={v}
                  onClick={() => insertVar(v)}
                  className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <Label>Delay between DMs (seconds)</Label>
              <Input type="number" value={delaySeconds} onChange={(e) => setDelaySeconds(Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label>Max DMs this run</Label>
              <Input type="number" value={maxDms} onChange={(e) => setMaxDms(Number(e.target.value))} className="mt-1" />
            </div>
          </div>

          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reDm} onChange={(e) => setReDm(e.target.checked)} className="h-4 w-4 accent-fuchsia-500" />
            Re-DM creators I&apos;ve already contacted in this campaign
          </label>

          {samples && (
            <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="text-xs font-medium text-muted-foreground">Preview</div>
              {samples.map((s, i) => (
                <div key={i} className="text-xs">
                  <span className="font-medium">@{s.handle}</span>
                  <p className="whitespace-pre-wrap text-muted-foreground">{s.message}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={preview} disabled={pending} className="gap-1.5">
              <Eye className="h-4 w-4" /> Preview 3 Samples
            </Button>
            <Button onClick={submit} disabled={pending} className="gap-1.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:from-fuchsia-600 hover:to-purple-700">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send DMs Now
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-3">
            <Label>First Message You Sent</Label>
            <Textarea
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              className="mt-1.5 min-h-[90px] text-sm"
              placeholder="Hey! I came across your profile and love your content…"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={submit} disabled={pending} className="gap-1.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:from-fuchsia-600 hover:to-purple-700">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add to Campaign
            </Button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Settings modal — IG session cookies + connection / test-DM troubleshooting.
// ---------------------------------------------------------------------------

function SettingsModal({ hasCookies, onClose }: { hasCookies: boolean; onClose: () => void }) {
  const router = useRouter();
  const [cookies, setCookies] = useState("");
  const [testUser, setTestUser] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const [pending, start] = useTransition();

  function save() {
    if (!cookies.trim()) {
      toast.error("Paste your Instagram cookies JSON first.");
      return;
    }
    start(async () => {
      const res = await saveIGCookiesAction(cookies);
      if (res.ok) {
        toast.success("Cookies saved (encrypted)");
        setCookies("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }
  function testCookies() {
    start(async () => {
      const res = await testIGCookiesAction();
      if (res.ok) toast.success(`Cookies OK — inbox reachable (${res.count} threads seen)`);
      else toast.error("Test failed", { description: res.error, duration: 8000 });
    });
  }
  function clear() {
    start(async () => {
      await clearIGCookiesAction();
      toast.success("Cookies cleared");
      router.refresh();
    });
  }
  function sendTest() {
    if (!testUser.trim()) {
      toast.error("Enter a username to test.");
      return;
    }
    start(async () => {
      const res = await sendTestDmAction({ username: testUser, message: testMsg });
      if (res.ok) toast.success(`Test DM sent to @${testUser.replace(/^@/, "")}`);
      else toast.error("Test DM failed", { description: res.error, duration: 8000 });
    });
  }

  return (
    <ModalShell title="Settings" onClose={onClose}>
      <p className="text-xs text-muted-foreground">
        Paste your Instagram cookies (JSON array) here. These are needed to send DMs via the Apify
        automation actor. Required cookies: <code>sessionid</code>, <code>ds_user_id</code>, <code>csrftoken</code>.
      </p>
      <div className="mt-3">
        <Label>Instagram Cookies (JSON)</Label>
        <Textarea
          value={cookies}
          onChange={(e) => setCookies(e.target.value)}
          className="mt-1.5 min-h-[120px] font-mono text-xs"
          placeholder='[{"name":"sessionid","value":"...","domain":".instagram.com"}, ...]'
        />
      </div>
      {hasCookies && (
        <div className="mt-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-300">
          Instagram cookies configured.
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={save} disabled={pending} className="gap-1.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:from-fuchsia-600 hover:to-purple-700">
          <KeyRound className="h-4 w-4" /> Save Cookies
        </Button>
        <Button variant="outline" onClick={testCookies} disabled={pending}>Test Cookies (Inbox Check)</Button>
        {hasCookies && (
          <Button variant="ghost" onClick={clear} disabled={pending} className="gap-1.5 text-destructive">
            <Trash2 className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      <div className="mt-5 border-t pt-4">
        <p className="text-xs text-muted-foreground">
          Troubleshoot: send a real test DM to verify the Apify actor + cookies are working end-to-end.
        </p>
        <div className="mt-2">
          <Label>Test Username</Label>
          <Input value={testUser} onChange={(e) => setTestUser(e.target.value)} placeholder="your_other_account" className="mt-1" />
        </div>
        <div className="mt-2">
          <Label>Test Message</Label>
          <Textarea value={testMsg} onChange={(e) => setTestMsg(e.target.value)} placeholder="Test DM from QuickAds — ignore." className="mt-1.5 min-h-[60px] text-sm" />
        </div>
        <Button variant="outline" onClick={sendTest} disabled={pending} className="mt-2 gap-1.5">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send Test DM
        </Button>
      </div>
    </ModalShell>
  );
}
