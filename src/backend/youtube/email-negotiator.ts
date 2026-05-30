/**
 * Auto-negotiator: the brain that runs every 5 minutes.
 *
 * Ported from the reference `auto_negotiator.py`:
 *   1. Check each active account's inbox for creator replies.
 *   2. Classify each reply and respond automatically — accept, counter (within
 *      budget), send a final max offer, or politely decline / say goodbye.
 *   3. Send at most 2 follow-ups when a creator hasn't replied yet.
 *
 * Terminal deals (closed / rejected / declined) are never emailed again.
 */
import type { EmailAccount, EmailCampaign, EmailOutreach } from "@prisma/client";
import { prisma } from "@/backend/db";
import {
  sendWithAccount,
  getAvailableEmailAccount,
  decryptSmtpSecret,
} from "./email-smtp";
import { fetchRecentInbound, bodyHash } from "./email-imap";
import {
  analyzeReply,
  calculateCounterOffer,
  renderNegotiation,
  renderAcceptance,
  renderFinalOffer,
  renderGoodbye,
  renderFollowup,
  renderDeclineOverBudget,
} from "./email-ai";

const TERMINAL_STAGES = new Set([
  "deal_closed",
  "rejected",
  "rejected_over_budget",
  "declined",
]);

export function isTerminalStage(stage: string): boolean {
  return TERMINAL_STAGES.has(stage);
}

function senderName(account: EmailAccount): string {
  return account.displayName?.trim() || "Marketing Team";
}

async function addThread(
  outreachId: string,
  direction: "inbound" | "outbound",
  subject: string,
  body: string
) {
  await prisma.emailThreadMessage.create({
    data: { outreachId, direction, subject, body },
  });
}

async function markProcessed(
  workspaceId: string,
  messageId: string,
  fromEmail: string,
  subject: string,
  hash: string
) {
  await prisma.processedEmail
    .create({
      data: { workspaceId, messageId, fromEmail, subject, bodyHash: hash },
    })
    .catch(() => {
      /* unique violation = already processed */
    });
}

// ---------------------------------------------------------------------------
// Reply processing
// ---------------------------------------------------------------------------

export async function processReply(args: {
  workspaceId: string;
  outreach: EmailOutreach & { campaign: EmailCampaign };
  replyBody: string;
  fromEmail: string;
  messageId: string;
}): Promise<{ status: string }> {
  const { workspaceId, outreach, replyBody, fromEmail, messageId } = args;
  const subject = outreach.subject;
  const hash = bodyHash(replyBody);

  if (isTerminalStage(outreach.negotiationStage)) {
    await markProcessed(workspaceId, messageId, fromEmail, subject, hash);
    return { status: "skipped_terminal" };
  }

  const campaign = outreach.campaign;
  const maxOffer = campaign.maxOffer || campaign.budgetMax || 500;
  const budgetMin = campaign.budgetMin || 100;
  let currentOffer = outreach.currentOffer || 0;
  if (currentOffer === 0) currentOffer = budgetMin;
  let rounds = outreach.negotiationRounds || 0;

  await markProcessed(workspaceId, messageId, fromEmail, subject, hash);
  await addThread(outreach.id, "inbound", `Re: ${subject}`, replyBody);

  await prisma.emailOutreach.update({
    where: { id: outreach.id },
    data: { status: "replied", replyContent: replyBody, lastInboundAt: new Date() },
  });
  await prisma.mailingContact.updateMany({
    where: { workspaceId, outreachId: outreach.id },
    data: { status: "replied" },
  });

  const account = await getAvailableEmailAccount(workspaceId);
  if (!account) return { status: "no_account" };
  const sender = senderName(account);

  const analysis = await analyzeReply({
    workspaceId,
    replyText: replyBody,
    currentOffer,
    maxOffer,
    budgetMin,
  });

  // Rejection
  if (analysis.rejected) {
    const body = renderGoodbye(sender);
    const sent = await sendWithAccount({ accountId: account.id, to: fromEmail, subject: `Re: ${subject}`, body });
    if (sent.ok) await addThread(outreach.id, "outbound", `Re: ${subject}`, body);
    await prisma.emailOutreach.update({
      where: { id: outreach.id },
      data: { negotiationStage: "rejected", aiResponse: body, lastOutboundAt: new Date() },
    });
    return { status: "rejected" };
  }

  // Acceptance at current offer
  if (analysis.accepted) {
    const body = renderAcceptance(currentOffer, sender);
    const sent = await sendWithAccount({ accountId: account.id, to: fromEmail, subject: `Re: ${subject} - Confirmed!`, body });
    if (sent.ok) await addThread(outreach.id, "outbound", `Re: ${subject} - Confirmed!`, body);
    await prisma.emailOutreach.update({
      where: { id: outreach.id },
      data: { negotiationStage: "deal_closed", aiResponse: body, lastOutboundAt: new Date() },
    });
    return { status: "deal_closed" };
  }

  // Counter-offer / negotiation
  rounds += 1;
  const decision = calculateCounterOffer({
    currentOffer,
    creatorAsk: analysis.requestedAmount,
    budgetMin,
    maxOffer,
    round: rounds,
  });

  if (decision.action === "accept") {
    const body = renderAcceptance(decision.offer, sender);
    const sent = await sendWithAccount({ accountId: account.id, to: fromEmail, subject: `Re: ${subject} - Confirmed!`, body });
    if (sent.ok) await addThread(outreach.id, "outbound", `Re: ${subject} - Confirmed!`, body);
    await prisma.emailOutreach.update({
      where: { id: outreach.id },
      data: {
        negotiationStage: "deal_closed",
        aiResponse: body,
        currentOffer: decision.offer,
        negotiationRounds: rounds,
        lastOutboundAt: new Date(),
      },
    });
    return { status: "deal_closed" };
  }

  if (decision.action === "decline") {
    const body = renderDeclineOverBudget(analysis.requestedAmount ?? maxOffer, maxOffer, sender);
    const sent = await sendWithAccount({ accountId: account.id, to: fromEmail, subject: `Re: ${subject}`, body });
    if (sent.ok) await addThread(outreach.id, "outbound", `Re: ${subject}`, body);
    await prisma.emailOutreach.update({
      where: { id: outreach.id },
      data: { negotiationStage: "rejected_over_budget", aiResponse: body, lastOutboundAt: new Date() },
    });
    return { status: "declined_over_budget" };
  }

  if (decision.action === "final_offer") {
    const body = renderFinalOffer(decision.offer, sender);
    const sent = await sendWithAccount({ accountId: account.id, to: fromEmail, subject: `Re: ${subject}`, body });
    if (sent.ok) await addThread(outreach.id, "outbound", `Re: ${subject}`, body);
    await prisma.emailOutreach.update({
      where: { id: outreach.id },
      data: {
        negotiationStage: "final_offer",
        aiResponse: body,
        currentOffer: decision.offer,
        negotiationRounds: rounds,
        lastOutboundAt: new Date(),
      },
    });
    return { status: "final_offer_sent" };
  }

  // Normal counter
  const body = renderNegotiation(decision.offer, sender);
  const sent = await sendWithAccount({ accountId: account.id, to: fromEmail, subject: `Re: ${subject}`, body });
  if (sent.ok) await addThread(outreach.id, "outbound", `Re: ${subject}`, body);
  await prisma.emailOutreach.update({
    where: { id: outreach.id },
    data: {
      negotiationStage: "negotiating",
      aiResponse: body,
      currentOffer: decision.offer,
      negotiationRounds: rounds,
      lastOutboundAt: new Date(),
    },
  });
  return { status: "negotiating" };
}

// ---------------------------------------------------------------------------
// Follow-ups (max 2, only when no reply yet)
// ---------------------------------------------------------------------------

function shouldSendFollowup(o: EmailOutreach): boolean {
  if (o.status !== "sent") return false; // replied/draft never get follow-ups
  if (o.lastInboundAt) return false;
  if ((o.followupCount ?? 0) >= 2) return false;
  if (isTerminalStage(o.negotiationStage)) return false;
  if (!o.lastOutboundAt) return false;
  const hours = (Date.now() - new Date(o.lastOutboundAt).getTime()) / 3_600_000;
  return hours >= 2 && hours <= 6;
}

async function sendFollowup(workspaceId: string, o: EmailOutreach): Promise<boolean> {
  const account = await getAvailableEmailAccount(workspaceId);
  if (!account) return false;
  const body = renderFollowup(senderName(account));
  const sent = await sendWithAccount({
    accountId: account.id,
    to: o.recipientEmail,
    subject: `Re: ${o.subject}`,
    body,
  });
  if (!sent.ok) return false;
  await addThread(o.id, "outbound", `Re: ${o.subject}`, body);
  await prisma.emailOutreach.update({
    where: { id: o.id },
    data: { followupCount: { increment: 1 }, lastOutboundAt: new Date() },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

export async function runAutoNegotiator(
  workspaceId: string
): Promise<{ repliesProcessed: number; followupsSent: number }> {
  let repliesProcessed = 0;
  let followupsSent = 0;

  const accounts = await prisma.emailAccount.findMany({
    where: { workspaceId, isActive: true },
  });

  // 1. Inbox check + reply handling.
  for (const account of accounts) {
    let inbound;
    try {
      inbound = await fetchRecentInbound({
        email: account.email,
        password: decryptSmtpSecret(account.smtpPassword),
        sinceDays: 7,
        limit: 80,
      });
    } catch (err) {
      console.warn(`[email-negotiator] inbox check failed for ${account.email}:`, err);
      continue;
    }

    for (const msg of inbound) {
      const already = await prisma.processedEmail.findUnique({
        where: { workspaceId_messageId: { workspaceId, messageId: msg.messageId } },
      });
      if (already) continue;

      const outreach = await prisma.emailOutreach.findFirst({
        where: {
          workspaceId,
          recipientEmail: msg.fromEmail,
          status: { in: ["sent", "replied"] },
        },
        include: { campaign: true },
        orderBy: { createdAt: "desc" },
      });
      if (!outreach) {
        await markProcessed(workspaceId, msg.messageId, msg.fromEmail, msg.subject, bodyHash(msg.body));
        continue;
      }
      try {
        await processReply({
          workspaceId,
          outreach,
          replyBody: msg.body,
          fromEmail: msg.fromEmail,
          messageId: msg.messageId,
        });
        repliesProcessed += 1;
      } catch (err) {
        console.warn(`[email-negotiator] processReply failed:`, err);
      }
    }
  }

  // 2. Follow-ups for un-answered outreach.
  if (accounts.length > 0) {
    const pending = await prisma.emailOutreach.findMany({
      where: { workspaceId, status: "sent" },
      take: 100,
    });
    for (const o of pending) {
      if (shouldSendFollowup(o)) {
        const ok = await sendFollowup(workspaceId, o);
        if (ok) followupsSent += 1;
      }
    }
  }

  return { repliesProcessed, followupsSent };
}
