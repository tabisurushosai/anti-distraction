/**
 * @file Strict host validation for the options page's site-input field.
 * Stricter than `lib/host-match.ts#normalizeHost` because user input can be a
 * full URL, a `*.example.com` glob, or invalid garbage that must be rejected.
 */

import { MANIFEST_MATCH_HOSTS } from "./manifest-hosts.ts";

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

/**
 * Parses arbitrary user input into a canonical bare hostname or returns null
 * when the input cannot be coerced into a valid registrable domain. Accepts
 * URLs (`https://x.com/path`), wildcards (`*.x.com`), and `www.` prefixes.
 */
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

/**
 * True when `host` is one of, or a subdomain of, the manifest-declared match
 * patterns. Used by the options UI to warn users that adding a non-covered
 * host will not actually take effect until the manifest is updated.
 */
export function isCoveredByManifest(host: string): boolean {
  const h = host.toLowerCase();
  return MANIFEST_MATCH_HOSTS.some((m) => h === m || h.endsWith("." + m));
}
