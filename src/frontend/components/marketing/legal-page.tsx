import Link from "next/link";
import { LEGAL_LAST_UPDATED } from "@/shared/legal";

const LEGAL_NAV = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/cookies", label: "Cookies" },
  { href: "/acceptable-use", label: "Acceptable use" },
  { href: "/subprocessors", label: "Subprocessors" },
  { href: "/refund", label: "Refunds" },
] as const;

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="container max-w-3xl py-16 md:py-24">
      <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: {LEGAL_LAST_UPDATED}</p>

      <nav
        aria-label="Legal policies"
        className="mt-6 flex flex-wrap gap-x-4 gap-y-1 border-b pb-4 text-sm text-muted-foreground"
      >
        {LEGAL_NAV.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-foreground hover:underline">
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="prose prose-neutral dark:prose-invert mt-10 max-w-none text-[15px] leading-7">
        {children}
      </div>
    </article>
  );
}
