import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const SEMVER = /^\d+\.\d+\.\d+$/;

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

export function readKernelVersion(protocolRulesText) {
  const match = protocolRulesText.match(/^>\s*Version:\s*(\d+\.\d+\.\d+)\s*\|/m);
  if (!match) throw new Error("PROTOCOL_RULES.md kernel Version header was not found");
  return match[1];
}

export function canonicalManifest(templateRoot) {
  const packageJson = readJson(path.join(templateRoot, "cli", "package.json"), "cli/package.json");
  const protocolRules = readFileSync(path.join(templateRoot, ".agents", "PROTOCOL_RULES.md"), "utf8");
  if (!SEMVER.test(packageJson.version)) throw new Error(`cli/package.json version is not SemVer: ${packageJson.version}`);
  return {
    manifest_version: 1,
    product_version: packageJson.version,
    kernel_version: readKernelVersion(protocolRules),
  };
}

export function validateSourceManifest(templateRoot) {
  const expected = canonicalManifest(templateRoot);
  const actual = readJson(path.join(templateRoot, ".agents", "manifest.json"), ".agents/manifest.json");
  const errors = [];
  for (const key of ["manifest_version", "product_version", "kernel_version"]) {
    if (actual[key] !== expected[key]) {
      errors.push(`source manifest ${key} mismatch: expected ${expected[key]}, found ${actual[key]}`);
    }
  }
  return { expected, actual, errors };
}

export function validateReleaseMetadata(templateRoot, expectedVersion, { requireBundle = true } = {}) {
  const errors = [];
  const cliRoot = path.join(templateRoot, "cli");
  const packageJson = readJson(path.join(cliRoot, "package.json"), "cli/package.json");
  const packageLock = readJson(path.join(cliRoot, "package-lock.json"), "cli/package-lock.json");
  const readme = readFileSync(path.join(templateRoot, "README.md"), "utf8");
  const changelog = readFileSync(path.join(templateRoot, "CHANGELOG.md"), "utf8");

  const checks = [
    ["cli/package.json version", packageJson.version],
    ["cli/package-lock.json version", packageLock.version],
    ["cli/package-lock.json root package version", packageLock.packages?.[""]?.version],
    ["README current version", readme.match(/^> Current version: \*\*(\d+\.\d+\.\d+)\*\*\r?$/m)?.[1]],
    ["CHANGELOG latest release", changelog.match(/^## \[(\d+\.\d+\.\d+)\] — \d{4}-\d{2}-\d{2}\r?$/m)?.[1]],
  ];
  for (const [label, actual] of checks) {
    if (actual !== expectedVersion) errors.push(`${label} mismatch: expected ${expectedVersion}, found ${actual ?? "missing"}`);
  }

  let source;
  try {
    source = validateSourceManifest(templateRoot);
    errors.push(...source.errors);
    if (source.actual.product_version !== expectedVersion) {
      errors.push(`source manifest product_version mismatch: expected ${expectedVersion}, found ${source.actual.product_version}`);
    }
  } catch (error) {
    errors.push(error.message);
  }

  const bundledPath = path.join(cliRoot, "dist", "templates", ".agents", "manifest.json");
  if (requireBundle && !existsSync(bundledPath)) {
    errors.push("bundled manifest is missing from cli/dist/templates/.agents/manifest.json");
  } else if (requireBundle && source) {
    const bundled = readJson(bundledPath, "bundled manifest");
    for (const key of ["manifest_version", "product_version", "kernel_version"]) {
      if (bundled[key] !== source.expected[key]) {
        errors.push(`bundled manifest ${key} mismatch: expected ${source.expected[key]}, found ${bundled[key]}`);
      }
    }
  }

  return errors;
}
