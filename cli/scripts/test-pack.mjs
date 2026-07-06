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

  // 5. Update flow: framework layer refreshed, project layer preserved,
  //    orphans reported but never deleted.
  const projectRules = path.join(target, ".agents", "PROJECT_RULES.md");
  const coreRules = path.join(target, ".agents", "CORE_RULES.md");
  const orphan = path.join(target, ".agents", "modules", "custom-module.md");
  const templateCoreRules = readFileSync(coreRules, "utf-8");

  writeFileSync(projectRules, "# PROJECT_RULES.md\n\nCUSTOMIZED-BY-CONSUMER\n");
  writeFileSync(coreRules, templateCoreRules + "\nLOCAL-FRAMEWORK-EDIT\n");
  writeFileSync(orphan, "# a user extension the release does not ship\n");

  run("update --dry-run", `node ${q(bin)} update --dry-run`, { cwd: target });
  if (!readFileSync(coreRules, "utf-8").includes("LOCAL-FRAMEWORK-EDIT")) {
    throw new Error("update --dry-run wrote to the framework layer");
  }
  console.log("[test-pack] OK: update --dry-run wrote nothing");

  run("update --yes", `node ${q(bin)} update --yes`, { cwd: target });
  if (!readFileSync(projectRules, "utf-8").includes("CUSTOMIZED-BY-CONSUMER")) {
    throw new Error("update overwrote a project-layer file");
  }
  if (readFileSync(coreRules, "utf-8").includes("LOCAL-FRAMEWORK-EDIT")) {
    throw new Error("update did not refresh the framework layer");
  }
  if (!existsSync(orphan)) {
    throw new Error("update deleted an orphan file");
  }
  console.log(
    "[test-pack] OK: update refreshed the framework layer, preserved the project layer and the orphan",
  );

  // 6. Init guard: with the protocol installed, plain init must refuse and
  //    leave everything untouched; init --force reinstalls from scratch.
  let initGuardTripped = false;
  try {
    execSync(`node ${q(bin)} init --yes`, { cwd: target, stdio: "pipe" });
  } catch {
    initGuardTripped = true;
  }
  if (!initGuardTripped) {
    throw new Error("init did not refuse to run on an existing install");
  }
  if (!readFileSync(projectRules, "utf-8").includes("CUSTOMIZED-BY-CONSUMER")) {
    throw new Error("init modified the project layer despite refusing");
  }
  console.log("[test-pack] OK: init refused to overwrite an existing install");

  run("init --force --yes", `node ${q(bin)} init --force --yes`, { cwd: target });
  if (readFileSync(projectRules, "utf-8").includes("CUSTOMIZED-BY-CONSUMER")) {
    throw new Error("init --force did not reinstall the project layer");
  }
  console.log("[test-pack] OK: init --force reinstalled from scratch");

  console.log("\n[test-pack] PASS: the published artifact installs and runs like production.");
} catch (err) {
  process.exitCode = 1;
  console.error(`\n[test-pack] FAIL: ${err.message}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
  console.log(`[test-pack] cleaned up ${tmp}`);
}
