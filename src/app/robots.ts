import type { MetadataRoute } from "next";
import { env } from "@/shared/env";

const BASE = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/agents/",
          "/agent/",
          "/settings",
          "/billing",
          "/content/",
          "/integrations/",
          "/onboarding",
          "/queue",
          "/actions",
          "/chat",
          "/api/",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
