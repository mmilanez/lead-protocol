import { existsSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { findAgentsDir, discoverPairs } from "../lib/project.js";
import {
  findSchemasDir,
  validateActiveSessions,
  validateDecisionsJsonl,
  validateHandoff,
  validateMarkdownLog,
  type ValidationResult,
} from "../lib/validator.js";
import * as ui from "../lib/ui.js";

interface ValidateOptions {
  schemasDir?: string;
}

function printResult(result: ValidationResult): void {
  const relativePath = path.relative(process.cwd(), result.file);

  if (result.skipped) {
    console.log(`  ${ui.symbols.warning} ${relativePath} — ${result.skipReason} (skipped)`);
    return;
  }

  if (result.errors.length === 0) {
    console.log(`  ${ui.symbols.success} ${relativePath}`);
    return;
  }

  console.log(`  ${ui.symbols.error} ${relativePath}`);
  for (const err of result.errors) {
    console.log(`    ${ui.dim(err)}`);
  }
}

export function registerValidateCommand(program: Command): void {
  program
    .command("validate")
    .description("Validate Lead Protocol state files against their schemas")
    .argument("[files...]", "specific files to validate (default: auto-discover)")
    .option("--schemas-dir <path>", "override schemas directory")
    .action(async (files: string[], opts: ValidateOptions) => {
      console.log();
      console.log(ui.heading("Lead Protocol — Validate"));
      console.log();

      const agentsDir = findAgentsDir();
      if (!agentsDir) {
        ui.error("Could not locate .agents/ directory. Run `lead-protocol init` first.");
        process.exit(2);
      }

      let schemasDir: string;
      try {
        schemasDir = opts.schemasDir ?? findSchemasDir(agentsDir);
      } catch (e) {
        ui.error((e as Error).message);
        process.exit(2);
      }

      const results: ValidationResult[] = [];

      if (files.length > 0) {
        for (const file of files) {
          const absPath = path.resolve(file);
          const name = path.basename(absPath);
          if (name === "decisions.jsonl") {
            results.push(validateDecisionsJsonl(absPath, schemasDir));
          } else if (name === "handoff.md") {
            results.push(validateHandoff(absPath, schemasDir));
          } else if (name === "JOURNAL.md" || name === "LESSONS.md") {
            results.push(validateMarkdownLog(absPath));
          } else if (name === "active_sessions.md") {
            results.push(validateActiveSessions(absPath));
          } else {
            results.push({
              file: absPath,
              type: "decisions",
              errors: [
                "unrecognized file (expected handoff.md, decisions.jsonl, JOURNAL.md, LESSONS.md, or active_sessions.md)",
              ],
            });
          }
        }
      } else {
        // Auto-discover
        const decisionsPath = path.join(agentsDir, "decisions.jsonl");
        if (existsSync(decisionsPath)) {
          results.push(validateDecisionsJsonl(decisionsPath, schemasDir));
        }

        for (const logName of ["JOURNAL.md", "LESSONS.md"]) {
          const logPath = path.join(agentsDir, logName);
          if (existsSync(logPath)) {
            results.push(validateMarkdownLog(logPath));
          }
        }

        const sessionsPath = path.join(agentsDir, "sessions", "active_sessions.md");
        if (existsSync(sessionsPath)) {
          results.push(validateActiveSessions(sessionsPath));
        }

        const pairs = discoverPairs(agentsDir);
        for (const pair of pairs) {
          results.push(validateHandoff(pair.handoffPath, schemasDir));
        }

        if (results.length === 0) {
          ui.info("No state files found to validate (this is normal for a fresh setup).");
          console.log();
          return;
        }
      }

      // Print results
      const passed = results.filter((r) => r.errors.length === 0 && !r.skipped);
      const failed = results.filter((r) => r.errors.length > 0);
      const skipped = results.filter((r) => r.skipped);

      for (const result of results) {
        printResult(result);
      }

      console.log();

      if (failed.length === 0) {
        const parts = [`${passed.length} passed`];
        if (skipped.length > 0) parts.push(`${skipped.length} skipped`);
        ui.success(`OK — validated ${results.length} file(s) (${parts.join(", ")})`);
      } else {
        ui.error(
          `Validation failed: ${failed.length} error(s) in ${results.length} file(s)`,
        );
      }
      console.log();

      process.exit(failed.length > 0 ? 1 : 0);
    });
}
