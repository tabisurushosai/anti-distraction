import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lastNDays,
  msToMinutes,
  summarizeUsage,
  formatMinutes,
  pruneUsage,
  computeStreak,
  achievementRate,
  totalMinutes,
  averageMinutes,
} from "../src/lib/usage-stats.ts";

// ---------- lastNDays ----------

test("lastNDays: returns n keys in ascending order ending at today", () => {
  const today = new Date(2026, 4, 17); // 2026-05-17 (local)
  assert.deepEqual(lastNDays(today, 7), [
    "2026-05-11",
    "2026-05-12",
    "2026-05-13",
    "2026-05-14",
    "2026-05-15",
    "2026-05-16",
    "2026-05-17",
  ]);
});

test("lastNDays: n=1 returns only today", () => {
  const today = new Date(2026, 4, 17);
  assert.deepEqual(lastNDays(today, 1), ["2026-05-17"]);
});

test("lastNDays: n=0 returns empty array", () => {
  const today = new Date(2026, 4, 17);
  assert.deepEqual(lastNDays(today, 0), []);
});

test("lastNDays: negative n returns empty array", () => {
  const today = new Date(2026, 4, 17);
  assert.deepEqual(lastNDays(today, -5), []);
});

test("lastNDays: spans month boundary without gaps", () => {
  const today = new Date(2026, 2, 2); // 2026-03-02
  assert.deepEqual(lastNDays(today, 5), [
    "2026-02-26",
    "2026-02-27",
    "2026-02-28",
    "2026-03-01",
    "2026-03-02",
  ]);
});

test("lastNDays: spans year boundary without gaps", () => {
  const today = new Date(2027, 0, 2); // 2027-01-02
  assert.deepEqual(lastNDays(today, 4), [
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
  ]);
});

test("lastNDays: spans Feb 29 in leap year", () => {
  const today = new Date(2028, 2, 1); // 2028-03-01 (2028 is leap)
  assert.deepEqual(lastNDays(today, 3), ["2028-02-28", "2028-02-29", "2028-03-01"]);
});

test("lastNDays: 30 days returns 30 sorted ascending keys", () => {
  const today = new Date(2026, 4, 17);
  const out = lastNDays(today, 30);
  assert.equal(out.length, 30);
  assert.equal(out[0], "2026-04-18");
  assert.equal(out[29], "2026-05-17");
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i - 1] < out[i], `keys must be sorted: ${out[i - 1]} < ${out[i]}`);
  }
});

// ---------- msToMinutes ----------

test("msToMinutes: 0 ms -> 0", () => {
  assert.equal(msToMinutes(0), 0);
});

test("msToMinutes: 59_999 ms -> 0 (floor)", () => {
  assert.equal(msToMinutes(59_999), 0);
});

test("msToMinutes: 60_000 ms -> 1", () => {
  assert.equal(msToMinutes(60_000), 1);
});

test("msToMinutes: negative ms -> 0", () => {
  assert.equal(msToMinutes(-1000), 0);
});

test("msToMinutes: NaN / Infinity -> 0", () => {
  assert.equal(msToMinutes(NaN), 0);
  assert.equal(msToMinutes(Infinity), 0);
});

// ---------- summarizeUsage ----------

test("summarizeUsage: fills missing days with 0 minutes", () => {
  const usage = { "2026-05-17": 600_000 }; // 10 min
  const keys = ["2026-05-15", "2026-05-16", "2026-05-17"];
  const out = summarizeUsage(usage, keys, 30);
  assert.equal(out.length, 3);
  assert.deepEqual(
    out.map((r) => ({ key: r.key, minutes: r.minutes, exceeded: r.exceeded })),
    [
      { key: "2026-05-15", minutes: 0, exceeded: false },
      { key: "2026-05-16", minutes: 0, exceeded: false },
      { key: "2026-05-17", minutes: 10, exceeded: false },
    ],
  );
});

test("summarizeUsage: marks exceeded when minutes >= dailyLimitMinutes", () => {
  const usage = { "2026-05-17": 30 * 60_000 }; // exactly 30 min
  const out = summarizeUsage(usage, ["2026-05-17"], 30);
  assert.equal(out[0].exceeded, true);
});

test("summarizeUsage: not exceeded when minutes < dailyLimitMinutes", () => {
  const usage = { "2026-05-17": 29 * 60_000 + 59_000 };
  const out = summarizeUsage(usage, ["2026-05-17"], 30);
  assert.equal(out[0].minutes, 29);
  assert.equal(out[0].exceeded, false);
});

test("summarizeUsage: limit=0 means never exceeded", () => {
  const usage = { "2026-05-17": 9999 * 60_000 };
  const out = summarizeUsage(usage, ["2026-05-17"], 0);
  assert.equal(out[0].exceeded, false);
});

test("summarizeUsage: negative limit treated as 0", () => {
  const usage = { "2026-05-17": 60_000 };
  const out = summarizeUsage(usage, ["2026-05-17"], -5);
  assert.equal(out[0].exceeded, false);
});

// ---------- formatMinutes ----------

const JA = { hoursMinutes: "$H$ 時間 $M$ 分", minutesOnly: "$MIN$ 分" };
const EN = { hoursMinutes: "$H$h $M$m", minutesOnly: "$MIN$m" };

test("formatMinutes: 0 -> '0 分' (ja)", () => {
  assert.equal(formatMinutes(0, JA), "0 分");
});

test("formatMinutes: 0 -> '0m' (en)", () => {
  assert.equal(formatMinutes(0, EN), "0m");
});

test("formatMinutes: 59 -> '59 分' (ja, no hours block)", () => {
  assert.equal(formatMinutes(59, JA), "59 分");
});

test("formatMinutes: 60 -> '1 時間 0 分' (ja)", () => {
  assert.equal(formatMinutes(60, JA), "1 時間 0 分");
});

test("formatMinutes: 125 -> '2 時間 5 分' (ja)", () => {
  assert.equal(formatMinutes(125, JA), "2 時間 5 分");
});

test("formatMinutes: 125 -> '2h 5m' (en)", () => {
  assert.equal(formatMinutes(125, EN), "2h 5m");
});

test("formatMinutes: negative -> 0 minutes format", () => {
  assert.equal(formatMinutes(-10, JA), "0 分");
});

test("formatMinutes: NaN -> 0 minutes format", () => {
  assert.equal(formatMinutes(NaN, JA), "0 分");
});

// ---------- pruneUsage ----------

test("pruneUsage: retains keys within retainDays window (today inclusive)", () => {
  const today = new Date(2026, 4, 17);
  const usage = {
    "2026-05-17": 100,
    "2026-05-16": 200,
    "2026-05-10": 300,
  };
  const out = pruneUsage(usage, today, 8); // keep 8 days: 2026-05-10 .. 2026-05-17
  assert.deepEqual(out, usage);
});

test("pruneUsage: drops keys older than retainDays", () => {
  const today = new Date(2026, 4, 17);
  const usage = {
    "2026-05-17": 100,
    "2026-05-09": 999, // older than 8-day window
    "2026-05-10": 300, // boundary: kept
  };
  const out = pruneUsage(usage, today, 8);
  assert.deepEqual(out, { "2026-05-17": 100, "2026-05-10": 300 });
});

test("pruneUsage: 90-day retention keeps boundary day", () => {
  const today = new Date(2026, 4, 17);
  const usage = {
    "2026-05-17": 1,
    "2026-02-17": 2, // 89 days before -> within 90-day window
    "2026-02-16": 3, // 90 days before -> dropped
  };
  const out = pruneUsage(usage, today, 90);
  assert.equal(out["2026-05-17"], 1);
  assert.equal(out["2026-02-17"], 2);
  assert.equal(out["2026-02-16"], undefined);
});

test("pruneUsage: removes malformed keys", () => {
  const today = new Date(2026, 4, 17);
  const usage = {
    "2026-05-17": 100,
    "invalid": 200,
    "2026-13-01": 300, // bad month
    "2026-02-30": 400, // non-existent day
    "": 500,
  };
  const out = pruneUsage(usage, today, 90);
  assert.deepEqual(out, { "2026-05-17": 100 });
});

test("pruneUsage: removes non-finite values", () => {
  const today = new Date(2026, 4, 17);
  const usage = {
    "2026-05-17": 100,
    "2026-05-16": NaN,
    "2026-05-15": Infinity,
  };
  const out = pruneUsage(usage, today, 90);
  assert.deepEqual(out, { "2026-05-17": 100 });
});

test("pruneUsage: retainDays=0 returns empty object", () => {
  const today = new Date(2026, 4, 17);
  const out = pruneUsage({ "2026-05-17": 100 }, today, 0);
  assert.deepEqual(out, {});
});

test("pruneUsage: null/undefined usage returns empty object", () => {
  const today = new Date(2026, 4, 17);
  assert.deepEqual(pruneUsage(null, today, 90), {});
  assert.deepEqual(pruneUsage(undefined, today, 90), {});
});

test("pruneUsage: future-dated keys are retained (not corrupted)", () => {
  const today = new Date(2026, 4, 17);
  const out = pruneUsage({ "2027-01-01": 100 }, today, 90);
  assert.equal(out["2027-01-01"], 100);
});

// ---------- computeStreak ----------

function makeSummary(minutesPerDay) {
  return minutesPerDay.map((min, i) => ({
    key: `2026-05-${String(10 + i).padStart(2, "0")}`,
    ms: min * 60_000,
    minutes: min,
    exceeded: min >= 30,
  }));
}

test("computeStreak: all under limit -> current = best = length", () => {
  const summary = makeSummary([10, 10, 10, 10]);
  assert.deepEqual(computeStreak(summary, 30), { current: 4, best: 4 });
});

test("computeStreak: all exceeded -> current = best = 0", () => {
  const summary = makeSummary([30, 30, 30]);
  assert.deepEqual(computeStreak(summary, 30), { current: 0, best: 0 });
});

test("computeStreak: trailing safe days form current streak", () => {
  // exceeded, ok, ok, exceeded, ok, ok, ok
  const summary = makeSummary([30, 10, 10, 30, 10, 10, 10]);
  assert.deepEqual(computeStreak(summary, 30), { current: 3, best: 3 });
});

test("computeStreak: longest run earlier sets best > current", () => {
  // ok x4, exceeded, ok x2
  const summary = makeSummary([10, 10, 10, 10, 30, 10, 10]);
  assert.deepEqual(computeStreak(summary, 30), { current: 2, best: 4 });
});

test("computeStreak: limit <= 0 returns null", () => {
  const summary = makeSummary([10, 10, 10]);
  assert.equal(computeStreak(summary, 0), null);
  assert.equal(computeStreak(summary, -1), null);
});

test("computeStreak: empty summary -> current=0, best=0", () => {
  assert.deepEqual(computeStreak([], 30), { current: 0, best: 0 });
});

// ---------- achievementRate / totalMinutes / averageMinutes ----------

test("achievementRate: 3 of 4 safe -> 0.75", () => {
  const summary = makeSummary([10, 30, 10, 10]);
  assert.equal(achievementRate(summary, 30), 0.75);
});

test("achievementRate: limit <= 0 returns null", () => {
  const summary = makeSummary([10, 30]);
  assert.equal(achievementRate(summary, 0), null);
});

test("achievementRate: empty summary returns null", () => {
  assert.equal(achievementRate([], 30), null);
});

test("totalMinutes: sums minutes across rows", () => {
  const summary = makeSummary([5, 10, 20]);
  assert.equal(totalMinutes(summary), 35);
});

test("totalMinutes: empty -> 0", () => {
  assert.equal(totalMinutes([]), 0);
});

test("averageMinutes: rounded mean", () => {
  const summary = makeSummary([10, 20, 30]); // sum 60 / 3 = 20
  assert.equal(averageMinutes(summary), 20);
});

test("averageMinutes: empty -> 0", () => {
  assert.equal(averageMinutes([]), 0);
});
