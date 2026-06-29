import { z } from "zod";
import { prisma } from "@/backend/db";
import { fetchPage, type PageSnapshot } from "@/backend/scraper/fetch";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import { ruleBasedAudit } from "@/backend/seo-audit-rules";
import type { Agent, AgentContext } from "./base";

const auditSchema = z.object({
  score: z.number().int().min(0).max(100),
  issues: z
    .array(
      z.object({
        severity: z.enum(["low", "medium", "high"]),
        category: z.string(),
        title: z.string(),
        fix: z.string(),
        url: z.string().optional(),
      })
    )
    .max(20),
  opportunities: z.array(
    z.object({
      keyword: z.string(),
      intent: z.enum([
        "informational",
        "navigational",
        "commercial",
        "transactional",
      ]),
      why: z.string(),
    })
  ),
  contentIdeas: z.array(
    z.object({
      title: z.string(),
      angle: z.string(),
      format: z.enum(["blog", "landing_page", "comparison", "guide"]),
    })
  ),
});

export type SEOAuditResult = z.infer<typeof auditSchema>;

const SYSTEM = `You are a senior technical SEO consultant. You review a page snapshot and return:
1) A numeric SEO score (0-100).
2) A list of concrete issues with severity and the exact fix.
3) Keyword opportunities the business should pursue.
4) Content ideas worth writing, each with an angle.
Be specific — cite the actual page elements you saw.`;

function buildPrompt(ctx: AgentContext, snap: PageSnapshot): string {
  return [
    `Workspace industry: ${ctx.industry || "unknown"}`,
    `Ideal customer: ${ctx.icp || "unknown"}`,
    "",
    `URL: ${snap.url}`,
    `Status: ${snap.status}`,
    `Title (${snap.title.length} chars): ${snap.title}`,
    `Description (${snap.description.length} chars): ${snap.description}`,
    `H1s: ${snap.h1.join(" | ") || "(none)"}`,
    `H2s: ${snap.h2.slice(0, 12).join(" | ") || "(none)"}`,
    `Word count: ${snap.wordCount}`,
    `Images without alt: ${snap.images.filter((i) => !i.alt).length}/${snap.images.length}`,
    `Internal links: ${snap.links.filter((l) => l.internal).length}`,
    `External links: ${snap.links.filter((l) => !l.internal).length}`,
    `Has JSON-LD: ${snap.jsonLd.length > 0}`,
    "",
    `Body excerpt:\n${snap.text.slice(0, 5000)}`,
  ].join("\n");
}

/** Input for the SEO agent. `quick` runs the deterministic rule-based audit
 *  only (no LLM) — used by the dashboard auto-populate so a brand-new site
 *  gets an instant score + concrete issues without waiting on (or risking a
 *  timeout from) a chain of LLM calls. */
export type SEOAgentInput = { quick?: boolean } | undefined;

export const seoAgent: Agent<SEOAgentInput, SEOAuditResult> = {
  id: "seo",
  title: "SEO Agent",
  schedule: "0 6 * * *", // daily 06:00 UTC
  minCredits: 1,
  async run(ctx: AgentContext, input: SEOAgentInput): Promise<SEOAuditResult> {
    if (!ctx.websiteUrl) throw new Error("Workspace has no website URL");

    // fetchPage can throw on a network error / timeout (not on HTTP 4xx/5xx,
    // which still return a snapshot). Never let that abort the audit — fall
    // back to a minimal stub so the rule-based audit still produces a result.
    const snap = await fetchPage(ctx.websiteUrl).catch(
      (): PageSnapshot => stubSnapshot(ctx.websiteUrl as string)
    );

    // Quick mode: deterministic, instant, zero-LLM. Keeps the auto-populate
    // path off the LLM critical path so the dashboard never blocks or times out.
    if (input?.quick) {
      const result = fallbackAudit(snap);
      await persistAudit(ctx, result);
      return result;
    }

    const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
    let result: SEOAuditResult;

    if (model) {
      try {
        const { object } = await meteredGenerateObject(
          buildPrompt(ctx, snap),
          auditSchema,
          {
            workspaceId: ctx.workspaceId,
            reason: "seo.audit",
            model,
            system: SYSTEM,
          }
        );
        result = object;
        // The model sometimes returns a score with an empty `issues` list —
        // usually when the page scrape was thin (JS-heavy / bot-blocked site)
        // so it had little to critique. An empty list leaves the dashboard's
        // "Checks" tab blank. Backfill with the deterministic rule-based audit
        // (no LLM, no hallucination) so there's always something concrete to show.
        if (!Array.isArray(result.issues) || result.issues.length === 0) {
          result.issues = ruleBasedAudit(snap).issues;
        }
      } catch (err) {
        // The LLM call can fail (credit balance, rate limit, provider
        // outage, schema-repair give-up). Never let that hard-fail the
        // whole audit — that leaves a FAILED run and a permanently blank
        // dashboard. Fall back to the deterministic rule-based audit so a
        // SiteAudit is ALWAYS written with a real score + concrete issues.
        console.warn("[seo] LLM audit failed, using rule-based fallback:", err);
        result = fallbackAudit(snap);
      }
    } else {
      result = fallbackAudit(snap);
    }

    await persistAudit(ctx, result);
    return result;
  },
};

/** Write the audit row, keyword opportunities, and high-severity action
 *  items. Shared by the full LLM path and the quick rule-based path. */
async function persistAudit(
  ctx: AgentContext,
  result: SEOAuditResult
): Promise<void> {
  await prisma.siteAudit.create({
    data: {
      workspaceId: ctx.workspaceId,
      score: result.score,
      issues: JSON.parse(JSON.stringify(result.issues)),
      pages: 1,
    },
  });

  // Persist top keyword opportunities
  for (const opp of result.opportunities.slice(0, 10)) {
    await prisma.keyword
      .upsert({
        where: {
          workspaceId_query_country: {
            workspaceId: ctx.workspaceId,
            query: opp.keyword.toLowerCase(),
            country: "us",
          },
        },
        create: {
          workspaceId: ctx.workspaceId,
          query: opp.keyword.toLowerCase(),
          intent: opp.intent,
        },
        update: { intent: opp.intent },
      })
      .catch(() => null);
  }

  // Emit action items
  const topIssues = result.issues
    .filter((i) => i.severity === "high")
    .slice(0, 3);
  for (const issue of topIssues) {
    await prisma.actionItem.create({
      data: {
        workspaceId: ctx.workspaceId,
        agent: "seo",
        type: "seo.fix",
        title: issue.title,
        summary: issue.fix,
        cta: "Fix it",
        href: "/agents/seo",
        priority: "HIGH",
      },
    });
  }
}

/** Minimal snapshot used when the live fetch fails, so the rule-based audit
 *  can still run (and flag the unreachable page) instead of throwing. */
function stubSnapshot(url: string): PageSnapshot {
  return {
    url,
    title: "",
    description: "",
    h1: [],
    h2: [],
    text: "",
    wordCount: 0,
    images: [],
    links: [],
    jsonLd: [],
    status: 0,
    meta: {},
  };
}

function fallbackAudit(snap: PageSnapshot): SEOAuditResult {
  const rule = ruleBasedAudit(snap);
  return {
    score: rule.score,
    issues: rule.issues,
    opportunities: (snap.h2.length ? snap.h2 : snap.h1).slice(0, 3).map((h) => ({
      keyword: h.toLowerCase(),
      intent: "informational" as const,
      why: "Derived from page headings — validate with GSC.",
    })),
    contentIdeas: [
      {
        title: `The ultimate guide to ${snap.h1[0] || "your topic"}`,
        angle: "Pillar article targeting the main keyword cluster.",
        format: "guide",
      },
    ],
  };
}
