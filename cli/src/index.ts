import { createRequire } from "node:module";
import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerUpdateCommand } from "./commands/update.js";
import { registerHandoffCommand } from "./commands/handoff.js";
import { registerValidateCommand } from "./commands/validate.js";
import { registerStatusCommand } from "./commands/status.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const program = new Command();

program
  .name("lead-protocol")
  .description("CLI tooling for the Lead Protocol — multi-agent coordination framework")
  .version(pkg.version, "-v, --version");

registerInitCommand(program);
registerUpdateCommand(program, pkg.version);
registerHandoffCommand(program);
registerValidateCommand(program);
registerStatusCommand(program);

program.parse();
