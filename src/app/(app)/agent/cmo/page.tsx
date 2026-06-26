import { Suspense } from "react";
import { formatDistanceToNow, isToday } from "date-fns";
import { Loader2 } from "lucide-react";
import { requireWorkspace } from "@/backend/workspace";
import { getBalance } from "@/backend/credits";
import {
  loadCmoFastData,
  loadCmoSlowData,
  type CmoFastData,
  type CmoSlowData,
} from "@/backend/agents/cmo-data";
import { pickAvailableModel } from "@/backend/llm";
import { HeaderBar } from "@/frontend/components/app/cmo/header-bar";
import {
  TerminalPanel,
  type TerminalLine,
} from "@/frontend/components/app/cmo/terminal-panel";
import { CompanyPanel } from "@/frontend/components/app/cmo/company-panel";
import { AnalyticsPanel } from "@/frontend/components/app/cmo/analytics-panel";
import { ActionsFeed } from "@/frontend/components/app/cmo/actions-feed";
import { ChatDock } from "@/frontend/components/app/cmo/chat-dock";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/frontend/components/ui/card";
import { Skeleton } from "@/frontend/components/ui/skeleton";
import { SITE_NAME } from "@/shared/site";
import { getEffectivePlan } from "@/backend/plan";

export const metadata = { title: "AI CMO" };
export const dynamic = "force-dynamic";
// Scrape + PageSpeed + LLM analysis can exceed the default serverless limit on Vercel.
export const maxDuration = 60;

export default async function CmoAgentPage() {
  const { workspace } = await requireWorkspace();
  const credits = await getBalance(workspace.id);
  const plan = getEffectivePlan(workspace.subscription);

  // Fast path: only DB queries (~50-200ms). Drives the entire shell so the
  // page paints instantly when navigating between tabs.
  const fast = await loadCmoFastData({
    workspaceId: workspace.id,
    websiteUrl: workspace.websiteUrl,
    workspaceName: workspace.name,
    industry: workspace.industry,
    icp: workspace.icp,
    voiceProfile: workspace.voiceProfile,
    ahrefsSnapshot: workspace.ahrefsSnapshot,
    ahrefsSnapshotAt: workspace.ahrefsSnapshotAt,
    plan,
    credits,
  });

  const llmConfigured = pickAvailableModel() != null;
  const hasRunsToday = fast.recentRuns.some((r) => isToday(r.startedAt));
  const terminalLines = buildTerminalLines(fast);
  const companyAnalyzing = isCompanyAnalysisEmpty(fast);

  return (
    <div className="flex flex-col gap-6">
      <HeaderBar
        websiteUrl={workspace.websiteUrl}
        plan={plan}
        credits={credits}
        hasRunsToday={hasRunsToday}
      />

      <TerminalPanel lines={terminalLines} />

      {/*
        Responsive density:
          - default: single stacked column (mobile)
          - md (768px+): 2×2 grid
          - xl (1280px+): 4 columns side-by-side at normal laptop width

        On xl+ each column gets a fixed viewport-anchored height so the
        page itself does not scroll — instead each panel scrolls
        internally via its own overflow-y-auto. Net result: at 100% zoom
        you see all four columns at once and use the scrollbar inside
        whichever column you want.
      */}
      <div className="grid gap-5 md:grid-cols-2 xl:h-[calc(100vh-260px)] xl:grid-cols-4 xl:gap-4">
        <div className="min-h-0 xl:h-full xl:overflow-y-auto">
          {/*
            The fallback shows the "analyzing" state only when the workspace
            has a URL but no strategy artifacts yet (fresh site). Once the
            slow phase resolves, CompanyPanelWithLive renders with
            analyzing=false — so a thin LLM result lands on a clean empty
            state instead of an endless spinner.
          */}
          <Suspense
            fallback={<CompanyPanel data={fast} analyzing={companyAnalyzing} />}
          >
            <CompanyPanelWithLive fast={fast} workspaceId={workspace.id} />
          </Suspense>
        </div>
        <div className="min-h-0 xl:h-full xl:overflow-y-auto">
          <Suspense fallback={<AnalyticsSkeleton />}>
            <AnalyticsPanelStreamed fast={fast} workspaceId={workspace.id} />
          </Suspense>
        </div>
        <div className="flex min-h-0 flex-col gap-5 xl:h-full">
          <Suspense fallback={<ActionsFeed items={fast.openActions} plan={plan} />}>
            <ActionsFeedStreamed fast={fast} workspaceId={workspace.id} plan={plan} />
          </Suspense>
        </div>
        <div className="min-h-[640px] xl:h-full xl:min-h-0">
          <ChatDock workspaceName={workspace.name} llmConfigured={llmConfigured} />
        </div>
      </div>
    </div>
  );
}

/**
 * Streams in PageSpeed + GA4/GSC + live homepage scrape after the page shell
 * has rendered. Without this Suspense boundary, the whole page would block on
 * a 5-15s PageSpeed call before the user saw anything.
 */
async function AnalyticsPanelStreamed({
  fast,
  workspaceId,
}: {
  fast: CmoFastData;
  workspaceId: string;
}) {
  const slow = await loadSlow(fast, workspaceId);
  return <AnalyticsPanel data={{ ...fast, ...slow }} />;
}

async function CompanyPanelWithLive({
  fast,
  workspaceId,
}: {
  fast: CmoFastData;
  workspaceId: string;
}) {
  const slow = await loadSlow(fast, workspaceId);
  // If a voice profile was just regenerated lazily (URL changed in settings,
  // or first onboarding LLM call failed), merge it on top of the empty `fast`
  // values so the Company panel populates immediately on this same render.
  const merged: CmoFastData = slow.freshVoice
    ? {
        ...fast,
        voice: slow.freshVoice,
        topCompetitors: Array.isArray(slow.freshVoice.competitors)
          ? slow.freshVoice.competitors.slice(0, 12)
          : fast.topCompetitors,
        workspace: {
          ...fast.workspace,
          industry: slow.freshIndustry ?? fast.workspace.industry,
          icp: slow.freshIcp ?? fast.workspace.icp,
        },
      }
    : fast;
  return (
    <CompanyPanel
      data={{ ...merged, liveSnapshot: slow.liveSnapshot, llmAnalysis: slow.llmAnalysis }}
    />
  );
}

async function ActionsFeedStreamed({
  fast,
  workspaceId,
  plan,
}: {
  fast: CmoFastData;
  workspaceId: string;
  plan: "FREE" | "MAX";
}) {
  const slow = await loadSlow(fast, workspaceId);
  return (
    <ActionsFeed
      items={fast.openActions}
      plan={plan}
      listeningHint={slow.llmAnalysis?.socialListeningHook}
    />
  );
}

// Cached promise so the two streamed panels share one slow fetch.
const slowCache = new WeakMap<CmoFastData, Promise<CmoSlowData>>();
function loadSlow(fast: CmoFastData, workspaceId: string) {
  let p = slowCache.get(fast);
  if (!p) {
    p = loadCmoSlowData({
      workspaceId,
      websiteUrl: fast.workspace.websiteUrl,
      industry: fast.workspace.industry,
      icp: fast.workspace.icp,
      voice: fast.voice,
      ga4Connected: fast.integrations.ga4,
      gscConnected: fast.integrations.gsc,
      withPageSpeed: true,
      ahrefsSnapshot: fast.workspace.ahrefsSnapshot,
      ahrefsSnapshotAt: fast.workspace.ahrefsSnapshotAt,
    });
    slowCache.set(fast, p);
  }
  return p;
}

/**
 * Skeleton used by the Analytics Suspense boundary.
 *
 * Slow data is cached 24h, so almost every navigation is a cache hit
 * that resolves in 50-100ms. The previous skeleton bragged about
 * "typically 30-60s on first run" — which is true on cold starts but
 * read as "this is reloading from scratch every time" on warm
 * navigations. Quiet placeholder pulses are more honest: brief flash
 * on warm navigations, the cold-path copy only appears after a
 * client-side delay (see SlowAnalyticsHint).
 */
function AnalyticsSkeleton() {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          Loading analytics…
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </CardContent>
    </Card>
  );
}

/**
 * True when a workspace has a URL but none of the LLM-generated artifacts
 * (positioning, competitors, social handles) have landed yet. Lives in the
 * page (server) module rather than inside the "use client" CompanyPanel so
 * it can be called from this server render — exporting it from a client
 * module would turn it into a Client Reference and crash SSR.
 */
function isCompanyAnalysisEmpty(data: CmoFastData): boolean {
  if (!data.workspace.websiteUrl) return false;
  const v = data.voice;
  const hasPositioning = !!v?.positioning?.trim();
  const hasCompetitors = (v?.competitors?.length ?? 0) > 0;
  const hasHandles =
    !!v?.socialHandles &&
    Object.values(v.socialHandles).some(
      (h) => typeof h === "string" && h.trim().length > 0
    );
  return !hasPositioning && !hasCompetitors && !hasHandles;
}

function buildTerminalLines(data: CmoFastData): TerminalLine[] {
  const lines: TerminalLine[] = [];
  lines.push({
    kind: "info",
    text: `${SITE_NAME} command center · ${data.plan} plan`,
  });
  if (data.workspace.websiteUrl) {
    lines.push({
      kind: "info",
      text: `Monitoring ${data.workspace.websiteUrl.replace(/^https?:\/\//, "")}`,
    });
  } else {
    lines.push({
      kind: "warn",
      text: "No website URL — finish onboarding to unlock agents.",
    });
  }
  if (data.workspace.industry) {
    lines.push({
      kind: "muted",
      text: `Industry: ${data.workspace.industry}`,
    });
  }
  if (data.scores.seo != null) {
    lines.push({ kind: "ok", text: `SEO score ${data.scores.seo}/100` });
  }
  if (data.scores.geo != null) {
    lines.push({ kind: "ok", text: `GEO score ${data.scores.geo}/100` });
  }
  lines.push({
    kind: "info",
    text: `${data.openActions.length} open action items in queue`,
  });
  if (data.plan === "FREE") {
    lines.push({
      kind: "warn",
      text: "Max plan: Reddit monitor, full agent cadence, more credits.",
    });
  }
  for (const r of data.recentRuns.slice(0, 6)) {
    const ago = formatDistanceToNow(r.startedAt, { addSuffix: true });
    lines.push({
      kind: r.status === "SUCCESS" ? "ok" : r.status === "FAILED" ? "warn" : "muted",
      text: `[${r.agent}] ${r.status.toLowerCase()} · ${ago}`,
    });
  }
  if (data.recentRuns.length === 0) {
    lines.push({
      kind: "muted",
      text: "No recent agent runs — pick an agent from the sidebar.",
    });
  }
  lines.push({
    kind: "info",
    text: "Ask anything in the chat below ↓",
  });
  return lines;
}
