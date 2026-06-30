import { env } from "@/shared/env";

export type LighthouseScores = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
};

/** A Core Web Vital / lab metric (FCP, LCP, TBT, CLS, Speed Index, TTI). */
export type CoreWebVital = {
  id: string;
  label: string;
  /** Human display value, e.g. "0.5 s" or "0.02". */
  value: string;
  /** Lighthouse 0–1 score (null when not scored). Drives the colour. */
  score: number | null;
};

/** A Lighthouse opportunity / diagnostic with an estimated saving. */
export type PageSpeedOpportunity = {
  id: string;
  title: string;
  displayValue: string | null;
  savingsMs: number | null;
  savingsBytes: number | null;
  score: number | null;
};

/** Rich audit data extracted from the Lighthouse report (mobile run). */
export type PageSpeedDetail = {
  metrics: CoreWebVital[];
  opportunities: PageSpeedOpportunity[];
};

export type PageSpeedResult = {
  ok: boolean;
  url: string;
  mobile: LighthouseScores;
  desktop: LighthouseScores;
  /** Core Web Vitals + opportunities from the mobile run. */
  detail?: PageSpeedDetail;
  /** Core Web Vitals + opportunities from the desktop run. */
  desktopDetail?: PageSpeedDetail;
  fetchedAt: string;
  error?: string;
};

// Order matches Google's PageSpeed "Metrics" panel.
const METRIC_DEFS: Array<{ id: string; label: string }> = [
  { id: "first-contentful-paint", label: "First Contentful Paint" },
  { id: "largest-contentful-paint", label: "Largest Contentful Paint" },
  { id: "total-blocking-time", label: "Total Blocking Time" },
  { id: "cumulative-layout-shift", label: "Cumulative Layout Shift" },
  { id: "speed-index", label: "Speed Index" },
  { id: "interactive", label: "Time to Interactive" },
];

// Opportunities + diagnostics worth surfacing. We only show the ones with
// room to improve (score < 1), ranked by estimated saving.
const OPPORTUNITY_IDS = [
  "render-blocking-resources",
  "unused-javascript",
  "unused-css-rules",
  "legacy-javascript",
  "unminified-javascript",
  "unminified-css",
  "modern-image-formats",
  "uses-optimized-images",
  "uses-responsive-images",
  "offscreen-images",
  "efficient-animated-content",
  "duplicated-javascript",
  "uses-text-compression",
  "uses-long-cache-ttl",
  "total-byte-weight",
  "dom-size",
  "mainthread-work-breakdown",
  "bootup-time",
  "server-response-time",
  "redirects",
  "third-party-summary",
];

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
// Lighthouse can take 30-50s on a heavy site; mobile emulation is the slow one.
// 60s is the upper bound; if we still time out, the URL is unscorable.
const TIMEOUT_MS = 60_000;
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;

type ApiAudit = {
  id?: string;
  title?: string;
  score?: number | null;
  displayValue?: string;
  numericValue?: number;
  details?: {
    type?: string;
    overallSavingsMs?: number;
    overallSavingsBytes?: number;
  };
};

type ApiResponse = {
  lighthouseResult?: {
    categories?: Record<string, { score?: number | null }>;
    audits?: Record<string, ApiAudit>;
  };
};

type RunResult = {
  scores: LighthouseScores;
  detail?: PageSpeedDetail;
  error?: string;
};

function extractDetail(
  audits: Record<string, ApiAudit> | undefined
): PageSpeedDetail {
  const a = audits ?? {};
  const metrics: CoreWebVital[] = METRIC_DEFS.flatMap((def) => {
    const audit = a[def.id];
    if (!audit || audit.displayValue == null) return [];
    return [
      {
        id: def.id,
        label: def.label,
        value: audit.displayValue,
        score: audit.score ?? null,
      },
    ];
  });

  const opportunities: PageSpeedOpportunity[] = OPPORTUNITY_IDS.flatMap((id) => {
    const audit = a[id];
    if (!audit) return [];
    // Only surface audits with room to improve (skip perfect / passing ones).
    if (audit.score == null || audit.score >= 1) return [];
    const savingsMs = audit.details?.overallSavingsMs ?? null;
    const savingsBytes = audit.details?.overallSavingsBytes ?? null;
    return [
      {
        id,
        title: audit.title ?? id,
        displayValue: audit.displayValue ?? null,
        savingsMs: savingsMs && savingsMs > 0 ? Math.round(savingsMs) : null,
        savingsBytes:
          savingsBytes && savingsBytes > 0 ? Math.round(savingsBytes) : null,
        score: audit.score ?? null,
      },
    ];
  })
    .sort(
      (x, y) =>
        (y.savingsMs ?? 0) - (x.savingsMs ?? 0) ||
        (y.savingsBytes ?? 0) - (x.savingsBytes ?? 0) ||
        (x.score ?? 1) - (y.score ?? 1)
    )
    .slice(0, 8);

  return { metrics, opportunities };
}

async function runOne(
  url: string,
  strategy: "mobile" | "desktop",
  attempt = 1
): Promise<RunResult> {
  const params = new URLSearchParams({ url, strategy });
  for (const c of CATEGORIES) params.append("category", c);
  if (env.PAGESPEED_API_KEY) params.set("key", env.PAGESPEED_API_KEY);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      let body = "";
      try {
        body = (await res.text()).slice(0, 300);
      } catch {
        /* ignore */
      }
      console.warn(
        `[pagespeed] ${strategy} ${url} failed: HTTP ${res.status} ${body}`
      );
      return {
        scores: emptyScores(),
        error: `Google PageSpeed returned ${res.status}${body ? ` — ${body.slice(0, 120)}` : ""}`,
      };
    }
    const json = (await res.json()) as ApiResponse;
    const cats = json.lighthouseResult?.categories ?? {};
    return {
      scores: {
        performance: pct(cats.performance?.score),
        accessibility: pct(cats.accessibility?.score),
        bestPractices: pct(cats["best-practices"]?.score),
        seo: pct(cats.seo?.score),
      },
      detail: extractDetail(json.lighthouseResult?.audits),
    };
  } catch (err) {
    const e = err as Error;
    const isAbort = e?.name === "AbortError";
    console.warn(
      `[pagespeed] ${strategy} ${url} threw on attempt ${attempt}: ${isAbort ? "timeout" : e?.message}`
    );
    // Retry once on timeout — Lighthouse cold-start can blow the first call
    // on free Render hardware. Second attempt usually completes in <30s.
    if (isAbort && attempt === 1) {
      clearTimeout(timer);
      return runOne(url, strategy, 2);
    }
    return {
      scores: emptyScores(),
      error: isAbort
        ? `Google PageSpeed timed out after ${Math.round(TIMEOUT_MS / 1000)}s on both attempts — the URL is too slow for Lighthouse. Try a smaller landing page.`
        : `Google PageSpeed call failed: ${e?.message || "unknown error"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function emptyScores(): LighthouseScores {
  return { performance: null, accessibility: null, bestPractices: null, seo: null };
}

function pct(score: number | null | undefined): number | null {
  if (score == null) return null;
  return Math.round(score * 100);
}

export async function fetchPageSpeed(url: string): Promise<PageSpeedResult> {
  if (!url) {
    return {
      ok: false,
      url,
      mobile: emptyScores(),
      desktop: emptyScores(),
      fetchedAt: new Date().toISOString(),
      error: "missing_url",
    };
  }

  try {
    const [mobile, desktop] = await Promise.all([
      runOne(url, "mobile"),
      runOne(url, "desktop"),
    ]);
    const ok =
      Object.values(mobile.scores).some((v) => v != null) ||
      Object.values(desktop.scores).some((v) => v != null);
    const errorReason = !ok
      ? mobile.error || desktop.error || "Google PageSpeed returned no scores."
      : undefined;
    return {
      ok,
      url,
      mobile: mobile.scores,
      desktop: desktop.scores,
      detail: mobile.detail,
      desktopDetail: desktop.detail,
      fetchedAt: new Date().toISOString(),
      error: errorReason,
    };
  } catch (err) {
    return {
      ok: false,
      url,
      mobile: emptyScores(),
      desktop: emptyScores(),
      fetchedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : "pagespeed_failed",
    };
  }
}
