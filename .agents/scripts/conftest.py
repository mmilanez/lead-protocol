# SPDX-License-Identifier: Apache-2.0
"""Shared pytest fixtures for validate_state.py tests."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).parent
SCHEMAS_DIR = SCRIPTS_DIR.parent / "schemas"

sys.path.insert(0, str(SCRIPTS_DIR))


@pytest.fixture
def schemas_dir() -> Path:
    return SCHEMAS_DIR


@pytest.fixture
def handoff_schema(schemas_dir: Path) -> dict:
    import json

    return json.loads((schemas_dir / "handoff.schema.json").read_text(encoding="utf-8"))


@pytest.fixture
def decisions_entry_schema(schemas_dir: Path) -> dict:
    import json

    return json.loads(
        (schemas_dir / "decisions.entry.schema.json").read_text(encoding="utf-8")
    )


@pytest.fixture
def valid_handoff_md() -> str:
    """A populated handoff.md with the v2.0.0 eight-item checklist."""
    return (
        "# handoff.md — Current operational state\n"
        "> Version: 2.0 | Updated: 2026-04-21\n"
        "\n"
        "**Last Agent:** [Claude Code / claude-opus-4-7]\n"
        "**Timestamp:** 2026-04-21 23:55\n"
        "**Status:** STABLE\n"
        "**Last Action:** Shipped validator unit tests.\n"
        "**Pending Step:** None.\n"
        "**Blockers/Context:** None.\n"
        "**Open Threads:**\n"
        "- Item A\n"
        "- Item B\n"
        "\n"
        "**Session close checklist (self-verified):**\n"
        "- [x] activity log updated — N/A\n"
        "- [x] decisions appended\n"
        "- [x] personal lessons appended — N/A\n"
        "- [x] project lessons appended — N/A\n"
        "- [x] journal appended — N/A\n"
        "- [ ] commit convention followed\n"
        "- [x] version bumps applied\n"
        "- [x] active sessions row removed — N/A\n"
    )


@pytest.fixture
def valid_decision_entry() -> dict:
    """A single decisions.jsonl entry matching decisions.entry.schema.json."""
    return {
        "timestamp": "2026-04-21T23:55:00",
        "agent": "[Claude Code / claude-opus-4-7]",
        "decision": "Add unit tests for validate_state.py",
        "rationale": "Catch parser regressions before they reach downstream projects.",
        "files_affected": [".agents/scripts/test_validate_state.py"],
        "status": "completed",
    }
