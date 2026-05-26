import { format } from "date-fns";
import { Sparkles, Check, X } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { hasSeoApifyToken } from "@/backend/ahrefs-tools";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { RunAgentButton } from "@/frontend/components/app/run-agent-button";
import { GeoTools } from "./geo-tools";
import { AiCitationsPanel } from "./ai-citations-panel";
import {
  PLATFORMS,
  type AiCitationsBundle,
  type PlatformKey,
  type PlatformCounts,
} from "./ai-citations-types";

export const metadata = { title: "GEO Agent" };

function normalizeDomain(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

async function loadInitialBundle(
  workspaceId: string,
  domain: string
): Promise<AiCitationsBundle | null> {
  if (!domain) return null;
  try {
    const snaps = await prisma.aiCitationSnapshot.findMany({
      where: { workspaceId, domain },
      orderBy: { fetchedAt: "desc" },
      take: 2,
    });
    if (snaps.length === 0) return null;
    const [latest, prev] = snaps;
    return {
      domain,
      country: latest.country,
      fetchedAt: latest.fetchedAt.toISOString(),
      previousAt: prev?.fetchedAt.toISOString() ?? null,
      current: (latest.data as Partial<Record<PlatformKey, PlatformCounts>>) ?? {},
      previous: prev
        ? (prev.data as Partial<Record<PlatformKey, PlatformCounts>>) ?? {}
        : {},
    };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") return null;
    throw err;
  }
}

export default async function GeoAgentPage() {
  const { workspace } = await requireWorkspace();
  const domain = normalizeDomain(workspace.websiteUrl);

  const [recentProbes, citationsBundle] = await Promise.all([
    prisma.geoQuery.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { checkedAt: "desc" },
      take: 25,
    }),
    loadInitialBundle(workspace.id, domain),
  ]);

  // Quick header stat — total citations across all platforms today.
  const totalCitations = citationsBundle
    ? PLATFORMS.reduce(
        (acc, p) => acc + (citationsBundle.current[p.key]?.citations ?? 0),
        0
      )
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-semibold tracking-tight">GEO Agent</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Track citations from AI Overviews, ChatGPT, Gemini, Perplexity, Copilot, and Grok.
            {totalCitations > 0 && (
              <>
                {" "}
                <span className="font-medium text-foreground">
                  {totalCitations.toLocaleString()}
                </span>{" "}
                total citations in the latest snapshot.
              </>
            )}
          </p>
        </div>
        <RunAgentButton agentId="geo" label="Run GEO check" />
      </div>

      <AiCitationsPanel initial={citationsBundle} domain={domain} />

      <GeoTools
        defaultDomain={domain}
        hasApifyToken={hasSeoApifyToken()}
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent LLM probes</CardTitle>
          <CardDescription>
            Manual citation checks from the GEO Tools → Citation Check tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentProbes.length === 0 ? (
            <p className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
              No probes yet. Open <span className="font-medium">GEO Tools → Citation Check</span> to
              probe LLMs for any query.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentProbes.map((p) => (
                <li key={p.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {p.provider}
                        </Badge>
                        <span className="font-medium">{p.prompt}</span>
                      </div>
                      {p.snippet && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {p.snippet}
                        </p>
                      )}
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {format(p.checkedAt, "MMM d · HH:mm")}
                      </div>
                    </div>
                    {p.cited ? (
                      <Badge variant="success" className="gap-1">
                        <Check className="h-3 w-3" />
                        cited
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <X className="h-3 w-3" />
                        not cited
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
