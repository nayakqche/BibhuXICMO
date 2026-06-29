/**
 * Notification email sent to the operator when a backlink order is paid.
 * Summarises who submitted, the package, and every target URL + anchor so the
 * order can be fulfilled without opening the dashboard.
 */
import type { BacklinkOrder } from "@prisma/client";
import { env } from "@/shared/env";
import { formatUsd } from "@/shared/backlink-packages";
import { sendSmtpEmail } from "@/backend/smtp";

type LinkRow = { url?: string; anchorText?: string };

export async function notifyBacklinkOrderPaid(order: BacklinkOrder): Promise<void> {
  const links = Array.isArray(order.links) ? (order.links as LinkRow[]) : [];

  const rows = links
    .map(
      (l) =>
        `<tr>
          <td style="padding:6px 12px;border:1px solid #eee;font-family:monospace">${escapeHtml(
            l.url ?? ""
          )}</td>
          <td style="padding:6px 12px;border:1px solid #eee">${escapeHtml(
            l.anchorText ?? "(auto)"
          )}</td>
        </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f7f9;padding:24px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:12px;padding:28px">
      <h1 style="margin:0 0 4px;font-size:20px">New paid backlink order 🎉</h1>
      <p style="margin:0 0 20px;color:#555">
        <strong>${escapeHtml(order.packageLabel)}</strong> · ${formatUsd(order.amountUsdCents)} ${escapeHtml(
          order.currency
        )} · paid via ${escapeHtml(order.provider ?? "—")}
      </p>
      <table style="margin:0 0 16px;font-size:13px;color:#333">
        <tr><td style="padding:2px 12px 2px 0;color:#777">Order ID</td><td style="font-family:monospace">${escapeHtml(
          order.id
        )}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#777">Submitted by</td><td>${escapeHtml(
          order.contactEmail ?? "—"
        )}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#777">Backlinks</td><td>${order.backlinkCount}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#777">Payment ref</td><td style="font-family:monospace">${escapeHtml(
          order.providerPaymentId ?? "—"
        )}</td></tr>
      </table>
      <h2 style="margin:16px 0 8px;font-size:15px">Target URLs &amp; anchors</h2>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px 12px;border:1px solid #eee;background:#fafafa">URL</th>
            <th style="text-align:left;padding:6px 12px;border:1px solid #eee;background:#fafafa">Anchor text</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="2" style="padding:8px 12px;border:1px solid #eee;color:#999">No URLs provided</td></tr>`}</tbody>
      </table>
    </div>
  </body>
</html>`;

  await sendSmtpEmail({
    to: env.BACKLINKS_NOTIFY_EMAIL,
    subject: `New paid backlink order — ${order.packageLabel} (${formatUsd(order.amountUsdCents)})`,
    html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
