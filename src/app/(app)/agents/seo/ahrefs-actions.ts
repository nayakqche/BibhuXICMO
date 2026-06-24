"use server";

import { requireWorkspace } from "@/backend/workspace";
import {
  fetchAhrefsSnapshot,
  ApifyNotConfiguredError,
  type AhrefsSnapshot,
} from "@/backend/ahrefs";
import {
  loadAhrefsWithCache,
  readCachedAhrefs,
} from "@/backend/ahrefs-cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/backend/db";

export type AhrefsActionResult =
  | { ok: true; snapshot: AhrefsSnapshot; age: "fresh" | "stale" }
  | { ok: false; error: string; needsConfig?: true; needsWebsite?: true };

/**
 * Read the cached snapshot only. Used by the AhrefsPanel on mount so it
 * can hydrate from the 24h cache without burning an Apify call.
 */
export async function getCachedAhrefsAction(): Promise<AhrefsActionResult> {
  const { workspace } = await requireWorkspace();
  if (!workspace.websiteUrl) {
    return {
      ok: false,
      error: "Add a website URL in Settings, then try again.",
      needsWebsite: true,
    };
  }
  const cached = readCachedAhrefs({
    websiteUrl: workspace.websiteUrl,
    ahrefsSnapshot: workspace.ahrefsSnapshot,
    ahrefsSnapshotAt: workspace.ahrefsSnapshotAt,
  });
  if (cached.kind === "ready") {
    return { ok: true, snapshot: cached.snapshot, age: cached.age };
  }
  return { ok: false, error: "No cached snapshot yet." };
}

/**
 * Fetch the Ahrefs snapshot for the current workspace.
 *
 * Cache-aware: if a fresh snapshot exists (< 24h), returns it without
 * hitting Apify. Pass `force: true` to bypass the cache and re-run the
 * actor — only do this when the user explicitly asks for a refresh.
 */
export async function refreshAhrefsSnapshotAction(
  opts: { force?: boolean } = {}
): Promise<AhrefsActionResult> {
  const { workspace } = await requireWorkspace();
  if (!workspace.websiteUrl) {
    return {
      ok: false,
      error: "Add a website URL in Settings, then try again.",
      needsWebsite: true,
    };
  }

  // Cache-first path. Only when caller explicitly forces a refresh do we
  // skip the cache and bill another Apify run.
  if (!opts.force) {
    const result = await loadAhrefsWithCache({
      workspaceId: workspace.id,
      websiteUrl: workspace.websiteUrl,
      ahrefsSnapshot: workspace.ahrefsSnapshot,
      ahrefsSnapshotAt: workspace.ahrefsSnapshotAt,
    });
    if (result.kind === "ready") {
      return { ok: true, snapshot: result.snapshot, age: result.age };
    }
    if (result.kind === "missing" && result.reason === "not_configured") {
      return {
        ok: false,
        error: "Data provider isn't configured on the server.",
        needsConfig: true,
      };
    }
    // Fall through to a fresh fetch for any other miss.
  }

  try {
    const snapshot = await fetchAhrefsSnapshot(workspace.websiteUrl, {
      timeoutMs: 25_000,
    });
    // Persist so future page loads hit the cache.
    try {
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: {
          ahrefsSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          ahrefsSnapshotAt: new Date(),
        },
      });
    } catch {
      // Non-fatal — return the snapshot even if persist failed.
    }
    return { ok: true, snapshot, age: "fresh" };
  } catch (err) {
    if (err instanceof ApifyNotConfiguredError) {
      return {
        ok: false,
        error: "Data provider isn't configured on the server.",
        needsConfig: true,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Fetch failed.",
    };
  }
}
