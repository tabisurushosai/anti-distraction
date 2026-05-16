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
};

const tracker: Tracker = {
  session: emptySession(),
  activeTabId: null,
  activeHost: null,
  windowFocused: true,
  idle: false,
  lastBlockTabId: null,
};

async function initializeTrial(): Promise<void> {
  const existing = await chrome.storage.local.get(TRIAL_START_KEY);
  if (existing[TRIAL_START_KEY] === undefined) {
    await chrome.storage.local.set({ [TRIAL_START_KEY]: Date.now() });
  }
}

function scheduleDailyReset(): void {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  chrome.alarms.create(DAILY_RESET_ALARM, {
    when: next.getTime(),
    periodInMinutes: 24 * 60,
  });
}

function scheduleTimeLimitTick(): void {
  chrome.alarms.create(TIME_LIMIT_ALARM, {
    periodInMinutes: TIME_LIMIT_PERIOD_MIN,
  });
}

function scheduleStatsCleanup(): void {
  chrome.alarms.create(DAILY_STATS_CLEANUP_ALARM, {
    periodInMinutes: 60 * 24,
  });
}

async function runStatsCleanup(): Promise<void> {
  try {
    const usage = await getValue("usageByDate");
    const next = pruneUsage(usage, new Date(), STATS_RETAIN_DAYS);
    const before = Object.keys(usage).length;
    const after = Object.keys(next).length;
    if (before !== after) {
      await setValues({ usageByDate: next });
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

async function applyActiveTab(tab: chrome.tabs.Tab): Promise<void> {
  const tabId = tab.id ?? null;
  const host = extractHostFromUrl(tab.url);
  const sites = await getValue("sites");
  const enabled = await getValue("enabled");
  const matched = enabled && host !== null && hostMatches(host, sites) ? host : null;

  tracker.activeTabId = tabId;

  if (matched === null) {
    if (tracker.activeHost !== null) resetSession();
    tracker.activeHost = null;
    return;
  }

  if (!isSameHost(tracker.activeHost, matched)) {
    tracker.activeHost = matched;
    tracker.session = startSession(matched, Date.now());
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

async function evaluateAndBlock(): Promise<void> {
  if (tracker.activeTabId === null) return;
  const tabId = tracker.activeTabId;
  const cfg = await getValues([
    "enabled",
    "dailyLimitMinutes",
    "sessionLimitMinutes",
    "usageByDate",
    "sites",
  ] as const);
  if (!cfg.enabled || tracker.activeHost === null) {
    await sendToTab(tabId, { type: "ad/time-limit/unblock" });
    return;
  }
  if (!hostMatches(tracker.activeHost, cfg.sites)) {
    await sendToTab(tabId, { type: "ad/time-limit/unblock" });
    return;
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
  await refreshActiveTab();
  await runCleanupIfNeeded();
});

chrome.runtime.onStartup.addListener(async () => {
  scheduleDailyReset();
  scheduleTimeLimitTick();
  scheduleStatsCleanup();
  setIdleDetection();
  await refreshActiveTab();
  await runCleanupIfNeeded();
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
