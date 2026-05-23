/**
 * Bulk content writer: turn a list of keywords into a batch of blog
 * drafts. For each keyword Claude produces structured output (so we
 * can post-process), we render Markdown with real hyperlinks (so
 * listicles read like a polished round-up, not just a flat list),
 * and optionally request a hero image from Gemini.
 *
 * Two blog modes:
 *   - "listicle"     -> "Top N <keyword>" with N items, each linked to
 *                       its canonical brand domain.
 *   - "descriptive"  -> long-form explainer; tools / companies / sources
 *                       mentioned in the body get auto-linked.
 *
 * Designed to be called from a server action that iterates keywords and
 * persists each result as a ContentDraft. Failures on one keyword
 * never block the others.
 */
import { z } from "zod";
import { prisma } from "@/backend/db";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import type { CmoVoiceProfile } from "@/backend/agents/cmo-data";
import { ContentChannel } from "@prisma/client";
import { generateHeroImage } from "@/backend/image-gen";

export type BlogType = "listicle" | "descriptive";

export type BulkGenerateInput = {
  workspaceId: string;
  keyword: string;
  blogType: BlogType;
  includeImage: boolean;
  voice: CmoVoiceProfile | null;
  industry: string | null;
  icp: string | null;
};

const linkSchema = z
  .object({
    label: z.string().min(1).max(120),
    url: z.string().url(),
  })
  .strict();

const listicleSchema = z.object({
  title: z.string().min(8).max(120),
  slug: z.string().min(3),
  metaDescription: z.string().max(200),
  intro: z.string().min(120),
  items: z
    .array(
      z.object({
        rank: z.number().int().min(1).max(50),
        name: z.string().min(1),
        domain: z.string().min(3),
        oneLiner: z.string().min(10).max(280),
        body: z.string().min(80),
      })
    )
    .min(3)
    .max(15),
  conclusion: z.string().min(60),
  /** Optional extra inline links (sources, related reads) the LLM thinks the article should reference. */
  inlineLinks: z.array(linkSchema).max(10).optional(),
});

const descriptiveSchema = z.object({
  title: z.string().min(8).max(120),
  slug: z.string().min(3),
  metaDescription: z.string().max(200),
  body: z
    .string()
    .min(600)
    .describe(
      "Markdown body with H2/H3 structure. Mention real tools / companies / studies by name."
    ),
  /** Links to insert inline by exact-match replacement of the `label` text. */
  inlineLinks: z.array(linkSchema).min(0).max(15),
});

export type ListicleDraft = z.infer<typeof listicleSchema>;
export type DescriptiveDraft = z.infer<typeof descriptiveSchema>;

const SYSTEM_LISTICLE = `You are a senior content writer who produces ranked, factual round-up articles ("listicles") that read like a polished editorial — not SEO spam.

Hard rules:
- Each item MUST be a real, well-known product / brand / company / resource in the niche. Never invent.
- Always include the canonical brand domain ("jasper.ai", "notion.so", "hubspot.com") so the rendered HTML can link the item title. Domains must be bare — no http://, no www.
- 'oneLiner' is a single-sentence positioning statement.
- 'body' is 80-180 words of concrete commentary: what it's best at, who it's for, one honest pro / con. Use Markdown formatting (bold, lists allowed inside body).
- 'intro' (120-300 words) hooks the reader and explains the criteria.
- 'conclusion' (60-150 words) wraps up with how to choose / a soft CTA.
- 'inlineLinks' is OPTIONAL — only include extra reference links (industry reports, original studies) that the body actually mentions by their 'label' text.`;

const SYSTEM_DESCRIPTIVE = `You are a senior content writer producing long-form, deeply researched explainer articles that rank in Google and get cited by ChatGPT.

Hard rules:
- Body is clean Markdown with H2 / H3 headings and short paragraphs.
- 1200-1800 words. Use concrete examples, named tools, and specific stats where credible.
- Whenever you mention a real product / company / study / data source by name, ALSO add it to 'inlineLinks' with the exact text used in the body as 'label' and the canonical URL.
- 'inlineLinks[].label' must match a substring of 'body' EXACTLY (case-sensitive) so the link can be inserted by text replacement.
- Never invent URLs. If unsure of a domain, omit the link.`;

const FALLBACK_LIMITS = {
  listicleItems: 7,
  bodyWords: 1400,
} as const;

export async function generateBulkBlog(
  input: BulkGenerateInput
): Promise<{ draftId: string; title: string; channel: ContentChannel }> {
  const model = pickAvailableModel("claude-sonnet-4-6");
  if (!model) {
    throw new Error("No LLM provider configured (set ANTHROPIC_API_KEY).");
  }

  const voiceContext = [
    input.industry && `Industry: ${input.industry}`,
    input.icp && `ICP: ${input.icp}`,
    input.voice?.positioning && `Brand positioning: ${input.voice.positioning}`,
    input.voice?.tone && `Voice tone: ${input.voice.tone}`,
    input.voice?.styleGuidelines?.length &&
      `Style: ${input.voice.styleGuidelines.join(", ")}`,
    input.voice?.avoid?.length && `Avoid: ${input.voice.avoid.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  let title: string;
  let body: string;
  let meta: Record<string, unknown>;

  if (input.blogType === "listicle") {
    const prompt = [
      voiceContext,
      "",
      `Target keyword: ${input.keyword}`,
      `Produce a ranked listicle with ${FALLBACK_LIMITS.listicleItems} items unless the keyword clearly implies a different count (e.g. "Top 10 X" -> 10).`,
    ]
      .filter(Boolean)
      .join("\n");

    const { object } = await meteredGenerateObject(prompt, listicleSchema, {
      workspaceId: input.workspaceId,
      reason: "content.bulk.listicle",
      model,
      system: SYSTEM_LISTICLE,
    });
    title = object.title;
    body = renderListicle(object);
    meta = {
      keyword: input.keyword,
      blogType: input.blogType,
      slug: object.slug,
      metaDescription: object.metaDescription,
      items: object.items.map((it) => ({
        rank: it.rank,
        name: it.name,
        domain: it.domain,
      })),
      inlineLinkCount: object.inlineLinks?.length ?? 0,
    };
  } else {
    const prompt = [
      voiceContext,
      "",
      `Target keyword: ${input.keyword}`,
      `Target length: ${FALLBACK_LIMITS.bodyWords} words.`,
    ]
      .filter(Boolean)
      .join("\n");

    const { object } = await meteredGenerateObject(prompt, descriptiveSchema, {
      workspaceId: input.workspaceId,
      reason: "content.bulk.descriptive",
      model,
      system: SYSTEM_DESCRIPTIVE,
    });
    title = object.title;
    body = renderDescriptive(object);
    meta = {
      keyword: input.keyword,
      blogType: input.blogType,
      slug: object.slug,
      metaDescription: object.metaDescription,
      inlineLinkCount: object.inlineLinks.length,
    };
  }

  // Optional hero image. Generated in parallel-friendly way: failures are
  // swallowed so the draft is still saved with text-only content.
  let heroImage: { url: string; alt: string } | null = null;
  if (input.includeImage) {
    try {
      const img = await generateHeroImage({
        title,
        keyword: input.keyword,
        blogType: input.blogType,
      });
      if (img) heroImage = img;
    } catch (err) {
      console.warn(
        `[content-bulk] hero image failed for "${input.keyword}":`,
        (err as Error).message
      );
    }
  }

  if (heroImage) {
    body = `![${heroImage.alt}](${heroImage.url})\n\n${body}`;
    meta = { ...meta, heroImage: heroImage.url };
  }

  const created = await prisma.contentDraft.create({
    data: {
      workspaceId: input.workspaceId,
      agent: "content",
      channel: ContentChannel.BLOG,
      title,
      body,
      meta: meta as object,
      status: "PENDING_APPROVAL",
    },
  });

  // Surface in the Actions Feed so the user notices the new drafts.
  await prisma.actionItem.create({
    data: {
      workspaceId: input.workspaceId,
      agent: "content",
      type: "content.review",
      title: `Review draft: ${title}`,
      summary: typeof meta.metaDescription === "string" ? meta.metaDescription : null,
      cta: "Review",
      href: `/content/${created.id}`,
      priority: "MEDIUM",
    },
  });

  return { draftId: created.id, title, channel: ContentChannel.BLOG };
}

function renderListicle(d: ListicleDraft): string {
  const parts: string[] = [];
  parts.push(`# ${d.title}`);
  parts.push("");
  parts.push(d.intro.trim());
  parts.push("");

  for (const item of d.items.sort((a, b) => a.rank - b.rank)) {
    const url = `https://${cleanDomain(item.domain)}`;
    parts.push(`## ${item.rank}. [${item.name}](${url})`);
    parts.push("");
    if (item.oneLiner) {
      parts.push(`**${item.oneLiner.trim()}**`);
      parts.push("");
    }
    parts.push(item.body.trim());
    parts.push("");
  }

  parts.push("## Conclusion");
  parts.push("");
  parts.push(d.conclusion.trim());

  if (d.inlineLinks && d.inlineLinks.length > 0) {
    parts.push("");
    parts.push("### Further reading");
    parts.push("");
    for (const link of d.inlineLinks) {
      parts.push(`- [${link.label}](${link.url})`);
    }
  }

  return parts.join("\n");
}

function renderDescriptive(d: DescriptiveDraft): string {
  let body = `# ${d.title}\n\n${d.body.trim()}`;
  // Replace first occurrence of each label with a markdown link.
  // Longer labels first so "OpenAI GPT-4" wins over "OpenAI".
  const sorted = [...d.inlineLinks].sort(
    (a, b) => b.label.length - a.label.length
  );
  const used = new Set<string>();
  for (const link of sorted) {
    if (used.has(link.label)) continue;
    const escaped = link.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Only replace the first non-link occurrence: skip if already inside [text](url).
    const re = new RegExp(
      `(?<!\\]\\()(?<!\\]\\[)\\b${escaped}\\b`,
      ""
    );
    if (re.test(body)) {
      body = body.replace(re, `[${link.label}](${link.url})`);
      used.add(link.label);
    }
  }
  return body;
}

function cleanDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}
