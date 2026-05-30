/**
 * IMAP inbox reading for the auto-negotiator.
 *
 * Mirrors the reference `auto_negotiator.py` inbox logic: connect over IMAP,
 * pull recent + unseen messages from the last 7 days, extract a clean plain-text
 * body (stripping quoted replies), and expose a stable body hash + message id
 * for duplicate detection.
 */
import { createHash } from "crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export type InboundMessage = {
  messageId: string;
  fromEmail: string;
  subject: string;
  body: string;
  date: Date | null;
};

/** IMAP host for a given email provider (Gmail/Workspace → imap.gmail.com). */
export function imapConfigForEmail(email: string): { host: string; port: number } {
  const domain = (email.split("@")[1] ?? "").toLowerCase();
  if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live")) {
    return { host: "imap-mail.outlook.com", port: 993 };
  }
  if (domain.includes("yahoo")) return { host: "imap.mail.yahoo.com", port: 993 };
  if (domain.includes("zoho")) return { host: "imap.zoho.com", port: 993 };
  // Gmail, Google Workspace custom domains, and unknowns default to Gmail IMAP.
  return { host: "imap.gmail.com", port: 993 };
}

/** Strip quoted history so we only keep the creator's new text. */
export function cleanReplyBody(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith(">")) break;
    if (/wrote:\s*$/i.test(t)) break;
    if (/^On .+ wrote:$/i.test(t)) break;
    if (t.startsWith("From:") && t.includes("@")) break;
    if (t.includes("-----Original Message-----")) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

export function bodyHash(body: string): string {
  const normalized = body.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
  return createHash("md5").update(normalized).digest("hex");
}

function extractAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

/**
 * Fetch recent inbound messages from an account's inbox. SMTP password doubles
 * as the IMAP password (Gmail app passwords work for both).
 */
export async function fetchRecentInbound(args: {
  email: string;
  password: string;
  sinceDays?: number;
  limit?: number;
}): Promise<InboundMessage[]> {
  const cfg = imapConfigForEmail(args.email);
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: { user: args.email, pass: args.password },
    logger: false,
    socketTimeout: 30_000,
  });

  const out: InboundMessage[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - (args.sinceDays ?? 7) * 86_400_000);
      const found = await client.search({ since });
      const uids = Array.isArray(found) ? found : [];
      const list = uids.slice(-(args.limit ?? 80));
      for await (const msg of client.fetch(list, { source: true, envelope: true })) {
        if (!msg.source) continue;
        let parsed;
        try {
          parsed = await simpleParser(msg.source);
        } catch {
          continue;
        }
        const fromEmail = parsed.from?.value?.[0]?.address ??
          extractAddress(parsed.from?.text ?? "");
        const subject = parsed.subject ?? "";
        const rawText = parsed.text ?? "";
        const body = cleanReplyBody(rawText);
        if (!body || body.length < 3) continue;
        const messageId =
          parsed.messageId ?? msg.envelope?.messageId ?? `uid-${msg.uid}`;
        out.push({
          messageId,
          fromEmail: (fromEmail ?? "").toLowerCase(),
          subject,
          body,
          date: parsed.date ?? null,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}
