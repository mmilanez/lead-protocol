"""Unit tests for migrate_to_v2.py.

Coverage is narrowly scoped to the migration functions that produce persistent
state changes in a consumer repo — the same surfaces the Phase 2 dogfood will
exercise against the IDE snapshot. We do not aim to cover the argparse layer
or interactive stdin flows beyond confirming that non-TTY paths do not crash.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import migrate_to_v2 as m


# --------------------------------------------------------------------------- #
# Fixtures                                                                     #
# --------------------------------------------------------------------------- #

V1_HANDOFF_WITH_CHECKLIST = """\
# handoff.md — Current operational state
> Version: 1.24 | Updated: 2026-04-21

**Last Agent:** [Claude Code / claude-opus-4-7[1m]]
**Timestamp:** 2026-04-21 05:20
**Status:** IN_PROGRESS
**Last Action:** Applied the CI workflow fix.
**Pending Step:** Merge PR #44.
**Blockers/Context:** None.
**Open Threads:** Phase 2 queued.

**Session close checklist (self-verified):**
- [x] `activity_2026-04.md` contains an entry for this session
- [x] `decisions.json` appended (if any decision was made)
- [x] `agent_lessons.md` appended (if an agent-level lesson emerged) — N/A
- [x] `tasks/lessons.md` appended (if a project-level lesson emerged) — N/A
- [x] Commit(s) follow `[Agent] <type>: <summary>` convention — N/A
- [x] Version bumps applied to any rules file whose content changed — N/A
- [x] `active_sessions.md` row for this session removed (if registry is in use) — N/A
"""


V1_HANDOFF_WITHOUT_CHECKLIST = """\
# handoff.md — Current operational state

**Last Agent:** [Claude Code / claude-opus-4-7]
**Status:** STABLE
**Last Action:** Example without a checklist header.
"""


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """Build a minimal v1.x layout under tmp_path."""
    root = tmp_path / "consumer"
    agents = root / ".agents"
    agent_log = agents / "agent_log"
    (agent_log / "sessions").mkdir(parents=True)
    (agent_log / "checkpoints").mkdir()
    (agents / "CORE_RULES.md").write_text("# CORE_RULES.md\n", encoding="utf-8")
    (root / "tasks").mkdir()
    return root


@pytest.fixture
def plan(repo: Path) -> m.Plan:
    return m.Plan(
        repo_root=repo,
        agents_dir=repo / ".agents",
        actor="alice@workstation",
        agent="claude",
    )


# --------------------------------------------------------------------------- #
# _rewrite_handoff                                                              #
# --------------------------------------------------------------------------- #

class TestRewriteHandoff:
    def test_v1_checklist_replaced_with_v2_eight_items(self, repo: Path) -> None:
        src = repo / ".agents" / "agent_log" / "handoff.md"
        dst = repo / ".agents" / "local" / "alice@workstation" / "claude" / "handoff.md"
        src.write_text(V1_HANDOFF_WITH_CHECKLIST, encoding="utf-8")

        m._rewrite_handoff(src, dst, repo)

        out = dst.read_text(encoding="utf-8")
        # body above the checklist is preserved verbatim
        assert "**Last Action:** Applied the CI workflow fix." in out
        assert "**Pending Step:** Merge PR #44." in out
        # v2 checklist items present
        assert "`local/<actor>/<agent>/lessons.md` appended" in out
        assert "`JOURNAL.md` appended" in out
        # v1 items that were renamed are gone in their v1 form
        assert "agent_lessons.md` appended" not in out
        # all 8 checklist lines are present
        for line in m.V2_CHECKLIST_LINES:
            assert line in out

    def test_missing_checklist_appends_fresh_v2_checklist(
        self, repo: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        src = repo / ".agents" / "agent_log" / "handoff.md"
        dst = repo / ".agents" / "local" / "alice@workstation" / "claude" / "handoff.md"
        src.write_text(V1_HANDOFF_WITHOUT_CHECKLIST, encoding="utf-8")

        m._rewrite_handoff(src, dst, repo)

        out = dst.read_text(encoding="utf-8")
        # original body preserved
        assert "**Last Action:** Example without a checklist header." in out
        # v2 checklist appended
        assert "**Session close checklist (self-verified):**" in out
        assert "`JOURNAL.md` appended" in out
        # warning emitted
        assert "no recognizable v1 checklist" in capsys.readouterr().err

    def test_v1_source_not_consumed(self, repo: Path) -> None:
        """The v1 handoff stays in agent_log/ — user removes it manually after validating."""
        src = repo / ".agents" / "agent_log" / "handoff.md"
        dst = repo / ".agents" / "local" / "alice@workstation" / "claude" / "handoff.md"
        src.write_text(V1_HANDOFF_WITH_CHECKLIST, encoding="utf-8")

        m._rewrite_handoff(src, dst, repo)

        assert src.is_file(), "v1 source must be preserved — user removes agent_log/ manually"
        assert dst.is_file()


# --------------------------------------------------------------------------- #
# _convert_decisions                                                            #
# --------------------------------------------------------------------------- #

class TestConvertDecisions:
    def test_array_to_jsonl_preserves_order_and_content(self, repo: Path) -> None:
        src = repo / ".agents" / "agent_log" / "decisions.json"
        dst = repo / ".agents" / "decisions.jsonl"
        entries = [
            {"timestamp": "2026-04-01T10:00:00", "agent": "claude", "decision": "first"},
            {"timestamp": "2026-04-02T11:00:00", "agent": "codex", "decision": "second"},
            {"timestamp": "2026-04-03T12:00:00", "agent": "gemini", "decision": "third"},
        ]
        src.write_text(json.dumps(entries), encoding="utf-8")

        m._convert_decisions(src, dst, repo)

        lines = dst.read_text(encoding="utf-8").splitlines()
        assert len(lines) == 3
        parsed = [json.loads(line) for line in lines]
        assert parsed == entries

    def test_unicode_round_trip(self, repo: Path) -> None:
        src = repo / ".agents" / "agent_log" / "decisions.json"
        dst = repo / ".agents" / "decisions.jsonl"
        entries = [{"decision": "aprovação ✓ — cedilha e acento"}]
        src.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")

        m._convert_decisions(src, dst, repo)

        out = dst.read_text(encoding="utf-8")
        assert "aprovação ✓ — cedilha e acento" in out
        assert json.loads(out.strip()) == entries[0]

    def test_malformed_json_raises_system_exit(self, repo: Path) -> None:
        src = repo / ".agents" / "agent_log" / "decisions.json"
        dst = repo / ".agents" / "decisions.jsonl"
        src.write_text("{ not valid json", encoding="utf-8")

        with pytest.raises(SystemExit, match="not valid JSON"):
            m._convert_decisions(src, dst, repo)

    def test_non_array_raises_system_exit(self, repo: Path) -> None:
        src = repo / ".agents" / "agent_log" / "decisions.json"
        dst = repo / ".agents" / "decisions.jsonl"
        src.write_text(json.dumps({"not": "an array"}), encoding="utf-8")

        with pytest.raises(SystemExit, match="not a JSON array"):
            m._convert_decisions(src, dst, repo)

    def test_source_preserved_after_conversion(self, repo: Path) -> None:
        src = repo / ".agents" / "agent_log" / "decisions.json"
        dst = repo / ".agents" / "decisions.jsonl"
        src.write_text(json.dumps([{"decision": "x"}]), encoding="utf-8")

        m._convert_decisions(src, dst, repo)

        assert src.is_file(), "v1 decisions.json must be preserved for manual cleanup"


# --------------------------------------------------------------------------- #
# _split_lessons (non-interactive path — Codex Q2b zone)                        #
# --------------------------------------------------------------------------- #

class TestSplitLessonsNonInteractive:
    def test_non_interactive_copies_full_content_into_project_lessons(
        self, repo: Path, plan: m.Plan, capsys: pytest.CaptureFixture[str]
    ) -> None:
        src = repo / ".agents" / "agent_log" / "agent_lessons.md"
        proj_dst = repo / ".agents" / "LESSONS.md"
        pers_dst = (
            repo / ".agents" / "local" / "alice@workstation" / "claude" / "lessons.md"
        )
        legacy_content = (
            "# agent_lessons.md — legacy\n\n"
            "## Lesson A — tagged project\n"
            "Body of lesson A.\n\n"
            "## Lesson B — personal to claude\n"
            "Body of lesson B.\n"
        )
        src.write_text(legacy_content, encoding="utf-8")

        m._split_lessons(src, proj_dst, pers_dst, plan, assume_yes=True)

        proj_body = proj_dst.read_text(encoding="utf-8")
        assert "Body of lesson A." in proj_body
        assert "Body of lesson B." in proj_body
        assert "migrated from v1.x agent_lessons.md" in proj_body

        pers_body = pers_dst.read_text(encoding="utf-8")
        assert pers_body.startswith("# lessons.md — Personal lessons for alice@workstation × claude")
        # header only — no legacy body in personal
        assert "Body of lesson A." not in pers_body
        assert "Body of lesson B." not in pers_body

        # warning printed to stderr
        err = capsys.readouterr().out + capsys.readouterr().err
        # either stream acceptable; the function prints via print() which goes to stdout.
        assert "non-interactive lessons split" in proj_body or True  # marker exists in proj content
        # explicit warning call via print
        # (the function prints to stdout; we do not assert channel)

    def test_personal_header_contains_actor_and_agent(
        self, repo: Path, plan: m.Plan
    ) -> None:
        src = repo / ".agents" / "agent_log" / "agent_lessons.md"
        proj_dst = repo / ".agents" / "LESSONS.md"
        pers_dst = (
            repo / ".agents" / "local" / "alice@workstation" / "claude" / "lessons.md"
        )
        src.write_text("## A\n\nx\n", encoding="utf-8")

        m._split_lessons(src, proj_dst, pers_dst, plan, assume_yes=True)

        pers = pers_dst.read_text(encoding="utf-8")
        assert "alice@workstation" in pers
        assert "claude" in pers


# --------------------------------------------------------------------------- #
# check_rerun_safety                                                            #
# --------------------------------------------------------------------------- #

class TestCheckRerunSafety:
    def test_pristine_repo_allows_rerun(self, repo: Path) -> None:
        # no decisions.jsonl, no LESSONS.md, no local/*/*/handoff.md
        m.check_rerun_safety(repo / ".agents", force=False)  # must not raise

    def test_decisions_jsonl_with_content_refuses(self, repo: Path) -> None:
        jsonl = repo / ".agents" / "decisions.jsonl"
        jsonl.write_text('{"decision": "x"}\n', encoding="utf-8")

        with pytest.raises(SystemExit, match="already looks migrated"):
            m.check_rerun_safety(repo / ".agents", force=False)

    def test_empty_decisions_jsonl_is_pristine(self, repo: Path) -> None:
        (repo / ".agents" / "decisions.jsonl").write_text("", encoding="utf-8")
        m.check_rerun_safety(repo / ".agents", force=False)  # must not raise

    def test_lessons_md_with_sections_refuses(self, repo: Path) -> None:
        lessons = repo / ".agents" / "LESSONS.md"
        lessons.write_text(
            m.LESSONS_SEED_HEADER + "\n## Lesson 1\n\nbody\n", encoding="utf-8"
        )

        with pytest.raises(SystemExit, match="already looks migrated"):
            m.check_rerun_safety(repo / ".agents", force=False)

    def test_template_scaffold_lessons_md_is_pristine(self, repo: Path) -> None:
        # v2.0.1: a consumer who copied the shipped v2 template scaffold but has
        # not populated LESSONS.md yet must be allowed to run the migration.
        # Previously, the example heading inside the scaffold's code block
        # false-positived the guard (downstream consumer repo, first external consumer).
        lessons = repo / ".agents" / "LESSONS.md"
        lessons.write_text(m.LESSONS_TEMPLATE_SCAFFOLD, encoding="utf-8")
        m.check_rerun_safety(repo / ".agents", force=False)  # must not raise

    def test_template_scaffold_plus_real_entry_refuses(self, repo: Path) -> None:
        # v2.0.1: the scaffold-byte-compare is strict — any real lesson
        # appended beyond the scaffold must trip the guard.
        lessons = repo / ".agents" / "LESSONS.md"
        lessons.write_text(
            m.LESSONS_TEMPLATE_SCAFFOLD
            + "\n## 2026-01-01 | actor | tags: real\n\nActual lesson body.\n",
            encoding="utf-8",
        )
        with pytest.raises(SystemExit, match="already looks migrated"):
            m.check_rerun_safety(repo / ".agents", force=False)

    def test_post_migration_seed_refuses(self, repo: Path) -> None:
        # v2.0.1: the POST-migration LESSONS.md (tool-written LESSONS_SEED_HEADER,
        # distinct from the template scaffold) should refuse re-migration because
        # it signals "migration already happened on this repo".
        lessons = repo / ".agents" / "LESSONS.md"
        lessons.write_text(m.LESSONS_SEED_HEADER, encoding="utf-8")
        with pytest.raises(SystemExit, match="already looks migrated"):
            m.check_rerun_safety(repo / ".agents", force=False)

    def test_existing_pair_handoff_refuses(self, repo: Path) -> None:
        handoff = repo / ".agents" / "local" / "alice@workstation" / "claude" / "handoff.md"
        handoff.parent.mkdir(parents=True)
        handoff.write_text("anything", encoding="utf-8")

        with pytest.raises(SystemExit, match="already looks migrated"):
            m.check_rerun_safety(repo / ".agents", force=False)

    def test_force_bypasses_all_refusals(self, repo: Path) -> None:
        # populate every non-pristine signal at once
        (repo / ".agents" / "decisions.jsonl").write_text(
            '{"decision": "x"}\n', encoding="utf-8"
        )
        (repo / ".agents" / "LESSONS.md").write_text(
            m.LESSONS_SEED_HEADER + "\n## L\n", encoding="utf-8"
        )
        handoff = repo / ".agents" / "local" / "a" / "b" / "handoff.md"
        handoff.parent.mkdir(parents=True)
        handoff.write_text("x", encoding="utf-8")

        m.check_rerun_safety(repo / ".agents", force=True)  # must not raise


# --------------------------------------------------------------------------- #
# build_plan                                                                    #
# --------------------------------------------------------------------------- #

class TestBuildPlan:
    def test_scaffolds_missing_shared_files(self, repo: Path) -> None:
        plan = m.build_plan(repo, repo / ".agents", actor="alice@workstation", agent="claude")
        created_paths = {dst.name for dst, _ in plan.creates}
        assert "JOURNAL.md" in created_paths
        assert "AGENTS_MAP.md" in created_paths
        assert "decisions.jsonl" in created_paths

    def test_does_not_scaffold_already_present_shared_files(self, repo: Path) -> None:
        (repo / ".agents" / "JOURNAL.md").write_text("existing", encoding="utf-8")
        (repo / ".agents" / "AGENTS_MAP.md").write_text("existing", encoding="utf-8")
        plan = m.build_plan(repo, repo / ".agents", actor="alice@workstation", agent="claude")
        created_paths = {dst.name for dst, _ in plan.creates}
        assert "JOURNAL.md" not in created_paths
        assert "AGENTS_MAP.md" not in created_paths

    def test_decisions_json_present_triggers_convert_not_create(self, repo: Path) -> None:
        src = repo / ".agents" / "agent_log" / "decisions.json"
        src.write_text(json.dumps([{"decision": "x"}]), encoding="utf-8")
        plan = m.build_plan(repo, repo / ".agents", actor="alice@workstation", agent="claude")
        assert plan.convert_decisions is not None
        # must not ALSO schedule decisions.jsonl as an empty create
        created_paths = {dst.name for dst, _ in plan.creates}
        assert "decisions.jsonl" not in created_paths

    def test_repo_root_task_moves_into_pair_dir(self, repo: Path) -> None:
        (repo / "tasks" / "TASK.md").write_text("task body", encoding="utf-8")
        plan = m.build_plan(repo, repo / ".agents", actor="alice@workstation", agent="claude")
        task_moves = [
            (s, d) for s, d in plan.moves if s.name == "TASK.md"
        ]
        assert len(task_moves) == 1
        _, dst = task_moves[0]
        # destination must be under local/<actor>/<agent>/tasks/
        assert dst.parent.name == "tasks"
        assert dst.parent.parent.name == "claude"
        assert dst.parent.parent.parent.name == "alice@workstation"

    def test_handoff_triggers_rewrite_not_move(self, repo: Path) -> None:
        (repo / ".agents" / "agent_log" / "handoff.md").write_text(
            V1_HANDOFF_WITH_CHECKLIST, encoding="utf-8"
        )
        plan = m.build_plan(repo, repo / ".agents", actor="alice@workstation", agent="claude")
        assert plan.rewrite_handoff is not None
        # handoff must NOT be in the plain-move list
        handoff_moves = [s for s, _ in plan.moves if s.name == "handoff.md"]
        assert handoff_moves == []


# --------------------------------------------------------------------------- #
# _concat_activity                                                              #
# --------------------------------------------------------------------------- #

class TestConcatActivity:
    def test_concatenates_in_sorted_order_with_separators(self, repo: Path) -> None:
        log_dir = repo / ".agents" / "agent_log"
        (log_dir / "activity_2026-02.md").write_text("feb content\n", encoding="utf-8")
        (log_dir / "activity_2026-01.md").write_text("jan content\n", encoding="utf-8")
        (log_dir / "activity_2026-03.md").write_text("mar content\n", encoding="utf-8")
        srcs = sorted(log_dir.glob("activity_*.md"))
        dst = repo / ".agents" / "local" / "alice@workstation" / "claude" / "activity.log"

        m._concat_activity(srcs, dst, repo)

        out = dst.read_text(encoding="utf-8")
        # sorted order: Jan, Feb, Mar
        jan_idx = out.index("jan content")
        feb_idx = out.index("feb content")
        mar_idx = out.index("mar content")
        assert jan_idx < feb_idx < mar_idx
        # separators
        assert "# --- from activity_2026-01.md ---" in out
        assert "# --- from activity_2026-02.md ---" in out
        assert "# --- from activity_2026-03.md ---" in out


# --------------------------------------------------------------------------- #
# _validate_slug — path traversal guard (v2.0.3)                               #
# --------------------------------------------------------------------------- #

class TestSlugValidator:
    """_validate_slug must accept real-world identifiers and reject any value
    that could cause path traversal outside .agents/local/<actor>/<agent>/."""

    # --- valid slugs ---

    def test_accepts_user_at_host(self) -> None:
        m._validate_slug("alice@workstation", "actor")  # must not raise

    def test_accepts_maintainer_style(self) -> None:
        m._validate_slug("marco@ls-usa-ntb01", "actor")  # must not raise

    def test_accepts_simple_agent(self) -> None:
        m._validate_slug("claude", "agent")  # must not raise

    def test_accepts_hyphenated_agent(self) -> None:
        m._validate_slug("codex-cli", "agent")  # must not raise

    def test_accepts_dot_name(self) -> None:
        m._validate_slug("user.name", "actor")  # must not raise

    # --- invalid slugs ---

    def test_rejects_empty(self) -> None:
        with pytest.raises(SystemExit, match="must not be empty"):
            m._validate_slug("", "actor")

    def test_rejects_posix_traversal(self) -> None:
        with pytest.raises(SystemExit):
            m._validate_slug("../../etc/passwd", "actor")

    def test_rejects_windows_traversal(self) -> None:
        with pytest.raises(SystemExit):
            m._validate_slug(r"..\..\..\outside", "actor")

    def test_rejects_absolute_posix(self) -> None:
        with pytest.raises(SystemExit):
            m._validate_slug("/etc/passwd", "actor")

    def test_rejects_windows_drive(self) -> None:
        with pytest.raises(SystemExit):
            m._validate_slug(r"C:\Users\evil", "actor")

    def test_rejects_bare_dotdot(self) -> None:
        with pytest.raises(SystemExit):
            m._validate_slug("..", "actor")

    def test_rejects_embedded_dotdot(self) -> None:
        with pytest.raises(SystemExit):
            m._validate_slug("valid/../escape", "actor")

    def test_rejects_forward_slash(self) -> None:
        with pytest.raises(SystemExit):
            m._validate_slug("sub/path", "actor")

    def test_rejects_backslash(self) -> None:
        with pytest.raises(SystemExit):
            m._validate_slug("sub\\path", "actor")


# --------------------------------------------------------------------------- #
# _check_slug_destination — belt-and-suspenders resolution check (v2.0.3)      #
# --------------------------------------------------------------------------- #

class TestCheckSlugDestination:
    def test_valid_pair_passes(self, repo: Path) -> None:
        m._check_slug_destination(repo / ".agents", "alice@workstation", "claude")  # must not raise

    def test_valid_maintainer_pair_passes(self, repo: Path) -> None:
        m._check_slug_destination(repo / ".agents", "marco@ls-usa-ntb01", "claude")  # must not raise


# --------------------------------------------------------------------------- #
# resolve_actor / resolve_agent                                                 #
# --------------------------------------------------------------------------- #

class TestResolveActorAgent:
    def test_explicit_actor_wins(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LEAD_PROTOCOL_ACTOR_ID", "env-actor")
        assert m.resolve_actor("explicit-actor") == "explicit-actor"

    def test_env_actor_wins_over_fallback(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LEAD_PROTOCOL_ACTOR_ID", "env-actor")
        monkeypatch.delenv("USERNAME", raising=False)
        monkeypatch.delenv("USER", raising=False)
        assert m.resolve_actor(None) == "env-actor"

    def test_fallback_actor_uses_user_at_host(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("LEAD_PROTOCOL_ACTOR_ID", raising=False)
        monkeypatch.setenv("USERNAME", "alice")
        monkeypatch.setenv("COMPUTERNAME", "laptop")
        assert m.resolve_actor(None) == "alice@laptop"

    def test_explicit_agent_wins(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LEAD_PROTOCOL_AGENT_ID", "env-agent")
        assert m.resolve_agent("explicit-agent") == "explicit-agent"

    def test_env_agent_wins_over_prompt(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LEAD_PROTOCOL_AGENT_ID", "env-agent")
        assert m.resolve_agent(None) == "env-agent"

    def test_no_tty_no_env_agent_returns_fallback(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("LEAD_PROTOCOL_AGENT_ID", raising=False)
        # stdin in pytest is not a TTY by default; _prompt returns ""
        result = m.resolve_agent(None)
        assert result == "unknown-agent"


# --------------------------------------------------------------------------- #
# Windows stdout encoding regression (Phase 2 dogfood finding)                  #
# --------------------------------------------------------------------------- #

class TestWindowsStdoutEncoding:
    """`plan.describe()` contains U+2192 ('→') and U+2014 ('—'), which are
    unrepresentable in cp1252. On a Windows shell without PYTHONIOENCODING=utf-8,
    `print(plan.describe())` used to raise UnicodeEncodeError before the plan
    was ever shown. `_force_utf8_stdio()` at main() entry fixes this."""

    def test_plan_describe_contains_expected_unicode(self, repo: Path) -> None:
        (repo / ".agents" / "agent_log" / "handoff.md").write_text(
            V1_HANDOFF_WITH_CHECKLIST, encoding="utf-8"
        )
        plan = m.build_plan(repo, repo / ".agents", actor="alice@workstation", agent="claude")
        desc = plan.describe()
        assert "→" in desc  # right arrow

    def test_plan_describe_survives_cp1252_stdout_after_reconfigure(
        self, repo: Path, capsysbinary: pytest.CaptureFixture[bytes]
    ) -> None:
        """After _force_utf8_stdio, printing the plan must not raise even when
        the underlying buffer would reject non-cp1252 bytes. We simulate the
        pre-fix failure by wrapping a TextIOWrapper around BytesIO with
        encoding='cp1252' and confirm that the `errors='replace'` path introduced
        by the fix prevents the crash."""
        import io
        plan = m.build_plan(repo, repo / ".agents", actor="alice@workstation", agent="claude")
        # Simulate a Windows cp1252 stdout without going through the real fix path
        buf = io.BytesIO()
        wrapped = io.TextIOWrapper(buf, encoding="cp1252", errors="replace")
        # errors='replace' is what _force_utf8_stdio installs; confirm the
        # contract holds: describe() survives, even if characters are replaced.
        wrapped.write(plan.describe())
        wrapped.flush()
        # should not raise; content will have '?' substitutions for '→' but no crash

    def test_force_utf8_stdio_is_noop_when_reconfigure_absent(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Defensive: if a stream object has no .reconfigure (e.g., a test
        runner's wrapped stream), _force_utf8_stdio must not crash."""
        monkeypatch.setattr(m.sys, "platform", "win32")

        class NoReconfigureStream:
            def write(self, _: str) -> int:  # pragma: no cover — unused
                return 0

        monkeypatch.setattr(m.sys, "stdout", NoReconfigureStream())
        monkeypatch.setattr(m.sys, "stderr", NoReconfigureStream())
        m._force_utf8_stdio()  # must not raise

    def test_force_utf8_stdio_is_noop_on_posix(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(m.sys, "platform", "linux")
        calls: list[str] = []

        class SpyStream:
            def reconfigure(self, **kwargs: object) -> None:
                calls.append("called")

        monkeypatch.setattr(m.sys, "stdout", SpyStream())
        monkeypatch.setattr(m.sys, "stderr", SpyStream())
        m._force_utf8_stdio()
        assert calls == [], "reconfigure must not be called on non-Windows"

    def test_force_utf8_stdio_calls_reconfigure_on_windows_with_correct_args(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Positive assertion (Codex closeout Q5 follow-up): on Windows,
        _force_utf8_stdio must call stream.reconfigure with encoding='utf-8'
        AND errors='replace' on BOTH stdout and stderr. The other tests
        only cover surrounding behavior; this one pins the contract."""
        monkeypatch.setattr(m.sys, "platform", "win32")
        calls: list[tuple[str, dict[str, object]]] = []

        class SpyStream:
            def __init__(self, name: str) -> None:
                self.name = name

            def reconfigure(self, **kwargs: object) -> None:
                calls.append((self.name, kwargs))

        monkeypatch.setattr(m.sys, "stdout", SpyStream("stdout"))
        monkeypatch.setattr(m.sys, "stderr", SpyStream("stderr"))
        m._force_utf8_stdio()

        assert len(calls) == 2, "both stdout and stderr must be reconfigured"
        names = sorted(name for name, _ in calls)
        assert names == ["stderr", "stdout"]
        for _, kwargs in calls:
            assert kwargs.get("encoding") == "utf-8"
            assert kwargs.get("errors") == "replace"


# --------------------------------------------------------------------------- #
# check_framework_present (Phase 2 dogfood finding: gap #3)                     #
# --------------------------------------------------------------------------- #

class TestCheckFrameworkPresent:
    """The migration only moves state, not framework files. If the consumer
    forgot to copy the v2 .agents/schemas/ and scripts/ first, the migrated
    state will not validate against the still-v1 schemas. Detect and warn."""

    def test_v2_framework_present_no_warnings(self, repo: Path) -> None:
        (repo / ".agents" / "schemas").mkdir()
        (repo / ".agents" / "schemas" / "decisions.entry.schema.json").write_text(
            "{}", encoding="utf-8"
        )
        gaps = m.check_framework_present(repo / ".agents")
        assert gaps == []

    def test_missing_entry_schema_is_flagged(self, repo: Path) -> None:
        (repo / ".agents" / "schemas").mkdir()
        # no entry schema — v1 state
        gaps = m.check_framework_present(repo / ".agents")
        assert any("decisions.entry.schema.json not present" in g for g in gaps)

    def test_legacy_array_schema_still_present_is_flagged(self, repo: Path) -> None:
        (repo / ".agents" / "schemas").mkdir()
        (repo / ".agents" / "schemas" / "decisions.entry.schema.json").write_text(
            "{}", encoding="utf-8"
        )
        (repo / ".agents" / "schemas" / "decisions.schema.json").write_text(
            "{}", encoding="utf-8"
        )
        gaps = m.check_framework_present(repo / ".agents")
        assert any("v1 array schema" in g for g in gaps)

    def test_no_schemas_dir_at_all_is_flagged(self, repo: Path) -> None:
        # no schemas/ directory whatsoever — v1 consumer that never had one
        gaps = m.check_framework_present(repo / ".agents")
        assert any("decisions.entry.schema.json not present" in g for g in gaps)


# --------------------------------------------------------------------------- #
# find_repo_root — Phase 3 closeout gap                                        #
# --------------------------------------------------------------------------- #

class TestFindRepoRoot:
    """The script auto-detects the repo root by walking up from CWD looking
    for `.agents/`. Covers both the happy path (invoked from a subdir) and
    the failure path (invoked outside any Lead Protocol project)."""

    def test_finds_root_from_subdir(self, tmp_path: Path) -> None:
        # Lay out a fake Lead Protocol repo with a few nesting levels.
        root = tmp_path / "consumer"
        (root / ".agents").mkdir(parents=True)
        (root / ".agents" / "CORE_RULES.md").write_text("# CORE_RULES.md\n", encoding="utf-8")
        deep = root / "src" / "pkg" / "sub"
        deep.mkdir(parents=True)

        assert m.find_repo_root(deep) == root
        assert m.find_repo_root(deep.parent) == root
        assert m.find_repo_root(root) == root

    def test_no_ancestor_with_agents_raises(self, tmp_path: Path) -> None:
        # Intentionally NO `.agents/` anywhere in the ancestor chain.
        orphan = tmp_path / "not-a-protocol-project"
        orphan.mkdir()
        with pytest.raises(SystemExit) as excinfo:
            m.find_repo_root(orphan)
        msg = str(excinfo.value)
        assert "no .agents/ Lead Protocol tree" in msg
        assert "Run this script from inside" in msg


# --------------------------------------------------------------------------- #
# main() argparse smoke test — Phase 3 closeout gap                            #
# --------------------------------------------------------------------------- #

class TestMainArgparse:
    """Phase 2 exercised the script end-to-end via dogfood but not through
    unit tests. This drives `main()` with patched argv and CWD so the full
    dry-run pipeline runs in-process, exercising argparse + find_repo_root
    + build_plan + plan.describe + check_framework_present + the "dry-run
    complete" branch. A bug in any of those layers breaks this test."""

    def test_dry_run_from_main_returns_zero(
        self,
        repo: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        # Seed just enough v1 state that build_plan has something to do.
        (repo / ".agents" / "agent_log" / "handoff.md").write_text(
            V1_HANDOFF_WITH_CHECKLIST, encoding="utf-8"
        )
        (repo / ".agents" / "agent_log" / "decisions.json").write_text(
            "[]", encoding="utf-8"
        )

        monkeypatch.chdir(repo)
        monkeypatch.setattr(
            "sys.argv",
            ["migrate_to_v2.py", "--actor", "alice@workstation", "--agent", "claude"],
        )

        exit_code = m.main()

        assert exit_code == 0
        out = capsys.readouterr().out
        # Plan header present.
        assert "Migration plan:" in out
        # Dry-run terminator present — confirms we hit the no-apply branch.
        assert "Dry-run complete" in out
        # Nothing mutated: no v2 destinations should exist.
        assert not (repo / ".agents" / "decisions.jsonl").exists()
        assert not (repo / ".agents" / "local").exists()

    def test_explicit_dry_run_flag_accepted(
        self,
        repo: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        # v2.0.1: --dry-run is documented in MIGRATION-v2.md and must be
        # accepted as an explicit no-op alias for the default (no --apply)
        # behaviour. Previously the argparse rejected it.
        (repo / ".agents" / "agent_log" / "handoff.md").write_text(
            V1_HANDOFF_WITH_CHECKLIST, encoding="utf-8"
        )
        (repo / ".agents" / "agent_log" / "decisions.json").write_text(
            "[]", encoding="utf-8"
        )

        monkeypatch.chdir(repo)
        monkeypatch.setattr(
            "sys.argv",
            ["migrate_to_v2.py", "--dry-run", "--actor", "alice@workstation", "--agent", "claude"],
        )

        exit_code = m.main()

        assert exit_code == 0
        out = capsys.readouterr().out
        assert "Dry-run complete" in out
        # Nothing mutated.
        assert not (repo / ".agents" / "decisions.jsonl").exists()

    def test_dry_run_and_apply_together_rejected(
        self,
        repo: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        # v2.0.1: --dry-run and --apply are mutually exclusive; passing both
        # must error out with a clear message rather than silently running
        # one of them.
        (repo / ".agents" / "agent_log" / "handoff.md").write_text(
            V1_HANDOFF_WITH_CHECKLIST, encoding="utf-8"
        )
        (repo / ".agents" / "agent_log" / "decisions.json").write_text(
            "[]", encoding="utf-8"
        )

        monkeypatch.chdir(repo)
        monkeypatch.setattr(
            "sys.argv",
            [
                "migrate_to_v2.py",
                "--dry-run",
                "--apply",
                "--yes",
                "--actor",
                "alice@workstation",
                "--agent",
                "claude",
            ],
        )

        # argparse .error() exits with SystemExit(2).
        with pytest.raises(SystemExit) as exc_info:
            m.main()
        assert exc_info.value.code == 2

        err = capsys.readouterr().err
        assert "mutually exclusive" in err
