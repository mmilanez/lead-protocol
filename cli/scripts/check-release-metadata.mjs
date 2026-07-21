import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateReleaseMetadata } from "./release-metadata.mjs";

const expectedVersion = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(expectedVersion ?? "")) {
  console.error("usage: node scripts/check-release-metadata.mjs X.Y.Z");
  process.exit(2);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const templateRoot = path.resolve(scriptDir, "..", "..");
const sourceOnly = process.argv.includes("--source-only");
const errors = validateReleaseMetadata(templateRoot, expectedVersion, { requireBundle: !sourceOnly });
if (errors.length > 0) {
  for (const error of errors) console.error(`[release-metadata] ${error}`);
  process.exit(1);
}
const surfaces = sourceOnly
  ? "package, lockfile, README, CHANGELOG, kernel, and source manifest"
  : "package, lockfile, README, CHANGELOG, kernel, source manifest, and bundle";
console.log(`[release-metadata] ${surfaces} agree on ${expectedVersion}`);
