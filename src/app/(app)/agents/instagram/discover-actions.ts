"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import { upsertIGCreator } from "@/backend/agents/instagram-db";
import {
  discoverFromSeeds,
  type SeedDiscoveryOptions,
} from "@/backend/agents/instagram-creators";

const MAX_SEEDS = 5;
const RUN_TIMEOUT_MS = 170_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () =>
        reject(
          new Error(
            `Discovery is taking longer than ${Math.round(ms / 1000)}s. Try fewer seed accounts.`
          )
        ),
      ms
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

type DiscoverInput = {
  seeds: string[];
  minFollowers?: number;
  maxFollowers?: number;
  categoryHint?: string;
};

export async function runIGSeedDiscoveryAction(input: DiscoverInput) {
  const { workspace } = await requireWorkspace();
  const seeds = (input.seeds ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_SEEDS);
  if (seeds.length === 0) {
    return { ok: false as const, error: "Enter at least one seed account." };
  }

  const opts: SeedDiscoveryOptions = {
    seeds,
    minFollowers: input.minFollowers,
    maxFollowers: input.maxFollowers,
    categoryHint: input.categoryHint,
  };

  const startedAt = Date.now();
  let result;
  try {
    result = await withTimeout(discoverFromSeeds(opts), RUN_TIMEOUT_MS);
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Discovery failed",
    };
  }

  if (result.error && result.profiles.length === 0) {
    return {
      ok: false as const,
      error: result.error.includes("APIFY")
        ? "Set APIFY_TOKEN (or APIFY_IG_TOKEN) in Render → Environment to enable creator discovery."
        : result.error,
    };
  }

  // Persist for later table loads + export.
  let saved = 0;
  for (const p of result.profiles) {
    const row = await upsertIGCreator({
      workspaceId: workspace.id,
      handle: p.handle,
      fullName: p.fullName ?? null,
      bio: p.bio ?? null,
      followers: p.followers,
      following: p.following ?? null,
      postsCount: p.posts ?? null,
      engagementRate: p.engagementRate ?? null,
      qualityScore: p.qualityScore ?? null,
      email: p.email ?? null,
      category: p.category ?? null,
      niche: input.categoryHint ?? null,
      isVerified: p.isVerified ?? false,
      isBusiness: p.isBusiness ?? false,
      externalUrl: p.externalUrl ?? null,
      profileUrl: p.profileUrl,
      // No LLM brand-fit ranker for seed discovery — quality score covers it.
      fit: (p.qualityScore ?? 0) / 100,
    });
    if (row) saved++;
  }

  revalidatePath("/agents/instagram");

  return {
    ok: true as const,
    found: result.profiles.length,
    saved,
    hashtags: result.hashtagsUsed,
    scanned: result.scanned,
    elapsedMs: Date.now() - startedAt,
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
