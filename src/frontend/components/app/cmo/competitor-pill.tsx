"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * Render a competitor as a brand-favicon pill, matching the Okara
 * competitor row visual.
 *
 * Input string can be:
 *   - "jasper.ai"                       — bare domain
 *   - "Jasper AI"                        — brand name only (we resolve)
 *   - "Jasper AI (jasper.ai)"            — preferred: name + canonical domain
 *   - "https://www.jasper.ai/foo"        — full URL
 *
 * Resolution order for the lookup domain:
 *   1. domain inside parens, if any
 *   2. bare token that contains a TLD-looking dot
 *   3. curated brand-name → domain map (covers ~50 common SaaS/marketing tools)
 *   4. slug + ".com" fallback ("Surfer SEO" → "surferseo.com")
 *
 * Favicon comes from Google's free service (https://www.google.com/s2/favicons).
 * Falls back to a coloured initial if the icon fails to load.
 */
export function CompetitorPill({
  competitor,
  size = "md",
}: {
  competitor: string;
  size?: "sm" | "md";
}) {
  const { name, domain } = parseCompetitor(competitor);
  const [imgOk, setImgOk] = useState(true);
  const px = size === "sm" ? 14 : 18;
  const containerSize = size === "sm" ? "h-6" : "h-7";
  const textSize = size === "sm" ? "text-[11px]" : "text-xs";

  const href = domain ? `https://${domain}` : undefined;
  const Wrapper: React.ElementType = href ? "a" : "span";
  const wrapperProps = href
    ? { href, target: "_blank", rel: "noreferrer noopener" }
    : {};

  return (
    <Wrapper
      title={domain ? `${name} · ${domain}` : name}
      className={`inline-flex ${containerSize} items-center gap-1.5 rounded-md border bg-background pl-1.5 pr-2 ${textSize} font-medium text-foreground transition-colors ${href ? "hover:border-primary/40 hover:bg-primary/5" : "opacity-80"}`}
      {...wrapperProps}
    >
      <span
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted"
        style={{ width: px, height: px }}
      >
        {imgOk && domain ? (
          <Image
            src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`}
            alt=""
            width={px}
            height={px}
            unoptimized
            className="h-full w-full object-cover"
            onError={() => setImgOk(false)}
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center text-[9px] font-semibold uppercase text-muted-foreground"
            aria-hidden
          >
            {(name[0] ?? "?").toUpperCase()}
          </span>
        )}
      </span>
      <span className="max-w-[12ch] truncate">{name}</span>
    </Wrapper>
  );
}

function parseCompetitor(raw: string): { name: string; domain: string | null } {
  const input = raw.trim();
  if (!input) return { name: raw, domain: null };

  // 1. "Name (domain.tld)" — preferred Claude output format
  const parenMatch = input.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const name = parenMatch[1].trim();
    const domain = stripScheme(parenMatch[2]).split("/")[0]?.toLowerCase() ?? null;
    if (domain && /\./.test(domain)) return { name, domain };
  }

  // 2. Already a URL or bare domain like "jasper.ai" / "https://jasper.ai/foo"
  const stripped = stripScheme(input);
  const firstToken = stripped.split("/")[0];
  if (firstToken && /\.[a-z]{2,}$/i.test(firstToken)) {
    // If the whole input is just the domain, use the bare domain as the name too
    // — otherwise the display would look like "jasper.ai · jasper.ai".
    const isPureDomain = stripped === firstToken || stripped === firstToken + "/";
    return {
      name: isPureDomain ? firstToken.replace(/^www\./, "") : input,
      domain: firstToken.toLowerCase().replace(/^www\./, ""),
    };
  }

  // 3. Curated map for the most common SaaS / marketing brands the strategy
  //    LLM tends to mention. Keys are normalized (lowercase, alphanumeric).
  const normalized = input.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mapped = BRAND_DOMAIN_MAP[normalized];
  if (mapped) return { name: input, domain: mapped };

  // 4. Last-resort heuristic: slugify + ".com". Wrong for some (jasper.ai,
  //    notion.so, etc.) but better than no favicon at all.
  if (normalized.length === 0) return { name: input, domain: null };
  return { name: input, domain: `${normalized}.com` };
}

function stripScheme(s: string): string {
  return s
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}

/**
 * Common SaaS / marketing-tool brand → domain map.
 * Keys are normalised (lowercase, alphanumeric only) so "Jasper AI" and
 * "jasper-ai" both resolve. Extend freely — bigger map = more accurate
 * logos before the LLM-supplied parenthetical kicks in.
 */
const BRAND_DOMAIN_MAP: Record<string, string> = {
  // AI writing / content
  jasperai: "jasper.ai",
  jasper: "jasper.ai",
  copyai: "copy.ai",
  copyaiio: "copy.ai",
  writesonic: "writesonic.com",
  rytr: "rytr.me",
  notion: "notion.so",
  notionai: "notion.so",
  grammarly: "grammarly.com",

  // SEO tools
  ahrefs: "ahrefs.com",
  semrush: "semrush.com",
  surferseo: "surferseo.com",
  surfer: "surferseo.com",
  moz: "moz.com",
  ubersuggest: "neilpatel.com",
  screamingfrog: "screamingfrog.co.uk",
  clearscope: "clearscope.io",
  marketmuse: "marketmuse.com",
  contentking: "contentkingapp.com",
  sistrix: "sistrix.com",
  serpwoo: "serpwoo.com",

  // Marketing platforms
  hubspot: "hubspot.com",
  hubspotmarketing: "hubspot.com",
  hubspotmarketinghub: "hubspot.com",
  marketo: "marketo.com",
  mailchimp: "mailchimp.com",
  klaviyo: "klaviyo.com",
  convertkit: "kit.com",
  activecampaign: "activecampaign.com",

  // Web / product
  vercel: "vercel.com",
  netlify: "netlify.com",
  cloudflare: "cloudflare.com",
  stripe: "stripe.com",
  shopify: "shopify.com",
  webflow: "webflow.com",
  wix: "wix.com",
  squarespace: "squarespace.com",
  wordpress: "wordpress.com",

  // Analytics
  googleanalytics: "marketingplatform.google.com",
  ga4: "marketingplatform.google.com",
  mixpanel: "mixpanel.com",
  amplitude: "amplitude.com",
  posthog: "posthog.com",
  segment: "segment.com",
  plausible: "plausible.io",
  fathom: "usefathom.com",

  // Social / community
  buffer: "buffer.com",
  hootsuite: "hootsuite.com",
  later: "later.com",
  sproutsocial: "sproutsocial.com",
  circle: "circle.so",
  discord: "discord.com",
  slack: "slack.com",

  // Search / dev infra
  algolia: "algolia.com",
  typesense: "typesense.org",
  meilisearch: "meilisearch.com",

  // AI labs / providers
  openai: "openai.com",
  anthropic: "anthropic.com",
  perplexity: "perplexity.ai",
  cohere: "cohere.com",
  mistral: "mistral.ai",
  mistralai: "mistral.ai",
  google: "google.com",
  meta: "meta.com",
  microsoft: "microsoft.com",
  apple: "apple.com",

  // Indian-context shopping (just in case)
  flipkart: "flipkart.com",
  amazonin: "amazon.in",
  amazon: "amazon.com",
  myntra: "myntra.com",
  meesho: "meesho.com",
  nykaa: "nykaa.com",
  zomato: "zomato.com",
  swiggy: "swiggy.com",
};
