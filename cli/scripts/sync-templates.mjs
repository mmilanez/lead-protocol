// Bundles the Lead Protocol templates into dist/templates/ at build time.
//
// The template source of truth lives at the repo root (the parent of this
// package): .agents/, AGENTS.md and CLAUDE.md. npm cannot publish files that
// sit outside the package directory, so this script mirrors them into
// dist/templates/ (the only folder we ship). Runtime code reads from there
// via getTemplatesDir() in src/lib/project.ts.
//
// Runs from tsup's onSuccess hook, after tsup has cleaned and rebuilt dist/.

import { cpSync, rmSync, mkdirSync, existsSync, copyFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSourceManifest } from "./release-metadata.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(scriptDir, "..", "..");
const dest = path.resolve(pkgRoot, "dist", "templates");

const agentsSrc = path.join(repoRoot, ".agents");
const guidelineFiles = ["AGENTS.md", "CLAUDE.md"];
const excludedDirectoryNames = new Set(["local", "__pycache__", ".pytest_cache"]);

function fail(message) {
  console.error(`[sync-templates] ${message}`);
  process.exit(1);
}

function shouldCopyAgentPath(src) {
  const relative = path.relative(agentsSrc, src);
  if (!relative) return true;

  const segments = relative.split(path.sep);
  if (segments.some((segment) => excludedDirectoryNames.has(segment))) return false;
  return !/\.(pyc|pyo)$/i.test(segments.at(-1));
}

if (!existsSync(agentsSrc)) {
  fail(`source not found: ${agentsSrc} (expected the template .agents/ at the repo root)`);
}
for (const file of guidelineFiles) {
  if (!existsSync(path.join(repoRoot, file))) {
    fail(`source not found: ${path.join(repoRoot, file)} (expected the template guideline at the repo root)`);
  }
}

const manifestValidation = validateSourceManifest(repoRoot);
if (manifestValidation.errors.length > 0) {
  fail(`${manifestValidation.errors.join("; ")}. Run npm run sync:manifest after changing release or kernel metadata.`);
}

// Start from a clean mirror so stale files never linger between builds.
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

// Copy .agents/, skipping per-user state and generated Python caches that must
// never ship in a template or npm package.
cpSync(agentsSrc, path.join(dest, ".agents"), {
  recursive: true,
  filter: shouldCopyAgentPath,
});

// The repository's registry is live project state, not a distributable default.
// Preserve the template prose and table shape while removing every active row.
const activeSessions = path.join(dest, ".agents", "sessions", "active_sessions.md");
const registry = readFileSync(activeSessions, "utf8");
const newline = registry.includes("\r\n") ? "\r\n" : "\n";
const lines = registry.split(/\r?\n/);
const header = lines.indexOf("| Session ID | Agent | Started | Topic | Last checkpoint |");
if (header < 0 || lines[header + 1] !== "|---|---|---|---|---|") {
  fail(`malformed active-session template: ${activeSessions}`);
}
let end = header + 2;
while (end < lines.length && lines[end].startsWith("|")) end++;
writeFileSync(activeSessions, [...lines.slice(0, header + 2), ...lines.slice(end)].join(newline), "utf8");
const sessionsDir = path.dirname(activeSessions);
for (const name of readdirSync(sessionsDir)) {
  if (name !== "active_sessions.md") rmSync(path.join(sessionsDir, name), { recursive: true, force: true });
}

// Append-only project history and live coordination snapshots belong to the
// source repository. Consumers must start with empty state.
writeFileSync(path.join(dest, ".agents", "decisions.jsonl"), "", "utf8");
const checkpoints = path.join(dest, ".agents", "checkpoints");
rmSync(checkpoints, { recursive: true, force: true });
mkdirSync(checkpoints, { recursive: true });
writeFileSync(path.join(checkpoints, ".gitkeep"), "", "utf8");

for (const file of guidelineFiles) {
  copyFileSync(path.join(repoRoot, file), path.join(dest, file));
}

console.log(`[sync-templates] bundled templates into ${path.relative(pkgRoot, dest)}`);
