import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";

/**
 * Shared scaffold for modules whose UI is shipped before the backend.
 * Renders a polished hero + capability cards + a roadmap strip so users
 * understand what's coming, rather than seeing a 404.
 */
export type ModuleCapability = {
  title: string;
  body: string;
  icon: React.ElementType;
};

export function ModuleStubPage({
  title,
  tagline,
  description,
  icon: Icon,
  capabilities,
  primaryCta,
  status = "Coming soon",
}: {
  title: string;
  tagline: string;
  description: string;
  icon: React.ElementType;
  capabilities: ModuleCapability[];
  primaryCta?: { label: string; href: string };
  status?: string;
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge
            variant="outline"
            className="gap-1.5 border-primary/30 bg-primary/5 text-primary"
          >
            <Sparkles className="h-3 w-3" />
            {status}
          </Badge>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border bg-card text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                {title}
              </h1>
              <p className="text-sm text-muted-foreground">{tagline}</p>
            </div>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        {primaryCta ? (
          <Button asChild>
            <Link href={primaryCta.href} className="gap-1.5">
              {primaryCta.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {capabilities.map((c) => {
          const CapIcon = c.icon;
          return (
            <Card key={c.title} className="border-dashed">
              <CardHeader className="space-y-2 pb-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <CapIcon className="h-4 w-4" />
                </span>
                <CardTitle className="text-base">{c.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{c.body}</CardDescription>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
        <CardHeader>
          <CardTitle className="text-base">Want this sooner?</CardTitle>
          <CardDescription>
            This module&rsquo;s UI is live; the backend wiring (search,
            scoring, outreach automation, payments) is the next thing
            we&rsquo;re shipping. Reach out via Private Chat to get on
            the early-access list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/chat" className="gap-1.5">
              Open Private Chat
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
