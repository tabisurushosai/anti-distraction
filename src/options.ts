import { applyI18n, t } from "./i18n";

type OptionsState = {
  sites: string[];
  dailyLimitMinutes: number;
  sessionLimitMinutes: number;
  grayIntensity: number;
  cooldownSeconds: number;
  trialStartTs: number | null;
  premiumUnlocked: boolean;
};

const STORAGE_KEYS = {
  sites: "sites",
  dailyLimitMinutes: "dailyLimitMinutes",
  sessionLimitMinutes: "sessionLimitMinutes",
  grayIntensity: "grayIntensity",
  cooldownSeconds: "cooldownSeconds",
  trialStartTs: "trial_start_ts",
  premiumUnlocked: "premium_unlocked",
} as const;

const DEFAULTS: OptionsState = {
  sites: [
    "youtube.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "facebook.com",
    "tiktok.com",
  ],
  dailyLimitMinutes: 30,
  sessionLimitMinutes: 10,
  grayIntensity: 80,
  cooldownSeconds: 30,
  trialStartTs: null,
  premiumUnlocked: false,
};

const TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

function normalizeHost(input: string): string | null {
  let v = input.trim().toLowerCase();
  if (!v) return null;
  if (v.includes("://")) {
    try {
      v = new URL(v).hostname;
    } catch {
      return null;
    }
  }
  v = v.replace(/^\*\./, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return HOST_RE.test(v) ? v : null;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const i = Math.floor(value);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

async function loadState(): Promise<OptionsState> {
  const data = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  return {
    sites:
      Array.isArray(data.sites) && data.sites.every((s) => typeof s === "string")
        ? (data.sites as string[])
        : DEFAULTS.sites,
    dailyLimitMinutes:
      typeof data.dailyLimitMinutes === "number"
        ? data.dailyLimitMinutes
        : DEFAULTS.dailyLimitMinutes,
    sessionLimitMinutes:
      typeof data.sessionLimitMinutes === "number"
        ? data.sessionLimitMinutes
        : DEFAULTS.sessionLimitMinutes,
    grayIntensity:
      typeof data.grayIntensity === "number"
        ? data.grayIntensity
        : DEFAULTS.grayIntensity,
    cooldownSeconds:
      typeof data.cooldownSeconds === "number"
        ? data.cooldownSeconds
        : DEFAULTS.cooldownSeconds,
    trialStartTs:
      typeof data.trial_start_ts === "number" ? data.trial_start_ts : null,
    premiumUnlocked: data.premium_unlocked === true,
  };
}

async function saveState(state: OptionsState): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.sites]: state.sites,
    [STORAGE_KEYS.dailyLimitMinutes]: state.dailyLimitMinutes,
    [STORAGE_KEYS.sessionLimitMinutes]: state.sessionLimitMinutes,
    [STORAGE_KEYS.grayIntensity]: state.grayIntensity,
    [STORAGE_KEYS.cooldownSeconds]: state.cooldownSeconds,
  });
}

const view: OptionsState = { ...DEFAULTS };

function renderSites(): void {
  const list = document.getElementById("sites-list");
  if (!list) return;
  list.innerHTML = "";
  for (const host of view.sites) {
    const li = document.createElement("li");
    li.className = "options__site";

    const span = document.createElement("span");
    span.className = "options__site-host";
    span.textContent = host;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "options__btn options__btn--danger";
    btn.textContent = t("options_site_remove");
    btn.setAttribute("aria-label", `${t("options_site_remove")}: ${host}`);
    btn.addEventListener("click", () => {
      view.sites = view.sites.filter((s) => s !== host);
      renderSites();
    });

    li.appendChild(span);
    li.appendChild(btn);
    list.appendChild(li);
  }
}

function renderInputs(): void {
  const daily = document.getElementById("daily-limit-input") as HTMLInputElement | null;
  const session = document.getElementById("session-limit-input") as HTMLInputElement | null;
  const gray = document.getElementById("gray-intensity-input") as HTMLInputElement | null;
  const grayOut = document.getElementById("gray-intensity-output");
  const cooldown = document.getElementById("cooldown-input") as HTMLInputElement | null;

  if (daily) daily.value = String(view.dailyLimitMinutes);
  if (session) session.value = String(view.sessionLimitMinutes);
  if (gray) gray.value = String(view.grayIntensity);
  if (grayOut) grayOut.textContent = `${view.grayIntensity}%`;
  if (cooldown) cooldown.value = String(view.cooldownSeconds);
}

function renderPremium(): void {
  const el = document.getElementById("premium-status");
  const upgradeBtn = document.getElementById("upgrade-btn") as HTMLButtonElement | null;
  if (!el) return;

  if (view.premiumUnlocked) {
    el.textContent = t("options_premium_active");
    if (upgradeBtn) upgradeBtn.disabled = true;
    return;
  }

  if (view.trialStartTs !== null) {
    const elapsed = Date.now() - view.trialStartTs;
    const daysLeft = Math.max(0, Math.ceil((TRIAL_DAYS * DAY_MS - elapsed) / DAY_MS));
    el.textContent = t("options_trial_remaining", String(daysLeft));
  } else {
    el.textContent = t("options_trial_remaining", String(TRIAL_DAYS));
  }
  if (upgradeBtn) upgradeBtn.disabled = false;
}

function flashSaved(): void {
  const el = document.getElementById("save-status");
  if (!el) return;
  el.textContent = t("options_saved");
  el.hidden = false;
  window.setTimeout(() => {
    el.hidden = true;
  }, 1800);
}

function bindEvents(): void {
  const dailyEl = document.getElementById("daily-limit-input") as HTMLInputElement | null;
  dailyEl?.addEventListener("input", () => {
    view.dailyLimitMinutes = clampInt(Number(dailyEl.value), 0, 24 * 60);
  });

  const sessionEl = document.getElementById("session-limit-input") as HTMLInputElement | null;
  sessionEl?.addEventListener("input", () => {
    view.sessionLimitMinutes = clampInt(Number(sessionEl.value), 0, 24 * 60);
  });

  const grayEl = document.getElementById("gray-intensity-input") as HTMLInputElement | null;
  const grayOut = document.getElementById("gray-intensity-output");
  grayEl?.addEventListener("input", () => {
    view.grayIntensity = clampInt(Number(grayEl.value), 0, 100);
    if (grayOut) grayOut.textContent = `${view.grayIntensity}%`;
  });

  const cooldownEl = document.getElementById("cooldown-input") as HTMLInputElement | null;
  cooldownEl?.addEventListener("input", () => {
    view.cooldownSeconds = clampInt(Number(cooldownEl.value), 0, 3600);
  });

  const addBtn = document.getElementById("add-site-btn");
  const newSite = document.getElementById("new-site-input") as HTMLInputElement | null;
  const addSite = (): void => {
    if (!newSite) return;
    const host = normalizeHost(newSite.value);
    if (!host) {
      newSite.focus();
      newSite.select();
      return;
    }
    if (!view.sites.includes(host)) {
      view.sites = [...view.sites, host];
      renderSites();
    }
    newSite.value = "";
    newSite.focus();
  };
  addBtn?.addEventListener("click", addSite);
  newSite?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSite();
    }
  });

  const saveBtn = document.getElementById("save-btn");
  saveBtn?.addEventListener("click", () => {
    void saveState(view).then(flashSaved);
  });

  const resetBtn = document.getElementById("reset-btn");
  resetBtn?.addEventListener("click", () => {
    Object.assign(view, {
      sites: [...DEFAULTS.sites],
      dailyLimitMinutes: DEFAULTS.dailyLimitMinutes,
      sessionLimitMinutes: DEFAULTS.sessionLimitMinutes,
      grayIntensity: DEFAULTS.grayIntensity,
      cooldownSeconds: DEFAULTS.cooldownSeconds,
    });
    renderSites();
    renderInputs();
  });

  const upgradeBtn = document.getElementById("upgrade-btn");
  upgradeBtn?.addEventListener("click", () => {
    // Stripe Checkout integration is wired up in a later task (T033).
  });
}

function watchStorage(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const watched: string[] = [
      STORAGE_KEYS.trialStartTs,
      STORAGE_KEYS.premiumUnlocked,
    ];
    if (!watched.some((k) => k in changes)) return;
    void loadState().then((next) => {
      view.trialStartTs = next.trialStartTs;
      view.premiumUnlocked = next.premiumUnlocked;
      renderPremium();
    });
  });
}

async function init(): Promise<void> {
  applyI18n();
  const loaded = await loadState();
  Object.assign(view, loaded);
  renderSites();
  renderInputs();
  renderPremium();
  bindEvents();
  watchStorage();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void init();
  });
} else {
  void init();
}
