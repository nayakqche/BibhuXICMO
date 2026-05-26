"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireWorkspace } from "@/backend/workspace";
import { CMO_SLOW_TAG } from "@/backend/agents/cmo-data";

/**
 * Force-refresh the AI CMO "Loading site signals" panel.
 *
 * Drops the cached homepage scrape, PageSpeed scores, GSC + GA4 query
 * results, then revalidates the CMO route so the next render fetches
 * fresh data. Useful when the user just deployed a site change and
 * doesn't want to wait for the (1–6h) TTL to expire.
 */
export async function refreshCmoSlowDataAction(): Promise<{
  ok: true;
}> {
  await requireWorkspace();
  revalidateTag(CMO_SLOW_TAG);
  revalidatePath("/agent/cmo");
  return { ok: true };
}
