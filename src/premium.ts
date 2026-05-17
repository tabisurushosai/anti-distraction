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

export async function getPremiumState(): Promise<PremiumState> {
  const values = await getValues(PREMIUM_KEYS);
  return {
    premium_unlocked: values.premium_unlocked,
    trial_start_ts: values.trial_start_ts,
  };
}

export async function ensureTrialStarted(now: number = Date.now()): Promise<number> {
  const { trial_start_ts } = await getValues(["trial_start_ts"] as const);
  if (typeof trial_start_ts === "number" && Number.isFinite(trial_start_ts)) {
    return trial_start_ts;
  }
  await setValue("trial_start_ts", now);
  return now;
}

export async function unlockPremium(): Promise<void> {
  await setValue("premium_unlocked", true);
}

export async function isPremium(): Promise<boolean> {
  const state = await getPremiumState();
  return isPremiumPurchasedPure(state);
}

export async function isTrial(now: number = Date.now()): Promise<boolean> {
  const state = await getPremiumState();
  return isTrialActivePure(state, now);
}

export async function isPremiumEffective(now: number = Date.now()): Promise<boolean> {
  const state = await getPremiumState();
  return isPremiumEffectivePure(state, now);
}

export async function trialDaysLeft(now: number = Date.now()): Promise<number | null> {
  const state = await getPremiumState();
  return trialDaysLeftPure(state, now);
}

export type PremiumStatus = {
  state: PremiumState;
  isPremium: boolean;
  isTrial: boolean;
  isPremiumEffective: boolean;
  trialDaysLeft: number | null;
};

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

export function premiumStateFromStorage(
  values: Pick<StorageSchema, "premium_unlocked" | "trial_start_ts">,
): PremiumState {
  return {
    premium_unlocked: values.premium_unlocked,
    trial_start_ts: values.trial_start_ts,
  };
}
