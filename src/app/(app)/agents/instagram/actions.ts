"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import {
  clearIGCookies,
  saveIGCookies,
  loadIGCookies,
  hasIGCookies,
} from "@/backend/ig-cookies";
import {
  apifySendDM,
  apifyPollInbox,
  IGCookiesExpiredError,
} from "@/integrations/instagram-apify-dm";
import { upsertIGCreator } from "@/backend/agents/instagram-db";

const campaignSchema = z.object({
  name: z.string().min(1).max(120),
  brand: z.string().min(1).max(120),
  budgetMin: z.number().int().min(0).default(0),
  budgetMax: z.number().int().min(0).default(0),
  brief: z.string().max(2000).optional(),
  autopilot: z.boolean().default(false),
});

export async function createIGCampaignAction(input: unknown) {
  const { workspace } = await requireWorkspace();
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.budgetMax > 0 && parsed.data.budgetMax < parsed.data.budgetMin) {
    return { ok: false as const, error: "budgetMax must be >= budgetMin" };
  }
  try {
    const c = await prisma.iGCampaign.create({
      data: {
        workspaceId: workspace.id,
        name: parsed.data.name,
        brand: parsed.data.brand,
        budgetMin: parsed.data.budgetMin,
        budgetMax: parsed.data.budgetMax,
        brief: parsed.data.brief,
        autopilot: parsed.data.autopilot,
        status: "DRAFT",
      },
    });
    revalidatePath("/agents/instagram");
    return { ok: true as const, id: c.id };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "create_failed" };
  }
}

export async function updateIGCampaignStatusAction(
  campaignId: string,
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "CLOSED"
) {
  const { workspace } = await requireWorkspace();
  await prisma.iGCampaign.updateMany({
    where: { id: campaignId, workspaceId: workspace.id },
    data: { status },
  });
  revalidatePath("/agents/instagram");
  return { ok: true as const };
}

export async function toggleIGCampaignAutopilotAction(
  campaignId: string,
  autopilot: boolean
) {
  const { workspace } = await requireWorkspace();
  await prisma.iGCampaign.updateMany({
    where: { id: campaignId, workspaceId: workspace.id },
    data: { autopilot },
  });
  // Cascade flag to all open negotiations under this campaign.
  await prisma.iGNegotiation.updateMany({
    where: { campaignId, workspaceId: workspace.id },
    data: { autopilot },
  });
  revalidatePath("/agents/instagram");
  return { ok: true as const };
}

export async function deleteIGCampaignAction(campaignId: string) {
  const { workspace } = await requireWorkspace();
  await prisma.iGCampaign.deleteMany({
    where: { id: campaignId, workspaceId: workspace.id },
  });
  revalidatePath("/agents/instagram");
  return { ok: true as const };
}

export async function saveIGCookiesAction(cookies: string) {
  const { workspace } = await requireWorkspace();
  if (!cookies?.trim()) {
    return { ok: false as const, error: "Cookies cannot be empty" };
  }
  try {
    await saveIGCookies(workspace.id, cookies.trim());
    revalidatePath("/agents/instagram");
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "save_failed",
    };
  }
}

export async function clearIGCookiesAction() {
  const { workspace } = await requireWorkspace();
  await clearIGCookies(workspace.id);
  revalidatePath("/agents/instagram");
  return { ok: true as const };
}

// ===========================================================================
// Manual influencer add (Send DMs Now / Just Track) + test helpers
// ===========================================================================

type ParsedCreator = { handle: string; fullName: string | null };

function dedupeCreators(list: ParsedCreator[]): ParsedCreator[] {
  const seen = new Set<string>();
  const out: ParsedCreator[] = [];
  for (const c of list) {
    const k = c.handle.toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

function parseCreatorLines(text: string): ParsedCreator[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  const out: ParsedCreator[] = [];
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t) as Array<Record<string, unknown> | string>;
      for (const item of arr) {
        if (typeof item === "string") {
          const h = item.replace(/^@/, "").trim();
          if (h) out.push({ handle: h, fullName: null });
        } else if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          const h = String(o.username ?? o.handle ?? "").replace(/^@/, "").trim();
          const fn = (o.fullName ?? o.full_name ?? o.name) as string | undefined;
          if (h) out.push({ handle: h, fullName: fn ?? null });
        }
      }
      return dedupeCreators(out);
    } catch {
      /* fall through to line parsing */
    }
  }
  for (const line of t.split(/\r?\n/)) {
    const s2 = line.trim();
    if (!s2) continue;
    const [u, ...rest] = s2.split(",");
    const h = (u ?? "").replace(/^@/, "").trim();
    if (!h) continue;
    out.push({ handle: h, fullName: rest.join(",").trim() || null });
  }
  return dedupeCreators(out);
}

function firstNameOf(c: ParsedCreator): string {
  if (c.fullName) return c.fullName.split(/\s+/)[0] ?? c.handle;
  return c.handle;
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

function campaignVars(
  c: { brand: string; budgetMin: number; budgetMax: number },
  creator: ParsedCreator
): Record<string, string> {
  return {
    first_name: firstNameOf(creator),
    username: creator.handle,
    full_name: creator.fullName ?? creator.handle,
    followers: "",
    category: "",
    brand: c.brand,
    product: c.brand,
    collab_type: "paid collab",
    budget_min: String(c.budgetMin),
    budget_max: String(c.budgetMax),
  };
}

export async function addInfluencersManualAction(input: {
  campaignId: string;
  creatorsText: string;
  mode: "send" | "track";
  messageTemplate?: string;
  firstMessage?: string;
  delaySeconds?: number;
  maxDms?: number;
  reDm?: boolean;
}) {
  const { workspace } = await requireWorkspace();
  const campaign = await prisma.iGCampaign.findFirst({
    where: { id: input.campaignId, workspaceId: workspace.id },
  });
  if (!campaign) return { ok: false as const, error: "Campaign not found" };

  const creators = parseCreatorLines(input.creatorsText);
  if (creators.length === 0) {
    return { ok: false as const, error: "Add at least one creator (one per line)." };
  }
  const maxDms = Math.min(Math.max(input.maxDms ?? 30, 1), 50);
  const delay = Math.min(Math.max(input.delaySeconds ?? 45, 0), 3600);
  const list = creators.slice(0, maxDms);

  if (input.mode === "send") {
    if (!(await hasIGCookies(workspace.id))) {
      return { ok: false as const, error: "Add your Instagram cookies in Settings first." };
    }
    if (!input.messageTemplate?.trim()) {
      return { ok: false as const, error: "Enter a message template." };
    }
  }
  if (input.mode === "track" && !input.firstMessage?.trim()) {
    return { ok: false as const, error: "Enter the first message you already sent." };
  }

  let added = 0;
  let sendIndex = 0;
  for (const c of list) {
    const creator = await upsertIGCreator({
      workspaceId: workspace.id,
      handle: c.handle,
      fullName: c.fullName,
      bio: null,
      followers: 0,
      engagementRate: null,
      profileUrl: `https://www.instagram.com/${c.handle}/`,
      fit: 0,
    });
    if (!creator) continue;

    const existing = await prisma.iGNegotiation.findUnique({
      where: { campaignId_creatorId: { campaignId: campaign.id, creatorId: creator.id } },
    });
    if (existing && !input.reDm) continue;

    const message =
      input.mode === "track"
        ? input.firstMessage!.trim()
        : renderTemplate(input.messageTemplate!, campaignVars(campaign, c));

    const prior = (existing?.messages as Array<Record<string, unknown>> | null) ?? [];
    const turn = { role: "us", text: message, sentAt: new Date().toISOString() };

    const neg = await prisma.iGNegotiation.upsert({
      where: { campaignId_creatorId: { campaignId: campaign.id, creatorId: creator.id } },
      create: {
        workspaceId: workspace.id,
        campaignId: campaign.id,
        creatorId: creator.id,
        status: "DM_SENT",
        autopilot: campaign.autopilot,
        lastMessageAt: new Date(),
        messages: [turn] as never,
      },
      update: {
        status: "DM_SENT",
        lastMessageAt: new Date(),
        messages: [...prior, turn] as never,
      },
    });

    if (input.mode === "send") {
      const when = new Date(Date.now() + sendIndex * delay * 1000);
      const draft = await prisma.contentDraft.create({
        data: {
          workspaceId: workspace.id,
          agent: "instagram",
          channel: "INSTAGRAM",
          title: `DM @${c.handle}`,
          body: message,
          meta: {
            igKind: "dm_outreach",
            recipient: c.handle,
            campaignId: campaign.id,
            negotiationId: neg.id,
          },
          status: "SCHEDULED",
          scheduledAt: when,
        },
      });
      await prisma.scheduledPost.create({
        data: {
          workspaceId: workspace.id,
          draftId: draft.id,
          channel: "INSTAGRAM",
          scheduledAt: when,
          status: "pending",
        },
      });
      sendIndex++;
    }
    added++;
  }

  revalidatePath("/agents/instagram");
  return { ok: true as const, added, mode: input.mode };
}

export async function previewDmsAction(input: {
  campaignId: string;
  creatorsText: string;
  messageTemplate: string;
}) {
  const { workspace } = await requireWorkspace();
  const campaign = await prisma.iGCampaign.findFirst({
    where: { id: input.campaignId, workspaceId: workspace.id },
  });
  if (!campaign) return { ok: false as const, error: "Campaign not found" };
  const creators = parseCreatorLines(input.creatorsText).slice(0, 3);
  if (creators.length === 0) return { ok: false as const, error: "Add creators to preview." };
  const samples = creators.map((c) => ({
    handle: c.handle,
    message: renderTemplate(input.messageTemplate, campaignVars(campaign, c)),
  }));
  return { ok: true as const, samples };
}

export async function sendTestDmAction(input: { username: string; message: string }) {
  const { workspace } = await requireWorkspace();
  const handle = input.username.replace(/^@/, "").trim();
  if (!handle) return { ok: false as const, error: "Enter a username." };
  const cookies = await loadIGCookies(workspace.id);
  if (!cookies) return { ok: false as const, error: "Add IG cookies first." };
  try {
    await apifySendDM({
      cookies,
      recipient: handle,
      message: input.message?.trim() || "Test DM from QuickAds — please ignore.",
    });
    return { ok: true as const };
  } catch (err) {
    if (err instanceof IGCookiesExpiredError) {
      return { ok: false as const, error: "IG cookies expired — re-add them." };
    }
    return { ok: false as const, error: err instanceof Error ? err.message : "Send failed" };
  }
}

export async function testIGCookiesAction() {
  const { workspace } = await requireWorkspace();
  const cookies = await loadIGCookies(workspace.id);
  if (!cookies) return { ok: false as const, error: "No cookies saved yet." };
  try {
    const inbox = await apifyPollInbox(cookies, { limit: 5 });
    return { ok: true as const, count: inbox.length };
  } catch (err) {
    if (err instanceof IGCookiesExpiredError) {
      return { ok: false as const, error: "IG cookies expired — re-add them." };
    }
    return { ok: false as const, error: err instanceof Error ? err.message : "Inbox check failed" };
  }
}
