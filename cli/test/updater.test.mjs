// Unit tests for the update planner/applier. Run via `npm test`, which
// builds first: the suite imports the built dist/lib/updater.js so it
// exercises exactly the code that ships.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  planUpdate,
  applyUpdate,
  isFrameworkPath,
} from "../dist/lib/updater.js";

function makeTempDirs(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "lp-updater-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const template = path.join(root, "template");
  const target = path.join(root, "target");
  mkdirSync(template);
  mkdirSync(target);
  return { template, target };
}

function write(dir, relPath, content) {
  const full = path.join(dir, ...relPath.split("/"));
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

function read(dir, relPath) {
  return readFileSync(path.join(dir, ...relPath.split("/")), "utf-8");
}

function planFor(plan, relPath) {
  return plan.files.find((f) => f.relPath === relPath);
}

test("isFrameworkPath classifies layers by top-level segment", () => {
  assert.equal(isFrameworkPath("CORE_RULES.md"), true);
  assert.equal(isFrameworkPath("PROTOCOL_RULES.md"), true);
  assert.equal(isFrameworkPath("modules/git-substrate.md"), true);
  assert.equal(isFrameworkPath("schemas/handoff.schema.json"), true);
  assert.equal(isFrameworkPath("scripts/validate_state.py"), true);
  assert.equal(isFrameworkPath("PROJECT_RULES.md"), false);
  assert.equal(isFrameworkPath("JOURNAL.md"), false);
  assert.equal(isFrameworkPath("decisions.jsonl"), false);
  assert.equal(isFrameworkPath("sessions/active_sessions.md"), false);
});

test("changed framework file is marked updated and overwritten", (t) => {
  const { template, target } = makeTempDirs(t);
  write(template, "CORE_RULES.md", "new rules\n");
  write(target, "CORE_RULES.md", "old rules with local edits\n");

  const plan = planUpdate(template, target);
  assert.deepEqual(planFor(plan, "CORE_RULES.md"), {
    relPath: "CORE_RULES.md",
    layer: "framework",
    action: "updated",
  });

  applyUpdate(template, target, plan);
  assert.equal(read(target, "CORE_RULES.md"), "new rules\n");
});

test("identical framework file is marked unchanged", (t) => {
  const { template, target } = makeTempDirs(t);
  write(template, "modules/git-substrate.md", "same\n");
  write(target, "modules/git-substrate.md", "same\n");

  const plan = planUpdate(template, target);
  assert.equal(planFor(plan, "modules/git-substrate.md").action, "unchanged");
});

test("framework file missing from target is created", (t) => {
  const { template, target } = makeTempDirs(t);
  write(template, "modules/new-module.md", "brand new\n");

  const plan = planUpdate(template, target);
  assert.equal(planFor(plan, "modules/new-module.md").action, "created");

  applyUpdate(template, target, plan);
  assert.equal(read(target, "modules/new-module.md"), "brand new\n");
});

test("existing project-layer file is skipped and never touched", (t) => {
  const { template, target } = makeTempDirs(t);
  write(template, "PROJECT_RULES.md", "[Project Name] blank template\n");
  write(target, "PROJECT_RULES.md", "My real project identity\n");

  const plan = planUpdate(template, target);
  assert.equal(planFor(plan, "PROJECT_RULES.md"), undefined);
  assert.deepEqual(plan.skipped, ["PROJECT_RULES.md"]);

  applyUpdate(template, target, plan);
  assert.equal(read(target, "PROJECT_RULES.md"), "My real project identity\n");
});

test("missing project-layer seed is created", (t) => {
  const { template, target } = makeTempDirs(t);
  write(template, "sessions/active_sessions.md", "seed\n");

  const plan = planUpdate(template, target);
  assert.deepEqual(planFor(plan, "sessions/active_sessions.md"), {
    relPath: "sessions/active_sessions.md",
    layer: "project",
    action: "created",
  });

  applyUpdate(template, target, plan);
  assert.equal(read(target, "sessions/active_sessions.md"), "seed\n");
});

test("orphans in framework dirs are reported but not deleted", (t) => {
  const { template, target } = makeTempDirs(t);
  write(template, "modules/git-substrate.md", "shipped\n");
  write(target, "modules/git-substrate.md", "shipped\n");
  write(target, "modules/custom-module.md", "user extension\n");
  write(target, "scripts/old_tool.py", "retired in this release\n");

  const plan = planUpdate(template, target);
  assert.deepEqual(plan.orphans.sort(), [
    "modules/custom-module.md",
    "scripts/old_tool.py",
  ]);

  applyUpdate(template, target, plan);
  assert.equal(existsSync(path.join(target, "modules", "custom-module.md")), true);
  assert.equal(existsSync(path.join(target, "scripts", "old_tool.py")), true);
});

test("extra project-layer files in target are not reported as orphans", (t) => {
  const { template, target } = makeTempDirs(t);
  write(template, "CORE_RULES.md", "rules\n");
  write(target, "CORE_RULES.md", "rules\n");
  write(target, "checkpoints/2026-01-01T000000_claude_snapshot.md", "x\n");
  write(target, "local/leo@pc/claude/handoff.md", "state\n");

  const plan = planUpdate(template, target);
  assert.deepEqual(plan.orphans, []);
});
