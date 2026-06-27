/**
 * Backlink package catalog — single source of truth for the premium backlinks
 * purchase flow. Imported by the marketplace page (display), the create API
 * (price + validation), and the review step.
 *
 * Prices are stored in USD cents so we never do float math on money. The server
 * always resolves the package from this map by `key` — the client price is never
 * trusted.
 */
export type BacklinkPackage = {
  key: string;
  label: string;
  backlinkCount: number;
  amountUsdCents: number;
  description: string;
};

export const BACKLINK_PACKAGES: BacklinkPackage[] = [
  {
    key: "bl3",
    label: "3 Backlinks",
    backlinkCount: 3,
    amountUsdCents: 45000,
    description: "Three clean, niche-matched contextual backlinks.",
  },
  {
    key: "bl5",
    label: "5 Backlinks",
    backlinkCount: 5,
    amountUsdCents: 55000,
    description: "Five placements — best value per link.",
  },
  {
    key: "bl10",
    label: "10 Backlinks",
    backlinkCount: 10,
    amountUsdCents: 100000,
    description: "Ten placements for an aggressive link-building push.",
  },
];

export function getBacklinkPackage(key: string): BacklinkPackage | undefined {
  return BACKLINK_PACKAGES.find((p) => p.key === key);
}

/** 45000 → "$450". USD whole-dollar prices, so no decimals shown. */
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
