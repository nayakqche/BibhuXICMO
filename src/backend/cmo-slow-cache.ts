/**
 * DB-backed cache for the AI-CMO "Loading site signals" bundle.
 *
 * Why DB instead of `unstable_cache`?
 *   `unstable_cache` lives in process memory only. On Render's free
 *   tier the instance spins down after ~15 min of inactivity, and any
 *   deploy / restart also nukes it — meaning users would hit the
 *   3-min cold-start refetch every time they came back to the page.
 *
 *   Persisting the bundle on `Workspace.cmoSlowSnapshot` makes it
 *   survive across cold starts, redeploys, and even multi-instance
 *   scaling. Same pattern we already use for `cmoLlmSnapshot` and
 *   `ahrefsSnapshot`.
 *
 * What we cache:
 *   - liveSnapshot (homepage scrape)
 *   - pageSpeed (Google Lighthouse)
 *   - gsc (Search Console query results)
 *   - ga4 (Analytics query results)
 *
 * What we DON'T cache here (already cached elsewhere):
 *   - llmAnalysis  → `Workspace.cmoLlmSnapshot`
 *   - ahrefs       → `Workspace.ahrefsSnapshot`
 *
 * Cache key: workspaceId + URL. If the user changes their site URL
 * the previous snapshot is invalidated by URL mismatch (and explicitly
 * cleared in settings/actions.ts for good measure).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/backend/db";
import type { PageSnapshot } from "@/backend/scraper/fetch";
import type { PageSpeedResult } from "@/backend/pagespeed";

/**
 * 24h freshness window. Aligned with the Ahrefs cache and the LLM
 * snapshot cache so a site analyzed today doesn't re-run the homepage
 * scrape + PageSpeed + GA4 + GSC pulls on every tab switch. The manual
 * "Refresh" button in the Analytics panel forces a fresh fetch when
 * the user actually wants new data.
 */
export const CMO_SLOW_CACHE_MS = 24 * 60 * 60 * 1000;

export type CmoSlowGsc = {
  connected: boolean;
  site: string | null;
  rows: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
};

export type CmoSlowGa4 = {
  connected: boolean;
  property: string | null;
  rows: Array<{
    page: string;
    sessions: number;
    users: number;
    conversions: number;
  }>;
};

/** Stored shape — must be JSON-serializable. */
type CmoSlowSnapshotV1 = {
  v: 1;
  url: string;
  /** ISO timestamp the snapshot was taken. */
  ts: string;
  liveSnapshot: PageSnapshot | null;
  pageSpeed: PageSpeedResult | null;
  gsc: CmoSlowGsc | null;
  ga4: CmoSlowGa4 | null;
};

export type CmoSlowCached = {
  liveSnapshot: PageSnapshot | null;
  pageSpeed: PageSpeedResult | null;
  gsc: CmoSlowGsc | null;
  ga4: CmoSlowGa4 | null;
};

function isSnapshotV1(x: unknown): x is CmoSlowSnapshotV1 {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.v === 1 &&
    typeof o.url === "string" &&
    typeof o.ts === "string" &&
    "liveSnapshot" in o &&
    "pageSpeed" in o &&
    "gsc" in o &&
    "ga4" in o
  );
}

/**
 * Reads the cached snapshot for the workspace and returns it ONLY when:
 *   - it's valid JSON v1
 *   - the URL matches the current workspace URL (site changed → miss)
 *   - it's within the TTL window
 *
 * Returns `null` on any miss, so the caller knows to refetch.
 */
export async function readCmoSlowCache(args: {
  workspaceId: string;
  websiteUrl: string | null;
  ttlMs?: number;
}): Promise<CmoSlowCached | null> {
  const ttl = args.ttlMs ?? CMO_SLOW_CACHE_MS;
  if (!args.websiteUrl) return null;

  let row;
  try {
    row = await prisma.workspace.findUnique({
      where: { id: args.workspaceId },
      select: { cmoSlowSnapshot: true, cmoSlowSnapshotAt: true },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    // P2022 = column doesn't exist yet (migration not run on Render).
    // Treat as cache miss so the panel still works.
    if (code === "P2022") return null;
    throw err;
  }

  const raw = row?.cmoSlowSnapshot;
  const at = row?.cmoSlowSnapshotAt;
  if (!raw || !at) {
    console.info(
      `[cmo-cache] read · empty snapshot (workspace=${args.workspaceId})`
    );
    return null;
  }
  if (!isSnapshotV1(raw)) {
    console.warn(
      `[cmo-cache] read · stored shape isn't v1 (workspace=${args.workspaceId}); ignoring`
    );
    return null;
  }
  if (normUrl(raw.url) !== normUrl(args.websiteUrl)) {
    console.info(
      `[cmo-cache] read · URL mismatch (snapshot=${raw.url} current=${args.websiteUrl}) — refetching`
    );
    return null;
  }
  const age = Date.now() - at.getTime();
  if (age > ttl) {
    console.info(
      `[cmo-cache] read · expired (${Math.round(age / 1000)}s > ${Math.round(ttl / 1000)}s) — refetching`
    );
    return null;
  }
  console.info(
    `[cmo-cache] read · fresh (${Math.round(age / 1000)}s old, ttl ${Math.round(ttl / 1000)}s)`
  );
  return {
    liveSnapshot: raw.liveSnapshot,
    pageSpeed: raw.pageSpeed,
    gsc: raw.gsc,
    ga4: raw.ga4,
  };
}

/**
 * Persists a fresh snapshot. Best-effort — DB write failures must not
 * break the user's page render, so we swallow + log them.
 */
export async function writeCmoSlowCache(args: {
  workspaceId: string;
  websiteUrl: string;
  data: CmoSlowCached;
}): Promise<void> {
  const snapshot: CmoSlowSnapshotV1 = {
    v: 1,
    url: args.websiteUrl,
    ts: new Date().toISOString(),
    liveSnapshot: args.data.liveSnapshot,
    pageSpeed: args.data.pageSpeed,
    gsc: args.data.gsc,
    ga4: args.data.ga4,
  };
  try {
    await prisma.workspace.update({
      where: { id: args.workspaceId },
      data: {
        cmoSlowSnapshot: JSON.parse(
          JSON.stringify(snapshot)
        ) as Prisma.InputJsonValue,
        cmoSlowSnapshotAt: new Date(),
      },
    });
    console.info(
      `[cmo-cache] write · persisted (workspace=${args.workspaceId} url=${args.websiteUrl})`
    );
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2022") {
      console.warn(
        "[cmo-cache] write · column missing (P2022) — Render `prisma db push` hasn't run yet. Snapshot WILL NOT persist. Re-deploy or run `npx prisma db push` once the build settles."
      );
    } else {
      console.error("[cmo-cache] write · failed:", err);
    }
  }
}

/** Clears the cached snapshot — used when the user changes their website URL. */
export async function clearCmoSlowCache(workspaceId: string): Promise<void> {
  try {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        cmoSlowSnapshot: Prisma.DbNull,
        cmoSlowSnapshotAt: null,
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "P2022") {
      console.error("[cmo] failed to clear slow snapshot:", err);
    }
  }
}

function normUrl(u: string): string {
  return u.replace(/\/+$/, "").toLowerCase();
}
