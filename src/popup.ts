import { applyI18n, t } from "./i18n";

type PopupState = {
  enabled: boolean;
  dailyLimitMinutes: number;
  cooldownSeconds: number;
  usageByDate: Record<string, number>;
};

const STORAGE_KEYS = {
  enabled: "enabled",
  dailyLimitMinutes: "dailyLimitMinutes",
  cooldownSeconds: "cooldownSeconds",
  usageByDate: "usageByDate",
} as const;

const DEFAULTS: PopupState = {
  enabled: true,
  dailyLimitMinutes: 30,
  cooldownSeconds: 30,
  usageByDate: {},
};

function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function msToMinutes(ms: number): number {
  return Math.max(0, Math.floor(ms / 60000));
}

async function loadState(): Promise<PopupState> {
  const data = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
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
  btn.textContent = state.enabled ? t("popup_toggle_off") : t("popup_toggle_on");
}

function renderUsage(state: PopupState): void {
  const usageEl = document.getElementById("today-usage");
  const remainingEl = document.getElementById("remaining-time");
  const usedMs = state.usageByDate[todayKey()] ?? 0;
  const usedMin = msToMinutes(usedMs);
  const remainingMin = Math.max(0, state.dailyLimitMinutes - usedMin);
  if (usageEl) usageEl.textContent = t("popup_minutes", String(usedMin));
  if (remainingEl) remainingEl.textContent = t("popup_minutes", String(remainingMin));
}

async function handleToggle(): Promise<void> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.enabled);
  const next = !(typeof data.enabled === "boolean" ? data.enabled : true);
  await chrome.storage.local.set({ [STORAGE_KEYS.enabled]: next });
}

function startCooldown(seconds: number, textEl: HTMLElement, button: HTMLButtonElement): void {
  let remaining = seconds;
  textEl.hidden = false;
  button.disabled = true;
  const tick = (): void => {
    if (remaining <= 0) {
      textEl.hidden = true;
      textEl.textContent = "";
      button.disabled = false;
      return;
    }
    textEl.textContent = t("popup_cooldown_active", String(remaining));
    remaining -= 1;
    window.setTimeout(tick, 1000);
  };
  tick();
}

function bindEvents(state: PopupState): void {
  const toggleBtn = document.getElementById("toggle-btn") as HTMLButtonElement | null;
  toggleBtn?.addEventListener("click", () => {
    void handleToggle();
  });

  const unblockBtn = document.getElementById("unblock-btn") as HTMLButtonElement | null;
  const cooldownText = document.getElementById("cooldown-text") as HTMLElement | null;
  if (unblockBtn && cooldownText) {
    unblockBtn.addEventListener("click", () => {
      startCooldown(state.cooldownSeconds, cooldownText, unblockBtn);
    });
  }

  const optionsBtn = document.getElementById("open-options-btn");
  optionsBtn?.addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  });

  const statsBtn = document.getElementById("open-stats-btn");
  statsBtn?.addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  });
}

function watchStorage(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const touched = Object.keys(changes).some((k) =>
      Object.values(STORAGE_KEYS).includes(k as (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]),
    );
    if (!touched) return;
    void loadState().then((state) => {
      renderStatus(state);
      renderToggleButton(state);
      renderUsage(state);
    });
  });
}

async function init(): Promise<void> {
  applyI18n();
  const state = await loadState();
  renderStatus(state);
  renderToggleButton(state);
  renderUsage(state);
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
