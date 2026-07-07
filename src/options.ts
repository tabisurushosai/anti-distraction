/**
 * @file Options page script. Owns four UI sections (sites, limits, appearance/
 * cooldown, stats, premium) and persists each user input directly to
 * `chrome.storage.local` — there is no submit button; the storage listener
 * is the single source of truth for re-rendering.
 */

import { applyI18n, t } from "./i18n";
import { normalizeHost, isCoveredByManifest } from "./lib/site-input";
import {
  achievementRate,
  averageMinutes,
  computeStreak,
  formatMinutes,
  lastNDays,
  summarizeUsage,
  totalMinutes,
  type UsageSummary,
} from "./lib/usage-stats";
import {
  isPremiumEffective,
  isPremiumPurchased,
} from "./lib/premium-status";
import {
  COOLDOWN_FREE_FIXED_SECONDS,
  COOLDOWN_MAX_SECONDS,
  COOLDOWN_MIN_SECONDS,
  usedToday,
  dailyMax,
} from "./lib/cooldown";
import { applyLicenseCode, startCheckout } from "./upgrade";

type OptionsState = {
  sites: string[];
  dailyLimitMinutes: number;
  sessionLimitMinutes: number;
  grayIntensity: number;
  cooldownSeconds: number;
  trialStartTs: number | null;
  premiumUnlocked: boolean;
  premiumVerifiedAt: number | null;
  premiumGraceUntil: number | null;
  usageByDate: Record<string, number>;
  unblockCountByDate: Record<string, number>;
  unblockMaxPerDayFree: number;
  unblockMaxPerDayPremium: number;
};

const STORAGE_KEYS = {
  sites: "sites",
  dailyLimitMinutes: "dailyLimitMinutes",
  sessionLimitMinutes: "sessionLimitMinutes",
  grayIntensity: "grayIntensity",
  cooldownSeconds: "cooldownSeconds",
  trialStartTs: "trial_start_ts",
  premiumUnlocked: "premium_unlocked",
  premiumVerifiedAt: "premium_verified_at",
  premiumGraceUntil: "premium_grace_until",
  usageByDate: "usageByDate",
  unblockCountByDate: "unblockCountByDate",
  unblockMaxPerDayFree: "unblockMaxPerDayFree",
  unblockMaxPerDayPremium: "unblockMaxPerDayPremium",
} as const;

const STATS_FREE_DAYS = 7;
const STATS_PREMIUM_DAYS = 30;
const STATS_DEBOUNCE_MS = 500;

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
  premiumVerifiedAt: null,
  premiumGraceUntil: null,
  usageByDate: {},
  unblockCountByDate: {},
  unblockMaxPerDayFree: 3,
  unblockMaxPerDayPremium: 10,
};

const TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const FREE_SITES_LIMIT = 10;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const i = Math.floor(value);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

/** Reads the entire options view-model from chrome.storage with defaults. */
async function loadState(): Promise<OptionsState> {
  let data: Record<string, unknown> = {};
  try {
    data = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  } catch {
    /* fail-safe: storage may be unavailable; fall through to defaults */
  }
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
    premiumVerifiedAt:
      typeof data.premium_verified_at === "number"
        ? data.premium_verified_at
        : null,
    premiumGraceUntil:
      typeof data.premium_grace_until === "number"
        ? data.premium_grace_until
        : null,
    usageByDate:
      data.usageByDate && typeof data.usageByDate === "object" && !Array.isArray(data.usageByDate)
        ? (data.usageByDate as Record<string, number>)
        : DEFAULTS.usageByDate,
    unblockCountByDate:
      data.unblockCountByDate &&
      typeof data.unblockCountByDate === "object" &&
      !Array.isArray(data.unblockCountByDate)
        ? (data.unblockCountByDate as Record<string, number>)
        : DEFAULTS.unblockCountByDate,
    unblockMaxPerDayFree:
      typeof data.unblockMaxPerDayFree === "number"
        ? data.unblockMaxPerDayFree
        : DEFAULTS.unblockMaxPerDayFree,
    unblockMaxPerDayPremium:
      typeof data.unblockMaxPerDayPremium === "number"
        ? data.unblockMaxPerDayPremium
        : DEFAULTS.unblockMaxPerDayPremium,
  };
}

/** Persists the user-editable subset of options to storage. */
async function saveState(state: OptionsState): Promise<void> {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.sites]: state.sites,
      [STORAGE_KEYS.dailyLimitMinutes]: state.dailyLimitMinutes,
      [STORAGE_KEYS.sessionLimitMinutes]: state.sessionLimitMinutes,
      [STORAGE_KEYS.grayIntensity]: state.grayIntensity,
      [STORAGE_KEYS.cooldownSeconds]: state.cooldownSeconds,
    });
  } catch (e) {
    console.warn("[options] failed to persist settings", e);
  }
}

const view: OptionsState = { ...DEFAULTS };

/** True when the user has either purchased premium or is within trial window. */
function isUnlimited(): boolean {
  return isPremiumNow();
}

function showSiteWarning(host: string): void {
  const el = document.getElementById("site-warning");
  if (!el) return;
  el.textContent = t("options_site_not_covered", host);
  el.hidden = false;
}

function clearSiteWarning(): void {
  const el = document.getElementById("site-warning");
  if (!el) return;
  el.textContent = "";
  el.hidden = true;
}

function renderSiteLimit(): void {
  const el = document.getElementById("site-limit");
  const addBtn = document.getElementById("add-site-btn") as HTMLButtonElement | null;
  const newSite = document.getElementById("new-site-input") as HTMLInputElement | null;
  const atLimit = !isUnlimited() && view.sites.length >= FREE_SITES_LIMIT;
  if (el) {
    if (atLimit) {
      el.textContent = t("options_site_limit_reached", String(FREE_SITES_LIMIT));
      el.hidden = false;
    } else {
      el.textContent = "";
      el.hidden = true;
    }
  }
  if (addBtn) addBtn.disabled = atLimit;
  if (newSite) newSite.disabled = atLimit;
}

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
      renderSiteLimit();
      clearSiteWarning();
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
  if (cooldown) {
    cooldown.value = String(view.cooldownSeconds);
    cooldown.disabled = !isPremiumNow();
  }
}

function todayKeyLocal(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function renderCooldownSection(): void {
  const usedEl = document.getElementById("cooldown-used-today");
  const noteEl = document.getElementById("cooldown-note");
  const premium = isPremiumNow();
  const max = dailyMax(
    {
      unblockCountByDate: view.unblockCountByDate,
      unblockMaxPerDayFree: view.unblockMaxPerDayFree,
      unblockMaxPerDayPremium: view.unblockMaxPerDayPremium,
    },
    premium,
  );
  const used = usedToday(
    {
      unblockCountByDate: view.unblockCountByDate,
      unblockMaxPerDayFree: view.unblockMaxPerDayFree,
      unblockMaxPerDayPremium: view.unblockMaxPerDayPremium,
    },
    todayKeyLocal(),
  );
  if (usedEl) {
    usedEl.textContent = t("options_cooldown_used_today", [
      String(used),
      String(max),
    ]);
  }
  if (noteEl) {
    noteEl.textContent = t("options_cooldown_note", [
      String(Math.max(1, Math.floor(view.cooldownSeconds))),
      String(view.unblockMaxPerDayFree),
      String(view.unblockMaxPerDayPremium),
    ]);
  }
}

function renderPremium(): void {
  const el = document.getElementById("premium-status");
  const upgradeBtn = document.getElementById("upgrade-btn") as HTMLButtonElement | null;
  if (!el) return;

  const purchased = isPremiumPurchased(
    {
      premium_unlocked: view.premiumUnlocked,
      premium_verified_at: view.premiumVerifiedAt,
      premium_grace_until: view.premiumGraceUntil,
      trial_start_ts: view.trialStartTs,
    },
    Date.now(),
  );
  if (purchased) {
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

/** Memo-free helper; cheap because all inputs are in-memory `view` fields. */
function isPremiumNow(): boolean {
  return isPremiumEffective(
    {
      premium_unlocked: view.premiumUnlocked,
      premium_verified_at: view.premiumVerifiedAt,
      premium_grace_until: view.premiumGraceUntil,
      trial_start_ts: view.trialStartTs,
    },
    Date.now(),
  );
}

function formatMinutesLocalized(minutes: number): string {
  return formatMinutes(minutes, {
    hoursMinutes: t("stats_hours_minutes", [String(Math.floor(minutes / 60)), String(minutes % 60)]),
    minutesOnly: t("popup_minutes", String(minutes)),
  });
}

function renderStatsTableHeader(): void {
  const table = document.getElementById("stats-table");
  if (!table) return;
  const heads = table.querySelectorAll<HTMLTableCellElement>("thead th");
  heads.forEach((th) => {
    const col = th.dataset.statsCol;
    if (col === "date") th.textContent = isPremiumNow() ? t("stats_recent_30d") : t("stats_recent_7d");
    else if (col === "minutes") th.textContent = t("popup_today_usage");
    else if (col === "limit") th.textContent = t("options_limit_daily");
    else if (col === "status") th.textContent = t("stats_achievement_rate");
  });
}

function renderStatsCaption(days: number): void {
  const cap = document.getElementById("stats-caption");
  if (!cap) return;
  cap.textContent = days === STATS_PREMIUM_DAYS ? t("stats_recent_30d") : t("stats_recent_7d");
}

function renderStatsRangeLabel(): void {
  const label = document.getElementById("stats-range-label");
  if (!label) return;
  label.textContent = isPremiumNow() ? t("stats_recent_30d") : t("stats_recent_7d");
}

function renderStatsRows(summary: UsageSummary): void {
  const tbody = document.getElementById("stats-table-body");
  if (!tbody) return;
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

  const limitMinutes = Math.max(0, Math.floor(view.dailyLimitMinutes));
  const limitText =
    limitMinutes > 0 ? t("popup_minutes", String(limitMinutes)) : "—";

  for (let i = summary.length - 1; i >= 0; i--) {
    const row = summary[i];
    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.textContent = row.key;

    const tdMin = document.createElement("td");
    tdMin.textContent =
      row.minutes === 0 && (view.usageByDate[row.key] === undefined)
        ? t("stats_no_data")
        : formatMinutesLocalized(row.minutes);

    const tdLimit = document.createElement("td");
    tdLimit.textContent = limitText;

    const tdStatus = document.createElement("td");
    if (limitMinutes === 0) {
      tdStatus.textContent = "—";
    } else if (row.exceeded) {
      tdStatus.textContent = "!";
      tdStatus.classList.add("options__stats-status--exceeded");
    } else {
      tdStatus.textContent = "✓";
      tdStatus.classList.add("options__stats-status--ok");
    }

    tr.appendChild(tdDate);
    tr.appendChild(tdMin);
    tr.appendChild(tdLimit);
    tr.appendChild(tdStatus);
    tbody.appendChild(tr);
  }
}

function appendAggregateItem(parent: HTMLElement, label: string, value: string): void {
  const wrap = document.createElement("div");
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  wrap.appendChild(dt);
  wrap.appendChild(dd);
  parent.appendChild(wrap);
}

function renderStatsAggregate(summary: UsageSummary): void {
  const dl = document.getElementById("stats-aggregate");
  if (!dl) return;
  while (dl.firstChild) dl.removeChild(dl.firstChild);

  const limitMinutes = Math.max(0, Math.floor(view.dailyLimitMinutes));
  const total = totalMinutes(summary);
  const avg = averageMinutes(summary);
  const rate = achievementRate(summary, limitMinutes);

  appendAggregateItem(dl, t("stats_total"), formatMinutesLocalized(total));
  appendAggregateItem(dl, t("stats_average"), formatMinutesLocalized(avg));
  appendAggregateItem(
    dl,
    t("stats_achievement_rate"),
    rate === null ? "—" : `${Math.round(rate * 100)}%`,
  );

  if (isPremiumNow()) {
    const streak = computeStreak(summary, limitMinutes);
    if (streak !== null) {
      appendAggregateItem(dl, t("stats_streak_current"), `${streak.current}`);
      appendAggregateItem(dl, t("stats_streak_best"), `${streak.best}`);
    }
  }
}

function renderPremiumGate(): void {
  const note = document.getElementById("stats-premium-note");
  if (!note) return;
  note.hidden = isPremiumNow();
}

/** Re-renders the entire stats section (table + aggregate + premium gate). */
function renderStats(): void {
  const days = isPremiumNow() ? STATS_PREMIUM_DAYS : STATS_FREE_DAYS;
  const keys = lastNDays(new Date(), days);
  const summary = summarizeUsage(view.usageByDate, keys, view.dailyLimitMinutes);
  renderStatsTableHeader();
  renderStatsCaption(days);
  renderStatsRangeLabel();
  renderStatsRows(summary);
  renderStatsAggregate(summary);
  renderPremiumGate();
}

function scrollToStatsIfRequested(): void {
  const hash = window.location.hash;
  if (hash !== "#stats" && hash !== "#premium") return;
  const target = document.getElementById(hash.slice(1));
  if (target) target.scrollIntoView({ behavior: "auto", block: "start" });
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

/** Wires every input/button on the options page to its handler. */
function bindEvents(): void {
  const dailyEl = document.getElementById("daily-limit-input") as HTMLInputElement | null;
  dailyEl?.addEventListener("input", () => {
    view.dailyLimitMinutes = clampInt(Number(dailyEl.value), 0, 24 * 60);
    renderStats();
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
    if (!isPremiumNow()) {
      view.cooldownSeconds = COOLDOWN_FREE_FIXED_SECONDS;
      cooldownEl.value = String(COOLDOWN_FREE_FIXED_SECONDS);
    } else {
      view.cooldownSeconds = clampInt(
        Number(cooldownEl.value),
        COOLDOWN_MIN_SECONDS,
        COOLDOWN_MAX_SECONDS,
      );
    }
    renderCooldownSection();
  });

  const addBtn = document.getElementById("add-site-btn");
  const newSite = document.getElementById("new-site-input") as HTMLInputElement | null;
  const addSite = (): void => {
    if (!newSite) return;
    if (!isUnlimited() && view.sites.length >= FREE_SITES_LIMIT) {
      renderSiteLimit();
      return;
    }
    const host = normalizeHost(newSite.value);
    if (!host) {
      const warn = document.getElementById("site-warning");
      if (warn) {
        warn.textContent = t("options_site_invalid");
        warn.hidden = false;
      }
      newSite.focus();
      newSite.select();
      return;
    }
    if (!view.sites.includes(host)) {
      view.sites = [...view.sites, host];
      renderSites();
      renderSiteLimit();
      if (isCoveredByManifest(host)) {
        clearSiteWarning();
      } else {
        showSiteWarning(host);
      }
    } else {
      clearSiteWarning();
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
    renderSiteLimit();
    clearSiteWarning();
    renderCooldownSection();
  });

  const upgradeBtn = document.getElementById("upgrade-btn") as HTMLButtonElement | null;
  upgradeBtn?.addEventListener("click", () => {
    if (
      isPremiumPurchased(
        {
          premium_unlocked: view.premiumUnlocked,
          premium_verified_at: view.premiumVerifiedAt,
          premium_grace_until: view.premiumGraceUntil,
          trial_start_ts: view.trialStartTs,
        },
        Date.now(),
      )
    ) {
      return;
    }
    upgradeBtn.disabled = true;
    void startCheckout()
      .catch((error: unknown) => {
        showLicenseStatus(
          error instanceof Error && error.message === "gumroad-not-configured"
            ? "options_license_config_error"
            : "options_checkout_error",
          "error",
        );
      })
      .finally(() => {
        upgradeBtn.disabled = isPremiumPurchased(
          {
            premium_unlocked: view.premiumUnlocked,
            premium_verified_at: view.premiumVerifiedAt,
            premium_grace_until: view.premiumGraceUntil,
            trial_start_ts: view.trialStartTs,
          },
          Date.now(),
        );
      });
  });

  const licenseInput = document.getElementById("license-input") as HTMLInputElement | null;
  const applyLicenseBtn = document.getElementById(
    "apply-license-btn",
  ) as HTMLButtonElement | null;
  const licenseStatus = document.getElementById("license-status");
  const showLicenseStatus = (
    key:
      | "options_license_invalid"
      | "options_license_applied"
      | "options_license_storage_error"
      | "options_license_network_error"
      | "options_license_config_error"
      | "options_checkout_error",
    kind: "ok" | "error",
  ): void => {
    if (!licenseStatus) return;
    licenseStatus.textContent = t(key);
    licenseStatus.hidden = false;
    licenseStatus.classList.toggle("options__license-status--ok", kind === "ok");
    licenseStatus.classList.toggle("options__license-status--error", kind === "error");
  };
  const applyLicense = (): void => {
    if (!licenseInput || !applyLicenseBtn) return;
    const code = licenseInput.value;
    applyLicenseBtn.disabled = true;
    void applyLicenseCode(code)
      .then((res) => {
        if (res.ok) {
          showLicenseStatus("options_license_applied", "ok");
          licenseInput.value = "";
        } else if (res.reason === "storage-error") {
          showLicenseStatus("options_license_storage_error", "error");
        } else if (res.reason === "network-error") {
          showLicenseStatus("options_license_network_error", "error");
        } else if (res.reason === "config-error") {
          showLicenseStatus("options_license_config_error", "error");
        } else {
          showLicenseStatus("options_license_invalid", "error");
        }
      })
      .finally(() => {
        applyLicenseBtn.disabled = false;
      });
  };
  applyLicenseBtn?.addEventListener("click", applyLicense);
  licenseInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyLicense();
    }
  });

  const exportBtn = document.getElementById("export-btn") as HTMLButtonElement | null;
  const importBtn = document.getElementById("import-btn") as HTMLButtonElement | null;
  const importFile = document.getElementById("import-file") as HTMLInputElement | null;
  const backupStatus = document.getElementById("backup-status");
  const showBackupStatus = (
    key:
      | "options_backup_export_done"
      | "options_backup_import_done"
      | "options_backup_import_invalid",
    kind: "ok" | "error",
  ): void => {
    if (!backupStatus) return;
    backupStatus.textContent = t(key);
    backupStatus.hidden = false;
    backupStatus.classList.toggle("options__backup-status--ok", kind === "ok");
    backupStatus.classList.toggle("options__backup-status--error", kind === "error");
  };
  exportBtn?.addEventListener("click", () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: {
        sites: view.sites,
        dailyLimitMinutes: view.dailyLimitMinutes,
        sessionLimitMinutes: view.sessionLimitMinutes,
        grayIntensity: view.grayIntensity,
        cooldownSeconds: view.cooldownSeconds,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anti-distraction-settings-${todayKeyLocal()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showBackupStatus("options_backup_export_done", "ok");
  });
  importBtn?.addEventListener("click", () => importFile?.click());
  importFile?.addEventListener("change", () => {
    const file = importFile.files?.[0];
    if (!file) return;
    file
      .text()
      .then((text) => {
        const parsed: unknown = JSON.parse(text);
        if (!parsed || typeof parsed !== "object") throw new Error("invalid");
        const root = parsed as Record<string, unknown>;
        const s = (root.settings ?? root) as Record<string, unknown>;
        if (!s || typeof s !== "object") throw new Error("invalid");

        const next: Partial<OptionsState> = {};
        if (
          Array.isArray(s.sites) &&
          s.sites.every((v) => typeof v === "string")
        ) {
          const normalized: string[] = [];
          for (const raw of s.sites as string[]) {
            const host = normalizeHost(raw);
            if (host && !normalized.includes(host)) normalized.push(host);
          }
          next.sites = normalized;
        }
        if (typeof s.dailyLimitMinutes === "number") {
          next.dailyLimitMinutes = clampInt(s.dailyLimitMinutes, 0, 24 * 60);
        }
        if (typeof s.sessionLimitMinutes === "number") {
          next.sessionLimitMinutes = clampInt(s.sessionLimitMinutes, 0, 24 * 60);
        }
        if (typeof s.grayIntensity === "number") {
          next.grayIntensity = clampInt(s.grayIntensity, 0, 100);
        }
        if (typeof s.cooldownSeconds === "number") {
          next.cooldownSeconds = clampInt(
            s.cooldownSeconds,
            COOLDOWN_MIN_SECONDS,
            COOLDOWN_MAX_SECONDS,
          );
        }
        if (Object.keys(next).length === 0) throw new Error("invalid");

        Object.assign(view, next);
        return saveState(view).then(() => {
          renderSites();
          renderInputs();
          renderSiteLimit();
          renderCooldownSection();
          renderStats();
          showBackupStatus("options_backup_import_done", "ok");
        });
      })
      .catch(() => {
        showBackupStatus("options_backup_import_invalid", "error");
      })
      .finally(() => {
        importFile.value = "";
      });
  });

  const triggerSaveOnEnter = (e: KeyboardEvent): void => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void saveState(view).then(flashSaved);
  };
  dailyEl?.addEventListener("keydown", triggerSaveOnEnter);
  sessionEl?.addEventListener("keydown", triggerSaveOnEnter);
  cooldownEl?.addEventListener("keydown", triggerSaveOnEnter);
}

/** Subscribes to storage changes and partially re-renders affected sections. */
function watchStorage(): void {
  let statsPending: number | null = null;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const watched: string[] = [
      STORAGE_KEYS.trialStartTs,
      STORAGE_KEYS.premiumUnlocked,
      STORAGE_KEYS.premiumVerifiedAt,
      STORAGE_KEYS.premiumGraceUntil,
      STORAGE_KEYS.sites,
      STORAGE_KEYS.usageByDate,
      STORAGE_KEYS.dailyLimitMinutes,
      STORAGE_KEYS.unblockCountByDate,
      STORAGE_KEYS.unblockMaxPerDayFree,
      STORAGE_KEYS.unblockMaxPerDayPremium,
      STORAGE_KEYS.cooldownSeconds,
    ];
    if (!watched.some((k) => k in changes)) return;
    void loadState().then((next) => {
      view.trialStartTs = next.trialStartTs;
      view.premiumUnlocked = next.premiumUnlocked;
      view.premiumVerifiedAt = next.premiumVerifiedAt;
      view.premiumGraceUntil = next.premiumGraceUntil;
      if (STORAGE_KEYS.sites in changes) {
        view.sites = next.sites;
        renderSites();
      }
      if (STORAGE_KEYS.usageByDate in changes) {
        view.usageByDate = next.usageByDate;
      }
      if (STORAGE_KEYS.dailyLimitMinutes in changes) {
        view.dailyLimitMinutes = next.dailyLimitMinutes;
      }
      if (STORAGE_KEYS.unblockCountByDate in changes) {
        view.unblockCountByDate = next.unblockCountByDate;
      }
      if (STORAGE_KEYS.unblockMaxPerDayFree in changes) {
        view.unblockMaxPerDayFree = next.unblockMaxPerDayFree;
      }
      if (STORAGE_KEYS.unblockMaxPerDayPremium in changes) {
        view.unblockMaxPerDayPremium = next.unblockMaxPerDayPremium;
      }
      if (STORAGE_KEYS.cooldownSeconds in changes) {
        view.cooldownSeconds = next.cooldownSeconds;
      }
      renderPremium();
      renderSiteLimit();
      renderInputs();
      renderCooldownSection();
      if (statsPending !== null) window.clearTimeout(statsPending);
      statsPending = window.setTimeout(() => {
        statsPending = null;
        renderStats();
      }, STATS_DEBOUNCE_MS);
    });
  });
}

/** Boots the options page once the DOM is ready. */
async function init(): Promise<void> {
  applyI18n();
  const loaded = await loadState();
  Object.assign(view, loaded);
  renderSites();
  renderInputs();
  renderPremium();
  renderSiteLimit();
  renderStats();
  renderCooldownSection();
  bindEvents();
  watchStorage();
  scrollToStatsIfRequested();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void init();
  });
} else {
  void init();
}
