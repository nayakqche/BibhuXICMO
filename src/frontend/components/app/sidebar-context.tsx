"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname } from "next/navigation";

type SidebarCtx = {
  /** True while the mobile drawer is open. */
  mobileOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** True when the desktop sidebar is collapsed to a thin icon rail. */
  collapsed: boolean;
  toggleCollapsed: () => void;
};

const Ctx = createContext<SidebarCtx>({
  mobileOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
  collapsed: false,
  toggleCollapsed: () => {},
});

const COLLAPSE_KEY = "xicmo:sidebar-collapsed";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // Hydrate desktop-collapsed state from localStorage on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  // Close drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open on mobile.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return (
    <Ctx.Provider
      value={{ mobileOpen, open, close, toggle, collapsed, toggleCollapsed }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useSidebar = () => useContext(Ctx);
