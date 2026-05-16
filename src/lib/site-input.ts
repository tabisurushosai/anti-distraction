import { MANIFEST_MATCH_HOSTS } from "./manifest-hosts.ts";

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export function normalizeHost(input: string): string | null {
  let v = input.trim().toLowerCase();
  if (!v) return null;
  if (v.includes("://")) {
    try {
      v = new URL(v).hostname;
    } catch {
      return null;
    }
  }
  v = v.replace(/^\*\./, "");
  if (v.startsWith("www.")) v = v.slice(4);
  if (v.endsWith(".")) v = v.slice(0, -1);
  const slash = v.indexOf("/");
  if (slash >= 0) v = v.slice(0, slash);
  return HOST_RE.test(v) ? v : null;
}

export function isCoveredByManifest(host: string): boolean {
  const h = host.toLowerCase();
  return MANIFEST_MATCH_HOSTS.some((m) => h === m || h.endsWith("." + m));
}
