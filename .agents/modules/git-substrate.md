# modules/git-substrate.md — Git / pull-request substrate rules

> Version: 1.1.0 | Updated: 2026-04-21 | Protocol: Lead Protocol v2.0.0+
> Scope: Opt-in module. Activate via `PROJECT_RULES.md §J8 Active modules: git-substrate`.
> Applies to: repositories hosted on a git platform with pull-request support (GitHub, GitLab, Bitbucket, etc.).

---

This module extends `PROTOCOL_RULES.md` with rules specific to projects whose substrate is git and whose review/approval surface is a pull-request platform. A project that is not on git, or is on git but has no remote, or is on a git remote without PR support, should **not** list this module in `§J8 Active modules`.

## §M-git-1 — Branching (risk-based)

| File type | Branch required? |
|---|---|
| Executable code (`.py`, `.js`, `.ts`, `.html`, `.css`) | Yes |
| Agent configuration (`CORE_RULES.md`, `CLAUDE.md`, `AGENTS.md`, workflow YAML) | Yes |
| Framework files (`PROTOCOL_RULES.md`, `modules/*.md`, `schemas/*`, `scripts/*`) | Yes |
| `AGENTS_MAP.md` (shared, maintainer-managed) | Yes |
| Documentation, logs | No — direct commit allowed |
| Project state files (`JOURNAL.md`, `LESSONS.md`, `decisions.jsonl`, `checkpoints/*`, `sessions/active_sessions.md`) | No — operational project state, direct commit |
| Per-pair state (`local/<actor>/<agent>/*`) | **Never committed** — gitignored per the template `.gitignore` |

Branch names follow the project's convention declared in `PROJECT_RULES.md §J8` (e.g., `claude/<description>` for AI-authored work, `feat/<description>` / `fix/<description>` for human work).

## §M-git-2 — Pull request required

All changes that require branching per §M-git-1 **must use the platform's pull-request workflow**. Direct local merges to the default branch are not allowed for branched work.

Expected flow: `branch → commit → push → PR → merge via platform → delete branch`.

This rule does not apply to:

- Changes with direct commit allowed per §M-git-1 (project state files, docs).
- Repositories without a remote.
- Repositories whose hosting platform does not support pull requests (for those, drop this module from `§J8`).

**Platform branch protection overrides this clause.** When the hosting platform enforces branch protection requiring a pull request for *all* changes to the default branch (including project state files), the platform rule wins — open a short-lived PR even for JOURNAL/decisions updates. The §M-git-1 risk-based table is the module's recommendation, not a hard override of platform policy.

## §M-git-3 — Public-facing documentation sync

When a pull request modifies `.agents/PROTOCOL_RULES.md` (the kernel that shapes the public surface of the protocol), the **same PR** must include an updated `README.md` reflecting the change — no separate follow-up PR.

Rationale: the README is the entry point for external users evaluating the protocol. A merged change to the framework with a stale README misrepresents the project. Keeping both in one PR means one approval covers both, and the author (agent or human) edits the README while context is still fresh.

Enforcement: a CI check (`.github/workflows/readme-sync.yml`) fails the PR when `.agents/PROTOCOL_RULES.md` is touched but `README.md` is not. Override for genuinely internal-only changes: add the label `readme-sync-not-required` to the PR (use sparingly — typo fixes, internal clarifications with no external-visible effect).

Scope: this rule applies only to `.agents/PROTOCOL_RULES.md`. Changes to `PROJECT_RULES.md`, operational state files, module files, and docs do not trigger it. A meta-repo may extend this to the template copy — see `modules/meta-repo.md §M-meta-6`.

## §M-git-4 — Commit convention

The `PROTOCOL_RULES §P3` commit convention (`[Agent] <type>: <summary>`) applies verbatim in git. No substrate-specific additions.

## §M-git-5 — `.gitignore` baseline

The template ships a `.gitignore` that ignores `.agents/local/`. This is non-negotiable for git-substrate projects: committing per-pair state leaks personal context and creates spurious merge conflicts on every session. If a project using this module lacks the line `.agents/local/` in its `.gitignore`, treat the omission as a bug and fix it before any session close that would commit state.

## Optional tooling that ships with the template

These files are included in the template as conveniences for projects whose substrate is `git+github` and that use common Python-ecosystem tooling. They are **opt-in** — deleting them breaks nothing in the kernel or in this module's rules:

- `.pre-commit-config.yaml` (at template root) — pre-commit.com scaffold that wires `validate_state.py` as a pre-commit hook. Safe to delete if you use a different hook manager (husky, lefthook) or no hook manager.
- `.agents/scripts/.pre-commit-hooks.yaml` — hook manifest for publishing this repo as a reusable pre-commit source (so downstream projects can `- repo: https://github.com/…/lead-protocol`). Safe to delete if you are not distributing hooks.

The framework validator itself (`.agents/scripts/validate_state.py`) is **not** opt-in — it is part of the framework and runs independently of any hook tooling (e.g., invoked manually or from CI). The migration script `.agents/scripts/migrate_to_v2.py` is also part of the framework (one-time v1.x → v2.0.0 upgrade tool) and not opt-in.

## Relationship to the kernel

- `PROTOCOL_RULES §P3` defines the schema for handoff, decisions, session close — those are substrate-neutral and remain in the kernel.
- `PROTOCOL_RULES §P4` quality checklist references "Commit record follows `[Agent] <type>: <summary>` convention (§P3)" — in a git-substrate project, "commit record" means the git commit.
- When this module is active, the branching (§M-git-1) and PR (§M-git-2) gates apply before any operation that would trigger the session close ritual.
