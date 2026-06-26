/**
 * Original brand glyphs for the social platforms we integrate, in their
 * official colors. Use these instead of the generic lucide icons wherever we
 * want the surface to feel native to the platform (sidebar, agent grid,
 * section heroes). Each accepts a `className` for sizing.
 */

type LogoProps = { className?: string };

export function LinkedinLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        fill="#0A66C2"
        d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"
      />
    </svg>
  );
}

export function InstagramLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <defs>
        <radialGradient id="ig-grad" cx="30%" cy="107%" r="135%">
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="5%" stopColor="#fdf497" />
          <stop offset="45%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <path
        fill="url(#ig-grad)"
        d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 3.68A6.16 6.16 0 1 0 12 18.16 6.16 6.16 0 0 0 12 5.84zm0 10.16A4 4 0 1 1 12 8a4 4 0 0 1 0 8zm6.4-10.41a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z"
      />
    </svg>
  );
}

export function YoutubeLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        fill="#FF0000"
        d="M23.5 6.2a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.51A3.02 3.02 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3.02 3.02 0 0 0 2.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3.02 3.02 0 0 0 2.12-2.14A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8z"
      />
      <path fill="#fff" d="M9.55 15.57V8.43L15.82 12l-6.27 3.57z" />
    </svg>
  );
}

export function XLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden focusable="false">
      <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.15h7.6l5.24 6.93 6.06-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3L17.61 20.65z" />
    </svg>
  );
}

export function FacebookLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.88v2.26h3.32l-.53 3.49h-2.79v8.44C19.61 23.08 24 18.09 24 12.07z"
      />
    </svg>
  );
}

/**
 * Reddit "Snoo" mark — solid Reddit orange (#FF4500) circle with the
 * antenna + face cutouts. Same proportions as the official Reddit brand
 * mark; derived from the skill-icons Reddit PR.
 */
export function RedditLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <circle cx="12" cy="12" r="12" fill="#FF4500" />
      <path
        fill="#fff"
        d="M20 12c0-.97-.79-1.76-1.76-1.76-.47 0-.9.19-1.21.49-1.2-.86-2.84-1.41-4.66-1.48l.79-3.73 2.6.55c.03.66.57 1.18 1.24 1.18.68 0 1.24-.55 1.24-1.24 0-.68-.55-1.24-1.24-1.24-.48 0-.9.28-1.1.69l-2.9-.62a.27.27 0 0 0-.32.2l-.88 4.13c-1.84.05-3.51.61-4.73 1.47A1.76 1.76 0 0 0 4 12c0 .73.45 1.36 1.08 1.62-.03.18-.04.37-.04.56C5.04 16.99 8.16 19 12 19s6.96-2.01 6.96-4.82c0-.19-.01-.38-.04-.56A1.76 1.76 0 0 0 20 12zm-11.5 1.25c0-.69.56-1.25 1.25-1.25s1.25.56 1.25 1.25-.56 1.25-1.25 1.25-1.25-.56-1.25-1.25zm6.74 3.25c-.83.83-2.41.9-2.87.9-.47 0-2.05-.06-2.87-.9a.31.31 0 0 1 0-.44.31.31 0 0 1 .44 0c.52.52 1.64.71 2.43.71.79 0 1.91-.18 2.43-.71a.31.31 0 0 1 .44 0 .31.31 0 0 1 0 .44zm-.24-2c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25z"
      />
    </svg>
  );
}

/**
 * Hacker News "Y" mark — orange square with white "Y".
 */
export function HackerNewsLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <rect width="24" height="24" rx="3" fill="#FF6600" />
      <path
        fill="#fff"
        d="M9.4 6h2.2l1.4 3.2L14.4 6h2.2l-2.6 5.5V18h-2.4v-6.5z"
      />
    </svg>
  );
}

/** SEO — emerald→teal gradient with a magnifier-on-bars glyph. */
export function SeoLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="seo-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#0D9488" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#seo-grad)" />
      <path
        d="M7 17V11.5M11 17V8M15 17V13.5"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="16.5" cy="8.5" r="2.2" stroke="#fff" strokeWidth="1.6" fill="none" />
      <path d="m18.2 10.2 1.4 1.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** GEO — violet/fuchsia/indigo gradient with a sparkle. */
export function GeoLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="geo-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="55%" stopColor="#E879F9" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#geo-grad)" />
      <path
        fill="#fff"
        d="M12 5.6 13.5 10 18 11.5 13.5 13 12 17.4 10.5 13 6 11.5 10.5 10z"
      />
      <circle cx="17" cy="6.6" r="1.1" fill="#fff" opacity="0.85" />
      <circle cx="6.5" cy="17.6" r="0.9" fill="#fff" opacity="0.75" />
    </svg>
  );
}

/** Content Writer — amber→orange gradient with a quill/pen. */
export function ContentLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="content-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#F97316" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#content-grad)" />
      <path
        d="M7 17 17 7M14 6l4 4M7 17v-2.5l7.5-7.5"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M7 17h2.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Backlink Marketplace — blue→cyan gradient with two linked rings. */
export function BacklinkLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="backlink-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#backlink-grad)" />
      <path
        d="M9.2 13.6 7.4 15.4a2.7 2.7 0 0 1-3.8-3.8l2.4-2.4a2.7 2.7 0 0 1 3.8 0M14.8 10.4l1.8-1.8a2.7 2.7 0 0 1 3.8 3.8l-2.4 2.4a2.7 2.7 0 0 1-3.8 0M9.6 14.4l4.8-4.8"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** Reddit Sales — same Snoo as RedditLogo but with a subtle background ring. */
export const RedditSalesLogo = RedditLogo;
