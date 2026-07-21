# PROJECT_RULES.md — [Project Name]

> Version: 2.0.1 | Updated: 2026-07-20 | Protocol: Lead Protocol v2.0.0
> Scope: Project-specific rules. Never overwritten by framework upgrades.

---

## §J1 — Project identity

- **Name:** [Project Name]
- **Type:** [e.g., Web application, CLI tool, Data pipeline]
- **Purpose:** [1–2 sentences on what this project builds and why]
- **Stack:** [e.g., React, Node.js, Python, PostgreSQL]
- **Consumers:** [Who uses the output of this project]

## §J2 — Agents operating on this project

| Name | Role | Scope | Permissions | Signature |
|---|---|---|---|---|
| [Primary Agent, e.g. Claude] | Lead developer | Full codebase | Read/write all files | `[Claude Code]` |
| [Secondary Agent] | UI/UX or review | Frontend files | Read/write frontend | `[Windsurf]` |
| Humans | Oversight and review | All | Reviewer | GitHub username |

Each agent listed here has its own `.agents/local/<actor>/<agent>/` state folder once it starts operating. See `.agents/AGENTS_MAP.md` for the tool-signature → agent-slug map (maintainer-managed).

## §J3 — Tone and vocabulary

- [e.g., Technical, concise, no marketing fluff]
- [e.g., Write for senior developers]

## §J4 — Language rules

| Content | Language |
|---|---|
| All source code, docs, comments | [e.g., EN-US] |
| AI operational files (`.agents/*`) | [e.g., EN-US — required by `PROTOCOL_RULES.md §P5`] |
| Commit messages | [e.g., EN] |

## §J5 — Project-specific quality checklist

When creating, renaming, or removing any file:

- [ ] `README.md` updated if the change affects project structure
- [ ] Tests updated or added
- [ ] [Add project-specific operational checkpoints here]

## §J6 — File reference map

| Question | File |
|---|---|
| Project biography (structurally significant deliveries) | `.agents/JOURNAL.md` |
| Project-level lessons | `.agents/LESSONS.md` |
| Decisions audit trail | `.agents/decisions.jsonl` |
| Tool-signature → agent-slug map | `.agents/AGENTS_MAP.md` |
| Live concurrent sessions | `.agents/sessions/active_sessions.md` |
| Cross-agent coordination snapshots | `.agents/checkpoints/` |
| My current session state (per pair) | `.agents/local/<actor>/<agent>/handoff.md` |
| My personal activity log | `.agents/local/<actor>/<agent>/activity.log` |
| My personal lessons (about how I work) | `.agents/local/<actor>/<agent>/lessons.md` |
| Active modules | `.agents/modules/` (list governed by `§J8`) |

## §J7 — Project authority hierarchy

1. `PROTOCOL_RULES.md` (framework kernel — always wins)
2. Active modules listed in `§J8` (in declaration order)
3. `local/<actor>/<agent>/handoff.md` (current state for this pair)
4. `PROJECT_RULES.md` (this file)
5. Source code and tests

## §J8 — Operational model (project-specific)

- **Session Protocol level:** [e.g., Level 1 — usage on-demand, no formal start/end ceremony]
- **Active substrate:** [one of: `git+github` | `git` | `local` | `cloud-sync` | `other`]
- **Active modules:** [comma-separated scope names from `.agents/modules/`, or `none`. Example: `git-substrate` for a standard GitHub-hosted repo.]
- **Branch / change-control convention:** [e.g., AI work on `<agent-slug>/<description>` branches, with `<agent-slug>` resolved through `AGENTS_MAP.md`; no direct push to the default branch. Substrate-specific details live in the active substrate module.]

> **Upgrading from Lead Protocol v1.x to v2.0.0:** state-layout changed structurally (three layers with actor × agent sub-dimension). Run `.agents/scripts/migrate_to_v2.py` against this project to move legacy `agent_log/*` into the new layout. Details: `modules/meta-repo.md §M-meta-4` and the migration script's `--help`.
