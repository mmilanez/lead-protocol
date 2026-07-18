import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { findAgentsDir } from "./project.js";
import { parseHandoffMd } from "./handoff-parser.js";

export class LifecycleError extends Error {
  constructor(message: string, public readonly exitCode = 1) {
    super(message);
  }
}

export interface PairIdentity { actor: string; agent: string; signature: string }
export interface ActiveSession { sessionId: string; signature: string; started: string; topic: string; checkpoint: string }
export interface ReceiptFile { path: string; sha256: string }
export interface OpenReceipt {
  schemaVersion: 1;
  operation: "session.open";
  timestamp: string;
  projectRoot: string;
  pair: PairIdentity;
  sessionId: string;
  previousHandoff: ReturnType<typeof parseHandoffMd> | null;
  files: ReceiptFile[];
}

const TABLE_HEADER = "| Session ID | Agent | Started | Topic | Last checkpoint |";
const TABLE_SEPARATOR = "|---|---|---|---|---|";
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

function utcCompact(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function handoffTimestamp(date: Date): string {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function sessionId(date: Date, agent: string): string {
  return `${date.toISOString().slice(0, 10)}-${date.toISOString().slice(11, 16).replace(":", "")}-${agent}`;
}

function assertSegment(value: string, label: string): string {
  if (!SAFE_SLUG.test(value)) throw new LifecycleError(`${label} must match ${SAFE_SLUG}`, 2);
  return value;
}

export function resolvePair(opts: { actor?: string; agent?: string; signature?: string; toolSignature?: string }, agentsDir: string, now = new Date()): PairIdentity {
  let actor = opts.actor ?? process.env.LEAD_PROTOCOL_ACTOR_ID;
  const whoami = path.join(agentsDir, "local", "WHOAMI.txt");
  if (!actor && existsSync(whoami)) actor = readFileSync(whoami, "utf8").trim();
  actor ??= `${os.userInfo().username}@${os.hostname()}`.toLowerCase().replace(/[^a-z0-9@._-]/g, "-");
  let agent = opts.agent ?? process.env.LEAD_PROTOCOL_AGENT_ID;
  if (!agent && opts.toolSignature) {
    const map = readFileSync(path.join(agentsDir, "AGENTS_MAP.md"), "utf8");
    const match = map.split(/\r?\n/).map((line) => line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/))
      .find((row) => row?.[1].trim() === opts.toolSignature);
    agent = match?.[2].trim();
  }
  agent ??= `unknown-agent-${utcCompact(now).slice(0, 15).toLowerCase()}`;
  assertSegment(agent, "agent");
  if (!/^[a-z0-9@._-]+$/.test(actor)) throw new LifecycleError("actor contains unsafe path characters", 2);
  return { actor, agent, signature: opts.signature ?? `[${agent}]` };
}

function newlineOf(text: string): string { return text.includes("\r\n") ? "\r\n" : "\n"; }
function splitRow(line: string): string[] { return line.slice(1, -1).split("|").map((v) => v.trim()); }
function safeCell(value: string, label: string): string {
  if (!value.trim() || /[|\r\n]/.test(value)) throw new LifecycleError(`${label} contains unsafe markdown table characters`, 2);
  return value.trim();
}

export function parseActiveSessions(text: string): ActiveSession[] {
  const lines = text.split(/\r?\n/);
  const header = lines.indexOf(TABLE_HEADER);
  if (header < 0 || lines[header + 1] !== TABLE_SEPARATOR) throw new LifecycleError("active session registry has a malformed table header");
  const rows: ActiveSession[] = [];
  const ids = new Set<string>();
  for (let i = header + 2; i < lines.length && lines[i].startsWith("|"); i++) {
    const cells = splitRow(lines[i]);
    if (cells.length !== 5) throw new LifecycleError(`malformed active session row at line ${i + 1}`);
    if (ids.has(cells[0])) throw new LifecycleError(`duplicate active session ID: ${cells[0]}`);
    ids.add(cells[0]);
    rows.push({ sessionId: cells[0], signature: cells[1], started: cells[2], topic: cells[3], checkpoint: cells[4] });
  }
  return rows;
}

function mutateRegistry(text: string, mutate: (rows: ActiveSession[]) => ActiveSession[]): string {
  const nl = newlineOf(text);
  const lines = text.split(/\r?\n/);
  const header = lines.indexOf(TABLE_HEADER);
  const rows = parseActiveSessions(text);
  let end = header + 2;
  while (end < lines.length && lines[end].startsWith("|")) end++;
  const rendered = mutate(rows).map((r) => `| ${r.sessionId} | ${r.signature} | ${r.started} | ${r.topic} | ${r.checkpoint} |`);
  return [...lines.slice(0, header + 2), ...rendered, ...lines.slice(end)].join(nl);
}

function atomicCompareReplace(file: string, expected: string, replacement: string, token: string): void {
  if (readFileSync(file, "utf8") !== expected) throw new LifecycleError(`concurrent change detected in ${file}; no data was overwritten`);
  const temp = `${file}.${token}.tmp`;
  writeFileSync(temp, replacement, "utf8");
  try { renameSync(temp, file); } finally { if (existsSync(temp)) rmSync(temp); }
}

function setField(text: string, label: string, value: string): string {
  const pattern = new RegExp(`^(\\*\\*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\*\\*)[^\\r\\n]*`, "m");
  if (!pattern.test(text)) throw new LifecycleError(`handoff is missing field: ${label}`);
  return text.replace(pattern, `$1 ${value}`);
}

function resetChecklist(text: string): string { return text.replace(/^- \[[ xX]\]/gm, "- [ ]"); }

function freshHandoff(pair: PairIdentity, now: Date): string {
  return `# handoff.md — Current operational state\n> Version: 2.0 | Updated: ${now.toISOString().slice(0, 10)}\n\n**Last Agent:** ${pair.signature}\n**Timestamp:** ${handoffTimestamp(now)}\n**Status:** IN_PROGRESS\n**Last Action:** Opened Lead Protocol session.\n**Pending Step:** Continue the active session.\n**Blockers/Context:** None\n**Open Threads:** None\n\n**Session close checklist:**\n- [ ] activity.log contains an entry for this session\n- [ ] decisions.jsonl appended (if any decision was made)\n- [ ] local pair lessons appended (if a personal lesson emerged)\n- [ ] project LESSONS.md appended (if a project-level lesson emerged)\n- [ ] JOURNAL significance answered explicitly\n- [ ] commit convention followed (if commits were made)\n- [ ] version bumps applied (if rules changed)\n- [ ] active session row removed on close\n`;
}

function canonicalBootFiles(agentsDir: string, handoffPath: string): string[] {
  const files = [path.join(agentsDir, "CORE_RULES.md"), path.join(agentsDir, "PROJECT_RULES.md")];
  const project = readFileSync(files[1], "utf8");
  const modules = project.match(/\*\*Active modules:\*\*\s*([^\r\n]+)/)?.[1]
    .replace(/`/g, "").split(",").map((v) => v.trim()).filter(Boolean) ?? [];
  if (modules.some((module) => module.includes("[") || module.includes("]"))) throw new LifecycleError("PROJECT_RULES.md still has a pristine Active modules placeholder");
  if (modules.length === 1 && modules[0].toLowerCase() === "none") modules.length = 0;
  for (const module of modules) files.push(path.join(agentsDir, "modules", `${module}.md`));
  files.push(path.join(agentsDir, "AGENTS_MAP.md"), path.join(agentsDir, "sessions", "active_sessions.md"), handoffPath);
  for (const file of files) if (!existsSync(file)) throw new LifecycleError(`required boot file not found: ${file}`);
  return files;
}

function sha(file: string): string { return createHash("sha256").update(readFileSync(file)).digest("hex"); }
function pairPaths(agentsDir: string, pair: PairIdentity) {
  const pairDir = path.join(agentsDir, "local", pair.actor, pair.agent);
  return { pairDir, handoff: path.join(pairDir, "handoff.md"), receipts: path.join(pairDir, "receipts") };
}

function activeReceipt(receipts: string, registry: ActiveSession[]): OpenReceipt {
  if (!existsSync(receipts)) throw new LifecycleError("no receipt directory exists for this pair");
  const candidates = readdirSync(receipts).filter((f) => f.endsWith("-open.json"));
  const activeIds = new Set(registry.map((r) => r.sessionId));
  const matches = candidates.map((f) => JSON.parse(readFileSync(path.join(receipts, f), "utf8")) as OpenReceipt)
    .filter((r) => activeIds.has(r.sessionId));
  if (matches.length !== 1) throw new LifecycleError(`expected exactly one active session for this pair, found ${matches.length}`);
  return matches[0];
}

export function openSession(opts: { actor?: string; agent?: string; signature?: string; toolSignature?: string; topic: string; now?: Date }): OpenReceipt {
  const agentsDir = findAgentsDir();
  if (!agentsDir) throw new LifecycleError("could not locate .agents directory", 2);
  const now = opts.now ?? new Date();
  const pair = resolvePair(opts, agentsDir, now);
  const paths = pairPaths(agentsDir, pair);
  mkdirSync(paths.pairDir, { recursive: true });
  mkdirSync(paths.receipts, { recursive: true });
  const registryPath = path.join(agentsDir, "sessions", "active_sessions.md");
  const registryBefore = readFileSync(registryPath, "utf8");
  const rows = parseActiveSessions(registryBefore);
  if (existsSync(paths.receipts)) {
    const activeIds = new Set(rows.map((r) => r.sessionId));
    for (const file of readdirSync(paths.receipts).filter((f) => f.endsWith("-open.json"))) {
      const receipt = JSON.parse(readFileSync(path.join(paths.receipts, file), "utf8")) as OpenReceipt;
      if (activeIds.has(receipt.sessionId)) throw new LifecycleError(`pair already owns active session ${receipt.sessionId}`);
    }
  }
  const id = sessionId(now, pair.agent);
  if (rows.some((r) => r.sessionId === id)) throw new LifecycleError(`session ID already exists: ${id}`);
  const handoffBefore = existsSync(paths.handoff) ? readFileSync(paths.handoff, "utf8") : freshHandoff(pair, now);
  const previous = existsSync(paths.handoff) ? parseHandoffMd(handoffBefore) : null;
  let handoffAfter = resetChecklist(handoffBefore);
  handoffAfter = setField(handoffAfter, "Last Agent", pair.signature);
  handoffAfter = setField(handoffAfter, "Timestamp", handoffTimestamp(now));
  handoffAfter = setField(handoffAfter, "Status", "IN_PROGRESS");
  handoffAfter = setField(handoffAfter, "Last Action", `Opened session ${id}.`);
  handoffAfter = handoffAfter.replace(/^> Version: (\S+) \| Updated: \S+$/m, `> Version: $1 | Updated: ${now.toISOString().slice(0, 10)}`);
  if (existsSync(paths.handoff)) atomicCompareReplace(paths.handoff, handoffBefore, handoffAfter, id);
  else writeFileSync(paths.handoff, handoffAfter, { encoding: "utf8", flag: "wx" });
  const registryAfter = mutateRegistry(registryBefore, (current) => [...current, {
    sessionId: id, signature: safeCell(pair.signature, "signature"), started: now.toISOString(),
    topic: safeCell(opts.topic, "topic"), checkpoint: "—",
  }]);
  try { atomicCompareReplace(registryPath, registryBefore, registryAfter, id); }
  catch (error) {
    if (readFileSync(paths.handoff, "utf8") === handoffAfter) atomicCompareReplace(paths.handoff, handoffAfter, handoffBefore, `${id}.rollback`);
    throw error;
  }
  const files = canonicalBootFiles(agentsDir, paths.handoff).map((file) => ({ path: path.relative(path.dirname(agentsDir), file).replace(/\\/g, "/"), sha256: sha(file) }));
  const receipt: OpenReceipt = { schemaVersion: 1, operation: "session.open", timestamp: now.toISOString(), projectRoot: path.dirname(agentsDir), pair, sessionId: id, previousHandoff: previous, files };
  writeFileSync(path.join(paths.receipts, `${id}-open.json`), `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return receipt;
}

export function createCheckpoint(opts: { actor?: string; agent?: string; signature?: string; toolSignature?: string; title: string; body: string; now?: Date }) {
  const agentsDir = findAgentsDir(); if (!agentsDir) throw new LifecycleError("could not locate .agents directory", 2);
  const now = opts.now ?? new Date(); const pair = resolvePair(opts, agentsDir, now); const paths = pairPaths(agentsDir, pair);
  const registryPath = path.join(agentsDir, "sessions", "active_sessions.md"); const before = readFileSync(registryPath, "utf8");
  const receipt = activeReceipt(paths.receipts, parseActiveSessions(before));
  const slug = assertSegment(opts.title, "title"); const name = `${utcCompact(now)}_${pair.agent}_${slug}.md`;
  const target = path.resolve(agentsDir, "checkpoints", name); const root = path.resolve(agentsDir, "checkpoints") + path.sep;
  if (!target.startsWith(root)) throw new LifecycleError("unsafe checkpoint path", 2);
  const content = `# Checkpoint — ${slug}\n\n> Timestamp: ${now.toISOString()}\n> Agent: ${receipt.pair.signature}\n> Actor: ${pair.actor}\n> Session: \`${receipt.sessionId}\`\n\n${opts.body.replace(/^\s+|\s+$/g, "")}\n`;
  writeFileSync(target, content, { encoding: "utf8", flag: "wx" });
  const after = mutateRegistry(before, (rows) => rows.map((r) => r.sessionId === receipt.sessionId ? { ...r, checkpoint: name } : r));
  atomicCompareReplace(registryPath, before, after, receipt.sessionId);
  return { checkpoint: target, sessionId: receipt.sessionId, timestamp: now.toISOString() };
}

export type LifecycleFaultPoint = "before-close-handoff-write";
export function closeSession(opts: { actor?: string; agent?: string; signature?: string; toolSignature?: string; journal: "significant" | "not-significant"; journalEntryConfirmed?: boolean; status: "STABLE" | "BLOCKED"; lastAction: string; pendingStep: string; blockers?: string; openThreads?: string; confirmChecklist: boolean; now?: Date; faultInjector?: (point: LifecycleFaultPoint) => void }) {
  const agentsDir = findAgentsDir(); if (!agentsDir) throw new LifecycleError("could not locate .agents directory", 2);
  const now = opts.now ?? new Date(); const pair = resolvePair(opts, agentsDir, now); const paths = pairPaths(agentsDir, pair);
  if (!opts.confirmChecklist) throw new LifecycleError("close requires --confirm-checklist after verifying all conditional close obligations");
  if (opts.journal === "significant" && !opts.journalEntryConfirmed) throw new LifecycleError("significant close requires --journal-entry-confirmed");
  const handoffBefore = readFileSync(paths.handoff, "utf8"); parseHandoffMd(handoffBefore);
  const decisions = path.join(agentsDir, "decisions.jsonl"); if (!existsSync(decisions)) throw new LifecycleError("decisions.jsonl not found");
  for (const [i, line] of readFileSync(decisions, "utf8").split(/\r?\n/).entries()) if (line.trim()) try { JSON.parse(line); } catch { throw new LifecycleError(`decisions.jsonl line ${i + 1} is invalid JSON`); }
  const registryPath = path.join(agentsDir, "sessions", "active_sessions.md"); const before = readFileSync(registryPath, "utf8");
  const receipt = activeReceipt(paths.receipts, parseActiveSessions(before));
  const after = mutateRegistry(before, (rows) => rows.filter((r) => r.sessionId !== receipt.sessionId));
  atomicCompareReplace(registryPath, before, after, receipt.sessionId);
  const receiptPair = { ...pair, signature: receipt.pair.signature };
  let handoffAfter = setField(handoffBefore, "Last Agent", receiptPair.signature);
  handoffAfter = setField(handoffAfter, "Timestamp", handoffTimestamp(now));
  handoffAfter = setField(handoffAfter, "Status", opts.status);
  handoffAfter = setField(handoffAfter, "Last Action", safeCell(opts.lastAction, "last action"));
  handoffAfter = setField(handoffAfter, "Pending Step", safeCell(opts.pendingStep, "pending step"));
  handoffAfter = setField(handoffAfter, "Blockers/Context", safeCell(opts.blockers ?? "None", "blockers"));
  handoffAfter = setField(handoffAfter, "Open Threads", safeCell(opts.openThreads ?? "None", "open threads"));
  handoffAfter = handoffAfter.replace(/^> Version: (\S+) \| Updated: \S+$/m, `> Version: $1 | Updated: ${now.toISOString().slice(0, 10)}`);
  handoffAfter = handoffAfter.replace(/^- \[[ xX]\]/gm, "- [x]");
  try { opts.faultInjector?.("before-close-handoff-write"); atomicCompareReplace(paths.handoff, handoffBefore, handoffAfter, receipt.sessionId); }
  catch (error) {
    if (readFileSync(registryPath, "utf8") === after) atomicCompareReplace(registryPath, after, before, `${receipt.sessionId}.rollback`);
    throw error;
  }
  const closeReceipt = { schemaVersion: 1, operation: "session.close", timestamp: now.toISOString(), pair: receiptPair, sessionId: receipt.sessionId, journal: opts.journal, validation: { handoff: "passed", decisions: "passed", checklist: "passed" } };
  try { writeFileSync(path.join(paths.receipts, `${receipt.sessionId}-close.json`), `${JSON.stringify(closeReceipt, null, 2)}\n`, { encoding: "utf8", flag: "wx" }); }
  catch (error) { throw new LifecycleError(`session state closed but close receipt failed: ${(error as Error).message}`); }
  return closeReceipt;
}
