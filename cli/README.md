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
lead-protocol init        # Asks for confirmation
lead-protocol init --yes  # Skip confirmation
```

What it does:
- Copies `.agents/` with all protocol files (rules, schemas, scripts, modules)
- Creates `CLAUDE.md` and `AGENTS.md` with `<lead-protocol>` tagged boot procedures
- Creates `.gitignore` with the protocol entries if none exists, or appends any missing ones if it already exists

If Lead Protocol is already installed, you'll be asked before overwriting. Existing content in `CLAUDE.md` / `AGENTS.md` outside the `<lead-protocol>` tags is always preserved.

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

