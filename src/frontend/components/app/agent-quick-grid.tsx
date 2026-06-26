import Link from "next/link";
import { ArrowRight, Zap, Bot } from "lucide-react";
import { Card, CardContent } from "@/frontend/components/ui/card";
import { listAgentMeta } from "@/shared/agent-meta";
import {
  ContentLogo,
  GeoLogo,
  HackerNewsLogo,
  InstagramLogo,
  LinkedinLogo,
  RedditLogo,
  SeoLogo,
  XLogo,
} from "@/frontend/components/brand-logos";
import { RunAgentButton } from "./run-agent-button";

/** Brand glyph per agent — rendered full-bleed in the 36px tile. */
const BRAND_LOGOS: Record<string, React.ElementType> = {
  seo: SeoLogo,
  geo: GeoLogo,
  content: ContentLogo,
  reddit: RedditLogo,
  hn: HackerNewsLogo,
  x: XLogo,
  linkedin: LinkedinLogo,
  instagram: InstagramLogo,
};

/** Fallback tile tint when an agent has no dedicated brand logo. */
const FALLBACK_TILE = "bg-primary/10 text-primary";

/**
 * Compact grid of all agents on the dashboard with a one-click run button
 * and the approximate credit cost so users can budget at a glance.
 */
export function AgentQuickGrid({
  lastRuns,
}: {
  lastRuns: Record<string, { startedAt: string; status: string } | undefined>;
}) {
  const agents = listAgentMeta();

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {agents.map((a) => {
        const Logo = BRAND_LOGOS[a.id];
        const last = lastRuns[a.id];
        return (
          <Card
            key={a.id}
            className="group flex flex-col transition-colors hover:border-primary/40"
          >
            <CardContent className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-start justify-between">
                <div className="flex h-9 w-9 items-center justify-center transition-transform group-hover:scale-105">
                  {Logo ? (
                    <Logo className="h-9 w-9" />
                  ) : (
                    <div className={`flex h-9 w-9 items-center justify-center rounded-md ${FALLBACK_TILE}`}>
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Zap className="h-2.5 w-2.5" />≈ {a.creditsApprox}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold">{a.label}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {a.description}
                </p>
                {last ? (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Last run: {new Date(last.startedAt).toLocaleDateString()} ·{" "}
                    <span
                      className={
                        last.status === "SUCCESS"
                          ? "text-emerald-500"
                          : last.status === "FAILED"
                            ? "text-destructive"
                            : ""
                      }
                    >
                      {last.status.toLowerCase()}
                    </span>
                  </p>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-2">
                <RunAgentButton
                  agentId={a.id}
                  size="sm"
                  variant="default"
                  label="Run"
                />
                <Link
                  href={a.href}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Open
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
