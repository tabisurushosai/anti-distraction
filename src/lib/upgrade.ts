/**
 * @file Pure helpers for the Gumroad-backed Premium flow. Network and
 * chrome.storage side effects live in `src/upgrade.ts`.
 */

export const GUMROAD_VERIFY_URL =
  "https://api.gumroad.com/v2/licenses/verify";

const BUILD_ENV = (
  import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }
).env ?? {};

export const GUMROAD_PRODUCT_ID =
  BUILD_ENV.VITE_GUMROAD_PRODUCT_ID?.trim() ?? "";
export const GUMROAD_CHECKOUT_URL =
  BUILD_ENV.VITE_GUMROAD_CHECKOUT_URL?.trim() ?? "";

export const REVERIFY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

const LICENSE_MIN_LEN = 4;
const LICENSE_MAX_LEN = 128;
const LICENSE_PATTERN = /^[A-Za-z0-9_-]+$/;

export type UpgradeConfig = {
  checkoutUrl: string;
  productId: string;
  verifyUrl: string;
};

export const DEFAULT_CONFIG: UpgradeConfig = {
  checkoutUrl: GUMROAD_CHECKOUT_URL,
  productId: GUMROAD_PRODUCT_ID,
  verifyUrl: GUMROAD_VERIFY_URL,
};

export type GumroadPurchase = {
  product_id?: unknown;
  refunded?: unknown;
  disputed?: unknown;
  chargebacked?: unknown;
};

export type GumroadVerifyResponse = {
  success?: unknown;
  purchase?: unknown;
};

export type LicenseRejectionReason =
  | "invalid-response"
  | "product-mismatch"
  | "refunded"
  | "disputed"
  | "chargebacked";

export type LicenseEvaluation =
  | { valid: true }
  | { valid: false; reason: LicenseRejectionReason };

/** True only when both public Gumroad identifiers are release-ready. */
export function isUpgradeConfigured(
  config: UpgradeConfig = DEFAULT_CONFIG,
): boolean {
  if (config.productId.trim().length === 0) return false;
  if (config.checkoutUrl.includes("REPLACE_")) return false;
  try {
    const checkout = new URL(config.checkoutUrl);
    const verify = new URL(config.verifyUrl);
    return checkout.protocol === "https:" && verify.protocol === "https:";
  } catch {
    return false;
  }
}

/** Returns the configured Gumroad product URL without attaching user data. */
export function buildCheckoutUrl(
  config: UpgradeConfig = DEFAULT_CONFIG,
): string {
  if (!isUpgradeConfigured(config)) {
    throw new Error("gumroad-not-configured");
  }
  return new URL(config.checkoutUrl).toString();
}

/** Normalizes a user-entered key for verification and local storage. */
export function normalizeLicenseCode(code: string): string {
  return code.trim();
}

/** Performs a local syntax check only; this never grants Premium. */
export function isValidLicenseCode(code: unknown): boolean {
  if (typeof code !== "string") return false;
  const normalized = normalizeLicenseCode(code);
  if (normalized.length < LICENSE_MIN_LEN) return false;
  if (normalized.length > LICENSE_MAX_LEN) return false;
  return LICENSE_PATTERN.test(normalized);
}

/** Converts Gumroad's response into the only states allowed to grant access. */
export function evaluateGumroadResponse(
  raw: unknown,
  expectedProductId: string,
): LicenseEvaluation {
  if (!raw || typeof raw !== "object") {
    return { valid: false, reason: "invalid-response" };
  }
  const response = raw as GumroadVerifyResponse;
  if (response.success !== true) {
    return { valid: false, reason: "invalid-response" };
  }
  if (!response.purchase || typeof response.purchase !== "object") {
    return { valid: false, reason: "invalid-response" };
  }

  const purchase = response.purchase as GumroadPurchase;
  if (
    typeof purchase.product_id !== "string" ||
    purchase.product_id !== expectedProductId
  ) {
    return { valid: false, reason: "product-mismatch" };
  }
  if (
    typeof purchase.refunded !== "boolean" ||
    typeof purchase.chargebacked !== "boolean" ||
    typeof purchase.disputed !== "boolean"
  ) {
    return { valid: false, reason: "invalid-response" };
  }
  if (purchase.refunded === true) {
    return { valid: false, reason: "refunded" };
  }
  if (purchase.chargebacked === true) {
    return { valid: false, reason: "chargebacked" };
  }
  if (purchase.disputed === true) {
    return { valid: false, reason: "disputed" };
  }
  return { valid: true };
}

/** True once a successful verification is old enough to require refreshing. */
export function shouldReverify(
  verifiedAt: number | null,
  now: number = Date.now(),
): boolean {
  if (verifiedAt === null || !Number.isFinite(verifiedAt)) return true;
  const age = now - verifiedAt;
  return age < 0 || age >= REVERIFY_INTERVAL_MS;
}

/** True only during the bounded offline grace created by a valid purchase. */
export function isWithinOfflineGrace(
  graceUntil: number | null,
  now: number = Date.now(),
): boolean {
  return (
    typeof graceUntil === "number" &&
    Number.isFinite(graceUntil) &&
    now >= 0 &&
    now <= graceUntil
  );
}
