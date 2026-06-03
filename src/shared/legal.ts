import { CONTACT, SITE_DOMAIN, SITE_NAME } from "@/shared/site";

/** Bump when legal copy changes materially. */
export const LEGAL_LAST_UPDATED = "June 3, 2026";

export const LEGAL_ENTITY = SITE_NAME;

export const LEGAL_JURISDICTION =
  "These policies are governed by the laws applicable where " +
  `${SITE_NAME} operates, without regard to conflict-of-law rules.`;

export const SUBPROCESSORS = [
  { name: "Stripe", purpose: "Payment processing", location: "United States / EU" },
  { name: "Resend", purpose: "Transactional email", location: "United States" },
  { name: "Supabase", purpose: "Database hosting", location: "United States / EU" },
  { name: "Render", purpose: "Application hosting & Redis", location: "United States" },
  { name: "OpenAI", purpose: "LLM inference (when configured)", location: "United States" },
  { name: "Anthropic", purpose: "LLM inference (when configured)", location: "United States" },
  { name: "Google", purpose: "OAuth, GA4, GSC, PageSpeed, YouTube API", location: "United States" },
  { name: "Apify", purpose: "Third-party data scraping (SEO, social agents)", location: "EU / US" },
] as const;

export { CONTACT, SITE_DOMAIN, SITE_NAME, mailto } from "@/shared/site";
