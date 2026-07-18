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

### `session open`

Open a verifiable session, register it without disturbing peer rows, transition
the pair-local handoff to `IN_PROGRESS`, and write a SHA-256 boot receipt.

```bash
lead-protocol session open \
  --actor marco \
  --agent codex \
  --signature "[Codex / GPT-5]" \
  --topic "Implement issue #28" \
  --json
```

Actor resolution is `--actor`, `LEAD_PROTOCOL_ACTOR_ID`,
`.agents/local/WHOAMI.txt`, then `user@host`. Agent resolution is `--agent`,
`LEAD_PROTOCOL_AGENT_ID`, `--tool-signature` through `AGENTS_MAP.md`, then a
timestamped unknown-agent fallback. Receipts are stored under the gitignored
`.agents/local/<actor>/<agent>/receipts/` directory.

### `checkpoint`

Create a UTC-named shared checkpoint for the active pair and update only that
session's checkpoint pointer. The body comes from `--file` or stdin.

```bash
lead-protocol checkpoint --actor marco --agent codex \
  --title architecture-locked --file checkpoint-body.md --json
```

### `session close`

Validate state, remove only the current session row, write the terminal
handoff, and emit a close receipt. Closing is deliberately explicit:

```bash
lead-protocol session close \
  --actor marco --agent codex \
  --journal not-significant \
  --status stable \
  --last-action "Lifecycle verified." \
  --pending-step None \
  --confirm-checklist \
  --json
```

Use `--journal significant --journal-entry-confirmed` when the session produced
a structurally significant delivery and the JOURNAL entry already exists.
Close never reports success after validation, ownership, checklist, or
optimistic concurrency failure.

### Reproducible two-session resume

After the close example above, open the same pair again:

```bash
lead-protocol session open --actor marco --agent codex \
  --topic "Resume from prior handoff" --json
```

The new receipt contains the first session's terminal state under
`previousHandoff`, including `status`, `last_action`, `pending_step`, blockers,
and open threads. This is also exercised against the installed npm tarball by
`npm run test:pack`.

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
- Supported on Windows, macOS, and Linux

## License

Apache-2.0

