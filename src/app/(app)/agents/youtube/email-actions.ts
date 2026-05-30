"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import {
  resolveSmtp,
  smtpConfigForEmail,
  testSmtpConnection,
  encryptSmtpSecret,
  decryptSmtpSecret,
  sendWithAccount,
  getAvailableEmailAccount,
  type SmtpProvider,
} from "@/backend/youtube/email-smtp";
import { generateOutreachEmail } from "@/backend/youtube/email-ai";
import { runAutoNegotiator } from "@/backend/youtube/email-negotiator";

type Ok<T = unknown> = { ok: true } & T;
type Err = { ok: false; error: string };
type Result<T = unknown> = Ok<T> | Err;

function revalidate() {
  revalidatePath("/agents/youtube");
}

// ===========================================================================
// Email accounts
// ===========================================================================

export async function addEmailAccountAction(args: {
  provider: SmtpProvider;
  email: string;
  password: string;
  displayName?: string;
  dailyLimit?: number;
  smtpHost?: string;
  smtpPort?: number;
  skipTest?: boolean;
}): Promise<Result> {
  const { workspace } = await requireWorkspace();
  const email = args.email.trim().toLowerCase();
  if (!email || !args.password.trim()) {
    return { ok: false, error: "Email and password are required." };
  }
  const { host, port, user } = resolveSmtp({
    provider: args.provider,
    email,
    smtpHost: args.smtpHost,
    smtpPort: args.smtpPort,
  });

  if (!args.skipTest) {
    const test = await testSmtpConnection({ host, port, user, pass: args.password });
    if (!test.ok) return { ok: false, error: test.message };
  }

  await prisma.emailAccount.upsert({
    where: { workspaceId_email: { workspaceId: workspace.id, email } },
    create: {
      workspaceId: workspace.id,
      email,
      smtpHost: host,
      smtpPort: port,
      smtpUser: user,
      smtpPassword: encryptSmtpSecret(args.password),
      displayName: args.displayName?.trim() || null,
      dailyLimit: Math.max(1, Math.min(args.dailyLimit ?? 100, 2000)),
    },
    update: {
      smtpHost: host,
      smtpPort: port,
      smtpUser: user,
      smtpPassword: encryptSmtpSecret(args.password),
      displayName: args.displayName?.trim() || null,
      dailyLimit: Math.max(1, Math.min(args.dailyLimit ?? 100, 2000)),
      isActive: true,
    },
  });
  revalidate();
  return { ok: true };
}

export async function bulkAddEmailAccountsAction(args: {
  text: string;
}): Promise<Result<{ added: number; failed: number; errors: string[] }>> {
  const { workspace } = await requireWorkspace();
  const lines = args.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let added = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    const email = (parts[0] ?? "").toLowerCase();
    if (!email.includes("@")) {
      failed += 1;
      errors.push(`Invalid: ${line.slice(0, 30)}`);
      continue;
    }
    let host: string;
    let port: number;
    let pass: string;
    if (parts.length >= 4) {
      host = parts[1]!;
      port = Number(parts[2]) || 587;
      pass = parts[3]!;
    } else if (parts.length === 2) {
      const cfg = smtpConfigForEmail(email);
      host = cfg.host;
      port = cfg.port;
      pass = parts[1]!;
    } else {
      failed += 1;
      errors.push(`Invalid format: ${line.slice(0, 30)}`);
      continue;
    }
    const test = await testSmtpConnection({ host, port, user: email, pass });
    if (!test.ok) {
      failed += 1;
      errors.push(`${email}: ${test.message}`);
      continue;
    }
    try {
      await prisma.emailAccount.upsert({
        where: { workspaceId_email: { workspaceId: workspace.id, email } },
        create: {
          workspaceId: workspace.id,
          email,
          smtpHost: host,
          smtpPort: port,
          smtpUser: email,
          smtpPassword: encryptSmtpSecret(pass),
        },
        update: { smtpHost: host, smtpPort: port, smtpUser: email, smtpPassword: encryptSmtpSecret(pass), isActive: true },
      });
      added += 1;
    } catch {
      failed += 1;
      errors.push(`${email}: save failed`);
    }
  }
  revalidate();
  return { ok: true, added, failed, errors };
}

export async function testEmailAccountAction(args: { id: string }): Promise<Result> {
  const { workspace } = await requireWorkspace();
  const acc = await prisma.emailAccount.findFirst({
    where: { id: args.id, workspaceId: workspace.id },
  });
  if (!acc) return { ok: false, error: "Account not found." };
  const test = await testSmtpConnection({
    host: acc.smtpHost,
    port: acc.smtpPort,
    user: acc.smtpUser,
    pass: decryptSmtpSecret(acc.smtpPassword),
  });
  return test.ok ? { ok: true } : { ok: false, error: test.message };
}

export async function deleteEmailAccountAction(args: { id: string }): Promise<Result> {
  const { workspace } = await requireWorkspace();
  await prisma.emailAccount.deleteMany({ where: { id: args.id, workspaceId: workspace.id } });
  revalidate();
  return { ok: true };
}

// ===========================================================================
// Campaigns
// ===========================================================================

export async function createCampaignAction(args: {
  name: string;
  brief?: string;
  topic?: string;
  budgetMin?: number;
  budgetMax?: number;
  maxOffer?: number;
  requirements?: string;
  deadline?: string;
}): Promise<Result<{ id: string }>> {
  const { workspace } = await requireWorkspace();
  if (!args.name.trim()) return { ok: false, error: "Campaign name is required." };
  const budgetMax = Math.max(0, args.budgetMax ?? 0);
  const c = await prisma.emailCampaign.create({
    data: {
      workspaceId: workspace.id,
      name: args.name.trim(),
      brief: args.brief?.trim() || null,
      topic: args.topic?.trim() || null,
      budgetMin: Math.max(0, args.budgetMin ?? 0),
      budgetMax,
      maxOffer: Math.max(args.maxOffer ?? budgetMax, budgetMax),
      requirements: args.requirements?.trim() || null,
      deadline: args.deadline?.trim() || null,
      status: "active",
    },
  });
  revalidate();
  return { ok: true, id: c.id };
}

export async function deleteCampaignAction(args: { id: string }): Promise<Result> {
  const { workspace } = await requireWorkspace();
  await prisma.emailCampaign.deleteMany({ where: { id: args.id, workspaceId: workspace.id } });
  revalidate();
  return { ok: true };
}

/** Parse "Name, email" (or bare email) lines into {name,email}. */
function parseContacts(text: string): Array<{ name: string; email: string }> {
  const out: Array<{ name: string; email: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.split(",").map((p) => p.trim());
    let name = "";
    let email = "";
    if (parts.length >= 2 && parts[1]!.includes("@")) {
      name = parts[0]!;
      email = parts[1]!;
    } else {
      const found = parts.find((p) => p.includes("@"));
      email = found ?? "";
      name = email ? email.split("@")[0]! : "";
    }
    if (email.includes("@")) out.push({ name, email: email.toLowerCase() });
  }
  return out;
}

export async function addCreatorsToCampaignAction(args: {
  campaignId: string;
  text: string;
}): Promise<Result<{ added: number }>> {
  const { workspace } = await requireWorkspace();
  const campaign = await prisma.emailCampaign.findFirst({
    where: { id: args.campaignId, workspaceId: workspace.id },
  });
  if (!campaign) return { ok: false, error: "Campaign not found." };

  const contacts = parseContacts(args.text);
  if (contacts.length === 0) return { ok: false, error: "No valid contacts found." };

  const senderName = workspace.name || "Marketing Team";
  let added = 0;
  for (const c of contacts) {
    const exists = await prisma.emailOutreach.findFirst({
      where: { campaignId: campaign.id, recipientEmail: c.email },
    });
    if (exists) continue;
    const email = await generateOutreachEmail({
      workspaceId: workspace.id,
      recipientName: c.name,
      campaignName: campaign.name,
      brief: campaign.brief ?? "",
      topic: campaign.topic ?? "",
      budgetMin: campaign.budgetMin,
      budgetMax: campaign.budgetMax,
      requirements: campaign.requirements ?? undefined,
      deadline: campaign.deadline ?? undefined,
      senderName,
    });
    await prisma.emailOutreach.create({
      data: {
        workspaceId: workspace.id,
        campaignId: campaign.id,
        recipientName: c.name || null,
        recipientEmail: c.email,
        subject: email.subject,
        body: email.body,
        status: "draft",
        currentOffer: campaign.budgetMin,
      },
    });
    added += 1;
  }
  revalidate();
  return { ok: true, added };
}

export async function startCampaignAction(args: {
  campaignId: string;
}): Promise<Result<{ sent: number; failed: number }>> {
  const { workspace } = await requireWorkspace();
  const campaign = await prisma.emailCampaign.findFirst({
    where: { id: args.campaignId, workspaceId: workspace.id },
  });
  if (!campaign) return { ok: false, error: "Campaign not found." };

  const account = await getAvailableEmailAccount(workspace.id);
  if (!account) {
    return { ok: false, error: "Add an active email account first (and stay under its daily limit)." };
  }

  const drafts = await prisma.emailOutreach.findMany({
    where: { campaignId: campaign.id, status: "draft" },
    take: 100,
  });
  if (drafts.length === 0) return { ok: false, error: "No draft outreach to send. Add creators first." };

  let sent = 0;
  let failed = 0;
  for (const o of drafts) {
    const res = await sendWithAccount({
      accountId: account.id,
      to: o.recipientEmail,
      subject: o.subject,
      body: o.body,
    });
    if (res.ok) {
      await prisma.emailOutreach.update({
        where: { id: o.id },
        data: {
          status: "sent",
          emailAccountId: account.id,
          sentAt: new Date(),
          lastOutboundAt: new Date(),
          currentOffer: o.currentOffer || campaign.budgetMin,
        },
      });
      await prisma.emailThreadMessage.create({
        data: { outreachId: o.id, direction: "outbound", subject: o.subject, body: o.body },
      });
      sent += 1;
    } else {
      failed += 1;
    }
  }
  revalidate();
  return { ok: true, sent, failed };
}

export async function checkInboxNowAction(): Promise<Result<{ repliesProcessed: number; followupsSent: number }>> {
  const { workspace } = await requireWorkspace();
  try {
    const res = await runAutoNegotiator(workspace.id);
    revalidate();
    return { ok: true, ...res };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Inbox check failed." };
  }
}

// ===========================================================================
// Mailing list
// ===========================================================================

export async function addMailingContactsAction(args: {
  single?: { name: string; email: string; notes?: string };
  text?: string;
}): Promise<Result<{ added: number }>> {
  const { workspace } = await requireWorkspace();
  const contacts: Array<{ name: string; email: string; notes?: string }> = [];
  if (args.single?.email?.includes("@")) {
    contacts.push({
      name: args.single.name,
      email: args.single.email.toLowerCase(),
      notes: args.single.notes,
    });
  }
  if (args.text) {
    contacts.push(...parseContacts(args.text));
  }
  if (contacts.length === 0) return { ok: false, error: "No valid contacts." };

  let added = 0;
  for (const c of contacts) {
    await prisma.mailingContact.create({
      data: {
        workspaceId: workspace.id,
        name: c.name || null,
        email: c.email,
        notes: c.notes || null,
        status: "pending",
      },
    });
    added += 1;
  }
  revalidate();
  return { ok: true, added };
}

export async function removeMailingContactAction(args: { id: string }): Promise<Result> {
  const { workspace } = await requireWorkspace();
  await prisma.mailingContact.deleteMany({ where: { id: args.id, workspaceId: workspace.id } });
  revalidate();
  return { ok: true };
}

export async function clearMailingListAction(): Promise<Result> {
  const { workspace } = await requireWorkspace();
  await prisma.mailingContact.deleteMany({ where: { workspaceId: workspace.id } });
  revalidate();
  return { ok: true };
}

export async function bulkSendMailingAction(args: {
  campaignId: string;
}): Promise<Result<{ sent: number; failed: number }>> {
  const { workspace } = await requireWorkspace();
  const campaign = await prisma.emailCampaign.findFirst({
    where: { id: args.campaignId, workspaceId: workspace.id },
  });
  if (!campaign) return { ok: false, error: "Select a valid campaign." };

  const account = await getAvailableEmailAccount(workspace.id);
  if (!account) return { ok: false, error: "Add an active email account first." };

  const pending = await prisma.mailingContact.findMany({
    where: { workspaceId: workspace.id, status: "pending" },
    take: 100,
  });
  if (pending.length === 0) return { ok: false, error: "No pending contacts to send to." };

  const senderName = account.displayName || workspace.name || "Marketing Team";
  let sent = 0;
  let failed = 0;
  for (const contact of pending) {
    const email = await generateOutreachEmail({
      workspaceId: workspace.id,
      recipientName: contact.name ?? "",
      campaignName: campaign.name,
      brief: campaign.brief ?? "",
      topic: campaign.topic ?? "",
      budgetMin: campaign.budgetMin,
      budgetMax: campaign.budgetMax,
      requirements: campaign.requirements ?? undefined,
      deadline: campaign.deadline ?? undefined,
      senderName,
    });
    const outreach = await prisma.emailOutreach.create({
      data: {
        workspaceId: workspace.id,
        campaignId: campaign.id,
        recipientName: contact.name,
        recipientEmail: contact.email,
        subject: email.subject,
        body: email.body,
        status: "draft",
        currentOffer: campaign.budgetMin,
      },
    });
    const res = await sendWithAccount({
      accountId: account.id,
      to: contact.email,
      subject: email.subject,
      body: email.body,
    });
    if (res.ok) {
      await prisma.emailOutreach.update({
        where: { id: outreach.id },
        data: { status: "sent", emailAccountId: account.id, sentAt: new Date(), lastOutboundAt: new Date() },
      });
      await prisma.emailThreadMessage.create({
        data: { outreachId: outreach.id, direction: "outbound", subject: email.subject, body: email.body },
      });
      await prisma.mailingContact.update({
        where: { id: contact.id },
        data: { status: "sent", campaignId: campaign.id, outreachId: outreach.id },
      });
      sent += 1;
    } else {
      failed += 1;
    }
  }
  revalidate();
  return { ok: true, sent, failed };
}
