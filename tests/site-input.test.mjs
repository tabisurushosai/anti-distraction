import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHost, isCoveredByManifest } from "../src/lib/site-input.ts";
import { normalizeHost as normalizeSavedHost } from "../src/lib/host-match.ts";
import { MANIFEST_MATCH_HOSTS } from "../src/lib/manifest-hosts.ts";

// ---------- normalizeHost ----------

test("normalizeHost: lowercases input", () => {
  assert.equal(normalizeHost("YouTube.COM"), "youtube.com");
});

test("normalizeHost: trims surrounding whitespace", () => {
  assert.equal(normalizeHost("  youtube.com  "), "youtube.com");
});

test("normalizeHost: extracts hostname from https URL with path/query", () => {
  assert.equal(
    normalizeHost("HTTPS://WWW.YouTube.com/watch?v=abc&t=1"),
    "youtube.com",
  );
});

test("normalizeHost: extracts hostname from http URL", () => {
  assert.equal(normalizeHost("http://example.com/foo"), "example.com");
});

test("normalizeHost: strips leading *. (manifest match pattern)", () => {
  assert.equal(normalizeHost("*.example.com"), "example.com");
});

test("normalizeHost: strips leading www.", () => {
  assert.equal(normalizeHost("www.example.com"), "example.com");
});

test("normalizeHost: strips trailing dot", () => {
  assert.equal(normalizeHost("example.com."), "example.com");
});

test("normalizeHost: drops path segment when scheme is absent", () => {
  assert.equal(normalizeHost("example.com/foo/bar"), "example.com");
});

test("normalizeHost: combined *. + www. + trailing dot", () => {
  assert.equal(normalizeHost("*.www.example.com."), "example.com");
});

test("normalizeHost: empty string returns null", () => {
  assert.equal(normalizeHost(""), null);
});

test("normalizeHost: whitespace-only string returns null", () => {
  assert.equal(normalizeHost("   "), null);
});

test("normalizeHost: localhost is rejected (single label)", () => {
  assert.equal(normalizeHost("localhost"), null);
});

test("normalizeHost: IPv4 literal is rejected", () => {
  assert.equal(normalizeHost("1.2.3.4"), null);
});

test("normalizeHost: spaces inside string are rejected", () => {
  assert.equal(normalizeHost("not a host"), null);
});

test("normalizeHost: malformed URL with scheme returns null", () => {
  assert.equal(normalizeHost("https://"), null);
});

test("normalizeHost: trailing-only TLD is rejected", () => {
  assert.equal(normalizeHost(".com"), null);
});

test("normalizeHost: idempotent — saved value passes host-match normalize unchanged", () => {
  // Design point 11: site-input.normalizeHost output must be a fixed point
  // of host-match.normalizeHost (used by tab-gray / time-limit at runtime).
  const samples = [
    "HTTPS://WWW.YouTube.com/watch?v=x",
    "*.example.com",
    "www.foo.bar.baz",
    "EXAMPLE.com.",
  ];
  for (const input of samples) {
    const normalized = normalizeHost(input);
    assert.ok(normalized, `expected ${input} to normalize`);
    assert.equal(normalizeSavedHost(normalized), normalized);
  }
});

// ---------- isCoveredByManifest ----------

test("isCoveredByManifest: exact match for manifest host", () => {
  assert.equal(isCoveredByManifest("youtube.com"), true);
});

test("isCoveredByManifest: subdomain of manifest host", () => {
  assert.equal(isCoveredByManifest("m.youtube.com"), true);
});

test("isCoveredByManifest: deep subdomain of manifest host", () => {
  assert.equal(isCoveredByManifest("studio.m.youtube.com"), true);
});

test("isCoveredByManifest: case-insensitive on input", () => {
  assert.equal(isCoveredByManifest("M.YouTube.COM"), true);
});

test("isCoveredByManifest: unrelated host returns false", () => {
  assert.equal(isCoveredByManifest("example.org"), false);
});

test("isCoveredByManifest: substring (no dot boundary) returns false", () => {
  // foo-youtube.com must NOT count as covered by youtube.com
  assert.equal(isCoveredByManifest("foo-youtube.com"), false);
});

test("isCoveredByManifest: similar-but-distinct host (myoutube.com) returns false", () => {
  assert.equal(isCoveredByManifest("myoutube.com"), false);
});

test("isCoveredByManifest: every manifest host itself is covered", () => {
  for (const host of MANIFEST_MATCH_HOSTS) {
    assert.equal(isCoveredByManifest(host), true, `expected ${host} covered`);
  }
});
