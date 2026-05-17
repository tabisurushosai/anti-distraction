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

export async function getInstallId(): Promise<string> {
  const data = await chrome.storage.local.get(INSTALL_ID_KEY);
  const existing = data[INSTALL_ID_KEY];
  if (typeof existing === "string" && existing.length > 0) return existing;
  const fresh = generateInstallId();
  await chrome.storage.local.set({ [INSTALL_ID_KEY]: fresh });
  return fresh;
}

export async function startCheckout(
  config: UpgradeConfig = DEFAULT_CONFIG,
): Promise<string> {
  const installId = await getInstallId();
  const url = buildCheckoutUrl(installId, config);
  await chrome.tabs.create({ url });
  return url;
}

export async function unlockPremium(): Promise<void> {
  await setValue("premium_unlocked", true);
}

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

export async function applyLicenseCode(code: string): Promise<UnlockResult> {
  if (!isValidLicenseCode(code)) return { ok: false, reason: "invalid-token" };
  try {
    await unlockPremium();
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage-error" };
  }
}
