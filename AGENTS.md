# AGENTS.md — Pointer for AI Agents

> This file acts as a universal pointer for agents like Cursor, Windsurf, Antigravity, and Codex.

This repository operates under the **Lead Protocol**. All operational instructions, project context, and state definitions are stored in the `.agents/` directory.

Before taking any action, read the rules and the current state in this order:

1. `.agents/CORE_RULES.md` — index + essential contracts
2. `.agents/PROJECT_RULES.md` — identify the scopes listed in `§J8 Active modules`
3. For each scope listed in `§J8 Active modules` (in declaration order): `.agents/modules/<scope>.md`
4. `.agents/AGENTS_MAP.md` — tool-signature → agent-slug map; resolve your own `<agent>` slug here (needed to form the per-pair handoff path)
5. `.agents/sessions/active_sessions.md` — concurrent-session awareness
6. `.agents/local/<actor>/<agent>/handoff.md` — state of THIS `(actor, agent)` pair

`PROTOCOL_RULES.md` is read on demand, not in the baseline — `CORE_RULES.md` points to it. See `PROTOCOL_RULES.md §P-Access` for the full load contract.

Do not bypass the protocol. Your work must be logged in your pair's `handoff.md` and, when applicable, in `.agents/decisions.jsonl` and `.agents/JOURNAL.md` at the end of your session.
