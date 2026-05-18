/**
 * @file Async wrappers around the pure predicates in `lib/premium-status.ts`
 * — bind them to `chrome.storage.local` so callers can ask "is premium
 * effective?" without re-reading storage themselves. Re-exports the trial
 * length constant and `PremiumState` type for convenience.
 */

import { getValues, setValue, type StorageSchema } from "./storage";
import {
  TRIAL_DAYS,
  isPremiumEffective as isPremiumEffectivePure,
  isPremiumPurchased as isPremiumPurchasedPure,
  isTrialActive as isTrialActivePure,
  trialDaysLeft as trialDaysLeftPure,
  type PremiumState,
} from "./lib/premium-status";

export { TRIAL_DAYS, type PremiumState };

const PREMIUM_KEYS = ["premium_unlocked", "trial_start_ts"] as const;

/** Snapshots the premium-related keys from storage. */
export async function getPremiumState(): Promise<PremiumState> {
  const values = await getValues(PREMIUM_KEYS);
  return {
    premium_unlocked: values.premium_unlocked,
    trial_start_ts: values.trial_start_ts,
  };
}

/**
 * Sets `trial_start_ts` on first call and is a no-op afterwards. Returns the
 * canonical trial start timestamp (existing or freshly written).
 */
export async function ensureTrialStarted(now: number = Date.now()): Promise<number> {
  const { trial_start_ts } = await getValues(["trial_start_ts"] as const);
  if (typeof trial_start_ts === "number" && Number.isFinite(trial_start_ts)) {
    return trial_start_ts;
  }
  await setValue("trial_start_ts", now);
  return now;
}

/** Flips the persisted premium-unlocked flag to true. */
export async function unlockPremium(): Promise<void> {
  await setValue("premium_unlocked", true);
}

/** True only when the user has actually purchased premium (ignores trial). */
export async function isPremium(): Promise<boolean> {
  const state = await getPremiumState();
  return isPremiumPurchasedPure(state);
}

/** True while the trial window is open. */
export async function isTrial(now: number = Date.now()): Promise<boolean> {
  const state = await getPremiumState();
  return isTrialActivePure(state, now);
}

/** True when premium features should be enabled (purchase OR active trial). */
export async function isPremiumEffective(now: number = Date.now()): Promise<boolean> {
  const state = await getPremiumState();
  return isPremiumEffectivePure(state, now);
}

/** Days left in the trial, or null when not applicable (already purchased). */
export async function trialDaysLeft(now: number = Date.now()): Promise<number | null> {
  const state = await getPremiumState();
  return trialDaysLeftPure(state, now);
}

/** Aggregated premium status snapshot for UI consumption. */
export type PremiumStatus = {
  state: PremiumState;
  isPremium: boolean;
  isTrial: boolean;
  isPremiumEffective: boolean;
  trialDaysLeft: number | null;
};

/** Single read that returns every premium-related derived value at once. */
export async function getPremiumStatus(now: number = Date.now()): Promise<PremiumStatus> {
  const state = await getPremiumState();
  return {
    state,
    isPremium: isPremiumPurchasedPure(state),
    isTrial: isTrialActivePure(state, now),
    isPremiumEffective: isPremiumEffectivePure(state, now),
    trialDaysLeft: trialDaysLeftPure(state, now),
  };
}

/** Narrows a storage snapshot to just the fields `PremiumState` needs. */
export function premiumStateFromStorage(
  values: Pick<StorageSchema, "premium_unlocked" | "trial_start_ts">,
): PremiumState {
  return {
    premium_unlocked: values.premium_unlocked,
    trial_start_ts: values.trial_start_ts,
  };
}
