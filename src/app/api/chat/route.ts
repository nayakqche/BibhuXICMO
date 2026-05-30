import { NextResponse, type NextRequest } from "next/server";
import { generateText, type CoreMessage } from "ai";
import { z } from "zod";
import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import {
  getModel,
  pickAvailableModel,
  runWithFallback,
} from "@/backend/llm";
import { chargeCredits, MODEL_CREDIT_COST } from "@/backend/credits";
import { rateLimitAsync, ipKey } from "@/backend/rate-limit";
import { buildCmoTools } from "@/backend/agents/cmo-tools";
import { SITE_NAME } from "@/shared/site";

export const runtime = "nodejs";
// Tool calls run scrapers + LLM; allow up to 60s.
export const maxDuration = 60;

const bodySchema = z.object({
  sessionId: z.string().optional(),
  /** When `"cmo"`, defaults to Claude-first routing for /agent/cmo chat dock. */
  source: z.enum(["cmo", "app"]).optional(),
  model: z
    .enum([
      "gpt-4o",
      "gpt-4o-mini",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
      "claude-opus-4-7",
      // legacy aliases — accepted so existing chats with stored model names
      // still validate; getModel() routes them to current Anthropic IDs.
      "claude-3-5-sonnet",
      "claude-3-5-haiku",
    ] as const)
    .optional(),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })
  ),
});

function buildSystemPrompt(args: {
  workspaceName: string;
  websiteUrl: string | null;
  industry: string | null;
  icp: string | null;
}): string {
  const lines = [
    `You are the AI CMO inside ${SITE_NAME}, the marketing co-pilot for ${args.workspaceName}.`,
    `Workspace website: ${args.websiteUrl ?? "(not set yet)"}.`,
    args.industry ? `Industry: ${args.industry}.` : null,
    args.icp ? `Target customer: ${args.icp}.` : null,
    "",
    "GROUNDING RULES (strict):",
    `- Answer ONLY using THIS workspace's own data inside ${SITE_NAME}: the audits, SEO/GEO scans, analytics, drafts, discovered threads/creators, campaigns, and the live results your tools return. Always call the relevant tool and base the answer on what it returns.`,
    "- When the user pastes any URL, call analyze_url first, then write a concrete page-specific analysis from the result.",
    "- SEO audit → run_seo_agent. LLM citations / GEO / 'do AIs cite us' → run_geo_agent. Reddit/HN → find_reddit_threads / find_hn_threads. Drafting → draft_x_post / draft_linkedin_post / write_article. 'What are people searching for?' → gsc_top_queries.",
    "- Cite the actual numbers, headings, or quotes the tools return. NEVER invent data and NEVER answer from outside/general knowledge that isn't grounded in this workspace's data or a tool result.",
    `- If a request cannot be answered from this workspace's data or your tools (e.g. trivia, coding help, world facts, unrelated topics), politely say you can only help with their ${SITE_NAME} marketing data and agents, and suggest the closest useful action (e.g. run an audit, scan threads, draft a post).`,
    "- After any tool runs, always write at least a short summary in your own words (never end with only tool calls and no text).",
    "- Keep replies tight: lead with the answer, then a short bullet list of evidence from the data, then one suggested next action.",
  ];
  return lines.filter(Boolean).join("\n");
}

export async function POST(req: NextRequest) {
  const { workspace, user } = await requireWorkspace({ skipOnboardingCheck: true });

  const limited = await rateLimitAsync(ipKey(req, `chat:${user.id}`), {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { messages, sessionId: incomingId } = parsed.data;
  // The AI CMO dock and Private Chat both run on OpenAI GPT, grounded strictly
  // on this workspace's data. The model is fixed (not user-selectable).
  const preferred = "gpt-4o-mini" as const;
  const initialPick = pickAvailableModel(preferred);

  if (!initialPick) {
    return NextResponse.json(
      { error: "The assistant isn't available right now. Please try again later." },
      { status: 503 }
    );
  }

  let session = incomingId
    ? await prisma.chatSession.findFirst({
        where: { id: incomingId, userId: user.id },
      })
    : null;

  if (!session) {
    session = await prisma.chatSession.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        model: initialPick,
        title: messages[0]?.content.slice(0, 80) ?? "New chat",
      },
    });
  }

  // Persist the last user message
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (lastUser) {
    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "user",
        content: lastUser.content,
      },
    });
  }

  const coreMessages: CoreMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const tools = buildCmoTools(workspace.id);
  const system = buildSystemPrompt({
    workspaceName: workspace.name,
    websiteUrl: workspace.websiteUrl,
    industry: workspace.industry,
    icp: workspace.icp,
  });

  try {
    const { value: result, model: usedModel, tried } = await runWithFallback(
      preferred,
      (model) =>
        generateText({
          model: getModel(model),
          system,
          messages: coreMessages,
          tools,
          maxSteps: 5,
        }),
      { reason: "chat.generate" }
    );

    let text = result.text.trim();
    if (!text) {
      // The model finished after running tools but didn't write any prose.
      // Force a short follow-up summarizer call so the user always gets a reply.
      try {
        const followUp = await generateText({
          model: getModel(usedModel),
          system,
          prompt:
            "Summarize what you just did in 2-4 short sentences. Lead with the answer or finding, then mention the most important specific number or quote from the tool output. Do not call any more tools.",
        });
        text = followUp.text.trim();
      } catch {
        /* fall through to fallback below */
      }
    }
    if (!text) {
      text =
        "I ran the request but the model did not return any prose. Try asking again, simplifying the request, or check your provider quota.";
    }

    if (session.model !== usedModel) {
      try {
        session = await prisma.chatSession.update({
          where: { id: session.id },
          data: { model: usedModel },
        });
      } catch {
        /* non-fatal */
      }
    }

    const tokens = result.usage?.totalTokens ?? 0;
    const cost = MODEL_CREDIT_COST[usedModel] ?? 1;
    await chargeCredits({
      workspaceId: workspace.id,
      credits: cost,
      reason: "chat.generate",
      model: usedModel,
      tokens,
      meta: tried.length > 1 ? { tried } : undefined,
    });
    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "assistant",
        content: text,
        tokens,
      },
    });

    return NextResponse.json(
      { text, sessionId: session.id, model: usedModel },
      {
        headers: {
          "X-Chat-Session-Id": session.id,
          "X-Chat-Model": usedModel,
        },
      }
    );
  } catch (err) {
    console.error("POST /api/chat failed:", err);
    const raw = err instanceof Error ? err.message : "Chat request failed.";
    const lower = raw.toLowerCase();
    let friendly = "The assistant is temporarily unavailable. Please try again in a moment.";
    if (lower.includes("credit balance") || lower.includes("low balance") || lower.includes("billing")) {
      friendly = "The assistant is temporarily unavailable (usage limit reached). Please try again later.";
    }
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}
