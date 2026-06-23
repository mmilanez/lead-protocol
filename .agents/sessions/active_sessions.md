# active_sessions.md — Sessions currently live

> Version: 1.1 | Updated: Lead Protocol v2.0.0
> Append row on session start. Remove row on session close.
> Stale rows (>24h with no checkpoint update) may be removed by any next agent with a decisions.jsonl log.

| Session ID | Agent | Started | Topic | Last checkpoint |
|---|---|---|---|---|
| 2026-06-23-1000-claude | [Claude Code] | 2026-06-23 10:00 | UI structural analysis — LiveApp.tsx, GraphView.tsx, CSS architecture, API data flow | — |

---

## Usage

Enable this file in projects where more than one agent may operate on the repo concurrently (the primary use case for the Lead Protocol — e.g., owner uses Claude Code + Codex + Cursor against the same codebase). In single-agent repos it can remain empty indefinitely.

**On session start:** append a row with session ID `YYYY-MM-DD-HHMM-<agent-short>`, agent signature, timestamp, and a one-line topic.

**During session:** if you write a checkpoint in `.agents/checkpoints/`, update the `Last checkpoint` column of your row.

**On session close:** remove your row (and check the corresponding box in `handoff.md` session close checklist).

See `PROTOCOL_RULES.md §P3` *Concurrent sessions and mid-session checkpoints* for the full specification.
