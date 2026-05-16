import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IDLE_RESET_THRESHOLD_SECONDS,
  advanceSession,
  emptySession,
  evaluateBlock,
  extractHostFromUrl,
  isSameHost,
  startSession,
} from "../src/lib/time-tracker.ts";

test("emptySession: returns null host and zero accumulator", () => {
  assert.deepEqual(emptySession(), {
    host: null,
    startedAt: null,
    accumulatedMs: 0,
    lastTickAt: null,
  });
});

test("startSession: seeds host and timestamps", () => {
  assert.deepEqual(startSession("youtube.com", 1_000), {
    host: "youtube.com",
    startedAt: 1_000,
    accumulatedMs: 0,
    lastTickAt: 1_000,
  });
});

test("isSameHost: equal non-null", () => {
  assert.equal(isSameHost("a.com", "a.com"), true);
});

test("isSameHost: different hosts", () => {
  assert.equal(isSameHost("a.com", "b.com"), false);
});

test("isSameHost: null on either side returns false", () => {
  assert.equal(isSameHost(null, "a.com"), false);
  assert.equal(isSameHost("a.com", null), false);
  assert.equal(isSameHost(null, null), false);
});

test("advanceSession: null host yields zero delta and same state", () => {
  const prev = emptySession();
  const { next, deltaMs } = advanceSession(prev, 5_000);
  assert.equal(deltaMs, 0);
  assert.deepEqual(next, prev);
});

test("advanceSession: positive delta accumulates", () => {
  const prev = startSession("youtube.com", 1_000);
  const { next, deltaMs } = advanceSession(prev, 16_000);
  assert.equal(deltaMs, 15_000);
  assert.equal(next.accumulatedMs, 15_000);
  assert.equal(next.lastTickAt, 16_000);
  assert.equal(next.host, "youtube.com");
  assert.equal(next.startedAt, 1_000);
});

test("advanceSession: subsequent ticks keep accumulating", () => {
  let s = startSession("a.com", 0);
  s = advanceSession(s, 10_000).next;
  s = advanceSession(s, 25_000).next;
  assert.equal(s.accumulatedMs, 25_000);
  assert.equal(s.lastTickAt, 25_000);
});

test("advanceSession: clamps long gaps to maxDeltaMs (suspend/resume)", () => {
  const prev = startSession("a.com", 0);
  // 10 minutes gap, default cap is 5 min
  const { next, deltaMs } = advanceSession(prev, 10 * 60_000);
  assert.equal(deltaMs, 5 * 60_000);
  assert.equal(next.accumulatedMs, 5 * 60_000);
  assert.equal(next.lastTickAt, 10 * 60_000);
});

test("advanceSession: custom maxDeltaMs is honored", () => {
  const prev = startSession("a.com", 0);
  const { deltaMs } = advanceSession(prev, 60_000, 20_000);
  assert.equal(deltaMs, 20_000);
});

test("advanceSession: clock going backwards yields zero delta but advances lastTickAt", () => {
  const prev = { ...startSession("a.com", 5_000), accumulatedMs: 1_000 };
  const { next, deltaMs } = advanceSession(prev, 4_000);
  assert.equal(deltaMs, 0);
  assert.equal(next.accumulatedMs, 1_000);
  assert.equal(next.lastTickAt, 4_000);
});

test("advanceSession: zero elapsed yields zero delta", () => {
  const prev = startSession("a.com", 1_000);
  const { next, deltaMs } = advanceSession(prev, 1_000);
  assert.equal(deltaMs, 0);
  assert.equal(next.accumulatedMs, 0);
  assert.equal(next.lastTickAt, 1_000);
});

test("advanceSession: non-finite now yields zero delta and updates lastTickAt", () => {
  const prev = startSession("a.com", 1_000);
  const { next, deltaMs } = advanceSession(prev, Number.NaN);
  assert.equal(deltaMs, 0);
  assert.equal(next.accumulatedMs, 0);
  assert.ok(Number.isNaN(next.lastTickAt));
});

test("advanceSession: missing lastTickAt yields zero delta", () => {
  const prev = { host: "a.com", startedAt: 0, accumulatedMs: 100, lastTickAt: null };
  const { next, deltaMs } = advanceSession(prev, 5_000);
  assert.equal(deltaMs, 0);
  assert.deepEqual(next, prev);
});

test("evaluateBlock: disabled returns null even when over limits", () => {
  const cfg = { enabled: false, dailyLimitMinutes: 1, sessionLimitMinutes: 1 };
  assert.equal(evaluateBlock(cfg, 10 * 60_000, 10 * 60_000), null);
});

test("evaluateBlock: daily zero disables daily check", () => {
  const cfg = { enabled: true, dailyLimitMinutes: 0, sessionLimitMinutes: 0 };
  assert.equal(evaluateBlock(cfg, 999_999, 999_999), null);
});

test("evaluateBlock: under daily and session => null", () => {
  const cfg = { enabled: true, dailyLimitMinutes: 30, sessionLimitMinutes: 10 };
  assert.equal(evaluateBlock(cfg, 60_000, 60_000), null);
});

test("evaluateBlock: daily reached exactly => daily", () => {
  const cfg = { enabled: true, dailyLimitMinutes: 30, sessionLimitMinutes: 0 };
  assert.equal(evaluateBlock(cfg, 30 * 60_000, 0), "daily");
});

test("evaluateBlock: daily exceeded => daily", () => {
  const cfg = { enabled: true, dailyLimitMinutes: 30, sessionLimitMinutes: 0 };
  assert.equal(evaluateBlock(cfg, 31 * 60_000, 0), "daily");
});

test("evaluateBlock: session reached exactly => session", () => {
  const cfg = { enabled: true, dailyLimitMinutes: 0, sessionLimitMinutes: 10 };
  assert.equal(evaluateBlock(cfg, 0, 10 * 60_000), "session");
});

test("evaluateBlock: daily takes precedence over session when both reached", () => {
  const cfg = { enabled: true, dailyLimitMinutes: 30, sessionLimitMinutes: 10 };
  assert.equal(evaluateBlock(cfg, 30 * 60_000, 10 * 60_000), "daily");
});

test("evaluateBlock: just under daily threshold => null", () => {
  const cfg = { enabled: true, dailyLimitMinutes: 30, sessionLimitMinutes: 0 };
  assert.equal(evaluateBlock(cfg, 30 * 60_000 - 1, 0), null);
});

test("evaluateBlock: just under session threshold => null", () => {
  const cfg = { enabled: true, dailyLimitMinutes: 0, sessionLimitMinutes: 10 };
  assert.equal(evaluateBlock(cfg, 0, 10 * 60_000 - 1), null);
});

test("extractHostFromUrl: undefined returns null", () => {
  assert.equal(extractHostFromUrl(undefined), null);
});

test("extractHostFromUrl: empty string returns null", () => {
  assert.equal(extractHostFromUrl(""), null);
});

test("extractHostFromUrl: https URL", () => {
  assert.equal(extractHostFromUrl("https://www.youtube.com/watch?v=1"), "www.youtube.com");
});

test("extractHostFromUrl: http URL", () => {
  assert.equal(extractHostFromUrl("http://example.com/"), "example.com");
});

test("extractHostFromUrl: rejects chrome:// scheme", () => {
  assert.equal(extractHostFromUrl("chrome://settings/"), null);
});

test("extractHostFromUrl: rejects about:blank", () => {
  assert.equal(extractHostFromUrl("about:blank"), null);
});

test("extractHostFromUrl: rejects file:// scheme", () => {
  assert.equal(extractHostFromUrl("file:///Users/foo/bar.html"), null);
});

test("extractHostFromUrl: rejects ftp scheme", () => {
  assert.equal(extractHostFromUrl("ftp://example.com/"), null);
});

test("extractHostFromUrl: malformed URL returns null", () => {
  assert.equal(extractHostFromUrl("not a url"), null);
});

test("IDLE_RESET_THRESHOLD_SECONDS: matches design (30s)", () => {
  assert.equal(IDLE_RESET_THRESHOLD_SECONDS, 30);
});
