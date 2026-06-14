import { cookies } from "next/headers";
import { auth } from "./auth";
import { prisma } from "./db";

/** Auth.js / NextAuth session cookie names (http + https). */
const AUTH_SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
] as const;

export type SessionUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

/** Drop stale JWT cookies without calling Auth.js signOut (unsafe during RSC render). */
export async function clearAuthSessionCookies() {
  const jar = await cookies();
  for (const name of AUTH_SESSION_COOKIES) {
    jar.delete(name);
  }
}

/**
 * Returns the signed-in user only when the JWT maps to a real database row.
 * Clears orphaned cookies when the session outlives the database (e.g. after
 * a DATABASE_URL migration).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, image: true },
    });

    if (!user) {
      await clearAuthSessionCookies();
      return null;
    }

    return {
      id: user.id,
      name: user.name ?? session.user.name ?? null,
      email: user.email,
      image: user.image,
    };
  } catch (err) {
    console.error("[session] database lookup failed:", err);
    return null;
  }
}
