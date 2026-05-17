import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COOLDOWN_FREE_FIXED_SECONDS,
  COOLDOWN_MAX_SECONDS,
  COOLDOWN_MIN_SECONDS,
  canUnblock,
  clampCooldownSeconds,
  dailyMax,
  isCooldownActive,
  recordUnblock,
  remainingSeconds,
  usedToday,
} from "../src/lib/cooldown.ts";

const TODAY = "2026-05-17";
const TOMORROW = "2026-05-18";

function freshState(overrides = {}) {
  return {
    unblockCountByDate: {},
    unblockMaxPerDayFree: 3,
    unblockMaxPerDayPremium: 10,
    ...overrides,
  };
}

// ---------- isCooldownActive ----------

test("isCooldownActive: lastUnblockAt=null returns false", () => {
  assert.equal(isCooldownActive(1_000_000, null, 30), false);
});

test("isCooldownActive: within the window returns true", () => {
  const start = 1_000_000;
  assert.equal(isCooldownActive(start + 29_999, start, 30), true);
});

test("isCooldownActive: now == start (delta 0) returns true", () => {
  const start = 1_000_000;
  assert.equal(isCooldownActive(start, start, 30), true);
});

test("isCooldownActive: boundary at exactly cooldownSeconds*1000 returns false", () => {
  const start = 1_000_000;
  assert.equal(isCooldownActive(start + 30_000, start, 30), false);
});

test("isCooldownActive: past the window returns false", () => {
  const start = 1_000_000;
  assert.equal(isCooldownActive(start + 60_000, start, 30), false);
});

test("isCooldownActive: cooldownSeconds <= 0 returns false", () => {
  assert.equal(isCooldownActive(1_000_000, 999_000, 0), false);
  assert.equal(isCooldownActive(1_000_000, 999_000, -5), false);
});

test("isCooldownActive: non-finite cooldownSeconds returns false", () => {
  assert.equal(isCooldownActive(1_000_000, 999_000, NaN), false);
  assert.equal(isCooldownActive(1_000_000, 999_000, Infinity), false);
});

test("isCooldownActive: non-finite lastUnblockAt returns false", () => {
  assert.equal(isCooldownActive(1_000_000, NaN, 30), false);
  assert.equal(isCooldownActive(1_000_000, Infinity, 30), false);
});

// ---------- remainingSeconds ----------

test("remainingSeconds: lastUnblockAt null -> 0", () => {
  assert.equal(remainingSeconds(1_000_000, null, 30), 0);
});

test("remainingSeconds: at start -> cooldownSeconds (ceil of full window)", () => {
  const start = 1_000_000;
  assert.equal(remainingSeconds(start, start, 30), 30);
});

test("remainingSeconds: 5 sec in -> 25 sec left", () => {
  const start = 1_000_000;
  assert.equal(remainingSeconds(start + 5_000, start, 30), 25);
});

test("remainingSeconds: ceil rounds up partial second", () => {
  const start = 1_000_000;
  // 5.5 sec in -> 24.5 sec left -> ceil to 25
  assert.equal(remainingSeconds(start + 5_500, start, 30), 25);
});

test("remainingSeconds: after cooldown -> 0", () => {
  const start = 1_000_000;
  assert.equal(remainingSeconds(start + 30_000, start, 30), 0);
  assert.equal(remainingSeconds(start + 60_000, start, 30), 0);
});

// ---------- dailyMax ----------

test("dailyMax: free uses unblockMaxPerDayFree", () => {
  assert.equal(dailyMax(freshState(), false), 3);
});

test("dailyMax: premium uses unblockMaxPerDayPremium", () => {
  assert.equal(dailyMax(freshState(), true), 10);
});

test("dailyMax: custom values respected", () => {
  assert.equal(dailyMax(freshState({ unblockMaxPerDayFree: 1 }), false), 1);
  assert.equal(dailyMax(freshState({ unblockMaxPerDayPremium: 50 }), true), 50);
});

test("dailyMax: non-finite or negative -> 0", () => {
  assert.equal(dailyMax(freshState({ unblockMaxPerDayFree: NaN }), false), 0);
  assert.equal(dailyMax(freshState({ unblockMaxPerDayFree: -1 }), false), 0);
  assert.equal(dailyMax(freshState({ unblockMaxPerDayPremium: Infinity }), true), 0);
});

// ---------- usedToday ----------

test("usedToday: missing key returns 0", () => {
  assert.equal(usedToday(freshState(), TODAY), 0);
});

test("usedToday: returns the stored count", () => {
  assert.equal(
    usedToday(freshState({ unblockCountByDate: { [TODAY]: 2 } }), TODAY),
    2,
  );
});

test("usedToday: non-finite stored value returns 0", () => {
  assert.equal(
    usedToday(freshState({ unblockCountByDate: { [TODAY]: NaN } }), TODAY),
    0,
  );
});

test("usedToday: negative stored value returns 0", () => {
  assert.equal(
    usedToday(freshState({ unblockCountByDate: { [TODAY]: -1 } }), TODAY),
    0,
  );
});

test("usedToday: different date key returns 0", () => {
  assert.equal(
    usedToday(freshState({ unblockCountByDate: { [TOMORROW]: 5 } }), TODAY),
    0,
  );
});

// ---------- canUnblock ----------

test("canUnblock: 0 used, max 3 -> ok", () => {
  assert.deepEqual(canUnblock(freshState(), TODAY, false), { ok: true });
});

test("canUnblock: at max -> rate-limit", () => {
  const state = freshState({ unblockCountByDate: { [TODAY]: 3 } });
  assert.deepEqual(canUnblock(state, TODAY, false), {
    ok: false,
    reason: "rate-limit",
  });
});

test("canUnblock: past max -> rate-limit", () => {
  const state = freshState({ unblockCountByDate: { [TODAY]: 5 } });
  assert.deepEqual(canUnblock(state, TODAY, false), {
    ok: false,
    reason: "rate-limit",
  });
});

test("canUnblock: Premium raises the ceiling", () => {
  const state = freshState({ unblockCountByDate: { [TODAY]: 3 } });
  assert.deepEqual(canUnblock(state, TODAY, true), { ok: true });
});

test("canUnblock: Premium at premium max -> rate-limit", () => {
  const state = freshState({ unblockCountByDate: { [TODAY]: 10 } });
  assert.deepEqual(canUnblock(state, TODAY, true), {
    ok: false,
    reason: "rate-limit",
  });
});

test("canUnblock: yesterday's count does not block today", () => {
  const state = freshState({ unblockCountByDate: { "2026-05-16": 99 } });
  assert.deepEqual(canUnblock(state, TODAY, false), { ok: true });
});

test("canUnblock: dailyMax=0 -> rate-limit even on first request", () => {
  const state = freshState({ unblockMaxPerDayFree: 0 });
  assert.deepEqual(canUnblock(state, TODAY, false), {
    ok: false,
    reason: "rate-limit",
  });
});

// ---------- recordUnblock ----------

test("recordUnblock: sets lastUnblockAt to now", () => {
  const state = freshState();
  const out = recordUnblock(state, TODAY, 5_000_000);
  assert.equal(out.lastUnblockAt, 5_000_000);
});

test("recordUnblock: increments today's count from 0 to 1", () => {
  const state = freshState();
  const out = recordUnblock(state, TODAY, 1);
  assert.equal(out.unblockCountByDate[TODAY], 1);
});

test("recordUnblock: increments existing count by 1", () => {
  const state = freshState({ unblockCountByDate: { [TODAY]: 2 } });
  const out = recordUnblock(state, TODAY, 1);
  assert.equal(out.unblockCountByDate[TODAY], 3);
});

test("recordUnblock: does not mutate the input state", () => {
  const original = freshState({ unblockCountByDate: { [TODAY]: 1 } });
  const snapshot = JSON.stringify(original);
  recordUnblock(original, TODAY, 1);
  assert.equal(JSON.stringify(original), snapshot);
});

test("recordUnblock: preserves other dates' counts", () => {
  const state = freshState({
    unblockCountByDate: { "2026-05-16": 5, [TODAY]: 1 },
  });
  const out = recordUnblock(state, TODAY, 1);
  assert.equal(out.unblockCountByDate["2026-05-16"], 5);
  assert.equal(out.unblockCountByDate[TODAY], 2);
});

// ---------- end-to-end (free tier daily flow) ----------

test("end-to-end: 3 free unblocks succeed, 4th denied", () => {
  let state = freshState();
  for (let i = 0; i < 3; i++) {
    const check = canUnblock(state, TODAY, false);
    assert.equal(check.ok, true, `request ${i + 1} should succeed`);
    const recorded = recordUnblock(state, TODAY, i);
    state = { ...state, ...recorded };
  }
  assert.equal(state.unblockCountByDate[TODAY], 3);
  const fourth = canUnblock(state, TODAY, false);
  assert.deepEqual(fourth, { ok: false, reason: "rate-limit" });
});

test("end-to-end: day rolls over -> counter resets", () => {
  let state = freshState();
  // exhaust today
  for (let i = 0; i < 3; i++) {
    state = { ...state, ...recordUnblock(state, TODAY, i) };
  }
  assert.deepEqual(canUnblock(state, TODAY, false), {
    ok: false,
    reason: "rate-limit",
  });
  // tomorrow's check is fresh against the same state
  assert.deepEqual(canUnblock(state, TOMORROW, false), { ok: true });
});

test("end-to-end: 10 premium unblocks succeed, 11th denied", () => {
  let state = freshState();
  for (let i = 0; i < 10; i++) {
    const check = canUnblock(state, TODAY, true);
    assert.equal(check.ok, true, `premium request ${i + 1} should succeed`);
    state = { ...state, ...recordUnblock(state, TODAY, i) };
  }
  assert.equal(state.unblockCountByDate[TODAY], 10);
  const eleventh = canUnblock(state, TODAY, true);
  assert.deepEqual(eleventh, { ok: false, reason: "rate-limit" });
});

// ---------- clampCooldownSeconds ----------

test("clampCooldownSeconds: free tier always returns the fixed value", () => {
  assert.equal(clampCooldownSeconds(5, false), COOLDOWN_FREE_FIXED_SECONDS);
  assert.equal(clampCooldownSeconds(30, false), COOLDOWN_FREE_FIXED_SECONDS);
  assert.equal(clampCooldownSeconds(300, false), COOLDOWN_FREE_FIXED_SECONDS);
  assert.equal(clampCooldownSeconds(999, false), COOLDOWN_FREE_FIXED_SECONDS);
});

test("clampCooldownSeconds: premium passes valid values through", () => {
  assert.equal(clampCooldownSeconds(30, true), 30);
  assert.equal(clampCooldownSeconds(60, true), 60);
});

test("clampCooldownSeconds: premium clamps below the min", () => {
  assert.equal(clampCooldownSeconds(1, true), COOLDOWN_MIN_SECONDS);
  assert.equal(clampCooldownSeconds(0, true), COOLDOWN_MIN_SECONDS);
  assert.equal(clampCooldownSeconds(-100, true), COOLDOWN_MIN_SECONDS);
});

test("clampCooldownSeconds: premium clamps above the max", () => {
  assert.equal(clampCooldownSeconds(500, true), COOLDOWN_MAX_SECONDS);
  assert.equal(clampCooldownSeconds(99_999, true), COOLDOWN_MAX_SECONDS);
});

test("clampCooldownSeconds: premium floors fractional input", () => {
  assert.equal(clampCooldownSeconds(30.9, true), 30);
});

test("clampCooldownSeconds: non-finite input -> free-tier default", () => {
  assert.equal(clampCooldownSeconds(NaN, true), COOLDOWN_FREE_FIXED_SECONDS);
  assert.equal(clampCooldownSeconds(Infinity, true), COOLDOWN_FREE_FIXED_SECONDS);
});

// ---------- constants ----------

test("constants: COOLDOWN_MIN / MAX / FREE_FIXED are as documented", () => {
  assert.equal(COOLDOWN_MIN_SECONDS, 5);
  assert.equal(COOLDOWN_MAX_SECONDS, 300);
  assert.equal(COOLDOWN_FREE_FIXED_SECONDS, 30);
});
