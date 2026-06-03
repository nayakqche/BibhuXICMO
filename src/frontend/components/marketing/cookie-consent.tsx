"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/frontend/components/ui/button";
import { SITE_NAME } from "@/shared/site";

const STORAGE_KEY = "xicmo-cookie-consent";

type Consent = "accepted" | "declined";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setVisible(true);
    } catch {
      /* private browsing — show banner once per session */
      setVisible(true);
    }
  }, []);

  function save(value: Consent) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80 md:p-5"
    >
      <div className="container flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          We use essential cookies to keep you signed in and optional cookies to improve{" "}
          {SITE_NAME}. See our{" "}
          <Link href="/cookies" className="font-medium text-foreground underline">
            Cookie Policy
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-medium text-foreground underline">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => save("declined")}>
            Decline optional
          </Button>
          <Button size="sm" onClick={() => save("accepted")}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
