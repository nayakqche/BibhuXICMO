"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Building2,
  ChevronDown,
  Facebook,
  FileText,
  Github,
  Instagram,
  Linkedin,
  Loader2,
  Megaphone,
  RefreshCw,
  Target,
  Twitter,
  Users,
  Youtube,
} from "lucide-react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { SiteQuickAdd } from "@/frontend/components/app/cmo/site-quick-add";
import { CompetitorPill } from "@/frontend/components/app/cmo/competitor-pill";
import { DocumentDrawer } from "@/frontend/components/app/cmo/document-drawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { forceReauditAction } from "@/app/(app)/settings/actions";
import type { CmoFastData, CmoSlowData } from "@/backend/agents/cmo-data";

type CompanyData = CmoFastData &
  Partial<Pick<CmoSlowData, "liveSnapshot" | "llmAnalysis">>;

type Section = "product" | "competitors" | "voice" | "strategy";

const SECTIONS: Array<{ id: Section; label: string; icon: typeof FileText }> = [
  { id: "product", label: "Product information", icon: FileText },
  { id: "competitors", label: "Competitor analysis", icon: Users },
  { id: "voice", label: "Brand voice", icon: Megaphone },
  { id: "strategy", label: "Marketing strategy", icon: Target },
];

/**
 * `analyzing` is supplied by the page, NOT inferred from whether `voice`
 * happens to be populated. It is true only while the slow analysis phase
 * is still in flight (the Suspense fallback). Once the slow phase resolves
 * React swaps in the real panel with `analyzing={false}` — even if the
 * strategy LLM came back thin, so the panel can never get stuck polling a
 * voice profile that will never fill.
 */
/** Sections that open as a full side-drawer document instead of inline. */
const DRAWER_SECTIONS = new Set<Section>(["voice", "strategy"]);

export function CompanyPanel({
  data,
  analyzing = false,
}: {
  data: CompanyData;
  analyzing?: boolean;
}) {
  const [open, setOpen] = useState<Section | null>(null);
  const [drawer, setDrawer] = useState<{
    title: string;
    markdown: string;
    fileBase: string;
  } | null>(null);
  const hasUrl = !!data.workspace.websiteUrl;

  const siteName =
    data.voice?.siteTitle?.trim() || data.workspace.name || "Your brand";

  function openSectionDrawer(section: Section) {
    if (section === "voice") {
      setDrawer({
        title: "Brand Voice",
        markdown: buildBrandVoiceDoc(data, siteName),
        fileBase: `${slugify(siteName)}-brand-voice`,
      });
    } else if (section === "strategy") {
      setDrawer({
        title: "Marketing Strategy",
        markdown: buildMarketingStrategyDoc(data, siteName),
        fileBase: `${slugify(siteName)}-marketing-strategy`,
      });
    }
  }

  const description =
    data.liveSnapshot?.description?.trim() ||
    data.voice?.siteDescription?.trim() ||
    "Add your website and finish onboarding so agents can analyze your business.";

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-primary" aria-hidden />
          Company
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Add your handles so agents can learn your tone from public posts.
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 text-sm">
        <SiteQuickAdd
          workspaceName={data.workspace.name}
          currentUrl={data.workspace.websiteUrl}
        />

        {analyzing ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
            <span className="relative mt-0.5 flex h-4 w-4 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" />
              <Loader2 className="relative h-4 w-4 animate-spin text-primary" />
            </span>
            <div className="space-y-0.5">
              <div className="font-semibold text-foreground">
                Analyzing {stripUrlScheme(data.workspace.websiteUrl ?? "")}…
              </div>
              <p className="text-muted-foreground">
                Reading the site, picking competitors + social handles, and
                fetching metrics. This usually takes 30-60s and updates here
                automatically.
              </p>
            </div>
          </div>
        ) : null}

        <SocialHandlesRow voice={data.voice ?? null} />

        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>

        {data.voice?.positioning ? (
          <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Positioning
            </div>
            {data.voice.positioning}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Documents
          </div>
          {SECTIONS.map((s) => {
            const opensDrawer = DRAWER_SECTIONS.has(s.id);
            return (
              <DocumentCard
                key={s.id}
                icon={s.icon}
                label={s.label}
                isReady={sectionHasContent(s.id, data)}
                isPending={analyzing && !sectionHasContent(s.id, data)}
                isOpen={!opensDrawer && open === s.id}
                opensDrawer={opensDrawer}
                onToggle={() =>
                  opensDrawer
                    ? openSectionDrawer(s.id)
                    : setOpen(open === s.id ? null : s.id)
                }
              >
                {!opensDrawer ? (
                  <DocumentBody
                    section={s.id}
                    data={data}
                    analyzing={analyzing}
                    hasUrl={hasUrl}
                  />
                ) : null}
              </DocumentCard>
            );
          })}
        </div>

        {data.topCompetitors.length > 0 ? (
          <div className="space-y-2 border-t pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Competitors
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.topCompetitors.map((c) => (
                <CompetitorPill key={c} competitor={c} size="sm" />
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>

      {drawer ? (
        <DocumentDrawer
          open={!!drawer}
          onOpenChange={(v) => {
            if (!v) setDrawer(null);
          }}
          title={drawer.title}
          markdown={drawer.markdown}
          fileBase={drawer.fileBase}
        />
      ) : null}
    </Card>
  );
}

type CompetitorRow = { key: string; pillValue: string; note: string | null };

/**
 * Merge the competitors[] strings with competitorNotes[] into display rows.
 * Matching is loose (normalized name/domain substring) since the LLM may
 * phrase the name slightly differently across the two arrays.
 */
function buildCompetitorRows(
  competitors: string[],
  notes: Array<{ name: string; domain?: string; note: string }>,
  industry: string = ""
): CompetitorRow[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const used = new Set<number>();

  const rows: CompetitorRow[] = competitors.slice(0, 12).map((c, i) => {
    const cn = norm(c);
    let matched: { name: string; domain?: string; note: string } | undefined;
    notes.forEach((n, idx) => {
      if (matched || used.has(idx)) return;
      const nn = norm(n.name);
      const dn = n.domain ? norm(n.domain) : "";
      if ((nn && cn.includes(nn)) || (nn && nn.includes(cn)) || (dn && cn.includes(dn))) {
        matched = n;
        used.add(idx);
      }
    });
    // If no LLM note exists yet, fall back to a clean heuristic line so
    // the row is never blank — the user explicitly asked for "always a
    // 1-2 liner".
    const note = matched?.note ?? fallbackCompetitorNote(c, industry);
    return {
      key: `${c}-${i}`,
      pillValue: c,
      note,
    };
  });

  // Append any notes that didn't match a competitor string (so nothing is lost).
  notes.forEach((n, idx) => {
    if (used.has(idx)) return;
    rows.push({
      key: `note-${idx}`,
      pillValue: n.domain ? `${n.name} (${n.domain})` : n.name,
      note: n.note,
    });
  });

  return rows;
}

/**
 * Heuristic one-liner used when the strategy LLM hasn't produced a
 * competitor note yet. Reads the competitor's bare name + parenthetical
 * domain and explains, in plain language, what they appear to be and how
 * they show up as a competitor in this industry. It is intentionally
 * generic but business-aware — better than a blank row, and gets replaced
 * by the LLM's specific note on the next strategy run.
 */
function fallbackCompetitorNote(raw: string, industry: string): string {
  const m = raw.match(/^([^(]+?)(?:\s*\(([^)]+)\))?\s*$/);
  const name = (m?.[1] ?? raw).trim();
  const domain = m?.[2]?.trim();
  const ind = industry ? industry.toLowerCase() : "the same category";
  const tldHint = domain ? ` (${domain})` : "";
  return `${name}${tldHint} competes for the same buyers as you in ${ind}. Run the strategy agent for a deeper take on where they win and where they lose.`;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "brand"
  );
}

/**
 * Brand Voice document for the side drawer. Prefers the LLM-authored
 * `brandVoiceDoc`; otherwise composes a structured fallback from the
 * voice profile so the drawer is always useful.
 */
function buildBrandVoiceDoc(data: CompanyData, siteName: string): string {
  const v = data.voice;
  if (v?.brandVoiceDoc && v.brandVoiceDoc.trim().length > 40) {
    return v.brandVoiceDoc;
  }
  const tone = v?.brandVoice?.tone ?? v?.tone;
  const style = v?.brandVoice?.style ?? v?.styleGuidelines?.join("; ");
  const avoid = (v?.brandVoice?.avoid ?? v?.avoid ?? []).map((a) =>
    typeof a === "string" ? a : String(a)
  );
  const props = v?.valueProps ?? [];
  const industry = data.workspace.industry ?? "";
  const icp = data.workspace.icp ?? "";
  const audienceNoun = audienceNounFor(industry, icp);

  // Render a full, written brand-voice guide — never a 3-bullet stub.
  const lines: string[] = [`# ${siteName} — Brand Voice Guide`, ""];
  lines.push(
    `> A written guide for anyone drafting copy, posts, or outreach on behalf of **${siteName}**. Use it as the source of truth for how the brand sounds across every channel.`,
    ""
  );

  // 1. Brand essence
  lines.push("## 1. Brand essence", "");
  if (v?.positioning) {
    lines.push(`**Positioning.** ${v.positioning}`, "");
  }
  lines.push(
    `**Who we exist for.** ${
      icp ||
      `${audienceNoun} who need a more reliable, modern alternative to legacy options in ${industry || "the category"}.`
    }`,
    ""
  );

  // 2. Voice & tone matrix
  lines.push("## 2. Voice & tone", "");
  const voiceTone =
    tone ||
    `Confident, expert, and human. We sound like a senior practitioner in ${industry || "our space"} who is telling the truth to a peer — never like a marketing department reading off a script.`;
  lines.push(voiceTone, "");
  lines.push(
    `**Personality attributes (in order):** Authoritative · Clear · Useful · Warm · Specific.`,
    ""
  );
  lines.push("**Tone by context:**", "");
  lines.push("| Context | How we sound | Example opener |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| Marketing site & landing pages | Confident, outcome-led, second-person | "${
      props[0] ||
      `Stop ${(industry || "the work").toLowerCase()} from leaking margin every quarter.`
    }" |`
  );
  lines.push(
    `| Long-form content / blog | Educational, expert, respectful of the reader's time | "Here is what most teams get wrong about ${
      (industry || "this category").toLowerCase()
    } — and the three changes that fix it." |`
  );
  lines.push(
    `| Social posts (LinkedIn / X) | First-person, opinionated, short | "We measured this across 40+ deployments. The pattern is unambiguous." |`
  );
  lines.push(
    `| Outbound / sales replies | Warm, specific, low-pressure | "Saw you posted about X — happy to share what we've learned even if we never work together." |`
  );
  lines.push(
    `| Product / in-app | Direct, action-led, never apologetic | "Connected. Pulling your data now." |`
  );
  lines.push(
    `| Customer support | Calm, accountable, owns the problem | "That's on us. Here is exactly what happened and how we're fixing it." |`,
    ""
  );

  // 3. Style guidelines
  lines.push("## 3. Style guidelines", "");
  if (style) {
    lines.push(style, "");
  }
  lines.push(
    "- **Lead with the outcome, not the feature.** Every section answers \"what does this get me?\" before \"how does it work?\".",
    "- **Use specifics, not adjectives.** Numbers, named entities, and concrete artifacts always beat \"powerful\", \"seamless\", \"intelligent\".",
    "- **One idea per sentence.** Cap most sentences at ~18 words. Vary length for rhythm.",
    "- **Second person, active voice.** \"You ship faster\" beats \"Teams are enabled to ship faster\".",
    "- **Verbs over nouns.** \"We forecast cash flow\" beats \"We provide a cash-flow forecasting solution\".",
    "- **British / US spelling: US.** Use Oxford comma. Sentence-case headings.",
    "- **Numbers under 10 spelled out** in body copy, numerals everywhere else and in headlines.",
    ""
  );

  // 4. Vocabulary — say this / not this
  lines.push("## 4. Vocabulary — say this / not this", "");
  lines.push("| Say this | Not this | Why |");
  lines.push("| --- | --- | --- |");
  lines.push(
    "| platform, system, workflow | solution, suite, offering | sounds like a real product, not a brochure |"
  );
  lines.push(
    "| customers, teams, operators | users, end-users, consumers | respects who we sell to |"
  );
  lines.push(
    "| ship, launch, roll out | enable, empower, leverage | active, not vendor-speak |"
  );
  lines.push(
    "| because, so that, which means | utilizing, in order to | plain English wins |"
  );
  lines.push(
    "| faster, cheaper, safer | best-in-class, world-class, cutting-edge | concrete, not posturing |",
    ""
  );

  // 5. Messaging pillars
  lines.push("## 5. Messaging pillars", "");
  if (props.length) {
    for (let i = 0; i < Math.min(props.length, 5); i++) {
      lines.push(`**Pillar ${i + 1} — ${pillarTitleFromProp(props[i])}.** ${props[i]}`);
      lines.push("");
    }
  } else {
    lines.push(
      `_Run the strategy agent to generate distinct messaging pillars for ${siteName}._`,
      ""
    );
  }

  // 6. Example rewrites
  lines.push("## 6. Example rewrites", "");
  lines.push("| Generic version | On-brand rewrite |");
  lines.push("| --- | --- |");
  lines.push(
    `| "${siteName} is a leading-edge platform that empowers teams to do more." | "${siteName} is how ${audienceNoun} ${
      props[0]?.replace(/\.$/, "").toLowerCase() ||
      `cut waste and move faster`
    }." |`
  );
  lines.push(
    `| "Sign up today to unlock powerful insights." | "See your first audit in 30 seconds. No card." |`
  );
  lines.push(
    `| "We provide best-in-class customer support." | "Reply in <2 hours, by a human who has shipped the code." |`,
    ""
  );

  // 7. What to avoid
  lines.push("## 7. What to avoid", "");
  if (avoid.length) {
    for (const a of avoid) lines.push(`- ${a}`);
  } else {
    lines.push(
      "- Generic SaaS adjectives (\"revolutionary\", \"game-changing\", \"world-class\").",
      "- Hedged claims (\"could potentially help\", \"may be able to\").",
      "- Internal jargon that the customer would never say out loud.",
      "- Apologies that don't end in a concrete next step.",
      "- Walls of text without examples, screenshots, or numbers."
    );
  }
  lines.push("");

  lines.push(
    "---",
    "",
    `_This guide is generated from the current strategy snapshot for ${siteName}. Re-run the SEO / strategy agent to refresh it after any major positioning change._`
  );
  return lines.join("\n");
}

function pillarTitleFromProp(p: string): string {
  // First 3-5 words, title-cased.
  const trimmed = p.replace(/^[*\-•]\s*/, "").split(/[—:.;]/)[0].trim();
  const words = trimmed.split(/\s+/).slice(0, 5);
  return words
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function audienceNounFor(industry: string, icp: string): string {
  const text = `${industry} ${icp}`.toLowerCase();
  if (text.includes("law")) return "law firms";
  if (text.includes("legal")) return "legal teams";
  if (text.includes("finance") || text.includes("cfo")) return "finance teams";
  if (text.includes("ecommerce") || text.includes("e-commerce") || text.includes("retail"))
    return "DTC operators";
  if (text.includes("saas") || text.includes("b2b")) return "B2B teams";
  if (text.includes("creator") || text.includes("influencer")) return "creators";
  if (text.includes("solar") || text.includes("renewable") || text.includes("energy"))
    return "C&I energy buyers";
  if (text.includes("startup") || text.includes("founder")) return "founders";
  return "modern teams";
}

/**
 * Marketing Strategy document for the side drawer. Prefers the LLM-authored
 * `marketingStrategyDoc`; otherwise composes a structured fallback (with
 * tables) from the voice profile + workspace fields.
 */
function buildMarketingStrategyDoc(data: CompanyData, siteName: string): string {
  const v = data.voice;
  if (v?.marketingStrategyDoc && v.marketingStrategyDoc.trim().length > 60) {
    return v.marketingStrategyDoc;
  }
  const industry = data.workspace.industry ?? "";
  const icp = data.workspace.icp ?? "";
  const audienceNoun = audienceNounFor(industry, icp);
  const channels = (v?.channels ?? []) as string[];
  const clusters = v?.topicClusters ?? [];
  const props = v?.valueProps ?? [];
  const competitors = v?.competitors ?? [];

  const lines: string[] = [`# ${siteName} — Marketing Strategy`, ""];
  lines.push(
    `> A CMO-grade strategy memo for **${siteName}**. Built from the latest live analysis of the site, the active competitive set, and the channels where ${audienceNoun} actually buy. Read it like a working document — edit, re-run, and re-export as positioning evolves.`,
    ""
  );

  // 1. Executive summary
  lines.push("## 1. Executive summary", "");
  lines.push(
    `${siteName} operates in **${industry || "an undefined category"}**, selling to **${
      icp || `${audienceNoun} who want a modern, accountable alternative to the status quo`
    }**. ${
      v?.positioning ||
      `The brand wins on outcome speed, transparent pricing, and a sharper point of view than the incumbents.`
    } The 90-day priority is to compound demand on the channels below while building durable category authority for the topics in §4.`,
    ""
  );

  // 2. ICP & positioning
  lines.push("## 2. ICP & positioning", "");
  lines.push(`**Industry.** ${industry || "TBD — set in Settings."}`, "");
  lines.push(
    `**Ideal customer profile.** ${
      icp ||
      "TBD — describe who you sell to in 1–2 sentences in Settings."
    }`,
    ""
  );
  if (v?.positioning) {
    lines.push(`**Positioning statement.** ${v.positioning}`, "");
  }
  if (props.length) {
    lines.push("**Value propositions:**", "");
    for (const p of props.slice(0, 6)) lines.push(`- ${p}`);
    lines.push("");
  }

  // 3. Competitive landscape — use the per-competitor LLM notes when present
  // so every row is specific (not the same templated line).
  if (competitors.length) {
    const notes = v?.competitorNotes ?? [];
    const noteFor = (name: string): string | null => {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const n = norm(name);
      const m = notes.find((x) => {
        const xn = norm(x.name);
        return xn && (n.includes(xn) || xn.includes(n));
      });
      return m?.note ?? null;
    };
    lines.push("## 3. Competitive landscape", "");
    lines.push("| Competitor | How they compete | Where we win |");
    lines.push("| --- | --- | --- |");
    for (const c of competitors.slice(0, 10)) {
      const name = c.split("(")[0].trim();
      const note = noteFor(name);
      const angle = note
        ? note.replace(/\|/g, "/")
        : `Targets ${audienceNoun} in ${industry || "the category"}; broad but generic.`;
      const win = note
        ? "Sharper positioning, faster time-to-value, and a clearer POV."
        : `Speed, specificity, and a clearer point of view for ${audienceNoun}.`;
      lines.push(`| ${name} | ${angle} | ${win} |`);
    }
    lines.push("");
  }

  // 4. Channel strategy with allocation
  lines.push("## 4. Channel strategy & budget allocation", "");
  const planChannels = channels.length
    ? channels
    : ["seo", "content", "linkedin", "reddit", "geo"];
  lines.push("| Channel | Why it fits | Effort | Suggested allocation |");
  lines.push("| --- | --- | --- | --- |");
  const alloc = suggestedAllocation(planChannels);
  for (const c of planChannels) {
    lines.push(
      `| ${channelLabel(c)} | ${channelRationale(c)} | ${channelEffort(c)} | ${alloc[c] ?? "—"} |`
    );
  }
  lines.push("");

  // 5. Content pillars + keyword clusters
  lines.push("## 5. Content pillars & topic clusters", "");
  if (clusters.length) {
    lines.push("| Pillar | Hero keywords | Cadence |");
    lines.push("| --- | --- | --- |");
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      const cad =
        i === 0
          ? "1 cornerstone + 2 supporting / month"
          : i === 1
            ? "1 cornerstone / month"
            : "1 supporting / month";
      lines.push(
        `| **${c.theme}** | ${(c.keywords ?? []).slice(0, 5).join(", ")} | ${cad} |`
      );
    }
    lines.push("");
  } else {
    lines.push(
      "_Run the strategy agent to populate topic clusters with keywords scoped to this business._",
      ""
    );
  }

  // 6. 90-day roadmap
  lines.push("## 6. 90-day roadmap", "");
  lines.push("| Phase | Weeks | Focus | Concrete deliverables |");
  lines.push("| --- | --- | --- | --- |");
  lines.push(
    "| **Foundation** | 1–4 | Plumbing + first wins | Fix SEO basics from the audit, ship pillar #1 cornerstone, set up GSC/GA4, publish 4 LinkedIn / X posts in the new voice. |"
  );
  lines.push(
    "| **Build** | 5–8 | Content velocity + distribution | 2 cornerstones, 6 supporting posts, 2 Reddit-native explainers, first GEO citation push, launch newsletter. |"
  );
  lines.push(
    "| **Compound** | 9–12 | Measure, double down, kill misses | Re-rank tracked keywords, double allocation to the top-performing channel, retire weakest channel, publish first customer case study. |",
    ""
  );

  // 7. KPIs
  lines.push("## 7. KPIs & instrumentation", "");
  lines.push("| Metric | Source | Target by day 90 |");
  lines.push("| --- | --- | --- |");
  lines.push("| Branded organic clicks / mo | Search Console | +50% vs. baseline |");
  lines.push("| Non-branded organic clicks / mo | Search Console | +100% vs. baseline |");
  lines.push("| Indexed pages in target clusters | GSC + sitemap | 100% of cornerstones, 60% of supporting |");
  lines.push("| GEO score (AI citations) | Xicmo GEO Agent | Cited in ≥3 of 6 platforms for brand query |");
  lines.push("| Reddit / X reply CTR | Xicmo Publish Queue | ≥3% click-through on top 10 threads |");
  lines.push("| MQL / waitlist signups | Site analytics | +25% MoM in months 2–3 |", "");

  // 8. Operating cadence
  lines.push("## 8. Operating cadence", "");
  lines.push(
    "- **Weekly** — review Actions feed, ship 1 cornerstone or 2 supporting pieces, post 3× LinkedIn + 5× X, scan Reddit + HN for buying-intent threads.",
    "- **Bi-weekly** — strategy stand-up: what's working, what's flat, what to kill. Re-run the SEO + GEO agents.",
    "- **Monthly** — refresh competitive scan, rebalance channel allocation against KPIs, publish 1 customer story or POV essay.",
    "- **Quarterly** — re-do the positioning + ICP audit. Re-run this whole document.",
    ""
  );

  lines.push(
    "---",
    "",
    `_Generated from the current ${siteName} workspace. Re-run the SEO / strategy agent to refresh with the latest snapshot._`
  );
  return lines.join("\n");
}

const CHANNEL_EFFORT: Record<string, string> = {
  seo: "Medium",
  geo: "Low–medium",
  reddit: "High (manual)",
  x: "Medium",
  linkedin: "Medium",
  hackernews: "Low (opportunistic)",
  content: "High (production)",
};
function channelEffort(c: string): string {
  return CHANNEL_EFFORT[c] ?? "Medium";
}

function suggestedAllocation(channels: string[]): Record<string, string> {
  // Heuristic allocation: heaviest weights to SEO + content because they
  // compound; distribute the rest evenly.
  const out: Record<string, string> = {};
  const remaining = [...channels];
  const give = (k: string, pct: number) => {
    if (remaining.includes(k)) {
      out[k] = `${pct}%`;
      remaining.splice(remaining.indexOf(k), 1);
    }
  };
  give("seo", 30);
  give("content", 25);
  give("linkedin", 15);
  give("reddit", 10);
  give("geo", 10);
  give("x", 5);
  give("hackernews", 5);
  if (remaining.length) {
    const each = Math.max(5, Math.floor(remaining.length > 0 ? 100 / (remaining.length + 1) : 0));
    for (const c of remaining) out[c] = `${each}%`;
  }
  return out;
}

const CHANNEL_LABELS: Record<string, string> = {
  seo: "SEO",
  geo: "GEO (AI search)",
  reddit: "Reddit",
  x: "X / Twitter",
  linkedin: "LinkedIn",
  hackernews: "Hacker News",
  content: "Content / Blog",
};
function channelLabel(c: string): string {
  return CHANNEL_LABELS[c] ?? c;
}
const CHANNEL_RATIONALE: Record<string, string> = {
  seo: "Capture high-intent search demand and compound organic traffic.",
  geo: "Get cited by ChatGPT, Gemini, Perplexity and AI Overviews.",
  reddit: "Engage buying-intent threads with authentic, helpful replies.",
  x: "Build founder/brand voice and ride real-time conversations.",
  linkedin: "Reach decision-makers with thought-leadership content.",
  hackernews: "Tap technical early adopters via Show/Ask HN.",
  content: "Own the narrative with long-form, search-optimized articles.",
};
function channelRationale(c: string): string {
  return CHANNEL_RATIONALE[c] ?? "High-leverage channel for this audience.";
}

function DocumentCard({
  icon: Icon,
  label,
  isOpen,
  isReady,
  isPending,
  opensDrawer,
  onToggle,
  children,
}: {
  icon: typeof FileText;
  label: string;
  isOpen: boolean;
  isReady?: boolean;
  isPending?: boolean;
  /** When true, the card opens a side drawer; show an open-in icon, no inline body. */
  opensDrawer?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card transition-colors hover:border-border/80">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
        aria-expanded={opensDrawer ? undefined : isOpen}
        title={opensDrawer ? `Open ${label} document` : undefined}
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="flex-1 truncate">{label}</span>
        {isPending ? (
          <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
            <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
            Loading
          </span>
        ) : isReady ? (
          <span className="inline-flex items-center rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-500">
            new
          </span>
        ) : null}
        {opensDrawer ? (
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown
            className={
              "h-3.5 w-3.5 text-muted-foreground transition-transform " +
              (isOpen ? "rotate-180" : "")
            }
            aria-hidden
          />
        )}
      </button>
      {!opensDrawer && isOpen ? (
        <div className="border-t px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function sectionHasContent(section: Section, data: CompanyData): boolean {
  const v = data.voice;
  switch (section) {
    case "product":
      return !!(
        data.liveSnapshot?.description ||
        v?.siteDescription ||
        (v?.valueProps && v.valueProps.length > 0)
      );
    case "competitors":
      return !!(v?.competitors && v.competitors.length > 0);
    case "voice":
      return !!(v?.brandVoice?.tone || v?.tone || v?.positioning);
    case "strategy":
      return !!(v?.channels?.length || v?.topicClusters?.length);
  }
}

/** Shimmer placeholder bars shown while the analysis is still streaming. */
function SectionLoading() {
  return (
    <div className="space-y-2" aria-hidden>
      <div className="h-2.5 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-2.5 w-full animate-pulse rounded bg-muted [animation-delay:120ms]" />
      <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted [animation-delay:240ms]" />
    </div>
  );
}

function ReloadButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 gap-1.5 px-2 text-[11px]"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await forceReauditAction();
          router.refresh();
        })
      }
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="h-3 w-3" aria-hidden />
      )}
      Reload
    </Button>
  );
}

/**
 * Clean terminal state for a section that has no content and isn't
 * actively analyzing — e.g. the strategy LLM came back thin. No alarming
 * "failed" colour; just a quiet line plus a re-run affordance so the user
 * has a way forward instead of a stuck spinner.
 */
function SectionEmpty({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted-foreground">
        No {label} generated yet.
      </p>
      <ReloadButton />
    </div>
  );
}

/** Renders SectionLoading while analyzing, otherwise the clean empty state. */
function SectionPlaceholder({
  analyzing,
  label,
}: {
  analyzing: boolean;
  label: string;
}) {
  return analyzing ? <SectionLoading /> : <SectionEmpty label={label} />;
}

function DocumentBody({
  section,
  data,
  analyzing,
  hasUrl,
}: {
  section: Section;
  data: CompanyData;
  analyzing: boolean;
  hasUrl: boolean;
}) {
  const v = data.voice;
  switch (section) {
    case "product": {
      const desc =
        data.liveSnapshot?.description ||
        v?.siteDescription ||
        data.workspace.icp;
      const props = v?.valueProps ?? [];
      const enrich = data.llmAnalysis?.documentEnrichment;
      const hasAny =
        !!desc || props.length > 0 || !!enrich?.productBlurb || !!data.workspace.industry;
      if (!hasAny) {
        if (!hasUrl) return <p>Add your website to generate this section.</p>;
        return <SectionPlaceholder analyzing={analyzing} label="product information" />;
      }
      return (
        <div className="space-y-2">
          {data.workspace.industry ? (
            <p>
              <span className="font-medium text-foreground">Industry:</span>{" "}
              {data.workspace.industry}
            </p>
          ) : null}
          {desc ? <p>{desc}</p> : null}
          {props.length > 0 ? (
            <ul className="ml-4 list-disc space-y-1">
              {props.slice(0, 6).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          {enrich?.productBlurb ? (
            <div className="mt-2 rounded-md border border-dashed bg-muted/20 p-2 text-[11px]">
              <span className="font-medium text-foreground">AI deep-dive:</span>{" "}
              {enrich.productBlurb}
            </div>
          ) : null}
        </div>
      );
    }
    case "competitors": {
      const enrich = data.llmAnalysis?.documentEnrichment;
      const notes = v?.competitorNotes ?? [];
      if (!v?.competitors?.length && !notes.length && !enrich?.competitorAngles) {
        if (!hasUrl) return <p>Add your website to find competitors.</p>;
        return <SectionPlaceholder analyzing={analyzing} label="competitor analysis" />;
      }
      // Build a unified list: prefer notes (name + domain + summary); fall
      // back to bare competitor strings when no note exists for one.
      const rows = buildCompetitorRows(
        v?.competitors ?? [],
        notes,
        data.workspace.industry ?? ""
      );
      return (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div
              key={r.key}
              className="flex items-start gap-2 rounded-md border bg-card/50 p-2"
            >
              <CompetitorPill competitor={r.pillValue} size="sm" />
              {r.note ? (
                <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
                  {r.note}
                </p>
              ) : null}
            </div>
          ))}
          {enrich?.competitorAngles ? (
            <p className="rounded-md border border-dashed bg-muted/20 p-2 text-[11px]">
              <span className="font-medium text-foreground">AI angle:</span>{" "}
              {enrich.competitorAngles}
            </p>
          ) : null}
        </div>
      );
    }
    case "voice": {
      const tone = v?.brandVoice?.tone ?? v?.tone;
      const style = v?.brandVoice?.style ?? v?.styleGuidelines?.join("; ");
      const avoidList = v?.brandVoice?.avoid ?? v?.avoid ?? [];
      const enrich = data.llmAnalysis?.documentEnrichment;
      if (!tone && !style && avoidList.length === 0 && !enrich?.voiceSummary) {
        if (!hasUrl) return <p>Add your website to generate this section.</p>;
        return <SectionPlaceholder analyzing={analyzing} label="brand voice" />;
      }
      return (
        <div className="space-y-2">
          {tone ? (
            <p>
              <span className="font-medium text-foreground">Tone:</span> {tone}
            </p>
          ) : null}
          {style ? (
            <p>
              <span className="font-medium text-foreground">Style:</span> {style}
            </p>
          ) : null}
          {avoidList.length > 0 ? (
            <div>
              <span className="font-medium text-foreground">Avoid:</span>
              <ul className="ml-4 list-disc">
                {avoidList.slice(0, 8).map((a) => (
                  <li key={typeof a === "string" ? a : String(a)}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {enrich?.voiceSummary ? (
            <p className="rounded-md border border-dashed bg-muted/20 p-2 text-[11px]">
              <span className="font-medium text-foreground">AI summary:</span>{" "}
              {enrich.voiceSummary}
            </p>
          ) : null}
        </div>
      );
    }
    case "strategy": {
      const channels = v?.channels ?? [];
      const clusters = v?.topicClusters ?? [];
      const enrich = data.llmAnalysis?.documentEnrichment;
      if (channels.length === 0 && clusters.length === 0 && !enrich?.strategySummary) {
        if (!hasUrl) return <p>Add your website to draft a strategy.</p>;
        return <SectionPlaceholder analyzing={analyzing} label="marketing strategy" />;
      }
      return (
        <div className="space-y-2">
          {channels.length > 0 ? (
            <div>
              <span className="font-medium text-foreground">Channels:</span>{" "}
              {channels.join(", ")}
            </div>
          ) : null}
          {clusters.length > 0 ? (
            <div>
              <div className="font-medium text-foreground">Topic clusters</div>
              <ul className="ml-4 list-disc space-y-1">
                {clusters.slice(0, 5).map((c) => (
                  <li key={c.theme}>
                    <span className="text-foreground">{c.theme}</span>
                    {c.keywords?.length ? (
                      <span className="text-muted-foreground">
                        {" "}
                        — {c.keywords.slice(0, 5).join(", ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {enrich?.strategySummary ? (
            <p className="rounded-md border border-dashed bg-muted/20 p-2 text-[11px]">
              <span className="font-medium text-foreground">AI playbook:</span>{" "}
              {enrich.strategySummary}
            </p>
          ) : null}
        </div>
      );
    }
  }
}


type CompanyVoice = (CompanyData["voice"]);

function SocialHandlesRow({ voice }: { voice: CompanyVoice | null }) {
  const handles = voice?.socialHandles ?? {};
  const items: Array<{
    key: keyof typeof handles;
    icon: typeof Twitter;
    label: string;
    href: (v: string) => string;
  }> = [
    {
      key: "twitter",
      icon: Twitter,
      label: "X",
      href: (v) => `https://x.com/${stripAt(v)}`,
    },
    {
      key: "instagram",
      icon: Instagram,
      label: "Instagram",
      href: (v) => `https://instagram.com/${stripAt(v)}`,
    },
    {
      key: "linkedin",
      icon: Linkedin,
      label: "LinkedIn",
      href: (v) => (v.startsWith("http") ? v : `https://${v.replace(/^https?:\/\//, "")}`),
    },
    {
      key: "youtube",
      icon: Youtube,
      label: "YouTube",
      href: (v) => (v.startsWith("@") ? `https://youtube.com/${v}` : `https://${v.replace(/^https?:\/\//, "")}`),
    },
    {
      key: "facebook",
      icon: Facebook,
      label: "Facebook",
      href: (v) => (v.startsWith("http") ? v : `https://${v.replace(/^https?:\/\//, "")}`),
    },
    {
      key: "github",
      icon: Github,
      label: "GitHub",
      href: (v) => `https://github.com/${v.replace(/^@/, "")}`,
    },
  ];

  const present = items.filter((it) => {
    const v = handles[it.key];
    return typeof v === "string" && v.trim().length > 0;
  });

  if (present.length === 0) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href="/settings" className="justify-start gap-2">
          <AtSign className="h-3.5 w-3.5" aria-hidden />
          Add social handles
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {present.map((it) => {
        const Icon = it.icon;
        const value = handles[it.key] as string;
        return (
          <a
            key={it.key}
            href={it.href(value)}
            target="_blank"
            rel="noreferrer noopener"
            title={`${it.label}: ${value}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="max-w-[10ch] truncate font-mono text-[11px]">
              {value}
            </span>
          </a>
        );
      })}
      <Link
        href="/settings"
        className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed px-2 text-[11px] text-muted-foreground hover:text-foreground"
      >
        Edit
      </Link>
    </div>
  );
}

function stripAt(v: string): string {
  return v.startsWith("@") ? v.slice(1) : v;
}


function stripUrlScheme(u: string): string {
  return u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}
