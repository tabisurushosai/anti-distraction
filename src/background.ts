/**
 * @file MV3 service worker. Owns the in-memory `tracker` (active tab/host,
 * session, cooldown), reacts to chrome.tabs/windows/idle events, and uses
 * chrome.alarms to drive the ~15s evaluation tick, daily-reset, and stats
 * cleanup. Sends `ad/time-limit/*` messages to content scripts to show or
 * hide the block overlay.
 */

import {
  DEFAULTS,
  addUsageMs,
  ensureDefaults,
  getValue,
  getValues,
  setValue,
  setValues,
  todayKey,
} from "./storage";
import { hostMatches } from "./lib/host-match";
import {
  IDLE_RESET_THRESHOLD_SECONDS,
  advanceSession,
  emptySession,
  evaluateBlock,
  extractHostFromUrl,
  isSameHost,
  startSession,
  type SessionState,
} from "./lib/time-tracker";
import { pruneUsage } from "./lib/usage-stats";
import {
  canUnblock,
  isCooldownActive,
  recordUnblock,
  type CooldownResponse,
} from "./lib/cooldown";
import { isPremiumEffective } from "./lib/premium-status";
import { handleReturnUrl } from "./upgrade";

const DAILY_RESET_ALARM = "daily-reset";
const TIME_LIMIT_ALARM = "time-limit-tick";
const DAILY_STATS_CLEANUP_ALARM = "daily-stats-cleanup";
const TIME_LIMIT_PERIOD_MIN = 0.25;
const STATS_RETAIN_DAYS = 90;
const TRIAL_START_KEY = "trial_start_ts" as const;

let cleanupRanOnce = false;

type Tracker = {
  session: SessionState;
  activeTabId: number | null;
  activeHost: string | null;
  windowFocused: boolean;
  idle: boolean;
  lastBlockTabId: number | null;
  cooldownUntil: number | null;
  unblockInFlight: boolean;
};

const tracker: Tracker = {
  session: emptySession(),
  activeTabId: null,
  activeHost: null,
  windowFocused: true,
  idle: false,
  lastBlockTabId: null,
  cooldownUntil: null,
  unblockInFlight: false,
};

/** Re-hydrates `tracker.cooldownUntil` on worker wakeup from persisted state. */
async function restoreCooldownFromStorage(): Promise<void> {
  try {
    const { lastUnblockAt, cooldownSeconds } = await getValues([
      "lastUnblockAt",
      "cooldownSeconds",
    ] as const);
    if (lastUnblockAt !== null) {
      const untilMs = lastUnblockAt + cooldownSeconds * 1000;
      if (untilMs > Date.now()) {
        tracker.cooldownUntil = untilMs;
      } else {
        tracker.cooldownUntil = null;
      }
    }
  } catch {
    /* fail-safe */
  }
}

/** Stamps the trial start timestamp on the very first install. */
async function initializeTrial(): Promise<void> {
  const existing = await chrome.storage.local.get(TRIAL_START_KEY);
  if (existing[TRIAL_START_KEY] === undefined) {
    await chrome.storage.local.set({ [TRIAL_START_KEY]: Date.now() });
  }
}

/** (Re)creates the alarm that runs every midnight local time. */
function scheduleDailyReset(): void {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  chrome.alarms.create(DAILY_RESET_ALARM, {
    when: next.getTime(),
    periodInMinutes: 24 * 60,
  });
}

/** (Re)creates the high-frequency tick (~15s) that drives session/block evaluation. */
function scheduleTimeLimitTick(): void {
  chrome.alarms.create(TIME_LIMIT_ALARM, {
    periodInMinutes: TIME_LIMIT_PERIOD_MIN,
  });
}

/** (Re)creates the once-per-day alarm that prunes old usage entries. */
function scheduleStatsCleanup(): void {
  chrome.alarms.create(DAILY_STATS_CLEANUP_ALARM, {
    periodInMinutes: 60 * 24,
  });
}

/** Drops usage/unblock entries older than `STATS_RETAIN_DAYS`. */
async function runStatsCleanup(): Promise<void> {
  try {
    const { usageByDate, unblockCountByDate } = await getValues([
      "usageByDate",
      "unblockCountByDate",
    ] as const);
    const today = new Date();
    const nextUsage = pruneUsage(usageByDate, today, STATS_RETAIN_DAYS);
    const nextUnblock = pruneUsage(unblockCountByDate, today, STATS_RETAIN_DAYS);
    const patch: Partial<{
      usageByDate: typeof nextUsage;
      unblockCountByDate: typeof nextUnblock;
    }> = {};
    if (Object.keys(usageByDate).length !== Object.keys(nextUsage).length) {
      patch.usageByDate = nextUsage;
    }
    if (Object.keys(unblockCountByDate).length !== Object.keys(nextUnblock).length) {
      patch.unblockCountByDate = nextUnblock;
    }
    if (Object.keys(patch).length > 0) {
      await setValues(patch);
    }
  } catch {
    /* fail-safe: skip cleanup on storage failure */
  }
}

async function runCleanupIfNeeded(): Promise<void> {
  if (cleanupRanOnce) return;
  cleanupRanOnce = true;
  await runStatsCleanup();
}

function setIdleDetection(): void {
  try {
    chrome.idle.setDetectionInterval(IDLE_RESET_THRESHOLD_SECONDS);
  } catch {
    /* older Chrome may reject sub-minute intervals; ignore */
  }
}

function isMeasuring(): boolean {
  return (
    tracker.activeHost !== null &&
    tracker.windowFocused &&
    !tracker.idle
  );
}

function resetSession(): void {
  tracker.session = emptySession();
}

/** Looks up the currently active tab and re-derives `tracker.activeHost`. */
async function refreshActiveTab(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || tab.id === undefined) {
      tracker.activeTabId = null;
      tracker.activeHost = null;
      resetSession();
      return;
    }
    await applyActiveTab(tab);
  } catch {
    tracker.activeTabId = null;
    tracker.activeHost = null;
    resetSession();
  }
}

/**
 * Updates the in-memory session for the given active tab: starts a fresh
 * session on host change, clears the host when the tab is off-list, and
 * touches `lastTickAt` when staying on the same host.
 */
async function applyActiveTab(tab: chrome.tabs.Tab): Promise<void> {
  const tabId = tab.id ?? null;
  const host = extractHostFromUrl(tab.url);
  const sites = await getValue("sites");
  const enabled = await getValue("enabled");
  const matched = enabled && host !== null && hostMatches(host, sites) ? host : null;

  tracker.activeTabId = tabId;

  if (matched === null) {
    if (tracker.activeHost !== null) {
      resetSession();
      tracker.cooldownUntil = null;
    }
    tracker.activeHost = null;
    return;
  }

  if (!isSameHost(tracker.activeHost, matched)) {
    tracker.activeHost = matched;
    tracker.session = startSession(matched, Date.now());
    tracker.cooldownUntil = null;
  } else {
    tracker.activeHost = matched;
    if (tracker.session.host === null) {
      tracker.session = startSession(matched, Date.now());
    } else {
      tracker.session = { ...tracker.session, lastTickAt: Date.now() };
    }
  }
}

async function sendToTab(tabId: number, message: unknown): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    /* receiver may not be ready; safe to ignore */
  }
}

/**
 * Tick handler: decides whether the active tab should be blocked given the
 * current session/today usage and cooldown state, and notifies the content
 * script via `ad/time-limit/{block,unblock}`.
 */
async function evaluateAndBlock(): Promise<void> {
  if (tracker.activeTabId === null) return;
  const tabId = tracker.activeTabId;
  const cfg = await getValues([
    "enabled",
    "dailyLimitMinutes",
    "sessionLimitMinutes",
    "usageByDate",
    "sites",
    "lastUnblockAt",
    "cooldownSeconds",
  ] as const);
  if (!cfg.enabled || tracker.activeHost === null) {
    await sendToTab(tabId, { type: "ad/time-limit/unblock" });
    return;
  }
  if (!hostMatches(tracker.activeHost, cfg.sites)) {
    await sendToTab(tabId, { type: "ad/time-limit/unblock" });
    return;
  }
  const now = Date.now();
  if (
    tracker.cooldownUntil !== null &&
    tracker.cooldownUntil > now
  ) {
    return;
  }
  if (isCooldownActive(now, cfg.lastUnblockAt, cfg.cooldownSeconds)) {
    tracker.cooldownUntil = (cfg.lastUnblockAt ?? 0) + cfg.cooldownSeconds * 1000;
    return;
  }
  if (tracker.cooldownUntil !== null && tracker.cooldownUntil <= now) {
    tracker.cooldownUntil = null;
  }
  const todayMs = cfg.usageByDate[todayKey()] ?? 0;
  const reason = evaluateBlock(
    {
      enabled: cfg.enabled,
      dailyLimitMinutes: cfg.dailyLimitMinutes,
      sessionLimitMinutes: cfg.sessionLimitMinutes,
    },
    todayMs,
    tracker.session.accumulatedMs,
  );
  if (reason !== null) {
    await sendToTab(tabId, { type: "ad/time-limit/block", reason });
    tracker.lastBlockTabId = tabId;
  } else {
    await sendToTab(tabId, { type: "ad/time-limit/unblock" });
  }
}

/**
 * Handles the `ad/time-limit/request-unblock` message from popup/content.
 * Enforces enabled/quota/premium constraints, then persists the new state
 * and arms the in-memory cooldown so the next tick will not re-block.
 */
async function onRequestUnblock(senderTabId: number | null): Promise<CooldownResponse> {
  try {
    const cfg = await getValues([
      "enabled",
      "sites",
      "cooldownSeconds",
      "dailyLimitMinutes",
      "sessionLimitMinutes",
      "usageByDate",
      "lastUnblockAt",
      "unblockCountByDate",
      "unblockMaxPerDayFree",
      "unblockMaxPerDayPremium",
      "premium_unlocked",
      "trial_start_ts",
    ] as const);

    if (!cfg.enabled) return { ok: false, reason: "disabled" };
    if (tracker.activeHost === null) return { ok: false, reason: "not-blocked" };
    if (!hostMatches(tracker.activeHost, cfg.sites)) {
      return { ok: false, reason: "not-blocked" };
    }

    const now = Date.now();

    if (tracker.cooldownUntil !== null && tracker.cooldownUntil > now) {
      return { ok: true, untilMs: tracker.cooldownUntil };
    }

    const todayMs = cfg.usageByDate[todayKey()] ?? 0;
    const reason = evaluateBlock(
      {
        enabled: cfg.enabled,
        dailyLimitMinutes: cfg.dailyLimitMinutes,
        sessionLimitMinutes: cfg.sessionLimitMinutes,
      },
      todayMs,
      tracker.session.accumulatedMs,
    );
    if (reason === null) return { ok: false, reason: "not-blocked" };

    if (tracker.unblockInFlight) {
      return { ok: false, reason: "rate-limit" };
    }
    tracker.unblockInFlight = true;

    try {
      const isPremium = isPremiumEffective(
        {
          premium_unlocked: cfg.premium_unlocked,
          trial_start_ts: cfg.trial_start_ts,
        },
        now,
      );
      const key = todayKey();
      const check = canUnblock(
        {
          unblockCountByDate: cfg.unblockCountByDate,
          unblockMaxPerDayFree: cfg.unblockMaxPerDayFree,
          unblockMaxPerDayPremium: cfg.unblockMaxPerDayPremium,
        },
        key,
        isPremium,
      );
      if (!check.ok) {
        return { ok: false, reason: check.reason };
      }

      const recorded = recordUnblock(
        {
          unblockCountByDate: cfg.unblockCountByDate,
          unblockMaxPerDayFree: cfg.unblockMaxPerDayFree,
          unblockMaxPerDayPremium: cfg.unblockMaxPerDayPremium,
        },
        key,
        now,
      );
      const seconds = Math.max(1, Math.floor(cfg.cooldownSeconds));
      const untilMs = now + seconds * 1000;
      await setValues({
        lastUnblockAt: recorded.lastUnblockAt,
        unblockCountByDate: recorded.unblockCountByDate,
      });
      tracker.cooldownUntil = untilMs;
      if (senderTabId !== null) {
        await sendToTab(senderTabId, {
          type: "ad/time-limit/cooldown-active",
          untilMs,
        });
        await sendToTab(senderTabId, { type: "ad/time-limit/unblock" });
      }
      return { ok: true, untilMs };
    } finally {
      tracker.unblockInFlight = false;
    }
  } catch {
    return { ok: false, reason: "storage-error" };
  }
}

/** Periodic tick: advances the session, accumulates usage, then re-evaluates blocking. */
async function onTick(): Promise<void> {
  if (!isMeasuring()) {
    if (tracker.session.host !== null) {
      tracker.session = { ...tracker.session, lastTickAt: Date.now() };
    }
    return;
  }
  const now = Date.now();
  if (tracker.session.host === null && tracker.activeHost !== null) {
    tracker.session = startSession(tracker.activeHost, now);
  }
  const { next, deltaMs } = advanceSession(tracker.session, now);
  tracker.session = next;
  if (deltaMs > 0) {
    try {
      await addUsageMs(deltaMs);
    } catch {
      /* fail-safe: skip accounting on storage failure */
    }
  }
  await evaluateAndBlock();
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  await initializeTrial();
  scheduleDailyReset();
  scheduleTimeLimitTick();
  scheduleStatsCleanup();
  setIdleDetection();
  await restoreCooldownFromStorage();
  await refreshActiveTab();
  await runCleanupIfNeeded();
});

chrome.runtime.onStartup.addListener(async () => {
  scheduleDailyReset();
  scheduleTimeLimitTick();
  scheduleStatsCleanup();
  setIdleDetection();
  await restoreCooldownFromStorage();
  await refreshActiveTab();
  await runCleanupIfNeeded();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const type = (message as { type?: unknown }).type;
  if (type !== "ad/time-limit/request-unblock") return false;
  const tabId = sender.tab?.id ?? null;
  const resolveTabId = async (): Promise<number | null> => {
    if (tabId !== null) return tabId;
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      return tab?.id ?? null;
    } catch {
      return null;
    }
  };
  void (async () => {
    const targetTabId = await resolveTabId();
    const res = await onRequestUnblock(targetTabId);
    try {
      sendResponse(res);
    } catch {
      /* ignore */
    }
  })();
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TIME_LIMIT_ALARM) {
    void onTick();
    return;
  }
  if (alarm.name === DAILY_STATS_CLEANUP_ALARM) {
    void runStatsCleanup();
    return;
  }
  if (alarm.name === DAILY_RESET_ALARM) {
    /* usage keys are date-stamped; reserved for future cleanup */
  }
});

chrome.tabs.onActivated.addListener(async (info) => {
  try {
    const tab = await chrome.tabs.get(info.tabId);
    await applyActiveTab(tab);
    await evaluateAndBlock();
  } catch {
    /* tab may be gone; ignore */
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const candidateUrl = changeInfo.url ?? tab.url;
  if (typeof candidateUrl === "string" && candidateUrl.length > 0) {
    const res = await handleReturnUrl(candidateUrl);
    if (res.ok) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        /* tab may already be gone */
      }
      return;
    }
  }
  if (!tab.active) return;
  if (changeInfo.status !== "complete" && changeInfo.url === undefined) return;
  if (tabId !== tracker.activeTabId && !tab.active) return;
  await applyActiveTab(tab);
  await evaluateAndBlock();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === tracker.activeTabId) {
    tracker.activeTabId = null;
    tracker.activeHost = null;
    resetSession();
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    tracker.windowFocused = false;
    return;
  }
  tracker.windowFocused = true;
  await refreshActiveTab();
  await evaluateAndBlock();
});

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === "active") {
    tracker.idle = false;
    if (tracker.session.host !== null) {
      tracker.session = { ...tracker.session, lastTickAt: Date.now() };
    }
  } else {
    tracker.idle = true;
    resetSession();
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if ("enabled" in changes || "sites" in changes) {
    await refreshActiveTab();
    await evaluateAndBlock();
  }
  if (
    "dailyLimitMinutes" in changes ||
    "sessionLimitMinutes" in changes ||
    "usageByDate" in changes
  ) {
    await evaluateAndBlock();
  }
});

export { TIME_LIMIT_ALARM, DAILY_RESET_ALARM, DEFAULTS, setValue };
