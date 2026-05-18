/**
 * @file Pure helpers for the "30s peek" cooldown feature: clamping,
 * remaining-time math, and per-day quota bookkeeping. Kept side-effect free
 * so the background worker can compose them around chrome.storage reads.
 */

/** Reason an unblock request was rejected. */
export type CooldownDeniedReason =
  | "rate-limit"
  | "disabled"
  | "premium-required"
  | "not-blocked"
  | "storage-error";

export type CooldownResponse =
  | { ok: true; untilMs: number }
  | { ok: false; reason: CooldownDeniedReason };

export type CooldownCheckState = {
  unblockCountByDate: Record<string, number>;
  unblockMaxPerDayFree: number;
  unblockMaxPerDayPremium: number;
};

export const COOLDOWN_MIN_SECONDS = 5;
export const COOLDOWN_MAX_SECONDS = 300;
export const COOLDOWN_FREE_FIXED_SECONDS = 30;

/**
 * Returns the effective cooldown length in seconds. Free users are pinned to
 * `COOLDOWN_FREE_FIXED_SECONDS`; premium users may pick within
 * [`COOLDOWN_MIN_SECONDS`, `COOLDOWN_MAX_SECONDS`].
 */
export function clampCooldownSeconds(value: number, isPremium: boolean): number {
  if (!Number.isFinite(value)) return COOLDOWN_FREE_FIXED_SECONDS;
  const i = Math.floor(value);
  if (!isPremium) return COOLDOWN_FREE_FIXED_SECONDS;
  if (i < COOLDOWN_MIN_SECONDS) return COOLDOWN_MIN_SECONDS;
  if (i > COOLDOWN_MAX_SECONDS) return COOLDOWN_MAX_SECONDS;
  return i;
}

/** True when the most recent unblock is still within its cooldown window. */
export function isCooldownActive(
  now: number,
  lastUnblockAt: number | null,
  cooldownSeconds: number,
): boolean {
  if (lastUnblockAt === null) return false;
  if (!Number.isFinite(lastUnblockAt)) return false;
  if (!Number.isFinite(cooldownSeconds) || cooldownSeconds <= 0) return false;
  return now - lastUnblockAt < cooldownSeconds * 1000;
}

/** Whole seconds (ceil) remaining in the active cooldown; 0 when inactive. */
export function remainingSeconds(
  now: number,
  lastUnblockAt: number | null,
  cooldownSeconds: number,
): number {
  if (!isCooldownActive(now, lastUnblockAt, cooldownSeconds)) return 0;
  const endMs = (lastUnblockAt ?? 0) + cooldownSeconds * 1000;
  const remainingMs = endMs - now;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 1000);
}

/** Daily unblock quota for the user's current tier; 0 when misconfigured. */
export function dailyMax(state: CooldownCheckState, isPremium: boolean): number {
  const raw = isPremium ? state.unblockMaxPerDayPremium : state.unblockMaxPerDayFree;
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

/** Number of unblocks already consumed on `todayKey` (clamped to >=0). */
export function usedToday(
  state: CooldownCheckState,
  todayKey: string,
): number {
  const v = state.unblockCountByDate[todayKey];
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

/** True (with reason on false) when the user still has unblock quota today. */
export function canUnblock(
  state: CooldownCheckState,
  todayKey: string,
  isPremium: boolean,
): { ok: true } | { ok: false; reason: "rate-limit" } {
  const used = usedToday(state, todayKey);
  const max = dailyMax(state, isPremium);
  if (used >= max) return { ok: false, reason: "rate-limit" };
  return { ok: true };
}

/**
 * Produces the patch the caller must persist after granting an unblock:
 * advance `lastUnblockAt` and increment the per-day counter for `todayKey`.
 */
export function recordUnblock(
  state: CooldownCheckState,
  todayKey: string,
  now: number,
): { lastUnblockAt: number; unblockCountByDate: Record<string, number> } {
  const used = usedToday(state, todayKey);
  return {
    lastUnblockAt: now,
    unblockCountByDate: { ...state.unblockCountByDate, [todayKey]: used + 1 },
  };
}
