import { readFileSync } from "node:fs";
import { Command } from "commander";
import { createCheckpoint, LifecycleError } from "../lib/session-lifecycle.js";
import * as ui from "../lib/ui.js";

interface Options { actor?: string; agent?: string; signature?: string; toolSignature?: string; title: string; file?: string; json?: boolean }
function stdin(): string { return readFileSync(0, "utf8"); }
export function registerCheckpointCommand(program: Command): void {
  program.command("checkpoint").requiredOption("--title <slug>", "safe checkpoint title slug")
    .option("--file <path>", "read body from a file; otherwise read stdin")
    .option("--actor <id>").option("--agent <slug>").option("--tool-signature <id>").option("--signature <text>").option("--json")
    .action((opts: Options) => { try { const result = createCheckpoint({ ...opts, body: opts.file ? readFileSync(opts.file, "utf8") : stdin() }); if (opts.json) console.log(JSON.stringify(result, null, 2)); else ui.success(`Checkpoint created: ${result.checkpoint}`); } catch (error) { ui.error((error as Error).message); process.exit(error instanceof LifecycleError ? error.exitCode : 1); } });
}
