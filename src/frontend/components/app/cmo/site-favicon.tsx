"use client";

import { useState } from "react";
import Image from "next/image";
import { Globe } from "lucide-react";

/**
 * Renders the tracked site's real favicon (via Google's favicon service,
 * with a DuckDuckGo fallback) and degrades to a globe glyph if both fail
 * or no host is set. Same load-with-fallback pattern as the competitor
 * pills, so logos stay consistent across the app.
 */
export function SiteFavicon({
  host,
  size = 16,
  className,
}: {
  host: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const [step, setStep] = useState(0);
  const domain = (host ?? "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim();

  if (!domain || domain === "—" || step >= 2) {
    return (
      <Globe
        className={className ?? "text-muted-foreground"}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  const src =
    step === 0
      ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`
      : `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;

  return (
    <span
      className="relative inline-block shrink-0 overflow-hidden rounded-[3px]"
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt=""
        fill
        unoptimized
        sizes={`${size}px`}
        className="object-contain"
        onError={() => setStep((s) => s + 1)}
      />
    </span>
  );
}
