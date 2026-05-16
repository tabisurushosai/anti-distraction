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

export const IDLE_RESET_THRESHOLD_SECONDS = 30;

export function emptySession(): SessionState {
  return { host: null, startedAt: null, accumulatedMs: 0, lastTickAt: null };
}

export function startSession(host: string, at: number): SessionState {
  return { host, startedAt: at, accumulatedMs: 0, lastTickAt: at };
}

export function isSameHost(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a === b;
}

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
