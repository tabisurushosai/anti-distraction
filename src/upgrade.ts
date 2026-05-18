/**
 * @file Side-effectful counterparts of `lib/upgrade.ts`: read/write the
 * install id, open the Stripe checkout tab, persist the premium flag on
 * successful return, and apply manually entered license codes.
 */

import { setValue } from "./storage";
import {
  DEFAULT_CONFIG,
  buildCheckoutUrl,
  classifyReturnUrl,
  generateInstallId,
  isValidLicenseCode,
  type UnlockResult,
  type UpgradeConfig,
} from "./lib/upgrade";

export {
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
  type UnlockResult,
  type UpgradeConfig,
} from "./lib/upgrade";

const INSTALL_ID_KEY = "install_id";

/** Returns the persisted install id, lazily generating and storing one on first use. */
export async function getInstallId(): Promise<string> {
  const data = await chrome.storage.local.get(INSTALL_ID_KEY);
  const existing = data[INSTALL_ID_KEY];
  if (typeof existing === "string" && existing.length > 0) return existing;
  const fresh = generateInstallId();
  await chrome.storage.local.set({ [INSTALL_ID_KEY]: fresh });
  return fresh;
}

/** Opens the Stripe checkout page in a new tab with the install id attached. */
export async function startCheckout(
  config: UpgradeConfig = DEFAULT_CONFIG,
): Promise<string> {
  const installId = await getInstallId();
  const url = buildCheckoutUrl(installId, config);
  await chrome.tabs.create({ url });
  return url;
}

/** Flips `premium_unlocked` to true in storage. */
export async function unlockPremium(): Promise<void> {
  await setValue("premium_unlocked", true);
}

/**
 * Inspects a navigated-to URL and, if it is a valid checkout return URL
 * carrying a valid token, unlocks premium. Returns a structured outcome
 * instead of throwing so callers can surface a localized message.
 */
export async function handleReturnUrl(
  rawUrl: string,
  config: UpgradeConfig = DEFAULT_CONFIG,
): Promise<UnlockResult> {
  const outcome = classifyReturnUrl(rawUrl, config);
  if (outcome.kind === "ignore") return { ok: false, reason: outcome.reason };
  try {
    await unlockPremium();
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage-error" };
  }
}

/** Validates a manually entered license code and unlocks premium on success. */
export async function applyLicenseCode(code: string): Promise<UnlockResult> {
  if (!isValidLicenseCode(code)) return { ok: false, reason: "invalid-token" };
  try {
    await unlockPremium();
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage-error" };
  }
}
