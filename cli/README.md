# @leadsolutions/lead-protocol

CLI tooling for the [Lead Protocol](https://github.com/mmilanez/lead-protocol) — a multi-agent coordination framework.

## Quick Start

```bash
npx @leadsolutions/lead-protocol init
```

This copies `.agents/` into your project and generates `CLAUDE.md` and `AGENTS.md` with the boot procedure. Then edit `.agents/PROJECT_RULES.md` to set your project identity — same as the [manual setup](https://github.com/mmilanez/lead-protocol#quick-start), minus the copy-paste.

## Installation

No installation required — use `npx`:

```bash
npx @leadsolutions/lead-protocol <command>
```

Or install globally:

```bash
npm install -g @leadsolutions/lead-protocol
lead-protocol <command>
```

## Commands

### `init`

Initialize Lead Protocol in the current directory.

```bash
lead-protocol init          # Asks for confirmation
lead-protocol init --yes    # Skip confirmation
lead-protocol init --force  # Reinstall from scratch (destructive, see below)
```

What it does:
- Copies `.agents/` with all protocol files (rules, schemas, scripts, modules)
- Creates `CLAUDE.md` and `AGENTS.md` with `<lead-protocol>` tagged boot procedures
- Creates `.gitignore` with the protocol entries if none exists, or appends any missing ones if it already exists

If Lead Protocol is already installed, `init` refuses to run and points you to `update`. To reinstall from scratch, pass `--force`: this overwrites the project layer (`PROJECT_RULES.md`, `AGENTS_MAP.md`, `JOURNAL.md`, `LESSONS.md`, `decisions.jsonl`, `checkpoints/`, `sessions/`) with blank templates, so you will be warned and asked to confirm. Existing content in `CLAUDE.md` / `AGENTS.md` outside the `<lead-protocol>` tags is always preserved.

### `update`

Update an existing installation to the protocol version bundled with this CLI.

```bash
lead-protocol update            # Asks for confirmation
lead-protocol update --yes      # Skip confirmation (CI, scripts)
lead-protocol update --dry-run  # Show what would change without writing
```

What it does, following the protocol's three-layer state model:
- **Framework layer** (`CORE_RULES.md`, `PROTOCOL_RULES.md`, `modules/`, `schemas/`, `scripts/`): always refreshed to the bundled release. Local edits to these files are overwritten (the protocol reserves framework changes for releases); use git to recover them if needed.
- **Project layer** (`PROJECT_RULES.md`, `AGENTS_MAP.md`, `JOURNAL.md`, `LESSONS.md`, `decisions.jsonl`, `checkpoints/`, `sessions/`): never overwritten. If a new release introduces a project-layer seed file the installation is missing, it is created.
- **Per-pair state** (`.agents/local/`): never touched.
- Refreshes the `<lead-protocol>` blocks in `CLAUDE.md` / `AGENTS.md` and re-checks the `.gitignore` entries.

Every file is reported as `updated`, `created`, or `unchanged`. Files found under `modules/`, `schemas/`, or `scripts/` that are absent from the bundled release (leftovers from an older version, or your own extensions) are listed as a warning and never deleted.

### `handoff`

Show the current handoff state for an (actor, agent) pair.

```bash
lead-protocol handoff                      # Auto-detect or select pair
lead-protocol handoff --pair user@pc/claude # Specific pair
lead-protocol handoff --raw                # Raw markdown
lead-protocol handoff --json               # JSON output
```

### `validate`

Validate protocol state files against their JSON schemas.

```bash
lead-protocol validate                         # Auto-discover all
lead-protocol validate .agents/decisions.jsonl  # Specific file (decisions.jsonl)
lead-protocol validate path/to/handoff.md        # Specific file (handoff.md)
```

Recognized files are matched by name: `decisions.jsonl` and `handoff.md`. Auto-discover checks `.agents/decisions.jsonl` plus every pair's `handoff.md`.

Exit codes: `0` = passed, `1` = validation errors, `2` = config errors.

### `status`

One-screen summary of the current protocol state.

```bash
lead-protocol status         # Formatted output
lead-protocol status --json  # JSON output
```

## How `<lead-protocol>` Tags Work

The CLI manages `CLAUDE.md` and `AGENTS.md` using XML-style tags:

```markdown
<lead-protocol>
# CLAUDE.md — Pointer for Claude Code
...boot procedure...
</lead-protocol>
```

- **New file** → creates with the tagged block
- **Existing file, no tags** → appends the tagged block (your content is preserved)
- **Existing file, has tags** → replaces content between tags (idempotent)

## Requirements

- Node.js >= 18.0.0
- No dependency on git, Python, or any server

## License

Apache-2.0

