/**
 * DB-backed cache + dispatcher for the keyword tools.
 *
 * Apify is paid per result, so we cache aggressively: 24h default TTL,
 * keyed by (workspace, tool, normalized input hash). One row per tool
 * call lives in `SeoToolRun`.
 *
 * Lookup flow:
 *   1. Hash the input (keyword + country, or domain + keyword, etc.)
 *   2. Find the most-recent SeoToolRun for that (workspace, tool, hash)
 *   3. If newer than TTL, return cached result
 *   4. Otherwise run the Apify tool, persist, return
 */
import { createHash } from "crypto";
import type { Prisma, SeoTool } from "@prisma/client";
import { prisma } from "@/backend/db";
import {
  fetchKeywordDifficulty,
  fetchKeywordMetrics,
  fetchKeywordRank,
  fetchSerpOverview,
  fetchTopWebsites,
  fetchAiVisibility,
  type KeywordDifficultyResult,
  type KeywordMetricsResult,
  type KeywordRankResult,
  type SerpOverviewResult,
  type TopWebsitesResult,
  type AiVisibilityResult,
} from "@/backend/ahrefs-tools";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function hashInput(input: Record<string, unknown>): string {
  const stable = JSON.stringify(input, Object.keys(input).sort());
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

async function readCached<T>(args: {
  workspaceId: string;
  tool: SeoTool;
  inputHash: string;
  ttlMs: number;
}): Promise<{ result: T; cachedAt: Date } | null> {
  try {
    const row = await prisma.seoToolRun.findUnique({
      where: {
        workspaceId_tool_inputHash: {
          workspaceId: args.workspaceId,
          tool: args.tool,
          inputHash: args.inputHash,
        },
      },
    });
    if (!row) return null;
    if (Date.now() - row.createdAt.getTime() > args.ttlMs) return null;
    return { result: row.result as T, cachedAt: row.createdAt };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    // Table doesn't exist yet (migration not run) — treat as cache miss.
    if (code === "P2021" || code === "P2022") return null;
    throw err;
  }
}

async function writeCached(args: {
  workspaceId: string;
  tool: SeoTool;
  inputHash: string;
  input: Record<string, unknown>;
  result: unknown;
}): Promise<void> {
  try {
    await prisma.seoToolRun.upsert({
      where: {
        workspaceId_tool_inputHash: {
          workspaceId: args.workspaceId,
          tool: args.tool,
          inputHash: args.inputHash,
        },
      },
      create: {
        workspaceId: args.workspaceId,
        tool: args.tool,
        inputHash: args.inputHash,
        input: JSON.parse(JSON.stringify(args.input)) as Prisma.InputJsonValue,
        result: JSON.parse(JSON.stringify(args.result)) as Prisma.InputJsonValue,
      },
      update: {
        input: JSON.parse(JSON.stringify(args.input)) as Prisma.InputJsonValue,
        result: JSON.parse(JSON.stringify(args.result)) as Prisma.InputJsonValue,
        createdAt: new Date(),
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "P2021" && code !== "P2022") {
      console.error(`[seo-tools] write failed for ${args.tool}:`, err);
    }
  }
}

export type CachedToolResult<T> =
  | { ok: true; data: T; cachedAt: Date; fromCache: boolean }
  | { ok: false; error: string };

// --------------------------------------------------------------------------
// Public dispatchers — one per tool.
// --------------------------------------------------------------------------

export async function runKeywordDifficulty(args: {
  workspaceId: string;
  keyword: string;
  country?: string;
}): Promise<CachedToolResult<KeywordDifficultyResult>> {
  const input = { keyword: args.keyword.trim().toLowerCase(), country: (args.country ?? "us").toLowerCase() };
  if (!input.keyword) return { ok: false, error: "Enter a keyword." };
  const inputHash = hashInput({ ...input, tool: "KEYWORD_DIFFICULTY" });

  const cached = await readCached<KeywordDifficultyResult>({
    workspaceId: args.workspaceId,
    tool: "KEYWORD_DIFFICULTY",
    inputHash,
    ttlMs: DEFAULT_TTL_MS,
  });
  if (cached) return { ok: true, data: cached.result, cachedAt: cached.cachedAt, fromCache: true };

  try {
    const data = await fetchKeywordDifficulty(input.keyword, input.country);
    await writeCached({
      workspaceId: args.workspaceId,
      tool: "KEYWORD_DIFFICULTY",
      inputHash,
      input,
      result: data,
    });
    return { ok: true, data, cachedAt: new Date(), fromCache: false };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function runKeywordMetrics(args: {
  workspaceId: string;
  keyword: string;
  country?: string;
}): Promise<CachedToolResult<KeywordMetricsResult>> {
  const input = { keyword: args.keyword.trim().toLowerCase(), country: (args.country ?? "us").toLowerCase() };
  if (!input.keyword) return { ok: false, error: "Enter a keyword." };
  const inputHash = hashInput({ ...input, tool: "KEYWORD_METRICS" });

  const cached = await readCached<KeywordMetricsResult>({
    workspaceId: args.workspaceId,
    tool: "KEYWORD_METRICS",
    inputHash,
    ttlMs: DEFAULT_TTL_MS,
  });
  if (cached) return { ok: true, data: cached.result, cachedAt: cached.cachedAt, fromCache: true };

  try {
    const data = await fetchKeywordMetrics(input.keyword, input.country);
    await writeCached({
      workspaceId: args.workspaceId,
      tool: "KEYWORD_METRICS",
      inputHash,
      input,
      result: data,
    });
    return { ok: true, data, cachedAt: new Date(), fromCache: false };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function runKeywordRank(args: {
  workspaceId: string;
  domain: string;
  keyword: string;
  country?: string;
}): Promise<CachedToolResult<KeywordRankResult>> {
  const input = {
    domain: normalizeDomain(args.domain),
    keyword: args.keyword.trim().toLowerCase(),
    country: (args.country ?? "us").toLowerCase(),
  };
  if (!input.domain) return { ok: false, error: "Enter a domain." };
  if (!input.keyword) return { ok: false, error: "Enter a keyword." };
  const inputHash = hashInput({ ...input, tool: "KEYWORD_RANK" });

  const cached = await readCached<KeywordRankResult>({
    workspaceId: args.workspaceId,
    tool: "KEYWORD_RANK",
    inputHash,
    ttlMs: DEFAULT_TTL_MS,
  });
  if (cached) return { ok: true, data: cached.result, cachedAt: cached.cachedAt, fromCache: true };

  try {
    const data = await fetchKeywordRank(input.domain, input.keyword, input.country);
    await writeCached({
      workspaceId: args.workspaceId,
      tool: "KEYWORD_RANK",
      inputHash,
      input,
      result: data,
    });
    return { ok: true, data, cachedAt: new Date(), fromCache: false };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function runSerpOverview(args: {
  workspaceId: string;
  keyword: string;
  country?: string;
}): Promise<CachedToolResult<SerpOverviewResult>> {
  const input = { keyword: args.keyword.trim().toLowerCase(), country: (args.country ?? "us").toLowerCase() };
  if (!input.keyword) return { ok: false, error: "Enter a keyword." };
  const inputHash = hashInput({ ...input, tool: "SERP_OVERVIEW" });

  const cached = await readCached<SerpOverviewResult>({
    workspaceId: args.workspaceId,
    tool: "SERP_OVERVIEW",
    inputHash,
    ttlMs: DEFAULT_TTL_MS,
  });
  if (cached) return { ok: true, data: cached.result, cachedAt: cached.cachedAt, fromCache: true };

  try {
    const data = await fetchSerpOverview(input.keyword, input.country);
    await writeCached({
      workspaceId: args.workspaceId,
      tool: "SERP_OVERVIEW",
      inputHash,
      input,
      result: data,
    });
    return { ok: true, data, cachedAt: new Date(), fromCache: false };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function runTopWebsites(args: {
  workspaceId: string;
  country?: string;
  category?: string | null;
}): Promise<CachedToolResult<TopWebsitesResult>> {
  const input = {
    country: (args.country ?? "us").toLowerCase(),
    category: (args.category ?? "").trim().toLowerCase() || null,
  };
  const inputHash = hashInput({ ...input, tool: "TOP_WEBSITES" });

  const cached = await readCached<TopWebsitesResult>({
    workspaceId: args.workspaceId,
    tool: "TOP_WEBSITES",
    inputHash,
    ttlMs: DEFAULT_TTL_MS,
  });
  if (cached) return { ok: true, data: cached.result, cachedAt: cached.cachedAt, fromCache: true };

  try {
    const data = await fetchTopWebsites(input.country, input.category);
    await writeCached({
      workspaceId: args.workspaceId,
      tool: "TOP_WEBSITES",
      inputHash,
      input,
      result: data,
    });
    return { ok: true, data, cachedAt: new Date(), fromCache: false };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function runAiVisibility(args: {
  workspaceId: string;
  domain: string;
  country?: string;
}): Promise<CachedToolResult<AiVisibilityResult>> {
  const input = {
    domain: normalizeDomain(args.domain),
    country: (args.country ?? "us").toLowerCase(),
  };
  if (!input.domain) return { ok: false, error: "Enter a domain." };
  const inputHash = hashInput({ ...input, tool: "AI_VISIBILITY" });

  const cached = await readCached<AiVisibilityResult>({
    workspaceId: args.workspaceId,
    tool: "AI_VISIBILITY",
    inputHash,
    ttlMs: DEFAULT_TTL_MS,
  });
  if (cached) return { ok: true, data: cached.result, cachedAt: cached.cachedAt, fromCache: true };

  try {
    const data = await fetchAiVisibility(input.domain, input.country);
    await writeCached({
      workspaceId: args.workspaceId,
      tool: "AI_VISIBILITY",
      inputHash,
      input,
      result: data,
    });
    return { ok: true, data, cachedAt: new Date(), fromCache: false };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// --------------------------------------------------------------------------

function errorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) {
    // Normalize the most common Apify error to something actionable.
    if (err.name === "ApifyNotConfiguredError") {
      return "Apify token isn't configured. Set APIFY_TOKEN in Render → Environment to enable keyword tools.";
    }
    return err.message;
  }
  return String(err);
}

function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  if (!s) return s;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0];
  return s;
}
