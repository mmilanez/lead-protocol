import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { preflightPath } from "./safe-path.js";
import { writeGuidelines } from "./guideline-writer.js";
import * as ui from "./ui.js";

const GITIGNORE_PROTOCOL_ENTRIES = [
  ".agents/local/",
  "__pycache__/",
  ".pytest_cache/",
  "*.pyc",
];

export function ensureGitignoreEntries(targetDir: string): void {
  const gitignorePath = path.join(targetDir, ".gitignore");

  if (!existsSync(gitignorePath)) {
    const content = `# Lead Protocol\n${GITIGNORE_PROTOCOL_ENTRIES.join("\n")}\n`;
    writeFileSync(gitignorePath, content, "utf-8");
    return;
  }

  const existing = readFileSync(gitignorePath, "utf-8");
  const existingLines = new Set(
    existing.split("\n").map((l) => l.trim()).filter(Boolean),
  );

  const missing = GITIGNORE_PROTOCOL_ENTRIES.filter(
    (entry) => !existingLines.has(entry),
  );

  if (missing.length === 0) return;

  const suffix = existing.endsWith("\n") ? "" : "\n";
  const block = `\n# Lead Protocol\n${missing.join("\n")}\n`;
  writeFileSync(gitignorePath, existing + suffix + block, "utf-8");
}

export function generateGuidelines(
  templatesDir: string,
  targetDir: string,
): void {
  for (const name of ["CLAUDE.md", "AGENTS.md"]) {
    const dest = path.join(targetDir, name);
    const existed = existsSync(dest);
    const result = writeGuidelines(
      dest,
      readFileSync(path.join(templatesDir, name), "utf-8"),
    );

    if (result === "replaced") {
      ui.info(`${name} updated (existing <lead-protocol> block replaced)`);
    } else if (result === "relocated") {
      ui.info(`${name} updated (<lead-protocol> block moved to the top)`);
    } else if (result === "noop") {
      ui.info(`${name} unchanged`);
    } else if (existed) {
      ui.info(`${name} updated (<lead-protocol> block added at the top)`);
    } else {
      ui.success(`${name} created`);
    }
  }
}

/** Validate every scaffold destination and source before framework mutations. */
export function preflightScaffold(templatesDir: string, targetDir: string): void {
  for (const name of ["CLAUDE.md", "AGENTS.md", ".gitignore"]) {
    const dest = path.join(targetDir, name);
    preflightPath(dest, "file");
    if (existsSync(dest)) readFileSync(dest);
    if (name !== ".gitignore") {
      const source = path.join(templatesDir, name);
      preflightPath(source, "file");
      readFileSync(source);
    }
  }
}
