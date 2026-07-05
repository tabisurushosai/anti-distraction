import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OFFLINE_GRACE_MS,
  REVERIFY_INTERVAL_MS,
  applyLicenseCode,
  buildCheckoutUrl,
  evaluateGumroadResponse,
  isUpgradeConfigured,
  isValidLicenseCode,
  isWithinOfflineGrace,
  normalizeLicenseCode,
  refreshStoredLicense,
  shouldReverify,
} from "../src/upgrade.ts";

const NOW = Date.UTC(2026, 6, 5, 9, 0, 0);
const CONFIG = {
  checkoutUrl: "https://seller.gumroad.com/l/anti-distraction",
  productId: "product-123",
  verifyUrl: "https://api.gumroad.com/v2/licenses/verify",
};
const VALID_PAYLOAD = {
  success: true,
  purchase: {
    product_id: CONFIG.productId,
    refunded: false,
    disputed: false,
    chargebacked: false,
  },
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installChromeStorage(initial = {}) {
  const state = {
    premium_unlocked: false,
    premium_license_key: null,
    premium_verified_at: null,
    premium_grace_until: null,
    ...initial,
  };
  const writes = [];
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.map((key) => [key, state[key]]));
        },
        async set(patch) {
          writes.push({ ...patch });
          Object.assign(state, patch);
        },
        async remove(key) {
          delete state[key];
        },
      },
    },
    tabs: {
      async create() {},
    },
  };
  return { state, writes };
}

test("configuration requires public Gumroad product and HTTPS URLs", () => {
  assert.equal(isUpgradeConfigured(CONFIG), true);
  assert.equal(isUpgradeConfigured({ ...CONFIG, productId: "" }), false);
  assert.equal(
    isUpgradeConfigured({ ...CONFIG, checkoutUrl: "http://example.test" }),
    false,
  );
  assert.equal(
    isUpgradeConfigured({
      ...CONFIG,
      checkoutUrl: "https://example.test/REPLACE_PRODUCT",
    }),
    false,
  );
});

test("checkout URL contains no install or license identifier", () => {
  const url = new URL(buildCheckoutUrl(CONFIG));
  assert.equal(url.toString(), CONFIG.checkoutUrl);
  assert.equal([...url.searchParams].length, 0);
});

test("license syntax validation never grants entitlement by itself", () => {
  assert.equal(isValidLicenseCode("AB12-3456_CDEF"), true);
  assert.equal(normalizeLicenseCode("  AB12-3456  "), "AB12-3456");
  assert.equal(isValidLicenseCode("abc"), false);
  assert.equal(isValidLicenseCode("a".repeat(129)), false);
  assert.equal(isValidLicenseCode("ABCD SECRET"), false);
  assert.equal(isValidLicenseCode(null), false);
});

test("Gumroad response accepts only the configured, paid purchase", () => {
  assert.deepEqual(
    evaluateGumroadResponse(VALID_PAYLOAD, CONFIG.productId),
    { valid: true },
  );
  assert.deepEqual(
    evaluateGumroadResponse(
      {
        ...VALID_PAYLOAD,
        purchase: { ...VALID_PAYLOAD.purchase, product_id: "other" },
      },
      CONFIG.productId,
    ),
    { valid: false, reason: "product-mismatch" },
  );
  for (const field of ["refunded", "disputed", "chargebacked"]) {
    const outcome = evaluateGumroadResponse(
      {
        ...VALID_PAYLOAD,
        purchase: { ...VALID_PAYLOAD.purchase, [field]: true },
      },
      CONFIG.productId,
    );
    assert.equal(outcome.valid, false);
    assert.equal(outcome.reason, field);
  }
  assert.deepEqual(evaluateGumroadResponse({}, CONFIG.productId), {
    valid: false,
    reason: "invalid-response",
  });
});

test("reverification and offline grace use exact boundaries", () => {
  assert.equal(shouldReverify(null, NOW), true);
  assert.equal(shouldReverify(NOW, NOW), false);
  assert.equal(shouldReverify(NOW - REVERIFY_INTERVAL_MS + 1, NOW), false);
  assert.equal(shouldReverify(NOW - REVERIFY_INTERVAL_MS, NOW), true);
  assert.equal(isWithinOfflineGrace(NOW, NOW), true);
  assert.equal(isWithinOfflineGrace(NOW - 1, NOW), false);
});

test("applyLicenseCode persists only a server-verified purchase", async () => {
  const { state, writes } = installChromeStorage();
  let requestBody = "";
  const result = await applyLicenseCode(" KEY-1234 ", {
    config: CONFIG,
    now: NOW,
    fetchImpl: async (_url, init) => {
      requestBody = String(init?.body ?? "");
      return jsonResponse(VALID_PAYLOAD);
    },
  });

  assert.deepEqual(result, { ok: true, verifiedAt: NOW });
  assert.equal(requestBody.includes("product_id=product-123"), true);
  assert.equal(requestBody.includes("license_key=KEY-1234"), true);
  assert.equal(requestBody.includes("increment_uses_count=false"), true);
  assert.equal(state.premium_unlocked, true);
  assert.equal(state.premium_license_key, "KEY-1234");
  assert.equal(state.premium_verified_at, NOW);
  assert.equal(state.premium_grace_until, NOW + OFFLINE_GRACE_MS);
  assert.equal(writes.length, 1);
});

test("invalid and unavailable verification never unlock new users", async () => {
  for (const scenario of [
    async () => jsonResponse({ success: false }, 404),
    async () => {
      throw new Error("offline");
    },
  ]) {
    const { state, writes } = installChromeStorage();
    const result = await applyLicenseCode("KEY-1234", {
      config: CONFIG,
      now: NOW,
      fetchImpl: scenario,
    });
    assert.equal(result.ok, false);
    assert.equal(state.premium_unlocked, false);
    assert.equal(writes.length, 0);
  }
});

test("stored license revalidation preserves only bounded offline access", async () => {
  const verifiedAt = NOW - REVERIFY_INTERVAL_MS;
  const { state } = installChromeStorage({
    premium_unlocked: true,
    premium_license_key: "KEY-1234",
    premium_verified_at: verifiedAt,
    premium_grace_until: verifiedAt + OFFLINE_GRACE_MS,
  });
  const result = await refreshStoredLicense({
    config: CONFIG,
    now: NOW,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(result, { kind: "offline-grace" });
  assert.equal(state.premium_unlocked, true);

  const expired = await refreshStoredLicense({
    config: CONFIG,
    now: verifiedAt + OFFLINE_GRACE_MS + 1,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(expired, { kind: "revoked", reason: "grace-expired" });
  assert.equal(state.premium_unlocked, false);
  assert.equal(state.premium_license_key, "KEY-1234");
});

test("transient HTTP failures preserve an existing license during grace", async () => {
  for (const status of [408, 425, 429, 500, 503]) {
    const verifiedAt = NOW - REVERIFY_INTERVAL_MS;
    const { state } = installChromeStorage({
      premium_unlocked: true,
      premium_license_key: "KEY-1234",
      premium_verified_at: verifiedAt,
      premium_grace_until: verifiedAt + OFFLINE_GRACE_MS,
    });
    const result = await refreshStoredLicense({
      config: CONFIG,
      now: NOW,
      fetchImpl: async () => jsonResponse({ success: false }, status),
    });
    assert.deepEqual(result, { kind: "offline-grace" });
    assert.equal(state.premium_unlocked, true);
    assert.equal(state.premium_license_key, "KEY-1234");
  }
});

test("malformed successful response is treated as a transient failure", async () => {
  const verifiedAt = NOW - REVERIFY_INTERVAL_MS;
  const { state } = installChromeStorage({
    premium_unlocked: true,
    premium_license_key: "KEY-1234",
    premium_verified_at: verifiedAt,
    premium_grace_until: verifiedAt + OFFLINE_GRACE_MS,
  });
  const result = await refreshStoredLicense({
    config: CONFIG,
    now: NOW,
    fetchImpl: async () => jsonResponse({ success: true }),
  });
  assert.deepEqual(result, { kind: "offline-grace" });
  assert.equal(state.premium_unlocked, true);
  assert.equal(state.premium_license_key, "KEY-1234");
});

test("refund or dispute revokes and clears a stored key", async () => {
  for (const field of ["refunded", "disputed", "chargebacked"]) {
    const { state } = installChromeStorage({
      premium_unlocked: true,
      premium_license_key: "KEY-1234",
      premium_verified_at: NOW - REVERIFY_INTERVAL_MS,
      premium_grace_until: NOW + OFFLINE_GRACE_MS,
    });
    const result = await refreshStoredLicense({
      config: CONFIG,
      now: NOW,
      fetchImpl: async () =>
        jsonResponse({
          ...VALID_PAYLOAD,
          purchase: { ...VALID_PAYLOAD.purchase, [field]: true },
        }),
    });
    assert.deepEqual(result, {
      kind: "revoked",
      reason: "verification-failed",
    });
    assert.equal(state.premium_unlocked, false);
    assert.equal(state.premium_license_key, null);
  }
});

test("legacy local-only unlock is revoked without a verified key", async () => {
  const { state } = installChromeStorage({
    premium_unlocked: true,
  });
  const result = await refreshStoredLicense({
    config: CONFIG,
    now: NOW,
    fetchImpl: async () => jsonResponse(VALID_PAYLOAD),
  });
  assert.deepEqual(result, { kind: "no-license" });
  assert.equal(state.premium_unlocked, false);
});
