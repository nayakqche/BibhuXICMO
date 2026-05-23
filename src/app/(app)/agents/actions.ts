"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/backend/workspace";
import { executeAgent } from "@/backend/agents/base";
import { getAgent } from "@/backend/agents/registry";

const AGENT_TIMEOUT_MS = 110_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `${label} timed out after ${Math.round(ms / 1000)}s. Try again or check Render logs.`
          )
        ),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export async function runAgentAction(agentId: string, input?: unknown) {
  const { workspace } = await requireWorkspace();
  const agent = getAgent(agentId);
  if (!agent) return { ok: false as const, error: `Unknown agent: ${agentId}` };

  try {
    const result = await withTimeout(
      executeAgent(agent, workspace.id, input ?? {}),
      agentId === "hn" || agentId === "x" || agentId === "instagram"
        ? 170_000
        : 60_000,
      agent.title
    );
    revalidatePath(`/agents/${agentId}`);
    revalidatePath("/dashboard");
    revalidatePath("/actions");
    revalidatePath("/content");
    revalidatePath("/queue");
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false as const, error: message, runId: "" };
  }
}

export async function resolveActionItem(actionId: string, status: "DONE" | "DISMISSED" | "SNOOZED") {
  const { workspace } = await requireWorkspace();
  const { prisma } = await import("@/backend/db");
  await prisma.actionItem.updateMany({
    where: { id: actionId, workspaceId: workspace.id },
    data: { status },
  });
  revalidatePath("/dashboard");
  revalidatePath("/actions");
  return { ok: true as const };
}

import { generateBulkBlog, type BlogType } from "@/backend/agents/content-bulk";
import type { CmoVoiceProfile } from "@/backend/agents/cmo-data";

export type BulkContentResult =
  | { ok: true; created: Array<{ id: string; title: string; keyword: string }> }
  | { ok: false; error: string; partial?: Array<{ id: string; title: string; keyword: string }> };

/**
 * Generate one blog draft per keyword. Keywords are processed sequentially
 * (so the user can see drafts appear one at a time after each completes)
 * and per-keyword failures are isolated — the rest of the batch keeps
 * going.
 */
export async function runContentBulkAction(args: {
  keywords: string[];
  blogType: BlogType;
  includeImage: boolean;
}): Promise<BulkContentResult> {
  const { workspace } = await requireWorkspace();
  const clean = (args.keywords ?? [])
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 20); // hard cap so a paste of 1000 keywords can't blow the budget
  if (clean.length === 0) {
    return { ok: false, error: "Add at least one keyword." };
  }
  const voice = (workspace.voiceProfile ?? null) as CmoVoiceProfile | null;

  const created: Array<{ id: string; title: string; keyword: string }> = [];
  let firstError: string | null = null;

  for (const keyword of clean) {
    try {
      const result = await generateBulkBlog({
        workspaceId: workspace.id,
        keyword,
        blogType: args.blogType,
        includeImage: args.includeImage,
        voice,
        industry: workspace.industry,
        icp: workspace.icp,
      });
      created.push({ id: result.draftId, title: result.title, keyword });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[content-bulk] keyword "${keyword}" failed: ${msg}`);
      if (!firstError) firstError = `"${keyword}": ${msg}`;
    }
  }

  revalidatePath("/content");
  revalidatePath("/agents/content");
  revalidatePath("/queue");

  if (created.length === 0) {
    return {
      ok: false,
      error: firstError ?? "All keywords failed to generate.",
    };
  }
  if (firstError && created.length < clean.length) {
    return { ok: true, created };
  }
  return { ok: true, created };
}
