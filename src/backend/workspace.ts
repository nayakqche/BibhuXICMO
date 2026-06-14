import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "./db";
import { seedFreeCredits } from "./credits";
import { slugify } from "@/shared/utils";
import type { Prisma } from "@prisma/client";

export type WorkspaceWithSubscription = Prisma.WorkspaceGetPayload<{
  include: { subscription: true };
}>;

type MembershipWithWorkspace = Prisma.WorkspaceMemberGetPayload<{
  include: { workspace: { include: { subscription: true } }; user: true };
}>;

/**
 * OAuth sign-in only creates a User row (via the Auth adapter). Email/password
 * signup creates a workspace in registerAction. Without this helper, OAuth users
 * hit /onboarding with no membership and `requireWorkspace` redirected to
 * /onboarding again — an infinite reload loop.
 */
export async function ensureUserWorkspace(
  userId: string,
  displayName?: string | null
): Promise<MembershipWithWorkspace> {
  const existing = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      workspace: { include: { subscription: true } },
      user: true,
    },
  });
  if (existing) return existing;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User ${userId} not found`);

  const label =
    displayName?.trim() ||
    user.name?.trim() ||
    user.email?.split("@")[0] ||
    "User";

  const baseSlug = slugify(label) || "workspace";
  let slug = baseSlug;
  let attempt = 1;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${attempt++}`;
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: `${label}'s workspace`,
      slug,
      ownerUserId: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
      subscription: { create: { plan: "FREE", status: "ACTIVE" } },
    },
  });

  await seedFreeCredits(workspace.id);

  return prisma.workspaceMember.findFirstOrThrow({
    where: { userId, workspaceId: workspace.id },
    include: {
      workspace: { include: { subscription: true } },
      user: true,
    },
  });
}

/**
 * Per-request cached lookup of the membership + workspace. Both `(app)/layout`
 * and the underlying page call `requireWorkspace()`; without `cache()` that
 * would mean two DB round-trips on every nav. React's `cache()` dedupes the
 * call within a single server request.
 */
const loadMembership = cache(async (userId: string) => {
  return prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      workspace: { include: { subscription: true } },
      user: true,
    },
  });
});

/**
 * Returns the current user's primary workspace, or redirects to /login.
 * If the user has no workspace yet, redirects to /onboarding.
 */
export async function requireWorkspace(
  opts: { skipOnboardingCheck?: boolean } = {}
): Promise<{
  user: { id: string; name: string | null; email: string; image: string | null };
  workspace: WorkspaceWithSubscription;
}> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  let membership = await loadMembership(session.user.id);
  if (!membership) {
    membership = await ensureUserWorkspace(session.user.id, session.user.name);
  }

  const workspace = membership.workspace;

  if (!opts.skipOnboardingCheck && !workspace.websiteUrl) {
    redirect("/onboarding");
  }

  return {
    user: {
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      image: membership.user.image,
    },
    workspace,
  };
}

export async function getCurrentWorkspace() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { workspace: { include: { subscription: true } } },
  });
  return membership?.workspace ?? null;
}
