"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Info, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { cn } from "@/shared/utils";
import { PlatformIcon } from "@/frontend/components/app/cmo/platform-icon";
import {
  loadAiCitationsAction,
  pollAiCitationsRunAction,
  startAiCitationsRunAction,
} from "./ai-citations-actions";
import {
  PLATFORMS,
  type AiCitationsBundle,
  type PlatformKey,
  type PlatformCounts,
} from "./ai-citations-types";

function fmtCount(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function delta(current?: PlatformCounts, previous?: PlatformCounts) {
  const c = current?.citations;
  const p = previous?.citations;
  return {
    citationsDelta: c !== undefined && p !== undefined ? c - p : null,
  };
}

function formatDelta(n: number | null): string {
  if (n === null) return "";
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `${n}`;
}

function deltaClass(n: number | null): string {
  if (n === null || n === 0) return "text-muted-foreground";
  return n > 0 ? "text-emerald-500" : "text-rose-500";
}

// PlatformIcon (AI-platform brand logos) is shared with the dashboard
// Analytics GEO tab — see ./platform-icon via the cmo components dir.


// ---------------------------------------------------------------------------

export function AiCitationsPanel({
  initial,
  domain,
}: {
  initial: AiCitationsBundle | null;
  domain: string;
}) {
  const [bundle, setBundle] = useState<AiCitationsBundle | null>(initial);
  const [pending, startTransition] = useTransition();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const pollAbort = useRef<{ cancelled: boolean }>({ cancelled: false });

  useEffect(() => {
    // Clean up any in-flight poll when the component unmounts.
    return () => {
      pollAbort.current.cancelled = true;
    };
  }, []);

  function refresh() {
    startTransition(async () => {
      const res = await loadAiCitationsAction({ domain });
      if (!res.ok) {
        toast.error("Couldn't load AI citations.");
        return;
      }
      setBundle(res.data);
      if (res.data) toast.success("Loaded from cache.");
      else toast.message("No cached result yet — click 'Run check' to fetch.");
    });
  }

  async function runFreshCheck() {
    if (!domain) {
      toast.error("Set your website URL in Settings first.");
      return;
    }
    pollAbort.current = { cancelled: false };
    setStatusMsg("Starting AI citations check…");
    startTransition(async () => {
      const res = await startAiCitationsRunAction({ domain });
      if (!res.ok) {
        setStatusMsg(null);
        toast.error(res.error);
        return;
      }
      if (!res.pending) {
        setStatusMsg(null);
        setBundle(res.data);
        toast.success("Loaded from cache.");
        return;
      }
      // Poll until the actor finishes (typically 30-90s).
      const start = Date.now();
      setStatusMsg("Running… first call can take 60–90s.");
      while (!pollAbort.current.cancelled) {
        await new Promise((r) => setTimeout(r, 4000));
        const elapsed = Math.round((Date.now() - start) / 1000);
        setStatusMsg(`Running… ${elapsed}s elapsed.`);
        const p = await pollAiCitationsRunAction({
          runId: res.runId,
          datasetId: res.datasetId,
          domain,
        });
        if (!p.ok) {
          setStatusMsg(null);
          toast.error(p.error);
          return;
        }
        if (p.status === "DONE") {
          setStatusMsg(null);
          setBundle(p.data);
          const platformCount = Object.keys(p.data.current).length;
          toast.success(`Got citations for ${platformCount} platform${platformCount === 1 ? "" : "s"}.`);
          return;
        }
      }
    });
  }

  const platformsCited = bundle
    ? PLATFORMS.filter((p) => (bundle.current[p.key]?.citations ?? 0) > 0)
    : [];
  const totalCitations = bundle
    ? PLATFORMS.reduce((acc, p) => acc + (bundle.current[p.key]?.citations ?? 0), 0)
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <CardTitle className="flex items-center gap-1.5 text-base">
              AI citations
              <span
                className="inline-flex"
                title="Returns per-platform citation counts across the major AI answer engines for your brand keyword. Cached 24h."
              >
                <Info className="h-3 w-3 text-muted-foreground" />
              </span>
            </CardTitle>
            {bundle ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {totalCitations.toLocaleString()}
                </span>{" "}
                total citations across{" "}
                <span className="font-medium text-foreground">{platformsCited.length}</span>{" "}
                {platformsCited.length === 1 ? "platform" : "platforms"}
                {platformsCited.length > 0 && (
                  <> — {platformsCited.map((p) => p.label).join(", ")}</>
                )}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                One run powers all 6 tiles. Click <b>Run check</b> to fetch.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={runFreshCheck}
              disabled={pending || !domain}
              className="gap-1.5"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Run check
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!domain && (
          <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            Add your website URL in Settings to track AI citations.
          </p>
        )}

        {statusMsg && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {statusMsg}
          </div>
        )}

        {domain && !bundle && !statusMsg && (
          <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            No AI citation data yet for <span className="font-medium">{domain}</span>.
            <br />
            Click <span className="font-medium">Run check</span> to fetch citations
            across the major AI answer engines in a single call.
          </p>
        )}

        {bundle && <CitationsBody bundle={bundle} />}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function CitationsBody({ bundle }: { bundle: AiCitationsBundle }) {
  const hero: PlatformKey[] = ["aiOverviews", "chatgpt"];
  const tableRows: PlatformKey[] = ["gemini", "perplexity", "copilot", "grok"];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {hero.map((k) => (
          <HeroCard
            key={k}
            platformKey={k}
            current={bundle.current[k]}
            previous={bundle.previous[k]}
          />
        ))}
      </div>

      <div className="rounded-md border">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>Platform</span>
          <span className="text-right">Citations</span>
        </div>
        {tableRows.map((k) => (
          <PlatformRow
            key={k}
            platformKey={k}
            current={bundle.current[k]}
            previous={bundle.previous[k]}
          />
        ))}
      </div>

      <div className="text-[10px] text-muted-foreground">
        Domain <span className="font-medium">{bundle.domain}</span> · Updated{" "}
        {new Date(bundle.fetchedAt).toLocaleString()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function HeroCard({
  platformKey,
  current,
  previous,
}: {
  platformKey: PlatformKey;
  current?: PlatformCounts;
  previous?: PlatformCounts;
}) {
  const meta = PLATFORMS.find((p) => p.key === platformKey);
  const { citationsDelta } = delta(current, previous);
  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <span>{meta?.label}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <PlatformIcon k={platformKey} className="h-6 w-6" />
        <span className="text-4xl font-semibold tabular-nums text-sky-400">
          {fmtCount(current?.citations)}
        </span>
        {citationsDelta !== null && citationsDelta !== 0 && (
          <span className={cn("text-sm tabular-nums", deltaClass(citationsDelta))}>
            {formatDelta(citationsDelta)}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function PlatformRow({
  platformKey,
  current,
  previous,
}: {
  platformKey: PlatformKey;
  current?: PlatformCounts;
  previous?: PlatformCounts;
}) {
  const meta = PLATFORMS.find((p) => p.key === platformKey);
  const { citationsDelta } = delta(current, previous);
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 border-b px-3 py-2 text-sm last:border-b-0">
      <div className="flex items-center gap-2">
        <PlatformIcon k={platformKey} />
        <span>{meta?.label}</span>
      </div>
      <div className="flex items-center justify-end gap-2 tabular-nums">
        <span className="text-sky-400">{fmtCount(current?.citations)}</span>
        {citationsDelta !== null && citationsDelta !== 0 && (
          <span className={cn("text-xs", deltaClass(citationsDelta))}>
            {formatDelta(citationsDelta)}
          </span>
        )}
      </div>
    </div>
  );
}
