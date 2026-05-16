const STORAGE_KEYS = {
  enabled: "enabled",
  sites: "sites",
  dailyLimitMinutes: "dailyLimitMinutes",
  sessionLimitMinutes: "sessionLimitMinutes",
  grayIntensity: "grayIntensity",
  cooldownSeconds: "cooldownSeconds",
  trialStartTs: "trial_start_ts",
  premiumUnlocked: "premium_unlocked",
  usageByDate: "usageByDate",
  schemaVersion: "schemaVersion",
} as const;

const SCHEMA_VERSION = 1;

const DEFAULT_SITES = [
  "youtube.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "facebook.com",
  "tiktok.com",
];

const DEFAULTS = {
  [STORAGE_KEYS.enabled]: true,
  [STORAGE_KEYS.sites]: DEFAULT_SITES,
  [STORAGE_KEYS.dailyLimitMinutes]: 30,
  [STORAGE_KEYS.sessionLimitMinutes]: 10,
  [STORAGE_KEYS.grayIntensity]: 80,
  [STORAGE_KEYS.cooldownSeconds]: 30,
  [STORAGE_KEYS.usageByDate]: {},
  [STORAGE_KEYS.schemaVersion]: SCHEMA_VERSION,
} as const;

const DAILY_RESET_ALARM = "daily-reset";

async function initializeStorage(): Promise<void> {
  const existing = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const updates: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (existing[key] === undefined) {
      updates[key] = value;
    }
  }

  const trial = await chrome.storage.local.get(STORAGE_KEYS.trialStartTs);
  if (trial[STORAGE_KEYS.trialStartTs] === undefined) {
    updates[STORAGE_KEYS.trialStartTs] = Date.now();
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
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

chrome.runtime.onInstalled.addListener(async () => {
  await initializeStorage();
  scheduleDailyReset();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleDailyReset();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DAILY_RESET_ALARM) {
    // Daily usage is keyed by date string, so no explicit clear is needed.
    // Reserved for future cleanup of old entries.
  }
});

export { STORAGE_KEYS, DEFAULTS, SCHEMA_VERSION };
