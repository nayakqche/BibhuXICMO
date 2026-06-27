"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Terminal } from "lucide-react";
import { Card, CardContent } from "@/frontend/components/ui/card";

export type TerminalLine = { kind: "info" | "ok" | "warn" | "muted"; text: string };

/** Renders a fake-live terminal: lines are revealed sequentially with a brief delay. */
export function TerminalPanel({
  lines,
  intervalMs = 220,
  className,
  maxHeightClass = "max-h-56",
}: {
  lines: TerminalLine[];
  intervalMs?: number;
  className?: string;
  /** Tailwind max-height class on the scrolling body (default max-h-56). */
  maxHeightClass?: string;
}) {
  const [shown, setShown] = useState(1);
  const [collapsed, setCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const total = lines.length;
  const finalLines = useMemo(() => lines, [lines]);

  // The single line shown when collapsed: prefer the most recent agent-run
  // line (e.g. "[seo] success · 2m ago"); fall back to the last line.
  const latestLine = useMemo<TerminalLine | null>(() => {
    if (lines.length === 0) return null;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^\s*\[[a-z]/i.test(lines[i].text)) return lines[i];
    }
    return lines[lines.length - 1];
  }, [lines]);

  useEffect(() => {
    if (collapsed || shown >= total) return;
    const t = setTimeout(() => setShown((n) => Math.min(total, n + 1)), intervalMs);
    return () => clearTimeout(t);
  }, [shown, total, intervalMs, collapsed]);

  useEffect(() => {
    if (collapsed) return;
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, collapsed]);

  return (
    <Card
      className={
        "border-emerald-500/20 bg-zinc-950 font-mono text-[11px] text-zinc-100 " +
        (className ?? "")
      }
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-zinc-800 px-3 py-1.5 text-left transition-colors hover:bg-zinc-900/60"
        aria-expanded={!collapsed}
        title={collapsed ? "Expand log" : "Collapse log"}
      >
        <Terminal className="h-3 w-3 text-emerald-400" aria-hidden />
        <span className="text-[10px] uppercase tracking-wider text-zinc-400">
          Live agent log
        </span>
        {/* When collapsed, show the latest run inline next to the title. */}
        {collapsed && latestLine ? (
          <span className="ml-2 min-w-0 flex-1 truncate text-[10px] text-zinc-500">
            <span className={kindClass(latestLine.kind)}>{latestLine.text}</span>
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        <ChevronDown
          className={
            "h-3.5 w-3.5 text-zinc-500 transition-transform " +
            (collapsed ? "-rotate-90" : "")
          }
          aria-hidden
        />
      </button>
      {!collapsed ? (
        <CardContent
          ref={containerRef}
          className={`${maxHeightClass} space-y-0.5 overflow-y-auto px-3 py-2 text-zinc-300`}
        >
          {finalLines.slice(0, shown).map((line, i) => (
            <div key={i} className="leading-relaxed">
              <span className="select-none text-zinc-500">&gt; </span>
              <span className={kindClass(line.kind)}>{line.text}</span>
              {i === shown - 1 && shown < total ? (
                <span className="ml-1 inline-block h-3 w-1.5 -translate-y-px animate-pulse bg-emerald-400 align-middle" />
              ) : null}
            </div>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}

function kindClass(k: TerminalLine["kind"]): string {
  switch (k) {
    case "ok":
      return "text-emerald-300";
    case "warn":
      return "text-amber-300";
    case "muted":
      return "text-zinc-500";
    case "info":
    default:
      return "text-zinc-200";
  }
}
