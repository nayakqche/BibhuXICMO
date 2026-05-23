import {
  Filter,
  Link2,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { ModuleStubPage } from "@/frontend/components/app/module-stub-page";

export const metadata = { title: "Backlink Marketplace — Xicmo" };

export default function BacklinkMarketplacePage() {
  return (
    <ModuleStubPage
      title="Backlink Marketplace"
      tagline="Buy clean, contextual, niche-matched backlinks in one click"
      description="Browse vetted publishers across 60+ niches, filter by Domain Rating, traffic, country, and price, then buy guest posts or contextual link placements with built-in escrow + topical relevance scoring."
      icon={Link2}
      capabilities={[
        {
          title: "Filter by DR · traffic · niche",
          body: "Live Ahrefs DR, organic traffic, topical-trust score, country share, and live spam-flag — filter to exactly the publisher profile you want.",
          icon: Filter,
        },
        {
          title: "Topical-relevance match",
          body: "Claude reads your site + the publisher's recent posts and ranks each placement by topical fit (so you don't waste budget on irrelevant DR-90 placements).",
          icon: TrendingUp,
        },
        {
          title: "Escrow + verified placement",
          body: "Pay into escrow; funds release only after the link is live, indexed by Google, and dofollow-verified. Refund if removed within 6 months.",
          icon: ShieldCheck,
        },
        {
          title: "One-click checkout",
          body: "Add picks to cart, approve the anchor + content brief, and we handle the publisher coordination. Bulk-buy discounts at 5+ placements.",
          icon: ShoppingCart,
        },
      ]}
      primaryCta={{ label: "Open SEO Agent", href: "/agents/seo" }}
    />
  );
}
