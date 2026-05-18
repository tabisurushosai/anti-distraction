#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = ["ja", "en"];
const SKIP_DIRS = new Set(["node_modules", "dist", "release", ".git", "_locales", "logs"]);
const SOURCE_EXT = /\.(ts|js|html|json|mjs)$/;

function readLocale(locale) {
  const p = join(ROOT, "_locales", locale, "messages.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(p, files);
    } else if (SOURCE_EXT.test(name)) {
      files.push(p);
    }
  }
  return files;
}

function collectMessageKeyUnion(src) {
  const m = src.match(/export type MessageKey =([\s\S]*?);/);
  if (!m) return new Set();
  return new Set([...m[1].matchAll(/"([a-zA-Z_0-9]+)"/g)].map((x) => x[1]));
}

function isKeyReferencedInUse(key, files) {
  for (const f of files) {
    const c = readFileSync(f, "utf8");
    if (f.endsWith("src/i18n.ts") || f.endsWith("src\\i18n.ts")) {
      const occ = (c.match(new RegExp(`"${key}"`, "g")) || []).length;
      if (occ > 1) return true;
      continue;
    }
    if (
      c.includes(`"${key}"`) ||
      c.includes(`'${key}'`) ||
      c.includes(`\`${key}\``) ||
      c.includes(`__MSG_${key}__`)
    ) {
      return true;
    }
  }
  return false;
}

const issues = [];

const locales = Object.fromEntries(LOCALES.map((l) => [l, readLocale(l)]));
const localeKeys = Object.fromEntries(
  LOCALES.map((l) => [l, new Set(Object.keys(locales[l]))]),
);

const baseLocale = LOCALES[0];
for (const l of LOCALES.slice(1)) {
  for (const k of localeKeys[baseLocale]) {
    if (!localeKeys[l].has(k)) issues.push(`[locale] "${k}" missing in ${l}/messages.json`);
  }
  for (const k of localeKeys[l]) {
    if (!localeKeys[baseLocale].has(k)) issues.push(`[locale] "${k}" missing in ${baseLocale}/messages.json`);
  }
}

const i18nSrc = readFileSync(join(ROOT, "src", "i18n.ts"), "utf8");
const messageKeyUnion = collectMessageKeyUnion(i18nSrc);
for (const k of localeKeys[baseLocale]) {
  if (!messageKeyUnion.has(k)) issues.push(`[type] "${k}" present in messages.json but missing from MessageKey union`);
}
for (const k of messageKeyUnion) {
  if (!localeKeys[baseLocale].has(k)) issues.push(`[type] "${k}" in MessageKey union but missing from messages.json`);
}

const files = walk(ROOT);
for (const k of localeKeys[baseLocale]) {
  if (!isKeyReferencedInUse(k, files)) issues.push(`[unused] "${k}" defined but never referenced`);
}

if (issues.length === 0) {
  console.log(`i18n audit OK: ${localeKeys[baseLocale].size} keys, locales [${LOCALES.join(", ")}] consistent, no unused keys.`);
  process.exit(0);
}

console.error("i18n audit FAILED:");
for (const i of issues) console.error("  -", i);
process.exit(1);
