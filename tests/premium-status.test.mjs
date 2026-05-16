import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRIAL_DAYS,
  isPremiumEffective,
  trialDaysLeft,
} from "../src/lib/premium-status.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 4, 17, 12, 0, 0);

// ---------- isPremiumEffective ----------

test("isPremiumEffective: premium_unlocked=true returns true regardless of trial", () => {
  assert.equal(
    isPremiumEffective({ premium_unlocked: true, trial_start_ts: null }, NOW),
    true,
  );
  assert.equal(
    isPremiumEffective(
      { premium_unlocked: true, trial_start_ts: NOW - 100 * DAY_MS },
      NOW,
    ),
    true,
  );
});

test("isPremiumEffective: within TRIAL_DAYS of trial_start_ts returns true", () => {
  const start = NOW - 3 * DAY_MS;
  assert.equal(
    isPremiumEffective({ premium_unlocked: false, trial_start_ts: start }, NOW),
    true,
  );
});

test("isPremiumEffective: trial just started (delta 0) returns true", () => {
  assert.equal(
    isPremiumEffective({ premium_unlocked: false, trial_start_ts: NOW }, NOW),
    true,
  );
});

test("isPremiumEffective: trial at exactly TRIAL_DAYS boundary returns false", () => {
  const start = NOW - TRIAL_DAYS * DAY_MS;
  assert.equal(
    isPremiumEffective({ premium_unlocked: false, trial_start_ts: start }, NOW),
    false,
  );
});

test("isPremiumEffective: trial expired (8 days ago) returns false", () => {
  const start = NOW - 8 * DAY_MS;
  assert.equal(
    isPremiumEffective({ premium_unlocked: false, trial_start_ts: start }, NOW),
    false,
  );
});

test("isPremiumEffective: trial_start_ts in the future (clock skew) returns false", () => {
  const start = NOW + 1 * DAY_MS;
  assert.equal(
    isPremiumEffective({ premium_unlocked: false, trial_start_ts: start }, NOW),
    false,
  );
});

test("isPremiumEffective: trial_start_ts null returns false", () => {
  assert.equal(
    isPremiumEffective({ premium_unlocked: false, trial_start_ts: null }, NOW),
    false,
  );
});

test("isPremiumEffective: non-finite trial_start_ts returns false", () => {
  assert.equal(
    isPremiumEffective({ premium_unlocked: false, trial_start_ts: NaN }, NOW),
    false,
  );
});

// ---------- trialDaysLeft ----------

test("trialDaysLeft: premium_unlocked=true returns null", () => {
  assert.equal(
    trialDaysLeft({ premium_unlocked: true, trial_start_ts: null }, NOW),
    null,
  );
});

test("trialDaysLeft: null trial_start_ts returns full TRIAL_DAYS", () => {
  assert.equal(
    trialDaysLeft({ premium_unlocked: false, trial_start_ts: null }, NOW),
    TRIAL_DAYS,
  );
});

test("trialDaysLeft: just started -> TRIAL_DAYS", () => {
  assert.equal(
    trialDaysLeft({ premium_unlocked: false, trial_start_ts: NOW }, NOW),
    TRIAL_DAYS,
  );
});

test("trialDaysLeft: 3 days in -> 4 days left", () => {
  const start = NOW - 3 * DAY_MS;
  assert.equal(
    trialDaysLeft({ premium_unlocked: false, trial_start_ts: start }, NOW),
    4,
  );
});

test("trialDaysLeft: expired -> 0 (clamped, never negative)", () => {
  const start = NOW - 30 * DAY_MS;
  assert.equal(
    trialDaysLeft({ premium_unlocked: false, trial_start_ts: start }, NOW),
    0,
  );
});

test("trialDaysLeft: non-finite trial_start_ts returns TRIAL_DAYS", () => {
  assert.equal(
    trialDaysLeft({ premium_unlocked: false, trial_start_ts: Infinity }, NOW),
    TRIAL_DAYS,
  );
});
