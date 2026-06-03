/**
 * Rate limiting for API routes.
 * Uses the shared Redis connection when REDIS_URL is set; otherwise in-memory.
 */

import { getRedis } from "@/backend/redis";

type Bucket = { tokens: number; last: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number };

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  const refillPerMs = limit / windowMs;
  const b = buckets.get(key) ?? { tokens: limit, last: now };
  const elapsed = now - b.last;
  b.tokens = Math.min(limit, b.tokens + elapsed * refillPerMs);
  b.last = now;

  if (b.tokens < 1) {
    buckets.set(key, b);
    return { ok: false, retryAfterMs: Math.ceil((1 - b.tokens) / refillPerMs) };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return { ok: true, remaining: Math.floor(b.tokens) };
}

async function rateLimitRedis(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return rateLimit(key, { limit, windowMs });

  const redisKey = `rl:api:${key}`;
  const n = await redis.incr(redisKey);
  if (n === 1) {
    await redis.pexpire(redisKey, windowMs);
  }
  if (n > limit) {
    const pttl = await redis.pttl(redisKey);
    return {
      ok: false,
      retryAfterMs: pttl > 0 ? pttl : windowMs,
    };
  }
  return { ok: true, remaining: Math.max(0, limit - n) };
}

export async function rateLimitAsync(
  key: string,
  opts: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) {
    return rateLimit(key, opts);
  }
  try {
    return await rateLimitRedis(key, opts);
  } catch (e) {
    console.warn("[rate-limit] Redis error, using memory:", e);
    return rateLimit(key, opts);
  }
}

export function ipKey(req: Request, prefix: string): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || "unknown";
  return `${prefix}:${ip}`;
}
