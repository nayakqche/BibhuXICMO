"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Inbox,
  Loader2,
  Mail,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Textarea } from "@/frontend/components/ui/textarea";
import { Badge } from "@/frontend/components/ui/badge";
import { cn } from "@/shared/utils";
import { YoutubeLogo } from "@/frontend/components/brand-logos";
import { CreatorSearch, type YTCreatorView } from "./creator-search";
import {
  addEmailAccountAction,
  bulkAddEmailAccountsAction,
  testEmailAccountAction,
  deleteEmailAccountAction,
  createCampaignAction,
  deleteCampaignAction,
  addCreatorsToCampaignAction,
  startCampaignAction,
  checkInboxNowAction,
  addMailingContactsAction,
  removeMailingContactAction,
  clearMailingListAction,
  bulkSendMailingAction,
} from "./email-actions";

// ---------------------------------------------------------------------------
// View types (serializable shapes from the server page)
// ---------------------------------------------------------------------------

export type AccountView = {
  id: string;
  email: string;
  displayName: string | null;
  sentToday: number;
  dailyLimit: number;
  isActive: boolean;
};
export type ThreadMsgView = {
  direction: string;
  subject: string | null;
  body: string;
  createdAt: string;
};
export type OutreachView = {
  id: string;
  recipientName: string | null;
  recipientEmail: string;
  status: string;
  negotiationStage: string;
  currentOffer: number;
  subject: string;
  replyContent: string | null;
  aiResponse: string | null;
  thread: ThreadMsgView[];
};
export type CampaignView = {
  id: string;
  name: string;
  brief: string | null;
  topic: string | null;
  budgetMin: number;
  budgetMax: number;
  maxOffer: number;
  status: string;
  createdAt: string;
  outreach: OutreachView[];
};
export type ContactView = {
  id: string;
  name: string | null;
  email: string;
  status: string;
};

type Tab = "dashboard" | "accounts" | "campaigns" | "mailing";

const STAGE_TERMINAL = new Set(["deal_closed"]);

// ===========================================================================

export function YouTubeSuite({
  creators,
  hasApiKey,
  accounts,
  campaigns,
  contacts,
}: {
  creators: YTCreatorView[];
  hasApiKey: boolean;
  accounts: AccountView[];
  campaigns: CampaignView[];
  contacts: ContactView[];
}) {
  const [tab, setTab] = useState<Tab>("dashboard");

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: "dashboard", label: "Creator Search", icon: Search },
    { id: "accounts", label: "Email Accounts", icon: Mail },
    { id: "campaigns", label: "Campaigns", icon: Megaphone },
    { id: "mailing", label: "Mailing List", icon: Inbox },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/15 via-rose-500/10 to-transparent px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-red-500/20">
          <YoutubeLogo className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">YouTube Creator Outreach</h1>
          <p className="text-xs text-muted-foreground">
            Find creators, connect your email, and let the AI negotiate deals automatically.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              tab === t.id
                ? "border-red-500 font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <CreatorSearch initialCreators={creators} hasApiKey={hasApiKey} />}
      {tab === "accounts" && <EmailAccountsTab accounts={accounts} />}
      {tab === "campaigns" && <CampaignsTab campaigns={campaigns} hasAccount={accounts.some((a) => a.isActive)} />}
      {tab === "mailing" && <MailingTab contacts={contacts} campaigns={campaigns} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal shell
// ---------------------------------------------------------------------------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-background p-5 shadow-xl"
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

// ===========================================================================
// Email Accounts
// ===========================================================================

function EmailAccountsTab({ accounts }: { accounts: AccountView[] }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [pending, start] = useTransition();

  function test(id: string) {
    start(async () => {
      const res = await testEmailAccountAction({ id });
      if (res.ok) toast.success("Connection OK");
      else toast.error("Test failed", { description: res.error, duration: 7000 });
    });
  }
  function del(id: string) {
    start(async () => {
      await deleteEmailAccountAction({ id });
      router.refresh();
      toast.success("Account removed");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Email Accounts (SMTP)</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowBulk(true)} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Bulk Add
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Account
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-4 text-sm">
        <p className="font-medium">Gmail App Password Setup:</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted-foreground">
          <li>
            Go to{" "}
            <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Google Account Security
            </a>
          </li>
          <li>Enable 2-Step Verification if not already enabled</li>
          <li>Go to &quot;App passwords&quot; and generate a new password</li>
          <li>Use that 16-character password here (not your regular Gmail password)</li>
        </ol>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          No email accounts yet. Add one to start sending outreach.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Display Name</th>
                <th className="px-4 py-2">Sent Today</th>
                <th className="px-4 py-2">Limit</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-medium">{a.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.displayName ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{a.sentToday}</td>
                  <td className="px-4 py-3 tabular-nums">{a.dailyLimit}/day</td>
                  <td className="px-4 py-3">
                    <Badge variant={a.isActive ? "success" : "secondary"}>{a.isActive ? "Active" : "Off"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => test(a.id)} disabled={pending} className="mr-3 text-primary hover:underline">
                      Test
                    </button>
                    <button onClick={() => del(a.id)} disabled={pending} className="text-destructive hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} />}
      {showBulk && <BulkAddModal onClose={() => setShowBulk(false)} />}
    </div>
  );
}

function AddAccountModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [provider, setProvider] = useState<"gmail" | "sendgrid" | "custom">("gmail");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [dailyLimit, setDailyLimit] = useState(100);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [skipTest, setSkipTest] = useState(false);
  const [pending, start] = useTransition();

  function submit() {
    if (!email.trim() || !password.trim()) {
      toast.error("Email and password are required");
      return;
    }
    start(async () => {
      const res = await addEmailAccountAction({
        provider,
        email,
        password,
        displayName,
        dailyLimit,
        smtpHost: provider === "custom" ? smtpHost : undefined,
        smtpPort: provider === "custom" ? smtpPort : undefined,
        skipTest,
      });
      if (!res.ok) {
        toast.error("Could not add account", { description: res.error, duration: 8000 });
        return;
      }
      toast.success("Account added");
      router.refresh();
      onClose();
    });
  }

  const passLabel = provider === "sendgrid" ? "SendGrid API Key*" : "App Password*";

  return (
    <Modal title="Add Email Account" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {(["gmail", "sendgrid", "custom"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm capitalize",
                provider === p ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
              )}
            >
              {p === "gmail" ? "Gmail" : p === "sendgrid" ? "SendGrid" : "Custom SMTP"}
            </button>
          ))}
        </div>

        <div>
          <Label>Email Address*</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@company.com" className="mt-1" />
        </div>

        {provider === "gmail" && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
            For Gmail/Google Workspace: use an App Password (not your regular password). If unavailable, use SendGrid.
          </div>
        )}

        {provider === "custom" && (
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <div>
              <Label>SMTP Host</Label>
              <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.domain.com" className="mt-1" />
            </div>
            <div>
              <Label>Port</Label>
              <Input type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} className="mt-1" />
            </div>
          </div>
        )}

        <div>
          <Label>{passLabel}</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="16-character App Password" className="mt-1" />
        </div>
        <div>
          <Label>Display Name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your Name or Company" className="mt-1" />
        </div>
        <div>
          <Label>Daily Send Limit</Label>
          <Input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} className="mt-1" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={skipTest} onChange={(e) => setSkipTest(e.target.checked)} className="h-4 w-4 accent-primary" />
          Skip connection test (add account without verifying)
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending} className="gap-1.5">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Add Account
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BulkAddModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  function submit() {
    start(async () => {
      const res = await bulkAddEmailAccountsAction({ text });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added ${res.added}, failed ${res.failed}`, {
        description: res.errors.slice(0, 3).join("; ") || undefined,
      });
      router.refresh();
      onClose();
    });
  }
  return (
    <Modal title="Bulk Add Accounts" onClose={onClose}>
      <p className="mb-2 text-xs text-muted-foreground">
        One per line: <code>email, app_password</code> or <code>email, smtp_host, port, password</code>
      </p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[140px] font-mono text-xs" placeholder={"sally@quickads.ai, abcd efgh ijkl mnop\nbob@domain.com, smtp.domain.com, 587, secret"} />
      <div className="flex justify-end gap-2 pt-3">
        <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button onClick={submit} disabled={pending} className="gap-1.5">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Add Accounts
        </Button>
      </div>
    </Modal>
  );
}

// ===========================================================================
// Campaigns
// ===========================================================================

function CampaignsTab({ campaigns, hasAccount }: { campaigns: CampaignView[]; hasAccount: boolean }) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [addTo, setAddTo] = useState<CampaignView | null>(null);
  const [convo, setConvo] = useState<CampaignView | null>(null);
  const [pending, start] = useTransition();

  const all = campaigns.flatMap((c) => c.outreach);
  const stats = {
    total: all.length,
    drafts: all.filter((o) => o.status === "draft").length,
    sent: all.filter((o) => o.status === "sent").length,
    replied: all.filter((o) => o.status === "replied").length,
    closed: all.filter((o) => STAGE_TERMINAL.has(o.negotiationStage)).length,
  };

  function startCampaign(id: string) {
    start(async () => {
      const res = await startCampaignAction({ campaignId: id });
      if (!res.ok) {
        toast.error("Could not start", { description: res.error, duration: 8000 });
        return;
      }
      toast.success(`Sent ${res.sent}${res.failed ? `, ${res.failed} failed` : ""}`);
      router.refresh();
    });
  }
  function checkInbox() {
    start(async () => {
      const res = await checkInboxNowAction();
      if (!res.ok) {
        toast.error("Inbox check failed", { description: res.error, duration: 8000 });
        return;
      }
      toast.success(`${res.repliesProcessed} replies handled, ${res.followupsSent} follow-ups sent`);
      router.refresh();
    });
  }
  function del(id: string) {
    start(async () => {
      await deleteCampaignAction({ id });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Email Campaigns &amp; Outreach</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={checkInbox} disabled={pending} className="gap-1.5">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Check Inbox
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Campaign
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-600 to-green-600 px-4 py-3 text-sm text-white">
        <div className="flex items-center gap-2 font-medium">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> LIVE — Auto-Negotiation Mode: ACTIVE
        </div>
        <p className="text-xs text-white/80">Backend checks the inbox every 5 min • AI auto-responds within budget • max 2 follow-ups.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total Outreach" value={stats.total} className="text-foreground" />
        <StatCard label="Drafts" value={stats.drafts} className="text-amber-500" />
        <StatCard label="Sent" value={stats.sent} className="text-sky-500" />
        <StatCard label="Replied" value={stats.replied} className="text-violet-500" />
        <StatCard label="Deals Closed" value={stats.closed} className="text-emerald-500" />
      </div>

      {campaigns.length === 0 ? (
        <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          No campaigns yet. Create one to start outreach.
        </p>
      ) : (
        campaigns.map((c) => (
          <div key={c.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{c.name}</h3>
                  <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                </div>
                {c.brief && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.brief}</p>}
                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                  Max negotiation offer: ${c.maxOffer.toLocaleString()} · Budget ${c.budgetMin.toLocaleString()}–${c.budgetMax.toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <button onClick={() => setAddTo(c)} className="text-sm text-primary hover:underline">+ Add Creators</button>
                {c.outreach.some((o) => o.status === "draft") && (
                  <Button size="sm" onClick={() => startCampaign(c.id)} disabled={pending || !hasAccount} className="gap-1.5">
                    <Send className="h-3.5 w-3.5" /> Start Campaign
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-3 border-t pt-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">{c.outreach.length} creator(s)</div>
              <ul className="space-y-1">
                {c.outreach.slice(0, 8).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">
                      <span className="font-medium">{o.recipientName ?? o.recipientEmail.split("@")[0]}</span>{" "}
                      <span className="text-muted-foreground">{o.recipientEmail}</span>
                    </span>
                    <StageBadge status={o.status} stage={o.negotiationStage} offer={o.currentOffer} />
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
              <div className="flex gap-3 text-sm">
                <button onClick={() => setConvo(c)} className="text-muted-foreground hover:text-foreground">View Conversations</button>
                <button onClick={() => del(c.id)} className="text-destructive hover:underline">Delete</button>
              </div>
            </div>
          </div>
        ))
      )}

      {showNew && <NewCampaignModal onClose={() => setShowNew(false)} />}
      {addTo && <AddCreatorsModal campaign={addTo} onClose={() => setAddTo(null)} />}
      {convo && <ConversationsModal campaign={convo} onClose={() => setConvo(null)} />}
    </div>
  );
}

function StatCard({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className={cn("text-2xl font-bold tabular-nums", className)}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function StageBadge({ status, stage, offer }: { status: string; stage: string; offer: number }) {
  if (stage === "deal_closed") return <Badge variant="success" className="text-[10px]">deal closed ${offer}</Badge>;
  if (stage === "rejected" || stage === "rejected_over_budget" || stage === "declined")
    return <Badge variant="destructive" className="text-[10px]">{stage.replace(/_/g, " ")}</Badge>;
  if (stage === "negotiating" || stage === "final_offer")
    return <Badge variant="outline" className="text-[10px]">{stage.replace(/_/g, " ")} ${offer}</Badge>;
  return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
}

function NewCampaignModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [topic, setTopic] = useState("");
  const [budgetMin, setBudgetMin] = useState(100);
  const [budgetMax, setBudgetMax] = useState(500);
  const [maxOffer, setMaxOffer] = useState(500);
  const [requirements, setRequirements] = useState("");
  const [deadline, setDeadline] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!name.trim()) {
      toast.error("Campaign name required");
      return;
    }
    start(async () => {
      const res = await createCampaignAction({
        name, brief, topic, budgetMin, budgetMax,
        maxOffer: Math.max(maxOffer, budgetMax),
        requirements, deadline,
      });
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
    <Modal title="Create New Campaign" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <Label>Campaign Name*</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Product Launch" className="mt-1" />
        </div>
        <div>
          <Label>Brief / Message for Creators</Label>
          <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Describe your campaign, product, or what you're looking for…" className="mt-1" />
        </div>
        <div>
          <Label>Topic / Product</Label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Fitness App, E-commerce Store" className="mt-1" />
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
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
          <Label>Max Offer for Negotiation: ${maxOffer.toLocaleString()}</Label>
          <input
            type="range"
            min={50}
            max={10000}
            step={50}
            value={maxOffer}
            onChange={(e) => setMaxOffer(Number(e.target.value))}
            className="mt-2 w-full accent-emerald-500"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            The AI raises offers gradually each round until this max. Above it, the AI politely declines.
          </p>
        </div>
        <div>
          <Label>Requirements</Label>
          <Textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="Any specific requirements for content…" className="mt-1" />
        </div>
        <div>
          <Label>Deadline</Label>
          <Input value={deadline} onChange={(e) => setDeadline(e.target.value)} placeholder="e.g. March 2026, Flexible" className="mt-1" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending} className="gap-1.5">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Campaign
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AddCreatorsModal({ campaign, onClose }: { campaign: CampaignView; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  function submit() {
    start(async () => {
      const res = await addCreatorsToCampaignAction({ campaignId: campaign.id, text });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added ${res.added} creator(s) — drafts generated`);
      router.refresh();
      onClose();
    });
  }
  return (
    <Modal title="Add Creators to Campaign" onClose={onClose}>
      <p className="mb-1 text-sm text-muted-foreground">Campaign: <strong>{campaign.name}</strong></p>
      <Label className="mt-2 block">Creator Contacts</Label>
      <p className="text-xs text-muted-foreground">Format: Name, Email (one per line). You can also paste just emails.</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} className="mt-1.5 min-h-[140px] font-mono text-xs" placeholder={"John Tech Reviewer, john@techreviews.com\nSarah Gaming, sarah@gamingchannel.com\nmike@fitnessvids.com"} />
      <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
        Tip: After adding creators, click <strong>Start Campaign</strong> to send AI-personalized emails to all of them.
      </div>
      <div className="flex justify-end gap-2 pt-3">
        <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button onClick={submit} disabled={pending} className="gap-1.5">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Add Creators
        </Button>
      </div>
    </Modal>
  );
}

function ConversationsModal({ campaign, onClose }: { campaign: CampaignView; onClose: () => void }) {
  return (
    <Modal title={`Conversations — ${campaign.name}`} onClose={onClose}>
      {campaign.outreach.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No outreach yet.</p>
      ) : (
        <div className="space-y-3">
          {campaign.outreach.map((o) => (
            <div key={o.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{o.recipientName ?? o.recipientEmail}</span>
                <StageBadge status={o.status} stage={o.negotiationStage} offer={o.currentOffer} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{o.recipientEmail} · {o.subject}</div>
              <div className="mt-2 space-y-1.5">
                {o.thread.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-md p-2 text-xs",
                      m.direction === "inbound"
                        ? "bg-emerald-500/10"
                        : "bg-primary/5"
                    )}
                  >
                    <div className="mb-0.5 font-medium">
                      {m.direction === "inbound" ? "Creator" : "AI (you)"}
                    </div>
                    <p className="whitespace-pre-wrap text-muted-foreground">{m.body}</p>
                  </div>
                ))}
                {o.thread.length === 0 && <p className="text-xs text-muted-foreground">Not sent yet.</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ===========================================================================
// Mailing list
// ===========================================================================

function MailingTab({ contacts, campaigns }: { contacts: ContactView[]; campaigns: CampaignView[] }) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [pending, start] = useTransition();

  const stats = {
    total: contacts.length,
    pending: contacts.filter((c) => c.status === "pending").length,
    sent: contacts.filter((c) => c.status === "sent").length,
    replied: contacts.filter((c) => c.status === "replied").length,
  };

  function send() {
    if (!campaignId) {
      toast.error("Select a campaign first");
      return;
    }
    start(async () => {
      const res = await bulkSendMailingAction({ campaignId });
      if (!res.ok) {
        toast.error("Send failed", { description: res.error, duration: 8000 });
        return;
      }
      toast.success(`Sent ${res.sent}${res.failed ? `, ${res.failed} failed` : ""}`);
      router.refresh();
    });
  }
  function clearAll() {
    start(async () => {
      await clearMailingListAction();
      router.refresh();
    });
  }
  function remove(id: string) {
    start(async () => {
      await removeMailingContactAction({ id });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Mailing List</h2>
          <p className="text-sm text-muted-foreground">Add creator emails, select a campaign, and send bulk outreach.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={clearAll} disabled={pending} className="gap-1.5 text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Clear All
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Contacts
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Contacts" value={stats.total} />
        <StatCard label="Pending" value={stats.pending} className="text-amber-500" />
        <StatCard label="Sent" value={stats.sent} className="text-emerald-500" />
        <StatCard label="Replied" value={stats.replied} className="text-sky-500" />
      </div>

      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><Send className="h-4 w-4" /> Bulk Send Outreach</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">-- Select a Campaign --</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <Button onClick={send} disabled={pending} className="gap-1.5">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send to All Pending
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">AI generates a personalized email for each contact based on the campaign brief.</p>
      </div>

      {contacts.length === 0 ? (
        <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">No contacts yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium">{c.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                  <td className="px-4 py-3"><Badge variant={c.status === "replied" ? "success" : "secondary"}>{c.status}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(c.id)} disabled={pending} className="text-destructive hover:underline">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddContactsModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function AddContactsModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function addSingle() {
    if (!email.includes("@")) {
      toast.error("Valid email required");
      return;
    }
    start(async () => {
      const res = await addMailingContactsAction({ single: { name, email, notes } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Contact added");
      router.refresh();
      onClose();
    });
  }
  function addBulk() {
    start(async () => {
      const res = await addMailingContactsAction({ text });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added ${res.added} contact(s)`);
      router.refresh();
      onClose();
    });
  }

  return (
    <Modal title="Add Contacts to Mailing List" onClose={onClose}>
      <div className="space-y-3">
        <div className="text-sm font-medium">Add Single Contact</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Name*</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Creator name" className="mt-1" />
          </div>
          <div>
            <Label>Email*</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="creator@email.com" className="mt-1" />
          </div>
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Tech reviewer, 50K subs" className="mt-1" />
        </div>
        <Button size="sm" onClick={addSingle} disabled={pending}>Add Contact</Button>

        <div className="border-t pt-3 text-sm font-medium">Or Paste Multiple Contacts</div>
        <p className="text-xs text-muted-foreground">Format: Name, Email (one per line)</p>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[120px] font-mono text-xs" placeholder={"John Doe, john@email.com\nJane Smith, jane@email.com"} />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={addBulk} disabled={pending} className="gap-1.5">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Add All Contacts
          </Button>
        </div>
      </div>
    </Modal>
  );
}
