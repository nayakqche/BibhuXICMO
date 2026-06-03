import type { MetadataRoute } from "next";
import { env } from "@/shared/env";

const BASE = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

/** Public marketing + legal routes for search engines. */
const STATIC_ROUTES = [
  "",
  "/pricing",
  "/blog",
  "/changelog",
  "/help",
  "/contact",
  "/affiliates",
  "/careers",
  "/tools",
  "/tools/site-audit",
  "/privacy",
  "/terms",
  "/cookies",
  "/acceptable-use",
  "/subprocessors",
  "/refund",
  "/login",
  "/register",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return STATIC_ROUTES.map((path) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: path === "" || path === "/pricing" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path.startsWith("/privacy") || path.startsWith("/terms") ? 0.5 : 0.7,
  }));
}
