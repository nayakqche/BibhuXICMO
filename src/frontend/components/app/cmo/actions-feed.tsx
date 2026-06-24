"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  Globe,
  Hash,
  Instagram,
  Lock,
  MessageCircle,
  Newspaper,
  Search,
  Sparkles,
  Linkedin,
  TrendingUp,
  Twitter,
  Youtube,
  X as XIcon,
} from "lucide-react";
import { Badge } from "@/frontend/components/ui/badge";
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
  | "seo-geo"
  | "x"
  | "articles"
  | "hn"
  | "linkedin"
  | "other";

const GROUP_ORDER: GroupId[] = [
  "reddit",
  "seo-geo",
  "x",
  "articles",
  "hn",
  "linkedin",
  "other",
];

const GROUP_META: Record<
  GroupId,
  {
    label: string;
    icon: typeof Sparkles;
    cta: string;
    /** When true, contents are blurred for FREE plan with an Upgrade CTA. */
    maxOnly?: boolean;
  }
> = {
  reddit: {
    label: "Reddit opportunities",
    icon: MessageCircle,
    cta: "Post",
    maxOnly: true,
  },
  "seo-geo": {
    label: "SEO & GEO recommendations",
    icon: TrendingUp,
    cta: "Fix",
  },
  x: { label: "X writer", icon: Hash, cta: "Post" },
  articles: { label: "Articles", icon: FileText, cta: "Open" },
  hn: { label: "Hacker News", icon: Newspaper, cta: "Open", maxOnly: true },
  linkedin: { label: "LinkedIn writer", icon: Linkedin, cta: "Post", maxOnly: true },
  other: { label: "Other actions", icon: Sparkles, cta: "Open" },
};

/**
 * Per-agent visual identity for the action rows. Each agent gets a
 * dedicated icon + colour so a glance at the feed tells you which agent
 * raised the action. Colours are tuned to read in both light and dark
 * themes (soft tinted background + saturated border/text/icon).
 */
type AgentVisual = {
  label: string;
  icon: typeof Sparkles;
  /** Tailwind classes for the badge container (bg + border + text). */
  badge: string;
  /** Tailwind class for the left accent rail on the row. */
  rail: string;
};

const AGENT_VISUALS: Record<string, AgentVisual> = {
  seo: {
    label: "SEO",
    icon: Search,
    badge:
      "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
    rail: "bg-emerald-500",
  },
  geo: {
    label: "GEO",
    icon: Globe,
    badge:
      "bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-400",
    rail: "bg-violet-500",
  },
  reddit: {
    label: "Reddit",
    icon: MessageCircle,
    badge:
      "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400",
    rail: "bg-orange-500",
  },
  x: {
    label: "X",
    icon: Twitter,
    badge:
      "bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400",
    rail: "bg-sky-500",
  },
  twitter: {
    label: "X",
    icon: Twitter,
    badge:
      "bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400",
    rail: "bg-sky-500",
  },
  linkedin: {
    label: "LinkedIn",
    icon: Linkedin,
    badge:
      "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
    rail: "bg-blue-500",
  },
  content: {
    label: "Article",
    icon: FileText,
    badge:
      "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
    rail: "bg-amber-500",
  },
  hn: {
    label: "Hacker News",
    icon: Newspaper,
    badge:
      "bg-orange-600/10 border-orange-600/30 text-orange-700 dark:text-orange-400",
    rail: "bg-orange-600",
  },
  hackernews: {
    label: "Hacker News",
    icon: Newspaper,
    badge:
      "bg-orange-600/10 border-orange-600/30 text-orange-700 dark:text-orange-400",
    rail: "bg-orange-600",
  },
  youtube: {
    label: "YouTube",
    icon: Youtube,
    badge:
      "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
    rail: "bg-red-500",
  },
  instagram: {
    label: "Instagram",
    icon: Instagram,
    badge:
      "bg-pink-500/10 border-pink-500/30 text-pink-600 dark:text-pink-400",
    rail: "bg-pink-500",
  },
};

const DEFAULT_AGENT_VISUAL: AgentVisual = {
  label: "Agent",
  icon: Sparkles,
  badge:
    "bg-slate-500/10 border-slate-500/30 text-slate-600 dark:text-slate-400",
  rail: "bg-slate-400",
};

function agentVisual(agent: string): AgentVisual {
  return AGENT_VISUALS[agent.toLowerCase()] ?? DEFAULT_AGENT_VISUAL;
}

function AgentBadge({ agent }: { agent: string }) {
  const v = agentVisual(agent);
  const Icon = v.icon;
  return (
    <span
      className={
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
        v.badge
      }
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {v.label}
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

  const [open, setOpen] = useState<Record<GroupId, boolean>>(
    Object.fromEntries(GROUP_ORDER.map((g) => [g, true])) as Record<GroupId, boolean>
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
              <div key={g} className="rounded-lg border bg-card/50">
                <button
                  type="button"
                  onClick={() => setOpen((p) => ({ ...p, [g]: !p[g] }))}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/30"
                  aria-expanded={isOpen}
                >
                  <meta.icon className="h-3.5 w-3.5 text-primary" aria-hidden />
                  <span className="font-medium">{meta.label}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {list.length} ready
                  </Badge>
                  <ChevronDown
                    className={
                      "ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform " +
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
  const v = agentVisual(item.agent);

  return (
    <li className="relative flex items-start gap-3 py-2.5 pl-4 pr-3 text-sm transition-colors hover:bg-muted/20">
      {/* Agent-coloured accent rail */}
      <span
        className={"absolute inset-y-0 left-0 w-1 " + v.rail}
        aria-hidden
      />
      <PriorityDot p={item.priority} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <AgentBadge agent={item.agent} />
          <span className="truncate font-medium">{item.title}</span>
        </div>
        {item.summary ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {item.summary}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.href ? (
          <Button size="sm" variant="default" asChild>
            <Link href={item.href}>
              {item.cta || cta}
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </Button>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
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
          className="h-7 w-7"
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

function PriorityDot({ p }: { p: string }) {
  const color =
    p === "URGENT"
      ? "bg-red-500"
      : p === "HIGH"
        ? "bg-orange-500"
        : p === "MEDIUM"
          ? "bg-amber-500"
          : "bg-slate-400";
  return (
    <span
      className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${color}`}
      aria-hidden
    />
  );
}

function groupKey(agent: string): GroupId {
  const a = agent.toLowerCase();
  if (a === "reddit") return "reddit";
  if (a === "seo" || a === "geo") return "seo-geo";
  if (a === "x" || a === "twitter") return "x";
  if (a === "linkedin") return "linkedin";
  if (a === "content") return "articles";
  if (a === "hn" || a === "hackernews") return "hn";
  return "other";
}
