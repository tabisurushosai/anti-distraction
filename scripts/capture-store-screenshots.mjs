#!/usr/bin/env node

import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Browser,
  computeExecutablePath,
  detectBrowserPlatform,
  install,
  resolveBuildId,
} from "@puppeteer/browsers";
import puppeteer from "puppeteer-core";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const dist = join(root, "dist");
const outDir = join(root, "assets", "store", "screenshots");
const browserCacheDir = join(root, ".cache", "puppeteer");
const WIDTH = 1280;
const HEIGHT = 800;

async function resolveTestChrome() {
  const override = process.env.CHROME_PATH?.trim();
  if (override) {
    if (!existsSync(override)) {
      throw new Error(`CHROME_PATH not found: ${override}`);
    }
    return override;
  }

  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new Error("Unsupported platform for Chrome for Testing.");
  }

  const buildId = await resolveBuildId(Browser.CHROME, platform, "stable");
  let executablePath = computeExecutablePath({
    browser: Browser.CHROME,
    buildId,
    cacheDir: browserCacheDir,
    platform,
  });

  if (!existsSync(executablePath)) {
    console.log("Installing Chrome for Testing (first run)...");
    await install({
      browser: Browser.CHROME,
      buildId,
      cacheDir: browserCacheDir,
      platform,
    });
    executablePath = computeExecutablePath({
      browser: Browser.CHROME,
      buildId,
      cacheDir: browserCacheDir,
      platform,
    });
  }

  if (!existsSync(executablePath)) {
    throw new Error(
      "Chrome for Testing is required because branded Chrome builds no longer support --load-extension. Set CHROME_PATH to a Chrome for Testing or Chromium binary.",
    );
  }

  return executablePath;
}

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function lastNDays(n, date = new Date()) {
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(date);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    keys.push(todayKey(d));
  }
  return keys;
}

function buildSeedState(referenceDate = new Date()) {
  const dayKeys = lastNDays(7, referenceDate);
  const usageMinutes = [18, 24, 12, 30, 22, 15, 14];
  /** @type {Record<string, number>} */
  const usageByDate = {};
  dayKeys.forEach((key, index) => {
    usageByDate[key] = usageMinutes[index] * 60_000;
  });

  const today = todayKey(referenceDate);
  return {
    enabled: true,
    sites: [
      "youtube.com",
      "twitter.com",
      "x.com",
      "instagram.com",
      "facebook.com",
      "tiktok.com",
      "reddit.com",
    ],
    dailyLimitMinutes: 45,
    sessionLimitMinutes: 15,
    grayIntensity: 75,
    cooldownSeconds: 30,
    usageByDate,
    schemaVersion: 2,
    trial_start_ts: null,
    premium_unlocked: false,
    premium_license_key: null,
    premium_verified_at: null,
    premium_grace_until: null,
    lastUnblockAt: null,
    unblockCountByDate: { [today]: 1 },
    unblockMaxPerDayFree: 3,
    unblockMaxPerDayPremium: 10,
  };
}

function stageExtension() {
  if (!existsSync(dist)) {
    throw new Error("dist/ not found. Run `npm run build` first.");
  }
  const stage = mkdtempSync(join(tmpdir(), "anti-distraction-capture-"));
  cpSync(join(root, "manifest.json"), join(stage, "manifest.json"));
  cpSync(join(root, "icons"), join(stage, "icons"), {
    recursive: true,
    filter: (src) => !src.endsWith(".mjs"),
  });
  cpSync(join(root, "_locales"), join(stage, "_locales"), { recursive: true });
  cpSync(dist, stage, { recursive: true });
  return stage;
}

function isOurExtensionTarget(target) {
  const url = target.url();
  return (
    url.startsWith("chrome-extension://") &&
    !url.includes("ghbmnnjooekpmoecnnnilnnbdlolhkhi") &&
    !url.includes("fignfifoniblkonapihmkfakmlgkbkcf") &&
    !url.includes("nkeimhogjdpnpccoofpliimaahmaaome")
  );
}

async function getExtensionId(browser) {
  const target = await browser.waitForTarget(
    (candidate) =>
      candidate.type() === "service_worker" && isOurExtensionTarget(candidate),
    { timeout: 20_000 },
  );
  const match = /^chrome-extension:\/\/([^/]+)\//.exec(target.url());
  if (!match) throw new Error(`Unexpected extension URL: ${target.url()}`);
  return match[1];
}

async function seedStorage(page, seed) {
  await page.evaluate(async (data) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set(data);
  }, seed);
}

async function waitForLoadedText(page, selector, forbidden = ["--", "—"]) {
  await page.waitForFunction(
    (sel, blocked) => {
      const el = document.querySelector(sel);
      if (!el || !(el instanceof HTMLElement)) return false;
      const text = el.textContent?.trim() ?? "";
      if (!text) return false;
      return !blocked.some((marker) => text.includes(marker));
    },
    { timeout: 15_000 },
    selector,
    forbidden,
  );
}

async function waitForPopupReady(page) {
  await waitForLoadedText(page, "#today-usage");
  await waitForLoadedText(page, "#remaining-time");
  await waitForLoadedText(page, "#premium-status-text");
  await page.waitForFunction(() => {
    const bars = document.querySelectorAll("#recent-bars .popup__bar");
    if (bars.length !== 7) return false;
    const filled = Array.from(bars).filter(
      (bar) => !bar.classList.contains("popup__bar--empty"),
    );
    return filled.length >= 5;
  });
}

async function waitForOptionsReady(page) {
  await page.waitForFunction(() => {
    const sites = document.querySelectorAll("#sites-list .options__site");
    return sites.length >= 6;
  });
  await page.waitForFunction(() => {
    const daily = document.getElementById("daily-limit-input");
    const session = document.getElementById("session-limit-input");
    const gray = document.getElementById("gray-intensity-output");
    const used = document.getElementById("cooldown-used-today");
    const premium = document.getElementById("premium-status");
    const values = [
      daily instanceof HTMLInputElement ? daily.value : "",
      session instanceof HTMLInputElement ? session.value : "",
      gray?.textContent?.trim() ?? "",
      used?.textContent?.trim() ?? "",
      premium?.textContent?.trim() ?? "",
    ];
    return values.every((value) => value && !value.includes("--") && !value.includes("—"));
  });
}

async function assertNoForbiddenMarkers(page) {
  const markers = await page.evaluate(() => {
    const body = document.body?.innerText ?? "";
    const blocked = ["--", "—", "sk_", "ghp_", "BEGIN PRIVATE KEY"];
    return blocked.filter((marker) => body.includes(marker));
  });
  if (markers.length > 0) {
    throw new Error(`Forbidden markers visible in UI: ${markers.join(", ")}`);
  }
}

async function capturePopup(browser, extensionId, seed) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: "light" },
  ]);
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto(`chrome-extension://${extensionId}/src/popup.html`, {
    waitUntil: "networkidle0",
  });
  await seedStorage(page, seed);
  await page.reload({ waitUntil: "networkidle0" });
  await waitForPopupReady(page);
  await page.addStyleTag({
    content: `
      html, body {
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        margin: 0;
        background: #eef1f4;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .popup {
        box-shadow: 0 18px 48px rgba(16, 24, 40, 0.18);
      }
    `,
  });
  await assertNoForbiddenMarkers(page);
  const png = await page.screenshot({ type: "png" });
  await page.close();
  return png;
}

async function captureOptions(browser, extensionId, seed) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: "light" },
  ]);
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto(`chrome-extension://${extensionId}/src/options.html`, {
    waitUntil: "networkidle0",
  });
  await seedStorage(page, seed);
  await page.reload({ waitUntil: "networkidle0" });
  await waitForOptionsReady(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertNoForbiddenMarkers(page);
  const png = await page.screenshot({ type: "png" });
  await page.close();
  return png;
}

function assertPngDimensions(buffer, label) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) {
    throw new Error(`${label} is not a PNG file.`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== WIDTH || height !== HEIGHT) {
    throw new Error(`${label} must be ${WIDTH}x${HEIGHT}, got ${width}x${height}.`);
  }
}

async function main() {
  execSync("npm run build", { cwd: root, stdio: "inherit" });

  const seed = buildSeedState(new Date());
  const extensionDir = stageExtension();
  const profileDir = mkdtempSync(join(tmpdir(), "anti-distraction-profile-"));
  const chromePath = await resolveTestChrome();

  mkdirSync(outDir, { recursive: true });

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      ignoreDefaultArgs: ["--disable-extensions"],
      userDataDir: profileDir,
      args: [
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-sync",
        "--disable-background-networking",
        "--disable-default-apps",
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
      ],
    });

    const extensionId = await getExtensionId(browser);
    const popupPng = Buffer.from(await capturePopup(browser, extensionId, seed));
    const optionsPng = Buffer.from(await captureOptions(browser, extensionId, seed));

    assertPngDimensions(popupPng, "01_popup.png");
    assertPngDimensions(optionsPng, "02_options.png");

    writeFileSync(join(outDir, "01_popup.png"), popupPng);
    writeFileSync(join(outDir, "02_options.png"), optionsPng);

    console.log(`Wrote ${join(outDir, "01_popup.png")}`);
    console.log(`Wrote ${join(outDir, "02_options.png")}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    rmSync(extensionDir, { recursive: true, force: true });
    rmSync(profileDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
