# CLAUDE.md — Pointer for Claude Code

This repository uses the **Lead Protocol** for multi-agent coordination.
Your comprehensive operational instructions are strictly located in `.agents/`.

**MANDATORY BOOT PROCEDURE:**
At the start of every session, you MUST silently read the following files in order:

1. `.agents/CORE_RULES.md` — index of operations and essential contracts
2. `.agents/PROJECT_RULES.md` — business context; read `§J8 Active modules` first
2a. **Setup gate:** if `.agents/PROJECT_RULES.md` is missing or still pristine (the `§J1` Name or `§J8` substrate/modules still contain `[...]` placeholders) AND no `.lead-protocol-source` sentinel exists at the repo root, you MUST run the first-run setup interview defined in `.agents/PROTOCOL_RULES.md §P10` and write the answers before continuing the boot or serving any request, even if the user asked for something else first. The user may reply `later` to defer once. In non-interactive environments, skip with a warning.
3. For each scope listed in `§J8 Active modules` (in declaration order): `.agents/modules/<scope>.md`
4. `.agents/AGENTS_MAP.md` — tool-signature → agent-slug map (needed to resolve your own `<agent>` slug)
5. `.agents/sessions/active_sessions.md` — concurrent-session awareness
6. `.agents/local/<actor>/<agent>/handoff.md` — state of THIS `(actor, agent)` pair

`PROTOCOL_RULES.md` is read on demand, not in the baseline — `CORE_RULES.md` points to it. See `PROTOCOL_RULES.md §P-Access` for the full load contract.

Never proceed with coding tasks without first verifying the state in your pair's `handoff.md`.
