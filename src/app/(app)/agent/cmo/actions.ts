"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireWorkspace } from "@/backend/workspace";
import { CMO_SLOW_TAG } from "@/backend/agents/cmo-data";
import { clearCmoSlowCache } from "@/backend/cmo-slow-cache";

/**
 * Force-refresh the AI CMO "Loading site signals" panel.
 *
 * Drops both cache layers — the DB-persisted snapshot on
 * `Workspace.cmoSlowSnapshot` AND any lingering Next.js route cache —
 * then revalidates the CMO route so the next render fetches fresh
 * data. Useful right after a deploy when the user wants up-to-date
 * PageSpeed scores without waiting for the 24h TTL.
 */
export async function refreshCmoSlowDataAction(): Promise<{
  ok: true;
}> {
  const { workspace } = await requireWorkspace();
  await clearCmoSlowCache(workspace.id);
  revalidateTag(CMO_SLOW_TAG);
  revalidatePath("/agent/cmo");
  return { ok: true };
}
