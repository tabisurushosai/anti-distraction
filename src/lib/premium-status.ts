export type PremiumState = {
  premium_unlocked: boolean;
  trial_start_ts: number | null;
};

export const TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isPremiumPurchased(state: PremiumState): boolean {
  return state.premium_unlocked === true;
}

export function isTrialActive(state: PremiumState, now: number = Date.now()): boolean {
  if (typeof state.trial_start_ts !== "number" || !Number.isFinite(state.trial_start_ts)) {
    return false;
  }
  const elapsed = now - state.trial_start_ts;
  return elapsed >= 0 && elapsed < TRIAL_DAYS * DAY_MS;
}

export function isPremiumEffective(state: PremiumState, now: number = Date.now()): boolean {
  if (isPremiumPurchased(state)) return true;
  return isTrialActive(state, now);
}

export function trialDaysLeft(state: PremiumState, now: number = Date.now()): number | null {
  if (state.premium_unlocked === true) return null;
  if (typeof state.trial_start_ts !== "number" || !Number.isFinite(state.trial_start_ts)) {
    return TRIAL_DAYS;
  }
  const elapsed = now - state.trial_start_ts;
  const remaining = Math.ceil((TRIAL_DAYS * DAY_MS - elapsed) / DAY_MS);
  return Math.max(0, remaining);
}
