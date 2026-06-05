import { readFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { findAgentsDir, discoverPairs, type AgentPair } from "../lib/project.js";
import { parseHandoffMd, isPristineHandoff } from "../lib/handoff-parser.js";
import * as ui from "../lib/ui.js";

interface HandoffOptions {
  pair?: string;
  raw?: boolean;
  json?: boolean;
}

function displayHandoff(pair: AgentPair): void {
  const text = readFileSync(pair.handoffPath, "utf-8");

  if (isPristineHandoff(text)) {
    ui.info(
      `${pair.actor}/${pair.agent} — pristine template (no session recorded yet)`,
    );
    return;
  }

  try {
    const data = parseHandoffMd(text);

    console.log(ui.heading(`Handoff — ${pair.actor}/${pair.agent}`));
    console.log();
    console.log(ui.label("Status", ui.statusColor(data.status)));
    console.log(ui.label("Last Agent", data.last_agent));
    console.log(ui.label("Timestamp", data.timestamp));
    console.log(ui.label("Updated", data.updated));
    console.log(ui.label("Version", data.version));
    console.log();
    console.log(ui.label("Last Action", data.last_action));
    console.log(ui.label("Pending Step", data.pending_step));
    console.log(ui.label("Blockers", data.blockers_context));
    console.log(ui.label("Open Threads", data.open_threads));
    console.log();

    const checklist = data.session_close_checklist;
    const total = Object.keys(checklist).length;
    const checked = Object.values(checklist).filter(
      (item) => item.checked || item.na,
    ).length;
    console.log(
      ui.label("Checklist", `${checked}/${total} items resolved`),
    );
  } catch {
    ui.warn(
      `${pair.actor}/${pair.agent} — handoff does not match the expected schema, showing raw content:`,
    );
    console.log();
    console.log(text);
  }
}

export function registerHandoffCommand(program: Command): void {
  program
    .command("handoff")
    .description("Show the current handoff state for an (actor, agent) pair")
    .option("--pair <actor/agent>", "specify which pair to show")
    .option("--raw", "print raw markdown instead of formatted output")
    .option("--json", "output parsed JSON")
    .action(async (opts: HandoffOptions) => {
      console.log();

      const agentsDir = findAgentsDir();
      if (!agentsDir) {
        ui.error(
          "Could not locate .agents/ directory. Run `lead-protocol init` first.",
        );
        process.exit(1);
      }

      const pairs = discoverPairs(agentsDir);

      if (pairs.length === 0) {
        ui.info(
          "No sessions recorded yet. Handoff files are created when an agent completes its first session.",
        );
        console.log();
        return;
      }

      let selectedPair: AgentPair;

      if (opts.pair) {
        const [actor, agent] = opts.pair.split("/");
        const found = pairs.find(
          (p) => p.actor === actor && p.agent === agent,
        );
        if (!found) {
          ui.error(`Pair not found: ${opts.pair}`);
          console.log(
            ui.dim(
              `  Available: ${pairs.map((p) => `${p.actor}/${p.agent}`).join(", ")}`,
            ),
          );
          console.log();
          process.exit(1);
        }
        selectedPair = found;
      } else if (pairs.length === 1) {
        selectedPair = pairs[0];
      } else {
        const choice = await select({
          message: "Select a pair to view:",
          choices: pairs.map((p) => ({
            name: `${p.actor}/${p.agent}`,
            value: `${p.actor}/${p.agent}`,
          })),
        });
        const [actor, agent] = choice.split("/");
        selectedPair = pairs.find(
          (p) => p.actor === actor && p.agent === agent,
        )!;
      }

      if (opts.raw) {
        const text = readFileSync(selectedPair.handoffPath, "utf-8");
        console.log(text);
        return;
      }

      if (opts.json) {
        const text = readFileSync(selectedPair.handoffPath, "utf-8");
        if (isPristineHandoff(text)) {
          console.log(JSON.stringify({ pristine: true }, null, 2));
        } else {
          try {
            const data = parseHandoffMd(text);
            console.log(JSON.stringify(data, null, 2));
          } catch {
            console.log(JSON.stringify({ parseError: true, raw: text }, null, 2));
          }
        }
        return;
      }

      displayHandoff(selectedPair);
      console.log();
    });
}
