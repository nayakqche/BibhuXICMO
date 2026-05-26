"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/backend/workspace";
import {
  runKeywordDifficulty,
  runKeywordMetrics,
  runKeywordRank,
  runSerpOverview,
  runTopWebsites,
  runAiVisibility,
  type CachedToolResult,
} from "@/backend/seo-tools-cache";
import type {
  KeywordDifficultyResult,
  KeywordMetricsResult,
  KeywordRankResult,
  SerpOverviewResult,
  TopWebsitesResult,
  AiVisibilityResult,
} from "@/backend/ahrefs-tools";

export async function runKeywordDifficultyAction(args: {
  keyword: string;
  country?: string;
}): Promise<CachedToolResult<KeywordDifficultyResult>> {
  const { workspace } = await requireWorkspace();
  const res = await runKeywordDifficulty({ workspaceId: workspace.id, ...args });
  if (res.ok) revalidatePath("/agents/seo");
  return res;
}

export async function runKeywordMetricsAction(args: {
  keyword: string;
  country?: string;
}): Promise<CachedToolResult<KeywordMetricsResult>> {
  const { workspace } = await requireWorkspace();
  const res = await runKeywordMetrics({ workspaceId: workspace.id, ...args });
  if (res.ok) revalidatePath("/agents/seo");
  return res;
}

export async function runKeywordRankAction(args: {
  domain: string;
  keyword: string;
  country?: string;
}): Promise<CachedToolResult<KeywordRankResult>> {
  const { workspace } = await requireWorkspace();
  const res = await runKeywordRank({ workspaceId: workspace.id, ...args });
  if (res.ok) revalidatePath("/agents/seo");
  return res;
}

export async function runSerpOverviewAction(args: {
  keyword: string;
  country?: string;
}): Promise<CachedToolResult<SerpOverviewResult>> {
  const { workspace } = await requireWorkspace();
  const res = await runSerpOverview({ workspaceId: workspace.id, ...args });
  if (res.ok) revalidatePath("/agents/seo");
  return res;
}

export async function runTopWebsitesAction(args: {
  country?: string;
  category?: string | null;
}): Promise<CachedToolResult<TopWebsitesResult>> {
  const { workspace } = await requireWorkspace();
  const res = await runTopWebsites({ workspaceId: workspace.id, ...args });
  if (res.ok) revalidatePath("/agents/seo");
  return res;
}

export async function runAiVisibilityAction(args: {
  domain: string;
  country?: string;
}): Promise<CachedToolResult<AiVisibilityResult>> {
  const { workspace } = await requireWorkspace();
  const res = await runAiVisibility({ workspaceId: workspace.id, ...args });
  if (res.ok) revalidatePath("/agents/geo");
  return res;
}
