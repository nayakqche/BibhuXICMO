import {
  BarChart3,
  Handshake,
  MessageSquare,
  Search,
  Youtube,
} from "lucide-react";
import { ModuleStubPage } from "@/frontend/components/app/module-stub-page";

export const metadata = { title: "YouTube Creators — Xicmo" };

export default function YoutubeCreatorsPage() {
  return (
    <ModuleStubPage
      title="YouTube Creators"
      tagline="Find · evaluate · negotiate with the right channels"
      description="Discover YouTube creators whose audience overlaps your ICP, get fit-scored matches with engagement + price benchmarks, and run end-to-end outreach from initial pitch to signed brand deal — all without leaving Xicmo."
      icon={Youtube}
      capabilities={[
        {
          title: "Niche-aware search",
          body: "Filter creators by topic, geo, audience age, recent upload cadence, and estimated CPM — backed by SocialBlade + first-party transcript indexing.",
          icon: Search,
        },
        {
          title: "Fit + ROI score",
          body: "Each channel gets a score combining audience overlap with your buyer keywords, recent sponsorship density, and 30-day view trend.",
          icon: BarChart3,
        },
        {
          title: "Auto-drafted outreach",
          body: "Claude writes the first-touch DM in your brand voice, suggests a sponsorship price band, and handles the negotiation thread until handoff.",
          icon: MessageSquare,
        },
        {
          title: "Contract + payment",
          body: "Generate the IO / SOW, collect deliverables, and release escrow milestones — Stripe Connect powered.",
          icon: Handshake,
        },
      ]}
      primaryCta={{ label: "Open AI CMO", href: "/agent/cmo" }}
    />
  );
}
