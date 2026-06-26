"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  Hash,
  Instagram,
  Lock,
  MessageCircle,
  Newspaper,
  PenTool,
  Sparkles,
  Linkedin,
  TrendingUp,
  Twitter,
  Youtube,
  X as XIcon,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { resolveActionItem } from "@/app/(app)/agents/actions";
import type { ActionLite } from "@/backend/agents/cmo-data";

type GroupId =
  | "reddit"
  | "seo"
  | "geo"
  | "x"
  | "articles"
  | "hn"
  | "linkedin"
  | "other";

const GROUP_ORDER: GroupId[] = [
  "seo",
  "geo",
  "reddit",
  "x",
  "linkedin",
  "articles",
  "hn",
  "other",
];

const GROUP_META: Record<
  GroupId,
  {
    label: string;
    icon: typeof Sparkles;
    cta: string;
    /** Noun used in the collapsed summary line ("3 opportunities ready"). */
    unit: string;
    /** When true, contents are blurred for FREE plan with an Upgrade CTA. */
    maxOnly?: boolean;
  }
> = {
  reddit: {
    label: "Reddit opportunities",
    icon: MessageCircle,
    cta: "Post",
    unit: "opportunity",
    maxOnly: true,
  },
  seo: {
    label: "SEO recommendations",
    icon: TrendingUp,
    cta: "Fix",
    unit: "fix",
  },
  geo: {
    label: "GEO recommendations",
    icon: Sparkles,
    cta: "See analysis",
    unit: "insight",
  },
  x: { label: "X writer", icon: Hash, cta: "Post", unit: "idea" },
  articles: { label: "Articles", icon: FileText, cta: "Open", unit: "topic" },
  hn: { label: "Hacker News", icon: Newspaper, cta: "Open", unit: "post", maxOnly: true },
  linkedin: { label: "LinkedIn writer", icon: Linkedin, cta: "Post", unit: "post", maxOnly: true },
  other: { label: "Other actions", icon: Sparkles, cta: "Open", unit: "action" },
};

/** "3 recommendations ready" / "1 post ready" */
function summaryLine(count: number, unit: string): string {
  const noun = count === 1 ? unit : `${unit}s`;
  return `${count} ${noun} ready`;
}

/**
 * Per-agent visual identity for action rows. Each agent gets a small
 * gradient "app icon" tile — like iOS / Linear / Notion app marks — so
 * the feed reads at a glance without leaning on cheap solid-color
 * badges. Brand-color gradients match each platform's identity (Reddit
 * orange→red, X charcoal, LinkedIn blue, Instagram fuchsia→pink→orange,
 * etc.); generative agents (SEO, GEO, Article) use sophisticated
 * dual-stop gradients in their category color.
 */
type AgentBrand = {
  /** Human-readable label shown under/next to the tile. */
  label: string;
  /** Lucide icon component rendered inside the tile (white). */
  icon: typeof Sparkles;
  /** Tile background — bg-gradient-to-br + two stops. */
  tileBg: string;
  /** Optional override for the icon color (defaults to text-white). */
  iconColor?: string;
  /** Optional accent text color used for the agent label caption. */
  textAccent: string;
};

const AGENT_BRANDS: Record<string, AgentBrand> = {
  seo: {
    label: "SEO",
    icon: TrendingUp,
    tileBg: "bg-gradient-to-br from-emerald-400 to-teal-600",
    textAccent: "text-emerald-600 dark:text-emerald-400",
  },
  geo: {
    label: "GEO",
    icon: Sparkles,
    tileBg: "bg-gradient-to-br from-violet-500 via-fuchsia-500 to-indigo-600",
    textAccent: "text-violet-600 dark:text-violet-400",
  },
  reddit: {
    label: "Reddit",
    icon: MessageCircle,
    tileBg: "bg-gradient-to-br from-orange-400 to-red-600",
    textAccent: "text-orange-600 dark:text-orange-400",
  },
  x: {
    label: "X",
    icon: Twitter,
    tileBg: "bg-gradient-to-br from-zinc-800 to-black",
    textAccent: "text-foreground",
  },
  twitter: {
    label: "X",
    icon: Twitter,
    tileBg: "bg-gradient-to-br from-zinc-800 to-black",
    textAccent: "text-foreground",
  },
  linkedin: {
    label: "LinkedIn",
    icon: Linkedin,
    tileBg: "bg-gradient-to-br from-blue-500 to-blue-700",
    textAccent: "text-blue-600 dark:text-blue-400",
  },
  content: {
    label: "Article",
    icon: PenTool,
    tileBg: "bg-gradient-to-br from-amber-400 to-orange-500",
    textAccent: "text-amber-600 dark:text-amber-400",
  },
  hn: {
    label: "Hacker News",
    icon: Newspaper,
    tileBg: "bg-gradient-to-br from-orange-500 to-amber-600",
    textAccent: "text-orange-600 dark:text-orange-400",
  },
  hackernews: {
    label: "Hacker News",
    icon: Newspaper,
    tileBg: "bg-gradient-to-br from-orange-500 to-amber-600",
    textAccent: "text-orange-600 dark:text-orange-400",
  },
  youtube: {
    label: "YouTube",
    icon: Youtube,
    tileBg: "bg-gradient-to-br from-red-500 to-rose-600",
    textAccent: "text-red-600 dark:text-red-400",
  },
  instagram: {
    label: "Instagram",
    icon: Instagram,
    tileBg:
      "bg-gradient-to-br from-amber-400 via-pink-500 to-fuchsia-600",
    textAccent: "text-pink-600 dark:text-pink-400",
  },
};

const DEFAULT_BRAND: AgentBrand = {
  label: "Agent",
  icon: Sparkles,
  tileBg: "bg-gradient-to-br from-slate-400 to-slate-600",
  textAccent: "text-muted-foreground",
};

function agentBrand(agent: string): AgentBrand {
  return AGENT_BRANDS[agent.toLowerCase()] ?? DEFAULT_BRAND;
}

/** Pick a brand visual for the group header — one per agent now. */
function groupBrand(group: GroupId): AgentBrand {
  if (group === "articles") return agentBrand("content");
  if (group === "other") return DEFAULT_BRAND;
  return agentBrand(group);
}

function GroupTile({ groupId }: { groupId: GroupId }) {
  const b = groupBrand(groupId);
  const Icon = b.icon;
  return (
    <span
      className={
        "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] shadow-sm ring-1 ring-inset ring-white/20 dark:ring-white/10 " +
        b.tileBg
      }
      aria-hidden
    >
      <Icon className="h-3.5 w-3.5 text-white drop-shadow-sm" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[8px] bg-gradient-to-b from-white/15 to-transparent" />
    </span>
  );
}

/**
 * Square gradient "app icon" tile. Inner ring + soft shadow give it
 * the same physical-light feel as iOS / Linear / Notion app marks.
 */
function AgentTile({
  agent,
  size = "md",
}: {
  agent: string;
  size?: "sm" | "md";
}) {
  const b = agentBrand(agent);
  const Icon = b.icon;
  const tileSize = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  return (
    <span
      className={
        "relative flex shrink-0 items-center justify-center rounded-[8px] shadow-sm ring-1 ring-inset ring-white/20 dark:ring-white/10 " +
        tileSize +
        " " +
        b.tileBg
      }
      aria-hidden
    >
      <Icon className={`${iconSize} ${b.iconColor ?? "text-white"} drop-shadow-sm`} />
      {/* Subtle top gloss for the app-icon feel */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[8px] bg-gradient-to-b from-white/15 to-transparent" />
    </span>
  );
}

export function ActionsFeed({
  items,
  plan,
  listeningHint,
}: {
  items: ActionLite[];
  plan: "FREE" | "MAX";
  /** Optional copy from AI CMO analysis (Reddit / social listening angle). */
  listeningHint?: string | null;
}) {
  const grouped = new Map<GroupId, ActionLite[]>();
  for (const id of GROUP_ORDER) grouped.set(id, []);
  for (const item of items) grouped.get(groupKey(item.agent))!.push(item);

  // Collapsed by default — the feed reads as a tidy stack of agent rows
  // (icon · name · "N ready" · count), and you expand only the channel you
  // want to act on. Keeps the panel calm instead of a wall of cramped rows.
  const [open, setOpen] = useState<Record<GroupId, boolean>>(
    Object.fromEntries(GROUP_ORDER.map((g) => [g, false])) as Record<GroupId, boolean>
  );

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            Actions feed
            <span className="ml-1 inline-block h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
          </CardTitle>
          <CardDescription>
            {items.length} open · grouped by channel
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/actions">
            All items
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 overflow-y-auto">
        {listeningHint ? (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Listening angle:</span>{" "}
            {listeningHint}
          </div>
        ) : null}
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed py-10 text-center text-xs text-muted-foreground">
            No open actions yet. Finish onboarding and run agents from the sidebar.
          </div>
        ) : (
          GROUP_ORDER.map((g) => {
            const list = grouped.get(g)!;
            if (list.length === 0) return null;
            const meta = GROUP_META[g];
            const locked = !!meta.maxOnly && plan === "FREE";
            const isOpen = open[g];
            return (
              <div
                key={g}
                className="overflow-hidden rounded-xl border border-border/60 bg-card/40 shadow-sm transition-shadow hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => setOpen((p) => ({ ...p, [g]: !p[g] }))}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/20"
                  aria-expanded={isOpen}
                >
                  <GroupTile groupId={g} />
                  {/* min-w-0 lets this column shrink and truncate instead of
                      shoving the count/chevron off-screen at narrow widths. */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold tracking-tight">
                      {meta.label}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {summaryLine(list.length, meta.unit)}
                    </div>
                  </div>
                  {/* Prominent count badge — the "how many to fix" signal. */}
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold tabular-nums text-primary">
                    {list.length}
                  </span>
                  <ChevronDown
                    className={
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform " +
                      (isOpen ? "rotate-180" : "")
                    }
                    aria-hidden
                  />
                </button>
                {isOpen ? (
                  <div className="relative border-t">
                    <ul
                      className={
                        "divide-y " + (locked ? "pointer-events-none select-none blur-sm" : "")
                      }
                      aria-hidden={locked}
                    >
                      {list.slice(0, 6).map((a) => (
                        <ActionRow key={a.id} item={a} cta={meta.cta} />
                      ))}
                    </ul>
                    {locked ? <PlanGate /> : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function PlanGate() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-background/40 via-background/70 to-background/85 p-3 text-center">
      <Lock className="h-4 w-4 text-primary" aria-hidden />
      <p className="text-xs text-muted-foreground">
        These items unlock on the Max plan.
      </p>
      <Button size="sm" asChild>
        <Link href="/billing">Upgrade</Link>
      </Button>
    </div>
  );
}

function ActionRow({ item, cta }: { item: ActionLite; cta: string }) {
  const [isPending, startTransition] = useTransition();
  const brand = agentBrand(item.agent);

  return (
    <li className="flex flex-col gap-2 px-3 py-3 text-sm transition-colors hover:bg-muted/30">
      {/* Row 1: tile + text. min-w-0 + truncate/clamp guarantees the text
          column shrinks cleanly and never overlaps anything. */}
      <div className="flex items-start gap-2.5">
        <AgentTile agent={item.agent} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] ${brand.textAccent}`}
            >
              {brand.label}
            </span>
            <PriorityPill p={item.priority} />
          </div>
          <div className="mt-0.5 line-clamp-2 break-words font-medium leading-snug text-foreground">
            {item.title}
          </div>
          {item.summary ? (
            <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">
              {item.summary}
            </p>
          ) : null}
        </div>
      </div>

      {/* Row 2: actions on their own line — structurally can't collide with
          the text above, so the layout holds at any panel width. */}
      <div className="flex items-center gap-1.5 pl-[2.125rem]">
        {item.href ? (
          <Button size="sm" variant="default" className="h-7 flex-1 gap-1 px-2 text-xs" asChild>
            <Link href={item.href}>
              <span className="truncate">{item.cta || cta}</span>
              <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
            </Link>
          </Button>
        ) : (
          <span className="flex-1" />
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          aria-label="Mark done"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await resolveActionItem(item.id, "DONE");
              toast.success("Marked done");
            })
          }
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          aria-label="Dismiss"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await resolveActionItem(item.id, "DISMISSED");
              toast("Dismissed");
            })
          }
        >
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

/** Compact coloured priority pill — fixed width, never wraps or overflows. */
function PriorityPill({ p }: { p: string }) {
  const high = p === "URGENT" || p === "HIGH";
  const label = high ? "High" : p === "MEDIUM" ? "Medium" : "Low";
  const cls = high
    ? "bg-orange-500/15 text-orange-500"
    : p === "MEDIUM"
      ? "bg-amber-500/15 text-amber-500"
      : "bg-muted text-muted-foreground";
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}


function groupKey(agent: string): GroupId {
  const a = agent.toLowerCase();
  if (a === "reddit") return "reddit";
  if (a === "seo") return "seo";
  if (a === "geo") return "geo";
  if (a === "x" || a === "twitter") return "x";
  if (a === "linkedin") return "linkedin";
  if (a === "content") return "articles";
  if (a === "hn" || a === "hackernews") return "hn";
  return "other";
}
