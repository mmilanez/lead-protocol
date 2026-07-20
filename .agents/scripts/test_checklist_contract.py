# SPDX-License-Identifier: Apache-2.0
"""Cross-surface regression tests for the eight-item handoff checklist."""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path

from validate_state import validate_handoff


SCRIPT_DIR = Path(__file__).resolve().parent
TEMPLATE_ROOT = SCRIPT_DIR.parents[1]
EXPECTED_KEYS = [
    "activity_log_updated",
    "decisions_appended",
    "personal_lessons_appended",
    "project_lessons_appended",
    "journal_appended",
    "commit_convention_followed",
    "version_bumps_applied",
    "active_sessions_row_removed",
]
CHECKLIST_MARKERS = [
    ("activity.log",),
    ("decisions.jsonl",),
    ("lessons",),
    ("LESSONS.md",),
    ("JOURNAL",),
    ("commit",),
    ("version bumps",),
    ("active_sessions.md", "active session row"),
]


def _validator_keys() -> list[str]:
    tree = ast.parse((SCRIPT_DIR / "validate_state.py").read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "checklist_keys"
            for target in node.targets
        ):
            return ast.literal_eval(node.value)
    raise AssertionError("validate_state.py checklist_keys assignment was not found")


def _typescript_parser_keys() -> list[str]:
    source = (TEMPLATE_ROOT / "cli/src/lib/handoff-parser.ts").read_text(encoding="utf-8")
    match = re.search(r"const CHECKLIST_KEYS = \[(.*?)\] as const", source, re.DOTALL)
    assert match, "CLI parser CHECKLIST_KEYS was not found"
    return re.findall(r'"([a-z_]+)"', match.group(1))


def _checklist_lines(text: str, start_marker: str) -> list[str]:
    body = text.split(start_marker, 1)[1].split("```", 1)[0]
    return re.findall(r"^- \[[ xX]\] (.+)$", body, re.MULTILINE)


def test_eight_item_contract_matches_prose_schema_validator_parser_and_lifecycle() -> None:
    schema = json.loads(
        (TEMPLATE_ROOT / ".agents/schemas/handoff.schema.json").read_text(encoding="utf-8")
    )
    checklist_schema = schema["properties"]["session_close_checklist"]
    assert checklist_schema["required"] == EXPECTED_KEYS
    assert list(checklist_schema["properties"]) == EXPECTED_KEYS
    assert _validator_keys() == EXPECTED_KEYS
    assert _typescript_parser_keys() == EXPECTED_KEYS

    protocol = (TEMPLATE_ROOT / ".agents/PROTOCOL_RULES.md").read_text(encoding="utf-8")
    protocol_lines = _checklist_lines(protocol, "**Session close checklist (self-verified):**")
    assert len(protocol_lines) == 8
    for line, markers in zip(protocol_lines, CHECKLIST_MARKERS, strict=True):
        assert any(marker.lower() in line.lower() for marker in markers)

    lifecycle = (TEMPLATE_ROOT / "cli/src/lib/session-lifecycle.ts").read_text(encoding="utf-8")
    fresh_handoff = re.search(
        r"function freshHandoff\(.*?return `(.*?)`;\s*\n}", lifecycle, re.DOTALL
    )
    assert fresh_handoff, "CLI freshHandoff template was not found"
    lifecycle_lines = re.findall(r"\\n- \[ \] (.*?)(?=\\n)", fresh_handoff.group(1))
    assert len(lifecycle_lines) == 8
    for line, markers in zip(lifecycle_lines, CHECKLIST_MARKERS, strict=True):
        assert any(marker.lower() in line.lower() for marker in markers)

    module = (TEMPLATE_ROOT / ".agents/modules/git-substrate.md").read_text(encoding="utf-8")
    assert "derived workflow evidence, not a ninth persisted checkbox" in module
    readme = (TEMPLATE_ROOT / "README.md").read_text(encoding="utf-8")
    assert "Adds one checklist item to the handoff schema" not in readme


def test_v213_eight_item_handoff_remains_valid_without_migration(tmp_path: Path) -> None:
    handoff = tmp_path / "handoff.md"
    handoff.write_text(
        """# handoff.md — Current operational state
> Version: 2.0 | Updated: 2026-07-20

**Last Agent:** [Codex / GPT-5.6 Sol]
**Timestamp:** 2026-07-20 06:15
**Status:** STABLE
**Last Action:** Released v2.1.3.
**Pending Step:** None
**Blockers/Context:** None
**Open Threads:** None

**Session close checklist (self-verified):**
- [x] activity.log contains an entry for this session
- [x] decisions.jsonl appended
- [x] local pair lessons appended — N/A
- [x] project LESSONS.md appended — N/A
- [x] JOURNAL significance answered explicitly
- [x] commit convention followed
- [x] version bumps applied — N/A
- [x] active session row removed on close
""",
        encoding="utf-8",
    )
    schema = json.loads(
        (TEMPLATE_ROOT / ".agents/schemas/handoff.schema.json").read_text(encoding="utf-8")
    )
    assert validate_handoff(schema, handoff) == []
