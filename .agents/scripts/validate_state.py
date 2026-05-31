#!/usr/bin/env python3
"""Validate Lead Protocol state files against their JSON Schemas.

Usage:
    validate_state.py [--schemas-dir DIR] [FILE ...]

Running the test suite (from the repo root):
    pip install pytest jsonschema
    pytest .agents/scripts/ -v

Without arguments, validates both canonical state locations:
    .agents/decisions.jsonl                                 (one object per line)
    .agents/local/<actor>/<agent>/handoff.md                (one per pair, walked)

With explicit file paths, validates each one. The file type is inferred
from the filename (handoff.md vs decisions.jsonl).

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
    """
    errors: list[str] = []
    validator = Draft202012Validator(schema)
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        return [f"{path}: could not read file — {e}"]

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


def validate_handoff(schema: dict[str, Any], path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
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
      - .agents/local/<actor>/<agent>/handoff.md   (zero or more; walked)
    """
    cwd = Path.cwd()
    for ancestor in [cwd, *cwd.parents]:
        agents_dir = ancestor / ".agents"
        if agents_dir.is_dir():
            targets: list[Path] = []
            decisions = agents_dir / "decisions.jsonl"
            if decisions.is_file():
                targets.append(decisions)
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
        help="Files to validate. Default: .agents/decisions.jsonl and every "
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
        else:
            all_errors.append(
                f"{target}: unrecognized file "
                "(expected 'handoff.md' or 'decisions.jsonl')"
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
