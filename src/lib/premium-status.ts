/**
 * @file Pure predicates over the premium/trial state persisted in storage.
 * The async storage wrappers live in `src/premium.ts`; this module is kept
 * pure so the predicates can be unit-tested without chrome.storage.
 */

/** Snapshot of the two storage keys that drive premium-effective behavior. */
export type PremiumState = {
  premium_unlocked: boolean;
  trial_start_ts: number | null;
};

/** Length of the post-install free trial in days. */
export const TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** True only when a license/purchase has been applied (ignores trial). */
export function isPremiumPurchased(state: PremiumState): boolean {
  return state.premium_unlocked === true;
}

/** True when a trial has been started and the `TRIAL_DAYS` window has not elapsed. */
export function isTrialActive(state: PremiumState, now: number = Date.now()): boolean {
  if (typeof state.trial_start_ts !== "number" || !Number.isFinite(state.trial_start_ts)) {
    return false;
  }
  const elapsed = now - state.trial_start_ts;
  return elapsed >= 0 && elapsed < TRIAL_DAYS * DAY_MS;
}

/** True when premium features should be available (purchase OR active trial). */
export function isPremiumEffective(state: PremiumState, now: number = Date.now()): boolean {
  if (isPremiumPurchased(state)) return true;
  return isTrialActive(state, now);
}

/**
 * Days remaining in the trial. Returns null for purchased users (no trial
 * concept applies), `TRIAL_DAYS` when the trial hasn't started yet, and a
 * non-negative integer otherwise.
 */
export function trialDaysLeft(state: PremiumState, now: number = Date.now()): number | null {
  if (state.premium_unlocked === true) return null;
  if (typeof state.trial_start_ts !== "number" || !Number.isFinite(state.trial_start_ts)) {
    return TRIAL_DAYS;
  }
  const elapsed = now - state.trial_start_ts;
  const remaining = Math.ceil((TRIAL_DAYS * DAY_MS - elapsed) / DAY_MS);
  return Math.max(0, remaining);
}
