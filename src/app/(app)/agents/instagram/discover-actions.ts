"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import { upsertIGCreator } from "@/backend/agents/instagram-db";
import {
  startIGNetworkRun,
  getIGRunStatus,
  fetchIGNetworkDataset,
  isTerminalIGStatus,
  ApifyIGNotConfiguredError,
  ApifyIGNetworkError,
} from "@/integrations/instagram-apify-network";

const MAX_SEEDS = 5;

type StartInput = {
  seeds: string[];
  minFollowers?: number;
  maxFollowers?: number;
  maxProfiles?: number;
};

export type StartIGDiscoveryResult =
  | { ok: true; runId: string; datasetId: string; status: string; actor: string }
  | { ok: false; error: string };

/**
 * Kicks off an Apify network-expansion run and returns immediately
 * (`runId` + `datasetId`). The browser then polls `pollIGDiscoveryAction`
 * every few seconds — Apify network expansion takes 1–5 min, well past
 * any serverless request timeout, so we never wait synchronously.
 */
export async function startIGSeedDiscoveryAction(
  input: StartInput
): Promise<StartIGDiscoveryResult> {
  await requireWorkspace(); // auth/workspace guard only
  const seeds = (input.seeds ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_SEEDS);
  if (seeds.length === 0) {
    return { ok: false, error: "Enter at least one seed account." };
  }
  try {
    const handle = await startIGNetworkRun({
      seeds,
      minFollowers: input.minFollowers,
      maxFollowers: input.maxFollowers,
      maxProfiles: input.maxProfiles ?? 100,
    });
    return {
      ok: true,
      runId: handle.runId,
      datasetId: handle.datasetId,
      status: handle.status,
      actor: handle.actor,
    };
  } catch (err) {
    if (err instanceof ApifyIGNotConfiguredError) {
      return {
        ok: false,
        error:
          "Set APIFY_TOKEN (or APIFY_IG_TOKEN) in Render → Environment to enable creator discovery.",
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to start discovery.",
    };
  }
}

export type PollIGDiscoveryResult =
  | { ok: true; status: string; statusMessage?: string; finished: false }
  | {
      ok: true;
      status: "SUCCEEDED";
      statusMessage?: string;
      finished: true;
      found: number;
      saved: number;
    }
  | { ok: false; status: string; error: string };

/**
 * Polls a previously-started Apify run. On terminal SUCCESS it fetches
 * the dataset, normalizes the QuickAds-style PascalCase rows, and upserts
 * them into the `IGCreator` table. On terminal FAILURE returns the error.
 */
export async function pollIGDiscoveryAction(args: {
  runId: string;
  datasetId: string;
}): Promise<PollIGDiscoveryResult> {
  const { workspace } = await requireWorkspace();
  let status;
  try {
    status = await getIGRunStatus(args.runId);
  } catch (err) {
    return {
      ok: false,
      status: "UNKNOWN",
      error: err instanceof Error ? err.message : "Could not reach Apify.",
    };
  }

  if (!isTerminalIGStatus(status.status)) {
    return {
      ok: true,
      status: status.status,
      statusMessage: status.statusMessage,
      finished: false,
    };
  }

  if (status.status !== "SUCCEEDED") {
    return {
      ok: false,
      status: status.status,
      error:
        status.statusMessage ??
        `Discovery ${status.status.toLowerCase()} on Apify.`,
    };
  }

  // SUCCEEDED — fetch + persist.
  let profiles;
  try {
    profiles = await fetchIGNetworkDataset(status.datasetId ?? args.datasetId);
  } catch (err) {
    return {
      ok: false,
      status: "SUCCEEDED",
      error: err instanceof Error ? err.message : "Failed to fetch results.",
    };
  }

  let saved = 0;
  for (const p of profiles) {
    const row = await upsertIGCreator({
      workspaceId: workspace.id,
      handle: p.handle,
      fullName: p.fullName || null,
      bio: p.bio || null,
      followers: p.followers,
      following: p.following,
      postsCount: p.postsCount,
      engagementRate: p.engagementRate,
      qualityScore: p.qualityScore,
      email: p.email,
      category: p.category,
      niche: null,
      isVerified: p.isVerified,
      isBusiness: !!p.category,
      externalUrl: p.externalUrl,
      profileUrl: p.profileUrl,
      // Use qualityScore/100 as a stand-in for "brand fit" until we layer
      // an LLM ranker on top. Higher Quality = higher fit.
      fit: p.qualityScore / 100,
    });
    if (row) saved++;
  }

  revalidatePath("/agents/instagram");

  return {
    ok: true,
    status: "SUCCEEDED",
    statusMessage: status.statusMessage,
    finished: true,
    found: profiles.length,
    saved,
  };
}

export async function recordIGDmSentAction(creatorId: string) {
  const { workspace } = await requireWorkspace();
  try {
    await prisma.iGCreator.updateMany({
      where: { id: creatorId, workspaceId: workspace.id },
      data: { lastDmAt: new Date() },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021") return { ok: true as const };
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "update_failed",
    };
  }
  revalidatePath("/agents/instagram");
  return { ok: true as const };
}

export async function deleteIGCreatorAction(creatorId: string) {
  const { workspace } = await requireWorkspace();
  await prisma.iGCreator
    .deleteMany({
      where: { id: creatorId, workspaceId: workspace.id },
    })
    .catch(() => null);
  revalidatePath("/agents/instagram");
  return { ok: true as const };
}

export async function clearIGCreatorsAction() {
  const { workspace } = await requireWorkspace();
  await prisma.iGCreator
    .deleteMany({ where: { workspaceId: workspace.id } })
    .catch(() => null);
  revalidatePath("/agents/instagram");
  return { ok: true as const };
}

// Silence the legacy ApifyIGNetworkError import — kept for future
// fine-grained error mapping in callers without re-importing it.
void ApifyIGNetworkError;
