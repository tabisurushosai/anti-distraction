import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(
  new URL("../scripts/check-release-config.mjs", import.meta.url),
);
const valid = {
  VITE_GUMROAD_PRODUCT_ID: "SDGgCnivv6gTTHfVRfUBxQ==",
  VITE_GUMROAD_CHECKOUT_URL:
    "https://seller.gumroad.com/l/anti-distraction",
};

function run(overrides = {}) {
  return execFileSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      VITE_GUMROAD_PRODUCT_ID: "",
      VITE_GUMROAD_CHECKOUT_URL: "",
      ...overrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

test("release configuration accepts a Gumroad product ID and product URL", () => {
  assert.match(run(valid), /Gumroad release configuration OK/);
});

test("release configuration rejects missing and placeholder values", () => {
  assert.throws(() => run(), /Command failed/);
  assert.throws(
    () =>
      run({
        VITE_GUMROAD_PRODUCT_ID: "test-product",
        VITE_GUMROAD_CHECKOUT_URL: "https://example.com/buy",
      }),
    /Command failed/,
  );
});

test("release configuration rejects non-Gumroad and non-product URLs", () => {
  for (const checkoutUrl of [
    "http://seller.gumroad.com/l/anti-distraction",
    "https://example.com/l/anti-distraction",
    "https://seller.gumroad.com/",
    "https://seller.gumroad.com/library",
  ]) {
    assert.throws(
      () =>
        run({
          ...valid,
          VITE_GUMROAD_CHECKOUT_URL: checkoutUrl,
        }),
      /Command failed/,
    );
  }
});
