import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { GenericAgentPage } from "@/frontend/components/app/generic-agent-page";
import { hasLinkedInApifyToken } from "@/integrations/linkedin-apify";
import { LinkedinLogo } from "@/frontend/components/brand-logos";
import { PersonaCard } from "@/frontend/components/app/persona-card";
import { LinkedInComposer } from "./composer";
import { LinkedInTools } from "./linkedin-tools";

export const metadata = { title: "LinkedIn Agent" };

/** Best-effort brand guess for the company-insights default input. */
function brandSlugFromUrl(url: string | null): string {
  if (!url) return "";
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname;
    const core = host.replace(/^www\./, "").split(".")[0];
    return core ? `https://www.linkedin.com/company/${core}` : "";
  } catch {
    return "";
  }
}

/**
 * Default target for the company-posts tool. Prefer the LinkedIn handle the
 * user saved in their social handles (the AI CMO "socials" section) so the
 * agent uses the correct page instead of a guess from the website domain.
 */
function defaultCompanyTarget(workspace: {
  websiteUrl: string | null;
  voiceProfile: unknown;
}): string {
  const handle = (
    workspace.voiceProfile as { socialHandles?: { linkedin?: string } } | null
  )?.socialHandles?.linkedin;
  if (handle && handle.trim()) return handle.trim();
  return brandSlugFromUrl(workspace.websiteUrl);
}

export default async function LinkedInAgentPage() {
  const { workspace } = await requireWorkspace();
  const [drafts, runs] = await Promise.all([
    prisma.contentDraft.findMany({
      where: { workspaceId: workspace.id, agent: "linkedin" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.agentRun.findMany({
      where: { workspaceId: workspace.id, agent: "linkedin" },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <GenericAgentPage
      title="LinkedIn Agent"
      description="Scrape competitor posts and prospect profiles, then draft brand-voice content and personalized outreach. You publish."
      icon={LinkedinLogo}
      agentId="linkedin"
      drafts={drafts}
      runs={runs}
      connected
      extras={
        <div className="space-y-6">
          <LinkedInTools
            defaultCompany={defaultCompanyTarget(workspace)}
            hasApifyToken={hasLinkedInApifyToken()}
          />
          <PersonaCard initialPersona={workspace.persona ?? null} />
          <LinkedInComposer />
        </div>
      }
    />
  );
}
