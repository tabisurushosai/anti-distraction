import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  RETURN_URL_PATTERNS,
  STRIPE_CHECKOUT_URL,
  UNLOCK_PARAM,
  buildCheckoutUrl,
  classifyReturnUrl,
  generateInstallId,
  isReturnUrl,
  isValidLicenseCode,
  parseUnlockToken,
} from "../src/lib/upgrade.ts";

// ---------- buildCheckoutUrl ----------

test("buildCheckoutUrl: appends client_reference_id from installId", () => {
  const url = buildCheckoutUrl("abc-123");
  const u = new URL(url);
  assert.equal(u.searchParams.get("client_reference_id"), "abc-123");
  assert.equal(u.origin + u.pathname, new URL(STRIPE_CHECKOUT_URL).origin + new URL(STRIPE_CHECKOUT_URL).pathname);
});

test("buildCheckoutUrl: empty installId omits client_reference_id", () => {
  const url = buildCheckoutUrl("");
  const u = new URL(url);
  assert.equal(u.searchParams.get("client_reference_id"), null);
});

test("buildCheckoutUrl: respects override config", () => {
  const override = {
    ...DEFAULT_CONFIG,
    checkoutUrl: "https://example.test/checkout",
  };
  const url = buildCheckoutUrl("xyz", override);
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://example.test/checkout");
  assert.equal(u.searchParams.get("client_reference_id"), "xyz");
});

// ---------- generateInstallId ----------

test("generateInstallId: returns non-empty string by default", () => {
  const id = generateInstallId();
  assert.equal(typeof id, "string");
  assert.ok(id.length > 0);
});

test("generateInstallId: returns different ids across calls", () => {
  const a = generateInstallId();
  const b = generateInstallId();
  assert.notEqual(a, b);
});

test("generateInstallId: accepts a custom rng", () => {
  const id = generateInstallId(() => "fixed-token");
  assert.equal(id, "fixed-token");
});

// ---------- isReturnUrl ----------

test("isReturnUrl: matches the default return URL origin + pathname", () => {
  for (const pat of RETURN_URL_PATTERNS) {
    assert.equal(isReturnUrl(pat + "?" + UNLOCK_PARAM + "=t"), true);
  }
});

test("isReturnUrl: rejects mismatched origin", () => {
  assert.equal(isReturnUrl("https://malicious.test/unlock?ad_unlock=x"), false);
});

test("isReturnUrl: rejects mismatched pathname", () => {
  assert.equal(isReturnUrl("https://anti-distraction.example/other?ad_unlock=x"), false);
});

test("isReturnUrl: rejects malformed url", () => {
  assert.equal(isReturnUrl("not a url"), false);
});

test("isReturnUrl: pathname prefix match allows trailing segments", () => {
  assert.equal(
    isReturnUrl("https://anti-distraction.example/unlock/success?ad_unlock=t"),
    true,
  );
});

// ---------- parseUnlockToken ----------

test("parseUnlockToken: returns the unlock parameter value", () => {
  assert.equal(
    parseUnlockToken("https://anti-distraction.example/unlock?ad_unlock=abc123"),
    "abc123",
  );
});

test("parseUnlockToken: null when param missing", () => {
  assert.equal(
    parseUnlockToken("https://anti-distraction.example/unlock"),
    null,
  );
});

test("parseUnlockToken: null when param empty", () => {
  assert.equal(
    parseUnlockToken("https://anti-distraction.example/unlock?ad_unlock="),
    null,
  );
});

test("parseUnlockToken: null for malformed url", () => {
  assert.equal(parseUnlockToken("not a url"), null);
});

// ---------- isValidLicenseCode ----------

test("isValidLicenseCode: accepts alnum + dash/underscore within length", () => {
  assert.equal(isValidLicenseCode("AB12_-ok"), true);
  assert.equal(isValidLicenseCode("abcd"), true);
});

test("isValidLicenseCode: rejects too short", () => {
  assert.equal(isValidLicenseCode("abc"), false);
});

test("isValidLicenseCode: rejects too long", () => {
  assert.equal(isValidLicenseCode("a".repeat(129)), false);
});

test("isValidLicenseCode: rejects whitespace inside", () => {
  assert.equal(isValidLicenseCode("ab cd"), false);
});

test("isValidLicenseCode: trims surrounding whitespace before validating", () => {
  assert.equal(isValidLicenseCode("  abcd  "), true);
});

test("isValidLicenseCode: rejects special chars", () => {
  assert.equal(isValidLicenseCode("abcd!"), false);
  assert.equal(isValidLicenseCode("abcd?"), false);
});

test("isValidLicenseCode: rejects non-string inputs gracefully", () => {
  assert.equal(isValidLicenseCode(null), false);
  assert.equal(isValidLicenseCode(undefined), false);
  assert.equal(isValidLicenseCode(12345), false);
});

// ---------- classifyReturnUrl ----------

test("classifyReturnUrl: returns unlock with valid url + token", () => {
  const res = classifyReturnUrl(
    "https://anti-distraction.example/unlock?ad_unlock=abcd1234",
  );
  assert.deepEqual(res, { kind: "unlock", token: "abcd1234" });
});

test("classifyReturnUrl: ignores non-matching url", () => {
  const res = classifyReturnUrl("https://other.test/unlock?ad_unlock=abcd1234");
  assert.equal(res.kind, "ignore");
  assert.equal(res.reason, "invalid-url");
});

test("classifyReturnUrl: ignores missing token", () => {
  const res = classifyReturnUrl("https://anti-distraction.example/unlock");
  assert.equal(res.kind, "ignore");
  assert.equal(res.reason, "missing-token");
});

test("classifyReturnUrl: ignores invalid token", () => {
  const res = classifyReturnUrl(
    "https://anti-distraction.example/unlock?ad_unlock=ab",
  );
  assert.equal(res.kind, "ignore");
  assert.equal(res.reason, "invalid-token");
});
