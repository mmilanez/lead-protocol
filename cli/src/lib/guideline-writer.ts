import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { preflightPath } from "./safe-path.js";

const TAG_OPEN = "<lead-protocol>";
const TAG_CLOSE = "</lead-protocol>";
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
// Separators the previous append-at-end writer emitted (LF as written, CRLF once git autocrlf converts it).
const LEGACY_SEPARATORS = ["\n\n===\n\n", "\r\n\r\n===\r\n\r\n"].map((s) => Buffer.from(s));
const FINAL_NEWLINES = ["\n", "\r\n"].map((s) => Buffer.from(s));

export type WriteResult = "new" | "replaced" | "relocated" | "noop";

const isBlank = (bytes: Buffer): boolean => bytes.every((b) => b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d);

export function writeGuidelines(filePath: string, guidelines: string): WriteResult {
  if (!guidelines.trim()) return "noop";
  preflightPath(filePath, "file");
  const original = existsSync(filePath) ? readFileSync(filePath) : Buffer.alloc(0);
  const block = Buffer.from(`${TAG_OPEN}\n${guidelines.trimEnd()}\n\n${TAG_CLOSE}`);
  const top = original.subarray(0, BOM.length).equals(BOM) ? BOM.length : 0;
  const start = original.indexOf(TAG_OPEN);
  const close = start < 0 ? -1 : original.indexOf(TAG_CLOSE, start + TAG_OPEN.length);
  const found = close >= 0;
  const end = close + TAG_CLOSE.length;
  // Work in bytes: even unusual line endings or non-UTF8 user text outside
  // the managed region must survive unchanged.
  let content: Buffer;
  let result: WriteResult;
  if (found && isBlank(original.subarray(top, start))) {
    content = Buffer.concat([original.subarray(0, start), block, original.subarray(end)]);
    result = "replaced";
  } else {
    // The block goes first so size-capped loaders (Codex truncates AGENTS.md)
    // always see the boot procedure. A block found lower down is moved up,
    // together with the separator the old appender wrote before it.
    let cutStart = start;
    let cutEnd = end;
    const separator = found && LEGACY_SEPARATORS.find(
      (s) => start - s.length >= top && original.subarray(start - s.length, start).equals(s),
    );
    if (separator) {
      cutStart -= separator.length;
      const tail = original.subarray(end);
      if (FINAL_NEWLINES.some((n) => tail.equals(n))) cutEnd = original.length;
    }
    const rest = found
      ? Buffer.concat([original.subarray(top, cutStart), original.subarray(cutEnd)])
      : original.subarray(top);
    content = Buffer.concat([original.subarray(0, top), block, Buffer.from(rest.length ? "\n\n" : "\n"), rest]);
    result = found ? "relocated" : "new";
  }
  if (content.equals(original)) return "noop";
  writeFileSync(filePath, content);
  return result;
}
