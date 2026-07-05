#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const zipPath = resolve(
  process.argv[2] ?? "release/anti-distraction.zip",
);
const productId = process.env.VITE_GUMROAD_PRODUCT_ID?.trim() ?? "";
const checkoutUrl = process.env.VITE_GUMROAD_CHECKOUT_URL?.trim() ?? "";
const errors = [];

function fail(message) {
  errors.push(message);
}

function readEntry(entry) {
  return execFileSync("unzip", ["-p", zipPath, entry], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

if (!existsSync(zipPath)) {
  console.error(`ERROR: package not found: ${zipPath}`);
  process.exit(1);
}

let entries;
try {
  entries = execFileSync("unzip", ["-Z1", zipPath], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
} catch {
  console.error(`ERROR: cannot read package: ${zipPath}`);
  process.exit(1);
}

const files = entries.filter((entry) => !entry.endsWith("/"));
const required = [
  "manifest.json",
  "background.js",
  "content.js",
  "src/popup.html",
  "src/options.html",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "_locales/ja/messages.json",
  "_locales/en/messages.json",
];

for (const entry of required) {
  if (!files.includes(entry)) fail(`required file missing: ${entry}`);
}

const forbiddenPaths = [
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)\.git(?:\/|$)/,
  /(^|\/)node_modules\//,
  /(^|\/)(scripts?|tests?)\//,
  /(^|\/)package(?:-lock)?\.json$/,
  /(^|\/)(?:tsconfig|vite\.config)\./,
  /\.map$/,
];

for (const entry of files) {
  if (forbiddenPaths.some((pattern) => pattern.test(entry))) {
    fail(`forbidden file included: ${entry}`);
  }
}

let manifest;
try {
  manifest = JSON.parse(readEntry("manifest.json"));
} catch {
  fail("manifest.json is missing or invalid JSON");
}

if (manifest) {
  if (manifest.manifest_version !== 3) {
    fail("manifest_version must be 3");
  }
  const permissions = [...(manifest.permissions ?? [])].sort();
  const expectedPermissions = ["alarms", "idle", "storage", "tabs"].sort();
  if (JSON.stringify(permissions) !== JSON.stringify(expectedPermissions)) {
    fail(`unexpected permissions: ${permissions.join(",")}`);
  }
  const hostPermissions = manifest.host_permissions ?? [];
  if (
    hostPermissions.length !== 1 ||
    hostPermissions[0] !== "https://api.gumroad.com/*"
  ) {
    fail(`unexpected host_permissions: ${hostPermissions.join(",")}`);
  }
}

const textExtensions = /\.(?:css|html|js|json|txt|md)$/;
const text = files
  .filter((entry) => textExtensions.test(entry))
  .map((entry) => readEntry(entry))
  .join("\n");

const forbiddenMarkers = [
  "REPLACE_WITH_",
  "PLACEHOLDER",
  "test-product",
  "https://example.com/buy",
  "BEGIN PRIVATE KEY",
  "sk_live_",
  "ghp_",
];

for (const marker of forbiddenMarkers) {
  if (text.includes(marker)) fail(`forbidden marker included: ${marker}`);
}

if (!productId || !text.includes(productId)) {
  fail("configured Gumroad product ID is not embedded in the package");
}
if (!checkoutUrl || !text.includes(checkoutUrl)) {
  fail("configured Gumroad checkout URL is not embedded in the package");
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log(
  `Package audit OK: ${files.length} files, required files and release values verified.`,
);
