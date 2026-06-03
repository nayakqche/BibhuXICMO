import { Queue } from "bullmq";
import { getRedisConnection } from "@/backend/redis";

export { getRedisConnection };

export type AgentJob = {
  agentId: string;
  workspaceId: string;
  input?: unknown;
};

export type EmailJob = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export const agentQueueName = "agent-runs";
export const emailQueueName = "email";
export const publishQueueName = "publish";

export type PublishJob = {
  workspaceId: string;
  draftId: string;
};

let _agentQueue: Queue<AgentJob> | null = null;
let _emailQueue: Queue<EmailJob> | null = null;
let _publishQueue: Queue<PublishJob> | null = null;

export function agentQueue() {
  if (!_agentQueue) {
    _agentQueue = new Queue<AgentJob>(agentQueueName, {
      connection: getRedisConnection(),
    });
  }
  return _agentQueue;
}

export function emailQueue() {
  if (!_emailQueue) {
    _emailQueue = new Queue<EmailJob>(emailQueueName, {
      connection: getRedisConnection(),
    });
  }
  return _emailQueue;
}

export function publishQueue() {
  if (!_publishQueue) {
    _publishQueue = new Queue<PublishJob>(publishQueueName, {
      connection: getRedisConnection(),
    });
  }
  return _publishQueue;
}

export async function enqueueAgentRun(
  agentId: string,
  workspaceId: string,
  input?: unknown
) {
  return agentQueue().add(`${agentId}:${workspaceId}`, {
    agentId,
    workspaceId,
    input,
  });
}
