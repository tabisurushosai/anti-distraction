#!/usr/bin/env node

const productId = process.env.VITE_GUMROAD_PRODUCT_ID?.trim() ?? "";
const checkoutUrl = process.env.VITE_GUMROAD_CHECKOUT_URL?.trim() ?? "";
const errors = [];

if (
  productId.length < 8 ||
  /REPLACE_|PLACEHOLDER|TEST[-_]?PRODUCT|EXAMPLE/i.test(productId)
) {
  errors.push("VITE_GUMROAD_PRODUCT_ID is missing, invalid, or still a placeholder");
}

try {
  const parsed = new URL(checkoutUrl);
  const gumroadHost =
    parsed.hostname === "gumroad.com" ||
    parsed.hostname.endsWith(".gumroad.com");
  const productPath = /^\/l\/[^/]+\/?$/.test(parsed.pathname);
  if (
    parsed.protocol !== "https:" ||
    !gumroadHost ||
    !productPath ||
    /REPLACE_|PLACEHOLDER|EXAMPLE/i.test(checkoutUrl)
  ) {
    errors.push(
      "VITE_GUMROAD_CHECKOUT_URL must be a release Gumroad HTTPS product URL",
    );
  }
} catch {
  errors.push("VITE_GUMROAD_CHECKOUT_URL is missing or invalid");
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("Gumroad release configuration OK");
