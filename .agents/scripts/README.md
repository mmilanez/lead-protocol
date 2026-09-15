# scripts/ — Lead Protocol framework scripts

This directory holds two categories of files. The distinction matters when deciding what to keep, delete, or copy on upgrade.

## Framework (keep on every project)

Part of the Lead Protocol framework. Copied verbatim on every `§M-meta-6` promotion. Do not hand-edit inside a consumer repo — edits happen in the template.

| File | Purpose |
|---|---|
| `validate_state.py` | Validates `.agents/local/<actor>/<agent>/handoff.md` and `.agents/decisions.jsonl` against the JSON Schemas in `.agents/schemas/`. Invoked manually (`python .agents/scripts/validate_state.py`), from a pre-commit hook, or from CI. |
| `migrate_to_v2.py` | One-time migration tool for consumer projects upgrading from v1.x to v2.0.0. Moves `agent_log/*` into the new three-layer layout, converts `decisions.json` (array) to `decisions.jsonl` (one object per line), and promotes `checkpoints/` and `sessions/` to the project level. |
| `conftest.py` | Pytest configuration for the validator test suite. |
| `test_validate_state.py` | Unit tests for the validator. Run with `pytest .agents/scripts/ -v`. |

## Distribution (opt-in, safe to delete)

Packaging conveniences for projects that adopt a specific external ecosystem. Not part of the framework — the kernel and active modules work the same way without them.

| File | Ecosystem | Safe to delete if… |
|---|---|---|
| `.pre-commit-hooks.yaml` | [pre-commit.com](https://pre-commit.com) | You are not publishing this repo as a reusable pre-commit hook source. |
| `check_git_state.py` | Git (`git-substrate`, explicit opt-in) | You do not need a local check for uncommitted append-only logs on the default branch. |

### Optional Git working-directory check

Run at session close in the working tree whose state you need to inspect:

```text
python .agents/scripts/check_git_state.py --default-branch main
```

Replace `main` with the project's actual default branch. Omit the option only
when the local `refs/remotes/origin/HEAD` names the correct default; this check
does not fetch or refresh that reference. `--repo PATH` accepts any directory
inside the target working tree and inspects that tree's root `.agents/` logs.
Invocation opts into this Git-specific check; it does not parse active modules
or change the generic `validate_state.py` contract.

- **Exit 0, `OK`:** default-branch append-only logs are committed.
- **Exit 0, `SKIP`:** Git is unavailable, the directory is not a Git repository,
  or HEAD is detached/on another branch. A skip is not proof of clean main.
- **Exit 1, `FAIL`:** `decisions.jsonl`, `JOURNAL.md` or `LESSONS.md` has staged,
  unstaged, deleted, untracked or ignored state on the default branch.
- **Exit 2, `ERROR`:** the default branch is unknown/invalid or Git inspection
  failed. Configure the branch explicitly and resolve errors before retrying.

The checker is read-only and local. It does not commit, stash, alter Git
attributes or fetch. Reconcile pending work through the project's normal
branch/PR policy. It excludes the mutable session registry, per-pair logs and
rules. It detects pending changes, not whether those changes are valid appends;
run `validate_state.py` separately for portable structural validation.

An existing **pre-push** hook may invoke the same command if desired. Preserve
the hook's other checks and propagate nonzero exit codes. Do not use this as a
pre-commit check: staged logs are deliberately considered uncommitted, so it
would reject the commit intended to record them. CI can exercise the checker
tests, but a fresh CI checkout cannot detect uncommitted files left on another
machine; detached CI checkouts explicitly skip this working-directory check.

See [the v2.x adoption addendum](https://github.com/mmilanez/lead-protocol/blob/v2.5.0/docs/MIGRATION-v2.md#v2x-adoption-addendum-append-only-state)
for existing-project adoption and the limitations of union merging.

See `.agents/modules/git-substrate.md` → *"Optional tooling that ships with the template"* for the full list of opt-in tooling that ships with the template and when to keep or drop each file.
