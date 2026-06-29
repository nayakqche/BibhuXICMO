/**
 * Generic outbound SMTP sender (Hostinger by default). Used for transactional
 * notifications that should come from the project's own mailbox rather than
 * Resend — e.g. "new paid backlink order".
 *
 * Mirrors `src/backend/email.ts`'s `sendEmail`: a no-op (with a warning) when
 * SMTP credentials aren't configured, so callers never have to guard.
 */
import nodemailer from "nodemailer";
import { env } from "@/shared/env";

let _transport: nodemailer.Transporter | null = null;

export function smtpReady(): boolean {
  return Boolean(env.SMTP_HOST?.trim() && env.SMTP_USER?.trim() && env.SMTP_PASS?.trim());
}

function getTransport(): nodemailer.Transporter | null {
  if (_transport) return _transport;
  if (!smtpReady()) return null;
  _transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return _transport;
}

export async function sendSmtpEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ sent: true } | { skipped: true }> {
  const transport = getTransport();
  if (!transport) {
    console.warn(
      `[smtp] SMTP_USER/SMTP_PASS not set, would have sent to ${args.to}: ${args.subject}`
    );
    return { skipped: true };
  }
  const from = env.SMTP_FROM?.trim() || env.SMTP_USER!;
  await transport.sendMail({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text ?? stripHtml(args.html),
  });
  return { sent: true };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
