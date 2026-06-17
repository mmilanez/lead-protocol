# CORE_RULES.md — Rules index and essential contracts

> Version: 1.6.0 | Updated: 2026-06-17 | Protocol: Lead Protocol v2.1.0

This file is the first thing every agent reads. It is deliberately short: just the index into `PROTOCOL_RULES.md`, the essential contracts an agent must obey at every session start, and the precedence rule. It never duplicates the kernel — only points at it.

---

## Baseline load (every session)

Read, in order:

1. `.agents/CORE_RULES.md` (this file)
2. `.agents/PROJECT_RULES.md` — business context; read `§J8 Active modules` first
3. `.agents/modules/<scope>.md` — for each scope listed in `§J8 Active modules`, in declaration order
4. `.agents/AGENTS_MAP.md` — tool-signature → agent-slug map (needed to resolve `<agent>` before forming the per-pair handoff path)
5. `.agents/sessions/active_sessions.md` — concurrent-session awareness
6. `.agents/local/<actor>/<agent>/handoff.md` — current state of *this* `(actor, agent)` pair

Listing (not reading) of `.agents/checkpoints/` is enough on boot; individual checkpoints load on demand when relevant. `PROTOCOL_RULES.md` itself is consulted on demand — not in the baseline — per `§P-Access`.

After step 2, if `PROJECT_RULES.md` is still pristine (see *First-run setup is a hard boot gate* below), run the `§P10` setup gate before proceeding to step 3.

---

## Essential contracts

### Three-layer state model

Every file under `.agents/` belongs to exactly one layer. The layer decides who owns it, how often it changes, and whether it is shared across contributors. Detailed rules: `PROTOCOL_RULES.md §P3 — Three-layer state model`.

| Layer | Examples | Shared? |
|---|---|---|
| **Framework** | `CORE_RULES.md`, `PROTOCOL_RULES.md`, `modules/`, `schemas/`, `scripts/` | Yes — ships with the release |
| **Project** | `PROJECT_RULES.md`, `JOURNAL.md`, `LESSONS.md`, `decisions.jsonl`, `AGENTS_MAP.md`, `checkpoints/`, `sessions/` | Yes — versioned with the project |
| **Actor × Agent** | `local/<actor>/<agent>/handoff.md`, `tasks/TASK.md`, `activity.log`, `lessons.md` | **No — gitignored, one folder per pair** |

### `(actor, agent)` is the unit of concurrency

The smallest unit that owns volatile state is the pair `(actor, agent)`, not the actor alone. Claude, Codex, Gemini, and Cursor operated by the same human each get their own `local/<actor>/<agent>/` — zero overwrite. Detailed resolution precedence, governance of `AGENTS_MAP.md`, and fallback behavior: `PROTOCOL_RULES.md §P3 — Identifying the pair`.

- **`<actor>`** precedence: `LEAD_PROTOCOL_ACTOR_ID` env → `local/WHOAMI.txt` → ephemeral-env detection → `<user>@<host>` default.
- **`<agent>`** precedence: `LEAD_PROTOCOL_AGENT_ID` env → `.agents/AGENTS_MAP.md` lookup → direct self-identification (with proposed map entry) → `unknown-agent-<timestamp>/` fallback.
- Bootstrap invariant: `<agent>` resolution never reads from `local/<actor>/<agent>/`.

### Append at the tail

Shared project-layer files that grow over time — `JOURNAL.md`, `LESSONS.md`, `decisions.jsonl`, personal `activity.log` — are **append-only at the end**. Never rewrite the top. Never maintain a manual top-of-file index. Recent entries read via `tail`; tagged queries via `grep`. Rationale and detail: `PROTOCOL_RULES.md §P3 — Append-at-tail rule` and `§P-Access`.

### Checkpoints are shared coordination

Checkpoints live in `.agents/checkpoints/` (project layer, shared), not in per-pair `local/`. That is deliberate: the primary use case for checkpoints is cross-agent second opinion, which requires every peer agent to find them. Naming: `YYYY-MM-DDTHHMMSS_<agent>_<title-slug>.md`. Detail: `PROTOCOL_RULES.md §P3 — Mid-session checkpoints`.

### `AGENTS_MAP.md` is maintainer-managed

Agents never edit `.agents/AGENTS_MAP.md` autonomously. They *propose* additions to the user; the human commits them. Rationale: orchestration of agents operates on explicit commands, not on inference. Detail: `PROTOCOL_RULES.md §P3 — AGENTS_MAP.md governance`.

### Load on demand, never "to be safe"

`JOURNAL.md`, `LESSONS.md`, `decisions.jsonl`, `activity.log`, and individual checkpoints are read with offsets, `grep`, or filters — never wholesale. `PROTOCOL_RULES.md` itself is read only when the agent hits a situation whose handling this file points there for. Full contract: `PROTOCOL_RULES.md §P-Access`.

### Session close must be verified

Every non-trivial session closes by self-verifying the checklist in `handoff.md`. One item is a **procedural question** to the user: *"Did this session produce a structurally significant delivery? If yes, promote to JOURNAL."* No heuristic, no auto-detection. Detail: `PROTOCOL_RULES.md §P3 — Session close ritual`.

### First-run setup is a hard boot gate

If `PROJECT_RULES.md` is absent or still pristine (the `§J1` Name or the `§J8` substrate/modules still contain a `[...]` placeholder), the agent must run the first-run setup interview and write the answers before doing any other requested work, even work the user asked for first. The user may reply `later` to defer once; the gate re-fires next session. Non-interactive environments (CI, Codespaces, devcontainers) skip with a warning. A repo-root `.lead-protocol-source` sentinel disables the gate for the framework's own source repo. The gate self-clears once Name and `§J8` are real. Detail: `PROTOCOL_RULES.md §P10`.

---

## Precedence

When instruction sources conflict, higher beats lower:

1. `PROTOCOL_RULES.md` (kernel — always wins)
2. Active modules listed in `PROJECT_RULES.md §J8`, in declaration order
3. `local/<actor>/<agent>/handoff.md` (current state for this pair)
4. `PROJECT_RULES.md`
5. `README.md`
6. Project reference files
7. Platform policies
8. General best practices

A module cannot contradict the kernel — it can only add rules specific to a substrate, scope, or role. `CORE_RULES.md` (this file) is an index: if `CORE` and `PROTOCOL` appear to disagree, `PROTOCOL` is canonical — the split is editorial, not authoritative. See `PROTOCOL_RULES.md §P2` and `§P-Access — Division of authority between CORE and PROTOCOL`.

---

## Where to find the rest

- **Framework kernel (detail):** `.agents/PROTOCOL_RULES.md`
- **Project identity and operational declarations:** `.agents/PROJECT_RULES.md`
- **Active modules (substrate and scope-specific rules):** `.agents/modules/` — loaded per `§J8`
- **State schemas:** `.agents/schemas/handoff.schema.json`, `.agents/schemas/decisions.entry.schema.json`
- **Validation tooling:** `.agents/scripts/validate_state.py`
- **Consumer migration script (v1.x → v2.0.0):** `.agents/scripts/migrate_to_v2.py`
