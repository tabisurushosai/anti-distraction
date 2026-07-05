import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const auditScript = fileURLToPath(
  new URL("../scripts/audit-package.mjs", import.meta.url),
);
const productId = "fixture-product-id";
const checkoutUrl = "https://fixture.gumroad.com/l/anti-distraction";
const expectedMatches = [
  "*://*.youtube.com/*",
  "*://*.twitter.com/*",
  "*://*.x.com/*",
  "*://*.instagram.com/*",
  "*://*.facebook.com/*",
  "*://*.tiktok.com/*",
];

function write(root, relative, content = "") {
  const path = join(root, relative);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function createPackage(mutate = () => {}) {
  const root = mkdtempSync(join(tmpdir(), "anti-package-audit-"));
  const stage = join(root, "stage");
  const zip = join(root, "fixture.zip");
  const omitted = new Set();
  mkdirSync(stage);

  const manifest = {
    manifest_version: 3,
    permissions: ["storage", "tabs", "alarms", "idle"],
    host_permissions: ["https://api.gumroad.com/*"],
    content_scripts: [
      {
        matches: [...expectedMatches],
        js: ["content.js"],
      },
    ],
  };
  mutate({
    manifest,
    stage,
    omit: (relative) => omitted.add(relative),
    write: (relative, content) => write(stage, relative, content),
  });

  write(stage, "manifest.json", JSON.stringify(manifest));
  write(
    stage,
    "background.js",
    `const product=${JSON.stringify(productId)};const checkout=${JSON.stringify(checkoutUrl)};`,
  );
  const requiredFixtures = [
    ["content.js", ""],
    ["src/popup.html", ""],
    ["src/options.html", ""],
    ["icons/icon16.png", ""],
    ["icons/icon48.png", ""],
    ["icons/icon128.png", ""],
    ["_locales/ja/messages.json", "{}"],
    ["_locales/en/messages.json", "{}"],
  ];
  for (const [relative, content] of requiredFixtures) {
    if (!omitted.has(relative)) write(stage, relative, content);
  }

  execFileSync("zip", ["-r", "-X", zip, "."], {
    cwd: stage,
    stdio: "ignore",
  });
  return { root, zip };
}

function audit(zip, overrides = {}) {
  return execFileSync(process.execPath, [auditScript, zip], {
    encoding: "utf8",
    env: {
      ...process.env,
      VITE_GUMROAD_PRODUCT_ID: productId,
      VITE_GUMROAD_CHECKOUT_URL: checkoutUrl,
      ...overrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function auditFailure(zip, overrides = {}) {
  try {
    audit(zip, overrides);
  } catch (error) {
    assert.equal(typeof error.stderr, "string");
    return error.stderr;
  }
  assert.fail("package audit unexpectedly passed");
}

function withPackage(mutate, callback) {
  const fixture = createPackage(mutate);
  try {
    callback(fixture.zip);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

test("package audit accepts the exact release surface", () => {
  withPackage(() => {}, (zip) => {
    assert.match(audit(zip), /Package audit OK/);
  });
});

test("package audit rejects optional permissions and host permissions", () => {
  for (const field of ["optional_permissions", "optional_host_permissions"]) {
    withPackage(({ manifest }) => {
      manifest[field] = field === "optional_permissions" ? ["history"] : ["<all_urls>"];
    }, (zip) => {
      assert.match(auditFailure(zip), new RegExp(`${field} must be empty`));
    });
  }
});

test("package audit rejects unexpected content script matches", () => {
  withPackage(({ manifest }) => {
    manifest.content_scripts[0].matches.push("<all_urls>");
  }, (zip) => {
    assert.match(auditFailure(zip), /unexpected content script matches/);
  });
});

test("package audit rejects missing required files", () => {
  withPackage(({ omit }) => {
    omit("content.js");
  }, (zip) => {
    assert.match(auditFailure(zip), /required file missing: content\.js/);
  });
});

test("package audit rejects forbidden files", () => {
  withPackage(({ write: writeFixture }) => {
    writeFixture(".env.production", "SECRET=value");
  }, (zip) => {
    assert.match(
      auditFailure(zip),
      /forbidden file included: \.env\.production/,
    );
  });
});

test("package audit rejects forbidden content markers", () => {
  withPackage(({ write: writeFixture }) => {
    writeFixture("assets/marker.js", "const marker='PLACEHOLDER';");
  }, (zip) => {
    assert.match(auditFailure(zip), /forbidden marker included: PLACEHOLDER/);
  });
});

test("package audit rejects release-value mismatches", () => {
  withPackage(() => {}, (zip) => {
    assert.match(
      auditFailure(zip, {
        VITE_GUMROAD_PRODUCT_ID: "different-product-id",
      }),
      /configured Gumroad product ID is not embedded/,
    );
    assert.match(
      auditFailure(zip, {
        VITE_GUMROAD_CHECKOUT_URL:
          "https://fixture.gumroad.com/l/different",
      }),
      /configured Gumroad checkout URL is not embedded/,
    );
  });
});
