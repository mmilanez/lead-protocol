import path from "node:path";
import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { findAgentsDir, getTemplatesDir } from "../lib/project.js";
import { planUpdate, applyUpdate, type UpdatePlan } from "../lib/updater.js";
import { ensureGitignoreEntries, generateGuidelines } from "../lib/scaffold.js";
import * as ui from "../lib/ui.js";

function printPlan(plan: UpdatePlan): void {
  const created = plan.files.filter((f) => f.action === "created");
  const updated = plan.files.filter((f) => f.action === "updated");
  const unchanged = plan.files.filter((f) => f.action === "unchanged");

  for (const file of updated) {
    console.log(`  ${ui.symbols.arrow} updated    .agents/${file.relPath}`);
  }
  for (const file of created) {
    console.log(`  ${ui.symbols.arrow} created    .agents/${file.relPath}`);
  }
  console.log(
    ui.dim(
      `  ${unchanged.length} framework file(s) unchanged, ` +
        `${plan.skipped.length} project-layer file(s) left untouched`,
    ),
  );

  if (plan.orphans.length > 0) {
    console.log();
    ui.warn(
      "Files present in this project but absent from the current release:",
    );
    for (const orphan of plan.orphans) {
      console.log(`  ${ui.symbols.bullet} .agents/${orphan}`);
    }
    console.log(
      ui.dim(
        "  These are never deleted automatically. If they are not your own\n" +
          "  extensions, remove them manually.",
      ),
    );
  }
}

export function registerUpdateCommand(program: Command, version: string): void {
  program
    .command("update")
    .description(
      "Update the Lead Protocol framework files to the version bundled with this CLI",
    )
    .option("-y, --yes", "skip confirmation prompt")
    .option("--dry-run", "show what would change without writing anything")
    .action(async (opts: { yes?: boolean; dryRun?: boolean }) => {
      const agentsDir = findAgentsDir();

      console.log();
      console.log(ui.heading("Lead Protocol — Update"));
      console.log();

      if (!agentsDir) {
        ui.error(
          "No .agents/ directory found here or in any parent directory.",
        );
        ui.info("Run `lead-protocol init` to install the protocol first.");
        console.log();
        process.exitCode = 2;
        return;
      }

      const targetDir = path.dirname(agentsDir);
      const templatesDir = getTemplatesDir();
      const templateAgentsDir = path.join(templatesDir, ".agents");

      const plan = planUpdate(templateAgentsDir, agentsDir);
      const pendingWrites = plan.files.filter((f) => f.action !== "unchanged");

      ui.info(`Target: ${agentsDir}`);
      ui.info(`Applying templates from CLI version ${version}`);
      console.log();

      if (opts.dryRun) {
        printPlan(plan);
        console.log();
        ui.info("Dry run: nothing was written.");
        console.log();
        return;
      }

      if (!opts.yes) {
        const proceed = await confirm({
          message:
            "Update the framework layer (CORE_RULES.md, PROTOCOL_RULES.md, " +
            "modules/, schemas/, scripts/)? Project-layer files are left untouched.",
          default: true,
        });
        if (!proceed) {
          ui.info("Aborted.");
          console.log();
          return;
        }
        console.log();
      }

      applyUpdate(templateAgentsDir, agentsDir, plan);
      printPlan(plan);
      console.log();

      generateGuidelines(templatesDir, targetDir);
      ensureGitignoreEntries(targetDir);

      console.log();
      if (pendingWrites.length === 0) {
        ui.success(
          `Already up to date with CLI version ${version} (guideline blocks refreshed)`,
        );
      } else {
        ui.success(`Lead Protocol updated to CLI version ${version}`);
      }
      console.log();
    });
}
