/**
 * Single shared Redis connection for BullMQ, API-result cache, and rate limiting.
 * One pool = fewer connections on Render's free Redis tier.
 */
import IORedis from "ioredis";
import { env } from "@/shared/env";

let _redis: IORedis | null | undefined;

/** Returns null when REDIS_URL is unset (dev without Redis). */
export function getRedis(): IORedis | null {
  if (_redis !== undefined) return _redis;
  const url = env.REDIS_URL?.trim();
  if (!url) {
    _redis = null;
    return null;
  }
  try {
    _redis = new IORedis(url, {
      // BullMQ requires null; safe for cache + rate-limit too.
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    _redis.on("error", (err) => {
      if ("code" in err && (err as { code?: string }).code === "ECONNREFUSED") return;
      console.warn("[redis]", err.message);
    });
    return _redis;
  } catch {
    _redis = null;
    return null;
  }
}

/** BullMQ queues always need a connection object; callers must handle offline gracefully. */
export function getRedisConnection(): IORedis {
  const r = getRedis();
  if (!r) {
    throw new Error("REDIS_URL is not configured");
  }
  return r;
}
