# PROJECT_RULES.md — Lead Protocol (meta-repo)

> Version: 2.0.0 | Updated: 2026-06-23 | Protocol: Lead Protocol v2.0.0
> Scope: Project-specific rules for this meta-repo. Never overwritten by framework upgrades.

---

## §J1 — Project identity

- **Name:** Lead Protocol
- **Type:** Multi-agent coordination framework + console UI
- **Purpose:** Open-source framework that lets multiple AI agents (Claude, Codex, Cursor, Gemini, etc.) operate on the same codebase concurrently without overwriting each other's state. This fork also develops a web-based console UI to visualize and manage protocol state in real time.
- **Stack:**
  - Framework: Markdown files + Python scripts (`validate_state.py`, `migrate_to_v2.py`)
  - CLI: Node.js / TypeScript (`cli/`)
  - Console UI: React 18 + TypeScript + Vite + Tailwind CSS + XYFlow (`ui/`)
  - UI backend: Node.js ESM server (`ui/server.mjs`) + API layer (`ui/api/protocol.mjs`)
- **Consumers:**
  - Public: developers who adopt Lead Protocol in their own multi-agent projects
  - Internal: Alvaro Ramos (owner of this fork) dogfooding while developing the UI

## §J2 — Agents operating on this project

| Name | Role | Scope | Permissions | Signature |
|---|---|---|---|---|
| Claude Code | Lead developer | Full codebase | Read/write all files | `claude-code` |
| Codex CLI | Framework contributions, docs | Full codebase | Read/write all files | `codex-cli` |
| Humans | Oversight, review, PR decisions | All | Reviewer | `alvaro` |

Each agent listed here has its own `.agents/local/<actor>/<agent>/` state folder once it starts operating.

## §J3 — Tone and vocabulary

- Technical and precise — this repo is the product itself, not a consumer project
- Write for senior developers who may contribute to or adopt the protocol
- No marketing language in operational files; README.md may be more accessible
- "meta-repo" = a repo that both uses and develops Lead Protocol simultaneously

## §J4 — Language rules

| Content | Language |
|---|---|
| All source code, CLI, UI, comments | EN-US |
| AI operational files (`.agents/*`) | EN-US — required by `PROTOCOL_RULES.md §P5` |
| Commit messages | EN-US |
| `template/` files | EN-US (distributed to global consumers) |
| Working notes, prompts, conversation | PT-BR acceptable (owner is Brazilian) |

## §J5 — Project-specific quality checklist

When creating, renaming, or removing any file:

- [ ] `README.md` updated if the change affects public-facing protocol structure
- [ ] `CHANGELOG.md` entry added for user-visible changes
- [ ] `template/` counterpart updated if the change is a framework improvement
- [ ] UI changes: test all 8 views (Dashboard, Graph, Agents, Sessions, Handoff, Decisions, Rules, Validator)
- [ ] CLI changes: run `npm run build` in `cli/` and verify output
- [ ] Framework changes: run `python .agents/scripts/validate_state.py` to verify state integrity

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
| My personal lessons | `.agents/local/<actor>/<agent>/lessons.md` |
| Active modules | `.agents/modules/` (governed by `§J8`) |
| UI source | `ui/src/` |
| UI API backend | `ui/api/protocol.mjs` |
| UI server | `ui/server.mjs` |
| CLI source | `cli/src/` |
| Distributable template | `template/.agents/` |

## §J7 — Project authority hierarchy

1. `PROTOCOL_RULES.md` (framework kernel — always wins)
2. Active modules listed in `§J8` (in declaration order)
3. `local/<actor>/<agent>/handoff.md` (current state for this pair)
4. `PROJECT_RULES.md` (this file)
5. Source code and tests

## §J8 — Operational model

- **Session Protocol level:** Level 2 — formal start/end ceremony required; handoff maintained per pair
- **Active substrate:** `git+github`
- **Active modules:** `git-substrate`, `meta-repo`
- **Branch / change-control convention:**
  - Framework and UI work: feature branches (e.g., `feacture-ui`, `claude/*`)
  - No direct push to `main`
  - PRs reviewed by owner before merge
  - Commits targeting the public upstream PR must contain only framework files — never root `PROJECT_RULES.md`, `JOURNAL.md`, `LESSONS.md`, `decisions.jsonl`, or personal `local/` state

## §J9 — Meta-repo specifics

This repo is a **meta-repo**: it simultaneously *uses* Lead Protocol to coordinate development work and *produces* the next version of Lead Protocol as its output. See `modules/meta-repo.md` for the dual-copy (IDE ↔ template) lifecycle.

- **Root `.agents/`** — the IDE copy; governs current development. This `PROJECT_RULES.md` is specific to this fork and is **never included in upstream PRs**.
- **`template/.agents/`** — the product under development; distributed to consumers as a generic skeleton.
- **UI deliverable (`ui/`)** — new module being developed in this fork; target: offer as PR to the public Lead Protocol project once stable.

Key invariants:
- Never edit root `.agents/CORE_RULES.md`, `PROTOCOL_RULES.md`, or `modules/*.md` directly — all rule evolution happens in `template/`; only promotion moves changes into the IDE.
- Root `PROJECT_RULES.md` (this file) stays in this fork. It is NOT part of the upstream PR.
- `local/<actor>/<agent>/` is gitignored — never committed.
