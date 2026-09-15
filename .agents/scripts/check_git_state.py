# SPDX-License-Identifier: Apache-2.0
"""Opt-in Git working-directory check; independent of validate_state.py."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess


LOGS = (".agents/decisions.jsonl", ".agents/JOURNAL.md", ".agents/LESSONS.md")


def check_git_state(directory: Path, default_branch: str | None = None) -> tuple[int, str]:
    """Return 0 for clean/skipped, 1 for pending logs, 2 for inspection errors.

    Calling this function opts into the git-substrate check. No configuration,
    index, refs or working files are written; no network commands are run.
    """
    executable = shutil.which("git")
    if executable is None:
        return 0, "SKIP: Git is unavailable; no Git working-directory check performed."
    env = {**os.environ, "LC_ALL": "C", "LANG": "C"}

    def git(*args: str) -> subprocess.CompletedProcess[bytes]:
        return subprocess.run(
            [executable, "--no-optional-locks", "-C", str(directory), *args],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, check=False,
        )

    try:
        root = git("rev-parse", "--show-toplevel")
        if root.returncode:
            error = root.stderr.decode("utf-8", errors="replace").strip()
            if "not a git repository" in error:
                return 0, "SKIP: directory is outside a Git working tree."
            return 2, f"ERROR: cannot inspect Git working tree: {error}"
        directory = Path(os.fsdecode(root.stdout.rstrip(b"\r\n")))
        branch = git("symbolic-ref", "--quiet", "HEAD")
        if branch.returncode == 1:
            return 0, "SKIP: detached HEAD; check the actual default-branch working directory."
        if branch.returncode:
            return 2, "ERROR: cannot determine the current branch."
        branch_ref = branch.stdout.rstrip(b"\r\n")
        if not branch_ref.startswith(b"refs/heads/"):
            return 2, "ERROR: HEAD does not name a local branch."
        current = os.fsdecode(branch_ref[len(b"refs/heads/"):])
        if default_branch is None:
            remote = git("symbolic-ref", "--quiet", "refs/remotes/origin/HEAD")
            prefix = b"refs/remotes/origin/"
            target = remote.stdout.rstrip(b"\r\n")
            if remote.returncode or not target.startswith(prefix):
                return 2, "ERROR: default branch unknown; pass --default-branch NAME or configure origin/HEAD."
            default_branch = os.fsdecode(target[len(prefix):])
        valid = git("check-ref-format", f"refs/heads/{default_branch}")
        if not default_branch or valid.returncode:
            return 2, "ERROR: --default-branch must be a valid branch name."
        if current != default_branch:
            return 0, f"SKIP: branch {current!r} is not default branch {default_branch!r}."
        status = git(
            "status", "--porcelain=v1", "-z", "--untracked-files=all",
            "--ignored=matching", "--", *LOGS,
        )
        if status.returncode:
            return 2, "ERROR: cannot read the working tree/index status."
        if status.stdout:
            return 1, (
                f"FAIL: uncommitted append-only state on default branch {default_branch!r}. "
                "Staged, unstaged, deleted, untracked or ignored logs need reconciliation.\n"
                "Inspect: git status --short --ignored -- " + " ".join(LOGS)
            )
        return 0, f"OK: no uncommitted append-only state on default branch {default_branch!r}."
    except OSError as error:
        return 2, f"ERROR: Git inspection failed: {error}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd(), help="Directory inside the Git working tree.")
    parser.add_argument("--default-branch", help="Authoritative default branch; otherwise use local origin/HEAD.")
    args = parser.parse_args()
    code, message = check_git_state(args.repo, args.default_branch)
    print(message)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
