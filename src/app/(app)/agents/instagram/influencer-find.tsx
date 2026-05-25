"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  X,
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
  startIGSeedDiscoveryAction,
  pollIGDiscoveryAction,
  recordIGDmSentAction,
  deleteIGCreatorAction,
  clearIGCreatorsAction,
} from "./discover-actions";

const POLL_INTERVAL_MS = 4_000;
const MAX_RUN_MS = 15 * 60 * 1000; // 15 minutes
const RUN_STORAGE_KEY = "ig-discovery-run";

type RunInfo = {
  runId: string;
  datasetId: string;
  startedAt: number;
  seeds: string[];
};

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function prettyStatus(s: string | null): string {
  if (!s) return "Starting…";
  if (s === "READY") return "Queued";
  if (s === "RUNNING") return "Scraping creators";
  if (s === "SUCCEEDED") return "Finishing up";
  if (s === "FAILED") return "Failed";
  if (s === "ABORTED") return "Aborted";
  if (s === "TIMED-OUT") return "Timed out";
  return s;
}

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
  const [maxProfiles, setMaxProfiles] = useState("100");
  const [categoryHint, setCategoryHint] = useState("");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [creators, setCreators] = useState<CreatorRow[]>(initialCreators);
  const [pending, startTransition] = useTransition();
  const [run, setRun] = useState<RunInfo | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore an in-progress run after a page refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(RUN_STORAGE_KEY);
      if (!raw) return;
      const r = JSON.parse(raw) as RunInfo;
      if (
        r &&
        typeof r.runId === "string" &&
        typeof r.datasetId === "string" &&
        Date.now() - r.startedAt < MAX_RUN_MS
      ) {
        setRun(r);
        setRunStatus("RUNNING");
        kickoffPolling(r);
      } else {
        window.localStorage.removeItem(RUN_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick the elapsed timer once per second while a run is in flight.
  useEffect(() => {
    if (!run) {
      if (tickTimerRef.current) {
        clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
      return;
    }
    setElapsedMs(Date.now() - run.startedAt);
    tickTimerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - run.startedAt);
    }, 1000);
    return () => {
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    };
  }, [run]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    };
  }, []);

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

  function persistRun(r: RunInfo | null) {
    if (typeof window === "undefined") return;
    if (r) window.localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(r));
    else window.localStorage.removeItem(RUN_STORAGE_KEY);
  }

  function clearRunState() {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setRun(null);
    setRunStatus(null);
    setElapsedMs(0);
    persistRun(null);
  }

  function kickoffPolling(r: RunInfo) {
    const tick = async () => {
      // Hard ceiling — surface a timeout error instead of polling forever.
      if (Date.now() - r.startedAt > MAX_RUN_MS) {
        toast.error("Discovery timed out", {
          description:
            "The Apify run is taking longer than 15 minutes. Check the Apify console — your results may still arrive later.",
        });
        clearRunState();
        return;
      }
      try {
        const res = await pollIGDiscoveryAction({
          runId: r.runId,
          datasetId: r.datasetId,
        });
        if (!res.ok) {
          toast.error("Discovery failed", { description: res.error });
          clearRunState();
          return;
        }
        setRunStatus(res.status);
        if (res.finished) {
          toast.success(`Found ${res.found} creators`, {
            description:
              res.saved > 0
                ? `Saved ${res.saved} to your influencer list.`
                : "No new profiles matched the filters.",
          });
          clearRunState();
          if (typeof window !== "undefined") window.location.reload();
          return;
        }
      } catch (err) {
        // Transient network blips shouldn't kill the polling loop — log once
        // and keep trying. The MAX_RUN_MS guard will eventually stop it.
        console.warn("[ig] poll error:", err);
      }
      pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    };
    pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
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
    setRunStatus("Starting…");
    startTransition(async () => {
      try {
        const res = await startIGSeedDiscoveryAction({
          seeds,
          minFollowers: minFollowers ? parseInt(minFollowers, 10) : undefined,
          maxFollowers: maxFollowers ? parseInt(maxFollowers, 10) : undefined,
          maxProfiles: maxProfiles ? parseInt(maxProfiles, 10) : undefined,
        });
        if (!res.ok) {
          setRunStatus(null);
          toast.error("Could not start discovery", { description: res.error });
          return;
        }
        const r: RunInfo = {
          runId: res.runId,
          datasetId: res.datasetId,
          startedAt: Date.now(),
          seeds,
        };
        setRun(r);
        setRunStatus(res.status);
        persistRun(r);
        toast.success("Scraper started", {
          description: `Run ${res.runId.slice(0, 8)}… on ${res.actor}. Polling every 4s — this usually takes 1–5 min.`,
        });
        kickoffPolling(r);
      } catch (err) {
        setRunStatus(null);
        toast.error("Could not start discovery", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  async function onCancelRun() {
    if (!run) return;
    if (
      !confirm(
        "Stop polling for this run? The Apify job will keep running on the server and you'll be billed for whatever profiles it analyzes before it finishes. Restart the discovery page later to see results."
      )
    ) {
      return;
    }
    clearRunState();
    toast.info("Stopped polling. The Apify job will finish in the background.");
  }

  const runActive = !!run;
  const progressPct = runActive
    ? Math.min(95, 5 + Math.round((elapsedMs / MAX_RUN_MS) * 90))
    : 0;

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

          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="minF" className="text-xs">
                Min followers
              </Label>
              <Input
                id="minF"
                inputMode="numeric"
                value={minFollowers}
                onChange={(e) => setMinFollowers(e.target.value.replace(/[^0-9]/g, ""))}
                disabled={pending || runActive}
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
                disabled={pending || runActive}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="maxP" className="text-xs">
                Max profiles ($0.01/each)
              </Label>
              <Input
                id="maxP"
                inputMode="numeric"
                value={maxProfiles}
                onChange={(e) => setMaxProfiles(e.target.value.replace(/[^0-9]/g, ""))}
                disabled={pending || runActive}
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
                disabled={pending || runActive}
                className="mt-1"
              />
            </div>
          </div>

          {runActive && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {prettyStatus(runStatus)}
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {fmtElapsed(elapsedMs)}
                  </span>
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onCancelRun}
                  className="h-7 gap-1 text-xs text-muted-foreground"
                >
                  <X className="h-3 w-3" />
                  Stop polling
                </Button>
              </div>
              <Progress value={progressPct} className="mt-2 h-1.5" />
              <p className="mt-2 text-xs text-muted-foreground">
                Apify network expansion for{" "}
                {run?.seeds.map((s) => `@${s}`).join(", ")}. Usually 1–5
                minutes; up to 15 min for large maxProfiles. You can leave
                this tab open or come back later — the run survives a
                refresh.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={onDiscover}
              disabled={pending || runActive}
              className="gap-2"
            >
              {pending || runActive ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {runActive ? "Discovery running…" : "Find Creators"}
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
