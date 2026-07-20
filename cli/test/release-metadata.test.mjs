import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateReleaseMetadata } from "../scripts/release-metadata.mjs";

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "lp-release-metadata-"));
  mkdirSync(path.join(root, ".agents"), { recursive: true });
  mkdirSync(path.join(root, "cli", "dist", "templates", ".agents"), { recursive: true });
  const manifest = { manifest_version: 1, product_version: "2.1.3", kernel_version: "2.0.1" };
  writeFileSync(path.join(root, "cli", "package.json"), JSON.stringify({ version: "2.1.3" }));
  writeFileSync(path.join(root, "cli", "package-lock.json"), JSON.stringify({ version: "2.1.3", packages: { "": { version: "2.1.3" } } }));
  writeFileSync(path.join(root, "README.md"), "> Current version: **2.1.3**\n");
  writeFileSync(path.join(root, "CHANGELOG.md"), "## [2.1.3] — 2026-07-20\n");
  writeFileSync(path.join(root, ".agents", "PROTOCOL_RULES.md"), "> Version: 2.0.1 | Updated: 2026-06-01\n");
  writeFileSync(path.join(root, ".agents", "manifest.json"), JSON.stringify(manifest));
  writeFileSync(path.join(root, "cli", "dist", "templates", ".agents", "manifest.json"), JSON.stringify(manifest));
  return root;
}

test("release metadata gate accepts matching source and bundled manifests", () => {
  const root = fixture();
  try {
    assert.deepEqual(validateReleaseMetadata(root, "2.1.3"), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release metadata gate rejects source manifest product drift", () => {
  const root = fixture();
  try {
    writeFileSync(path.join(root, ".agents", "manifest.json"), JSON.stringify({
      manifest_version: 1,
      product_version: "9.9.9",
      kernel_version: "2.0.1",
    }));
    assert.ok(validateReleaseMetadata(root, "2.1.3").some((error) => error.includes("source manifest product_version mismatch")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release metadata gate rejects bundled manifest drift", () => {
  const root = fixture();
  try {
    writeFileSync(path.join(root, "cli", "dist", "templates", ".agents", "manifest.json"), JSON.stringify({
      manifest_version: 1,
      product_version: "2.1.2",
      kernel_version: "2.0.1",
    }));
    assert.ok(validateReleaseMetadata(root, "2.1.3").some((error) => error.includes("bundled manifest product_version mismatch")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
