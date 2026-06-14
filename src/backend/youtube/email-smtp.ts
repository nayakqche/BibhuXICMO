/**
 * SMTP sending for the YouTube creator-outreach engine.
 *
 * Mirrors the reference `email_service.py`: connect a Gmail (app password),
 * SendGrid, or custom SMTP account, test the connection, and send outreach /
 * negotiation emails while respecting a per-account daily limit.
 *
 * App passwords / SMTP secrets are encrypted at rest using the same crypto the
 * IG cookie store uses.
 */
import nodemailer from "nodemailer";
import type { EmailAccount } from "@prisma/client";
import { prisma } from "@/backend/db";
import { encryptCookiesPayload, decryptCookiesPayload } from "@/backend/ig-cookies";

export type SmtpProvider = "gmail" | "sendgrid" | "custom";

type SmtpConfig = { host: string; port: number };

/** Auto-detect SMTP host/port from the email domain (custom provider). */
export function smtpConfigForEmail(email: string): SmtpConfig {
  const domain = (email.split("@")[1] ?? "").toLowerCase();
  if (domain.includes("gmail") || domain.includes("googlemail")) {
    return { host: "smtp.gmail.com", port: 587 };
  }
  if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live")) {
    return { host: "smtp.office365.com", port: 587 };
  }
  if (domain.includes("yahoo")) return { host: "smtp.mail.yahoo.com", port: 587 };
  if (domain.includes("zoho")) return { host: "smtp.zoho.com", port: 587 };
  return { host: `smtp.${domain || "gmail.com"}`, port: 587 };
}

/** Resolve host/port/user for a chosen provider. SendGrid always uses apikey user. */
export function resolveSmtp(args: {
  provider: SmtpProvider;
  email: string;
  smtpHost?: string;
  smtpPort?: number;
}): { host: string; port: number; user: string } {
  if (args.provider === "gmail") {
    return { host: "smtp.gmail.com", port: 587, user: args.email };
  }
  if (args.provider === "sendgrid") {
    return { host: "smtp.sendgrid.net", port: 587, user: "apikey" };
  }
  const detected = smtpConfigForEmail(args.email);
  return {
    host: args.smtpHost?.trim() || detected.host,
    port: args.smtpPort || detected.port,
    user: args.email,
  };
}

export function encryptSmtpSecret(plaintext: string): string {
  return encryptCookiesPayload(plaintext);
}

export function decryptSmtpSecret(blob: string): string {
  try {
    return decryptCookiesPayload(blob);
  } catch {
    // Tolerate legacy plaintext rows.
    return blob;
  }
}

function buildTransport(host: string, port: number, user: string, pass: string) {
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** Verify SMTP credentials without saving. Returns a friendly message. */
export async function testSmtpConnection(args: {
  host: string;
  port: number;
  user: string;
  pass: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const transport = buildTransport(args.host, args.port, args.user, args.pass);
    await transport.verify();
    return { ok: true, message: "Connection successful" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/auth/i.test(msg) || /credential/i.test(msg) || /5\.7\.8/.test(msg)) {
      return {
        ok: false,
        message:
          "Authentication failed. For Gmail use a 16-char App Password (not your normal password).",
      };
    }
    return { ok: false, message: `Connection error: ${msg.slice(0, 200)}` };
  }
}

/** Reset the daily counter if we've crossed into a new UTC day. */
function withDailyReset(acc: EmailAccount): EmailAccount {
  const last = acc.sentResetAt ? new Date(acc.sentResetAt) : new Date(0);
  const now = new Date();
  if (last.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10)) {
    return { ...acc, sentToday: 0 };
  }
  return acc;
}

/** Pick an active account that still has daily quota. */
export async function getAvailableEmailAccount(
  workspaceId: string
): Promise<EmailAccount | null> {
  const accounts = await prisma.emailAccount.findMany({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  for (const raw of accounts) {
    const acc = withDailyReset(raw);
    if (acc.sentToday < acc.dailyLimit) return raw;
  }
  return null;
}

export type SendResult = { ok: true } | { ok: false; error: string };

/** Send an email using a specific saved account; enforces the daily limit. */
export async function sendWithAccount(args: {
  accountId: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
}): Promise<SendResult> {
  const acc = await prisma.emailAccount.findUnique({ where: { id: args.accountId } });
  if (!acc) return { ok: false, error: "Email account not found" };
  if (!acc.isActive) return { ok: false, error: "Email account is not active" };

  // Daily limit (with rollover reset).
  const last = acc.sentResetAt ? new Date(acc.sentResetAt) : new Date(0);
  const today = new Date().toISOString().slice(0, 10);
  const isNewDay = last.toISOString().slice(0, 10) !== today;
  const sentToday = isNewDay ? 0 : acc.sentToday;
  if (sentToday >= acc.dailyLimit) {
    return { ok: false, error: `Daily limit reached (${acc.dailyLimit} emails)` };
  }

  const pass = decryptSmtpSecret(acc.smtpPassword);
  const fromName = acc.displayName?.trim();
  const from = fromName ? `"${fromName}" <${acc.email}>` : acc.email;

  try {
    const transport = buildTransport(acc.smtpHost, acc.smtpPort, acc.smtpUser, pass);
    await transport.sendMail({
      from,
      to: args.to,
      subject: args.subject,
      text: args.body,
      ...(args.html ? { html: args.html } : {}),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send error" };
  }

  await prisma.emailAccount.update({
    where: { id: acc.id },
    data: isNewDay
      ? { sentToday: 1, sentResetAt: new Date() }
      : { sentToday: { increment: 1 } },
  });
  return { ok: true };
}
