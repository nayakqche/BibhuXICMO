"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

const STAGES: Array<{ at: number; label: string }> = [
  { at: 0, label: "Warming up the kitchen…" },
  { at: 0.12, label: "Scraping the homepage…" },
  { at: 0.28, label: "Cooking competitor analysis…" },
  { at: 0.45, label: "Picking up social handles…" },
  { at: 0.6, label: "Fetching Ahrefs metrics…" },
  { at: 0.75, label: "Drafting brand voice…" },
  { at: 0.88, label: "Plating marketing strategy…" },
  { at: 0.96, label: "Almost there — getting insights…" },
];

/**
 * Bottom-center progress toast for the Company panel's site analysis.
 *
 * Fixed-position overlay shown while the analysis pipeline is running.
 * Fills a 2-minute progress bar with rotating stage labels. The parent
 * unmounts this component the moment analysis completes (or times out),
 * so there's no "done" state to manage in here.
 */
export function AnalysisProgressToast({
  url,
  durationMs,
}: {
  url: string;
  durationMs: number;
}) {
  const [startedAt] = useState(() => {
    if (typeof window === "undefined") return Date.now();
    const key = `cmo:analysis-started:${url}`;
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) {
        const n = Number(stored);
        if (Number.isFinite(n)) return n;
      }
    } catch {
      // ignore
    }
    return Date.now();
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, now - startedAt);
  const progress = Math.min(1, elapsed / durationMs);
  const stage =
    STAGES.slice()
      .reverse()
      .find((s) => progress >= s.at) ?? STAGES[0];
  const secondsLeft = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-md rounded-xl border border-primary/30 bg-background/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2">
          <Sparkles
            className="h-4 w-4 shrink-0 animate-pulse text-primary"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-foreground">
              {stage.label}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              Analyzing {stripScheme(url)} · ~{secondsLeft}s left
            </div>
          </div>
          <div className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
            {Math.round(progress * 100)}%
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-500 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function stripScheme(u: string): string {
  return u
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}
