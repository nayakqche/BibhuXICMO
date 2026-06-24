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
  const { name, domain, verified } = parseCompetitor(competitor);
  const [iconStep, setIconStep] = useState(0);
  const px = size === "sm" ? 14 : 18;
  const containerSize = size === "sm" ? "h-6" : "h-7";
  const textSize = size === "sm" ? "text-[11px]" : "text-xs";

  // Only treat a domain as linkable when we trust it (curated map, LLM
  // parenthetical, or a literal URL/domain in the input). The slug+".com"
  // fallback used to fabricate broken links like "fourthpartnerenergy.com"
  // when the real site is fourthpartner.co — so for unverified guesses we
  // route the click to a Google search instead and skip the favicon (which
  // would 404 anyway).
  const href = verified && domain
    ? `https://${domain}`
    : `https://www.google.com/search?q=${encodeURIComponent(name)}`;
  const showFavicon = verified && !!domain;
  const tooltip = verified && domain ? `${name} · ${domain}` : `${name} — search`;
  return (
    <a
      title={tooltip}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`inline-flex ${containerSize} items-center gap-1.5 rounded-md border bg-background pl-1.5 pr-2 ${textSize} font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5`}
    >
      <span
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted"
        style={{ width: px, height: px }}
      >
        {showFavicon && domain && iconStep < 2 ? (
          <Image
            src={
              iconStep === 0
                ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`
                : `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`
            }
            alt=""
            width={px}
            height={px}
            unoptimized
            className="h-full w-full object-cover"
            onError={() => setIconStep((step) => step + 1)}
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
    </a>
  );
}

/**
 * `verified` is true only when the domain came from a trusted source —
 * curated map, LLM parenthetical, or a literal URL/domain the caller
 * passed in. The old slug+".com" fallback fabricated broken links
 * (e.g. "Fourth Partner Energy" → fourthpartnerenergy.com when the real
 * site is fourthpartner.co), so we now mark that case unverified and
 * the pill routes clicks to a Google search instead.
 */
function parseCompetitor(raw: string): {
  name: string;
  domain: string | null;
  verified: boolean;
} {
  const input = raw.trim();
  if (!input) return { name: raw, domain: null, verified: false };

  // Split off the display name + any "(domain.tld)" the strategy LLM appended.
  let name = input;
  let parenDomain: string | null = null;
  const parenMatch = input.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    name = parenMatch[1].trim();
    const d = (stripScheme(parenMatch[2]).split("/")[0] ?? "").toLowerCase().replace(/^www\./, "");
    if (/\./.test(d)) parenDomain = d;
  }

  // 1. Curated map is hand-verified, so it WINS over the LLM's parenthetical
  //    guess (which is often wrong, e.g. "Atria (atria.ai)" → tryatria.com).
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mapped = BRAND_DOMAIN_MAP[normalized];
  if (mapped) return { name, domain: mapped, verified: true };

  // 2. Otherwise trust the LLM-supplied parenthetical domain.
  if (parenDomain) return { name, domain: parenDomain, verified: true };

  // 3. Bare domain / full URL input ("jasper.ai" / "https://jasper.ai/foo").
  const stripped = stripScheme(input);
  const firstToken = stripped.split("/")[0];
  if (firstToken && /\.[a-z]{2,}$/i.test(firstToken)) {
    const isPureDomain = stripped === firstToken || stripped === firstToken + "/";
    return {
      name: isPureDomain ? firstToken.replace(/^www\./, "") : input,
      domain: firstToken.toLowerCase().replace(/^www\./, ""),
      verified: true,
    };
  }

  // 4. Last-resort: name only, no fabricated domain. The pill will link to
  //    a Google search for `name` and skip the favicon.
  return { name: input, domain: null, verified: false };
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
  // Ad-creative / creative-analytics competitors
  atria: "tryatria.com",
  tryatria: "tryatria.com",
  adcreative: "adcreative.ai",
  adcreativeai: "adcreative.ai",
  canva: "canva.com",
  foreplay: "foreplay.co",
  foreplayco: "foreplay.co",
  motion: "motionapp.com",
  motionapp: "motionapp.com",
  pencil: "trypencil.com",
  creatify: "creatify.ai",
  arcads: "arcads.ai",
  icon: "icon.com",

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

  // Renewable-energy / climate (Indian C&I + global). Domains below were
  // web-verified — don't add an entry here unless you've confirmed the
  // homepage resolves, otherwise the favicon service returns a generic
  // globe and the link 404s (the exact bug this map exists to prevent).
  fourthpartner: "fourthpartner.co",
  fourthpartnerenergy: "fourthpartner.co",
  ayana: "ayanapower.com",
  ayanapower: "ayanapower.com",
  ayanarenewable: "ayanapower.com",
  ayanarenewablepower: "ayanapower.com",
  renew: "renew.com",
  renewpower: "renew.com",
  renewenergy: "renew.com",
  greenko: "greenkogroup.com",
  greenkogroup: "greenkogroup.com",
  greenkoenergies: "greenkogroup.com",
  ampin: "ampin.energy",
  ampinenergy: "ampin.energy",
  ampinenergytransition: "ampin.energy",
  ampenergy: "ampin.energy",
  ampenergyindia: "ampin.energy",
  azurepower: "azurepower.com",
  azure: "azurepower.com",
  adanigreen: "adanigreenenergy.com",
  adanigreenenergy: "adanigreenenergy.com",
  adani: "adanigreenenergy.com",
  tatapower: "tatapower.com",
  acmesolar: "acme.in",
  acme: "acme.in",
  cleanmax: "cleanmax.com",
  cleanmaxsolar: "cleanmax.com",
  amplus: "amplussolar.com",
  amplussolar: "amplussolar.com",
  hexaclimate: "hexaclimate.com",
  hexa: "hexaclimate.com",
  avaada: "avaada.com",
  avaadaenergy: "avaada.com",
  avaadagroup: "avaada.com",
  waaree: "waaree.com",
  waareeenergies: "waaree.com",
  herofutureenergies: "herofutureenergies.com",
  hfe: "herofutureenergies.com",
  o2power: "o2power.in",
  continuum: "continuumenergy.in",
  continuumgreenenergy: "continuumenergy.in",
  continuumenergy: "continuumenergy.in",
  mahindrasusten: "mahindrasusten.com",
  susten: "mahindrasusten.com",
  sembcorp: "sembcorpindia.com",
  sembcorpgreeninfra: "sembcorpindia.com",
  sembcorpindia: "sembcorpindia.com",
  statkraft: "statkraft.com",
  engie: "engie.com",
  suzlon: "suzlon.com",
  inoxwind: "inoxwind.com",
  inox: "inoxwind.com",
  juniper: "junipergreenenergy.com",
  junipergreen: "junipergreenenergy.com",
  junipergreenenergy: "junipergreenenergy.com",
  ntpc: "ntpc.co.in",
  ntpcgreen: "ntpcgreenenergy.com",
  ntpcgreenenergy: "ntpcgreenenergy.com",

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
