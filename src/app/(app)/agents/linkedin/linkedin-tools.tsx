"use client";

import { useState, useTransition } from "react";
import {
  Building2,
  ExternalLink,
  FileText,
  Heart,
  Image as ImageIcon,
  Loader2,
  Mail,
  MessageSquare,
  Newspaper,
  Repeat2,
  Sparkles,
  ThumbsUp,
  UserPlus,
  UserSearch,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent } from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { Textarea } from "@/frontend/components/ui/textarea";
import { Label } from "@/frontend/components/ui/label";
import { Badge } from "@/frontend/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import {
  startCompanyPostsAction,
  startProfilesAction,
  pollLinkedInToolAction,
  analyzeCompanyPostsAction,
  draftProfileOutreachAction,
  type CompanyPostsInsights,
  type ProfileOutreach,
} from "./linkedin-actions";
import type {
  LinkedInCompanyPostsResult,
  LinkedInProfilesResult,
  LinkedInProfile,
  LinkedInPost,
  LinkedInMediaType,
} from "@/integrations/linkedin-apify";
import type { LinkedInPollInput } from "@/backend/linkedin-tools";
import { LinkedinLogo } from "@/frontend/components/brand-logos";

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_MS = 4 * 60 * 1000;

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const MEDIA_META: Record<LinkedInMediaType, { label: string; Icon: React.ElementType } | null> = {
  image: { label: "Image", Icon: ImageIcon },
  video: { label: "Video", Icon: Video },
  article: { label: "Article", Icon: Newspaper },
  document: { label: "Document", Icon: FileText },
  none: null,
};

function RunningPanel({ elapsedMs, statusMsg }: { elapsedMs: number; statusMsg?: string }) {
  const seconds = Math.floor(elapsedMs / 1000);
  return (
    <Card className="border-dashed bg-muted/10">
      <CardContent className="flex items-center gap-3 py-4 text-sm">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">Scraping LinkedIn via Apify…</div>
          <div className="text-xs text-muted-foreground">
            {statusMsg ? statusMsg : "Spinning up the actor."}{" "}
            <span className="tabular-nums">{seconds}s</span> elapsed · usually 30-90s.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

async function pollUntilDone(
  buildInput: () => LinkedInPollInput,
  onProgress: (elapsedMs: number, statusMsg?: string) => void
): Promise<
  | { ok: true; status: "DONE"; data: unknown; cachedAt: Date }
  | { ok: false; error: string }
> {
  const start = Date.now();
  while (Date.now() - start < POLL_MAX_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let res;
    try {
      res = await pollLinkedInToolAction(buildInput());
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
    if (!res.ok) return res;
    if (res.status === "DONE") return res;
    onProgress(Date.now() - start, res.statusMessage);
  }
  return {
    ok: false,
    error: "Apify run didn't finish within 4 minutes. Try again later.",
  };
}

// ===========================================================================

export function LinkedInTools({
  defaultCompany,
  hasApifyToken,
}: {
  defaultCompany: string;
  hasApifyToken: boolean;
}) {
  return (
    <Card className="overflow-hidden border-[#0A66C2]/30">
      <div className="flex items-center gap-3 border-b bg-gradient-to-r from-[#0A66C2]/15 via-sky-500/10 to-transparent px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-[#0A66C2]/20">
          <LinkedinLogo className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-base font-semibold">LinkedIn intelligence</h2>
          <p className="text-xs text-muted-foreground">
            Scrape company posts &amp; enrich prospect profiles via Apify — no cookies, no account.
          </p>
        </div>
      </div>
      <CardContent className="pt-5">
        {!hasApifyToken && (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
            Add your Apify keys to enable scraping:{" "}
            <code>APIFY_LINKEDIN_PROFILE_TOKEN</code> (profiles) and{" "}
            <code>APIFY_LINKEDIN_POSTS_TOKEN</code> (company posts).
          </div>
        )}
        <Tabs defaultValue="company">
          <TabsList>
            <TabsTrigger value="company" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Company posts
            </TabsTrigger>
            <TabsTrigger value="profile" className="gap-1.5">
              <Users className="h-3.5 w-3.5" /> Bulk profiles
            </TabsTrigger>
          </TabsList>
          <TabsContent value="company" className="mt-4">
            <CompanyInsightsTool defaultCompany={defaultCompany} disabled={!hasApifyToken} />
          </TabsContent>
          <TabsContent value="profile" className="mt-4">
            <BulkProfileTool disabled={!hasApifyToken} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Small checkbox toggle (no extra dependency).
function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2 text-sm select-none"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary disabled:opacity-50"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
function CompanyInsightsTool({
  defaultCompany,
  disabled,
}: {
  defaultCompany: string;
  disabled: boolean;
}) {
  const [target, setTarget] = useState(defaultCompany);
  const [maxPosts, setMaxPosts] = useState(25);
  const [scrapeReactions, setScrapeReactions] = useState(false);
  const [scrapeComments, setScrapeComments] = useState(false);
  const [data, setData] = useState<LinkedInCompanyPostsResult | null>(null);
  const [insights, setInsights] = useState<CompanyPostsInsights | null>(null);
  const [progress, setProgress] = useState<{ elapsedMs: number; statusMsg?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [analyzing, startAnalyze] = useTransition();
  const [commenters, setCommenters] = useState<LinkedInProfilesResult | null>(null);
  const [commProgress, setCommProgress] = useState<{ elapsedMs: number; statusMsg?: string } | null>(null);
  const [scraping, startScrape] = useTransition();

  function run() {
    if (!target.trim()) {
      toast.error("Enter a company or profile URL");
      return;
    }
    startTransition(async () => {
      setData(null);
      setInsights(null);
      setCommenters(null);
      setProgress(null);
      const targets = target
        .split(/[\n,]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await startCompanyPostsAction({
        targets,
        maxPosts,
        includeReposts: true,
        scrapeReactions,
        scrapeComments,
      });
      if (!res.ok) {
        toast.error("Scan failed", { description: res.error, duration: 8000 });
        return;
      }
      if ("pending" in res) {
        setProgress({ elapsedMs: 0 });
        const final = await pollUntilDone(
          () => ({
            type: "COMPANY_POSTS",
            targets,
            maxPosts,
            includeReposts: true,
            scrapeReactions,
            scrapeComments,
            runId: res.runId,
            datasetId: res.datasetId,
          }),
          (elapsedMs, statusMsg) => setProgress({ elapsedMs, statusMsg })
        );
        setProgress(null);
        if (!final.ok) {
          toast.error("Apify run failed", { description: final.error, duration: 9000 });
          return;
        }
        setData(final.data as LinkedInCompanyPostsResult);
        toast.success("Posts scraped");
        return;
      }
      setData(res.data);
      toast.success(res.fromCache ? "Loaded from cache" : "Posts scraped");
    });
  }

  function analyze() {
    if (!data) return;
    startAnalyze(async () => {
      const res = await analyzeCompanyPostsAction({ result: data });
      if (!res.ok) {
        toast.error("Analysis failed", { description: res.error, duration: 8000 });
        return;
      }
      setInsights(res.data);
      toast.success(`Generated ${res.data.draftIds.length} draft${res.data.draftIds.length === 1 ? "" : "s"}`);
    });
  }

  // Unique commenter profile URLs across all scraped posts (people who engaged).
  const commenterUrls = data
    ? Array.from(
        new Set(
          data.posts
            .flatMap((post) => post.topComments)
            .map((c) => c.authorUrl)
            .filter((u): u is string => !!u && /linkedin\.com\/in\//i.test(u))
        )
      )
    : [];

  function scrapeCommenters() {
    const urls = commenterUrls.slice(0, 20);
    if (urls.length === 0) {
      toast.error("No commenter profiles found. Turn on \u201cScrape comments\u201d and rescan first.");
      return;
    }
    startScrape(async () => {
      setCommenters(null);
      setCommProgress({ elapsedMs: 0 });
      const res = await startProfilesAction({ queries: urls, findEmail: false });
      if (!res.ok) {
        setCommProgress(null);
        toast.error("Lookup failed", { description: res.error, duration: 8000 });
        return;
      }
      if ("pending" in res) {
        const final = await pollUntilDone(
          () => ({
            type: "PROFILES",
            queries: urls,
            findEmail: false,
            runId: res.runId,
            datasetId: res.datasetId,
          }),
          (elapsedMs, statusMsg) => setCommProgress({ elapsedMs, statusMsg })
        );
        setCommProgress(null);
        if (!final.ok) {
          toast.error("Apify run failed", { description: final.error, duration: 9000 });
          return;
        }
        const d = final.data as LinkedInProfilesResult;
        setCommenters(d);
        toast.success(`Enriched ${d.count} commenter${d.count === 1 ? "" : "s"}`);
        return;
      }
      setCommProgress(null);
      setCommenters(res.data);
      toast.success(
        res.fromCache
          ? "Loaded from cache"
          : `Enriched ${res.data.count} commenter${res.data.count === 1 ? "" : "s"}`
      );
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Extract posts from LinkedIn companies — content, media, engagement and
        more. No cookies or account required.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_auto]">
        <div>
          <Label htmlFor="li-company">Company or profile URL(s)</Label>
          <Input
            id="li-company"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="linkedin.com/company/openai  (comma-separate up to 5)"
            className="mt-1.5"
            disabled={pending || disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
        </div>
        <div>
          <Label htmlFor="li-max">Max posts</Label>
          <Input
            id="li-max"
            type="number"
            min={1}
            max={50}
            value={maxPosts}
            onChange={(e) => setMaxPosts(Number(e.target.value))}
            className="mt-1.5"
            disabled={pending || disabled}
          />
        </div>
        <div className="flex items-end">
          <Button onClick={run} disabled={pending || disabled} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            Scan posts
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Toggle
          id="li-reactions"
          label="Scrape reactions"
          hint="Per-post reaction breakdown (extra Apify cost)"
          checked={scrapeReactions}
          onChange={setScrapeReactions}
          disabled={pending || disabled}
        />
        <Toggle
          id="li-comments"
          label="Scrape comments"
          hint="Top comments per post (extra Apify cost)"
          checked={scrapeComments}
          onChange={setScrapeComments}
          disabled={pending || disabled}
        />
      </div>

      {progress && <RunningPanel elapsedMs={progress.elapsedMs} statusMsg={progress.statusMsg} />}

      {data && (
        <Card className="bg-muted/20">
          <CardContent className="space-y-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <span className="font-semibold tabular-nums">{data.totalPosts}</span> posts ·
                sorted by engagement
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {commenterUrls.length > 0 && (
                  <Button size="sm" variant="outline" onClick={scrapeCommenters} disabled={scraping} className="gap-1.5">
                    {scraping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                    Scrape {commenterUrls.length} commenter{commenterUrls.length === 1 ? "" : "s"}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={analyze} disabled={analyzing} className="gap-1.5">
                  {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Analyze + draft
                </Button>
              </div>
            </div>

            {data.posts.length === 0 ? (
              <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                No posts found for that target.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.posts.slice(0, 12).map((p) => (
                  <PostRow key={p.id} post={p} />
                ))}
              </ul>
            )}

            {insights && <InsightsBlock insights={insights} />}

            {commProgress && (
              <RunningPanel elapsedMs={commProgress.elapsedMs} statusMsg={commProgress.statusMsg} />
            )}
            {commenters && (
              <div className="space-y-3 rounded-md border border-[#0A66C2]/30 bg-[#0A66C2]/5 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#0A66C2] dark:text-sky-400">
                  People who commented
                </div>
                <ProfileResults result={commenters} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PostRow({ post: p }: { post: LinkedInPost }) {
  const media = MEDIA_META[p.mediaType];
  return (
    <li className="rounded-md border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{p.authorName}</span>
            {p.postedAgo && <span>· {p.postedAgo}</span>}
            {p.type && p.type !== "post" && (
              <Badge variant="outline" className="text-[10px]">{p.type}</Badge>
            )}
            {media && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <media.Icon className="h-3 w-3" /> {media.label}
              </Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap">{p.content || "(no text)"}</p>
          {p.mediaUrl && (p.mediaType === "image" || p.mediaType === "video") && (
            <div className="relative mt-2 overflow-hidden rounded-md border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.mediaUrl} alt="" loading="lazy" className="max-h-56 w-full object-cover" />
              {p.mediaType === "video" && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Video className="h-8 w-8 text-white drop-shadow" />
                </span>
              )}
            </div>
          )}
        </div>
        {p.url && (
          <a href={p.url} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-primary">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {fmt(p.likes)}</span>
        <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {fmt(p.comments)}</span>
        <span className="flex items-center gap-1"><Repeat2 className="h-3 w-3" /> {fmt(p.shares)}</span>
      </div>

      {p.topReactions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ThumbsUp className="h-3 w-3 text-muted-foreground" />
          {p.topReactions.map((r) => (
            <Badge key={r.type} variant="outline" className="text-[10px] capitalize">
              {r.type.toLowerCase()} {fmt(r.count)}
            </Badge>
          ))}
        </div>
      )}

      {p.topComments.length > 0 && (
        <div className="mt-2 space-y-1.5 rounded-md border bg-muted/30 p-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Top comments
          </div>
          {p.topComments.slice(0, 5).map((c, i) => (
            <div key={i} className="text-xs">
              <span className="font-medium">
                {c.authorUrl ? (
                  <a href={c.authorUrl} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">
                    {c.authorName}
                  </a>
                ) : (
                  c.authorName
                )}
              </span>
              {c.authorHeadline && (
                <span className="ml-1 text-[10px] text-muted-foreground">· {c.authorHeadline}</span>
              )}
              {c.likes > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground">· {fmt(c.likes)}♥</span>
              )}
              <p className="line-clamp-2 whitespace-pre-wrap text-muted-foreground">{c.text}</p>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function InsightsBlock({ insights }: { insights: CompanyPostsInsights }) {
  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-primary">Strategy summary</div>
        <p className="mt-1 text-sm">{insights.summary}</p>
      </div>
      {insights.whatWorks.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground">What works</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {insights.whatWorks.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      {insights.contentGaps.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground">Gaps we can own</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {insights.contentGaps.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      {insights.drafts.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            {insights.drafts.length} draft{insights.drafts.length === 1 ? "" : "s"} saved to your Drafts
          </div>
          <ul className="mt-1 space-y-2">
            {insights.drafts.map((d, i) => (
              <li key={i} className="rounded-md border bg-card p-2.5 text-sm">
                <div className="font-medium">{d.hook}</div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{d.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function BulkProfileTool({ disabled }: { disabled: boolean }) {
  const [query, setQuery] = useState("");
  const [findEmail, setFindEmail] = useState(true);
  const [result, setResult] = useState<LinkedInProfilesResult | null>(null);
  const [progress, setProgress] = useState<{ elapsedMs: number; statusMsg?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    const queries = query
      .split(/[\n,]/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (queries.length === 0) {
      toast.error("Enter at least one LinkedIn profile URL");
      return;
    }
    startTransition(async () => {
      setResult(null);
      setProgress(null);
      const res = await startProfilesAction({ queries, findEmail });
      if (!res.ok) {
        toast.error("Lookup failed", { description: res.error, duration: 8000 });
        return;
      }
      if ("pending" in res) {
        setProgress({ elapsedMs: 0 });
        const final = await pollUntilDone(
          () => ({
            type: "PROFILES",
            queries,
            findEmail,
            runId: res.runId,
            datasetId: res.datasetId,
          }),
          (elapsedMs, statusMsg) => setProgress({ elapsedMs, statusMsg })
        );
        setProgress(null);
        if (!final.ok) {
          toast.error("Apify run failed", { description: final.error, duration: 9000 });
          return;
        }
        const data = final.data as LinkedInProfilesResult;
        setResult(data);
        toast.success(`Enriched ${data.count} profile${data.count === 1 ? "" : "s"}`);
        return;
      }
      setResult(res.data);
      toast.success(
        res.fromCache
          ? "Loaded from cache"
          : `Enriched ${res.data.count} profile${res.data.count === 1 ? "" : "s"}`
      );
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Extract detailed information from LinkedIn profiles in bulk — complete
        work experience, education history, skills and more.
      </p>
      <div>
        <Label htmlFor="li-profiles">LinkedIn profile URLs</Label>
        <Textarea
          id="li-profiles"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={"linkedin.com/in/williamhgates\nlinkedin.com/in/satyanadella\n(one per line or comma-separated, up to 20)"}
          className="mt-1.5 min-h-[88px]"
          disabled={pending || disabled}
        />
      </div>
      <Toggle
        id="li-find-email"
        label="Find email addresses"
        hint="SMTP-validated email lookup (extra Apify cost, not guaranteed). Phone numbers aren't available — LinkedIn never exposes them."
        checked={findEmail}
        onChange={setFindEmail}
        disabled={pending || disabled}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Up to 20 profiles per run.</span>
        <Button onClick={run} disabled={pending || disabled} className="gap-2">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserSearch className="h-4 w-4" />}
          Enrich profiles
        </Button>
      </div>

      {progress && <RunningPanel elapsedMs={progress.elapsedMs} statusMsg={progress.statusMsg} />}

      {result && <ProfileResults result={result} />}
    </div>
  );
}

function ProfileResults({ result }: { result: LinkedInProfilesResult }) {
  return (
    <div className="space-y-3">
      <div className="text-sm">
        <span className="font-semibold tabular-nums">{result.count}</span> profile
        {result.count === 1 ? "" : "s"} enriched
      </div>
      {result.profiles.length === 0 ? (
        <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          No profile data returned. Check the URLs and try again.
        </p>
      ) : (
        result.profiles.map((p, i) => (
          <ProfileCard key={p.publicIdentifier ?? p.url ?? i} profile={p} />
        ))
      )}
      {result.notFound.length > 0 && (
        <p className="text-xs text-muted-foreground">No data for: {result.notFound.join(", ")}</p>
      )}
    </div>
  );
}

function ProfileCard({ profile }: { profile: LinkedInProfile }) {
  const [outreach, setOutreach] = useState<ProfileOutreach | null>(null);
  const [drafting, startDraft] = useTransition();

  function draft() {
    startDraft(async () => {
      const res = await draftProfileOutreachAction({ profile });
      if (!res.ok) {
        toast.error("Draft failed", { description: res.error, duration: 8000 });
        return;
      }
      setOutreach(res.data);
      toast.success("Outreach drafted");
    });
  }

  return (
    <Card className="bg-muted/20">
      <CardContent className="space-y-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold">{profile.fullName}</span>
              {profile.verified && <Badge variant="success" className="text-[10px]">verified</Badge>}
              {profile.openToWork && <Badge variant="outline" className="text-[10px]">open to work</Badge>}
              {profile.url && (
                <a href={profile.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            {profile.headline && <p className="text-sm text-muted-foreground">{profile.headline}</p>}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              {profile.location && <span>{profile.location}</span>}
              {profile.currentCompany && <span>{profile.currentCompany}</span>}
              {profile.connections != null && <span>{fmt(profile.connections)} connections</span>}
              {profile.followers != null && <span>{fmt(profile.followers)} followers</span>}
            </div>
            {profile.email && (
              <a
                href={`mailto:${profile.email}`}
                className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Mail className="h-3.5 w-3.5" />
                {profile.email}
                {profile.emails.length > 1 && (
                  <span className="text-muted-foreground">+{profile.emails.length - 1} more</span>
                )}
              </a>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={draft} disabled={drafting} className="shrink-0 gap-1.5">
            {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Draft outreach
          </Button>
        </div>

        {profile.about && (
          <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{profile.about}</p>
        )}

        {profile.experience.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground">Experience</div>
            <ul className="mt-1 space-y-1 text-sm">
              {profile.experience.slice(0, 5).map((e, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{e.position ?? "—"} · {e.company ?? "—"}</span>
                  {e.duration && <span className="shrink-0 text-[11px] text-muted-foreground">{e.duration}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {profile.education.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground">Education</div>
            <ul className="mt-1 space-y-1 text-sm">
              {profile.education.slice(0, 4).map((e, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{e.school ?? "—"}{e.degree ? ` · ${e.degree}` : ""}</span>
                  {e.period && <span className="shrink-0 text-[11px] text-muted-foreground">{e.period}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {profile.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {profile.skills.slice(0, 14).map((s) => (
              <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
            ))}
          </div>
        )}

        {outreach && (
          <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-primary">Connection note</div>
              <p className="mt-1 text-sm">{outreach.connectionNote}</p>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Follow-up DM</div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{outreach.dm}</p>
            </div>
            {outreach.talkingPoints.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Talking points</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                  {outreach.talkingPoints.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
