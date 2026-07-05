#!/usr/bin/env node

const productId = process.env.VITE_GUMROAD_PRODUCT_ID?.trim() ?? "";
const checkoutUrl = process.env.VITE_GUMROAD_CHECKOUT_URL?.trim() ?? "";
const errors = [];

if (productId.length === 0 || productId.includes("REPLACE_")) {
  errors.push("VITE_GUMROAD_PRODUCT_ID is missing or still a placeholder");
}

try {
  const parsed = new URL(checkoutUrl);
  if (parsed.protocol !== "https:" || checkoutUrl.includes("REPLACE_")) {
    errors.push("VITE_GUMROAD_CHECKOUT_URL must be a release HTTPS URL");
  }
} catch {
  errors.push("VITE_GUMROAD_CHECKOUT_URL is missing or invalid");
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("Gumroad release configuration OK");
