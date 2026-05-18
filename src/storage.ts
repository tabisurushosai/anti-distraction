/**
 * @file Typed wrapper around `chrome.storage.local`. Centralizes the schema,
 * defaults, and per-key validators so callers never see `unknown` and a
 * corrupted/missing key transparently falls back to its default value.
 */

/** Map of `YYYY-MM-DD` (local) -> milliseconds of usage on that day. */
export type UsageByDate = Record<string, number>;
/** Map of `YYYY-MM-DD` (local) -> number of unblocks used on that day. */
export type UnblockCountByDate = Record<string, number>;

/** Full shape of `chrome.storage.local` for this extension. */
export type StorageSchema = {
  enabled: boolean;
  sites: string[];
  dailyLimitMinutes: number;
  sessionLimitMinutes: number;
  grayIntensity: number;
  cooldownSeconds: number;
  usageByDate: UsageByDate;
  schemaVersion: number;
  trial_start_ts: number | null;
  premium_unlocked: boolean;
  lastUnblockAt: number | null;
  unblockCountByDate: UnblockCountByDate;
  unblockMaxPerDayFree: number;
  unblockMaxPerDayPremium: number;
};

/** Union of all valid keys in `StorageSchema`. */
export type StorageKey = keyof StorageSchema;

/** Persisted schema version, bumped when a migration is required. */
export const SCHEMA_VERSION = 1;

/** Sites pre-populated on first install. Must stay aligned with the manifest. */
export const DEFAULT_SITES: readonly string[] = [
  "youtube.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "facebook.com",
  "tiktok.com",
];

/** Default values applied when a key is missing or fails validation. */
export const DEFAULTS: StorageSchema = {
  enabled: true,
  sites: [...DEFAULT_SITES],
  dailyLimitMinutes: 30,
  sessionLimitMinutes: 10,
  grayIntensity: 80,
  cooldownSeconds: 30,
  usageByDate: {},
  schemaVersion: SCHEMA_VERSION,
  trial_start_ts: null,
  premium_unlocked: false,
  lastUnblockAt: null,
  unblockCountByDate: {},
  unblockMaxPerDayFree: 3,
  unblockMaxPerDayPremium: 10,
};

type Validator<T> = (value: unknown) => value is T;

function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === "string");
}

function isUsageByDate(v: unknown): v is UsageByDate {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every((n) =>
    typeof n === "number" && Number.isFinite(n),
  );
}

function isUnblockCountByDate(v: unknown): v is UnblockCountByDate {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every((n) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0,
  );
}

function isNumberOrNull(v: unknown): v is number | null {
  return v === null || isFiniteNumber(v);
}

const VALIDATORS: { [K in StorageKey]: Validator<StorageSchema[K]> } = {
  enabled: isBoolean,
  sites: isStringArray,
  dailyLimitMinutes: isFiniteNumber,
  sessionLimitMinutes: isFiniteNumber,
  grayIntensity: isFiniteNumber,
  cooldownSeconds: isFiniteNumber,
  usageByDate: isUsageByDate,
  schemaVersion: isFiniteNumber,
  trial_start_ts: isNumberOrNull,
  premium_unlocked: isBoolean,
  lastUnblockAt: isNumberOrNull,
  unblockCountByDate: isUnblockCountByDate,
  unblockMaxPerDayFree: isFiniteNumber,
  unblockMaxPerDayPremium: isFiniteNumber,
};

function coerce<K extends StorageKey>(key: K, raw: unknown): StorageSchema[K] {
  return VALIDATORS[key](raw) ? raw : DEFAULTS[key];
}

/** Reads a single key, falling back to its default if missing or invalid. */
export async function getValue<K extends StorageKey>(key: K): Promise<StorageSchema[K]> {
  const data = await chrome.storage.local.get(key);
  return coerce(key, data[key]);
}

/** Reads multiple keys in a single chrome.storage round-trip. */
export async function getValues<K extends StorageKey>(
  keys: readonly K[],
): Promise<Pick<StorageSchema, K>> {
  const data = await chrome.storage.local.get([...keys]);
  const out = {} as Pick<StorageSchema, K>;
  for (const k of keys) {
    out[k] = coerce(k, data[k]);
  }
  return out;
}

/** Reads the entire schema; useful for export/snapshot operations. */
export async function getAll(): Promise<StorageSchema> {
  const keys = Object.keys(DEFAULTS) as StorageKey[];
  const data = await chrome.storage.local.get(keys);
  const out = { ...DEFAULTS };
  for (const k of keys) {
    (out as Record<string, unknown>)[k] = coerce(k, data[k]);
  }
  return out;
}

/** Writes a single key. Caller is responsible for type-correct values. */
export async function setValue<K extends StorageKey>(
  key: K,
  value: StorageSchema[K],
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

/** Writes multiple keys atomically (single chrome.storage.set call). */
export async function setValues(patch: Partial<StorageSchema>): Promise<void> {
  await chrome.storage.local.set(patch);
}

/** Removes a single key from storage; next read will return its default. */
export async function removeValue(key: StorageKey): Promise<void> {
  await chrome.storage.local.remove(key);
}

/**
 * Writes only the keys that are currently absent. Called on install/update
 * so existing user data is never overwritten while new keys get a sane value.
 */
export async function ensureDefaults(): Promise<void> {
  const keys = Object.keys(DEFAULTS) as StorageKey[];
  const existing = await chrome.storage.local.get(keys);
  const patch: Partial<StorageSchema> = {};
  for (const k of keys) {
    if (existing[k] === undefined) {
      (patch as Record<string, unknown>)[k] = DEFAULTS[k];
    }
  }
  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }
}

/** Typed equivalent of `chrome.storage.StorageChange` for one key. */
export type TypedChange<K extends StorageKey> = {
  key: K;
  oldValue: StorageSchema[K] | undefined;
  newValue: StorageSchema[K] | undefined;
};

/** Listener invoked with the subset of keys that actually changed. */
export type StorageChangeListener = (changes: {
  [K in StorageKey]?: TypedChange<K>;
}) => void;

/**
 * Subscribes to `chrome.storage.local` changes with per-key types and
 * default-coerced values. Returns an unsubscribe function.
 */
export function onStorageChanged(listener: StorageChangeListener): () => void {
  const handler = (
    changes: { [k: string]: chrome.storage.StorageChange },
    area: chrome.storage.AreaName,
  ): void => {
    if (area !== "local") return;
    const typed: { [K in StorageKey]?: TypedChange<K> } = {};
    for (const k of Object.keys(changes) as StorageKey[]) {
      if (!(k in DEFAULTS)) continue;
      const change = changes[k];
      (typed as Record<string, unknown>)[k] = {
        key: k,
        oldValue:
          change.oldValue === undefined
            ? undefined
            : coerce(k, change.oldValue),
        newValue:
          change.newValue === undefined
            ? undefined
            : coerce(k, change.newValue),
      };
    }
    if (Object.keys(typed).length > 0) listener(typed);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

/** `YYYY-MM-DD` for the local timezone of `date` (defaults to now). */
export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Adds `ms` to today's usage entry and returns the new running total. Non-
 * positive or non-finite inputs are dropped (the current total is returned
 * unchanged), which lets the background worker pass raw deltas directly.
 */
export async function addUsageMs(ms: number, date: Date = new Date()): Promise<number> {
  if (!Number.isFinite(ms) || ms <= 0) {
    const current = await getValue("usageByDate");
    return current[todayKey(date)] ?? 0;
  }
  const key = todayKey(date);
  const usage = await getValue("usageByDate");
  const next: UsageByDate = { ...usage, [key]: (usage[key] ?? 0) + ms };
  await setValue("usageByDate", next);
  return next[key];
}
