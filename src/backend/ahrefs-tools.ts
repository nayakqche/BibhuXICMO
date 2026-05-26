/**
 * Keyword-tool wrappers around the existing Apify Ahrefs actor.
 *
 * The actor (default `radeance/ahrefs-scraper`) accepts `include_*` flags
 * for each "tool" we want. Sending fewer flags = cheaper run, so each
 * function below requests exactly one feature.
 *
 * Output normalisation is intentionally defensive: the actor's field
 * names shift slightly between builds (snake_case vs camelCase, nested
 * blocks, etc.). We pick best-effort fields and otherwise pass the raw
 * dataset items through so the UI can still render something useful.
 *
 * All tools share the same APIFY_TOKEN + APIFY_AHREFS_ACTOR_ID env vars
 * already configured for the site-level CMO snapshot.
 */
import { env } from "@/shared/env";
import {
  ApifyNotConfiguredError,
  ApifyAhrefsError,
} from "@/backend/ahrefs";

const SYNC_TIMEOUT_MS = 90_000;

// --------------------------------------------------------------------------
// Public output shapes
// --------------------------------------------------------------------------

export type KeywordDifficultyResult = {
  keyword: string;
  country: string;
  /** 0–100 Ahrefs KD. */
  difficulty: number | null;
  /** "Very Easy" / "Easy" / "Medium" / "Hard" / "Very Hard". */
  label: string | null;
  /** Rough description of how many referring domains the top-10 has. */
  estimatedReferringDomainsToRank: number | null;
  raw: unknown;
};

export type KeywordMetricsResult = {
  keyword: string;
  country: string;
  searchVolume: number | null;
  difficulty: number | null;
  cpc: number | null;
  /** Estimated organic clicks per month if you rank #1. */
  trafficPotential: number | null;
  /** "Informational" / "Navigational" / "Commercial" / "Transactional". */
  intent: string | null;
  /** Related keywords + their volume (top 10). */
  related: Array<{
    keyword: string;
    volume: number | null;
    difficulty: number | null;
  }>;
  raw: unknown;
};

export type KeywordRankResult = {
  domain: string;
  keyword: string;
  country: string;
  /** 1-100 if found, null when domain isn't in the top 100. */
  position: number | null;
  /** Best-ranking URL on the domain. */
  url: string | null;
  /** Featured snippet / sitelinks / image pack / etc. */
  serpFeature: string | null;
  raw: unknown;
};

export type SerpEntry = {
  position: number;
  title: string;
  url: string;
  domain: string;
  /** "https://ahrefs.com/..." style snippet from the SERP. */
  snippet: string | null;
  /** DR of the ranking domain when the actor surfaces it. */
  domainRating: number | null;
  /** Estimated monthly traffic to the page. */
  traffic: number | null;
};

export type SerpOverviewResult = {
  keyword: string;
  country: string;
  /** Top-10 entries (or fewer if SERP is shallow). */
  results: SerpEntry[];
  /** Top SERP features detected: featured snippet, AI Overview, PAA, etc. */
  features: string[];
  raw: unknown;
};

export type TopWebsiteEntry = {
  rank: number;
  domain: string;
  category: string | null;
  /** Ahrefs DR (0–100). */
  domainRating: number | null;
  /** Monthly organic traffic. */
  traffic: number | null;
  /** Country share, percent (e.g. 18.4). */
  countryShare: number | null;
};

export type TopWebsitesResult = {
  country: string;
  category: string | null;
  entries: TopWebsiteEntry[];
  raw: unknown;
};

export type AiVisibilityResult = {
  domain: string;
  /** 0–100 — share-of-voice in AI-generated answers across LLMs. */
  score: number | null;
  /** Mention count across all probed LLMs in the last 30d. */
  mentions: number | null;
  /** Per-provider breakdown surfaced by the actor when available. */
  byProvider: Array<{ provider: string; score: number | null; mentions: number | null }>;
  /** Top queries the domain is cited for. */
  topQueries: Array<{ query: string; mentions: number | null }>;
  raw: unknown;
};

// --------------------------------------------------------------------------
// Apify call helper
// --------------------------------------------------------------------------

type AhrefsActorInput = {
  url?: string;
  keyword?: string;
  country?: string;
  mode?: "exact" | "subdomains";
  include_web_authority?: boolean;
  include_traffic?: boolean;
  include_backlinks?: boolean;
  include_ai_visibility?: boolean;
  include_keywords?: boolean;
  include_keywords_difficulty?: boolean;
  include_keywords_ranking?: boolean;
  include_serp?: boolean;
  include_broken_links?: boolean;
  include_top_websites?: boolean;
};

async function runActor(
  input: AhrefsActorInput,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<unknown[]> {
  if (!env.APIFY_TOKEN) throw new ApifyNotConfiguredError();
  const actor = env.APIFY_AHREFS_ACTOR_ID;
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(env.APIFY_TOKEN)}`;

  const ctrl = new AbortController();
  const externalAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", externalAbort);
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? SYNC_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", externalAbort);
  }

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new ApifyAhrefsError(
      `Apify Ahrefs actor returned ${res.status}${detail ? `: ${detail.slice(0, 240)}` : ""}`,
      res.status
    );
  }

  let items: unknown;
  try {
    items = await res.json();
  } catch (err) {
    throw new ApifyAhrefsError(
      `Failed to parse Apify response as JSON: ${(err as Error).message}`
    );
  }
  if (!Array.isArray(items)) return [];
  return items;
}

// --------------------------------------------------------------------------
// Field-pickers — copied from ahrefs.ts so this file stays self-contained.
// --------------------------------------------------------------------------

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v.replace(/[, _$%]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function findByType(items: unknown[], ...types: string[]): Record<string, unknown> | null {
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const t = typeof o.type === "string" ? o.type : "";
    if (types.includes(t)) return o;
  }
  // Fallback: first object item.
  return (items.find((x) => x && typeof x === "object") as Record<string, unknown>) ?? null;
}

function difficultyLabel(kd: number | null): string | null {
  if (kd === null) return null;
  if (kd < 10) return "Very Easy";
  if (kd < 30) return "Easy";
  if (kd < 50) return "Medium";
  if (kd < 75) return "Hard";
  return "Very Hard";
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url;
  }
}

// --------------------------------------------------------------------------
// Tool 1 — Keyword Difficulty
// --------------------------------------------------------------------------
export async function fetchKeywordDifficulty(
  keyword: string,
  country = "us"
): Promise<KeywordDifficultyResult> {
  const items = await runActor({
    keyword,
    country,
    include_keywords_difficulty: true,
  });
  const o = findByType(items, "keywords_difficulty", "keyword_difficulty", "kd");
  const kd = o ? pickNumber(o, ["difficulty", "kd", "keyword_difficulty"]) : null;
  const refdomains = o ? pickNumber(o, ["referring_domains_to_rank", "refdomainsToRank", "estimated_refdomains"]) : null;
  return {
    keyword,
    country,
    difficulty: kd,
    label: difficultyLabel(kd),
    estimatedReferringDomainsToRank: refdomains,
    raw: items,
  };
}

// --------------------------------------------------------------------------
// Tool 2 — Keyword Metrics (volume, KD, CPC, traffic potential)
// --------------------------------------------------------------------------
export async function fetchKeywordMetrics(
  keyword: string,
  country = "us"
): Promise<KeywordMetricsResult> {
  const items = await runActor({
    keyword,
    country,
    include_keywords: true,
    include_keywords_difficulty: true,
  });
  const o = findByType(items, "keywords", "keyword", "keyword_metrics");
  const related = o
    ? asArray(o.related_keywords).concat(asArray(o.suggestions)).slice(0, 10)
    : [];
  return {
    keyword,
    country,
    searchVolume: o ? pickNumber(o, ["volume", "searchVolume", "search_volume", "sv"]) : null,
    difficulty: o ? pickNumber(o, ["difficulty", "kd", "keyword_difficulty"]) : null,
    cpc: o ? pickNumber(o, ["cpc", "cost_per_click"]) : null,
    trafficPotential: o
      ? pickNumber(o, ["traffic_potential", "trafficPotential", "estimated_traffic"])
      : null,
    intent: o ? pickString(o, ["intent", "search_intent"]) : null,
    related: related.map((row) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        keyword: pickString(r, ["keyword", "query"]) ?? "",
        volume: pickNumber(r, ["volume", "searchVolume", "sv"]),
        difficulty: pickNumber(r, ["difficulty", "kd"]),
      };
    }).filter((row) => row.keyword.length > 0),
    raw: items,
  };
}

// --------------------------------------------------------------------------
// Tool 3 — Keyword Rank Checker
// --------------------------------------------------------------------------
export async function fetchKeywordRank(
  domain: string,
  keyword: string,
  country = "us"
): Promise<KeywordRankResult> {
  const items = await runActor({
    url: domain,
    keyword,
    country,
    include_keywords_ranking: true,
  });
  const o = findByType(items, "keywords_ranking", "ranking", "rank");

  // Some builds return an array of (keyword, position) pairs we have to scan.
  let position: number | null = null;
  let url: string | null = null;
  let serpFeature: string | null = null;
  if (o) {
    position = pickNumber(o, ["position", "rank", "pos"]);
    url = pickString(o, ["url", "ranking_url"]);
    serpFeature = pickString(o, ["serp_feature", "feature"]);

    if (position === null) {
      const rows = asArray(o.rankings).concat(asArray(o.results));
      const match = rows.find((r) => {
        if (!r || typeof r !== "object") return false;
        const v = (r as Record<string, unknown>).keyword;
        return typeof v === "string" && v.toLowerCase() === keyword.toLowerCase();
      });
      if (match && typeof match === "object") {
        const m = match as Record<string, unknown>;
        position = pickNumber(m, ["position", "rank", "pos"]);
        url = pickString(m, ["url", "ranking_url"]);
        serpFeature = pickString(m, ["serp_feature", "feature"]);
      }
    }
  }
  return { domain, keyword, country, position, url, serpFeature, raw: items };
}

// --------------------------------------------------------------------------
// Tool 4 — SERP Overview (top-10 analysis)
// --------------------------------------------------------------------------
export async function fetchSerpOverview(
  keyword: string,
  country = "us"
): Promise<SerpOverviewResult> {
  const items = await runActor({
    keyword,
    country,
    include_serp: true,
  });
  const o = findByType(items, "serp", "serp_overview", "search_results");
  const rawResults = o ? asArray(o.results).concat(asArray(o.serp_results)).concat(asArray(o.organic)) : [];
  const features = o ? asArray(o.features).concat(asArray(o.serp_features)) : [];

  const results: SerpEntry[] = rawResults.slice(0, 10).map((row, i) => {
    const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const link = pickString(r, ["url", "link"]) ?? "";
    return {
      position: pickNumber(r, ["position", "rank", "pos"]) ?? i + 1,
      title: pickString(r, ["title", "name"]) ?? link,
      url: link,
      domain: link ? hostnameOf(link) : "",
      snippet: pickString(r, ["snippet", "description"]),
      domainRating: pickNumber(r, ["domain_rating", "dr", "domainRating"]),
      traffic: pickNumber(r, ["traffic", "monthly_traffic"]),
    };
  }).filter((row) => row.url.length > 0);

  return {
    keyword,
    country,
    results,
    features: features
      .map((f) => (typeof f === "string" ? f : pickString(f as Record<string, unknown>, ["name", "type"]) ?? ""))
      .filter((s): s is string => !!s)
      .slice(0, 8),
    raw: items,
  };
}

// --------------------------------------------------------------------------
// Tool 5 — Top Websites (ahrefstop-style trending list)
// --------------------------------------------------------------------------
export async function fetchTopWebsites(
  country = "us",
  category: string | null = null
): Promise<TopWebsitesResult> {
  const items = await runActor({
    country,
    include_top_websites: true,
  });
  const o = findByType(items, "top_websites", "topWebsites", "websites");
  const rows = o
    ? asArray(o.websites).concat(asArray(o.top_websites)).concat(asArray(o.results))
    : [];

  const entries: TopWebsiteEntry[] = rows
    .slice(0, 50)
    .map((row, i) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const dom = pickString(r, ["domain", "website", "url"]) ?? "";
      if (!dom) return null;
      return {
        rank: pickNumber(r, ["rank", "position"]) ?? i + 1,
        domain: dom.startsWith("http") ? hostnameOf(dom) : dom.replace(/^www\./, ""),
        category: pickString(r, ["category", "vertical", "industry"]),
        domainRating: pickNumber(r, ["domain_rating", "dr", "domainRating"]),
        traffic: pickNumber(r, ["traffic", "monthly_traffic", "organic_traffic"]),
        countryShare: pickNumber(r, ["country_share", "share"]),
      };
    })
    .filter((row): row is TopWebsiteEntry => row !== null)
    .filter((row) =>
      !category ? true : (row.category ?? "").toLowerCase().includes(category.toLowerCase())
    );

  return { country, category, entries, raw: items };
}

// --------------------------------------------------------------------------
// GEO tool — AI Visibility (share-of-voice in AI answers)
// --------------------------------------------------------------------------
export async function fetchAiVisibility(
  domain: string,
  country = "us"
): Promise<AiVisibilityResult> {
  const items = await runActor({
    url: domain,
    country,
    include_ai_visibility: true,
  });
  const o = findByType(items, "ai_visibility", "aiVisibility", "ai");
  const providers = o ? asArray(o.by_provider).concat(asArray(o.providers)) : [];
  const queries = o ? asArray(o.top_queries).concat(asArray(o.queries)) : [];
  return {
    domain,
    score: o ? pickNumber(o, ["score", "ai_visibility_score", "aiv"]) : null,
    mentions: o ? pickNumber(o, ["mentions", "total_mentions"]) : null,
    byProvider: providers.map((row) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        provider: pickString(r, ["provider", "name"]) ?? "",
        score: pickNumber(r, ["score", "ai_visibility_score"]),
        mentions: pickNumber(r, ["mentions", "count"]),
      };
    }).filter((row) => row.provider.length > 0).slice(0, 6),
    topQueries: queries.map((row) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        query: pickString(r, ["query", "prompt", "keyword"]) ?? "",
        mentions: pickNumber(r, ["mentions", "count"]),
      };
    }).filter((row) => row.query.length > 0).slice(0, 10),
    raw: items,
  };
}
