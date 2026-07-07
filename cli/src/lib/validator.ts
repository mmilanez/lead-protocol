import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { parseHandoffMd, isPristineHandoff } from "./handoff-parser.js";

export interface ValidationResult {
  file: string;
  type: "handoff" | "decisions" | "log" | "sessions";
  errors: string[];
  skipped?: boolean;
  skipReason?: string;
}

// Git writes conflict markers as exactly seven marker characters at the
// start of a line: `<<<<<<< <label>`, `=======`, `>>>>>>> <label>`, and
// (diff3 style) `||||||| <label>`. Requiring the full seven-character run
// anchored at column 0 keeps false positives out of prose and code blocks.
const CONFLICT_MARKER_RE = /^(<{7}( .*)?|={7}|>{7}( .*)?|\|{7}( .*)?)$/;

function findConflictMarkers(text: string): number[] {
  const lines: number[] = [];
  text.split("\n").forEach((line, i) => {
    if (CONFLICT_MARKER_RE.test(line)) lines.push(i + 1);
  });
  return lines;
}

// An empty file is fine; a non-empty file must end with a newline,
// otherwise the next append glues onto the last line (and corrupts
// JSONL structurally).
function hasFinalNewline(text: string): boolean {
  return text === "" || text.endsWith("\n");
}

// Top-level `# ` headers beyond the first one, ignoring fenced code blocks.
// More than one H1 in JOURNAL.md or LESSONS.md is the classic symptom of a
// badly resolved merge that duplicated the file header.
function findDuplicateH1(text: string): number[] {
  const h1Lines: number[] = [];
  let inFence = false;
  text.split("\n").forEach((line, i) => {
    const stripped = line.trimStart();
    if (stripped.startsWith("```") || stripped.startsWith("~~~")) {
      inFence = !inFence;
      return;
    }
    if (!inFence && line.startsWith("# ")) h1Lines.push(i + 1);
  });
  return h1Lines.slice(1);
}

interface IntegrityOptions {
  checkNewline?: boolean;
  checkH1?: boolean;
}

// Structural integrity checks shared by every state file type
// (PROTOCOL_RULES §P3 append-at-tail invariants).
export function integrityErrors(text: string, opts: IntegrityOptions = {}): string[] {
  const errors: string[] = [];
  for (const lineno of findConflictMarkers(text)) {
    errors.push(
      `line ${lineno}: unresolved merge conflict marker (resolve the merge before appending new entries)`,
    );
  }
  if (opts.checkNewline && !hasFinalNewline(text)) {
    errors.push(
      "missing final newline (the next append would glue onto the last line)",
    );
  }
  if (opts.checkH1) {
    for (const lineno of findDuplicateH1(text)) {
      errors.push(
        `line ${lineno}: duplicated top-level header (symptom of a badly resolved merge; keep a single \`# \` header)`,
      );
    }
  }
  return errors;
}

function createValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
  addFormats(ajv);
  return ajv;
}

function loadSchema(schemasDir: string, name: string): object {
  const schemaPath = path.join(schemasDir, name);
  if (!existsSync(schemaPath)) {
    throw new Error(`schema not found: ${schemaPath}`);
  }
  return JSON.parse(readFileSync(schemaPath, "utf-8"));
}

export function findSchemasDir(agentsDir: string): string {
  const schemasDir = path.join(agentsDir, "schemas");
  if (!existsSync(schemasDir)) {
    throw new Error(
      `could not locate schemas directory at ${schemasDir}`,
    );
  }
  return schemasDir;
}

export function validateDecisionsJsonl(
  filePath: string,
  schemasDir: string,
): ValidationResult {
  const result: ValidationResult = {
    file: filePath,
    type: "decisions",
    errors: [],
  };

  if (!existsSync(filePath)) {
    result.errors.push("file not found");
    return result;
  }

  const schema = loadSchema(schemasDir, "decisions.entry.schema.json");
  const ajv = createValidator();
  const validate = ajv.compile(schema);

  const text = readFileSync(filePath, "utf-8");

  // Structural integrity first: a file holding unresolved conflict markers
  // is corrupted and skips the schema pass (marker lines are not JSON, and
  // per-line schema noise would bury the real problem).
  const structural = integrityErrors(text, { checkNewline: true });
  if (structural.some((e) => e.includes("conflict marker"))) {
    result.errors.push(...structural);
    return result;
  }
  result.errors.push(...structural);

  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch (e) {
      result.errors.push(`line ${i + 1}: invalid JSON — ${(e as Error).message}`);
      continue;
    }

    if (!validate(entry)) {
      for (const err of validate.errors ?? []) {
        const loc = err.instancePath || "<root>";
        result.errors.push(`line ${i + 1}: ${loc} — ${err.message}`);
      }
    }
  }

  return result;
}

export function validateHandoff(
  filePath: string,
  schemasDir: string,
): ValidationResult {
  const result: ValidationResult = {
    file: filePath,
    type: "handoff",
    errors: [],
  };

  if (!existsSync(filePath)) {
    result.errors.push("file not found");
    return result;
  }

  const text = readFileSync(filePath, "utf-8");

  // A handoff holding conflict markers is corrupted regardless of whether
  // it looks pristine; parsing it would only add noise.
  const markerErrors = integrityErrors(text);
  if (markerErrors.length > 0) {
    result.errors.push(...markerErrors);
    return result;
  }

  if (isPristineHandoff(text)) {
    result.skipped = true;
    result.skipReason = "pristine template";
    return result;
  }

  let data: unknown;
  try {
    data = parseHandoffMd(text);
  } catch (e) {
    result.errors.push(`parse error — ${(e as Error).message}`);
    return result;
  }

  const schema = loadSchema(schemasDir, "handoff.schema.json");
  const ajv = createValidator();
  const validate = ajv.compile(schema);

  if (!validate(data)) {
    for (const err of validate.errors ?? []) {
      const loc = err.instancePath || "<root>";
      result.errors.push(`${loc} — ${err.message}`);
    }
  }

  return result;
}

// Integrity checks for the append-only markdown logs (JOURNAL.md,
// LESSONS.md). No schema applies; entries are free-form.
export function validateMarkdownLog(filePath: string): ValidationResult {
  const result: ValidationResult = { file: filePath, type: "log", errors: [] };

  if (!existsSync(filePath)) {
    result.errors.push("file not found");
    return result;
  }

  const text = readFileSync(filePath, "utf-8");
  result.errors.push(...integrityErrors(text, { checkNewline: true, checkH1: true }));
  return result;
}

// Integrity checks for sessions/active_sessions.md. Only conflict markers
// are checked: rows are legitimately removed on session close, so this file
// is not append-only and neither the final-newline invariant nor the
// single-header invariant applies here.
export function validateActiveSessions(filePath: string): ValidationResult {
  const result: ValidationResult = { file: filePath, type: "sessions", errors: [] };

  if (!existsSync(filePath)) {
    result.errors.push("file not found");
    return result;
  }

  const text = readFileSync(filePath, "utf-8");
  result.errors.push(...integrityErrors(text));
  return result;
}
