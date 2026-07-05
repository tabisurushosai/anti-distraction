/**
 * @file Gumroad checkout and license verification. Premium is granted only
 * after a successful server response and is bounded by an offline grace.
 */

import { getValues, setValues, type StorageSchema } from "./storage.ts";
import {
  DEFAULT_CONFIG,
  OFFLINE_GRACE_MS,
  buildCheckoutUrl,
  evaluateGumroadResponse,
  isUpgradeConfigured,
  isValidLicenseCode,
  isWithinOfflineGrace,
  normalizeLicenseCode,
  shouldReverify,
  type UpgradeConfig,
} from "./lib/upgrade.ts";

export {
  DEFAULT_CONFIG,
  GUMROAD_CHECKOUT_URL,
  GUMROAD_PRODUCT_ID,
  GUMROAD_VERIFY_URL,
  OFFLINE_GRACE_MS,
  REVERIFY_INTERVAL_MS,
  buildCheckoutUrl,
  evaluateGumroadResponse,
  isUpgradeConfigured,
  isValidLicenseCode,
  isWithinOfflineGrace,
  normalizeLicenseCode,
  shouldReverify,
  type LicenseEvaluation,
  type LicenseRejectionReason,
  type UpgradeConfig,
} from "./lib/upgrade.ts";

export type UnlockFailureReason =
  | "invalid-token"
  | "verification-failed"
  | "network-error"
  | "config-error"
  | "storage-error";

export type UnlockResult =
  | { ok: true; verifiedAt: number }
  | { ok: false; reason: UnlockFailureReason };

export type RefreshResult =
  | { kind: "no-license" }
  | { kind: "fresh" }
  | { kind: "verified" }
  | { kind: "offline-grace" }
  | { kind: "revoked"; reason: "verification-failed" | "grace-expired" }
  | { kind: "error"; reason: "config-error" | "storage-error" };

type StoredPremium = Pick<
  StorageSchema,
  | "premium_unlocked"
  | "premium_license_key"
  | "premium_verified_at"
  | "premium_grace_until"
>;

type VerifyOptions = {
  config?: UpgradeConfig;
  fetchImpl?: typeof fetch;
  now?: number;
};

/** Opens the public Gumroad product page. No install or user ID is attached. */
export async function startCheckout(
  config: UpgradeConfig = DEFAULT_CONFIG,
): Promise<string> {
  const url = buildCheckoutUrl(config);
  await chrome.tabs.create({ url });
  return url;
}

async function verifyWithGumroad(
  code: string,
  options: VerifyOptions = {},
): Promise<UnlockResult> {
  const config = options.config ?? DEFAULT_CONFIG;
  if (!isUpgradeConfigured(config)) {
    return { ok: false, reason: "config-error" };
  }
  if (!isValidLicenseCode(code)) {
    return { ok: false, reason: "invalid-token" };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    product_id: config.productId,
    license_key: normalizeLicenseCode(code),
    increment_uses_count: "false",
  });

  let response: Response;
  try {
    response = await fetchImpl(config.verifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    return { ok: false, reason: "network-error" };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: response.status >= 500 ? "network-error" : "verification-failed",
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, reason: "verification-failed" };
  }

  const evaluation = evaluateGumroadResponse(payload, config.productId);
  if (!evaluation.valid) {
    return { ok: false, reason: "verification-failed" };
  }
  return { ok: true, verifiedAt: options.now ?? Date.now() };
}

async function persistVerifiedLicense(
  code: string,
  verifiedAt: number,
): Promise<void> {
  await setValues({
    premium_unlocked: true,
    premium_license_key: normalizeLicenseCode(code),
    premium_verified_at: verifiedAt,
    premium_grace_until: verifiedAt + OFFLINE_GRACE_MS,
  });
}

async function revokePremium(clearLicense: boolean): Promise<void> {
  const patch: Parameters<typeof setValues>[0] = {
    premium_unlocked: false,
    premium_verified_at: null,
    premium_grace_until: null,
  };
  if (clearLicense) patch.premium_license_key = null;
  await setValues(patch);
}

/** Verifies a user-entered key before persisting any Premium entitlement. */
export async function applyLicenseCode(
  code: string,
  options: VerifyOptions = {},
): Promise<UnlockResult> {
  const result = await verifyWithGumroad(code, options);
  if (!result.ok) return result;
  try {
    await persistVerifiedLicense(code, result.verifiedAt);
    return result;
  } catch {
    return { ok: false, reason: "storage-error" };
  }
}

/**
 * Refreshes a stored license every seven days. Network failures preserve a
 * previously verified entitlement only until its fourteen-day grace expires.
 */
export async function refreshStoredLicense(
  options: VerifyOptions = {},
): Promise<RefreshResult> {
  const now = options.now ?? Date.now();
  let stored: StoredPremium;
  try {
    stored = await getValues([
      "premium_unlocked",
      "premium_license_key",
      "premium_verified_at",
      "premium_grace_until",
    ] as const);
  } catch {
    return { kind: "error", reason: "storage-error" };
  }

  if (!stored.premium_license_key) {
    if (
      stored.premium_unlocked ||
      stored.premium_verified_at !== null ||
      stored.premium_grace_until !== null
    ) {
      try {
        await revokePremium(true);
      } catch {
        return { kind: "error", reason: "storage-error" };
      }
    }
    return { kind: "no-license" };
  }

  if (
    !shouldReverify(stored.premium_verified_at, now) &&
    isWithinOfflineGrace(stored.premium_grace_until, now)
  ) {
    return { kind: "fresh" };
  }

  const result = await verifyWithGumroad(stored.premium_license_key, {
    ...options,
    now,
  });
  if (result.ok) {
    try {
      await persistVerifiedLicense(
        stored.premium_license_key,
        result.verifiedAt,
      );
      return { kind: "verified" };
    } catch {
      return { kind: "error", reason: "storage-error" };
    }
  }

  if (
    result.reason === "network-error" ||
    result.reason === "config-error"
  ) {
    if (isWithinOfflineGrace(stored.premium_grace_until, now)) {
      return result.reason === "config-error"
        ? { kind: "error", reason: "config-error" }
        : { kind: "offline-grace" };
    }
    try {
      await revokePremium(false);
      return { kind: "revoked", reason: "grace-expired" };
    } catch {
      return { kind: "error", reason: "storage-error" };
    }
  }

  try {
    await revokePremium(true);
    return { kind: "revoked", reason: "verification-failed" };
  } catch {
    return { kind: "error", reason: "storage-error" };
  }
}
