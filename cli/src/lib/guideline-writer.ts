import { existsSync, readFileSync, writeFileSync } from "node:fs";

const TAG_OPEN = "<lead-protocol>";
const TAG_CLOSE = "</lead-protocol>";
const TAG_PATTERN = /<lead-protocol>[\s\S]*?<\/lead-protocol>/;

export type WriteResult = "new" | "replaced" | "noop";

export function writeGuidelines(
  filePath: string,
  guidelines: string,
): WriteResult {
  if (!guidelines.trim()) {
    return "noop";
  }

  const block = `${TAG_OPEN}\n${guidelines}\n\n${TAG_CLOSE}`;

  let content = "";
  let replaced = false;

  if (existsSync(filePath)) {
    content = readFileSync(filePath, "utf-8");

    if (TAG_PATTERN.test(content)) {
      content = content.replace(TAG_PATTERN, block);
      replaced = true;
    } else {
      const existing = content.trimEnd();
      const separator = existing.length > 0 ? "\n\n===\n\n" : "";
      content = existing + separator + block;
    }
  } else {
    content = block;
  }

  content = content.replace(/\n{3,}/g, "\n\n");

  if (!content.endsWith("\n")) {
    content += "\n";
  }

  writeFileSync(filePath, content, "utf-8");

  return replaced ? "replaced" : "new";
}
