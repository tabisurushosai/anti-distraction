export type MessageKey =
  | "appName"
  | "appDesc"
  | "popup_title"
  | "popup_status_enabled"
  | "popup_status_disabled"
  | "popup_toggle_on"
  | "popup_toggle_off"
  | "popup_today_usage"
  | "popup_remaining_time"
  | "popup_minutes"
  | "popup_open_options"
  | "popup_open_stats"
  | "popup_unblock_request"
  | "popup_cooldown_active"
  | "options_title"
  | "options_section_sites"
  | "options_section_limits"
  | "options_section_appearance"
  | "options_section_cooldown"
  | "options_section_stats"
  | "options_section_premium"
  | "options_site_add"
  | "options_site_remove"
  | "options_site_placeholder"
  | "options_limit_daily"
  | "options_limit_session"
  | "options_gray_intensity"
  | "options_cooldown_seconds"
  | "options_save"
  | "options_saved"
  | "options_reset"
  | "options_upgrade_premium"
  | "options_trial_remaining"
  | "options_premium_active"
  | "options_site_limit_reached"
  | "options_site_not_covered"
  | "options_site_invalid"
  | "stats_recent_7d"
  | "stats_recent_30d"
  | "stats_hours_minutes"
  | "stats_total"
  | "stats_average"
  | "stats_achievement_rate"
  | "stats_streak_current"
  | "stats_streak_best"
  | "stats_no_data"
  | "stats_limit_note"
  | "stats_premium_required"
  | "blocked_message"
  | "overlay_blocked_title"
  | "overlay_blocked_reason_daily"
  | "overlay_blocked_reason_session"
  | "overlay_continue_short"
  | "cooldown_remaining"
  | "cooldown_returning"
  | "cooldown_denied_rate_limit"
  | "cooldown_denied_disabled"
  | "cooldown_denied_not_blocked"
  | "cooldown_denied_premium_required"
  | "cooldown_denied_storage"
  | "options_cooldown_note"
  | "options_cooldown_used_today";

export function t(key: MessageKey, substitutions?: string | string[]): string {
  const msg = chrome.i18n.getMessage(key, substitutions);
  return msg === "" ? key : msg;
}

export function applyI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n as MessageKey | undefined;
    if (key) el.textContent = t(key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder as MessageKey | undefined;
    if (key && "placeholder" in el) {
      (el as HTMLInputElement | HTMLTextAreaElement).placeholder = t(key);
    }
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle as MessageKey | undefined;
    if (key) el.title = t(key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-aria-label]").forEach((el) => {
    const key = el.dataset.i18nAriaLabel as MessageKey | undefined;
    if (key) el.setAttribute("aria-label", t(key));
  });
}

export function getUiLocale(): string {
  return chrome.i18n.getUILanguage();
}
