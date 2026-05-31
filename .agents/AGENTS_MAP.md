# AGENTS_MAP.md — Tool-signature → agent-slug map

> Version: 1.0 | Added: Lead Protocol v2.0.0
> Scope: shared project state, **maintainer-managed**. This file is versioned with the project (not gitignored). See the governance note below.

This map lets an agent in runtime resolve its own `<agent>` slug from the tool signature exposed by its IDE or process, so it can write state to the correct `local/<actor>/<agent>/` folder.

Not to be confused with the repository-root `AGENTS.md`, which is a universal pointer file for agents (adopted by Cursor, Claude Code, Antigravity, etc.). This file lives inside `.agents/` and has a different purpose — hence the `_MAP` suffix.

| Tool signature | Agent slug |
|---|---|
| claude-code | claude |
| claude-desktop | claude |
| codex-cli | codex |
| antigravity-codex | codex |
| antigravity-gemini | gemini |
| cursor | cursor |

## Governance

`AGENTS_MAP.md` is **maintainer-managed**:

- Agents **never edit this file autonomously**. If an agent detects an unmapped tool signature, it proposes the addition to the user (e.g. *"detected unmapped signature `X`; add `X = <slug>` to `AGENTS_MAP.md`?"*) and waits for confirmation before the human or maintainer commits the change.
- Additions, renames, and removals flow through the normal project change channel (git commit, OneDrive sync, etc.).
- Rationale: autonomous mutation of shared, versioned state creates silent conflicts and opaque audit trails. Orchestration of agents operates on **explicit commands**, not on state inference — consistent with the core principle recorded in `JOURNAL.md`.

## Fallback when the signature is not resolvable

If a tool signature is absent from this map and the agent cannot confidently self-identify, the agent writes state to `local/<actor>/unknown-agent-<timestamp>/` and flags `agent_identity: unresolved` in its `handoff.md`. The timestamp suffix is **intentionally non-stable** — every unresolved session creates a new folder, which surfaces the fragmentation as a social signal to add the missing mapping here.

See `PROTOCOL_RULES.md §P3` *Agent identity resolution* for the full precedence chain (env var → this file → auto-identification → fallback).
