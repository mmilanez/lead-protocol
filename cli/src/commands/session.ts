import { Command } from "commander";
import { closeSession, LifecycleError, openSession } from "../lib/session-lifecycle.js";
import * as ui from "../lib/ui.js";

interface PairOptions { actor?: string; agent?: string; signature?: string; toolSignature?: string; json?: boolean }
function fail(error: unknown): never { const e = error as Error; ui.error(e.message); process.exit(error instanceof LifecycleError ? error.exitCode : 1); }

export function registerSessionCommand(program: Command): void {
  const session = program.command("session").description("Open and close verifiable Lead Protocol sessions");
  session.command("open").requiredOption("--topic <text>", "one-line session topic")
    .option("--actor <id>").option("--agent <slug>").option("--tool-signature <id>").option("--signature <text>").option("--json")
    .action((opts: PairOptions & { topic: string }) => { try { const receipt = openSession(opts); if (opts.json) console.log(JSON.stringify(receipt, null, 2)); else ui.success(`Opened ${receipt.sessionId}; receipt written for ${receipt.pair.actor}/${receipt.pair.agent}`); } catch (e) { fail(e); } });
  session.command("close").requiredOption("--journal <answer>", "significant or not-significant")
    .requiredOption("--status <status>", "stable or blocked").requiredOption("--last-action <text>").requiredOption("--pending-step <text>")
    .option("--blockers <text>", "blockers/context", "None").option("--open-threads <text>", "open threads", "None")
    .option("--confirm-checklist", "confirm all conditional close obligations were verified")
    .option("--journal-entry-confirmed", "confirm the significant JOURNAL entry exists")
    .option("--actor <id>").option("--agent <slug>").option("--tool-signature <id>").option("--signature <text>").option("--json")
    .action((opts: PairOptions & { journal: string; status: string; lastAction: string; pendingStep: string; blockers: string; openThreads: string; confirmChecklist?: boolean; journalEntryConfirmed?: boolean }) => { try { if (!(["significant", "not-significant"] as string[]).includes(opts.journal)) throw new LifecycleError("--journal must be significant or not-significant", 2); const status = opts.status.toUpperCase(); if (!(["STABLE", "BLOCKED"] as string[]).includes(status)) throw new LifecycleError("--status must be stable or blocked", 2); const receipt = closeSession({ ...opts, journal: opts.journal as "significant" | "not-significant", status: status as "STABLE" | "BLOCKED", confirmChecklist: Boolean(opts.confirmChecklist) }); if (opts.json) console.log(JSON.stringify(receipt, null, 2)); else ui.success(`Closed ${receipt.sessionId}; validation passed`); } catch (e) { fail(e); } });
}
