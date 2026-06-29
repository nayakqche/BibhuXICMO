/**
 * Platform-admin gate. There's no super-admin role in the schema, so admin
 * access is granted by email allow-list. `ADMIN_EMAILS` (comma-separated) is the
 * source of truth; when unset we fall back to `BACKLINKS_NOTIFY_EMAIL` so the
 * operator who receives order notifications can always reach the admin views.
 */
import { env } from "@/shared/env";

function adminEmailSet(): Set<string> {
  const raw = env.ADMIN_EMAILS?.trim() || env.BACKLINKS_NOTIFY_EMAIL;
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmailSet().has(email.trim().toLowerCase());
}
