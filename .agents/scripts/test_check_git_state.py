# SPDX-License-Identifier: Apache-2.0
"""Exercise the optional checker against real Git index/working-tree states."""

from pathlib import Path
import os
import shutil
import subprocess
import sys

import pytest

import check_git_state as checker


def git(repo, *args):
    return subprocess.run(
        ["git", "-C", str(repo), *args], check=True,
        capture_output=True, text=True,
    ).stdout.strip()


@pytest.fixture
def repo(tmp_path):
    if not shutil.which("git"):
        pytest.skip("Real Git integration tests require Git")
    git(tmp_path, "init", "--initial-branch=trunk")
    git(tmp_path, "config", "user.email", "fixture@example.invalid")
    git(tmp_path, "config", "user.name", "Test Fixture")
    git(tmp_path, "config", "commit.gpgsign", "false")
    git(tmp_path, "config", "core.autocrlf", "false")
    for relative in checker.LOGS:
        log = tmp_path / relative
        log.parent.mkdir(exist_ok=True)
        log.write_text("", encoding="utf-8")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-m", "Fixture baseline")
    return tmp_path


def test_clean_custom_default_from_nested_directory(repo):
    assert checker.check_git_state(repo / ".agents", "trunk")[0] == 0
    assert checker.check_git_state(repo, "trunk")[1].startswith("OK:")


@pytest.mark.parametrize("relative", checker.LOGS)
@pytest.mark.parametrize("state", ["unstaged", "staged", "both", "deleted", "staged-delete", "untracked", "ignored", "rename-out"])
def test_pending_logs_fail(repo, relative, state):
    log = repo / relative
    if state in ("untracked", "ignored"):
        git(repo, "rm", relative)
        git(repo, "commit", "-m", "Remove fixture log")
        if state == "ignored":
            (repo / ".gitignore").write_text(relative + "\n", encoding="utf-8")
        log.write_text("new log\n", encoding="utf-8")
    elif state in ("deleted", "staged-delete"):
        log.unlink()
        if state == "staged-delete":
            git(repo, "add", relative)
    elif state == "rename-out":
        git(repo, "mv", relative, "moved-log")
    else:
        log.write_text("appended\n", encoding="utf-8")
        if state in ("staged", "both"):
            git(repo, "add", relative)
        if state == "both":
            log.write_text("appended\nanother append\n", encoding="utf-8")
    before = git(repo, "status", "--porcelain=v1", "--ignored")
    assert checker.check_git_state(repo, "trunk")[0] == 1
    assert git(repo, "status", "--porcelain=v1", "--ignored") == before


def test_other_state_is_outside_scope(repo):
    for relative in (".agents/sessions/active_sessions.md", ".agents/local/me/codex/activity.log", ".agents/PROJECT_RULES.md", "other.txt"):
        target = repo / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("uncommitted\n", encoding="utf-8")
    assert checker.check_git_state(repo, "trunk")[0] == 0


def test_non_default_and_detached_skip_dirty_logs(repo):
    git(repo, "switch", "-c", "codex/feature")
    (repo / checker.LOGS[0]).write_text("pending\n", encoding="utf-8")
    code, message = checker.check_git_state(repo, "trunk")
    assert code == 0 and message.startswith("SKIP:")
    git(repo, "checkout", "--detach")
    code, message = checker.check_git_state(repo, "trunk")
    assert code == 0 and "detached HEAD" in message


def test_remote_default_and_explicit_override(repo):
    git(repo, "update-ref", "refs/remotes/origin/trunk", "HEAD")
    git(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk")
    (repo / checker.LOGS[0]).write_text("pending\n", encoding="utf-8")
    assert checker.check_git_state(repo)[0] == 1
    assert checker.check_git_state(repo, "another-default")[0] == 0


def test_same_name_tag_does_not_hide_dirty_default_branch(repo):
    git(repo, "tag", "trunk")
    (repo / checker.LOGS[0]).write_text("pending\n", encoding="utf-8")
    assert checker.check_git_state(repo, "trunk")[0] == 1


def test_unknown_or_invalid_default_is_an_error(repo):
    code, message = checker.check_git_state(repo)
    assert code == 2 and "--default-branch" in message
    for branch in ("", "bad name", "refs/heads/../main"):
        assert checker.check_git_state(repo, branch)[0] == 2


def test_unborn_default_detects_untracked_log(tmp_path):
    if not shutil.which("git"):
        pytest.skip("Git unavailable")
    git(tmp_path, "init", "--initial-branch=trunk")
    log = tmp_path / checker.LOGS[0]
    log.parent.mkdir()
    log.write_text("new log\n", encoding="utf-8")
    assert checker.check_git_state(tmp_path, "trunk")[0] == 1


def test_no_git_repository_and_missing_directory(tmp_path):
    code, message = checker.check_git_state(tmp_path, "main")
    assert code == 0 and message.startswith("SKIP:")
    if shutil.which("git"):
        assert checker.check_git_state(tmp_path / "missing", "main")[0] == 2


def test_git_unavailable_skips(monkeypatch, tmp_path):
    monkeypatch.setattr(checker.shutil, "which", lambda name: None)
    assert checker.check_git_state(tmp_path) == (0, "SKIP: Git is unavailable; no Git working-directory check performed.")


def test_git_execution_error_is_not_clean(monkeypatch, tmp_path):
    monkeypatch.setattr(checker.shutil, "which", lambda name: "git")
    def unavailable(*args, **kwargs):
        raise OSError("execution denied")
    monkeypatch.setattr(checker.subprocess, "run", unavailable)
    assert checker.check_git_state(tmp_path)[0] == 2


def test_generic_validator_runs_without_git(tmp_path):
    # Execute the real generic CLI with no Git in PATH, both valid and invalid.
    scripts = Path(__file__).resolve().parent
    state = tmp_path / "decisions.jsonl"
    env = {**os.environ, "PATH": ""}
    for content, expected in (("", 0), ("not json\n", 1)):
        state.write_text(content, encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(scripts / "validate_state.py"), "--schemas-dir", str(scripts.parent / "schemas"), str(state)],
            env=env, capture_output=True,
        )
        assert result.returncode == expected, result.stderr


def test_checker_cli_returns_failure_for_staged_logs(repo):
    (repo / checker.LOGS[0]).write_text("pending\n", encoding="utf-8")
    git(repo, "add", checker.LOGS[0])
    result = subprocess.run(
        [sys.executable, checker.__file__, "--repo", str(repo), "--default-branch", "trunk"],
        capture_output=True, text=True,
    )
    assert result.returncode == 1 and "FAIL:" in result.stdout
