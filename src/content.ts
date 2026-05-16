import { getValues, onStorageChanged } from "./storage";
import { hostMatches } from "./lib/host-match";

const STYLE_ID = "anti-distraction-style";
const ROOT_ATTR = "data-anti-distraction";

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

type State = {
  enabled: boolean;
  sites: readonly string[];
  grayIntensity: number;
};

function evaluate(state: State): void {
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

async function init(): Promise<void> {
  if (window.top !== window) return;
  try {
    const state = await getValues(["enabled", "sites", "grayIntensity"] as const);
    evaluate(state);
    onStorageChanged((changes) => {
      if (!("enabled" in changes || "sites" in changes || "grayIntensity" in changes)) {
        return;
      }
      getValues(["enabled", "sites", "grayIntensity"] as const)
        .then((s) => evaluate(s))
        .catch(() => {});
    });
  } catch {
    // fail safe: do nothing
  }
}

void init();
