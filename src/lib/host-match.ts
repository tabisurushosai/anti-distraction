/**
 * @file Host normalization and matching utilities used by the content script
 * to decide whether the current tab is in the configured block list.
 */

/**
 * Lower-cases a host string and strips a leading `www.` and a trailing dot.
 * Used to bring user input and `location.hostname` into a comparable form.
 */
export function normalizeHost(input: string): string {
  let v = input.trim().toLowerCase();
  if (v.endsWith(".")) v = v.slice(0, -1);
  if (v.startsWith("www.")) v = v.slice(4);
  return v;
}

/**
 * Returns true when `currentHost` exactly equals — or is a subdomain of — any
 * normalized entry in `sites`. Empty entries are ignored.
 */
export function hostMatches(currentHost: string, sites: readonly string[]): boolean {
  const host = normalizeHost(currentHost);
  if (!host) return false;
  for (const raw of sites) {
    const site = normalizeHost(raw);
    if (!site) continue;
    if (host === site) return true;
    if (host.endsWith("." + site)) return true;
  }
  return false;
}
