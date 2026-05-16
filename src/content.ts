import { getValues, onStorageChanged } from "./storage";
import { hostMatches } from "./lib/host-match";

const STYLE_ID = "anti-distraction-style";
const ROOT_ATTR = "data-anti-distraction";
const OVERLAY_ID = "anti-distraction-overlay";
const OVERLAY_STYLE_ID = "anti-distraction-overlay-style";

function ensureStyleEl(): HTMLStyleElement {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (el) return el;
  el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
html[${ROOT_ATTR}="active"] {
  filter: grayscale(var(--ad-gray, 80%)) brightness(var(--ad-bright, 76%));
  transition: filter 200ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  html[${ROOT_ATTR}="active"] { transition: none; }
}
`;
  (document.head || document.documentElement).appendChild(el);
  return el;
}

function applyGray(intensity: number): void {
  ensureStyleEl();
  const clamped = Math.max(0, Math.min(100, intensity));
  const bright = Math.max(0, 100 - clamped * 0.3);
  const root = document.documentElement;
  root.style.setProperty("--ad-gray", `${clamped}%`);
  root.style.setProperty("--ad-bright", `${bright}%`);
  root.setAttribute(ROOT_ATTR, "active");
}

function removeGray(): void {
  const root = document.documentElement;
  if (root.hasAttribute(ROOT_ATTR)) root.removeAttribute(ROOT_ATTR);
}

function ensureOverlayStyle(): void {
  if (document.getElementById(OVERLAY_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = OVERLAY_STYLE_ID;
  el.textContent = `
#${OVERLAY_ID} {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: rgba(15, 15, 20, 0.92);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  animation: ad-overlay-fade 160ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  #${OVERLAY_ID} { animation: none; }
}
@keyframes ad-overlay-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
#${OVERLAY_ID} .ad-overlay-card {
  max-width: 32rem;
  padding: 2rem 2.5rem;
  background: rgba(30, 30, 38, 0.95);
  border-radius: 12px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
  text-align: center;
}
#${OVERLAY_ID} h1 {
  font-size: 1.5rem;
  margin: 0 0 0.75rem;
  line-height: 1.4;
}
#${OVERLAY_ID} p {
  margin: 0 0 1rem;
  font-size: 1rem;
  line-height: 1.6;
  color: #d8d8e0;
}
#${OVERLAY_ID} button {
  margin-top: 0.5rem;
  padding: 0.6rem 1.2rem;
  font-size: 0.95rem;
  border: 1px solid #888;
  background: transparent;
  color: #fff;
  border-radius: 6px;
  cursor: not-allowed;
  opacity: 0.55;
}
`;
  (document.head || document.documentElement).appendChild(el);
}

function i18n(key: string, fallback: string): string {
  try {
    const v = chrome.i18n?.getMessage?.(key);
    return v && v.length > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function showOverlay(reason: "daily" | "session"): void {
  if (document.getElementById(OVERLAY_ID)) return;
  ensureOverlayStyle();
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", `${OVERLAY_ID}-title`);

  const card = document.createElement("div");
  card.className = "ad-overlay-card";

  const title = document.createElement("h1");
  title.id = `${OVERLAY_ID}-title`;
  title.textContent = i18n("overlay_blocked_title", "時間制限に達しました");

  const reasonText = document.createElement("p");
  reasonText.textContent =
    reason === "daily"
      ? i18n("overlay_blocked_reason_daily", "本日の累計上限を超えました。明日 0:00 までブロックされます。")
      : i18n("overlay_blocked_reason_session", "連続滞在の上限を超えました。タブを閉じて休憩しましょう。");

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = i18n("overlay_continue_short", "30秒だけ続ける");
  button.disabled = true;
  button.setAttribute("aria-disabled", "true");

  card.appendChild(title);
  card.appendChild(reasonText);
  card.appendChild(button);
  overlay.appendChild(card);
  (document.body || document.documentElement).appendChild(overlay);

  try {
    button.focus();
  } catch {
    /* focus may fail before body exists; ignore */
  }
}

function hideOverlay(): void {
  const el = document.getElementById(OVERLAY_ID);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

type State = {
  enabled: boolean;
  sites: readonly string[];
  grayIntensity: number;
};

function evaluateGray(state: State): void {
  const shouldApply =
    state.enabled &&
    state.grayIntensity > 0 &&
    hostMatches(location.hostname, state.sites);
  if (shouldApply) {
    applyGray(state.grayIntensity);
  } else {
    removeGray();
  }
}

type IncomingMessage =
  | { type: "ad/time-limit/block"; reason: "daily" | "session" }
  | { type: "ad/time-limit/unblock" };

function isIncomingMessage(v: unknown): v is IncomingMessage {
  if (!v || typeof v !== "object") return false;
  const t = (v as { type?: unknown }).type;
  return t === "ad/time-limit/block" || t === "ad/time-limit/unblock";
}

function installMessageListener(): void {
  chrome.runtime.onMessage.addListener((message) => {
    if (!isIncomingMessage(message)) return;
    if (message.type === "ad/time-limit/block") {
      showOverlay(message.reason);
    } else {
      hideOverlay();
    }
  });
}

async function init(): Promise<void> {
  if (window.top !== window) return;
  try {
    const state = await getValues(["enabled", "sites", "grayIntensity"] as const);
    evaluateGray(state);
    onStorageChanged((changes) => {
      if (!("enabled" in changes || "sites" in changes || "grayIntensity" in changes)) {
        return;
      }
      getValues(["enabled", "sites", "grayIntensity"] as const)
        .then((s) => evaluateGray(s))
        .catch(() => {});
    });
    installMessageListener();
  } catch {
    // fail safe: do nothing
  }
}

void init();
