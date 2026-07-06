# Changelog

All notable changes to Lead Protocol are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases prior to `v1.8.0` are summarized in
[`README.md` §Version history](README.md#version-history) — archival only, not
re-stated here.

---

## [2.2.0] - 2026-07-06

CLI update command. No kernel or schema changes: this release only touches
the CLI package.

### Added

- **`lead-protocol update`** (CLI): updates an existing installation to the
  protocol version bundled with the CLI, honoring the three-layer state
  model. The framework layer (`CORE_RULES.md`, `PROTOCOL_RULES.md`,
  `modules/`, `schemas/`, `scripts/`) is always refreshed; project-layer
  files are never overwritten (missing seeds are created); `.agents/local/`
  is never touched. Supports `--yes` and `--dry-run`, reports every file as
  `updated` / `created` / `unchanged`, and lists framework-dir files absent
  from the bundled release as warnings without deleting them.
- Unit test suite for the update planner (`node --test`, zero new runtime
  dependencies) plus new `test-pack.mjs` scenarios covering the update flow
  and the `init` guard.

### Changed

- **`lead-protocol init` no longer overwrites an existing installation.**
  Previously, confirming the "already installed" prompt replaced the whole
  `.agents/` tree with blank templates, destroying project-layer files
  (`PROJECT_RULES.md`, `JOURNAL.md`, `decisions.jsonl`, ...). `init` now
  refuses and points to `update`; a full reinstall remains available behind
  `init --force`, with an explicit warning listing what will be lost.
- CLI package version bumped to `2.2.0`; `@types/node` added to the CLI dev
  dependencies (typechecking previously relied on ambient Node types).

---

## [2.0.3] — 2026-06-01

Security patch and public-repo polish. No kernel or schema changes — the
framework `PROTOCOL_RULES.md` version stays at `2.0.0`.

### Fixed

- **Path traversal in `migrate_to_v2.py`** (security): `--actor`, `--agent`,
  `LEAD_PROTOCOL_ACTOR_ID`, and `LEAD_PROTOCOL_AGENT_ID` values are now
  validated against path traversal before being used to construct
  `.agents/local/<actor>/<agent>/`. Values containing `/`, `\`, `:`, `..`,
  or absolute path forms are rejected with a clear error message. A
  belt-and-suspenders destination check verifies the resolved path stays
  under `.agents/local/`. New `TestSlugValidator` and `TestCheckSlugDestination`
  test classes added to `test_migrate_to_v2.py`.

### Changed

- `README.md` Quick Start now clones `v2.0.3` (was `v2.0.1`) and includes a
  comment directing users to the Releases page for the current version number.
  PowerShell `Copy-Item` block added alongside the existing `cp` block for
  Windows users. Version history updated to include `2.0.2` and `2.0.3`.
- `SECURITY.md` scope corrected: supported surface is now the scaffold, JSON
  Schemas, docs, validator, and migration tool. CLI and MCP server are noted
  as planned, not shipped. Supported versions table updated (`Latest published
  release` → Supported; `main` → Development, best effort).
- `CONTRIBUTING.md` "We welcome" section updated: CLI/MCP noted as planned
  surfaces accepting design input via issues, not code contributions yet.
- CI workflow `permissions: contents: read` added at workflow scope to both
  `state-validation.yml` and `readme-sync.yml`.

---

## [2.0.2] — 2026-05-31

Documentation overhaul of the consumer-facing `README.md`. No kernel, schema,
or tooling changes — the framework `PROTOCOL_RULES.md` version stays at `2.0.0`.
This release only restructures and clarifies how the protocol is presented to
new users.

### Changed

- `README.md` opening rewritten for non-technical readers. The tagline is now
  the plain-language analogy ("a shift-change logbook for your AI coding
  assistants"); "The problem" opens with a concrete, relatable scenario instead
  of a list of engineering verbs. Vendor/tooling jargon (mem0, LangGraph, the
  agent-stack diagram) moved into collapsible `<details>` blocks labeled "For
  developers" so beginners are not blocked while developers still find it.
- `README.md` solution section now describes each state file by everyday use
  (handoff = current state, decisions = why, lessons = mistakes not to repeat)
  and embeds the folder-layout diagram immediately, so the product is visible
  before the install instructions.
- "Checking which version you have" now explains that `PROTOCOL_RULES.md` records
  the **kernel** version (a floor, not the release number) — e.g. release
  `2.0.1` ships kernel `2.0.0`. The installed release is the top entry of
  `CHANGELOG.md`. (Partial pre-work for the documentation acceptance criterion
  of #6; the verification tooling remains scoped to v2.1.0.)

### Fixed

- Removed an orphaned "Option 2" heading left over after the duplicate
  `git clone` block was merged into Quick start (now "Alternative").
- "Read the operational manual" link now points to `.agents/CORE_RULES.md`
  (how agents use the protocol) instead of `.agents/modules/README.md` (a
  narrower module index).
- Collapsed the pre-`v1.8.0` version history into a `<details>` block rather
  than moving it out, preserving the `CHANGELOG.md → README.md#version-history`
  back-reference.

## [2.0.1] — 2026-04-23

Bugfix patch from the first external consumer migration. No kernel
changes — the framework `PROTOCOL_RULES.md` version stays at `2.0.0`; this
release patches `migrate_to_v2.py` and tightens `docs/MIGRATION-v2.md`.

### Added

- `migrate_to_v2.py` now accepts `--dry-run` as an explicit no-op alias
  for the default (no `--apply`) behavior. Documented in `MIGRATION-v2.md`
  but previously rejected by argparse.
- Mutual-exclusion check: `--dry-run --apply` errors out cleanly with a
  targeted message instead of silently running one of them.

### Fixed

- `check_rerun_safety()` no longer false-positives on a pristine
  `LESSONS.md` that was copied from the v2 template scaffold. The previous
  heuristic detected the example heading inside the scaffold's code block
  and incorrectly refused the first-ever migration. Replaced with a
  byte-for-byte comparison against the known template scaffold.
- `MIGRATION-v2.md` Step 3 now leads with a prominent callout telling
  AI-agent-driven sessions to always pass `--yes` (the interactive
  confirmation prompt assumes a human at the keyboard and aborts in
  automated contexts).
- `MIGRATION-v2.md` Step 3 now warns that the `--agent` slug seeds the
  per-pair continuity path (`local/<actor>/<agent>/`) permanently — using
  the wrong slug during migration means future sessions read from the
  wrong pair. Fix is a simple `mv`, but the consequence is easy to miss.
- `MIGRATION-v2.md` Step 4 now cross-references the `--yes` callout for
  consumers who skimmed Step 3 and hit the hang.

### References

- Patch PR: #58

---

## [2.0.0] — 2026-04-23

**Three-layer state model** — structural major. Breaking changes to the
on-disk layout. Consumers on `v1.x` must migrate — see
[`docs/MIGRATION-v2.md`](docs/MIGRATION-v2.md).

### Added

- **Three-layer state model** (`PROTOCOL_RULES.md §P3`). Every file under
  `.agents/` belongs to exactly one of: **Framework** (shipped with the
  release), **Project** (versioned with the project), or **Actor × Agent**
  (per-pair, gitignored).
- **`(actor, agent)` as the unit of concurrency.** Claude, Codex, Gemini, and
  Cursor operated by the same human each get their own
  `local/<actor>/<agent>/` — zero overwrite.
- **`JOURNAL.md`** — curated project biography, append-at-tail, for
  structurally significant deliveries only.
- **`LESSONS.md`** — project-level lessons, append-at-tail, grep-by-tag.
- **`AGENTS_MAP.md`** — tool-signature → agent-slug map, maintainer-managed
  (agents propose additions; humans commit).
- **`decisions.jsonl`** — append-only JSONL (one object per line) replaces the
  v1 JSON array form of `decisions.json`.
- **Six-step baseline boot order** — `CORE_RULES.md` → `PROJECT_RULES.md` →
  `modules/<scope>.md` (per `§J8`) → `AGENTS_MAP.md` →
  `sessions/active_sessions.md` → `local/<actor>/<agent>/handoff.md`.
- **`§P-Access` load-on-demand contract** — `PROTOCOL_RULES.md` itself is not
  in the baseline; it loads on demand when `CORE_RULES.md` points there.
- **`modules/meta-repo.md §M-meta-6`** — formal promotion lifecycle
  (IDE ↔ template version invariant, when/how to promote, anti-patterns).
- **`migrate_to_v2.py`** — structural migration tool. Dry-run default,
  interactive lessons split, three-signal rerun guard.
- **8-item session-close checklist** embedded in `handoff.md` (grew from 7).
- **`schemas/decisions.entry.schema.json`** — per-entry schema for
  `decisions.jsonl` (replaces `decisions.schema.json`, which validated the v1
  array form).

### Changed

- **`handoff.md` location** moves from `.agents/agent_log/handoff.md` to
  `.agents/local/<actor>/<agent>/handoff.md`. The file is now per-pair and
  gitignored.
- **`decisions.json` (JSON array) → `decisions.jsonl` (JSONL, append-only).**
  Append at the tail; never rewrite the top; never maintain a manual top-of-file
  index.
- **Append-at-tail rule** is now explicit in `§P3` — applies to `JOURNAL.md`,
  `LESSONS.md`, `decisions.jsonl`, and personal `activity.log`.
- **Checkpoints** (`.agents/checkpoints/`) are shared project-layer state, not
  per-pair. Primary use case: cross-agent second opinion.
- **`CLAUDE.md` / `AGENTS.md`** boot procedure rewritten to the six-step order.

### Removed

- **`.agents/agent_log/`** directory — replaced by the
  `.agents/local/<actor>/<agent>/` layout. `migrate_to_v2.py` handles the move.
- **`decisions.schema.json`** (the array-wrapper schema) — superseded by
  `decisions.entry.schema.json`.
- **Flat, actor-agnostic state** under `.agents/` — incompatible with the
  three-layer model.

### Migration

Automated path:

```bash
python .agents/scripts/migrate_to_v2.py --dry-run
python .agents/scripts/migrate_to_v2.py --apply --actor <id> --agent <slug> --yes
```

Full consumer migration guide: [`docs/MIGRATION-v2.md`](docs/MIGRATION-v2.md).

### References

- Phase 1 (template skeleton + migration tool): PR #44
- Phase 2 (test hardening + CI split): PR #45
- Phase 3 (IDE promotion): PR #51
- Phase 4 (this release): PR #53

---

## [1.9.1] — 2026-04-20

### Changed

- Template cosmetic pass — clarifies opt-in nature of pre-commit tooling
  (header comment + cross-reference in `modules/git-substrate.md`).
- `.agents/scripts/README.md` added, distinguishing framework files
  (validator, tests) from distribution files (pre-commit hook manifest).
- "Validating state files" section reframed so local ad-hoc validation is the
  default path; pre-commit (requires pre-commit.com) and CI (requires GitHub
  Actions) are presented as opt-in layers.

No framework rules changed. Closed via PR #36.

---

## [1.9.0] — 2026-04-20

**Substrate-agnostic kernel + opt-in modules.**

### Added

- `§P9` — module contract in the kernel.
- `modules/git-substrate.md §M-git-1..4` — git / PR / README-sync rules
  extracted from the kernel.
- `modules/meta-repo.md §M-meta-1..6` — meta-repo rules (former `§P8`).
- `PROJECT_RULES.md §J8` fields `Active substrate` and `Active modules`
  (renames the prior `Active optional modules` field).

### Changed

- `PROTOCOL_RULES.md` rewritten as a substrate-neutral kernel (`§P1`–`§P7`).
- Promotion copy list expanded to include `modules/`.

---

## [1.8.3] — earlier

### Added

- CI state validation workflow — GitHub Action runs `validate_state.py` on
  every PR that touches state, schemas, or scripts. Two jobs: IDE root state
  and template pristine baseline.

---

## [1.8.2] — earlier

### Added

- Pre-commit hook integration — Python validator (`validate_state.py`)
  enforces the JSON Schemas against `handoff.md` and `decisions.json`. Ships
  as `.pre-commit-hooks.yaml` for external adoption and a ready
  `.pre-commit-config.yaml` scaffold in the template.
- `§P8` copy list expanded to include `scripts/`.

---

## [1.8.1] — earlier

### Added

- Formal JSON Schemas (`handoff.schema.json`, `decisions.schema.json`) —
  source of truth for the upcoming CLI, pre-commit hook, and CI validator.

### Changed

- `§P8` promotion procedure updated to treat `schemas/` as framework (copied
  verbatim on promotion).

---

## [1.8.0] — earlier

**`§P8` — Meta-repo promotion lifecycle.**

### Added

- Formalized the IDE ↔ template dual-copy model introduced in PR #17.
- Version invariant: `template ≥ IDE` per paired file.
- When/how to promote a tested template version into the IDE.
- Anti-patterns documented (no ad-hoc IDE edits, no multi-minor gaps).
- Scope clause: `§P8` governs meta-repos only, not consumer repos.

Complements the README split (PR #21) and CI dual-sync (PR #22).

---

## Earlier versions

See [`README.md` §Version history](README.md#version-history) for v1.0.0
through v1.7.1. Those releases pre-date the current release model formalized
in `v1.8.0`; their highlights are retained in the README for archival
reference and are not restated here.
