import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHost, hostMatches } from "../src/lib/host-match.ts";

test("normalizeHost: lowercases", () => {
  assert.equal(normalizeHost("YouTube.COM"), "youtube.com");
});

test("normalizeHost: trims trailing dot", () => {
  assert.equal(normalizeHost("youtube.com."), "youtube.com");
});

test("normalizeHost: strips leading www.", () => {
  assert.equal(normalizeHost("www.youtube.com"), "youtube.com");
});

test("normalizeHost: strips whitespace", () => {
  assert.equal(normalizeHost("  www.youtube.com.  "), "youtube.com");
});

test("hostMatches: exact host match", () => {
  assert.equal(hostMatches("youtube.com", ["youtube.com"]), true);
});

test("hostMatches: subdomain suffix match", () => {
  assert.equal(hostMatches("m.youtube.com", ["youtube.com"]), true);
});

test("hostMatches: deep subdomain suffix match", () => {
  assert.equal(hostMatches("studio.m.youtube.com", ["youtube.com"]), true);
});

test("hostMatches: www prefix is normalized on currentHost", () => {
  assert.equal(hostMatches("www.youtube.com", ["youtube.com"]), true);
});

test("hostMatches: www prefix is normalized on site", () => {
  assert.equal(hostMatches("youtube.com", ["www.youtube.com"]), true);
});

test("hostMatches: non-matching host returns false", () => {
  assert.equal(hostMatches("example.com", ["youtube.com"]), false);
});

test("hostMatches: substring (not suffix) does not match", () => {
  // foo-youtube.com must NOT match youtube.com (no dot boundary)
  assert.equal(hostMatches("foo-youtube.com", ["youtube.com"]), false);
});

test("hostMatches: rejects partial host name like myoutube.com", () => {
  assert.equal(hostMatches("myoutube.com", ["youtube.com"]), false);
});

test("hostMatches: empty site list returns false", () => {
  assert.equal(hostMatches("youtube.com", []), false);
});

test("hostMatches: empty/whitespace site entries are skipped", () => {
  assert.equal(hostMatches("youtube.com", ["", "  ", "youtube.com"]), true);
});

test("hostMatches: empty currentHost returns false", () => {
  assert.equal(hostMatches("", ["youtube.com"]), false);
});

test("hostMatches: multiple sites — first match wins", () => {
  assert.equal(
    hostMatches("m.twitter.com", ["youtube.com", "twitter.com", "x.com"]),
    true,
  );
});

test("hostMatches: case-insensitive on both sides", () => {
  assert.equal(hostMatches("M.YouTube.COM", ["YOUTUBE.com"]), true);
});

test("hostMatches: trailing dot in currentHost normalized", () => {
  assert.equal(hostMatches("youtube.com.", ["youtube.com"]), true);
});
