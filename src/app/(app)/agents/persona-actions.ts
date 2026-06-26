"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";

const schema = z.object({
  // Generous cap — a pasted brand doc plus a few extracted text files.
  // Anything longer is almost certainly noise; the prompt builder also
  // clips to 4k chars at generation time.
  persona: z.string().max(20000).optional(),
});

/**
 * Save the workspace persona used to steer LinkedIn / X / Instagram post
 * generation. Stores the combined text the user pasted plus any text the
 * client extracted from uploaded files. Empty string clears it.
 */
export async function savePersonaAction(
  persona: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { workspace } = await requireWorkspace({ skipOnboardingCheck: true });
  const parsed = schema.safeParse({ persona });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid persona" };
  }

  const value = parsed.data.persona?.trim() || null;
  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { persona: value },
  });

  // Refresh the agent pages that read persona so the saved state shows.
  revalidatePath("/agents/linkedin");
  revalidatePath("/agents/x");
  revalidatePath("/agents/instagram");
  return { ok: true };
}
