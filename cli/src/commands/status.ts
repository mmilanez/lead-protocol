import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import {
  findAgentsDir,
  discoverPairs,
  readProjectName,
} from "../lib/project.js";
import { parseHandoffMd, isPristineHandoff } from "../lib/handoff-parser.js";
import * as ui from "../lib/ui.js";

interface StatusOptions {
  json?: boolean;
}

interface DecisionEntry {
  timestamp: string;
  agent: string;
  decision: string;
  status: string;
}

function readLastDecisions(
  agentsDir: string,
  count: number,
): DecisionEntry[] {
  const filePath = path.join(agentsDir, "decisions.jsonl");
  if (!existsSync(filePath)) return [];

  const text = readFileSync(filePath, "utf-8");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const entries: DecisionEntry[] = [];
  for (const line of lines.slice(-count)) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }

  return entries;
}

function countActiveSessions(agentsDir: string): number {
  const filePath = path.join(agentsDir, "sessions", "active_sessions.md");
  if (!existsSync(filePath)) return 0;

  const text = readFileSync(filePath, "utf-8");
  // Count table rows (lines starting with |, excluding header and separator)
  const rows = text
    .split("\n")
    .filter((l) => l.startsWith("|"))
    .filter((l) => !l.includes("---"))
    .filter((l) => !l.toLowerCase().includes("agent"));

  return rows.length;
}

function readProtocolVersion(agentsDir: string): string | null {
  const corePath = path.join(agentsDir, "CORE_RULES.md");
  if (!existsSync(corePath)) return null;

  const text = readFileSync(corePath, "utf-8");
  const match = text.match(/Version:\s*(\S+)/);
  return match?.[1] ?? null;
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show a one-screen summary of the current Lead Protocol state")
    .option("--json", "output as JSON")
    .action(async (opts: StatusOptions) => {
      const agentsDir = findAgentsDir();
      if (!agentsDir) {
        ui.error(
          "Could not locate .agents/ directory. Run `lead-protocol init` first.",
        );
        process.exit(1);
      }

      const projectName = readProjectName(agentsDir) ?? "Unknown Project";
      const pairs = discoverPairs(agentsDir);
      const decisions = readLastDecisions(agentsDir, 3);
      const activeSessions = countActiveSessions(agentsDir);
      const protocolVersion = readProtocolVersion(agentsDir) ?? "unknown";

      if (opts.json) {
        const data = {
          project: projectName,
          protocolVersion,
          activeSessions,
          pairs: pairs.map((p) => {
            const text = readFileSync(p.handoffPath, "utf-8");
            if (isPristineHandoff(text)) {
              return { actor: p.actor, agent: p.agent, pristine: true };
            }
            try {
              const handoff = parseHandoffMd(text);
              return { actor: p.actor, agent: p.agent, ...handoff };
            } catch {
              return { actor: p.actor, agent: p.agent, parseError: true };
            }
          }),
          recentDecisions: decisions,
        };
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      console.log();
      console.log(
        ui.heading(`Lead Protocol Status — ${projectName}`),
      );
      console.log();

      // Handoffs
      if (pairs.length === 0) {
        console.log(
          ui.dim(
            "  No sessions recorded yet. Handoff files appear after the first agent session.",
          ),
        );
      } else {
        for (const pair of pairs) {
          const text = readFileSync(pair.handoffPath, "utf-8");
          if (isPristineHandoff(text)) {
            console.log(
              `  ${ui.symbols.bullet} ${pair.actor}/${pair.agent} — ${ui.dim("pristine (no session yet)")}`,
            );
            continue;
          }

          try {
            const data = parseHandoffMd(text);
            console.log(
              ui.heading(`  Handoff (${pair.actor}/${pair.agent})`),
            );
            console.log(
              ui.label("    Status", ui.statusColor(data.status)),
            );
            console.log(ui.label("    Last Action", data.last_action));
            console.log(
              ui.label("    Pending Step", data.pending_step),
            );
            console.log(ui.label("    Updated", data.timestamp));
          } catch {
            console.log(
              `  ${ui.symbols.warning} ${pair.actor}/${pair.agent} — could not parse handoff`,
            );
          }
        }
      }

      console.log();

      // Recent decisions
      if (decisions.length > 0) {
        console.log(ui.heading("  Recent Decisions"));
        for (const d of decisions) {
          const date = d.timestamp.split("T")[0];
          console.log(
            `    ${ui.dim(date)}  ${d.decision}`,
          );
        }
      } else {
        console.log(
          ui.dim("  No decisions recorded yet."),
        );
      }

      console.log();
      console.log(ui.label("  Active Sessions", String(activeSessions)));
      console.log(
        ui.label("  Protocol Version", protocolVersion),
      );
      console.log();
    });
}
