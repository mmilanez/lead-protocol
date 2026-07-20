import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalManifest } from "./release-metadata.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const templateRoot = path.resolve(scriptDir, "..", "..");
const manifestPath = path.join(templateRoot, ".agents", "manifest.json");
const manifest = canonicalManifest(templateRoot);

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`[sync-manifest] ${path.relative(templateRoot, manifestPath)} = product ${manifest.product_version}, kernel ${manifest.kernel_version}`);
