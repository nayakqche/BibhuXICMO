import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { env } from "@/shared/env";
import { type YTCreatorView } from "./creator-search";
import {
  YouTubeSuite,
  type AccountView,
  type CampaignView,
  type ContactView,
} from "./youtube-suite";

export const metadata = { title: "YouTube Creator Outreach — Xicmo" };
/** Apify discovery runs are async (polled), but the initial page load is cheap. */
export const dynamic = "force-dynamic";

/** Swallow "table not migrated yet" so the page renders on a fresh DB. */
function ignoreMissingTable<T>(p: Promise<T>, fallback: T): Promise<T> {
  return p.catch((err) => {
    const code = (err as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") return fallback;
    throw err;
  });
}

export default async function YouTubeAgentPage() {
  const { workspace } = await requireWorkspace();

  const [creatorRows, accountRows, campaignRows, contactRows] = await Promise.all([
    ignoreMissingTable(
      prisma.yTCreator.findMany({
        where: { workspaceId: workspace.id },
        orderBy: [{ isCreator: "desc" }, { qualityScore: "desc" }, { subscribers: "desc" }],
        take: 200,
      }),
      [] as Awaited<ReturnType<typeof prisma.yTCreator.findMany>>
    ),
    ignoreMissingTable(
      prisma.emailAccount.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "asc" },
      }),
      [] as Awaited<ReturnType<typeof prisma.emailAccount.findMany>>
    ),
    ignoreMissingTable(
      prisma.emailCampaign.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" },
        include: {
          outreach: {
            orderBy: { createdAt: "desc" },
            include: { thread: { orderBy: { createdAt: "asc" } } },
          },
        },
      }),
      [] as never[]
    ),
    ignoreMissingTable(
      prisma.mailingContact.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" },
      }),
      [] as Awaited<ReturnType<typeof prisma.mailingContact.findMany>>
    ),
  ]);

  const creators: YTCreatorView[] = creatorRows.map((r) => ({
    id: r.id,
    channelId: r.channelId,
    handle: r.handle,
    title: r.title,
    description: r.description,
    subscribers: r.subscribers,
    videoCount: r.videoCount,
    viewCount: r.viewCount !== null ? r.viewCount.toString() : null,
    country: r.country,
    language: r.language,
    category: r.category,
    email: r.email,
    thumbnailUrl: r.thumbnailUrl,
    channelUrl: r.channelUrl,
    isVerified: r.isVerified,
    isCreator: r.isCreator,
    qualityScore: r.qualityScore,
    detectionNote: r.detectionNote,
    lastContactAt: r.lastContactAt,
  }));

  const accounts: AccountView[] = accountRows.map((a) => ({
    id: a.id,
    email: a.email,
    displayName: a.displayName,
    sentToday: a.sentToday,
    dailyLimit: a.dailyLimit,
    isActive: a.isActive,
  }));

  const campaigns: CampaignView[] = campaignRows.map((c) => ({
    id: c.id,
    name: c.name,
    brief: c.brief,
    topic: c.topic,
    budgetMin: c.budgetMin,
    budgetMax: c.budgetMax,
    maxOffer: c.maxOffer,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    outreach: c.outreach.map((o) => ({
      id: o.id,
      recipientName: o.recipientName,
      recipientEmail: o.recipientEmail,
      status: o.status,
      negotiationStage: o.negotiationStage,
      currentOffer: o.currentOffer,
      subject: o.subject,
      replyContent: o.replyContent,
      aiResponse: o.aiResponse,
      thread: o.thread.map((m) => ({
        direction: m.direction,
        subject: m.subject,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    })),
  }));

  const contacts: ContactView[] = contactRows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    status: c.status,
  }));

  const hasApiKey = Boolean(env.YOUTUBE_API_KEY);

  return (
    <div className="container mx-auto max-w-6xl py-6">
      <YouTubeSuite
        creators={creators}
        hasApiKey={hasApiKey}
        accounts={accounts}
        campaigns={campaigns}
        contacts={contacts}
      />
    </div>
  );
}
