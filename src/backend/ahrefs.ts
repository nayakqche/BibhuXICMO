/**
 * Pulls site-critical SEO data from Apify's Ahrefs scraper actor.
 *
 * The actor (default: radeance/ahrefs-scraper) accepts a list of domains
 * and returns dataset items with Ahrefs metrics such as Domain Rating,
 * referring domains, backlink counts, organic traffic, organic keywords,
 * and a slice of top organic keywords.
 *
 * Apify field names vary between actor versions, so we tolerate several
 * synonymous keys and normalize to a stable shape consumers can render.
 *
 * Configure via env:
 *   APIFY_TOKEN              — required
 *   APIFY_AHREFS_ACTOR_ID    — default "radeance~ahrefs-scraper"
 */
import { env } from "@/shared/env";

export type AhrefsSnapshot = {
  domain: string;
  domainRating: number | null;
  organicKeywords: number | null;
  organicTraffic: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  topKeywords: Array<{
    keyword: string;
    position?: number | null;
    volume?: number | null;
    traffic?: number | null;
    url?: string | null;
  }>;
  fetchedAt: string;
  /** Raw item the actor returned, so callers can render extra fields if they want. */
  raw?: unknown;
};

export class ApifyNotConfiguredError extends Error {
  constructor() {
    super("APIFY_TOKEN is not configured");
    this.name = "ApifyNotConfiguredError";
  }
}

export class ApifyAhrefsError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApifyAhrefsError";
  }
}

const SYNC_TIMEOUT_MS = 90_000;

/**
 * Run the Ahrefs scraper actor synchronously and return the first dataset
 * item normalized to {@link AhrefsSnapshot}.
 *
 * Pass `signal` from caller code if you want to bound the request below
 * the 90s default (e.g. inside a 30s API route).
 */
export async function fetchAhrefsSnapshot(
  rawDomain: string,
  opts?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<AhrefsSnapshot> {
  if (!env.APIFY_TOKEN) throw new ApifyNotConfiguredError();

  const domain = normalizeDomain(rawDomain);
  const actor = env.APIFY_AHREFS_ACTOR_ID;
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(
    actor
  )}/run-sync-get-dataset-items?token=${encodeURIComponent(env.APIFY_TOKEN)}`;

  const ctrl = new AbortController();
  const externalAbort = () => ctrl.abort();
  opts?.signal?.addEventListener("abort", externalAbort);
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? SYNC_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Most ahrefs-style actors accept either `{ domains: [...] }` or
      // `{ startUrls: [{ url }] }`. We send both — actors ignore unknown keys.
      body: JSON.stringify({
        domains: [domain],
        startUrls: [{ url: `https://${domain}` }],
        maxResults: 1,
      }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
    opts?.signal?.removeEventListener("abort", externalAbort);
  }

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new ApifyAhrefsError(
      `Apify Ahrefs actor returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
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

  if (!Array.isArray(items) || items.length === 0) {
    throw new ApifyAhrefsError("Apify actor returned no items for this domain");
  }

  return normalize(items[0], domain);
}

function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.split("/")[0];
  return s;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v.replace(/[, _]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function pickArray(obj: Record<string, unknown>, keys: string[]): unknown[] {
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function normalize(item: unknown, domain: string): AhrefsSnapshot {
  const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;

  const topKwRaw = pickArray(o, [
    "topKeywords",
    "top_keywords",
    "organicKeywords",
    "organic_keywords_list",
    "keywords",
  ]);

  const topKeywords = topKwRaw
    .slice(0, 25)
    .map((row) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const keyword =
        (typeof r.keyword === "string" && r.keyword) ||
        (typeof r.kw === "string" && r.kw) ||
        (typeof r.query === "string" && r.query) ||
        "";
      if (!keyword) return null;
      return {
        keyword,
        position: pickNumber(r, ["position", "rank", "pos"]),
        volume: pickNumber(r, ["volume", "search_volume", "searchVolume", "sv"]),
        traffic: pickNumber(r, ["traffic", "trafficEstimate", "estimatedTraffic"]),
        url:
          (typeof r.url === "string" && r.url) ||
          (typeof r.landingPage === "string" && r.landingPage) ||
          null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return {
    domain,
    domainRating: pickNumber(o, [
      "domainRating",
      "domain_rating",
      "dr",
      "DR",
      "ahrefsRank",
    ]),
    organicKeywords: pickNumber(o, [
      "organicKeywordsCount",
      "organic_keywords",
      "organicKeywords",
      "keywordsCount",
    ]),
    organicTraffic: pickNumber(o, [
      "organicTraffic",
      "organic_traffic",
      "trafficEstimate",
      "estimatedTraffic",
    ]),
    backlinks: pickNumber(o, ["backlinks", "backlinks_count", "totalBacklinks"]),
    referringDomains: pickNumber(o, [
      "referringDomains",
      "referring_domains",
      "refDomains",
    ]),
    topKeywords,
    fetchedAt: new Date().toISOString(),
    raw: item,
  };
}
