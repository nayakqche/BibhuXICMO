"use client";

import { useState, useTransition } from "react";
import {
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  Medal,
  Pencil,
  Search,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Badge } from "@/frontend/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import { cn } from "@/shared/utils";
import {
  runKeywordDifficultyAction,
  runKeywordMetricsAction,
  runKeywordRankAction,
  runSerpOverviewAction,
  runTopWebsitesAction,
} from "./keyword-tool-actions";
import type {
  KeywordDifficultyResult,
  KeywordMetricsResult,
  KeywordRankResult,
  SerpOverviewResult,
  TopWebsitesResult,
} from "@/backend/ahrefs-tools";

// ---------------------------------------------------------------------------
// Country list (top SEO targets)
// ---------------------------------------------------------------------------
const COUNTRIES = [
  { value: "us", label: "United States" },
  { value: "gb", label: "United Kingdom" },
  { value: "in", label: "India" },
  { value: "ca", label: "Canada" },
  { value: "au", label: "Australia" },
  { value: "de", label: "Germany" },
  { value: "fr", label: "France" },
  { value: "br", label: "Brazil" },
  { value: "mx", label: "Mexico" },
  { value: "es", label: "Spain" },
  { value: "it", label: "Italy" },
  { value: "jp", label: "Japan" },
  { value: "ae", label: "UAE" },
  { value: "sg", label: "Singapore" },
] as const;

function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function kdClasses(kd: number | null): string {
  if (kd === null) return "bg-muted text-muted-foreground";
  if (kd < 10) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (kd < 30) return "bg-lime-500/15 text-lime-700 dark:text-lime-300";
  if (kd < 50) return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  if (kd < 75) return "bg-orange-500/15 text-orange-700 dark:text-orange-300";
  return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
}

function CountrySelect({
  value,
  onChange,
  disabled,
  id = "country",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      {COUNTRIES.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

function CacheBadge({ fromCache, at }: { fromCache: boolean; at: Date }) {
  return (
    <span className="text-[10px] text-muted-foreground">
      {fromCache ? "cached" : "fresh"} · {new Date(at).toLocaleString()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------
export function KeywordTools({
  defaultDomain,
  hasApifyToken,
}: {
  defaultDomain: string;
  hasApifyToken: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Keyword Tools
            </CardTitle>
            <CardDescription>
              Ahrefs-powered. Results cache for 24h to keep Apify costs down.
            </CardDescription>
          </div>
          {!hasApifyToken && (
            <Badge variant="destructive" className="gap-1 text-[10px]">
              APIFY_TOKEN missing
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="kd">
          <div className="-mx-1 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="inline-flex min-w-full whitespace-nowrap">
              <TabsTrigger value="kd" className="gap-1.5 text-xs">
                <Pencil className="h-3.5 w-3.5" /> Keyword Difficulty
              </TabsTrigger>
              <TabsTrigger value="metrics" className="gap-1.5 text-xs">
                <BarChart3 className="h-3.5 w-3.5" /> Keyword Metrics
              </TabsTrigger>
              <TabsTrigger value="rank" className="gap-1.5 text-xs">
                <Medal className="h-3.5 w-3.5" /> Rank Checker
              </TabsTrigger>
              <TabsTrigger value="serp" className="gap-1.5 text-xs">
                <Search className="h-3.5 w-3.5" /> SERP Overview
              </TabsTrigger>
              <TabsTrigger value="top" className="gap-1.5 text-xs">
                <Star className="h-3.5 w-3.5" /> Top Websites
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="kd" className="mt-4">
            <KeywordDifficultyTool />
          </TabsContent>
          <TabsContent value="metrics" className="mt-4">
            <KeywordMetricsTool />
          </TabsContent>
          <TabsContent value="rank" className="mt-4">
            <RankCheckerTool defaultDomain={defaultDomain} />
          </TabsContent>
          <TabsContent value="serp" className="mt-4">
            <SerpOverviewTool />
          </TabsContent>
          <TabsContent value="top" className="mt-4">
            <TopWebsitesTool />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tool 1 — Keyword Difficulty
// ---------------------------------------------------------------------------
function KeywordDifficultyTool() {
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("us");
  const [data, setData] = useState<KeywordDifficultyResult | null>(null);
  const [meta, setMeta] = useState<{ fromCache: boolean; at: Date } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!keyword.trim()) {
      toast.error("Enter a keyword");
      return;
    }
    startTransition(async () => {
      const res = await runKeywordDifficultyAction({ keyword, country });
      if (!res.ok) {
        toast.error("Lookup failed", { description: res.error, duration: 8000 });
        return;
      }
      setData(res.data);
      setMeta({ fromCache: res.fromCache, at: res.cachedAt });
      toast.success(res.fromCache ? "Loaded from cache" : "Fresh result");
    });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
        <div>
          <Label htmlFor="kd-kw">Keyword</Label>
          <Input
            id="kd-kw"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="best running shoes"
            className="mt-1.5"
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
        </div>
        <div>
          <Label htmlFor="kd-country">Country</Label>
          <div className="mt-1.5">
            <CountrySelect id="kd-country" value={country} onChange={setCountry} disabled={pending} />
          </div>
        </div>
        <div className="flex items-end">
          <Button onClick={run} disabled={pending} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Check KD
          </Button>
        </div>
      </div>
      {data && (
        <Card className="bg-muted/20">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Keyword Difficulty</div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-4xl font-bold tabular-nums">
                    {data.difficulty ?? "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">/100</span>
                </div>
              </div>
              {data.label && (
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    kdClasses(data.difficulty)
                  )}
                >
                  {data.label}
                </span>
              )}
            </div>
            {data.estimatedReferringDomainsToRank !== null && (
              <p className="text-xs text-muted-foreground">
                Estimated{" "}
                <strong>{fmtNumber(data.estimatedReferringDomainsToRank)}</strong>{" "}
                referring domains needed to break into the top 10.
              </p>
            )}
            {meta && <CacheBadge fromCache={meta.fromCache} at={meta.at} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool 2 — Keyword Metrics (volume, KD, CPC, traffic potential)
// ---------------------------------------------------------------------------
function KeywordMetricsTool() {
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("us");
  const [data, setData] = useState<KeywordMetricsResult | null>(null);
  const [meta, setMeta] = useState<{ fromCache: boolean; at: Date } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!keyword.trim()) {
      toast.error("Enter a keyword");
      return;
    }
    startTransition(async () => {
      const res = await runKeywordMetricsAction({ keyword, country });
      if (!res.ok) {
        toast.error("Lookup failed", { description: res.error, duration: 8000 });
        return;
      }
      setData(res.data);
      setMeta({ fromCache: res.fromCache, at: res.cachedAt });
      toast.success(res.fromCache ? "Loaded from cache" : "Fresh result");
    });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
        <div>
          <Label htmlFor="km-kw">Keyword</Label>
          <Input
            id="km-kw"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="email marketing tools"
            className="mt-1.5"
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
        </div>
        <div>
          <Label htmlFor="km-country">Country</Label>
          <div className="mt-1.5">
            <CountrySelect id="km-country" value={country} onChange={setCountry} disabled={pending} />
          </div>
        </div>
        <div className="flex items-end">
          <Button onClick={run} disabled={pending} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            Get metrics
          </Button>
        </div>
      </div>
      {data && (
        <Card className="bg-muted/20">
          <CardContent className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Volume" value={fmtNumber(data.searchVolume)} />
              <Stat label="Difficulty" value={data.difficulty?.toString() ?? "—"} suffix="/100" />
              <Stat label="CPC" value={data.cpc !== null ? `$${data.cpc.toFixed(2)}` : "—"} />
              <Stat label="Traffic potential" value={fmtNumber(data.trafficPotential)} />
            </div>
            {data.intent && (
              <div className="text-xs">
                <span className="text-muted-foreground">Intent: </span>
                <Badge variant="outline" className="capitalize">{data.intent}</Badge>
              </div>
            )}
            {data.related.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Related keywords
                </div>
                <ul className="divide-y rounded-md border">
                  {data.related.map((k) => (
                    <li
                      key={k.keyword}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="truncate">{k.keyword}</span>
                      <span className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>vol {fmtNumber(k.volume)}</span>
                        <span>kd {k.difficulty ?? "—"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {meta && <CacheBadge fromCache={meta.fromCache} at={meta.at} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool 3 — Rank Checker
// ---------------------------------------------------------------------------
function RankCheckerTool({ defaultDomain }: { defaultDomain: string }) {
  const [domain, setDomain] = useState(defaultDomain);
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("us");
  const [data, setData] = useState<KeywordRankResult | null>(null);
  const [meta, setMeta] = useState<{ fromCache: boolean; at: Date } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!domain.trim() || !keyword.trim()) {
      toast.error("Enter both a domain and a keyword");
      return;
    }
    startTransition(async () => {
      const res = await runKeywordRankAction({ domain, keyword, country });
      if (!res.ok) {
        toast.error("Lookup failed", { description: res.error, duration: 8000 });
        return;
      }
      setData(res.data);
      setMeta({ fromCache: res.fromCache, at: res.cachedAt });
      toast.success(res.fromCache ? "Loaded from cache" : "Fresh result");
    });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="rc-domain">Domain</Label>
          <Input
            id="rc-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            className="mt-1.5"
            disabled={pending}
          />
        </div>
        <div>
          <Label htmlFor="rc-kw">Keyword</Label>
          <Input
            id="rc-kw"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="best crm software"
            className="mt-1.5"
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_auto]">
        <div>
          <Label htmlFor="rc-country">Country</Label>
          <div className="mt-1.5">
            <CountrySelect id="rc-country" value={country} onChange={setCountry} disabled={pending} />
          </div>
        </div>
        <div className="flex items-end">
          <Button onClick={run} disabled={pending} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Medal className="h-4 w-4" />}
            Check rank
          </Button>
        </div>
      </div>
      {data && (
        <Card className="bg-muted/20">
          <CardContent className="space-y-2 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Current rank</div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-4xl font-bold tabular-nums">
                    {data.position !== null ? `#${data.position}` : "Not in top 100"}
                  </span>
                </div>
              </div>
              {data.serpFeature && (
                <Badge variant="outline" className="text-xs">
                  {data.serpFeature}
                </Badge>
              )}
            </div>
            {data.url && (
              <a
                href={data.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 break-all text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                {data.url}
              </a>
            )}
            {meta && <CacheBadge fromCache={meta.fromCache} at={meta.at} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool 4 — SERP Overview
// ---------------------------------------------------------------------------
function SerpOverviewTool() {
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("us");
  const [data, setData] = useState<SerpOverviewResult | null>(null);
  const [meta, setMeta] = useState<{ fromCache: boolean; at: Date } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!keyword.trim()) {
      toast.error("Enter a keyword");
      return;
    }
    startTransition(async () => {
      const res = await runSerpOverviewAction({ keyword, country });
      if (!res.ok) {
        toast.error("Lookup failed", { description: res.error, duration: 8000 });
        return;
      }
      setData(res.data);
      setMeta({ fromCache: res.fromCache, at: res.cachedAt });
      toast.success(res.fromCache ? "Loaded from cache" : "Fresh result");
    });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
        <div>
          <Label htmlFor="sp-kw">Keyword</Label>
          <Input
            id="sp-kw"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="content marketing strategy"
            className="mt-1.5"
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
        </div>
        <div>
          <Label htmlFor="sp-country">Country</Label>
          <div className="mt-1.5">
            <CountrySelect id="sp-country" value={country} onChange={setCountry} disabled={pending} />
          </div>
        </div>
        <div className="flex items-end">
          <Button onClick={run} disabled={pending} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Run SERP
          </Button>
        </div>
      </div>
      {data && (
        <Card className="bg-muted/20">
          <CardContent className="space-y-3 py-4">
            {data.features.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {data.features.map((f) => (
                  <Badge key={f} variant="outline" className="text-[10px]">
                    {f}
                  </Badge>
                ))}
              </div>
            )}
            {data.results.length === 0 ? (
              <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                No SERP results returned. The actor may not support SERP for this country.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {data.results.map((r) => (
                  <li key={`${r.position}-${r.url}`} className="px-3 py-3 text-sm">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                        {r.position}
                      </span>
                      <div className="min-w-0 flex-1">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate font-medium hover:underline"
                        >
                          {r.title}
                        </a>
                        <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                          {r.url}
                        </div>
                        {r.snippet && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {r.snippet}
                          </p>
                        )}
                        <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                          {r.domainRating !== null && (
                            <span>DR {r.domainRating}</span>
                          )}
                          {r.traffic !== null && (
                            <span>{fmtNumber(r.traffic)} mo/visits</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {meta && <CacheBadge fromCache={meta.fromCache} at={meta.at} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool 5 — Top Websites
// ---------------------------------------------------------------------------
function TopWebsitesTool() {
  const [country, setCountry] = useState("us");
  const [category, setCategory] = useState("");
  const [data, setData] = useState<TopWebsitesResult | null>(null);
  const [meta, setMeta] = useState<{ fromCache: boolean; at: Date } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = await runTopWebsitesAction({ country, category: category || null });
      if (!res.ok) {
        toast.error("Lookup failed", { description: res.error, duration: 8000 });
        return;
      }
      setData(res.data);
      setMeta({ fromCache: res.fromCache, at: res.cachedAt });
      toast.success(res.fromCache ? "Loaded from cache" : "Fresh result");
    });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr_auto]">
        <div>
          <Label htmlFor="tw-country">Country</Label>
          <div className="mt-1.5">
            <CountrySelect id="tw-country" value={country} onChange={setCountry} disabled={pending} />
          </div>
        </div>
        <div>
          <Label htmlFor="tw-cat">Category (optional)</Label>
          <Input
            id="tw-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="finance, e-commerce, news…"
            className="mt-1.5"
            disabled={pending}
          />
        </div>
        <div className="flex items-end">
          <Button onClick={run} disabled={pending} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            Top sites
          </Button>
        </div>
      </div>
      {data && (
        <Card className="bg-muted/20">
          <CardContent className="space-y-3 py-4">
            {data.entries.length === 0 ? (
              <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                No matches. Try without a category filter, or pick a different country.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {data.entries.slice(0, 25).map((e) => (
                  <li
                    key={`${e.rank}-${e.domain}`}
                    className="flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                      {e.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={`https://${e.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 font-medium hover:underline"
                      >
                        <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{e.domain}</span>
                      </a>
                      {e.category && (
                        <div className="text-[10px] text-muted-foreground">{e.category}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                      {e.domainRating !== null && <span>DR {e.domainRating}</span>}
                      {e.traffic !== null && <span>{fmtNumber(e.traffic)}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {meta && <CacheBadge fromCache={meta.fromCache} at={meta.at} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

// CheckCircle2 import is referenced for future status badges — silence ESLint
void CheckCircle2;
