"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Instagram,
  Loader2,
  Mail,
  Search,
  Send,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Textarea } from "@/frontend/components/ui/textarea";
import { Badge } from "@/frontend/components/ui/badge";
import { Progress } from "@/frontend/components/ui/progress";
import {
  runIGSeedDiscoveryAction,
  recordIGDmSentAction,
  deleteIGCreatorAction,
  clearIGCreatorsAction,
} from "./discover-actions";

export type CreatorRow = {
  id: string;
  handle: string;
  fullName: string | null;
  bio: string | null;
  followers: number;
  following: number | null;
  engagementRate: number | null;
  qualityScore: number | null;
  email: string | null;
  category: string | null;
  isVerified: boolean;
  profileUrl: string;
  lastDmAt: Date | null;
};

const TEMPLATE_VARS = [
  { key: "name", label: "{name}" },
  { key: "username", label: "{username}" },
  { key: "followers", label: "{followers}" },
  { key: "category", label: "{category}" },
] as const;

const DEFAULT_TEMPLATE =
  "Hey {name}! I came across your profile and love the content you create. " +
  "I think there's a great opportunity for us to collaborate. " +
  "Would you be open to a quick chat about a potential partnership? " +
  "Looking forward to hearing from you!";

function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function renderTemplate(tpl: string, c: CreatorRow): string {
  return tpl
    .replace(/\{name\}/gi, c.fullName || c.handle)
    .replace(/\{username\}/gi, c.handle)
    .replace(/\{followers\}/gi, fmtNumber(c.followers))
    .replace(/\{category\}/gi, c.category || "creator");
}

function qualityColor(score: number | null): string {
  if (score === null) return "bg-muted text-muted-foreground";
  if (score >= 70) return "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200";
  if (score >= 50) return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
  return "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200";
}

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

export function InfluencerFind({
  initialCreators,
  hasApifyToken,
}: {
  initialCreators: CreatorRow[];
  hasApifyToken: boolean;
}) {
  const [seedsText, setSeedsText] = useState("");
  const [minFollowers, setMinFollowers] = useState("1000");
  const [maxFollowers, setMaxFollowers] = useState("250000");
  const [categoryHint, setCategoryHint] = useState("");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [creators, setCreators] = useState<CreatorRow[]>(initialCreators);
  const [pending, startTransition] = useTransition();

  const previewCreator: CreatorRow = useMemo(
    () =>
      creators[0] ??
      ({
        id: "preview",
        handle: "sample_creator",
        fullName: "Sample Creator",
        bio: null,
        followers: 12500,
        following: null,
        engagementRate: 0.038,
        qualityScore: 72,
        email: null,
        category: "Lifestyle",
        isVerified: false,
        profileUrl: "https://instagram.com/sample_creator",
        lastDmAt: null,
      } as CreatorRow),
    [creators]
  );

  const livePreview = useMemo(
    () => renderTemplate(template, previewCreator),
    [template, previewCreator]
  );

  function insertVariable(label: string) {
    setTemplate((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${label} `);
  }

  function startProgressFake() {
    setProgress(5);
    let pct = 5;
    const id = setInterval(() => {
      pct = Math.min(92, pct + Math.random() * 8);
      setProgress(pct);
    }, 1200);
    return () => {
      clearInterval(id);
      setProgress(100);
      setTimeout(() => setProgress(0), 800);
    };
  }

  async function onDiscover() {
    const seeds = seedsText
      .split(/[\n,]+/)
      .map((s) => s.replace(/^@/, "").trim())
      .filter(Boolean);
    if (seeds.length === 0) {
      toast.error("Add at least one seed account.");
      return;
    }
    if (!hasApifyToken) {
      toast.error("Apify token missing", {
        description:
          "Set APIFY_TOKEN (or APIFY_IG_TOKEN) in Render → Environment.",
      });
      return;
    }
    setStatusMessage("Starting scraper…");
    const stop = startProgressFake();
    startTransition(async () => {
      try {
        const res = await runIGSeedDiscoveryAction({
          seeds,
          minFollowers: minFollowers ? parseInt(minFollowers, 10) : undefined,
          maxFollowers: maxFollowers ? parseInt(maxFollowers, 10) : undefined,
          categoryHint: categoryHint || undefined,
        });
        stop();
        if (!res.ok) {
          setStatusMessage(null);
          toast.error("Discovery failed", { description: res.error });
          return;
        }
        setStatusMessage(
          `Found ${res.found} creators (scanned ${res.scanned} via #${res.hashtags.join(", #") || "—"}).`
        );
        toast.success(`Found ${res.found} creators`, {
          description:
            res.hashtags.length > 0
              ? `Hashtags scanned: #${res.hashtags.join(", #")}`
              : undefined,
        });
        // The server action already revalidated the page; the parent will refresh
        // via router. As a fast UX, also force a soft reload:
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      } catch (err) {
        stop();
        setStatusMessage(null);
        toast.error("Discovery failed", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function onSendDM(c: CreatorRow) {
    const text = renderTemplate(template, c);
    const ok = await copyToClipboard(text);
    if (ok) {
      toast.success("Message copied!", {
        description: "Paste (Ctrl/Cmd + V) in the Instagram DM window.",
      });
    } else {
      toast.error("Couldn't copy", {
        description: "Copy the message manually from the preview.",
      });
    }
    window.open(
      `https://www.instagram.com/${encodeURIComponent(c.handle)}/`,
      "_blank",
      "noopener,noreferrer"
    );
    // Optimistically mark as DM-sent.
    void recordIGDmSentAction(c.id);
    setCreators((rows) =>
      rows.map((r) => (r.id === c.id ? { ...r, lastDmAt: new Date() } : r))
    );
  }

  async function onDMAll() {
    if (creators.length === 0) {
      toast.error("No creators to DM yet — run discovery first.");
      return;
    }
    if (
      !confirm(
        `This will open ${creators.length} Instagram tabs. The DM template will be copied to your clipboard before each tab. Continue?`
      )
    ) {
      return;
    }
    let i = 0;
    const step = () => {
      const c = creators[i];
      if (!c) {
        toast.success(`Opened ${creators.length} DM windows.`);
        return;
      }
      onSendDM(c);
      i++;
      setTimeout(step, 1800);
    };
    step();
  }

  function exportCSV() {
    const headers = [
      "Username",
      "Full Name",
      "Followers",
      "Engagement",
      "Quality",
      "Email",
      "Category",
      "Bio",
      "Profile URL",
    ];
    const lines = [headers.join(",")];
    for (const c of creators) {
      lines.push(
        [
          csvEscape(`@${c.handle}`),
          csvEscape(c.fullName ?? ""),
          csvEscape(c.followers),
          csvEscape(c.engagementRate !== null ? fmtPct(c.engagementRate) : ""),
          csvEscape(c.qualityScore ?? ""),
          csvEscape(c.email ?? ""),
          csvEscape(c.category ?? ""),
          csvEscape(c.bio ?? ""),
          csvEscape(c.profileUrl),
        ].join(",")
      );
    }
    downloadBlob(
      new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }),
      `instagram-creators-${new Date().toISOString().slice(0, 10)}.csv`
    );
    toast.success("CSV exported");
  }

  function exportExcel() {
    // Excel-compatible HTML table (.xls). Opens natively in Excel + Sheets.
    const head = `
      <tr>
        <th>Username</th><th>Full Name</th><th>Followers</th>
        <th>Engagement</th><th>Quality</th><th>Email</th>
        <th>Category</th><th>Bio</th><th>Profile URL</th>
      </tr>`;
    const rows = creators
      .map(
        (c) => `
        <tr>
          <td>@${escapeHtml(c.handle)}</td>
          <td>${escapeHtml(c.fullName ?? "")}</td>
          <td>${c.followers}</td>
          <td>${c.engagementRate !== null ? fmtPct(c.engagementRate) : ""}</td>
          <td>${c.qualityScore ?? ""}</td>
          <td>${escapeHtml(c.email ?? "")}</td>
          <td>${escapeHtml(c.category ?? "")}</td>
          <td>${escapeHtml(c.bio ?? "")}</td>
          <td>${escapeHtml(c.profileUrl)}</td>
        </tr>`
      )
      .join("");
    const html = `<html><head><meta charset="utf-8"></head><body><table>${head}${rows}</table></body></html>`;
    downloadBlob(
      new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }),
      `instagram-creators-${new Date().toISOString().slice(0, 10)}.xls`
    );
    toast.success("Excel exported");
  }

  async function onDelete(c: CreatorRow) {
    if (!confirm(`Remove @${c.handle} from the list?`)) return;
    setCreators((rows) => rows.filter((r) => r.id !== c.id));
    await deleteIGCreatorAction(c.id);
  }

  async function onClearAll() {
    if (creators.length === 0) return;
    if (!confirm(`Clear all ${creators.length} creators?`)) return;
    setCreators([]);
    await clearIGCreatorsAction();
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-xl border bg-gradient-to-br from-pink-500/10 via-fuchsia-500/5 to-amber-500/10 p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-fuchsia-700 dark:text-fuchsia-300">
          <Sparkles className="h-4 w-4" />
          Instagram Influencer Discovery
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
          Discover the perfect creators for your brand
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Enter seed accounts from your niche. Our AI-powered scraper analyzes
          their network to find similar influencers with verified engagement
          metrics, then crafts your personalized cold DM.
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" />
            Search Influencers
          </CardTitle>
          <CardDescription>
            Configure your search parameters below. We&apos;ll mine top
            hashtags from each seed and fan out to find similar creators.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="seeds" className="text-xs">
              Seed accounts (one per line, or comma-separated)
            </Label>
            <Textarea
              id="seeds"
              value={seedsText}
              onChange={(e) => setSeedsText(e.target.value)}
              placeholder="@huberman&#10;@andrewhuberman&#10;@hubermanlab"
              className="mt-1 h-28 font-mono text-sm"
              disabled={pending}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="minF" className="text-xs">
                Min followers
              </Label>
              <Input
                id="minF"
                inputMode="numeric"
                value={minFollowers}
                onChange={(e) => setMinFollowers(e.target.value.replace(/[^0-9]/g, ""))}
                disabled={pending}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="maxF" className="text-xs">
                Max followers (0 = no cap)
              </Label>
              <Input
                id="maxF"
                inputMode="numeric"
                value={maxFollowers}
                onChange={(e) => setMaxFollowers(e.target.value.replace(/[^0-9]/g, ""))}
                disabled={pending}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="cat" className="text-xs">
                Category (optional)
              </Label>
              <Input
                id="cat"
                value={categoryHint}
                onChange={(e) => setCategoryHint(e.target.value)}
                placeholder="e.g. fitness, photographer"
                disabled={pending}
                className="mt-1"
              />
            </div>
          </div>

          {progress > 0 && (
            <div className="space-y-1">
              <Progress value={progress} className="h-1.5" />
              <p className="text-xs text-muted-foreground">
                {statusMessage ?? "Starting scraper…"} This may take 1–3
                minutes depending on the number of seed accounts.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onDiscover} disabled={pending} className="gap-2">
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Find Creators
            </Button>
            {!hasApifyToken && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Set <code>APIFY_TOKEN</code> in Render → Environment to enable.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* DM Template */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4" />
            DM Outreach Template
          </CardTitle>
          <CardDescription>
            Craft your message — it&apos;s copied to clipboard before each
            DM window opens. Click a variable chip to insert it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="min-h-[120px] text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Insert:</span>
            {TEMPLATE_VARS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertVariable(v.label)}
                className="rounded-full border bg-muted/60 px-2.5 py-0.5 text-xs font-mono text-foreground hover:bg-primary hover:text-primary-foreground transition"
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="rounded-md border border-dashed bg-muted/30 p-3">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Live preview · @{previewCreator.handle}
            </p>
            <p className="whitespace-pre-wrap text-sm">{livePreview}</p>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              {creators.length} Profiles Found
            </CardTitle>
            <CardDescription>
              Export your results or send DMs directly. Click any handle to
              open the IG profile.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={onDMAll}
              disabled={creators.length === 0}
              className="gap-2"
            >
              <Send className="h-3.5 w-3.5" />
              DM All ({creators.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportCSV}
              disabled={creators.length === 0}
              className="gap-2"
            >
              <FileText className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportExcel}
              disabled={creators.length === 0}
              className="gap-2"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClearAll}
              disabled={creators.length === 0}
              className="gap-2 text-muted-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {creators.length === 0 ? (
            <p className="rounded-md border border-dashed border-transparent py-12 text-center text-sm text-muted-foreground">
              No creators yet. Enter seed accounts above and click{" "}
              <span className="font-medium">Find Creators</span>.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Profile</th>
                  <th className="px-3 py-2 text-left">Full Name</th>
                  <th className="px-3 py-2 text-right">Followers</th>
                  <th className="px-3 py-2 text-right">Engagement</th>
                  <th className="px-3 py-2 text-right">Quality</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Bio</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {creators.map((c, idx) => (
                  <tr key={c.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={c.profileUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 font-medium hover:text-primary"
                      >
                        <Instagram className="h-3.5 w-3.5" />
                        @{c.handle}
                        {c.isVerified && (
                          <Badge variant="secondary" className="ml-1 h-4 text-[9px]">
                            ✓
                          </Badge>
                        )}
                      </a>
                    </td>
                    <td className="px-3 py-2">{c.fullName || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtNumber(c.followers)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtPct(c.engagementRate)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium tabular-nums ${qualityColor(c.qualityScore)}`}
                      >
                        {c.qualityScore ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          className="inline-flex items-center gap-1 text-xs hover:text-primary"
                        >
                          <Mail className="h-3 w-3" />
                          {c.email}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {c.category ? (
                        <Badge variant="outline" className="text-[10px]">
                          {c.category}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <p className="line-clamp-2 max-w-[220px] text-xs text-muted-foreground">
                        {c.bio || "—"}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant={c.lastDmAt ? "secondary" : "default"}
                          onClick={() => onSendDM(c)}
                          className="h-7 gap-1 px-2 text-xs"
                          title={
                            c.lastDmAt
                              ? `Last DM ${new Date(c.lastDmAt).toLocaleDateString()}`
                              : "Copy template + open IG"
                          }
                        >
                          <Send className="h-3 w-3" />
                          {c.lastDmAt ? "Re-DM" : "DM"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          asChild
                          className="h-7 px-2"
                          title="Open profile"
                        >
                          <a
                            href={c.profileUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onDelete(c)}
                          className="h-7 px-2 text-muted-foreground"
                          title="Remove"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Keep Download icon import alive for tree-shaking detection.
void Download;
