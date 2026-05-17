#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const dist = join(root, 'dist');
const releaseDir = join(root, 'release');
const zipName = 'anti-distraction.zip';
const zipPath = join(releaseDir, zipName);

if (!existsSync(dist)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

mkdirSync(releaseDir, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);

const stage = mkdtempSync(join(tmpdir(), 'anti-distraction-'));
try {
  cpSync(join(root, 'manifest.json'), join(stage, 'manifest.json'));
  cpSync(join(root, 'icons'), join(stage, 'icons'), {
    recursive: true,
    filter: (src) => !src.endsWith('.mjs'),
  });
  cpSync(join(root, '_locales'), join(stage, '_locales'), { recursive: true });
  cpSync(dist, stage, { recursive: true });

  execSync(`zip -r -X "${zipPath}" .`, { cwd: stage, stdio: 'inherit' });
  console.log(`\nCreated ${zipPath}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
