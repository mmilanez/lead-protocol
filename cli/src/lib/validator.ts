import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { parseHandoffMd, isPristineHandoff } from "./handoff-parser.js";

export interface ValidationResult {
  file: string;
  type: "handoff" | "decisions";
  errors: string[];
  skipped?: boolean;
  skipReason?: string;
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
