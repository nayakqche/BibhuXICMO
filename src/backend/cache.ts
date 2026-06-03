/**
 * Lightweight Redis-backed cache for external API results.
 *
 * Read order for cached tools: Redis → Postgres (Supabase) → live API.
 * Falls back to per-process memory when Redis is unavailable.
 */
import { getRedis } from "@/backend/redis";

type MemEntry = { value: string; expiresAt: number };
const mem = new Map<string, MemEntry>();

const PREFIX = "cache:";

function memGet(key: string): string | null {
  const e = mem.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    mem.delete(key);
    return null;
  }
  return e.value;
}

function memSet(key: string, value: string, ttlSeconds: number): void {
  mem.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  if (mem.size > 1000) {
    const oldest = mem.keys().next().value;
    if (oldest) mem.delete(oldest);
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const k = PREFIX + key;
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(k);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {
      /* fall through */
    }
  }
  const raw = memGet(k);
  return raw != null ? (JSON.parse(raw) as T) : null;
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  const k = PREFIX + key;
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return;
  }
  memSet(k, serialized, ttlSeconds);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(k, serialized, "EX", Math.max(1, Math.floor(ttlSeconds)));
    } catch {
      /* in-memory copy already stored */
    }
  }
}

export async function cacheDel(key: string): Promise<void> {
  const k = PREFIX + key;
  mem.delete(k);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(k);
    } catch {
      /* ignore */
    }
  }
}

export async function remember<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await fn();
  if (value !== null && value !== undefined) {
    await cacheSet(key, value, ttlSeconds);
  }
  return value;
}
