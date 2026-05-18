/**
 * @file Hosts declared in `manifest.json` `content_scripts.matches`. Kept in
 * sync manually so `src/lib/site-input.ts` can warn when a user adds a host
 * that the manifest does not cover (and therefore would not be greyed out).
 */

/** Hosts that the MV3 manifest already injects the content script into. */
export const MANIFEST_MATCH_HOSTS: readonly string[] = [
  "youtube.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "facebook.com",
  "tiktok.com",
];
