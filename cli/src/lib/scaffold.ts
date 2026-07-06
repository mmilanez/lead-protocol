import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
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
  const claudeContent = readFileSync(
    path.join(templatesDir, "CLAUDE.md"),
    "utf-8",
  );
  const agentsContent = readFileSync(
    path.join(templatesDir, "AGENTS.md"),
    "utf-8",
  );

  const claudeResult = writeGuidelines(
    path.join(targetDir, "CLAUDE.md"),
    claudeContent,
  );
  const agentsResult = writeGuidelines(
    path.join(targetDir, "AGENTS.md"),
    agentsContent,
  );

  if (claudeResult === "replaced") {
    ui.info("CLAUDE.md updated (existing <lead-protocol> block replaced)");
  } else {
    ui.success("CLAUDE.md created");
  }

  if (agentsResult === "replaced") {
    ui.info("AGENTS.md updated (existing <lead-protocol> block replaced)");
  } else {
    ui.success("AGENTS.md created");
  }
}
