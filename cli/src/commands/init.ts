import { existsSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { getTemplatesDir } from "../lib/project.js";
import { writeGuidelines } from "../lib/guideline-writer.js";
import * as ui from "../lib/ui.js";

const GITIGNORE_PROTOCOL_ENTRIES = [
  ".agents/local/",
  "__pycache__/",
  ".pytest_cache/",
  "*.pyc",
];

function isLeadProtocolInstalled(targetDir: string): boolean {
  return existsSync(path.join(targetDir, ".agents", "CORE_RULES.md"));
}

function copyAgentsDir(templatesDir: string, targetDir: string): void {
  const src = path.join(templatesDir, ".agents");
  const dest = path.join(targetDir, ".agents");
  cpSync(src, dest, { recursive: true });
}

function ensureGitignoreEntries(targetDir: string): void {
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

function generateGuidelines(templatesDir: string, targetDir: string): void {
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

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize Lead Protocol in the current directory")
    .option("-y, --yes", "skip confirmation prompt")
    .action(async (opts: { yes?: boolean }) => {
      const targetDir = process.cwd();
      const templatesDir = getTemplatesDir();

      console.log();
      console.log(ui.heading("Lead Protocol — Init"));
      console.log();

      if (isLeadProtocolInstalled(targetDir)) {
        if (!opts.yes) {
          const proceed = await confirm({
            message:
              "Lead Protocol is already installed in this directory. Overwrite protocol files?",
            default: false,
          });
          if (!proceed) {
            ui.info("Aborted.");
            console.log();
            return;
          }
        }
      } else if (!opts.yes) {
        const proceed = await confirm({
          message: "Initialize Lead Protocol in this directory?",
          default: true,
        });
        if (!proceed) {
          ui.info("Aborted.");
          console.log();
          return;
        }
      }

      copyAgentsDir(templatesDir, targetDir);
      ui.success(".agents/ created");

      generateGuidelines(templatesDir, targetDir);

      ensureGitignoreEntries(targetDir);

      console.log();
      ui.success("Lead Protocol initialized");
      console.log();
      console.log(ui.dim("  Next steps:"));
      console.log(
        ui.dim("  1. Edit .agents/PROJECT_RULES.md — set your project identity"),
      );
      console.log(
        ui.dim("  2. Edit .agents/AGENTS_MAP.md — map your agent signatures"),
      );
      console.log(
        ui.dim("  3. Run `lead-protocol validate` to verify the setup"),
      );
      console.log();
    });
}
