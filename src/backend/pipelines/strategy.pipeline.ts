import { z } from "zod";
import {
  siteScrapePipeline,
  emptyPageSnapshot,
  type PageSnapshot,
} from "@/backend/pipelines/site-scrape.pipeline";
import {
  CMO_PREFERRED_MODEL,
  meteredGenerateObject,
  pickAvailableModel,
} from "@/backend/llm";

export const strategySchema = z.object({
  industry: z.string().describe("Industry vertical in 2-5 words"),
  icp: z.string().describe("Ideal customer profile: who the product is for"),
  positioning: z.string().describe("One-sentence positioning statement"),
  voice: z.object({
    tone: z.string(),
    styleGuidelines: z.array(z.string()),
    avoid: z.array(z.string()),
  }),
  valueProps: z.array(z.string()).min(3).max(7),
  channels: z
    .array(z.enum(["reddit", "seo", "geo", "x", "linkedin", "hackernews", "content"]))
    .describe("Best marketing channels for this business"),
  competitors: z.array(z.string()).max(12),
  competitorNotes: z
    .array(
      z.object({
        name: z.string(),
        domain: z.string().optional(),
        note: z
          .string()
          .describe(
            "1-2 sentence note on what this competitor does and how they compete vs. this business"
          ),
      })
    )
    .max(12)
    .optional(),
  topicClusters: z
    .array(
      z.object({
        theme: z.string(),
        keywords: z.array(z.string()).min(3),
      })
    )
    .max(5),
  brandVoiceDoc: z
    .string()
    .describe(
      "A full, descriptive Brand Voice guide in Markdown (300-500 words). Use ## sections (Voice & tone, Personality, Vocabulary do/don't, Messaging pillars, Example rewrites). Include at least one Markdown table (e.g. Say this / Not this)."
    ),
  marketingStrategyDoc: z
    .string()
    .describe(
      "A full, descriptive Marketing Strategy document in Markdown (500-900 words) like a real CMO would write. Use ## sections (ICP, Positioning, Channel strategy, Content pillars, 90-day plan, KPIs). Include at least two Markdown tables (e.g. a channel plan table and a 90-day roadmap table). Be specific to this business — no generic filler."
    ),
  firstActions: z
    .array(
      z.object({
        title: z.string(),
        reason: z.string(),
        priority: z.enum(["low", "medium", "high"]),
      })
    )
    .max(8),
});

export type Strategy = z.infer<typeof strategySchema>;

const SYSTEM_PROMPT = `You are a senior marketing strategist. Given a single web page snapshot, infer the business model, target audience, positioning, and the highest-leverage marketing channels. Be concrete — reference specifics from the page text. If information is missing, make the best inference and mark it as such in the field.

Hard requirements:
- competitors: ALWAYS list 8-10 real, well-known direct competitors that target the same ICP. Never list fewer than 8 and never leave this empty. If the niche is unclear, use the closest analog category leaders, including both regional and global players.
  IMPORTANT FORMAT — each competitor MUST be written as "BrandName (canonical-domain.com)".
  Examples: "Jasper AI (jasper.ai)", "HubSpot Marketing Hub (hubspot.com)", "Surfer SEO (surferseo.com)", "Notion (notion.so)".
  Do NOT include http:// or www. — just the bare brand domain in parentheses. The domain MUST be the real, currently-live homepage domain (double-check it resolves) so the UI can render real logos. If you are unsure of the exact domain, pick a competitor whose domain you are certain of instead.
- competitorNotes: for EACH competitor, add an entry with its name, bare domain, and a sharp 1-2 sentence note on what they do and how they compete vs. this business (their angle, who they target, where they're strong/weak). Be specific, not generic.
- topicClusters: at least 1 cluster with 3+ keywords.
- valueProps: 3-5 concrete prop sentences (no fluff).
- brandVoiceDoc: write it like a senior brand strategist briefing a content team. Descriptive, specific to THIS business, with concrete example phrases and at least one Markdown table.
- marketingStrategyDoc: write it like a real CMO's strategy memo. Deeply specific to this business and its ICP, with real channel allocation, content pillars, a 90-day roadmap, and KPIs. Use proper Markdown tables (at least two). Avoid generic SaaS filler — every line should be actionable for this exact company.`;

/**
 * Onboarding: fetch homepage → LLM structured strategy for workspace voice profile.
 *
 * The CMO experience is Claude-first — we try Anthropic before OpenAI when both
 * keys are present so onboarding voice / competitor inference matches whatever
 * the dashboard chat will use.
 */
export class StrategyPipeline {
  async generate(input: {
    workspaceId: string;
    websiteUrl: string;
  }): Promise<{ strategy: Strategy; snapshot: PageSnapshot }> {
    let snapshot: PageSnapshot;
    try {
      snapshot = await siteScrapePipeline.fetchPage(input.websiteUrl);
    } catch (err) {
      console.error("Homepage fetch failed (timeout, block, or network):", err);
      snapshot = emptyPageSnapshot(input.websiteUrl, 0);
    }

    const prompt = StrategyPipeline.buildPrompt(snapshot);
    const model = pickAvailableModel(CMO_PREFERRED_MODEL);

    if (!model) {
      return {
        strategy: StrategyPipeline.fallbackStrategy(snapshot),
        snapshot,
      };
    }

    try {
      // meteredGenerateObject already retries across configured providers
      // (Claude → OpenAI → Gemini → ...) when one returns auth/rate errors.
      const { object } = await meteredGenerateObject(prompt, strategySchema, {
        workspaceId: input.workspaceId,
        reason: "onboarding.strategy",
        model,
        system: SYSTEM_PROMPT,
      });

      return { strategy: object, snapshot };
    } catch (err) {
      console.error("Onboarding strategy LLM failed, using homepage fallback:", err);
      return {
        strategy: StrategyPipeline.fallbackStrategy(snapshot),
        snapshot,
      };
    }
  }

  private static buildPrompt(snap: PageSnapshot): string {
    const wordCount = snap.text?.length ?? 0;
    // If the scraper got blocked (Amazon, Google, LinkedIn, etc. return
    // minimal content), explicitly tell Claude to lean on its own
    // knowledge of the brand instead of producing the empty fallback.
    const scrapeIsBlocked = wordCount < 800;
    const host = (() => {
      try {
        return new URL(snap.url).hostname.replace(/^www\./, "");
      } catch {
        return snap.url;
      }
    })();

    const lines: string[] = [
      `URL: ${snap.url}`,
      `Domain: ${host}`,
      `Title: ${snap.title || "(not detected)"}`,
      `Description: ${snap.description || "(not detected)"}`,
      `H1: ${snap.h1.slice(0, 5).join(" | ") || "(none)"}`,
      `H2: ${snap.h2.slice(0, 10).join(" | ") || "(none)"}`,
      `Body excerpt (${wordCount} chars):\n${snap.text.slice(0, 6000) || "(empty)"}`,
      "",
    ];

    if (scrapeIsBlocked) {
      lines.push(
        "IMPORTANT: The scrape returned very little content — the site likely blocks bot user-agents (common for Amazon, Google, LinkedIn, Stripe, etc.).",
        `Use YOUR OWN KNOWLEDGE of the brand at \"${host}\" to fill in the strategy. ` +
          "Do NOT return generic placeholders like 'Value proposition 1'. " +
          "Treat the bare domain as ground truth about which company this is, then write the strategy as if you had read their full site.",
        ""
      );
    }

    lines.push("Analyze the page (or your knowledge of the brand) and produce the strategy object.");
    return lines.join("\n");
  }

  private static fallbackStrategy(snap: PageSnapshot): Strategy {
    // Only seed value props from real headings; don't fabricate
    // "Value proposition 1/2/3" placeholders — those leak into the UI
    // and make the dashboard look broken.
    const realProps = [snap.h1[0], snap.h1[1], snap.h2[0]]
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0);

    return {
      industry: "Unknown",
      icp: "Add a brief description of your ideal customer in Settings.",
      positioning:
        snap.description ||
        snap.title ||
        "Strategy analysis is unavailable until an LLM provider key is configured (ANTHROPIC_API_KEY or OPENAI_API_KEY).",
      voice: {
        tone: "Neutral, professional",
        styleGuidelines: ["Be clear", "Lead with value", "Use active voice"],
        avoid: ["Jargon", "Unfounded claims"],
      },
      valueProps: realProps,
      channels: ["seo", "content", "reddit", "geo"],
      // Intentionally empty — populating with placeholder text leaks instructions
      // into the Company panel as fake "competitors". An empty array makes the
      // UI render a clear "No competitors recorded yet" hint instead.
      competitors: [],
      topicClusters: [
        {
          theme: "Core product",
          keywords: snap.h2.slice(0, 5).length
            ? snap.h2.slice(0, 5)
            : ["product", "features", "pricing"],
        },
      ],
      // brandVoiceDoc + marketingStrategyDoc are required by the schema but
      // we leave them empty in the fallback. The Company panel's
      // buildBrandVoiceDoc / buildMarketingStrategyDoc helpers detect an
      // empty doc and compose a structured fallback from the other fields.
      brandVoiceDoc: "",
      marketingStrategyDoc: "",
      firstActions: buildFallbackFirstActions(),
    };
  }
}

export const strategyPipeline = new StrategyPipeline();

/**
 * Onboarding suggestions seeded when the strategy LLM call fails. We
 * intentionally OMIT the "Add a working LLM API key" item when a provider
 * key is already configured server-side — otherwise users land on the
 * dashboard with a permanently misleading nag even though their key is
 * fine. (Failures in that case are almost always content / network related,
 * not credential related.)
 */
function buildFallbackFirstActions(): Array<{
  title: string;
  reason: string;
  priority: "high" | "medium" | "low";
}> {
  const out: Array<{ title: string; reason: string; priority: "high" | "medium" | "low" }> = [];
  const llmKeyMissing =
    !process.env.ANTHROPIC_API_KEY &&
    !process.env.OPENAI_API_KEY &&
    !process.env.GOOGLE_GEMINI_API_KEY &&
    !process.env.OPENROUTER_API_KEY;
  if (llmKeyMissing) {
    out.push({
      title: "Add a working LLM API key",
      reason:
        "Set ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY with billing credits, then re-run the SEO agent.",
      priority: "high",
    });
  }
  out.push({
    title: "Connect Google Search Console",
    reason: "Unlock keyword and ranking data for the SEO agent.",
    priority: "high",
  });
  out.push({
    title: "Add target subreddits",
    reason: "Let the Reddit agent start monitoring community threads.",
    priority: "medium",
  });
  return out;
}
