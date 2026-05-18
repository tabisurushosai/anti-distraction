/**
 * @file Pure session/usage time-tracking helpers used by the background
 * service worker. Kept side-effect free so they can be unit-tested without
 * mocking chrome.* APIs.
 */

/** Why the user is currently blocked, or null when not blocked. */
export type BlockReason = "daily" | "session" | null;

export type LimitConfig = {
  enabled: boolean;
  dailyLimitMinutes: number;
  sessionLimitMinutes: number;
};

export type SessionState = {
  host: string | null;
  startedAt: number | null;
  accumulatedMs: number;
  lastTickAt: number | null;
};

/** Seconds of user inactivity after which an active session is reset. */
export const IDLE_RESET_THRESHOLD_SECONDS = 30;

/** Returns a fresh session with no active host. */
export function emptySession(): SessionState {
  return { host: null, startedAt: null, accumulatedMs: 0, lastTickAt: null };
}

/** Starts a new session anchored to `host` at the given epoch ms. */
export function startSession(host: string, at: number): SessionState {
  return { host, startedAt: at, accumulatedMs: 0, lastTickAt: at };
}

/** True when both hosts are non-null and equal. */
export function isSameHost(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a === b;
}

/**
 * Adds elapsed time since `prev.lastTickAt` to the session and returns the
 * updated session plus the delta actually applied. Negative or non-finite
 * deltas are dropped, and any delta is clamped to `maxDeltaMs` to prevent a
 * single tick spanning a sleep/wake from counting full hours.
 */
export function advanceSession(
  prev: SessionState,
  now: number,
  maxDeltaMs = 5 * 60_000,
): { next: SessionState; deltaMs: number } {
  if (prev.host === null || prev.lastTickAt === null) {
    return { next: prev, deltaMs: 0 };
  }
  const raw = now - prev.lastTickAt;
  if (!Number.isFinite(raw) || raw <= 0) {
    return { next: { ...prev, lastTickAt: now }, deltaMs: 0 };
  }
  const delta = Math.min(raw, maxDeltaMs);
  return {
    next: {
      ...prev,
      accumulatedMs: prev.accumulatedMs + delta,
      lastTickAt: now,
    },
    deltaMs: delta,
  };
}

/**
 * Decides whether the current session should be blocked given today's total
 * usage and the in-progress session length. Returns null when nothing applies
 * (extension disabled, no limits set, or under limits).
 */
export function evaluateBlock(
  cfg: LimitConfig,
  todayUsageMs: number,
  sessionMs: number,
): BlockReason {
  if (!cfg.enabled) return null;
  const dailyLimitMs = cfg.dailyLimitMinutes * 60_000;
  if (cfg.dailyLimitMinutes > 0 && todayUsageMs >= dailyLimitMs) {
    return "daily";
  }
  const sessionLimitMs = cfg.sessionLimitMinutes * 60_000;
  if (cfg.sessionLimitMinutes > 0 && sessionMs >= sessionLimitMs) {
    return "session";
  }
  return null;
}

/**
 * Returns the hostname for an http(s) URL, or null for missing/invalid input
 * or other schemes (chrome://, file://, about:blank, etc.).
 */
export function extractHostFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname;
  } catch {
    return null;
  }
}
