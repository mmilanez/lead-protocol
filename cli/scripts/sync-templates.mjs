// Bundles the Lead Protocol templates into dist/templates/ at build time.
//
// The template source of truth lives at the repo root (the parent of this
// package): .agents/, AGENTS.md and CLAUDE.md. npm cannot publish files that
// sit outside the package directory, so this script mirrors them into
// dist/templates/ (the only folder we ship). Runtime code reads from there
// via getTemplatesDir() in src/lib/project.ts.
//
// Runs from tsup's onSuccess hook, after tsup has cleaned and rebuilt dist/.

import { cpSync, rmSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(scriptDir, "..", "..");
const dest = path.resolve(pkgRoot, "dist", "templates");

const agentsSrc = path.join(repoRoot, ".agents");
const guidelineFiles = ["AGENTS.md", "CLAUDE.md"];

function fail(message) {
  console.error(`[sync-templates] ${message}`);
  process.exit(1);
}

if (!existsSync(agentsSrc)) {
  fail(`source not found: ${agentsSrc} (expected the template .agents/ at the repo root)`);
}
for (const file of guidelineFiles) {
  if (!existsSync(path.join(repoRoot, file))) {
    fail(`source not found: ${path.join(repoRoot, file)} (expected the template guideline at the repo root)`);
  }
}

// Start from a clean mirror so stale files never linger between builds.
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

// Copy .agents/, skipping any per-user state (local/) that must never ship in a template.
cpSync(agentsSrc, path.join(dest, ".agents"), {
  recursive: true,
  filter: (src) => path.relative(agentsSrc, src).split(path.sep)[0] !== "local",
});

for (const file of guidelineFiles) {
  copyFileSync(path.join(repoRoot, file), path.join(dest, file));
}

console.log(`[sync-templates] bundled templates into ${path.relative(pkgRoot, dest)}`);
