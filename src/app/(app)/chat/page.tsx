import { requireWorkspace } from "@/backend/workspace";
import { prisma } from "@/backend/db";
import { Chat } from "./chat-client";

export const metadata = { title: "Private Chat" };

export default async function ChatPage(props: {
  searchParams: Promise<{ session?: string; prompt?: string }>;
}) {
  const { workspace, user } = await requireWorkspace({ skipOnboardingCheck: true });
  const { session: sessionId, prompt } = await props.searchParams;

  const sessions = await prisma.chatSession.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: { id: true, title: true, updatedAt: true },
  });

  let initialMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (sessionId) {
    const s = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (s) {
      initialMessages = s.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        }));
    }
  }

  return (
    <Chat
      sessions={sessions.map((s) => ({
        id: s.id,
        title: s.title ?? "Untitled",
        updatedAt: s.updatedAt.toISOString(),
      }))}
      activeSessionId={sessionId}
      initialMessages={initialMessages}
      initialInput={prompt ?? ""}
    />
  );
}
