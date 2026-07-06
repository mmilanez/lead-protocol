import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";

// Framework layer: shipped with every release and always refreshed by
// `update`. Everything else inside the template .agents/ is a project-layer
// seed: created when missing, never overwritten (see CORE_RULES.md,
// three-layer state model).
export const FRAMEWORK_ROOT_FILES = ["CORE_RULES.md", "PROTOCOL_RULES.md"];
export const FRAMEWORK_DIRS = ["modules", "schemas", "scripts"];

export type UpdateAction = "updated" | "created" | "unchanged";
export type Layer = "framework" | "project";

export interface PlannedFile {
  relPath: string;
  layer: Layer;
  action: UpdateAction;
}

export interface UpdatePlan {
  files: PlannedFile[];
  /** Project-layer files that already exist in the target (left untouched). */
  skipped: string[];
  /**
   * Files under the framework dirs of the target that are absent from the
   * template. Could be leftovers from an older release or user extensions,
   * so they are reported but never deleted.
   */
  orphans: string[];
}

/** Recursively list files under `root` as `/`-separated relative paths. */
function walkFiles(root: string): string[] {
  const files: string[] = [];

  function walk(dir: string, prefix: string): void {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) {
        walk(full, rel);
      } else {
        files.push(rel);
      }
    }
  }

  walk(root, "");
  return files;
}

export function isFrameworkPath(relPath: string): boolean {
  const top = relPath.split("/")[0];
  return FRAMEWORK_ROOT_FILES.includes(top) || FRAMEWORK_DIRS.includes(top);
}

export function planUpdate(
  templateAgentsDir: string,
  targetAgentsDir: string,
): UpdatePlan {
  const templateFiles = walkFiles(templateAgentsDir);
  const templateSet = new Set(templateFiles);

  const files: PlannedFile[] = [];
  const skipped: string[] = [];

  for (const rel of templateFiles) {
    const layer: Layer = isFrameworkPath(rel) ? "framework" : "project";
    const targetPath = path.join(targetAgentsDir, ...rel.split("/"));

    if (!existsSync(targetPath)) {
      files.push({ relPath: rel, layer, action: "created" });
      continue;
    }

    if (layer === "project") {
      skipped.push(rel);
      continue;
    }

    const templatePath = path.join(templateAgentsDir, ...rel.split("/"));
    const same = readFileSync(templatePath).equals(readFileSync(targetPath));
    files.push({ relPath: rel, layer, action: same ? "unchanged" : "updated" });
  }

  const orphans: string[] = [];
  for (const dir of FRAMEWORK_DIRS) {
    const abs = path.join(targetAgentsDir, dir);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) continue;
    for (const rel of walkFiles(abs)) {
      const full = `${dir}/${rel}`;
      if (!templateSet.has(full)) orphans.push(full);
    }
  }

  return { files, skipped, orphans };
}

export function applyUpdate(
  templateAgentsDir: string,
  targetAgentsDir: string,
  plan: UpdatePlan,
): void {
  for (const file of plan.files) {
    if (file.action === "unchanged") continue;
    const segments = file.relPath.split("/");
    const src = path.join(templateAgentsDir, ...segments);
    const dest = path.join(targetAgentsDir, ...segments);
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    // copyFileSync does not carry the mode over, and the bundled scripts
    // ship with the executable bit set.
    chmodSync(dest, statSync(src).mode);
  }
}
