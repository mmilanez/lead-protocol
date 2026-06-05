export interface HandoffData {
  version: string;
  updated: string;
  last_agent: string;
  timestamp: string;
  status: string;
  last_action: string;
  pending_step: string;
  blockers_context: string;
  open_threads: string;
  session_close_checklist: Record<string, ChecklistItem>;
}

export interface ChecklistItem {
  checked: boolean;
  na?: boolean;
  note?: string;
}

const PRISTINE_MARKERS = ["YYYY-MM-DD", "[Your Agent Signature]"];

const CHECKLIST_KEYS = [
  "activity_log_updated",
  "decisions_appended",
  "personal_lessons_appended",
  "project_lessons_appended",
  "journal_appended",
  "commit_convention_followed",
  "version_bumps_applied",
  "active_sessions_row_removed",
] as const;

export function isPristineHandoff(text: string): boolean {
  return PRISTINE_MARKERS.some((marker) => text.includes(marker));
}

export function parseHandoffMd(text: string): HandoffData {
  const result: Partial<HandoffData> = {};

  // Version + Updated line
  const versionMatch = text.match(
    /^>\s*Version:\s*(\S+)\s*\|\s*Updated:\s*(\S+)\s*$/m,
  );
  if (!versionMatch) {
    throw new Error("missing or malformed Version/Updated line");
  }
  result.version = versionMatch[1];
  result.updated = versionMatch[2];

  // Seven canonical fields as **Field:** value
  const fieldMap: Record<string, keyof HandoffData> = {
    "Last Agent": "last_agent",
    Timestamp: "timestamp",
    Status: "status",
    "Last Action": "last_action",
    "Pending Step": "pending_step",
    "Blockers/Context": "blockers_context",
    "Open Threads": "open_threads",
  };

  for (const [label, key] of Object.entries(fieldMap)) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `\\*\\*${escaped}:\\*\\*\\s*(.+?)(?=\\n\\*\\*|\\n\\n|$)`,
      "s",
    );
    const match = text.match(pattern);
    if (!match) {
      throw new Error(`missing field: ${label}`);
    }
    (result as Record<string, string>)[key] = match[1].trim();
  }

  // Session close checklist — eight checkboxes in fixed order
  const checkboxPattern = /^- \[([ xX])\]\s*(.+?)(?:\s*—\s*(.+?))?$/gm;
  const matches: Array<[string, string, string]> = [];
  let m: RegExpExecArray | null;

  while ((m = checkboxPattern.exec(text)) !== null) {
    matches.push([m[1], m[2], m[3] ?? ""]);
  }

  if (matches.length < CHECKLIST_KEYS.length) {
    throw new Error(
      `expected ${CHECKLIST_KEYS.length} checklist items, found ${matches.length}`,
    );
  }

  const checklist: Record<string, ChecklistItem> = {};

  for (let i = 0; i < CHECKLIST_KEYS.length; i++) {
    const [mark, body, note] = matches[i];
    const checked = mark.toLowerCase() === "x";
    const item: ChecklistItem = { checked };

    const bodyLower = body.toLowerCase();
    const noteLower = note.toLowerCase();

    if (
      (note && (noteLower.includes("n/a") || noteLower.includes("not applicable"))) ||
      bodyLower.includes("n/a")
    ) {
      item.na = true;
    }

    if (note.trim()) {
      item.note = note.trim();
    }

    checklist[CHECKLIST_KEYS[i]] = item;
  }

  result.session_close_checklist = checklist;

  return result as HandoffData;
}
