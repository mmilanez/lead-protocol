#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Validate Lead Protocol state files against their JSON Schemas.

Usage:
    validate_state.py [--schemas-dir DIR] [FILE ...]

Running the test suite (from the repo root):
    pip install pytest jsonschema
    pytest .agents/scripts/ -v

Without arguments, validates every canonical state location that exists:
    .agents/decisions.jsonl                                 (one object per line)
    .agents/JOURNAL.md                                      (append-only log)
    .agents/LESSONS.md                                      (append-only log)
    .agents/sessions/active_sessions.md                     (live-session registry)
    .agents/local/<actor>/<agent>/handoff.md                (one per pair, walked)

With explicit file paths, validates each one. The file type is inferred
from the filename.

Exit codes:
    0 — all validations passed
    1 — validation errors
    2 — configuration errors (missing schemas, malformed invocation)

The handoff.md validator parses the markdown into the canonical JSON
shape defined by handoff.schema.json before validating. A pristine
template handoff (containing literal 'YYYY-MM-DD' placeholders) is
recognized and skipped with a warning rather than treated as an error.

The decisions.jsonl validator processes one line at a time, validating
each against decisions.entry.schema.json. Empty lines are skipped; a
malformed line fails validation without aborting the rest of the file.

All state files additionally go through structural integrity checks
(§P3 append-at-tail invariants):
    - unresolved merge conflict markers (all state files)
    - missing final newline (append-only files: decisions.jsonl,
      JOURNAL.md, LESSONS.md), which would make the next append glue
      onto the previous line
    - duplicated top-level `# ` header (JOURNAL.md, LESSONS.md), the
      classic symptom of a badly resolved markdown merge
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

try:
    from jsonschema import Draft202012Validator
except ImportError:
    print(
        "error: jsonschema is not installed. Install with:\n"
        "    pip install jsonschema",
        file=sys.stderr,
    )
    sys.exit(2)


PRISTINE_MARKERS = ("YYYY-MM-DD", "[Your Agent Signature]")

# Git writes conflict markers as exactly seven marker characters at the
# start of a line: `<<<<<<< <label>`, `=======`, `>>>>>>> <label>`, and
# (diff3 style) `||||||| <label>`. Requiring the full seven-character run
# anchored at column 0 keeps false positives out of prose and code blocks.
CONFLICT_MARKER_RE = re.compile(r"^(<{7}(?: .*)?|={7}|>{7}(?: .*)?|\|{7}(?: .*)?)$")


def find_conflict_markers(text: str) -> list[int]:
    """Return the 1-based line numbers of unresolved merge conflict markers."""
    return [
        lineno
        for lineno, line in enumerate(text.splitlines(), start=1)
        if CONFLICT_MARKER_RE.match(line)
    ]


def has_final_newline(text: str) -> bool:
    """An empty file is fine; a non-empty file must end with a newline,
    otherwise the next append glues onto the last line (and corrupts
    JSONL structurally)."""
    return text == "" or text.endswith("\n")


def find_duplicate_h1(text: str) -> list[int]:
    """Return the 1-based line numbers of top-level `# ` headers beyond the
    first one, ignoring fenced code blocks. More than one H1 in JOURNAL.md
    or LESSONS.md is the classic symptom of a badly resolved merge that
    duplicated the file header."""
    h1_lines: list[int] = []
    in_fence = False
    for lineno, line in enumerate(text.splitlines(), start=1):
        stripped = line.lstrip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = not in_fence
            continue
        if not in_fence and line.startswith("# "):
            h1_lines.append(lineno)
    return h1_lines[1:]


def integrity_errors(
    path: Path,
    text: str,
    *,
    check_newline: bool = False,
    check_h1: bool = False,
) -> list[str]:
    """Structural integrity checks shared by every state file type
    (§P3 append-at-tail invariants)."""
    errors: list[str] = []
    for lineno in find_conflict_markers(text):
        errors.append(
            f"{path}:{lineno}: unresolved merge conflict marker "
            "(resolve the merge before appending new entries)"
        )
    if check_newline and not has_final_newline(text):
        errors.append(
            f"{path}: missing final newline "
            "(the next append would glue onto the last line)"
        )
    if check_h1:
        for lineno in find_duplicate_h1(text):
            errors.append(
                f"{path}:{lineno}: duplicated top-level header "
                "(symptom of a badly resolved merge; keep a single `# ` header)"
            )
    return errors


def find_schemas_dir(explicit: Path | None) -> Path:
    """Locate the schemas directory. Prefer an explicit path; otherwise
    walk up from CWD looking for `.agents/schemas/`."""
    if explicit:
        if not explicit.is_dir():
            raise SystemExit(f"error: schemas dir does not exist: {explicit}")
        return explicit

    cwd = Path.cwd()
    for ancestor in [cwd, *cwd.parents]:
        candidate = ancestor / ".agents" / "schemas"
        if candidate.is_dir():
            return candidate

    raise SystemExit(
        "error: could not locate .agents/schemas/. "
        "Run from inside a repo that has Lead Protocol installed, "
        "or pass --schemas-dir explicitly."
    )


def load_schema(schemas_dir: Path, name: str) -> dict[str, Any]:
    path = schemas_dir / name
    if not path.is_file():
        raise SystemExit(f"error: schema not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def parse_handoff_md(text: str) -> dict[str, Any]:
    """Parse handoff.md markdown into the canonical JSON shape defined
    by handoff.schema.json.

    This parser is intentionally strict — if the markdown deviates from
    the §P3 schema, parsing fails rather than producing a partial object.
    """
    result: dict[str, Any] = {}

    # Version + Updated line, e.g. "> Version: 1.4 | Updated: 2026-04-19"
    m = re.search(
        r"^>\s*Version:\s*(\S+)\s*\|\s*Updated:\s*(\S+)\s*$",
        text,
        re.MULTILINE,
    )
    if not m:
        raise ValueError("missing or malformed Version/Updated line")
    result["version"] = m.group(1)
    result["updated"] = m.group(2)

    # Seven canonical fields as **Field:** value
    field_map = {
        "Last Agent": "last_agent",
        "Timestamp": "timestamp",
        "Status": "status",
        "Last Action": "last_action",
        "Pending Step": "pending_step",
        "Blockers/Context": "blockers_context",
        "Open Threads": "open_threads",
    }
    for label, key in field_map.items():
        pattern = rf"\*\*{re.escape(label)}:\*\*\s*(.+?)(?=\n\*\*|\n\n|\Z)"
        m = re.search(pattern, text, re.DOTALL)
        if not m:
            raise ValueError(f"missing field: {label}")
        result[key] = m.group(1).strip()

    # Session close checklist — eight checkboxes in fixed order (v2.0.0)
    checklist_keys = [
        "activity_log_updated",
        "decisions_appended",
        "personal_lessons_appended",
        "project_lessons_appended",
        "journal_appended",
        "commit_convention_followed",
        "version_bumps_applied",
        "active_sessions_row_removed",
    ]
    checkbox_pattern = re.compile(
        r"^- \[([ xX])\]\s*(.+?)(?:\s*—\s*(.+?))?$",
        re.MULTILINE,
    )
    matches = checkbox_pattern.findall(text)
    if len(matches) < len(checklist_keys):
        raise ValueError(
            f"expected {len(checklist_keys)} checklist items, found {len(matches)}"
        )

    checklist: dict[str, dict[str, Any]] = {}
    for key, (mark, body, note) in zip(checklist_keys, matches):
        checked = mark.lower() == "x"
        na = False
        body_lower = body.lower()
        if note and ("n/a" in note.lower() or "not applicable" in note.lower()):
            na = True
        elif "n/a" in body_lower:
            na = True
        item: dict[str, Any] = {"checked": checked}
        if na:
            item["na"] = True
        if note:
            item["note"] = note.strip()
        checklist[key] = item
    result["session_close_checklist"] = checklist

    return result


def is_pristine_handoff(text: str) -> bool:
    return any(marker in text for marker in PRISTINE_MARKERS)


def validate_decisions_jsonl(
    schema: dict[str, Any], path: Path
) -> list[str]:
    """Validate decisions.jsonl line-by-line.

    Each non-empty line must be a JSON object matching
    decisions.entry.schema.json. Empty lines are skipped. An empty file
    is valid (pristine state).

    Structural integrity runs first: a file holding unresolved conflict
    markers is reported as corrupted and skips the schema pass (marker
    lines are not JSON, and per-line schema noise would bury the real
    problem).
    """
    errors: list[str] = []
    validator = Draft202012Validator(schema)
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        return [f"{path}: could not read file — {e}"]

    structural = integrity_errors(path, text, check_newline=True)
    if any("conflict marker" in err for err in structural):
        return structural
    errors.extend(structural)

    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as e:
            errors.append(f"{path}:{lineno}: invalid JSON — {e}")
            continue
        line_errors = sorted(
            validator.iter_errors(entry), key=lambda e: list(e.absolute_path)
        )
        for err in line_errors:
            loc = "/".join(str(p) for p in err.absolute_path) or "<root>"
            errors.append(f"{path}:{lineno}: {loc} — {err.message}")
    return errors


def validate_markdown_log(path: Path) -> list[str]:
    """Integrity checks for the append-only markdown logs
    (JOURNAL.md, LESSONS.md). No schema applies; entries are free-form."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        return [f"{path}: could not read file: {e}"]
    return integrity_errors(path, text, check_newline=True, check_h1=True)


def validate_active_sessions(path: Path) -> list[str]:
    """Integrity checks for sessions/active_sessions.md.

    Only conflict markers are checked: rows are legitimately removed on
    session close, so this file is not append-only and neither the final
    newline invariant nor the single-header invariant is enforced here.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        return [f"{path}: could not read file: {e}"]
    return integrity_errors(path, text)


def validate_handoff(schema: dict[str, Any], path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    marker_errors = integrity_errors(path, text)
    if marker_errors:
        # A handoff holding conflict markers is corrupted regardless of
        # whether it looks pristine; parsing it would only add noise.
        return marker_errors
    if is_pristine_handoff(text):
        print(f"{path}: pristine template (skipped)", file=sys.stderr)
        return []
    try:
        data = parse_handoff_md(text)
    except ValueError as e:
        return [f"{path}: parse error — {e}"]
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path))
    return [
        f"{path}: {'/'.join(str(p) for p in e.absolute_path) or '<root>'} — {e.message}"
        for e in errors
    ]


def discover_pair_handoffs(agents_dir: Path) -> list[Path]:
    """Walk .agents/local/<actor>/<agent>/handoff.md and return every match."""
    local = agents_dir / "local"
    if not local.is_dir():
        return []
    handoffs: list[Path] = []
    for actor_dir in sorted(p for p in local.iterdir() if p.is_dir()):
        for agent_dir in sorted(p for p in actor_dir.iterdir() if p.is_dir()):
            candidate = agent_dir / "handoff.md"
            if candidate.is_file():
                handoffs.append(candidate)
    return handoffs


def default_targets() -> list[Path]:
    """Locate the default state files to validate from CWD.

    v2.0.0 layout:
      - .agents/decisions.jsonl               (always present; may be empty)
      - .agents/JOURNAL.md                    (append-only log)
      - .agents/LESSONS.md                    (append-only log)
      - .agents/sessions/active_sessions.md   (live-session registry)
      - .agents/local/<actor>/<agent>/handoff.md   (zero or more; walked)
    """
    cwd = Path.cwd()
    for ancestor in [cwd, *cwd.parents]:
        agents_dir = ancestor / ".agents"
        if agents_dir.is_dir():
            targets: list[Path] = []
            for candidate in (
                agents_dir / "decisions.jsonl",
                agents_dir / "JOURNAL.md",
                agents_dir / "LESSONS.md",
                agents_dir / "sessions" / "active_sessions.md",
            ):
                if candidate.is_file():
                    targets.append(candidate)
            targets.extend(discover_pair_handoffs(agents_dir))
            if not targets:
                raise SystemExit(
                    f"error: found .agents/ at {agents_dir} but no state files to validate. "
                    "Expected decisions.jsonl or at least one local/<actor>/<agent>/handoff.md."
                )
            return targets
    raise SystemExit("error: could not locate .agents/ from CWD")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Lead Protocol state files.")
    parser.add_argument(
        "--schemas-dir",
        type=Path,
        default=None,
        help="Path to the schemas directory (default: auto-detect .agents/schemas/).",
    )
    parser.add_argument(
        "files",
        nargs="*",
        type=Path,
        help="Files to validate. Default: .agents/decisions.jsonl, "
        "JOURNAL.md, LESSONS.md, sessions/active_sessions.md, and every "
        "local/<actor>/<agent>/handoff.md.",
    )
    args = parser.parse_args()

    schemas_dir = find_schemas_dir(args.schemas_dir)
    handoff_schema = load_schema(schemas_dir, "handoff.schema.json")
    decisions_entry_schema = load_schema(schemas_dir, "decisions.entry.schema.json")

    targets = args.files if args.files else default_targets()

    all_errors: list[str] = []
    for target in targets:
        if not target.is_file():
            all_errors.append(f"{target}: file not found")
            continue
        name = target.name
        if name == "decisions.jsonl":
            all_errors.extend(
                validate_decisions_jsonl(decisions_entry_schema, target)
            )
        elif name == "handoff.md":
            all_errors.extend(validate_handoff(handoff_schema, target))
        elif name in ("JOURNAL.md", "LESSONS.md"):
            all_errors.extend(validate_markdown_log(target))
        elif name == "active_sessions.md":
            all_errors.extend(validate_active_sessions(target))
        else:
            all_errors.append(
                f"{target}: unrecognized file "
                "(expected handoff.md, decisions.jsonl, JOURNAL.md, "
                "LESSONS.md, or active_sessions.md)"
            )

    if all_errors:
        print("Validation failed:", file=sys.stderr)
        for err in all_errors:
            print(f"  {err}", file=sys.stderr)
        return 1

    print(f"OK — validated {len(targets)} file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
