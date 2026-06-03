/** Normalize a URL or hostname to a bare domain (no protocol, www, or path). */
export function normalizeDomain(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

/** Derive a display brand from a domain, e.g. `amazon.com` → `Amazon`. */
export function brandFromDomain(input: string): string {
  const s = normalizeDomain(input);
  if (!s) return "";
  const root = s.split(".")[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}
