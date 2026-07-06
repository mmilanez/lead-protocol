import { existsSync, cpSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { getTemplatesDir } from "../lib/project.js";
import { ensureGitignoreEntries, generateGuidelines } from "../lib/scaffold.js";
import * as ui from "../lib/ui.js";

function isLeadProtocolInstalled(targetDir: string): boolean {
  return existsSync(path.join(targetDir, ".agents", "CORE_RULES.md"));
}

function copyAgentsDir(templatesDir: string, targetDir: string): void {
  const src = path.join(templatesDir, ".agents");
  const dest = path.join(targetDir, ".agents");
  cpSync(src, dest, { recursive: true });
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize Lead Protocol in the current directory")
    .option("-y, --yes", "skip confirmation prompt")
    .option(
      "--force",
      "reinstall from scratch, overwriting project-layer files (JOURNAL.md, PROJECT_RULES.md, ...)",
    )
    .action(async (opts: { yes?: boolean; force?: boolean }) => {
      const targetDir = process.cwd();
      const templatesDir = getTemplatesDir();

      console.log();
      console.log(ui.heading("Lead Protocol — Init"));
      console.log();

      if (isLeadProtocolInstalled(targetDir)) {
        if (!opts.force) {
          ui.warn("Lead Protocol is already installed in this directory.");
          ui.info(
            "Run `lead-protocol update` to refresh the framework layer " +
              "(project-layer files are left untouched).",
          );
          ui.info(
            "Run `lead-protocol init --force` to reinstall from scratch " +
              "(overwrites project-layer files).",
          );
          console.log();
          process.exitCode = 1;
          return;
        }

        ui.warn(
          "Reinstalling will overwrite the project layer with blank templates:",
        );
        console.log(
          ui.dim(
            "  PROJECT_RULES.md, AGENTS_MAP.md, JOURNAL.md, LESSONS.md,\n" +
              "  decisions.jsonl, checkpoints/, sessions/",
          ),
        );
        console.log(
          ui.dim("  Only .agents/local/ (per-pair state) is preserved."),
        );
        console.log();

        if (!opts.yes) {
          const proceed = await confirm({
            message: "Reinstall Lead Protocol and lose the files above?",
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
