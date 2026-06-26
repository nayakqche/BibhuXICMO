"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  CreditCard,
  FileText,
  Home,
  Layers,
  MessageSquare,
  Plug,
  Settings,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  BacklinkLogo,
  ContentLogo,
  GeoLogo,
  HackerNewsLogo,
  InstagramLogo,
  LinkedinLogo,
  RedditLogo,
  SeoLogo,
  XLogo,
  YoutubeLogo,
} from "@/frontend/components/brand-logos";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/shared/utils";
import { Logo } from "@/frontend/components/marketing/logo";
import { ThemeToggle } from "@/frontend/components/ui/theme-toggle";
import type { Plan } from "@/frontend/components/ui/plan-badge";
import { useSidebar } from "./sidebar-context";
import { WorkspaceSwitcher } from "./workspace-switcher";

const MAIN = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/agent/cmo", label: "AI CMO", icon: Bot },
  { href: "/actions", label: "Action Items", icon: Sparkles },
  { href: "/content", label: "Content Library", icon: FileText },
  { href: "/queue", label: "Publish Queue", icon: Layers },
  { href: "/chat", label: "Private Chat", icon: MessageSquare },
];

const AGENTS = [
  { href: "/agents/seo", label: "SEO", icon: SeoLogo },
  { href: "/agents/geo", label: "GEO", icon: GeoLogo },
  { href: "/agents/content", label: "Content Writer", icon: ContentLogo },
  { href: "/agents/reddit-sales", label: "Reddit Sales", icon: RedditLogo },
  { href: "/agents/hn", label: "Hacker News", icon: HackerNewsLogo },
  { href: "/agents/x", label: "X / Twitter", icon: XLogo },
  { href: "/agents/linkedin", label: "LinkedIn", icon: LinkedinLogo },
  { href: "/agents/youtube", label: "YT Creators", icon: YoutubeLogo },
  { href: "/agents/instagram", label: "Insta Influencers", icon: InstagramLogo },
  { href: "/agents/backlink-marketplace", label: "Backlink Marketplace", icon: BacklinkLogo },
];

const DATA = [
  { href: "/integrations/gsc", label: "Search Console", icon: TrendingUp },
  { href: "/integrations/ga4", label: "Google Analytics", icon: BarChart3 },
];

const SETTINGS = [
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  workspaceName,
  workspaceId,
  plan,
}: {
  workspaceName: string;
  workspaceId: string;
  plan: Plan;
}) {
  const { mobileOpen, close, collapsed, toggleCollapsed } = useSidebar();

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-background/70 backdrop-blur-sm transition-opacity duration-200 md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden={!mobileOpen}
        onClick={close}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 flex-col border-r bg-background transition-[width,transform] duration-200 md:sticky md:top-0 md:translate-x-0 md:bg-muted/20",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop width: collapsed = thin icon rail, expanded = 16rem.
          collapsed ? "md:w-[68px]" : "md:w-64",
          // Mobile drawer is always 16rem regardless of collapsed state.
          "w-64"
        )}
        aria-label="Primary navigation"
        data-collapsed={collapsed}
      >
        <div
          className={cn(
            "relative flex h-16 items-center border-b",
            collapsed ? "justify-center px-2" : "justify-between px-6"
          )}
        >
          <Logo showWordmark={!collapsed} />
          <button
            type="button"
            onClick={close}
            className="absolute right-3 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
          {/* Desktop collapse toggle (floating chip on the right border). */}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="absolute -right-3 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground md:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {!collapsed ? (
          <div className="border-b">
            <WorkspaceSwitcher
              current={{ id: workspaceId, name: workspaceName, plan }}
              others={[]}
            />
          </div>
        ) : null}

        <nav className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
          <Section items={MAIN} collapsed={collapsed} />
          <SectionTitle collapsed={collapsed}>Agents</SectionTitle>
          <Section items={AGENTS} icon={Bot} collapsed={collapsed} />
          <SectionTitle collapsed={collapsed}>Data</SectionTitle>
          <Section items={DATA} collapsed={collapsed} />
          <SectionTitle collapsed={collapsed}>Workspace</SectionTitle>
          <Section items={SETTINGS} collapsed={collapsed} />
        </nav>

        <div
          className={cn(
            "flex items-center border-t py-3 text-xs text-muted-foreground",
            collapsed ? "justify-center px-2" : "justify-between px-4"
          )}
        >
          {!collapsed ? <span>Theme</span> : null}
          <ThemeToggle />
        </div>
      </aside>
    </>
  );
}

function SectionTitle({
  children,
  collapsed,
}: {
  children: React.ReactNode;
  collapsed?: boolean;
}) {
  if (collapsed) {
    return <div className="mt-4 pt-2" aria-hidden />;
  }
  return (
    <div className="mt-4 px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function Section({
  items,
  icon: DefaultIcon,
  collapsed,
}: {
  items: { href: string; label: string; icon: React.ElementType }[];
  icon?: React.ElementType;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = item.icon || DefaultIcon || Home;
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-md text-sm transition-colors",
                collapsed
                  ? "h-9 w-full justify-center px-0"
                  : "gap-2 px-3 py-1.5",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed ? (
                <span className="flex-1 truncate">{item.label}</span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
