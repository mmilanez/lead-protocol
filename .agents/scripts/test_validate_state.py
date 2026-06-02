# SPDX-License-Identifier: Apache-2.0
"""Unit tests for validate_state.py (v2.0.0 layout).

Run from the repo root:
    pytest .agents/scripts/ -v

Covers parse_handoff_md, is_pristine_handoff, validate_decisions_jsonl,
validate_handoff, and discover_pair_handoffs against the real schemas
shipped in .agents/schemas/.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from validate_state import (
    discover_pair_handoffs,
    is_pristine_handoff,
    parse_handoff_md,
    validate_decisions_jsonl,
    validate_handoff,
)


# --------------------------------------------------------------------------
# parse_handoff_md
# --------------------------------------------------------------------------


class TestParseHandoffMd:
    def test_valid_handoff_returns_full_dict(self, valid_handoff_md: str) -> None:
        result = parse_handoff_md(valid_handoff_md)
        assert result["version"] == "2.0"
        assert result["updated"] == "2026-04-21"
        assert result["last_agent"] == "[Claude Code / claude-opus-4-7]"
        assert result["timestamp"] == "2026-04-21 23:55"
        assert result["status"] == "STABLE"
        assert result["last_action"] == "Shipped validator unit tests."
        assert result["pending_step"] == "None."
        assert result["blockers_context"] == "None."
        assert "Item A" in result["open_threads"]
        assert len(result["session_close_checklist"]) == 8

    def test_missing_version_line_raises(self, valid_handoff_md: str) -> None:
        broken = valid_handoff_md.replace(
            "> Version: 2.0 | Updated: 2026-04-21\n", ""
        )
        with pytest.raises(ValueError, match="Version/Updated"):
            parse_handoff_md(broken)

    def test_missing_canonical_field_raises(self, valid_handoff_md: str) -> None:
        broken = valid_handoff_md.replace("**Status:** STABLE\n", "")
        with pytest.raises(ValueError, match="Status"):
            parse_handoff_md(broken)

    def test_fewer_than_eight_checkboxes_raises(
        self, valid_handoff_md: str
    ) -> None:
        lines = valid_handoff_md.splitlines(keepends=True)
        kept = 0
        out = []
        for ln in lines:
            if ln.startswith("- ["):
                if kept < 3:
                    out.append(ln)
                    kept += 1
            else:
                out.append(ln)
        broken = "".join(out)
        with pytest.raises(ValueError, match="checklist"):
            parse_handoff_md(broken)

    def test_checkbox_states_x_X_space(self) -> None:
        md = (
            "> Version: 2.0 | Updated: 2026-04-21\n\n"
            "**Last Agent:** [A]\n"
            "**Timestamp:** 2026-04-21 12:00\n"
            "**Status:** STABLE\n"
            "**Last Action:** x\n"
            "**Pending Step:** None.\n"
            "**Blockers/Context:** None.\n"
            "**Open Threads:** None.\n\n"
            "- [x] one\n"
            "- [X] two\n"
            "- [ ] three\n"
            "- [x] four\n"
            "- [x] five\n"
            "- [x] six\n"
            "- [x] seven\n"
            "- [x] eight\n"
        )
        result = parse_handoff_md(md)
        checklist = result["session_close_checklist"]
        values = list(checklist.values())
        assert values[0]["checked"] is True
        assert values[1]["checked"] is True  # [X] uppercase
        assert values[2]["checked"] is False  # [ ] unchecked

    def test_na_in_note_is_detected(self, valid_handoff_md: str) -> None:
        result = parse_handoff_md(valid_handoff_md)
        assert (
            result["session_close_checklist"]["activity_log_updated"].get("na")
            is True
        )

    def test_na_in_body_is_detected(self) -> None:
        md = (
            "> Version: 2.0 | Updated: 2026-04-21\n\n"
            "**Last Agent:** [A]\n"
            "**Timestamp:** 2026-04-21 12:00\n"
            "**Status:** STABLE\n"
            "**Last Action:** x\n"
            "**Pending Step:** None.\n"
            "**Blockers/Context:** None.\n"
            "**Open Threads:** None.\n\n"
            "- [x] item N/A body\n"
            "- [x] two\n"
            "- [x] three\n"
            "- [x] four\n"
            "- [x] five\n"
            "- [x] six\n"
            "- [x] seven\n"
            "- [x] eight\n"
        )
        result = parse_handoff_md(md)
        first = list(result["session_close_checklist"].values())[0]
        assert first.get("na") is True

    def test_note_preserved_verbatim(self, valid_handoff_md: str) -> None:
        result = parse_handoff_md(valid_handoff_md)
        item = result["session_close_checklist"]["activity_log_updated"]
        assert item["note"] == "N/A"

    def test_multiline_open_threads_captured(self, valid_handoff_md: str) -> None:
        result = parse_handoff_md(valid_handoff_md)
        assert "Item A" in result["open_threads"]
        assert "Item B" in result["open_threads"]


# --------------------------------------------------------------------------
# is_pristine_handoff
# --------------------------------------------------------------------------


class TestIsPristineHandoff:
    def test_yyyy_mm_dd_marker(self) -> None:
        assert is_pristine_handoff("> Version: 1.0 | Updated: YYYY-MM-DD") is True

    def test_placeholder_agent_marker(self) -> None:
        assert is_pristine_handoff("**Last Agent:** [Your Agent Signature]") is True

    def test_filled_handoff_is_not_pristine(self, valid_handoff_md: str) -> None:
        assert is_pristine_handoff(valid_handoff_md) is False


# --------------------------------------------------------------------------
# validate_decisions_jsonl
# --------------------------------------------------------------------------


class TestValidateDecisionsJsonl:
    def test_valid_jsonl_no_errors(
        self,
        tmp_path: Path,
        decisions_entry_schema: dict,
        valid_decision_entry: dict,
    ) -> None:
        path = tmp_path / "decisions.jsonl"
        path.write_text(
            json.dumps(valid_decision_entry) + "\n", encoding="utf-8"
        )
        errors = validate_decisions_jsonl(decisions_entry_schema, path)
        assert errors == []

    def test_empty_file_is_valid(
        self, tmp_path: Path, decisions_entry_schema: dict
    ) -> None:
        path = tmp_path / "decisions.jsonl"
        path.write_text("", encoding="utf-8")
        errors = validate_decisions_jsonl(decisions_entry_schema, path)
        assert errors == []

    def test_blank_lines_are_skipped(
        self,
        tmp_path: Path,
        decisions_entry_schema: dict,
        valid_decision_entry: dict,
    ) -> None:
        path = tmp_path / "decisions.jsonl"
        path.write_text(
            "\n" + json.dumps(valid_decision_entry) + "\n\n",
            encoding="utf-8",
        )
        errors = validate_decisions_jsonl(decisions_entry_schema, path)
        assert errors == []

    def test_malformed_line_reports_error_with_lineno(
        self, tmp_path: Path, decisions_entry_schema: dict
    ) -> None:
        path = tmp_path / "decisions.jsonl"
        path.write_text("{not json\n", encoding="utf-8")
        errors = validate_decisions_jsonl(decisions_entry_schema, path)
        assert len(errors) == 1
        assert "invalid JSON" in errors[0]
        assert ":1:" in errors[0]

    def test_missing_required_field_reports_error(
        self,
        tmp_path: Path,
        decisions_entry_schema: dict,
        valid_decision_entry: dict,
    ) -> None:
        bad = dict(valid_decision_entry)
        del bad["rationale"]
        path = tmp_path / "decisions.jsonl"
        path.write_text(json.dumps(bad) + "\n", encoding="utf-8")
        errors = validate_decisions_jsonl(decisions_entry_schema, path)
        assert any("rationale" in e for e in errors)

    def test_multiple_lines_one_bad_reports_only_the_bad_one(
        self,
        tmp_path: Path,
        decisions_entry_schema: dict,
        valid_decision_entry: dict,
    ) -> None:
        path = tmp_path / "decisions.jsonl"
        bad = dict(valid_decision_entry)
        del bad["rationale"]
        path.write_text(
            json.dumps(valid_decision_entry) + "\n"
            + json.dumps(bad) + "\n"
            + json.dumps(valid_decision_entry) + "\n",
            encoding="utf-8",
        )
        errors = validate_decisions_jsonl(decisions_entry_schema, path)
        assert len(errors) == 1
        assert ":2:" in errors[0]


# --------------------------------------------------------------------------
# validate_handoff
# --------------------------------------------------------------------------


class TestValidateHandoff:
    def test_valid_handoff_no_errors(
        self, tmp_path: Path, handoff_schema: dict, valid_handoff_md: str
    ) -> None:
        path = tmp_path / "handoff.md"
        path.write_text(valid_handoff_md, encoding="utf-8")
        errors = validate_handoff(handoff_schema, path)
        assert errors == []

    def test_pristine_handoff_skipped(
        self,
        tmp_path: Path,
        handoff_schema: dict,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        path = tmp_path / "handoff.md"
        path.write_text(
            "> Version: 1.0 | Updated: YYYY-MM-DD\n"
            "**Last Agent:** [Your Agent Signature]\n",
            encoding="utf-8",
        )
        errors = validate_handoff(handoff_schema, path)
        assert errors == []
        captured = capsys.readouterr()
        assert "pristine template" in captured.err

    def test_parse_error_reported(
        self, tmp_path: Path, handoff_schema: dict
    ) -> None:
        path = tmp_path / "handoff.md"
        path.write_text("no version line here at all\n", encoding="utf-8")
        errors = validate_handoff(handoff_schema, path)
        assert len(errors) == 1
        assert "parse error" in errors[0]


# --------------------------------------------------------------------------
# discover_pair_handoffs
# --------------------------------------------------------------------------


class TestDiscoverPairHandoffs:
    def test_no_local_dir_returns_empty(self, tmp_path: Path) -> None:
        agents = tmp_path / ".agents"
        agents.mkdir()
        assert discover_pair_handoffs(agents) == []

    def test_walks_actor_and_agent_subdirs(self, tmp_path: Path) -> None:
        agents = tmp_path / ".agents"
        (agents / "local" / "alice@laptop" / "claude").mkdir(parents=True)
        (agents / "local" / "alice@laptop" / "claude" / "handoff.md").write_text(
            "stub", encoding="utf-8"
        )
        (agents / "local" / "alice@laptop" / "codex").mkdir(parents=True)
        (agents / "local" / "alice@laptop" / "codex" / "handoff.md").write_text(
            "stub", encoding="utf-8"
        )
        (agents / "local" / "joao@laptop" / "claude").mkdir(parents=True)
        (agents / "local" / "joao@laptop" / "claude" / "handoff.md").write_text(
            "stub", encoding="utf-8"
        )
        found = discover_pair_handoffs(agents)
        assert len(found) == 3
        # deterministic ordering by actor then agent
        names = [p.parent.parent.name + "/" + p.parent.name for p in found]
        assert names == [
            "alice@laptop/claude",
            "alice@laptop/codex",
            "joao@laptop/claude",
        ]

    def test_skips_actor_dirs_without_agent_handoffs(
        self, tmp_path: Path
    ) -> None:
        agents = tmp_path / ".agents"
        (agents / "local" / "alice@laptop" / "claude").mkdir(parents=True)
        # no handoff.md → not discovered
        assert discover_pair_handoffs(agents) == []


# --------------------------------------------------------------------------
# Pre-commit hook file regex — Phase 3 closeout gap
#
# .pre-commit-config.yaml gates the hook on
#   ^\.agents/(decisions\.jsonl|local/[^/]+/[^/]+/handoff\.md)$
# Phase 2 only exercised the decisions.jsonl branch directly. The handoff
# branch is important because per-pair handoffs are the state file that
# contributors touch most often — if the regex rejects them silently, the
# hook never fires and bad schema lands on main.
# --------------------------------------------------------------------------

import re


class TestPreCommitFileRegex:
    """Mirror the regex from .pre-commit-config.yaml's `files:` key
    (kept in sync by hand — there is no shared constant). The assertion
    enumerates exactly what the hook will and will not match."""

    # Keep this literal byte-identical to the one in the YAML (the YAML
    # double-escapes the backslashes because they sit inside a double-quoted
    # scalar, so `\.` in regex is written `\\.` on disk).
    PRE_COMMIT_FILES_REGEX_YAML_LITERAL = (
        r"^\\.agents/(decisions\\.jsonl|local/[^/]+/[^/]+/handoff\\.md)$"
    )
    # What `re.compile()` sees after the YAML parser un-escapes one layer.
    PRE_COMMIT_FILES_REGEX = r"^\.agents/(decisions\.jsonl|local/[^/]+/[^/]+/handoff\.md)$"

    @pytest.fixture
    def regex(self) -> re.Pattern[str]:
        return re.compile(self.PRE_COMMIT_FILES_REGEX)

    def test_yaml_regex_matches_source_of_truth(self) -> None:
        """If the YAML ever changes, this test fails and forces an update.
        The source of truth is `.pre-commit-config.yaml` — the
        file consumers copy. The test file lives at
        `.agents/scripts/` so the yaml is two parents up."""
        yaml_path = Path(__file__).resolve().parents[2] / ".pre-commit-config.yaml"
        if not yaml_path.is_file():
            pytest.skip(".pre-commit-config.yaml not found from this test tree")
        text = yaml_path.read_text(encoding="utf-8")
        # Match the exact `files:` line (no quotes-agnostic matching — if the
        # YAML rewrites the line, the test should notice).
        assert (
            f'files: "{self.PRE_COMMIT_FILES_REGEX_YAML_LITERAL}"' in text
        ), ".pre-commit-config.yaml regex drifted from the unit test constant"

    def test_decisions_jsonl_matches(self, regex: re.Pattern[str]) -> None:
        assert regex.match(".agents/decisions.jsonl")

    def test_pair_handoff_matches(self, regex: re.Pattern[str]) -> None:
        assert regex.match(".agents/local/alice@laptop/claude/handoff.md")
        assert regex.match(".agents/local/bob@workstation/codex/handoff.md")

    def test_bare_handoff_at_legacy_path_does_not_match(
        self, regex: re.Pattern[str]
    ) -> None:
        # v1 path — must not trigger the hook in v2 projects.
        assert regex.match(".agents/agent_log/handoff.md") is None
        # v2 path missing the actor or agent segment.
        assert regex.match(".agents/local/handoff.md") is None
        assert regex.match(".agents/local/alice@laptop/handoff.md") is None

    def test_too_many_segments_does_not_match(self, regex: re.Pattern[str]) -> None:
        # Extra nesting below <agent>/handoff.md — [^/]+ forbids slashes.
        assert (
            regex.match(".agents/local/alice@laptop/claude/sub/handoff.md") is None
        )

    def test_sibling_files_do_not_match(self, regex: re.Pattern[str]) -> None:
        # Common near-miss candidates the hook deliberately ignores.
        for path in [
            ".agents/LESSONS.md",
            ".agents/JOURNAL.md",
            ".agents/AGENTS_MAP.md",
            ".agents/local/alice@laptop/claude/activity.log",
            ".agents/local/alice@laptop/claude/lessons.md",
            ".agents/local/alice@laptop/claude/tasks/TASK.md",
            "decisions.jsonl",  # outside .agents/
        ]:
            assert regex.match(path) is None, f"unexpected match: {path}"
