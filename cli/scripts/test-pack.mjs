// Faithful "production install" smoke test for @leadsolutions/lead-protocol.
//
// `npm link` reflects your on-disk folder: it ignores the `files` allowlist and
// the dependency split, so it can pass while a real install fails. This script
// exercises the real publish path instead: it builds, packs the exact tarball
// npm would publish, installs that tarball into a throwaway consumer project
// (so `files` and the real `dependencies` are exercised), then runs
// init / validate / status against it. Everything is removed at the end.
//
// One command: `npm run test:pack`.
//
// Note: installing the tarball downloads `dependencies` from the registry, so
// this needs network access (just like a real `npm install` / `npx`).

import { execSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(scriptDir, "..");
const q = (p) => `"${p}"`;

function run(label, cmd, opts = {}) {
  console.log(`\n[test-pack] ${label}\n[test-pack] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

function runExpectFail(label, cmd, opts = {}) {
  console.log(`\n[test-pack] ${label} (expected to fail)\n[test-pack] $ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", ...opts });
  } catch {
    console.log(`[test-pack] OK: failed as expected`);
    return;
  }
  throw new Error(`${label}: command succeeded but was expected to fail`);
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "lp-testpack-"));

try {
  // 1. Fresh build (tsup + template sync via onSuccess).
  run("Building", "npm run build", { cwd: pkgRoot });

  // 2. Pack the exact publish artifact straight into the temp dir.
  console.log("\n[test-pack] Packing tarball");
  const tgzName = execSync(`npm pack --pack-destination ${q(tmp)}`, {
    cwd: pkgRoot,
    encoding: "utf-8",
  })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  const tgz = path.join(tmp, tgzName);
  console.log(`[test-pack] tarball: ${tgz}`);

  // 3. Install the tarball into a throwaway consumer (real files allowlist + deps).
  writeFileSync(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "lp-testpack-consumer", private: true }, null, 2),
  );
  run(
    "Installing tarball (downloads dependencies from the registry)",
    `npm install ${q(tgz)}`,
    { cwd: tmp },
  );

  const installed = path.join(tmp, "node_modules", "@leadsolutions", "lead-protocol");
  const bin = path.join(installed, "dist", "index.js");
  if (!existsSync(bin)) throw new Error(`installed bin not found: ${bin}`);

  // Templates must have shipped inside the installed package (the thing the
  // `files` allowlist controls and `npm link` cannot prove).
  const shipped = path.join(installed, "dist", "templates", ".agents", "CORE_RULES.md");
  if (!existsSync(shipped)) {
    throw new Error(`templates missing from installed package: ${shipped}`);
  }
  console.log("[test-pack] OK: dist/templates shipped inside the installed package");

  // 4. Run init / validate / status in a clean target dir.
  const target = path.join(tmp, "project");
  mkdirSync(target);
  run("init --yes", `node ${q(bin)} init --yes`, { cwd: target });

  for (const file of ["CLAUDE.md", "AGENTS.md"]) {
    const text = readFileSync(path.join(target, file), "utf-8");
    if (!text.includes("<lead-protocol>")) {
      throw new Error(`${file} is missing the <lead-protocol> block`);
    }
  }
  if (!existsSync(path.join(target, ".agents", "CORE_RULES.md"))) {
    throw new Error(".agents/ was not created by init");
  }
  console.log("[test-pack] OK: init created .agents/ and tagged CLAUDE.md / AGENTS.md");

  run("validate", `node ${q(bin)} validate`, { cwd: target });
  run("status", `node ${q(bin)} status`, { cwd: target });

  // 5. Structural integrity checks (§P3 append-at-tail invariants):
  // corrupt each state file the way real-world merges and bad appends do,
  // expect `validate` to fail, restore, and expect it to pass again.
  const stateFile = (...segments) => path.join(target, ".agents", ...segments);
  const corruptions = [
    {
      label: "conflict markers in decisions.jsonl",
      file: stateFile("decisions.jsonl"),
      corrupt: (text) =>
        `<<<<<<< HEAD\n${text}=======\n{"other":"side"}\n>>>>>>> feature\n`,
    },
    {
      label: "missing final newline in LESSONS.md",
      file: stateFile("LESSONS.md"),
      corrupt: (text) => text.replace(/\n+$/, ""),
    },
    {
      label: "duplicated top-level header in JOURNAL.md",
      file: stateFile("JOURNAL.md"),
      corrupt: (text) => `${text}\n# JOURNAL.md (duplicated by a bad merge)\n`,
    },
  ];
  for (const { label, file, corrupt } of corruptions) {
    const original = readFileSync(file, "utf-8");
    writeFileSync(file, corrupt(original));
    runExpectFail(`validate with ${label}`, `node ${q(bin)} validate`, { cwd: target });
    writeFileSync(file, original);
  }
  run("validate after restoring state files", `node ${q(bin)} validate`, { cwd: target });

  console.log("\n[test-pack] PASS: the published artifact installs and runs like production.");
} catch (err) {
  process.exitCode = 1;
  console.error(`\n[test-pack] FAIL: ${err.message}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
  console.log(`[test-pack] cleaned up ${tmp}`);
}
