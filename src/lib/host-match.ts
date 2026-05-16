export function normalizeHost(input: string): string {
  let v = input.trim().toLowerCase();
  if (v.endsWith(".")) v = v.slice(0, -1);
  if (v.startsWith("www.")) v = v.slice(4);
  return v;
}

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
