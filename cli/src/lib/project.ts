import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function findAgentsDir(startDir?: string): string | null {
  let dir = startDir ?? process.cwd();

  while (true) {
    const candidate = path.join(dir, ".agents");
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

export function getTemplatesDir(): string {
  // Templates are bundled into dist/templates/ at build time
  // (see scripts/sync-templates.mjs). __dirname is dist/ in the bundle.
  return path.resolve(__dirname, "templates");
}

export interface AgentPair {
  actor: string;
  agent: string;
  handoffPath: string;
}

export function discoverPairs(agentsDir: string): AgentPair[] {
  const localDir = path.join(agentsDir, "local");
  if (!existsSync(localDir) || !statSync(localDir).isDirectory()) {
    return [];
  }

  const pairs: AgentPair[] = [];

  for (const actorName of readdirSync(localDir).sort()) {
    const actorPath = path.join(localDir, actorName);
    if (!statSync(actorPath).isDirectory()) continue;

    for (const agentName of readdirSync(actorPath).sort()) {
      const agentPath = path.join(actorPath, agentName);
      if (!statSync(agentPath).isDirectory()) continue;

      const handoffPath = path.join(agentPath, "handoff.md");
      if (existsSync(handoffPath)) {
        pairs.push({
          actor: actorName,
          agent: agentName,
          handoffPath,
        });
      }
    }
  }

  return pairs;
}

export function readProjectName(agentsDir: string): string | null {
  const projectRulesPath = path.join(agentsDir, "PROJECT_RULES.md");
  if (!existsSync(projectRulesPath)) return null;

  const content = readFileSync(projectRulesPath, "utf-8");
  const match = content.match(/\*\*Name:\*\*\s*(.+)/);
  if (match && !match[1].includes("[")) {
    return match[1].trim();
  }
  return null;
}
