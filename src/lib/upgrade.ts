export const STRIPE_CHECKOUT_URL =
  "https://buy.stripe.com/REPLACE_WITH_REAL_PAYMENT_LINK";

export const RETURN_URL_PATTERNS: readonly string[] = [
  "https://anti-distraction.example/unlock",
];

export const UNLOCK_PARAM = "ad_unlock";

const LICENSE_MIN_LEN = 4;
const LICENSE_MAX_LEN = 128;
const LICENSE_PATTERN = /^[A-Za-z0-9_-]+$/;

export type UpgradeConfig = {
  checkoutUrl: string;
  returnUrlPatterns: readonly string[];
  unlockParam: string;
};

export const DEFAULT_CONFIG: UpgradeConfig = {
  checkoutUrl: STRIPE_CHECKOUT_URL,
  returnUrlPatterns: RETURN_URL_PATTERNS,
  unlockParam: UNLOCK_PARAM,
};

export function generateInstallId(
  rng: () => string = defaultRandomId,
): string {
  return rng();
}

function defaultRandomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return (
    "id-" +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  );
}

export function buildCheckoutUrl(
  installId: string,
  config: UpgradeConfig = DEFAULT_CONFIG,
): string {
  const url = new URL(config.checkoutUrl);
  if (installId) {
    url.searchParams.set("client_reference_id", installId);
  }
  return url.toString();
}

export function isReturnUrl(
  rawUrl: string,
  config: UpgradeConfig = DEFAULT_CONFIG,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  return config.returnUrlPatterns.some((pat) => {
    try {
      const p = new URL(pat);
      return (
        parsed.origin === p.origin &&
        parsed.pathname.startsWith(p.pathname)
      );
    } catch {
      return false;
    }
  });
}

export function parseUnlockToken(
  rawUrl: string,
  config: UpgradeConfig = DEFAULT_CONFIG,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const v = parsed.searchParams.get(config.unlockParam);
  return v && v.length > 0 ? v : null;
}

export function isValidLicenseCode(code: unknown): boolean {
  if (typeof code !== "string") return false;
  const trimmed = code.trim();
  if (trimmed.length < LICENSE_MIN_LEN) return false;
  if (trimmed.length > LICENSE_MAX_LEN) return false;
  return LICENSE_PATTERN.test(trimmed);
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: "invalid-url" | "missing-token" | "invalid-token" | "storage-error" };

export type ReturnUrlOutcome =
  | { kind: "unlock"; token: string }
  | { kind: "ignore"; reason: "invalid-url" | "missing-token" | "invalid-token" };

export function classifyReturnUrl(
  rawUrl: string,
  config: UpgradeConfig = DEFAULT_CONFIG,
): ReturnUrlOutcome {
  if (!isReturnUrl(rawUrl, config)) return { kind: "ignore", reason: "invalid-url" };
  const token = parseUnlockToken(rawUrl, config);
  if (token === null) return { kind: "ignore", reason: "missing-token" };
  if (!isValidLicenseCode(token)) return { kind: "ignore", reason: "invalid-token" };
  return { kind: "unlock", token };
}
