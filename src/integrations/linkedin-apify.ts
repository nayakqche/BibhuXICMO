/**
 * Apify (HarvestAPI) LinkedIn scrapers.
 *
 * Two actors, both billed per dataset item, both run via the async
 * start + poll + fetch pattern (Render kills server-action HTTP at ~60s and
 * a posts pull can exceed that):
 *
 *   - PROFILE        harvestapi/linkedin-profile-scraper
 *                    input: { url | publicIdentifier | profileId } for one,
 *                    or { queries: [...] } for bulk lookups
 *                    output: one item per profile { element: {...profile...} }
 *                    ~$4 / 1k profiles.
 *
 *   - COMPANY_POSTS  harvestapi/linkedin-company-posts
 *                    input: { targetUrls[], maxPosts, includeReposts, ... }
 *                    output: N post items { type, id, content, author, engagement }
 *                    ~$2 / 1k posts. Reactions/comments bill as separate
 *                    items, so they are opt-in per scan.
 *
 * Each actor uses its own Apify token so they can bill separately. Token
 * resolution per actor:
 *   profile → APIFY_LINKEDIN_PROFILE_TOKEN → APIFY_LINKEDIN_TOKEN → APIFY_TOKEN
 *   posts   → APIFY_LINKEDIN_POSTS_TOKEN   → APIFY_LINKEDIN_TOKEN → APIFY_TOKEN
 */
import { env } from "@/shared/env";

/** Which LinkedIn actor a token/run belongs to. */
export type LinkedInActorKind = "profile" | "posts";

export class ApifyLinkedInNotConfiguredError extends Error {
  constructor(kind?: LinkedInActorKind) {
    const which =
      kind === "profile"
        ? "APIFY_LINKEDIN_PROFILE_TOKEN"
        : kind === "posts"
          ? "APIFY_LINKEDIN_POSTS_TOKEN"
          : "APIFY_LINKEDIN_TOKEN";
    super(`${which} (or APIFY_LINKEDIN_TOKEN / APIFY_TOKEN) is not configured`);
    this.name = "ApifyLinkedInNotConfiguredError";
  }
}

export class ApifyLinkedInError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ApifyLinkedInError";
  }
}

function profileToken(): string | undefined {
  return (
    env.APIFY_LINKEDIN_PROFILE_TOKEN ||
    env.APIFY_LINKEDIN_TOKEN ||
    env.APIFY_TOKEN ||
    undefined
  );
}

function postsToken(): string | undefined {
  return (
    env.APIFY_LINKEDIN_POSTS_TOKEN ||
    env.APIFY_LINKEDIN_TOKEN ||
    env.APIFY_TOKEN ||
    undefined
  );
}

function tokenForKind(kind: LinkedInActorKind): string | undefined {
  return kind === "profile" ? profileToken() : postsToken();
}

/** Public helper so server pages can render a "missing token" hint. */
export function hasLinkedInApifyToken(): boolean {
  return !!(profileToken() || postsToken());
}

// --------------------------------------------------------------------------
// Normalized output shapes
// --------------------------------------------------------------------------

/** image | video | article | document | none */
export type LinkedInMediaType = "image" | "video" | "article" | "document" | "none";

export type LinkedInComment = {
  authorName: string;
  authorHeadline: string | null;
  text: string;
  likes: number;
  postedAgo: string | null;
};

export type LinkedInPost = {
  id: string;
  url: string;
  content: string;
  authorName: string;
  authorHeadline: string | null;
  authorUrl: string | null;
  /** ISO date string. */
  postedAt: string | null;
  postedAgo: string | null;
  likes: number;
  comments: number;
  shares: number;
  /** likes + comments + shares — used for ranking. */
  totalEngagement: number;
  /** post | repost | quote | article | … */
  type: string | null;
  hasMedia: boolean;
  /** Kind of attached media, when present. */
  mediaType: LinkedInMediaType;
  /** Best-effort thumbnail/preview URL for the attached media. */
  mediaUrl: string | null;
  topReactions: Array<{ type: string; count: number }>;
  /** Populated only when comment scraping is enabled. */
  topComments: LinkedInComment[];
};

export type LinkedInCompanyPostsResult = {
  targets: string[];
  totalPosts: number;
  /** Whether reactions were scraped for this pull. */
  scrapedReactions: boolean;
  /** Whether comments were scraped for this pull. */
  scrapedComments: boolean;
  posts: LinkedInPost[];
};

export type LinkedInExperience = {
  company: string | null;
  position: string | null;
  duration: string | null;
  description: string | null;
};

export type LinkedInEducation = {
  school: string | null;
  degree: string | null;
  period: string | null;
};

export type LinkedInProfile = {
  publicIdentifier: string | null;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  about: string | null;
  url: string | null;
  photo: string | null;
  location: string | null;
  countryCode: string | null;
  connections: number | null;
  followers: number | null;
  openToWork: boolean;
  hiring: boolean;
  topSkills: string | null;
  currentCompany: string | null;
  /** Best email found via email-search mode (SMTP-validated). May be null. */
  email: string | null;
  /** All deliverable emails found via email-search mode. */
  emails: string[];
  experience: LinkedInExperience[];
  education: LinkedInEducation[];
  skills: string[];
  languages: Array<{ language: string; proficiency: string | null }>;
  verified: boolean;
};

export type LinkedInProfileResult = {
  query: string;
  profile: LinkedInProfile | null;
};

export type LinkedInProfilesResult = {
  queries: string[];
  count: number;
  profiles: LinkedInProfile[];
  /** Queries that returned no profile data. */
  notFound: string[];
};

// --------------------------------------------------------------------------
// Async Apify run + poll + dataset fetch (shared with the SEO pattern).
// --------------------------------------------------------------------------

export type ApifyRunHandle = {
  runId: string;
  datasetId: string;
  status: string;
};

const TERMINAL_STATUSES = new Set([
  "SUCCEEDED",
  "FAILED",
  "ABORTED",
  "TIMED-OUT",
]);

export function isTerminalLinkedInStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

async function startRun(
  actor: string,
  input: Record<string, unknown>,
  kind: LinkedInActorKind
): Promise<ApifyRunHandle> {
  const token = tokenForKind(kind);
  if (!token) throw new ApifyLinkedInNotConfiguredError(kind);
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/runs` +
    `?token=${encodeURIComponent(token)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
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
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new ApifyLinkedInError(
      `Apify LinkedIn run start failed (${res.status})${detail ? `: ${detail.slice(0, 240)}` : ""}`,
      res.status
    );
  }
  const json = (await res.json()) as {
    data?: { id?: string; defaultDatasetId?: string; status?: string };
  };
  if (!json?.data?.id || !json.data.defaultDatasetId) {
    throw new ApifyLinkedInError(
      `Apify response missing run id or dataset id: ${JSON.stringify(json).slice(0, 200)}`
    );
  }
  return {
    runId: json.data.id,
    datasetId: json.data.defaultDatasetId,
    status: json.data.status ?? "READY",
  };
}

export async function getLinkedInRunStatus(
  runId: string,
  kind: LinkedInActorKind
): Promise<{
  status: string;
  statusMessage?: string;
  datasetId?: string;
}> {
  const token = tokenForKind(kind);
  if (!token) throw new ApifyLinkedInNotConfiguredError(kind);
  const url =
    `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}` +
    `?token=${encodeURIComponent(token)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new ApifyLinkedInError(
      `Apify run status fetch failed (${res.status})`,
      res.status
    );
  }
  const json = (await res.json()) as {
    data?: { status?: string; statusMessage?: string; defaultDatasetId?: string };
  };
  return {
    status: json.data?.status ?? "UNKNOWN",
    statusMessage: json.data?.statusMessage,
    datasetId: json.data?.defaultDatasetId,
  };
}

export async function fetchLinkedInDataset(
  datasetId: string,
  kind: LinkedInActorKind
): Promise<unknown[]> {
  const token = tokenForKind(kind);
  if (!token) throw new ApifyLinkedInNotConfiguredError(kind);
  const url =
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items` +
    `?token=${encodeURIComponent(token)}&format=json&clean=true`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new ApifyLinkedInError(
      `Apify dataset fetch failed (${res.status})`,
      res.status
    );
  }
  return (await res.json()) as unknown[];
}

// --------------------------------------------------------------------------
// Start helpers (one per actor)
// --------------------------------------------------------------------------

export type CompanyPostsInput = {
  targetUrls: string[];
  /** Max posts per target. 0 = all (we cap in the orchestrator). */
  maxPosts: number;
  includeReposts: boolean;
  includeQuotePosts: boolean;
  /** Scrape per-post reaction breakdown. Bills each reaction as an item. */
  scrapeReactions: boolean;
  /** Scrape top comments per post. Bills each comment as an item. */
  scrapeComments: boolean;
  /** Max comments captured per post when scrapeComments is on. */
  maxComments: number;
};

export function startCompanyPostsRun(input: CompanyPostsInput): Promise<ApifyRunHandle> {
  return startRun(
    env.APIFY_LINKEDIN_COMPANY_POSTS_ACTOR_ID,
    {
      targetUrls: input.targetUrls,
      maxPosts: input.maxPosts,
      includeReposts: input.includeReposts,
      includeQuotePosts: input.includeQuotePosts,
      // Reactions/comments are billed as separate dataset items, so these are
      // opt-in per scan. When on, the actor also nests them inside each post.
      scrapeReactions: input.scrapeReactions,
      postNestedReactions: input.scrapeReactions,
      scrapeComments: input.scrapeComments,
      maxComments: input.scrapeComments ? input.maxComments : 0,
    },
    "posts"
  );
}

export function startProfileRun(query: { url?: string; publicIdentifier?: string }): Promise<ApifyRunHandle> {
  const input: Record<string, unknown> = {};
  if (query.url) input.url = query.url;
  if (query.publicIdentifier) input.publicIdentifier = query.publicIdentifier;
  return startRun(env.APIFY_LINKEDIN_PROFILE_ACTOR_ID, input, "profile");
}

/** Actor profileScraperMode values. Email search costs ~$10/1k vs ~$4/1k. */
const PROFILE_MODE_NO_EMAIL = "Profile details no email ($4 per 1k)";
const PROFILE_MODE_EMAIL = "Profile details + email search ($10 per 1k)";

/**
 * Bulk profile scrape: the harvestapi profile actor accepts a `queries` array
 * of profile URLs or public identifiers and returns one item per profile.
 * Set `findEmail` to run the SMTP-validated email search. LinkedIn does not
 * expose emails or phone numbers publicly, so emails are found independently
 * and phone numbers are not available from this actor at all.
 */
export function startProfilesRun(
  queries: string[],
  opts?: { findEmail?: boolean }
): Promise<ApifyRunHandle> {
  return startRun(
    env.APIFY_LINKEDIN_PROFILE_ACTOR_ID,
    {
      queries,
      profileScraperMode: opts?.findEmail ? PROFILE_MODE_EMAIL : PROFILE_MODE_NO_EMAIL,
    },
    "profile"
  );
}

// --------------------------------------------------------------------------
// Normalizers — defensive about field-name drift between actor builds.
// --------------------------------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function asNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function asStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** Resolve the attached-media kind + a preview URL from a raw post object. */
function resolvePostMedia(o: Record<string, unknown>): {
  hasMedia: boolean;
  mediaType: LinkedInMediaType;
  mediaUrl: string | null;
} {
  const images = Array.isArray(o.postImages) ? (o.postImages as unknown[]) : [];
  const video = asRecord(o.postVideo);

  if (asStr(video.videoUrl) || asStr(video.thumbnailUrl)) {
    return {
      hasMedia: true,
      mediaType: "video",
      mediaUrl: asStr(video.thumbnailUrl) ?? asStr(video.videoUrl),
    };
  }
  if (o.linkedinVideo || o.video) {
    const v = asRecord(o.linkedinVideo ?? o.video);
    return {
      hasMedia: true,
      mediaType: "video",
      mediaUrl: asStr(v.thumbnailUrl) ?? asStr(v.url),
    };
  }
  if (images.length > 0) {
    const first = asRecord(images[0]);
    return { hasMedia: true, mediaType: "image", mediaUrl: asStr(first.url) };
  }
  const article = asRecord(o.article);
  if (asStr(article.title) || asStr(article.link)) {
    const img = asRecord(article.image);
    return {
      hasMedia: true,
      mediaType: "article",
      mediaUrl: asStr(img.url) ?? asStr(article.link),
    };
  }
  if (o.document) {
    const doc = asRecord(o.document);
    return {
      hasMedia: true,
      mediaType: "document",
      mediaUrl: asStr(doc.url) ?? asStr(doc.transcribedDocumentUrl),
    };
  }
  return { hasMedia: false, mediaType: "none", mediaUrl: null };
}

/** Parse the nested per-post comment list the actor attaches when enabled. */
function parsePostComments(o: Record<string, unknown>): LinkedInComment[] {
  const raw = Array.isArray(o.comments)
    ? (o.comments as unknown[])
    : Array.isArray(o.postComments)
      ? (o.postComments as unknown[])
      : [];
  return raw
    .map((c) => {
      const cc = asRecord(c);
      const author = asRecord(cc.author ?? cc.commenter);
      const cEngagement = asRecord(cc.engagement);
      const cPostedAt = asRecord(cc.postedAt ?? cc.createdAt);
      return {
        authorName: asStr(author.name) ?? asStr(cc.authorName) ?? "LinkedIn member",
        authorHeadline: asStr(author.info) ?? asStr(author.headline),
        text: asStr(cc.commentary) ?? asStr(cc.content) ?? asStr(cc.text) ?? "",
        likes: asNum(cEngagement.likes ?? cc.likes ?? cc.reactionsCount),
        postedAgo: asStr(cPostedAt.postedAgoShort) ?? asStr(cc.postedAgo),
      };
    })
    .filter((c) => c.text.length > 0)
    .slice(0, 10);
}

export function normalizeCompanyPosts(
  items: unknown[],
  targets: string[],
  opts?: { scrapedReactions?: boolean; scrapedComments?: boolean }
): LinkedInCompanyPostsResult {
  const posts: LinkedInPost[] = [];
  for (const raw of items) {
    const o = asRecord(raw);
    // Skip non-post items (comments/reactions are pushed as separate dataset
    // items when their scraping is enabled; we read the nested copies instead).
    const type = asStr(o.type);
    if (type && (type === "comment" || type === "reaction")) continue;

    const author = asRecord(o.author);
    const postedAt = asRecord(o.postedAt);
    const engagement = asRecord(o.engagement);
    const reactionsRaw = Array.isArray(engagement.reactions)
      ? (engagement.reactions as unknown[])
      : Array.isArray(o.reactions)
        ? (o.reactions as unknown[])
        : [];

    const likes = asNum(engagement.likes);
    const comments = asNum(engagement.comments);
    const shares = asNum(engagement.shares);

    const id = asStr(o.id) ?? asStr(o.linkedinUrl) ?? "";
    const url = asStr(o.linkedinUrl) ?? "";
    if (!url && !id) continue;

    const media = resolvePostMedia(o);

    posts.push({
      id: id || url,
      url,
      content: asStr(o.content) ?? "",
      authorName: asStr(author.name) ?? "Unknown",
      authorHeadline: asStr(author.info),
      authorUrl: asStr(author.linkedinUrl),
      postedAt: asStr(postedAt.date),
      postedAgo: asStr(postedAt.postedAgoShort),
      likes,
      comments,
      shares,
      totalEngagement: likes + comments + shares,
      type,
      hasMedia: media.hasMedia,
      mediaType: media.mediaType,
      mediaUrl: media.mediaUrl,
      topReactions: reactionsRaw
        .map((r) => {
          const rr = asRecord(r);
          return { type: asStr(rr.type) ?? "", count: asNum(rr.count) };
        })
        .filter((r) => r.type.length > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
      topComments: parsePostComments(o),
    });
  }

  posts.sort((a, b) => b.totalEngagement - a.totalEngagement);
  return {
    targets,
    totalPosts: posts.length,
    scrapedReactions: opts?.scrapedReactions ?? false,
    scrapedComments: opts?.scrapedComments ?? false,
    posts,
  };
}

/**
 * Normalize one profile dataset item (shaped `{ element: {...}, query }` on
 * most builds, or the profile fields at the top level on others).
 * Returns null when the item carries no usable profile data.
 */
/** Pull emails from the various shapes the email-search mode can return. */
function parseProfileEmails(el: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.includes("@")) out.push(v.trim());
  };
  push(el.email);
  push(el.workEmail);
  push(el.personalEmail);
  const arr = Array.isArray(el.emails)
    ? (el.emails as unknown[])
    : Array.isArray(el.emailSearch)
      ? (el.emailSearch as unknown[])
      : [];
  for (const e of arr) {
    if (typeof e === "string") push(e);
    else if (e && typeof e === "object") {
      const ee = e as Record<string, unknown>;
      push(ee.email ?? ee.address ?? ee.value);
    }
  }
  return Array.from(new Set(out.map((e) => e.toLowerCase())));
}

function normalizeProfileElement(raw: unknown): LinkedInProfile | null {
  const first = asRecord(raw);
  const el = asRecord(first.element ?? first);
  if (!el || Object.keys(el).length === 0) return null;
  // Some builds wrap misses as items with only a `query`/`status`.
  if (!el.firstName && !el.lastName && !el.name && !el.publicIdentifier && !el.headline) {
    return null;
  }

  const location = asRecord(el.location);
  const parsed = asRecord(location.parsed);
  const currentPos = Array.isArray(el.currentPosition)
    ? asRecord((el.currentPosition as unknown[])[0])
    : {};

  const experience = (Array.isArray(el.experience) ? (el.experience as unknown[]) : [])
    .map((e) => {
      const ee = asRecord(e);
      return {
        company: asStr(ee.companyName),
        position: asStr(ee.position),
        duration: asStr(ee.duration),
        description: asStr(ee.description),
      };
    })
    .slice(0, 12);

  const education = (Array.isArray(el.education) ? (el.education as unknown[]) : [])
    .map((e) => {
      const ee = asRecord(e);
      return {
        school: asStr(ee.title),
        degree: asStr(ee.degree),
        period: asStr(ee.period),
      };
    })
    .slice(0, 8);

  const skills = (Array.isArray(el.skills) ? (el.skills as unknown[]) : [])
    .map((s) => asStr(asRecord(s).name))
    .filter((s): s is string => !!s)
    .slice(0, 40);

  const languages = (Array.isArray(el.languages) ? (el.languages as unknown[]) : [])
    .map((l) => {
      const ll = asRecord(l);
      return {
        language: asStr(ll.language) ?? "",
        proficiency: asStr(ll.proficiency),
      };
    })
    .filter((l) => l.language.length > 0);

  const firstName = asStr(el.firstName);
  const lastName = asStr(el.lastName);
  const fullName =
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    asStr(el.name) ||
    asStr(el.publicIdentifier) ||
    "LinkedIn member";

  const emails = parseProfileEmails(el);

  return {
    publicIdentifier: asStr(el.publicIdentifier),
    fullName,
    firstName,
    lastName,
    headline: asStr(el.headline),
    about: asStr(el.about),
    url: asStr(el.linkedinUrl),
    photo: asStr(el.photo),
    location: asStr(parsed.text) ?? asStr(location.linkedinText),
    countryCode: asStr(parsed.countryCode) ?? asStr(location.countryCode),
    connections: el.connectionsCount != null ? asNum(el.connectionsCount) : null,
    followers: el.followerCount != null ? asNum(el.followerCount) : null,
    openToWork: el.openToWork === true,
    hiring: el.hiring === true,
    topSkills: asStr(el.topSkills),
    currentCompany: asStr(currentPos.companyName),
    email: emails[0] ?? null,
    emails,
    experience,
    education,
    skills,
    languages,
    verified: el.verified === true,
  };
}

export function normalizeProfile(
  items: unknown[],
  query: string
): LinkedInProfileResult {
  return { query, profile: normalizeProfileElement(items[0]) };
}

/** Normalize a bulk profile dataset into a deduped list of profiles. */
export function normalizeProfiles(
  items: unknown[],
  queries: string[]
): LinkedInProfilesResult {
  const profiles: LinkedInProfile[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const p = normalizeProfileElement(raw);
    if (!p) continue;
    const key = (p.publicIdentifier ?? p.url ?? p.fullName).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    profiles.push(p);
  }
  return { queries, count: profiles.length, profiles, notFound: [] };
}
