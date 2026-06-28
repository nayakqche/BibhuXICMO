"use client";

import { useState } from "react";
import Image from "next/image";
import { Sparkles } from "lucide-react";
import { cn } from "@/shared/utils";
import type { PlatformKey } from "@/app/(app)/agents/geo/ai-citations-types";

/**
 * Brand logo for an AI platform (ChatGPT, Gemini, Perplexity, Copilot,
 * Grok, Google AI Overviews). Loads the real favicon with a fallback chain
 * and a final inline SVG. Shared between the GEO agent's AI-citations panel
 * and the dashboard Analytics GEO tab so the marks stay identical.
 *
 *   - kind "favicon": Google favicon -> DuckDuckGo -> inline SVG
 *   - kind "url":     a specific bundled/hosted image -> inline SVG
 */
type PlatformLogo =
  | { kind: "favicon"; domain: string }
  | { kind: "url"; src: string }
  | { kind: "inline" };

const PLATFORM_LOGO: Record<PlatformKey, PlatformLogo> = {
  aiOverviews: { kind: "favicon", domain: "google.com" },
  chatgpt: { kind: "favicon", domain: "openai.com" },
  gemini: { kind: "favicon", domain: "gemini.google.com" },
  perplexity: { kind: "favicon", domain: "perplexity.ai" },
  // Official Microsoft Copilot mark, bundled in /public.
  copilot: { kind: "url", src: "/copilot-icon.png" },
  grok: { kind: "favicon", domain: "grok.com" },
};

export function PlatformIcon({
  k,
  className,
}: {
  k: PlatformKey;
  className?: string;
}) {
  const cls = cn("h-5 w-5", className);
  const [step, setStep] = useState(0);
  const logo = PLATFORM_LOGO[k];

  if (logo.kind === "url" && step < 1) {
    return (
      <span className={cn("relative inline-block overflow-hidden rounded-[4px]", cls)}>
        <Image
          src={logo.src}
          alt={`${k} logo`}
          fill
          unoptimized
          sizes="32px"
          className="object-contain"
          onError={() => setStep(1)}
        />
      </span>
    );
  }

  if (logo.kind === "favicon" && step < 2) {
    const src =
      step === 0
        ? `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(logo.domain)}`
        : `https://icons.duckduckgo.com/ip3/${encodeURIComponent(logo.domain)}.ico`;
    return (
      <span className={cn("relative inline-block overflow-hidden rounded-[4px]", cls)}>
        <Image
          src={src}
          alt={`${k} logo`}
          fill
          unoptimized
          sizes="32px"
          className="object-contain"
          onError={() => setStep((s) => s + 1)}
        />
      </span>
    );
  }

  return <PlatformIconFallback k={k} className={className} />;
}

/** Hand-drawn brand marks — only shown if the favicon fails to load. */
export function PlatformIconFallback({
  k,
  className,
}: {
  k: PlatformKey;
  className?: string;
}) {
  const cls = cn("h-5 w-5", className);
  switch (k) {
    case "aiOverviews":
      return <Sparkles className={cn(cls, "text-sky-400")} />;
    case "chatgpt":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={cn(cls, "text-zinc-300 dark:text-zinc-100")}>
          <path d="M22.28 9.81a5.93 5.93 0 0 0-.5-4.88 6 6 0 0 0-6.46-2.87 6 6 0 0 0-10.17 2.16 5.93 5.93 0 0 0-3.95 2.87 6 6 0 0 0 .74 7.07 5.94 5.94 0 0 0 .51 4.88 6 6 0 0 0 6.45 2.87 5.96 5.96 0 0 0 4.51 2.02 6 6 0 0 0 5.71-4.17 5.94 5.94 0 0 0 3.95-2.88 6 6 0 0 0-.79-7.07Zm-9 12.55a4.42 4.42 0 0 1-2.84-1.04l.14-.08 4.71-2.72a.78.78 0 0 0 .38-.67v-6.65l2 1.15a.07.07 0 0 1 .04.05v5.5a4.46 4.46 0 0 1-4.43 4.46Zm-9.55-4.08a4.45 4.45 0 0 1-.53-3l.14.08 4.72 2.72a.77.77 0 0 0 .77 0l5.76-3.32v2.3a.07.07 0 0 1-.03.06l-4.77 2.75a4.46 4.46 0 0 1-6.06-1.63Zm-1.24-10.31a4.43 4.43 0 0 1 2.32-1.95v5.6a.77.77 0 0 0 .39.68l5.74 3.31-1.99 1.15a.07.07 0 0 1-.07 0l-4.77-2.75a4.46 4.46 0 0 1-1.62-6.04Zm16.37 3.8-5.76-3.34 1.99-1.14a.07.07 0 0 1 .07 0l4.77 2.75a4.46 4.46 0 0 1-.67 8.04v-5.6a.79.79 0 0 0-.4-.71Zm1.98-2.99-.13-.08-4.72-2.74a.77.77 0 0 0-.77 0l-5.76 3.32V6.98a.07.07 0 0 1 .03-.06l4.77-2.75a4.46 4.46 0 0 1 6.58 4.61Zm-12.47 4.1L6.5 11.74v-3.4a4.46 4.46 0 0 1 7.32-3.42l-.14.08-4.71 2.72a.78.78 0 0 0-.39.67Zm1.08-2.35 2.56-1.48 2.57 1.48v2.96l-2.56 1.48-2.57-1.48Z" />
        </svg>
      );
    case "gemini":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={cn(cls, "text-violet-400")}>
          <path d="M12 2 9.83 9.83 2 12l7.83 2.17L12 22l2.17-7.83L22 12l-7.83-2.17Z" />
        </svg>
      );
    case "perplexity":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn(cls, "text-teal-400")}>
          <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4 18.4 5.6" />
        </svg>
      );
    case "copilot":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden>
          <defs>
            <linearGradient id="copilot-fallback-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1B88FF" />
              <stop offset="35%" stopColor="#2DC56E" />
              <stop offset="65%" stopColor="#E66A8C" />
              <stop offset="100%" stopColor="#FF8534" />
            </linearGradient>
          </defs>
          <path
            d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 4.5a4.5 4.5 0 014.5 4.5h-3a1.5 1.5 0 00-3 0v3a1.5 1.5 0 003 0h3a4.5 4.5 0 11-4.5-7.5z"
            fill="url(#copilot-fallback-grad)"
          />
        </svg>
      );
    case "grok":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cn(cls, "text-zinc-500 dark:text-zinc-300")}>
          <circle cx="12" cy="12" r="9" />
          <path d="m5 19 14-14" strokeLinecap="round" />
        </svg>
      );
  }
}
