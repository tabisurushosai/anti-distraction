export type UsageByDate = Record<string, number>;
export type UnblockCountByDate = Record<string, number>;

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

export type StorageKey = keyof StorageSchema;

export const SCHEMA_VERSION = 1;

export const DEFAULT_SITES: readonly string[] = [
  "youtube.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "facebook.com",
  "tiktok.com",
];

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

export async function getValue<K extends StorageKey>(key: K): Promise<StorageSchema[K]> {
  const data = await chrome.storage.local.get(key);
  return coerce(key, data[key]);
}

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

export async function getAll(): Promise<StorageSchema> {
  const keys = Object.keys(DEFAULTS) as StorageKey[];
  const data = await chrome.storage.local.get(keys);
  const out = { ...DEFAULTS };
  for (const k of keys) {
    (out as Record<string, unknown>)[k] = coerce(k, data[k]);
  }
  return out;
}

export async function setValue<K extends StorageKey>(
  key: K,
  value: StorageSchema[K],
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function setValues(patch: Partial<StorageSchema>): Promise<void> {
  await chrome.storage.local.set(patch);
}

export async function removeValue(key: StorageKey): Promise<void> {
  await chrome.storage.local.remove(key);
}

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

export type TypedChange<K extends StorageKey> = {
  key: K;
  oldValue: StorageSchema[K] | undefined;
  newValue: StorageSchema[K] | undefined;
};

export type StorageChangeListener = (changes: {
  [K in StorageKey]?: TypedChange<K>;
}) => void;

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
      typed[k] = {
        key: k,
        oldValue:
          change.oldValue === undefined
            ? undefined
            : coerce(k, change.oldValue),
        newValue:
          change.newValue === undefined
            ? undefined
            : coerce(k, change.newValue),
      } as TypedChange<typeof k>;
    }
    if (Object.keys(typed).length > 0) listener(typed);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
