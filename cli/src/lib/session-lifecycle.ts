import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
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
  if (actor === "." || actor === ".." || !/^[a-z0-9@._-]+$/.test(actor)) throw new LifecycleError("actor contains unsafe path characters", 2);
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
  const originalLines = new Map(rows.map((row, index) => [row.sessionId, {
    row,
    line: lines[header + 2 + index],
  }]));
  const rendered = mutate(rows).map((r) => {
    const original = originalLines.get(r.sessionId);
    if (original && Object.keys(r).every((key) => r[key as keyof ActiveSession] === original.row[key as keyof ActiveSession])) {
      return original.line;
    }
    return `| ${r.sessionId} | ${r.signature} | ${r.started} | ${r.topic} | ${r.checkpoint} |`;
  });
  return [...lines.slice(0, header + 2), ...rendered, ...lines.slice(end)].join(nl);
}

function atomicCompareReplace(file: string, expected: string, replacement: string, token: string): void {
  if (readFileSync(file, "utf8") !== expected) throw new LifecycleError(`concurrent change detected in ${file}; no data was overwritten`);
  const temp = `${file}.${token}.${process.pid}.${Date.now()}.tmp`;
  writeExclusiveFile(temp, replacement);
  try {
    if (readFileSync(file, "utf8") !== expected) throw new LifecycleError(`concurrent change detected in ${file}; no data was overwritten`);
    renameSync(temp, file);
  }
  finally { if (existsSync(temp)) rmSync(temp); }
}

function writeExclusiveFile(file: string, content: string): void {
  const temp = `${file}.${process.pid}.${Date.now()}.partial`;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temp, "wx");
    writeFileSync(descriptor, content, "utf8");
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temp, file);
  }
  catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* preserve the write error */ }
      descriptor = undefined;
    }
    try { if (existsSync(temp)) rmSync(temp); } catch { /* preserve the write error */ }
    throw error;
  }
  finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } finally { if (existsSync(temp)) rmSync(temp); }
    }
    if (existsSync(temp)) rmSync(temp);
  }
}

function withLifecycleGuard<T>(agentsDir: string, operation: () => T): T {
  const guard = path.join(agentsDir, "sessions", ".lifecycle-transaction");
  try { mkdirSync(guard); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new LifecycleError("another local lifecycle mutation is in progress; retry the command");
    throw error;
  }
  try { return operation(); }
  finally { rmSync(guard, { recursive: true, force: true }); }
}

function runCompensations(actions: Array<() => void>): string[] {
  const errors: string[] = [];
  for (const action of actions) {
    try { action(); }
    catch (error) { errors.push((error as Error).message); }
  }
  return errors;
}

function rethrowWithCompensation(error: unknown, compensationErrors: string[]): never {
  if (compensationErrors.length === 0) throw error;
  const original = error instanceof Error ? error.message : String(error);
  throw new LifecycleError(`${original}; rollback also failed: ${compensationErrors.join("; ")}`);
}

function compensateRegistry(file: string, token: string, mutate: (rows: ActiveSession[]) => ActiveSession[]): void {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const before = readFileSync(file, "utf8");
    const after = mutateRegistry(before, mutate);
    if (after === before) return;
    try { atomicCompareReplace(file, before, after, `${token}.${attempt}`); return; }
    catch (error) {
      lastError = error;
      if (!(error instanceof LifecycleError) || !error.message.startsWith("concurrent change detected")) throw error;
    }
  }
  throw lastError;
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

function canonicalBootFiles(agentsDir: string, handoffPath: string, requireHandoff = true): string[] {
  const files = [path.join(agentsDir, "CORE_RULES.md"), path.join(agentsDir, "PROJECT_RULES.md")];
  const project = readFileSync(files[1], "utf8");
  const modules = project.match(/\*\*Active modules:\*\*\s*([^\r\n]+)/)?.[1]
    .replace(/`/g, "").split(",").map((v) => v.trim()).filter(Boolean) ?? [];
  if (modules.some((module) => module.includes("[") || module.includes("]"))) throw new LifecycleError("PROJECT_RULES.md still has a pristine Active modules placeholder");
  if (modules.length === 1 && modules[0].toLowerCase() === "none") modules.length = 0;
  for (const module of modules) files.push(path.join(agentsDir, "modules", `${module}.md`));
  files.push(path.join(agentsDir, "AGENTS_MAP.md"), path.join(agentsDir, "sessions", "active_sessions.md"), handoffPath);
  for (const file of files) {
    if (file === handoffPath && !requireHandoff) continue;
    if (!existsSync(file)) throw new LifecycleError(`required boot file not found: ${file}`);
  }
  return files;
}

function sha(file: string): string { return createHash("sha256").update(readFileSync(file)).digest("hex"); }
function pairPaths(agentsDir: string, pair: PairIdentity) {
  const localRoot = path.resolve(agentsDir, "local");
  const actorDir = path.resolve(localRoot, pair.actor);
  const pairDir = path.resolve(actorDir, pair.agent);
  const handoff = path.join(pairDir, "handoff.md");
  const receipts = path.join(pairDir, "receipts");
  if (!actorDir.startsWith(`${localRoot}${path.sep}`) || !pairDir.startsWith(`${localRoot}${path.sep}`)) {
    throw new LifecycleError("pair path escapes .agents/local", 2);
  }
  for (const candidate of [localRoot, actorDir, pairDir, handoff, receipts]) {
    if (existsSync(candidate) && lstatSync(candidate).isSymbolicLink()) throw new LifecycleError(`pair path must not be a symbolic link: ${candidate}`, 2);
  }
  if (existsSync(localRoot) && existsSync(pairDir)) {
    const resolvedRoot = realpathSync(localRoot);
    const resolvedPair = realpathSync(pairDir);
    if (!resolvedPair.startsWith(`${resolvedRoot}${path.sep}`)) throw new LifecycleError("pair path resolves outside .agents/local", 2);
  }
  return { pairDir, handoff, receipts };
}

function readOpenReceipt(file: string): OpenReceipt {
  let receipt: OpenReceipt;
  try { receipt = JSON.parse(readFileSync(file, "utf8")) as OpenReceipt; }
  catch { throw new LifecycleError(`malformed open receipt: ${file}`); }
  if (receipt.schemaVersion !== 1 || receipt.operation !== "session.open" || !receipt.sessionId || !receipt.pair?.actor || !receipt.pair?.agent) {
    throw new LifecycleError(`invalid open receipt: ${file}`);
  }
  if (path.basename(file) !== `${receipt.sessionId}-open.json`) throw new LifecycleError(`open receipt filename mismatch: ${file}`);
  safeCell(receipt.pair.signature, "receipt signature");
  return receipt;
}

function assertReceiptOwner(receipt: OpenReceipt, pair: PairIdentity, file: string): void {
  if (receipt.pair.actor !== pair.actor || receipt.pair.agent !== pair.agent) {
    throw new LifecycleError(`open receipt ownership mismatch: ${file}`);
  }
}

function activeReceipt(receipts: string, registry: ActiveSession[], pair: PairIdentity): OpenReceipt {
  if (!existsSync(receipts)) throw new LifecycleError("no receipt directory exists for this pair");
  const candidates = readdirSync(receipts).filter((f) => f.endsWith("-open.json"));
  const activeRows = new Map(registry.map((row) => [row.sessionId, row]));
  const matches = candidates.map((name) => {
    const file = path.join(receipts, name);
    const receipt = readOpenReceipt(file);
    assertReceiptOwner(receipt, pair, file);
    return receipt;
  }).filter((receipt) => {
    const row = activeRows.get(receipt.sessionId);
    if (!row) return false;
    if (row.signature !== receipt.pair.signature) throw new LifecycleError(`open receipt signature mismatch: ${receipt.sessionId}`);
    return true;
  });
  if (matches.length !== 1) throw new LifecycleError(`expected exactly one active session for this pair, found ${matches.length}`);
  return matches[0];
}

export type LifecycleFaultPoint = "before-open-registry-write" | "before-open-receipt-write" | "before-checkpoint-registry-write" | "before-close-handoff-write" | "before-close-receipt-write" | "before-close-registry-write";
export type OpenSessionOptions = { actor?: string; agent?: string; signature?: string; toolSignature?: string; topic: string; now?: Date; faultInjector?: (point: LifecycleFaultPoint) => void };
export type CheckpointOptions = { actor?: string; agent?: string; signature?: string; toolSignature?: string; title: string; body: string; now?: Date; faultInjector?: (point: LifecycleFaultPoint) => void };
export type CloseSessionOptions = { actor?: string; agent?: string; signature?: string; toolSignature?: string; journal: "significant" | "not-significant"; journalEntryConfirmed?: boolean; status: "STABLE" | "BLOCKED"; lastAction: string; pendingStep: string; blockers?: string; openThreads?: string; confirmChecklist: boolean; now?: Date; faultInjector?: (point: LifecycleFaultPoint) => void };

function openSessionUnlocked(opts: OpenSessionOptions): OpenReceipt {
  const agentsDir = findAgentsDir();
  if (!agentsDir) throw new LifecycleError("could not locate .agents directory", 2);
  const now = opts.now ?? new Date();
  const pair = resolvePair(opts, agentsDir, now);
  const paths = pairPaths(agentsDir, pair);
  canonicalBootFiles(agentsDir, paths.handoff, false);
  const signature = safeCell(pair.signature, "signature");
  const receiptPair = { ...pair, signature };
  const topic = safeCell(opts.topic, "topic");
  const registryPath = path.join(agentsDir, "sessions", "active_sessions.md");
  const registryBefore = readFileSync(registryPath, "utf8");
  const rows = parseActiveSessions(registryBefore);
  const usedSessionIds = new Set(rows.map((row) => row.sessionId));
  if (existsSync(paths.receipts)) {
    const activeIds = new Set(rows.map((r) => r.sessionId));
    for (const file of readdirSync(paths.receipts).filter((f) => f.endsWith("-open.json"))) {
      const receiptPath = path.join(paths.receipts, file);
      const receipt = readOpenReceipt(receiptPath);
      assertReceiptOwner(receipt, pair, receiptPath);
      usedSessionIds.add(receipt.sessionId);
      if (activeIds.has(receipt.sessionId)) throw new LifecycleError(`pair already owns active session ${receipt.sessionId}`);
    }
  }
  const baseId = sessionId(now, pair.agent);
  let id = baseId;
  for (let sequence = 2; usedSessionIds.has(id); sequence++) id = `${baseId}-${sequence}`;
  const handoffBefore = existsSync(paths.handoff) ? readFileSync(paths.handoff, "utf8") : freshHandoff(receiptPair, now);
  const previous = existsSync(paths.handoff) ? parseHandoffMd(handoffBefore) : null;
  let handoffAfter = resetChecklist(handoffBefore);
  handoffAfter = setField(handoffAfter, "Last Agent", receiptPair.signature);
  handoffAfter = setField(handoffAfter, "Timestamp", handoffTimestamp(now));
  handoffAfter = setField(handoffAfter, "Status", "IN_PROGRESS");
  handoffAfter = setField(handoffAfter, "Last Action", `Opened session ${id}.`);
  handoffAfter = handoffAfter.replace(/^> Version: (\S+) \| Updated: \S+$/m, `> Version: $1 | Updated: ${now.toISOString().slice(0, 10)}`);
  mkdirSync(paths.pairDir, { recursive: true });
  mkdirSync(paths.receipts, { recursive: true });
  const handoffExisted = existsSync(paths.handoff);
  const registryAfter = mutateRegistry(registryBefore, (current) => [...current, {
    sessionId: id, signature, started: now.toISOString(), topic, checkpoint: "—",
  }]);
  const receiptPath = path.join(paths.receipts, `${id}-open.json`);
  let registryCommitted = false;
  let handoffCommitted = false;
  try {
    opts.faultInjector?.("before-open-registry-write");
    atomicCompareReplace(registryPath, registryBefore, registryAfter, id);
    registryCommitted = true;
    if (handoffExisted) atomicCompareReplace(paths.handoff, handoffBefore, handoffAfter, id);
    else writeExclusiveFile(paths.handoff, handoffAfter);
    handoffCommitted = true;
    const files = canonicalBootFiles(agentsDir, paths.handoff).map((file) => ({ path: path.relative(path.dirname(agentsDir), file).replace(/\\/g, "/"), sha256: sha(file) }));
    const receipt: OpenReceipt = { schemaVersion: 1, operation: "session.open", timestamp: now.toISOString(), projectRoot: path.dirname(agentsDir), pair: receiptPair, sessionId: id, previousHandoff: previous, files };
    opts.faultInjector?.("before-open-receipt-write");
    writeExclusiveFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  }
  catch (error) {
    const compensationErrors = runCompensations([
      () => {
        if (!handoffCommitted || !existsSync(paths.handoff) || readFileSync(paths.handoff, "utf8") !== handoffAfter) return;
        if (handoffExisted) atomicCompareReplace(paths.handoff, handoffAfter, handoffBefore, `${id}.handoff-rollback`);
        else rmSync(paths.handoff);
      },
      () => {
        if (registryCommitted) compensateRegistry(registryPath, `${id}.registry-rollback`, (current) => current.filter((row) => row.sessionId !== id));
      },
    ]);
    rethrowWithCompensation(error, compensationErrors);
  }
}

function createCheckpointUnlocked(opts: CheckpointOptions) {
  const agentsDir = findAgentsDir(); if (!agentsDir) throw new LifecycleError("could not locate .agents directory", 2);
  const now = opts.now ?? new Date(); const pair = resolvePair(opts, agentsDir, now); const paths = pairPaths(agentsDir, pair);
  const registryPath = path.join(agentsDir, "sessions", "active_sessions.md"); const before = readFileSync(registryPath, "utf8");
  const receipt = activeReceipt(paths.receipts, parseActiveSessions(before), pair);
  const slug = assertSegment(opts.title, "title"); const name = `${utcCompact(now)}_${pair.agent}_${slug}.md`;
  const target = path.resolve(agentsDir, "checkpoints", name); const root = path.resolve(agentsDir, "checkpoints") + path.sep;
  if (!target.startsWith(root)) throw new LifecycleError("unsafe checkpoint path", 2);
  const content = `# Checkpoint — ${slug}\n\n> Timestamp: ${now.toISOString()}\n> Agent: ${receipt.pair.signature}\n> Actor: ${pair.actor}\n> Session: \`${receipt.sessionId}\`\n\n${opts.body.replace(/^\s+|\s+$/g, "")}\n`;
  writeExclusiveFile(target, content);
  const after = mutateRegistry(before, (rows) => rows.map((r) => r.sessionId === receipt.sessionId ? { ...r, checkpoint: name } : r));
  try { opts.faultInjector?.("before-checkpoint-registry-write"); atomicCompareReplace(registryPath, before, after, receipt.sessionId); }
  catch (error) {
    const compensationErrors = runCompensations([
      () => { if (existsSync(target) && readFileSync(target, "utf8") === content) rmSync(target); },
    ]);
    rethrowWithCompensation(error, compensationErrors);
  }
  return { checkpoint: target, sessionId: receipt.sessionId, timestamp: now.toISOString() };
}

function closeSessionUnlocked(opts: CloseSessionOptions) {
  const agentsDir = findAgentsDir(); if (!agentsDir) throw new LifecycleError("could not locate .agents directory", 2);
  const now = opts.now ?? new Date(); const pair = resolvePair(opts, agentsDir, now); const paths = pairPaths(agentsDir, pair);
  if (!opts.confirmChecklist) throw new LifecycleError("close requires --confirm-checklist after verifying all conditional close obligations");
  if (opts.journal === "significant" && !opts.journalEntryConfirmed) throw new LifecycleError("significant close requires --journal-entry-confirmed");
  const handoffBefore = readFileSync(paths.handoff, "utf8"); parseHandoffMd(handoffBefore);
  const decisions = path.join(agentsDir, "decisions.jsonl"); if (!existsSync(decisions)) throw new LifecycleError("decisions.jsonl not found");
  for (const [i, line] of readFileSync(decisions, "utf8").split(/\r?\n/).entries()) if (line.trim()) try { JSON.parse(line); } catch { throw new LifecycleError(`decisions.jsonl line ${i + 1} is invalid JSON`); }
  const registryPath = path.join(agentsDir, "sessions", "active_sessions.md"); const before = readFileSync(registryPath, "utf8");
  const registryRows = parseActiveSessions(before);
  const receipt = activeReceipt(paths.receipts, registryRows, pair);
  const ownedRow = registryRows.find((row) => row.sessionId === receipt.sessionId);
  if (!ownedRow) throw new LifecycleError(`active session row not found for ${receipt.sessionId}`);
  const after = mutateRegistry(before, (rows) => rows.filter((r) => r.sessionId !== receipt.sessionId));
  const receiptPair = { ...pair, signature: safeCell(receipt.pair.signature, "receipt signature") };
  let handoffAfter = setField(handoffBefore, "Last Agent", receiptPair.signature);
  handoffAfter = setField(handoffAfter, "Timestamp", handoffTimestamp(now));
  handoffAfter = setField(handoffAfter, "Status", opts.status);
  handoffAfter = setField(handoffAfter, "Last Action", safeCell(opts.lastAction, "last action"));
  handoffAfter = setField(handoffAfter, "Pending Step", safeCell(opts.pendingStep, "pending step"));
  handoffAfter = setField(handoffAfter, "Blockers/Context", safeCell(opts.blockers ?? "None", "blockers"));
  handoffAfter = setField(handoffAfter, "Open Threads", safeCell(opts.openThreads ?? "None", "open threads"));
  handoffAfter = handoffAfter.replace(/^> Version: (\S+) \| Updated: \S+$/m, `> Version: $1 | Updated: ${now.toISOString().slice(0, 10)}`);
  handoffAfter = handoffAfter.replace(/^- \[[ xX]\]/gm, "- [x]");
  const closeReceipt = { schemaVersion: 1, operation: "session.close", timestamp: now.toISOString(), pair: receiptPair, sessionId: receipt.sessionId, journal: opts.journal, validation: { handoff: "passed", decisions: "passed", checklist: "passed" } };
  const closeReceiptPath = path.join(paths.receipts, `${receipt.sessionId}-close.json`);
  if (existsSync(closeReceiptPath)) throw new LifecycleError(`close receipt already exists: ${closeReceiptPath}`);
  let handoffCommitted = false;
  let closeReceiptCommitted = false;
  try {
    opts.faultInjector?.("before-close-handoff-write");
    atomicCompareReplace(paths.handoff, handoffBefore, handoffAfter, receipt.sessionId);
    handoffCommitted = true;
    opts.faultInjector?.("before-close-receipt-write");
    writeExclusiveFile(closeReceiptPath, `${JSON.stringify(closeReceipt, null, 2)}\n`);
    closeReceiptCommitted = true;
    opts.faultInjector?.("before-close-registry-write");
    atomicCompareReplace(registryPath, before, after, receipt.sessionId);
  }
  catch (error) {
    const expectedCloseReceipt = `${JSON.stringify(closeReceipt, null, 2)}\n`;
    const compensationErrors = runCompensations([
      () => {
        if (closeReceiptCommitted && existsSync(closeReceiptPath) && readFileSync(closeReceiptPath, "utf8") === expectedCloseReceipt) rmSync(closeReceiptPath);
      },
      () => {
        if (handoffCommitted && existsSync(paths.handoff) && readFileSync(paths.handoff, "utf8") === handoffAfter) {
          atomicCompareReplace(paths.handoff, handoffAfter, handoffBefore, `${receipt.sessionId}.handoff-rollback`);
        }
      },
    ]);
    rethrowWithCompensation(error, compensationErrors);
  }
  return closeReceipt;
}

function guarded<T>(operation: () => T): T {
  const agentsDir = findAgentsDir();
  if (!agentsDir) throw new LifecycleError("could not locate .agents directory", 2);
  return withLifecycleGuard(agentsDir, operation);
}

export function openSession(opts: OpenSessionOptions): OpenReceipt {
  return guarded(() => openSessionUnlocked(opts));
}

export function createCheckpoint(opts: CheckpointOptions) {
  return guarded(() => createCheckpointUnlocked(opts));
}

export function closeSession(opts: CloseSessionOptions) {
  return guarded(() => closeSessionUnlocked(opts));
}
