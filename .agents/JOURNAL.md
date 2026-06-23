# JOURNAL.md — Project biography

> Version: 1.0 | Added: Lead Protocol v2.0.0
> Curated timeline of structurally significant deliveries on this project. Append at the bottom (oldest-first). Newest entries at the tail — read with `tail`, not `head`.

Each entry follows:

```
## YYYY-MM-DD | <actor> | <short title>

Two to five lines describing *what* was delivered and *why*. Never the *how*.
Refs: <commit/PR, or files touched> (optional)
```

Entries go here when a reader arriving in six months would still benefit from seeing them. Otherwise the event belongs in `local/<actor>/<agent>/activity.log`, not here.

Promotion is explicit — at session close, the agent asks whether the session produced a structurally significant delivery. No heuristic, no auto-detection.

When this file grows past ~500 lines, move the older entries into `archive/JOURNAL-<year>.md`.

---

*(No entries yet — this file accumulates as the project ships.)*

## 2026-06-23 | alvar@LS-SJRP-NTB01 / Codex | Organic graph edges anchored to visible nodes

Corrected the operational graph so organic-layout relationships connect to the visible circular icons instead of an invisible full-width node boundary. This restores visual traceability between agents, sessions, tasks, and their relationships while preserving the existing layouts and read-only data model.
Refs: commit `feed3e1`; `ui/src/GraphView.tsx`, `ui/src/graph.css`, `ui/dist/`

## 2026-06-23 | alvar@LS-SJRP-NTB01 / Claude | Full structural analysis of Console UI

Delivered a complete architectural audit of the Lead Protocol Console frontend: LiveApp.tsx monolith
(~1200+ LOC mixing layout, state, fetching, and business logic), GraphView.tsx, minified CSS, REST
polling data flow, and hardcoded graph node positions. Identified missing error boundaries and
duplicate TypeScript types. Established the structural baseline for future refactoring decisions.
Refs: `ui/src/LiveApp.tsx`, `ui/src/GraphView.tsx`, `ui/src/graph.css`
