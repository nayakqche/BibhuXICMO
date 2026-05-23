import {
  BarChart3,
  Camera,
  Handshake,
  Instagram,
  Search,
} from "lucide-react";
import { ModuleStubPage } from "@/frontend/components/app/module-stub-page";

export const metadata = { title: "Instagram Influencers — Xicmo" };

export default function InstagramInfluencersPage() {
  return (
    <ModuleStubPage
      title="Instagram Influencers"
      tagline="Discover · vet · negotiate creators that actually move sales"
      description="Source Instagram creators by niche, location, and audience demographics. We fetch real engagement rates (not vanity follower counts), fit-score the match against your ICP, and run negotiations end-to-end."
      icon={Instagram}
      capabilities={[
        {
          title: "Smart discovery",
          body: "Filter by niche, language, country, follower band, true ER, and recent brand-deal density. Surface creators your competitors are already working with.",
          icon: Search,
        },
        {
          title: "Audience-quality score",
          body: "Detect bot followers, sudden growth spikes, and engagement pods. Score each creator on real reach × audience-buyer-overlap.",
          icon: BarChart3,
        },
        {
          title: "Content brief generator",
          body: "Claude writes a creator-friendly brief with hooks, do/don'ts, and 3 caption variants — locked to your brand voice and CTA.",
          icon: Camera,
        },
        {
          title: "Outreach + deal close",
          body: "DM drafts in the creator's preferred tone, automated follow-ups, price negotiation, and final IO + payment — all from one thread.",
          icon: Handshake,
        },
      ]}
      primaryCta={{ label: "Open AI CMO", href: "/agent/cmo" }}
    />
  );
}
