"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AtSign,
  Building2,
  ChevronDown,
  Facebook,
  FileText,
  Github,
  Instagram,
  Linkedin,
  Loader2,
  Megaphone,
  RefreshCw,
  Target,
  Twitter,
  Users,
  Youtube,
} from "lucide-react";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import { SiteQuickAdd } from "@/frontend/components/app/cmo/site-quick-add";
import { CompetitorPill } from "@/frontend/components/app/cmo/competitor-pill";
import { AutoRefreshWhenPending } from "@/frontend/components/app/cmo/auto-refresh-when-pending";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { forceReauditAction } from "@/app/(app)/settings/actions";
import type { CmoFastData, CmoSlowData } from "@/backend/agents/cmo-data";

type CompanyData = CmoFastData &
  Partial<Pick<CmoSlowData, "liveSnapshot" | "llmAnalysis">>;

type Section = "product" | "competitors" | "voice" | "strategy";

const SECTIONS: Array<{ id: Section; label: string; icon: typeof FileText }> = [
  { id: "product", label: "Product information", icon: FileText },
  { id: "competitors", label: "Competitor analysis", icon: Users },
  { id: "voice", label: "Brand voice", icon: Megaphone },
  { id: "strategy", label: "Marketing strategy", icon: Target },
];

export function CompanyPanel({ data }: { data: CompanyData }) {
  const [open, setOpen] = useState<Section | null>(null);
  const hasUrl = !!data.workspace.websiteUrl;
  const pending = hasUrl && isAnalysisPending(data);

  const description =
    data.liveSnapshot?.description?.trim() ||
    data.voice?.siteDescription?.trim() ||
    "Add your website and finish onboarding so agents can analyze your business.";

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-primary" aria-hidden />
          Company
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Add your handles so agents can learn your tone from public posts.
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 text-sm">
        <SiteQuickAdd
          workspaceName={data.workspace.name}
          currentUrl={data.workspace.websiteUrl}
        />

        {pending ? (
          <>
            <AutoRefreshWhenPending intervalMs={15000} />
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
            <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            <div className="space-y-0.5">
              <div className="font-semibold text-foreground">
                Analyzing {stripUrlScheme(data.workspace.websiteUrl ?? "")}…
              </div>
              <p className="text-muted-foreground">
                Claude is reading the site, picking competitors + social
                handles, and Apify is fetching Ahrefs metrics. Usually 30-60s.
                The page refreshes automatically when ready.
              </p>
            </div>
          </div>
          </>
        ) : null}

        <SocialHandlesRow voice={data.voice ?? null} />

        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>

        {data.voice?.positioning ? (
          <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Positioning
            </div>
            {data.voice.positioning}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Documents
          </div>
          {SECTIONS.map((s) => (
            <DocumentCard
              key={s.id}
              icon={s.icon}
              label={s.label}
              isReady={sectionHasContent(s.id, data)}
              isPending={pending && !sectionHasContent(s.id, data)}
              isOpen={open === s.id}
              onToggle={() => setOpen(open === s.id ? null : s.id)}
            >
              <DocumentBody section={s.id} data={data} pending={pending} hasUrl={hasUrl} />
            </DocumentCard>
          ))}
        </div>

        {data.topCompetitors.length > 0 ? (
          <div className="space-y-2 border-t pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Competitors
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.topCompetitors.map((c) => (
                <CompetitorPill key={c} competitor={c} size="sm" />
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DocumentCard({
  icon: Icon,
  label,
  isOpen,
  isReady,
  isPending,
  onToggle,
  children,
}: {
  icon: typeof FileText;
  label: string;
  isOpen: boolean;
  isReady?: boolean;
  isPending?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card transition-colors hover:border-border/80">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
        aria-expanded={isOpen}
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="flex-1 truncate">{label}</span>
        {isPending ? (
          <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
            <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
            Loading
          </span>
        ) : isReady ? (
          <span className="inline-flex items-center rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-500">
            new
          </span>
        ) : null}
        <ChevronDown
          className={
            "h-3.5 w-3.5 text-muted-foreground transition-transform " +
            (isOpen ? "rotate-180" : "")
          }
          aria-hidden
        />
      </button>
      {isOpen ? (
        <div className="border-t px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function sectionHasContent(section: Section, data: CompanyData): boolean {
  const v = data.voice;
  switch (section) {
    case "product":
      return !!(
        data.liveSnapshot?.description ||
        v?.siteDescription ||
        (v?.valueProps && v.valueProps.length > 0)
      );
    case "competitors":
      return !!(v?.competitors && v.competitors.length > 0);
    case "voice":
      return !!(v?.brandVoice?.tone || v?.tone || v?.positioning);
    case "strategy":
      return !!(v?.channels?.length || v?.topicClusters?.length);
  }
}

function SectionLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden />
      Loading {label}…
    </div>
  );
}

function ReloadButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 gap-1.5 px-2 text-[11px]"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await forceReauditAction();
          router.refresh();
        })
      }
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="h-3 w-3" aria-hidden />
      )}
      Reload
    </Button>
  );
}

function SectionFailed({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <AlertCircle className="h-3 w-3 text-amber-500" aria-hidden />
        Failed to load {label}.
      </div>
      <ReloadButton />
    </div>
  );
}

function DocumentBody({
  section,
  data,
  pending,
  hasUrl,
}: {
  section: Section;
  data: CompanyData;
  pending: boolean;
  hasUrl: boolean;
}) {
  const v = data.voice;
  switch (section) {
    case "product": {
      const desc =
        data.liveSnapshot?.description ||
        v?.siteDescription ||
        data.workspace.icp;
      const props = v?.valueProps ?? [];
      const enrich = data.llmAnalysis?.documentEnrichment;
      const hasAny =
        !!desc || props.length > 0 || !!enrich?.productBlurb || !!data.workspace.industry;
      if (!hasAny) {
        if (!hasUrl) return <p>Add your website to generate this section.</p>;
        return pending ? (
          <SectionLoading label="product information" />
        ) : (
          <SectionFailed label="product information" />
        );
      }
      return (
        <div className="space-y-2">
          {data.workspace.industry ? (
            <p>
              <span className="font-medium text-foreground">Industry:</span>{" "}
              {data.workspace.industry}
            </p>
          ) : null}
          {desc ? <p>{desc}</p> : null}
          {props.length > 0 ? (
            <ul className="ml-4 list-disc space-y-1">
              {props.slice(0, 6).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          {enrich?.productBlurb ? (
            <div className="mt-2 rounded-md border border-dashed bg-muted/20 p-2 text-[11px]">
              <span className="font-medium text-foreground">AI deep-dive:</span>{" "}
              {enrich.productBlurb}
            </div>
          ) : null}
        </div>
      );
    }
    case "competitors": {
      const enrich = data.llmAnalysis?.documentEnrichment;
      if (!v?.competitors?.length && !enrich?.competitorAngles) {
        if (!hasUrl) return <p>Add your website to find competitors.</p>;
        return pending ? (
          <SectionLoading label="competitor analysis" />
        ) : (
          <SectionFailed label="competitor analysis" />
        );
      }
      return (
        <div className="space-y-2">
          {v?.competitors?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {v.competitors.slice(0, 12).map((c) => (
                <CompetitorPill key={c} competitor={c} />
              ))}
            </div>
          ) : null}
          {enrich?.competitorAngles ? (
            <p className="rounded-md border border-dashed bg-muted/20 p-2 text-[11px]">
              <span className="font-medium text-foreground">AI angle:</span>{" "}
              {enrich.competitorAngles}
            </p>
          ) : null}
        </div>
      );
    }
    case "voice": {
      const tone = v?.brandVoice?.tone ?? v?.tone;
      const style = v?.brandVoice?.style ?? v?.styleGuidelines?.join("; ");
      const avoidList = v?.brandVoice?.avoid ?? v?.avoid ?? [];
      const enrich = data.llmAnalysis?.documentEnrichment;
      if (!tone && !style && avoidList.length === 0 && !enrich?.voiceSummary) {
        if (!hasUrl) return <p>Add your website to generate this section.</p>;
        return pending ? (
          <SectionLoading label="brand voice" />
        ) : (
          <SectionFailed label="brand voice" />
        );
      }
      return (
        <div className="space-y-2">
          {tone ? (
            <p>
              <span className="font-medium text-foreground">Tone:</span> {tone}
            </p>
          ) : null}
          {style ? (
            <p>
              <span className="font-medium text-foreground">Style:</span> {style}
            </p>
          ) : null}
          {avoidList.length > 0 ? (
            <div>
              <span className="font-medium text-foreground">Avoid:</span>
              <ul className="ml-4 list-disc">
                {avoidList.slice(0, 8).map((a) => (
                  <li key={typeof a === "string" ? a : String(a)}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {enrich?.voiceSummary ? (
            <p className="rounded-md border border-dashed bg-muted/20 p-2 text-[11px]">
              <span className="font-medium text-foreground">AI summary:</span>{" "}
              {enrich.voiceSummary}
            </p>
          ) : null}
        </div>
      );
    }
    case "strategy": {
      const channels = v?.channels ?? [];
      const clusters = v?.topicClusters ?? [];
      const enrich = data.llmAnalysis?.documentEnrichment;
      if (channels.length === 0 && clusters.length === 0 && !enrich?.strategySummary) {
        if (!hasUrl) return <p>Add your website to draft a strategy.</p>;
        return pending ? (
          <SectionLoading label="marketing strategy" />
        ) : (
          <SectionFailed label="marketing strategy" />
        );
      }
      return (
        <div className="space-y-2">
          {channels.length > 0 ? (
            <div>
              <span className="font-medium text-foreground">Channels:</span>{" "}
              {channels.join(", ")}
            </div>
          ) : null}
          {clusters.length > 0 ? (
            <div>
              <div className="font-medium text-foreground">Topic clusters</div>
              <ul className="ml-4 list-disc space-y-1">
                {clusters.slice(0, 5).map((c) => (
                  <li key={c.theme}>
                    <span className="text-foreground">{c.theme}</span>
                    {c.keywords?.length ? (
                      <span className="text-muted-foreground">
                        {" "}
                        — {c.keywords.slice(0, 5).join(", ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {enrich?.strategySummary ? (
            <p className="rounded-md border border-dashed bg-muted/20 p-2 text-[11px]">
              <span className="font-medium text-foreground">AI playbook:</span>{" "}
              {enrich.strategySummary}
            </p>
          ) : null}
        </div>
      );
    }
  }
}


type CompanyVoice = (CompanyData["voice"]);

function SocialHandlesRow({ voice }: { voice: CompanyVoice | null }) {
  const handles = voice?.socialHandles ?? {};
  const items: Array<{
    key: keyof typeof handles;
    icon: typeof Twitter;
    label: string;
    href: (v: string) => string;
  }> = [
    {
      key: "twitter",
      icon: Twitter,
      label: "X",
      href: (v) => `https://x.com/${stripAt(v)}`,
    },
    {
      key: "instagram",
      icon: Instagram,
      label: "Instagram",
      href: (v) => `https://instagram.com/${stripAt(v)}`,
    },
    {
      key: "linkedin",
      icon: Linkedin,
      label: "LinkedIn",
      href: (v) => (v.startsWith("http") ? v : `https://${v.replace(/^https?:\/\//, "")}`),
    },
    {
      key: "youtube",
      icon: Youtube,
      label: "YouTube",
      href: (v) => (v.startsWith("@") ? `https://youtube.com/${v}` : `https://${v.replace(/^https?:\/\//, "")}`),
    },
    {
      key: "facebook",
      icon: Facebook,
      label: "Facebook",
      href: (v) => (v.startsWith("http") ? v : `https://${v.replace(/^https?:\/\//, "")}`),
    },
    {
      key: "github",
      icon: Github,
      label: "GitHub",
      href: (v) => `https://github.com/${v.replace(/^@/, "")}`,
    },
  ];

  const present = items.filter((it) => {
    const v = handles[it.key];
    return typeof v === "string" && v.trim().length > 0;
  });

  if (present.length === 0) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href="/settings" className="justify-start gap-2">
          <AtSign className="h-3.5 w-3.5" aria-hidden />
          Add social handles
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {present.map((it) => {
        const Icon = it.icon;
        const value = handles[it.key] as string;
        return (
          <a
            key={it.key}
            href={it.href(value)}
            target="_blank"
            rel="noreferrer noopener"
            title={`${it.label}: ${value}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="max-w-[10ch] truncate font-mono text-[11px]">
              {value}
            </span>
          </a>
        );
      })}
      <Link
        href="/settings"
        className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed px-2 text-[11px] text-muted-foreground hover:text-foreground"
      >
        Edit
      </Link>
    </div>
  );
}

function stripAt(v: string): string {
  return v.startsWith("@") ? v.slice(1) : v;
}

function isAnalysisPending(data: CompanyData): boolean {
  const v = data.voice;
  const hasPositioning = !!v?.positioning?.trim();
  const hasCompetitors = (v?.competitors?.length ?? 0) > 0;
  const hasHandles =
    !!v?.socialHandles &&
    Object.values(v.socialHandles).some(
      (h) => typeof h === "string" && h.trim().length > 0
    );
  // Pending if we have a URL but none of the LLM-generated artifacts have
  // landed yet.
  return !hasPositioning && !hasCompetitors && !hasHandles;
}

function stripUrlScheme(u: string): string {
  return u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}
