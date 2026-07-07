/**
 * @file Toolbar popup script. Renders today's usage / remaining time, the
 * cooldown status, the on/off toggle, and a premium upgrade CTA, then keeps
 * itself in sync with `chrome.storage` changes via a debounced re-render.
 */

import { applyI18n, t } from "./i18n";
import {
  lastNDays,
  summarizeUsage,
  type UsageSummary,
} from "./lib/usage-stats";
import {
  isPremiumEffective,
  isPremiumPurchased,
  isTrialActive,
  trialDaysLeft,
} from "./lib/premium-status";

type PopupState = {
  enabled: boolean;
  dailyLimitMinutes: number;
  cooldownSeconds: number;
  usageByDate: Record<string, number>;
  lastUnblockAt: number | null;
  premiumUnlocked: boolean;
  premiumVerifiedAt: number | null;
  premiumGraceUntil: number | null;
  trialStartTs: number | null;
};

const STORAGE_KEYS = {
  enabled: "enabled",
  dailyLimitMinutes: "dailyLimitMinutes",
  cooldownSeconds: "cooldownSeconds",
  usageByDate: "usageByDate",
  lastUnblockAt: "lastUnblockAt",
  premiumUnlocked: "premium_unlocked",
  premiumVerifiedAt: "premium_verified_at",
  premiumGraceUntil: "premium_grace_until",
  trialStartTs: "trial_start_ts",
} as const;

const DEFAULTS: PopupState = {
  enabled: true,
  dailyLimitMinutes: 30,
  cooldownSeconds: 30,
  usageByDate: {},
  lastUnblockAt: null,
  premiumUnlocked: false,
  premiumVerifiedAt: null,
  premiumGraceUntil: null,
  trialStartTs: null,
};

const RECENT_DAYS = 7;
const RENDER_DEBOUNCE_MS = 200;

function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function msToMinutes(ms: number): number {
  return Math.max(0, Math.floor(ms / 60000));
}

/** Reads the popup's view-model from chrome.storage with permissive defaults. */
async function loadState(): Promise<PopupState> {
  let data: Record<string, unknown> = {};
  try {
    data = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  } catch {
    /* fail-safe: fall through to defaults below */
  }
  return {
    enabled: typeof data.enabled === "boolean" ? data.enabled : DEFAULTS.enabled,
    dailyLimitMinutes:
      typeof data.dailyLimitMinutes === "number"
        ? data.dailyLimitMinutes
        : DEFAULTS.dailyLimitMinutes,
    cooldownSeconds:
      typeof data.cooldownSeconds === "number"
        ? data.cooldownSeconds
        : DEFAULTS.cooldownSeconds,
    usageByDate:
      data.usageByDate && typeof data.usageByDate === "object"
        ? (data.usageByDate as Record<string, number>)
        : DEFAULTS.usageByDate,
    lastUnblockAt:
      typeof data.lastUnblockAt === "number" ? data.lastUnblockAt : null,
    premiumUnlocked: data.premium_unlocked === true,
    premiumVerifiedAt:
      typeof data.premium_verified_at === "number"
        ? data.premium_verified_at
        : null,
    premiumGraceUntil:
      typeof data.premium_grace_until === "number"
        ? data.premium_grace_until
        : null,
    trialStartTs:
      typeof data.trial_start_ts === "number" ? data.trial_start_ts : null,
  };
}

function premiumStateOf(state: PopupState): {
  premium_unlocked: boolean;
  premium_verified_at: number | null;
  premium_grace_until: number | null;
  trial_start_ts: number | null;
} {
  return {
    premium_unlocked: state.premiumUnlocked,
    premium_verified_at: state.premiumVerifiedAt,
    premium_grace_until: state.premiumGraceUntil,
    trial_start_ts: state.trialStartTs,
  };
}

function renderStatus(state: PopupState): void {
  const badge = document.getElementById("status-badge");
  if (!badge) return;
  badge.textContent = state.enabled
    ? t("popup_status_enabled")
    : t("popup_status_disabled");
  badge.classList.toggle("popup__status--enabled", state.enabled);
  badge.classList.toggle("popup__status--disabled", !state.enabled);
}

function renderToggleButton(state: PopupState): void {
  const btn = document.getElementById("toggle-btn");
  if (!btn) return;
  const label = state.enabled ? t("popup_toggle_off") : t("popup_toggle_on");
  btn.textContent = label;
  btn.setAttribute("aria-label", label);
}

function renderTodaySummary(state: PopupState): void {
  const usageEl = document.getElementById("today-usage");
  const remainingEl = document.getElementById("remaining-time");
  const usedMs = state.usageByDate[todayKey()] ?? 0;
  const usedMin = msToMinutes(usedMs);
  const remainingMin = Math.max(0, state.dailyLimitMinutes - usedMin);
  if (usageEl) usageEl.textContent = t("popup_minutes", String(usedMin));
  if (remainingEl) remainingEl.textContent = t("popup_minutes", String(remainingMin));
}

function renderRecentBars(state: PopupState): void {
  const list = document.getElementById("recent-bars");
  if (!list) return;
  while (list.firstChild) list.removeChild(list.firstChild);

  const keys = lastNDays(new Date(), RECENT_DAYS);
  const summary: UsageSummary = summarizeUsage(
    state.usageByDate,
    keys,
    state.dailyLimitMinutes,
  );
  const limit = state.dailyLimitMinutes > 0 ? state.dailyLimitMinutes : 0;
  const peak = Math.max(1, ...summary.map((row) => row.minutes));

  for (const row of summary) {
    const li = document.createElement("li");
    li.className = "popup__bar";
    const fill = document.createElement("span");
    fill.className = "popup__bar-fill";
    let ratio: number;
    if (limit > 0) {
      ratio = Math.min(row.minutes / limit, 1);
    } else {
      ratio = peak > 0 ? row.minutes / peak : 0;
    }
    const heightPct = Math.max(0, Math.min(1, ratio)) * 100;
    fill.style.height = `${heightPct}%`;
    if (row.minutes === 0) li.classList.add("popup__bar--empty");
    if (row.exceeded) li.classList.add("popup__bar--exceeded");
    const label = `${row.key}: ${t("popup_minutes", String(row.minutes))}`;
    li.setAttribute("aria-label", label);
    li.title = label;
    li.appendChild(fill);
    list.appendChild(li);
  }
}

function renderPremium(state: PopupState): void {
  const section = document.getElementById("premium-section");
  const statusText = document.getElementById("premium-status-text");
  const hint = document.getElementById("premium-hint");
  const upgradeBtn = document.getElementById(
    "popup-upgrade-btn",
  ) as HTMLButtonElement | null;
  if (!section || !statusText || !hint || !upgradeBtn) return;

  const ps = premiumStateOf(state);
  const now = Date.now();
  const purchased = isPremiumPurchased(ps, now);
  const trial = isTrialActive(ps, now);
  const effective = isPremiumEffective(ps, now);

  section.classList.toggle("popup__premium--active", effective);

  if (purchased) {
    statusText.textContent = t("popup_premium_active");
  } else if (trial) {
    const days = trialDaysLeft(ps, now) ?? 0;
    statusText.textContent = t("popup_premium_trial", String(days));
  } else {
    statusText.textContent = t("popup_premium_free");
  }

  hint.hidden = effective;
  upgradeBtn.hidden = purchased;
}

/** Single entry point invoked on first render and after each storage change. */
function render(state: PopupState): void {
  renderStatus(state);
  renderToggleButton(state);
  renderTodaySummary(state);
  renderRecentBars(state);
  renderCooldownBadge(state);
  renderPremium(state);
}

/** Toggles the global `enabled` flag; storage listener re-renders the UI. */
async function handleToggle(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.enabled);
    const next = !(typeof data.enabled === "boolean" ? data.enabled : true);
    await chrome.storage.local.set({ [STORAGE_KEYS.enabled]: next });
  } catch {
    /* fail-safe: storage may be unavailable; UI listener will not fire */
  }
}

let cooldownTimer: number | null = null;

function stopCooldownDisplay(): void {
  if (cooldownTimer !== null) {
    window.clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
}

function runCooldownDisplay(untilMs: number, textEl: HTMLElement, button: HTMLButtonElement): void {
  stopCooldownDisplay();
  textEl.hidden = false;
  button.disabled = true;
  const tick = (): void => {
    const remaining = Math.max(0, Math.ceil((untilMs - Date.now()) / 1000));
    if (remaining <= 0) {
      stopCooldownDisplay();
      textEl.hidden = true;
      textEl.textContent = "";
      button.disabled = false;
      return;
    }
    textEl.textContent = t("popup_cooldown_active", String(remaining));
  };
  tick();
  cooldownTimer = window.setInterval(tick, 500);
}

function renderCooldownBadge(state: PopupState): void {
  const textEl = document.getElementById("cooldown-text") as HTMLElement | null;
  const button = document.getElementById("unblock-btn") as HTMLButtonElement | null;
  if (!textEl || !button) return;
  if (state.lastUnblockAt === null) {
    stopCooldownDisplay();
    textEl.hidden = true;
    textEl.textContent = "";
    button.disabled = false;
    return;
  }
  const untilMs = state.lastUnblockAt + state.cooldownSeconds * 1000;
  if (untilMs <= Date.now()) {
    stopCooldownDisplay();
    textEl.hidden = true;
    textEl.textContent = "";
    button.disabled = false;
    return;
  }
  runCooldownDisplay(untilMs, textEl, button);
}

const DENIED_KEYS: Record<string, string> = {
  "rate-limit": "cooldown_denied_rate_limit",
  disabled: "cooldown_denied_disabled",
  "not-blocked": "cooldown_denied_not_blocked",
  "premium-required": "cooldown_denied_premium_required",
  "storage-error": "cooldown_denied_storage",
};

function showInlineDenied(textEl: HTMLElement, reason: string): void {
  stopCooldownDisplay();
  const key = DENIED_KEYS[reason] ?? DENIED_KEYS["rate-limit"];
  textEl.textContent = t(key as Parameters<typeof t>[0]);
  textEl.hidden = false;
}

/** Sends an unblock request and either runs the cooldown or shows a denial. */
async function handleUnblockClick(
  button: HTMLButtonElement,
  textEl: HTMLElement,
): Promise<void> {
  button.disabled = true;
  try {
    const res = (await chrome.runtime.sendMessage({
      type: "ad/time-limit/request-unblock",
    })) as { ok?: boolean; untilMs?: number; reason?: string } | undefined;
    if (res && res.ok && typeof res.untilMs === "number") {
      runCooldownDisplay(res.untilMs, textEl, button);
    } else {
      showInlineDenied(textEl, res?.reason ?? "rate-limit");
      button.disabled = false;
    }
  } catch {
    showInlineDenied(textEl, "storage-error");
    button.disabled = false;
  }
}

function bindEvents(_state: PopupState): void {
  const toggleBtn = document.getElementById("toggle-btn") as HTMLButtonElement | null;
  toggleBtn?.addEventListener("click", () => {
    void handleToggle();
  });

  const unblockBtn = document.getElementById("unblock-btn") as HTMLButtonElement | null;
  const cooldownText = document.getElementById("cooldown-text") as HTMLElement | null;
  if (unblockBtn && cooldownText) {
    unblockBtn.addEventListener("click", () => {
      void handleUnblockClick(unblockBtn, cooldownText);
    });
  }

  const openOptions = (): void => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  };

  const openStats = (): void => {
    try {
      const url = chrome.runtime.getURL("src/options.html#stats");
      void chrome.tabs.create({ url });
    } catch {
      openOptions();
    }
  };

  const optionsBtn = document.getElementById("open-options-btn");
  optionsBtn?.addEventListener("click", openOptions);

  const statsBtn = document.getElementById("open-stats-btn");
  statsBtn?.addEventListener("click", openStats);

  const upgradeBtn = document.getElementById(
    "popup-upgrade-btn",
  ) as HTMLButtonElement | null;
  upgradeBtn?.addEventListener("click", () => {
    try {
      const url = chrome.runtime.getURL("src/options.html#premium");
      void chrome.tabs.create({ url });
    } catch {
      openOptions();
    }
  });
}

/** Subscribes to chrome.storage.local with a debounce so bursts coalesce. */
function watchStorage(): void {
  let pending: number | null = null;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const touched = Object.keys(changes).some((k) =>
      Object.values(STORAGE_KEYS).includes(k as (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]),
    );
    if (!touched) return;
    if (pending !== null) window.clearTimeout(pending);
    pending = window.setTimeout(() => {
      pending = null;
      void loadState().then(render);
    }, RENDER_DEBOUNCE_MS);
  });
}

/** Boots the popup once the DOM is ready. */
async function init(): Promise<void> {
  applyI18n();
  const state = await loadState();
  render(state);
  bindEvents(state);
  watchStorage();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void init();
  });
} else {
  void init();
}
