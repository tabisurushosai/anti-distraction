import type { UsageByDate } from "../storage";

export type UsageRow = {
  key: string;
  ms: number;
  minutes: number;
  exceeded: boolean;
};

export type UsageSummary = UsageRow[];

export type StreakResult = {
  current: number;
  best: number;
};

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(key: string): Date | null {
  const match = DATE_KEY_RE.exec(key);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function lastNDays(today: Date, n: number): string[] {
  if (!Number.isFinite(n) || n <= 0) return [];
  const count = Math.floor(n);
  const base = startOfLocalDay(today);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    out.push(toLocalDateKey(d));
  }
  return out;
}

export function msToMinutes(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 60_000);
}

export function summarizeUsage(
  usage: UsageByDate,
  keys: readonly string[],
  dailyLimitMinutes: number,
): UsageSummary {
  const limit = Number.isFinite(dailyLimitMinutes) ? Math.max(0, Math.floor(dailyLimitMinutes)) : 0;
  return keys.map((key) => {
    const ms = usage[key] ?? 0;
    const minutes = msToMinutes(ms);
    const exceeded = limit > 0 && minutes >= limit;
    return { key, ms, minutes, exceeded };
  });
}

export function formatMinutes(
  minutes: number,
  template: { hoursMinutes: string; minutesOnly: string },
): string {
  const safe = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 0;
  if (safe < 60) {
    return template.minutesOnly.replace("$MIN$", String(safe));
  }
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return template.hoursMinutes.replace("$H$", String(h)).replace("$M$", String(m));
}

export function pruneUsage(
  usage: UsageByDate,
  today: Date,
  retainDays: number,
): UsageByDate {
  const out: UsageByDate = {};
  if (!usage || typeof usage !== "object") return out;
  const retain = Number.isFinite(retainDays) && retainDays > 0 ? Math.floor(retainDays) : 0;
  if (retain === 0) return out;
  const todayStart = startOfLocalDay(today);
  const cutoff = new Date(todayStart);
  cutoff.setDate(todayStart.getDate() - (retain - 1));
  const cutoffMs = cutoff.getTime();
  for (const [k, v] of Object.entries(usage)) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const parsed = parseDateKey(k);
    if (parsed === null) continue;
    if (parsed.getTime() < cutoffMs) continue;
    out[k] = v;
  }
  return out;
}

export function computeStreak(
  summary: UsageSummary,
  dailyLimitMinutes: number,
): StreakResult | null {
  const limit = Number.isFinite(dailyLimitMinutes) ? Math.floor(dailyLimitMinutes) : 0;
  if (limit <= 0) return null;
  let best = 0;
  let run = 0;
  for (const row of summary) {
    if (!row.exceeded) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  let current = 0;
  for (let i = summary.length - 1; i >= 0; i--) {
    if (summary[i].exceeded) break;
    current += 1;
  }
  return { current, best };
}

export function achievementRate(summary: UsageSummary, dailyLimitMinutes: number): number | null {
  const limit = Number.isFinite(dailyLimitMinutes) ? Math.floor(dailyLimitMinutes) : 0;
  if (limit <= 0) return null;
  if (summary.length === 0) return null;
  const ok = summary.reduce((acc, row) => acc + (row.exceeded ? 0 : 1), 0);
  return ok / summary.length;
}

export function totalMinutes(summary: UsageSummary): number {
  return summary.reduce((acc, row) => acc + row.minutes, 0);
}

export function averageMinutes(summary: UsageSummary): number {
  if (summary.length === 0) return 0;
  return Math.round(totalMinutes(summary) / summary.length);
}
