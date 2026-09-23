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
- Creates a missing `INDEX.md` from the bundled seed and preserves existing regular maps byte-for-byte, including empty/CRLF maps and force init
- Installs `.agents/` framework and project seeds (actor-local state is never seeded or written)
- Creates `CLAUDE.md` and `AGENTS.md` with `<lead-protocol>` tagged boot procedures
- Creates `.gitignore` with the protocol entries if none exists, or appends any missing ones if it already exists

Any existing `.agents` entry blocks init, including partial or malformed installations;
`--yes` only skips the confirmation prompt. Use `update` to preserve project state.
Explicit `init --force` overlays bundled framework and project seeds, preserving
`.agents/local/` and files absent from the bundle. It does not delete orphan files.
Use force only when deliberately resetting project seeds.

INDEX source/destination preflight runs before writes; exclusive creation seeds
a missing map. Cancellation writes nothing. INDEX symlinks (live or dangling), directories and
other unsupported types are refused before writes. A racing regular map is
preserved; a racing unsupported entry is refused. This does not make the whole
operation atomic or protect against arbitrary concurrent replacement.

Both managed pointers route project questions to relevant INDEX entries, then
canonical sources; legacy missing maps fall back to §J6 and kernel §P-Access.
Knowledge-map delivery is included in v2.4.0. See the
[root source-adoption instructions](../README.md#knowledge-map).

### `update`

```bash
lead-protocol update --dry-run  # Inspect without writes
lead-protocol update            # Confirm before applying
lead-protocol update --yes      # Apply without prompting
```

Updates the nearest installation to the framework bundled with this CLI:
`CORE_RULES.md`, `PROTOCOL_RULES.md`, `manifest.json`, `modules/`, `schemas/`,
and `scripts/`. Existing project state (including checkpoints, sessions and the
agent map) stays byte-identical; missing project seeds are created.
A missing root `INDEX.md` is also seeded;
existing regular maps remain byte-identical. Actor-local
state is never scanned, seeded or written. Framework orphans are reported and
never deleted. Partial pre-manifest installs can be repaired by update.

Both init and update refresh the first complete `<lead-protocol>` block in
`CLAUDE.md` / `AGENTS.md` and keep it at the top of the file, so the boot
procedure is read first and is the part least exposed to instruction size limits
(Codex, for example, stops reading `AGENTS.md` after a configurable byte limit).
A block that only whitespace precedes counts as the top and is replaced in place; a block
found lower down, for example below another tool's managed guidelines, is moved to
the top; when no complete block exists one is prepended. User content is never
trimmed: the only bytes removed outside the block are the `===` separator and
final newline that earlier CLI versions wrote around an appended block. Missing protocol
`.gitignore` entries are appended. Repeated updates skip identical files.
Dry-run preflights these paths too and writes nothing; its per-file listing
covers `.agents`, with INDEX seeding, guideline blocks and `.gitignore` handled on apply.

All planned source/destination paths and existing ancestors are checked before
writes. Symbolic links on these paths, malformed file/directory types, and links
inside framework directories are refused without replacement or deletion.
A malformed nearest `.agents` entry fails instead of selecting a parent install.
Links inside actor-local state are left alone. This is static path validation,
not protection against concurrent filesystem replacement or hard-link aliases.
Multi-file writes are not transactional: permission changes, disk exhaustion or
other I/O failures during application can leave a partial update.

Based on Leonardo Buares's [PR #26](https://github.com/mmilanez/lead-protocol/pull/26),
with current-main integration and safety fixes for issues #25 and #40.

### `handoff`

Show the current handoff state for an (actor, agent) pair.

```bash
lead-protocol handoff                      # Auto-detect or select pair
lead-protocol handoff --pair user@pc/claude # Specific pair
lead-protocol handoff --raw                # Raw markdown
lead-protocol handoff --json               # JSON output
```

### `validate`

Validate protocol state files: JSON-schema validation for `decisions.jsonl` and `handoff.md`, plus structural integrity checks on every state file (unresolved merge conflict markers outside valid Markdown fences; missing final newline on the append-only files; duplicated top-level header on the markdown logs).

```bash
lead-protocol validate                         # Auto-discover all
lead-protocol validate .agents/decisions.jsonl  # Specific file (decisions.jsonl)
lead-protocol validate path/to/handoff.md        # Specific file (handoff.md)
lead-protocol validate .agents/JOURNAL.md        # Specific file (append-only log)
```

Validation works in a plain local directory with no Git executable. JSONL is never treated as fenced Markdown.

Recognized files are matched by name: `decisions.jsonl`, `handoff.md`, `JOURNAL.md`, `LESSONS.md`, and `active_sessions.md`. Auto-discover checks `.agents/decisions.jsonl`, `.agents/JOURNAL.md`, `.agents/LESSONS.md`, `.agents/sessions/active_sessions.md`, plus every pair's `handoff.md`.

Exit codes: `0` = passed, `1` = validation errors, `2` = config errors.

### `status`

One-screen summary of the current protocol state. The first non-empty line
leads with the installed scaffold's product version from `.agents/manifest.json`
and the project name. The kernel follows immediately as a secondary detail,
including when color is disabled:

```text
Lead Protocol <productVersion> — <projectName>
  Kernel: <kernelVersion> (technical detail)
```

The running CLI binary's version is never substituted for the scaffold's
product version. A missing or invalid manifest leaves the product as literal
`unknown`. The kernel comes from a valid `PROTOCOL_RULES.md` version header,
falling back to a valid manifest's `kernel_version`, then `unknown`. The
`CORE_RULES.md` document revision is never used for either identity.

```bash
lead-protocol status         # Formatted output
lead-protocol status --json  # JSON output
```

JSON output is unchanged and exposes `productVersion` and `kernelVersion` as
separate fields.
For compatibility with existing v2.1.x consumers, `protocolVersion` remains as
a deprecated alias of `kernelVersion`; it never reads the `CORE_RULES.md`
document revision.

## How `<lead-protocol>` Tags Work

The CLI manages `CLAUDE.md` and `AGENTS.md` using XML-style tags:

```markdown
<lead-protocol>
# CLAUDE.md — Pointer for Claude Code
...boot procedure...
</lead-protocol>
```

- **New file** → creates with the tagged block
- **Existing file, no tags** → prepends the tagged block (your content is preserved below it)
- **Existing file, tags at the top** → replaces content between tags (idempotent)
- **Existing file, tags lower down** → moves the tagged block to the top (your content is preserved, including other tools' tag blocks such as `<laravel-boost-guidelines>`)

The block stays first so it is read before anything else and is the least likely
part to be cut by instruction size limits. A UTF-8 BOM, when present, remains at
the start of the file.

## Requirements

- Node.js >= 18.0.0
- No dependency on git, Python, or any server
- Supported on Windows, macOS, and Linux

## License

Apache-2.0


### Execution evidence on checkpoints and closeouts

Use `checkpoint --title verified --file checkpoint.md --evidence evidence.json` or add
`--evidence evidence.json` to `session close` with its existing required close flags. The input is the
portable evidence object, without an outer key. See the shipped `.agents/PROTOCOL_RULES.md` execution-evidence
section and `.agents/schemas/execution-evidence.schema.json` for fields and illustrative examples.

The CLI validates supplied evidence before writes, appends one canonical JSON checkpoint section, or adds
`execution_evidence` to the close receipt. Evidence-bearing closes reference their receipt and latest checkpoint
in the existing handoff context. Publish a shared close checkpoint with durable evidence for cross-machine
handoffs. Browser evidence is optional; unperformed checks require a reason and never imply success.
Omission preserves legacy behavior. Empty/omitted evidence and successful state validation do not prove task
completion or test execution. `validate` retains its handoff/decisions scope; it does not scan evidence artifacts.
