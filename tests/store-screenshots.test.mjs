import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const screenshotDir = join(root, "assets", "store", "screenshots");
const expected = [
  { name: "01_popup.png", width: 1280, height: 800 },
  { name: "02_options.png", width: 1280, height: 800 },
];

function readPng(relativePath) {
  return readFileSync(join(screenshotDir, relativePath));
}

function pngDimensions(buffer) {
  assert.ok(buffer.length >= 24, "PNG buffer too small");
  assert.equal(buffer.readUInt32BE(0), 0x89504e47, "invalid PNG signature");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

for (const { name, width, height } of expected) {
  test(`store screenshot ${name} is a ${width}x${height} PNG`, () => {
    const png = readPng(name);
    const dims = pngDimensions(png);
    assert.equal(dims.width, width, `${name} width`);
    assert.equal(dims.height, height, `${name} height`);
    assert.ok(png.length > 10_000, `${name} looks unexpectedly small`);
    assert.doesNotThrow(() => createHash("sha256").update(png).digest("hex"));
  });
}
