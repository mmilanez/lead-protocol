import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const bin = path.resolve(testDir, "..", "dist", "index.js");

function fixture({ manifest = true } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "lp-status-"));
  const agents = path.join(root, ".agents");
  mkdirSync(path.join(agents, "sessions"), { recursive: true });
  writeFileSync(path.join(agents, "CORE_RULES.md"), "> Version: 1.5.0 | Protocol: Lead Protocol v2.0.0\n");
  writeFileSync(path.join(agents, "PROTOCOL_RULES.md"), "> Version: 2.0.1 | Updated: 2026-06-01\n");
  writeFileSync(path.join(agents, "PROJECT_RULES.md"), "# PROJECT_RULES.md — Status fixture\n\n- **Name:** Status fixture\n");
  writeFileSync(path.join(agents, "decisions.jsonl"), "");
  writeFileSync(path.join(agents, "sessions", "active_sessions.md"), "| Session ID | Agent | Started | Topic | Last checkpoint |\n|---|---|---|---|---|\n");
  if (manifest) {
    writeFileSync(path.join(agents, "manifest.json"), JSON.stringify({
      manifest_version: 1,
      product_version: "2.1.3",
      kernel_version: "2.0.1",
    }));
  }
  return root;
}

function status(root, ...args) {
  return execFileSync(process.execPath, [bin, "status", ...args], { cwd: root, encoding: "utf8" });
}

test("status reports explicit product and kernel versions in JSON and human output", () => {
  const root = fixture();
  try {
    const json = JSON.parse(status(root, "--json"));
    assert.equal(json.productVersion, "2.1.3");
    assert.equal(json.kernelVersion, "2.0.1");
    assert.equal(json.protocolVersion, "2.0.1");
    const human = status(root);
    assert.match(human, /Product Version:\s+2\.1\.3/);
    assert.match(human, /Kernel Version:\s+2\.0\.1/);
    assert.doesNotMatch(human, /Protocol Version/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("legacy scaffold without manifest reports unknown product and parses only kernel header", () => {
  const root = fixture({ manifest: false });
  try {
    const json = JSON.parse(status(root, "--json"));
    assert.equal(json.productVersion, "unknown");
    assert.equal(json.kernelVersion, "2.0.1");
    assert.equal(json.protocolVersion, "2.0.1");
    const human = status(root);
    assert.match(human, /Product Version:\s+unknown/);
    assert.match(human, /Kernel Version:\s+2\.0\.1/);
    assert.doesNotMatch(human, /Protocol Version|1\.5\.0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("invalid manifest falls back safely without consulting CORE_RULES version", () => {
  const root = fixture();
  try {
    writeFileSync(path.join(root, ".agents", "manifest.json"), "{ invalid");
    const json = JSON.parse(status(root, "--json"));
    assert.equal(json.productVersion, "unknown");
    assert.equal(json.kernelVersion, "2.0.1");
    assert.equal(json.protocolVersion, "2.0.1");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
