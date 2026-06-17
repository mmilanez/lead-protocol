# PROTOCOL_RULES.md — Lead Protocol framework rules (generic)

> Version: 2.1.0 | Updated: 2026-06-17
> Scope: Substrate-agnostic kernel. Opt-in modules live in `modules/` and are activated via `PROJECT_RULES.md §J8`.
> This file contains no project-specific content — that lives in `PROJECT_RULES.md`.

---

## §P1 — Versioning

| File type | Format | Example | When to bump |
|---|---|---|---|
| Agent operation files (`CORE_RULES.md`, `PROTOCOL_RULES.md`, `PROJECT_RULES.md`, `handoff.md`) | `X.Y.Z` | `2.0.0` | Patch (Z) for clarifications/text fixes; Minor (Y) for new sections/rules; Major (X) for structural rewrites |
| Module files (`modules/*.md`) | `X.Y.Z` | `1.0.0` | Same rules as agent operation files. Each module versions independently from the kernel. |

Projects that adopt Lead Protocol may use any versioning scheme for their own product releases — the Lead Protocol versioning rules apply only to the agent operation files and module files listed above.

Meta-repos that develop the protocol itself see `modules/meta-repo.md §M-meta-1`.

## §P2 — Authority hierarchy (framework tier)

1. `PROTOCOL_RULES.md` (framework kernel)
2. Active modules listed in `PROJECT_RULES.md §J8` (in declaration order)
3. `local/<actor>/<agent>/handoff.md` (current state for this actor × agent pair — may temporarily override stale rules if the project owner defines a temporary directive)
4. `PROJECT_RULES.md` (business context)
5. `README.md` (public surface — kept synced to the kernel per the active substrate module if any; kernel wins on conflict)
6. Project reference files (brand, product, channel, etc.)
7. Official platform policies
8. General best practices

A module cannot contradict the kernel — it can only add rules specific to a substrate, scope, or role. Where a module cites a kernel anchor, the qualifier `PROTOCOL_RULES §Px` makes the cross-file reference explicit.

The kernel (`PROTOCOL_RULES.md`) is canonical. When `CORE_RULES.md` and the kernel disagree, the kernel wins — `CORE_RULES.md` is an index into this file and cannot introduce new authority. See `§P-Access` for the CORE/PROTOCOL division rationale.

Meta-repos maintaining two copies of the framework see `modules/meta-repo.md §M-meta-2`.

## §P3 — State model and multi-agent coordination

### Three-layer state model *(v2.0.0+)*

Lead Protocol state is partitioned into three layers with distinct owners and lifecycles. Every file under `.agents/` belongs to exactly one layer.

| Layer | Owner | Lifecycle | Shared across contributors? | Canonical location |
|---|---|---|---|---|
| **Framework** | Upstream Lead Protocol release | Changes with framework version | Yes — ships in the release ZIP, identical for every project | `.agents/CORE_RULES.md`, `.agents/PROTOCOL_RULES.md`, `.agents/modules/`, `.agents/schemas/`, `.agents/scripts/` |
| **Project** | The consuming project | Changes with project evolution | Yes — versioned with the project repo | `.agents/PROJECT_RULES.md`, `.agents/JOURNAL.md`, `.agents/LESSONS.md`, `.agents/decisions.jsonl`, `.agents/AGENTS_MAP.md`, `.agents/checkpoints/`, `.agents/sessions/` |
| **Actor × Agent** | One human operator running one AI agent | Changes every session | No — isolated per `(actor, agent)` pair, never committed | `.agents/local/<actor>/<agent>/handoff.md`, `.agents/local/<actor>/<agent>/tasks/TASK.md`, `.agents/local/<actor>/<agent>/activity.log`, `.agents/local/<actor>/<agent>/lessons.md` |

### Why the volatile unit is `(actor, agent)`, not `actor` alone

The primary use case the protocol exists to serve is **multi-agent interchange on the same machine, same user, same project** — e.g., Marco running Claude Code, Codex, Gemini, and Cursor on the same codebase. Keying volatile state only by the human actor would put all four agents on the same `handoff.md` and destroy the very interchange the protocol promises. The smallest unit of concurrency in practice is the pair, not the user.

Two agents operated by the same actor have independent `handoff.md`, `tasks/TASK.md`, `activity.log`, and personal `lessons.md`. Cross-agent coordination happens through the **shared project layer** — specifically, checkpoints in `.agents/checkpoints/` — never by overwriting a peer's volatile state.

### Identifying the pair `(actor, agent)`

**`<actor>`** — the human operator. Resolution by precedence:

1. `LEAD_PROTOCOL_ACTOR_ID` (environment variable) — first-class override. Primary use: CI pipelines, DevContainers, Codespaces.
2. `.agents/local/WHOAMI.txt` — persistent per-project override. Nomads who want continuity across machines drop the `@host` suffix by writing just the user here.
3. Ephemeral-environment detection — if `CI`, `GITHUB_ACTIONS`, `CODESPACES`, or `DEVCONTAINER` is set, fall back to `<user>@ephemeral` to avoid writing to a hostname that will not exist tomorrow.
4. Default — `<user>@<host>` derived from `$USERNAME`/`$USER` plus `$COMPUTERNAME`/`hostname`.

**`<agent>`** — the AI agent in runtime. Resolution by precedence (no circularity — no source below depends on already knowing `<agent>`):

1. `LEAD_PROTOCOL_AGENT_ID` (environment variable) — explicit override. Recommended in every master prompt where the IDE vendor is known. Canonical when present.
2. `.agents/AGENTS_MAP.md` — project-level shared map of tool signatures to agent slugs. The agent reads its own tool signature (User-Agent, process name, or IDE-exposed tool name) and looks up the slug.
3. Direct self-identification — if the tool signature is not mapped but the agent has a confident self-reported name (e.g., Claude Code exposing its own identifier), use it directly, and **propose** adding the missing mapping to `AGENTS_MAP.md` via an explicit message to the user. The agent never edits `AGENTS_MAP.md` on its own; see *`AGENTS_MAP.md` governance* below.
4. Fallback — `unknown-agent-<timestamp>` under `local/<actor>/`, with `agent_identity: unresolved` flagged in the handoff.

**Bootstrap invariant:** `<agent>` resolution never reads from `local/<actor>/<agent>/` — that path only exists *after* `<agent>` is known. Every source in the precedence chain lives in a deterministic location that does not depend on the pair path.

**Fallback is intentionally unstable.** Every unresolved session from the same tool creates a new `unknown-agent-<timestamp>/` folder, fragmenting continuity. This is deliberate — the fragmentation is a social signal that pushes the user to normalize identity via environment variable or a new `AGENTS_MAP.md` entry. Fallback is a safety valve, not an operating mode.

### `AGENTS_MAP.md` governance *(v2.0.0+)*

`.agents/AGENTS_MAP.md` is shared project state, versioned with the project repo, **and maintainer-managed**:

- The agent never edits `AGENTS_MAP.md` autonomously. When direct self-identification succeeds but the tool signature is not mapped, the agent proposes the addition to the user (`"detected unmapped signature 'X'; add 'X = <slug>' to AGENTS_MAP.md?"`) and waits for explicit confirmation. The human or maintainer commits the change through the normal project channel (git commit, OneDrive sync, etc.).
- Rationale: autonomous mutation of shared versioned state creates silent conflicts and opaque audit trails. Orchestration of agents operates on **explicit commands**, not on inferred state.
- Interaction with the fallback: if the user ignores the proposal, the agent keeps operating under `unknown-agent-<timestamp>/` for every new session. The accumulating folders are the signal — no other nag is needed.

Not to be confused with the repository-root `AGENTS.md`, which is a universal pointer file for agents (Cursor, Claude Code, Antigravity, etc.) and serves a different purpose — hence the `_MAP` suffix on this file.

### Resolved path

Once `<actor>` and `<agent>` are resolved, volatile state for this session lives under:

```
.agents/local/<actor>/<agent>/handoff.md
.agents/local/<actor>/<agent>/tasks/TASK.md
.agents/local/<actor>/<agent>/activity.log
.agents/local/<actor>/<agent>/lessons.md
```

`.agents/local/` is always gitignored (see the template `.gitignore`). It never travels between contributors.

### Append-at-tail rule (concurrency-safe writes)

Every shared project-layer file that grows over time — `JOURNAL.md`, `LESSONS.md`, `decisions.jsonl`, and each actor's personal `activity.log` — is **append-only at the end of the file**. Prepending (adding at the top) requires reading and rewriting the full file, which corrupts under simultaneous writes on a synced folder (OneDrive, Google Drive). Append at the tail is the only operation that is reasonably safe across every supported substrate (git, cloud-sync, local-only).

Consequences:

- `JOURNAL.md` reads oldest-first, newest-last. Agents consult recent entries via `tail -n N` or the functional equivalent, not `head`. There is no top-of-file index to drift.
- `LESSONS.md` has no top-of-file table of contents. Queries go through `grep` over inline tags (`grep -A 10 "tags:.*rate-limit" LESSONS.md`).
- `decisions.jsonl` is JSON Lines, one object per line (see *Decisions log* below), not a JSON array — a JSON array cannot be appended to atomically.

### Handoff schema (`local/<actor>/<agent>/handoff.md`) — strict, always overwritten

```markdown
# handoff.md — Current operational state
> Version: X.Y | Updated: YYYY-MM-DD

**Last Agent:** [Agent signature]
**Timestamp:** YYYY-MM-DD HH:MM
**Status:** STABLE | BLOCKED | IN_PROGRESS
**Last Action:** <1 sentence>
**Pending Step:** <what's next or "None">
**Blockers/Context:** <errors, files, warnings, or "None">
**Open Threads:** <unrelated pending items, or "None">

**Session close checklist (self-verified):**
- [ ] `activity.log` contains an entry for this session
- [ ] `decisions.jsonl` appended (if any decision was made)
- [ ] `local/<actor>/<agent>/lessons.md` appended (if a personal lesson emerged)
- [ ] `LESSONS.md` appended (if a project-level lesson emerged)
- [ ] `JOURNAL.md` appended (if the session produced a structurally significant delivery)
- [ ] Commit(s) follow `[Agent] <type>: <summary>` convention
- [ ] Version bumps applied to any rules file whose content changed
- [ ] `active_sessions.md` row for this session removed (if registry is in use)
- [ ] Session-close state written on the feature branch before the PR is opened (when substrate uses pull requests — see §M-git-6)
```

Schema is immutable — no agent may add sections, tables, or free paragraphs. Timestamp must include HH:MM. The session close checklist is **part of the schema**; each box is self-verified by the agent before closing. Unchecked boxes signal incomplete close to the next agent.

Each pair `(actor, agent)` has its own `handoff.md` — agents operated by the same actor never compete for writes on the same file. When the owner wants to hand context from one agent to another, the path is **publishing a checkpoint in `.agents/checkpoints/`**, not overwriting the peer's handoff.

Projects that distribute pristine handoff templates (placeholder-populated, not yet in use) see `modules/meta-repo.md §M-meta-4`.

### Takeover rule

| Condition | Behavior |
|---|---|
| Timestamp **< 30 min ago** AND no peer session live in `active_sessions.md` for the same `(actor, agent)` pair | Do not proceed. Assume prior agent is still active. |
| Timestamp **< 30 min ago** AND a different pair is live in `active_sessions.md` | Two pairs are legitimately concurrent. Do NOT take over — see *Concurrent sessions* below. |
| Timestamp **≥ 30 min ago** | Assume interrupted. Record takeover in `decisions.jsonl` with rationale `"Takeover: previous session assumed interrupted (>30min)"`. Run recovery mode before proceeding. |
| Timestamp **< 30 min** + explicit human override | Proceed. Rationale: `"Forced takeover: human override"`. |

Takeover is scoped to the `(actor, agent)` pair's own `handoff.md`. A peer pair's recent activity never triggers a takeover of your own handoff.

### Recovery mode

Before continuing a prior `Pending Step`:

1. Read the last entry in `.agents/decisions.jsonl` (tail the file; `decisions.jsonl` is append-only).
2. Spot-check files listed in `files_affected`.
3. If state is inconsistent (missing headers, version conflicts, half-written content): fix or revert first — never build on corrupted state.
4. Log the recovery action in `decisions.jsonl`.

Meta-repos with two `decisions.jsonl` files (IDE vs. template) see `modules/meta-repo.md §M-meta-3`.

### Decisions log (`.agents/decisions.jsonl`) — append-only, immutable

`decisions.jsonl` is **JSON Lines** — one JSON object per line, no enclosing array, no comma between entries. The canonical schema for a single entry is `schemas/decisions.entry.schema.json` (introduced in v2.0.0). The pre-v2 array-form `decisions.schema.json` is removed, not kept as a legacy alias, so there is no ambiguity about which schema is authoritative.

```jsonl
{"timestamp":"2026-04-21T15:30:00","agent":"[Claude Code / claude-opus-4-7]","decision":"Short imperative","rationale":"Why","files_affected":["path/to/file.md"],"status":"completed"}
{"timestamp":"2026-04-21T16:05:00","agent":"[Codex / GPT-5.4]","decision":"...","rationale":"...","files_affected":[],"status":"completed"}
```

Why JSONL, not a JSON array:

1. **Atomic append.** Adding a decision is writing one line at the end — no read, parse, re-serialize, rewrite. Two contributors appending from a synced folder in the worst case reorder lines; the file remains structurally valid.
2. **Cheap line-by-line query.** Agents grep or filter line-by-line without loading the full file — consistent with the demand-load contract in `§P-Access`.
3. **Scales past the point a JSON array becomes an anti-pattern.** A 200-entry JSON array is unreadable without tooling; 200 JSONL lines are trivially filterable.

Never edit past entries. If the file is corrupted (a line is not valid JSON), the recovery agent fixes the structure before appending new entries.

### Commit convention

```
[Agent] <type>: <short summary>
```

Where `[Agent]` is `[Claude]`, `[Cursor]`, `[Codex]`, etc., and `<type>` is `feat|fix|refactor|docs|ops|chore`. This convention is substrate-neutral — it applies whether the underlying system is git, a cloud-sync folder, or any other change-tracked substrate. Substrate-specific workflows (branching, pull requests, CI) live in substrate modules such as `modules/git-substrate.md`.

### Session close ritual *(v1.5.0+, updated in v2.0.0)*

A **"non-trivial session"** is one where any of the following occurred:

- A change was committed (by the active substrate's commit mechanism)
- A review/approval artifact was opened, updated, or merged (when a substrate module defines one)
- A file outside `.agents/local/<actor>/<agent>/` was modified
- A product, strategy, or architectural decision was made
- A user-facing deliverable was shipped

At the end of a non-trivial session, the agent **must** update every applicable artifact below **and** check the corresponding box in the `handoff.md` session close checklist:

| Artifact | Mandatory trigger | Skip if |
|---|---|---|
| `local/<actor>/<agent>/handoff.md` | Always | Never skipped |
| `local/<actor>/<agent>/activity.log` | Any session activity worth remembering locally | Pure read-only Q&A that produced nothing reusable |
| `.agents/decisions.jsonl` | A decision was made, a file was created/renamed/deleted, or a version was bumped | No decisions and no file state changed |
| `local/<actor>/<agent>/lessons.md` | A **personal** lesson emerged (about how this actor × agent pair works) | No personal lesson emerged |
| `.agents/LESSONS.md` | A **project-level** lesson emerged (applies to any actor working here) | No project-level lesson emerged |
| `.agents/JOURNAL.md` | The session produced a **structurally significant delivery** (see promotion rule below) | Routine activity, small fixes, exploration |
| `.agents/sessions/active_sessions.md` | Registry is in use and this session has an open row | Registry not in use, or no open row |

**JOURNAL promotion — procedural, not heuristic.** At session close, the agent asks the user exactly one procedural question: *"Did this session produce a structurally significant delivery? If yes, promote to JOURNAL."* The user replies with one word. No background detection, no heuristic guessing — orchestration of agents operates on **explicit commands**, never on state inference. The criterion for a "yes" is the six-month test: *if a new contributor arriving in six months would still benefit from seeing this entry, it belongs in JOURNAL; otherwise it belongs only in the actor's personal `activity.log`*.

### Branch ordering rule *(v2.0.1+)*

Session close is the **final operational step on the feature branch**. Complete all session-close artifacts — handoff, decisions, lessons, and JOURNAL updates — before opening or merging the pull request.

**Why this order matters:** if session-close state is written on the default branch after merge, protected-branch settings may block the write or force a follow-up PR for state files only. This creates unnecessary review overhead and an audit gap where the handoff describes work that is not yet in the branch history.

**Implementation rule:** the session-close checklist in `handoff.md` is complete (all boxes checked) when the pull request is **opened**, not after it merges. Agents must not mark the session closed and then create a separate follow-up PR to write state files.

This rule is substrate-neutral. Git-specific enforcement and rationale live in the active substrate module (see `modules/git-substrate.md §M-git-6`).

**Verification step (mandatory before closing):**

Before the final response of the session, the agent verifies that each *applicable* artifact carries today's date. The implementation is substrate-agnostic — shell grep, file tooling with date filtering, or a direct read-and-check — whichever is cheapest in the active environment. If an applicable artifact does not carry today's date, the update was skipped — fix before closing.

**Personal vs project-level lessons — decision rule:**

- `local/<actor>/<agent>/lessons.md` captures lessons **about how this specific pair operates**: this agent's tool-failure modes with this actor's workflow, recovery protocols specific to the IDE, format drift noticed by this agent, cross-agent coordination patterns. Example: *"Marco tends to forget to run migrations before testing — remind next session"*.
- `.agents/LESSONS.md` captures lessons **about the project or domain**: any actor working on this project needs to know this. Systemic mistakes, decision criteria, recurring bug patterns, process fixes. Example: *"External API Z rate-limits aggressively in staging (5 req/s vs 50 req/s in prod); set a 30s timeout"*.

When in doubt, a lesson is project-level if removing the specific pair would still leave the lesson valid. If the lesson is about *how this agent or this actor works*, it is personal.

### Concurrent sessions and mid-session checkpoints *(v1.6.0+, updated in v2.0.0)*

Real-world tooling (multiple IDEs, multiple agents, multiple terminals rooted at the same repo) routinely runs more than one session live at a time — indeed, this is the primary use case for the protocol. Two mechanisms keep concurrent sessions legible without breaking any schema.

**Active sessions registry** — `.agents/sessions/active_sessions.md`

A flat markdown table, one row per live session. The agent appends its row on session start and removes the row on session close (session close checklist item).

Schema — immutable columns:

```markdown
# active_sessions.md — Sessions currently live
> Append row on session start. Remove row on session close.
> Stale rows (>24h with no checkpoint update) may be removed by any next agent with a decisions.jsonl log.

| Session ID | Agent | Started | Topic | Last checkpoint |
|---|---|---|---|---|
| 2026-04-21-1310-claude | [Claude Code / claude-opus-4-7] | 2026-04-21 13:10 | <1-line topic> | <checkpoint filename or —> |
```

**Session ID format:** `YYYY-MM-DD-HHMM-<agent-short>`. The `<agent-short>` suffix (`claude`, `gemini`, `cursor`, `codex`, etc.) prevents ID collision when two agents boot in the same minute.

**Effect on takeover rule:** when `active_sessions.md` exists and holds a row for a peer session whose Started timestamp is within the last 30 minutes OR whose Last checkpoint is within the last 30 minutes, the current agent MUST NOT take over the peer's own pair state. Concurrent sessions are legitimate — append a new row for the current session instead. Takeover of your own handoff, gated by the 30-minute rule, continues to apply.

**Mid-session checkpoints** — `.agents/checkpoints/YYYY-MM-DDTHHMMSS_<agent>_<title-slug>.md`

A checkpoint is a pre-execution snapshot written voluntarily by the agent at the owner's request (or proactively when the agent is about to take an action that would benefit from a second opinion). Checkpoints are ephemeral working notes — authoritative state lives in `handoff.md`, `decisions.jsonl`, and project files.

Checkpoints remain at the **project layer**, shared, not inside `local/`. The whole point of a checkpoint is that any peer agent in the repository can find and read it; moving checkpoints into per-pair private space would defeat the multi-agent consultation pattern that justifies the protocol in the first place.

**Unique name convention:** `YYYY-MM-DDTHHMMSS_<agent>_<title-slug>.md`. Timestamp at second precision plus the `<agent>` slug guarantee uniqueness even when two agents checkpoint the same topic on the same day. The title slug is a human-readable affix; uniqueness comes from timestamp plus agent, not from the slug.

Template — content must be self-contained so a peer agent reads it without the conversation transcript:

```markdown
# Checkpoint — <topic>
> Session: <session-id from active_sessions.md>
> Timestamp: YYYY-MM-DD HH:MM
> Author: [Agent signature]

## Open question
<what is being decided, in one sentence>

## Data gathered
<bullet list of sources consulted + key findings, with inline citations to repo files>

## Current recommendation
<what the agent is about to execute, in concrete terms — files, commits, decisions>

## What specifically needs second-opinion
<the exact part where contrarian input would be most valuable>
```

**Usage pattern:** when the owner asks for a second opinion from a peer agent, the current agent writes the checkpoint and updates the `Last checkpoint` column of its row in `active_sessions.md`. The owner opens the peer agent in another window; the peer agent boots per `§P5`, sees the fresh checkpoint referenced in `active_sessions.md`, reads it, and responds with contrarian input. No copy-paste required.

**Retention:** no automatic retention policy. Checkpoints accumulate as an audit trail. If `.agents/checkpoints/` grows beyond practical limits, the project may adopt a retention rule in `PROJECT_RULES.md §J8`.

**Scope limits:**

- The registry is advisory, not a lock. It does not prevent two agents from editing the same file concurrently — resolve conflicts per the active substrate module.
- Checkpoints do not replace `handoff.md`. They coexist: checkpoint = live snapshot of an in-progress decision; handoff = authoritative state at session close for one pair.
- Neither the registry nor checkpoints are required when only one agent ever operates on the repo. Single-pair projects may leave `active_sessions.md` empty and never write a checkpoint.

## §P-Access — Load-on-demand access protocol *(v2.0.0+)*

Every session that boots an agent pays a token cost proportional to what it reads. Real-world Lead Protocol usage involves many sessions per day per project. A naive "read everything to be safe" policy multiplies that cost by the size of the historical record and makes the protocol unviable at scale. `§P-Access` specifies what the agent reads up front, what it reads on demand, and how to keep baseline cost bounded.

### Division of authority between CORE and PROTOCOL

For the baseline to stay light without creating a split-brain of governance, the two framework files divide responsibilities by **level of detail**, not by authority:

- **`CORE_RULES.md`** — what the agent **must know to operate correctly at every session start**. Protocol index, essential contracts (three-layer state model, `(actor, agent)` identification, append-at-tail, checkpoints as shared coordination), pointers to the detailed sections in this file. Size budget: **under 5k tokens**. Mandatory in the baseline load.
- **`PROTOCOL_RULES.md`** — detail, schemas, recovery procedures, edge cases, threat model, cross-repo semantics. Consulted **on demand**, when the agent hits a situation whose handling CORE points here for.

**Governance invariant:** `CORE` does not repeat `PROTOCOL` — it references. If the agent finds a conflict between `CORE` and `PROTOCOL`, `PROTOCOL` wins (see `§P2`). The split is editorial, not authoritative.

### Baseline load (every session, budget ~5–8k tokens)

Read order matters: the `(actor, agent)` pair must be resolved *before* the pair-specific handoff path can be formed. That forces `AGENTS_MAP.md` to precede the handoff in the boot sequence.

1. `.agents/CORE_RULES.md` — index plus essential contracts.
2. `.agents/PROJECT_RULES.md` — project identity.
3. `.agents/modules/<scope>.md` — for each scope listed in `§J8 Active modules` (in declaration order).
4. `.agents/AGENTS_MAP.md` — tool-signature → agent-slug map. Required to resolve `<agent>` before the handoff path can be formed.
5. `.agents/sessions/active_sessions.md` — concurrent-session awareness, needed before any write to the pair's handoff.
6. `.agents/local/<actor>/<agent>/handoff.md` — state of this pair. Only accessible once `<agent>` is resolved.
7. Listing (not reading) of `.agents/checkpoints/` — the agent knows which checkpoints exist and reads individual files on demand when they become relevant.

### On-demand load contract (substrate-agnostic)

The protocol prescribes **behavior** ("do not process more than is necessary to answer the current question"), not tooling. The agent picks the cheapest implementation available in its environment. A refined implementation (native offset reads) costs fewer tokens; a minimal implementation (load whole file, filter in-prompt) still satisfies the contract — it pays more, but semantics are identical. Whatever the substrate, the following access pattern applies:

| Artifact | Pattern |
|---|---|
| `JOURNAL.md`, `local/<actor>/<agent>/activity.log` | Read the **last N lines** (files are append-at-tail, recent entries at the end). Implementation: offset-from-end read, `tail -n`, or equivalent. |
| `LESSONS.md` | **Grep on inline tags** (e.g., `grep -A 10 "tags:.*rate-limit" LESSONS.md`). There is no manual top-of-file index. Sequential tail reading only when no specific tag is known. |
| `decisions.jsonl` | Filter by topic / actor / date. Implementation: line-level grep, `jq`, or in-memory filter. |
| `PROTOCOL_RULES.md` | Only when invoked explicitly by reference from `CORE_RULES.md`. Not loaded up front. |
| `.agents/checkpoints/<file>.md` | Read on demand by specific filename (typically listed in `active_sessions.md → Last checkpoint` or recommended by the owner). Never load the whole directory preemptively. |

**Absolute rule:** never load a historical file in full without a specific justification tied to the current question. *"My tooling has no offset read"* is not a justification — it is an implementation limitation to work around via shell (`tail`, `grep`) or in-memory filter. If the agent cannot do better than a full load, it pays the cost explicitly once and does not let that pattern become the default.

### File-size targets

- `JOURNAL.md` active file: **< ~500 lines**. Move older entries into `archive/JOURNAL-<year>.md` when exceeded.
- `LESSONS.md` active file: **< ~300 lines**. Move older entries into `archive/LESSONS-<year>.md` when exceeded.
- `activity.log`: no hard limit — the agent reads only the last N lines. Monthly rotation into `activity_YYYY-MM.log` is optional.

### Where to find more

Detailed schemas for the state files listed above live in `.agents/schemas/` (when the project ships that directory). Substrate-specific access additions — e.g., a meta-repo's dual-copy layout or a git-substrate's PR-triggered validation — live in the corresponding module files under `.agents/modules/`.

## §P-Threat — Threat model *(v2.0.0+)*

The protocol is narrow about what it guarantees. Overselling guarantees is how agents and humans misplace trust.

### The protocol guarantees

- **Isolation of session state per `(actor, agent)` pair.** `handoff.md`, `TASK.md`, `activity.log`, and personal `lessons.md` of a pair are never overwritten by another pair — even on the same machine, even for the same human actor.
- **No leak of personal state through a shared git repository** when the template's `.gitignore` (which excludes `.agents/local/`) is respected.
- **Best-effort append-at-tail safety for shared files.** `JOURNAL.md`, `LESSONS.md`, `decisions.jsonl`, and activity logs are appended only at the end. This minimizes the concurrent-write window and prevents structural corruption (truncated arrays, overwritten headers). Individual lines may be lost if two writes coincide on the exact same instant in a synced folder, but the file remains valid and readable.

### The protocol does NOT guarantee

- **Zero line loss under simultaneous writes on a cloud-sync folder.** OneDrive, Google Drive, and similar substrates can drop one of two lines written in the same instant. Mitigations: unique names for per-file artifacts (checkpoints never collide), social coordination for shared append-only files, and the actor's own `activity.log` as a personal fallback trace.
- **Confidentiality between actors who voluntarily share a folder.** A OneDrive folder shared between Marco and João is technically visible to both; the protocol isolates state at the file level (no overwrite) but not at the content level (no hidden files from a folder sibling). That is IT hygiene, not protocol design.
- **Encryption of state files.**
- **Granular per-file access control.**
- **Read auditing.**
- **Distributed locking or automatic conflict resolution.**

### Deployment recommendations from the threat model

- **One actor, many agents** (primary product use case): any substrate works well — OneDrive, standalone folder, GitHub.
- **Many actors, active simultaneous development**: GitHub is the recommended substrate. OneDrive is feasible with social coordination on append-only files.
- **Strict isolation between actors required** (confidentiality, compliance): use separate Git repositories or enforce access at the IT layer. Lead Protocol does not implement this level of isolation.

## §P4 — Generic quality checklist

Before closing any significant action:

- [ ] Persona/agent signature present in every recorded change and in `handoff.md`
- [ ] `local/<actor>/<agent>/handoff.md` overwritten with current state (Status, Timestamp HH:MM, Last Action, Pending Step, session close checklist)
- [ ] `.agents/decisions.jsonl` appended with rationale and files_affected (if applicable per `§P3` session close ritual)
- [ ] `local/<actor>/<agent>/activity.log` appended with one line per logical action (if applicable per `§P3` session close ritual)
- [ ] If a new **personal** pattern/bug learned → append to `local/<actor>/<agent>/lessons.md`
- [ ] If a new **project-level** pattern/bug learned → append to `.agents/LESSONS.md`
- [ ] JOURNAL promotion question asked; if user says yes → append to `.agents/JOURNAL.md`
- [ ] Commit record follows `[Agent] <type>: <summary>` convention (`§P3`)
- [ ] Version bumps applied to any rules file or module whose content changed
- [ ] Session close checklist in `handoff.md` fully verified (today-date verification per `§P3`)
- [ ] If `.agents/sessions/active_sessions.md` is in use, the row for this session has been removed
- [ ] Any additional checks required by an active module have been satisfied

## §P5 — Operational model (generic)

- Every agent reads, on session start, in order: `CORE_RULES.md` → `PROJECT_RULES.md` → each active module → `AGENTS_MAP.md` → `sessions/active_sessions.md` → `local/<actor>/<agent>/handoff.md`. See `§P-Access` for the full baseline load.
- The active Session Protocol level (1/2/3), the active substrate, and the list of active modules are declared in `PROJECT_RULES.md §J8`.
- Edits to framework files (`PROTOCOL_RULES.md` kernel, any module file) only happen via methodology upgrade — never ad-hoc.
- Edits to business files (`PROJECT_RULES.md`, project reference docs) happen per project rules in `§J8`.
- `.agents/AGENTS_MAP.md` is maintainer-managed. Agents propose additions; humans commit them. See `§P3` *`AGENTS_MAP.md` governance*.
- Language: operational files (`CORE_RULES`, `PROTOCOL_RULES`, `PROJECT_RULES`, module files, `handoff`, `decisions.jsonl`, `JOURNAL`, `LESSONS`, `activity.log`, `AGENTS_MAP`, `active_sessions`, checkpoints) are always EN-US.
- Additional module-specific boot steps may apply — see each active module's header.

## §P6 — Cross-repository references

When a project references resources in other repositories (personal context, external specs, sibling repos):

1. **Portable identifiers** — Always use `org/repo` (e.g., `acme/private-context`). Never use local machine paths (e.g., `C:\Dados\...` or `/home/user/...`). Local paths break on other machines and are not traceable.
2. **Pointer, not copy** — When information exists in a canonical repo, other locations must contain only pointers (`§J6` with repo reference). Never duplicate full content. If duplicated, reduce the copy to a summary + pointer.
3. **Deduplication** — Before recording information in more than one location (local memory, repo A, repo B), check: does this information already have a canonical home? If yes, pointer. If no, elect a home and point the rest.
4. **Reference format in `§J6`** — For external repos, use format: `Repo 'org/repo' (private|public) — path/to/file.md`. Include visibility flag so agents know if authentication is required.

## §P7 — Private vs shared context separation

**Problem:** Context relevant to an AI agent may be sensitive enough that it must not leak into repos shared more widely. This applies in two analogous tiers:

- **Personal tier:** an individual owner's context (identity, finances, strategic goals, private decisions) that must not leak into repos shared with a team.
- **Organizational tier:** a company's confidential context (financials, strategic plans not yet public, compensation, privileged legal matters) that must not leak into repos shared beyond the director/C-level circle.

**Rule:** isolate sensitive context in a dedicated private repo, and reference it by name from the less-private repos that consume it. The pattern is the same in both tiers — only the audience and the repo name differ.

| Context tier | Canonical private repo | Consumers |
|---|---|---|
| Personal | `owner/private-context` (owner-only) | Owner's personal project repos |
| Organizational | `org/business-vault` (directors/C-level only) | Team-shared company repos |

Both tiers are **optional** — projects without sensitive context at the corresponding tier simply don't have a `private-context` or `business-vault` repo. The rules below apply wherever the pattern is used.

**Rules:**

1. **Private context repo** lives separately from any repo shared with a wider audience. Owner-level private context lives in a personal private repo (e.g., `owner/private-context`); organizational-level confidential context lives in a directors-only repo (e.g., `org/business-vault`).
2. **Consuming repos** (team-shared project repos, documentation repos) reference the private repo only by name in `§J6`, with explicit rule: `"Never copy content from this repo into [consuming repo] or any repo with a wider audience."`
3. **Harness local memory** (e.g., `~/.claude/projects/*/memory/`) may contain a lightweight summary + pointer to the private repo. Never the full content — avoid duplication and drift.
4. **The private repo** must follow the full Lead Protocol (`.agents/`, `PROTOCOL_RULES.md`, `PROJECT_RULES.md`, `handoff.md`, `decisions.jsonl`) like any other project.
5. **Content that belongs in the personal private repo (`private-context`):** owner's identity, personal strategic goals, permanent personal decisions, personal lessons learned, personal digital presence, family/health/financial context.
6. **Content that belongs in the organizational private repo (`business-vault`):** company financials, strategic plans not yet public, personnel and compensation, legal matters under privilege.
7. **Content that belongs in the team-shared repo:** methodology, system architecture, runbooks, product technical decisions, team operational context.
8. **Opt-in activation:** projects without sensitive context at a given tier do not need to create a corresponding private repo. The rule activates only when such context exists and needs a home.

## §P9 — Modules architecture *(v1.9.0+)*

The kernel above is substrate-agnostic and role-agnostic. Substrate-specific and role-specific rules live in opt-in module files under `.agents/modules/`. This section defines the module contract.

### File layout

- `.agents/modules/<scope>.md` — one file per module; `<scope>` is lowercase kebab-case.
- `.agents/modules/README.md` — one-paragraph index listing available modules.
- Each module file carries its own `> Version: X.Y.Z` header and bumps per `§P1` independently of the kernel.

### Anchor convention

Sections inside a module use anchors of the form `§M-<scope>-N`. Examples: `§M-git-1`, `§M-meta-3`. The `§M-` prefix disambiguates module anchors from kernel `§P` anchors and project `§J` anchors.

### Activation

A project declares its active substrate and active modules in `PROJECT_RULES.md §J8`:

```markdown
- **Active substrate:** git+github | git | local | cloud-sync | other
- **Active modules:** <comma-separated scope names, or `none`>
```

A module is in effect if and only if its scope appears in `Active modules`. Activation order determines precedence between modules (earlier entries win conflicts between modules). The kernel always outranks any module.

### Boot

Agents read active modules after `PROJECT_RULES.md` and before `AGENTS_MAP.md` / `sessions/active_sessions.md` / `handoff.md`, in the order listed in `§J8 Active modules`. See `§P-Access` for the full baseline load sequence.

### Authoring rules

- A module cannot contradict the kernel. It can only add substrate-specific or role-specific rules.
- When a module cites a kernel anchor, use the fully qualified form `PROTOCOL_RULES §Px` to mark the module→kernel crossing explicitly.
- A module may depend on another module only if it declares the dependency in its header.
- Module CI/tooling (if any) must include a top-of-file comment identifying the module it enforces, so consumer repos that do not list the module know not to copy the tooling.

## §P10 — First-run setup interview *(v2.1.0+)*

Lead Protocol ships `PROJECT_RULES.md` as a pristine template: `[Project Name]`, bracketed `[e.g., ...]` examples, and an unconfigured `§J8`. Whether a project was scaffolded by copying the release files or by the bundled CLI, the template is identical and must be configured before the protocol can operate correctly, because without a real `§J8 Active modules` the agent cannot even finish its baseline boot (step 3 loads the modules named there). Consumers frequently skip this step and let agents run against the raw template. This section makes configuration a hard, self-clearing boot gate.

### Pristine detection

After reading `PROJECT_RULES.md` (baseline boot step 2), the project is **unconfigured** when ANY of these holds:

- `PROJECT_RULES.md` is absent.
- The `§J1` **Name** value still contains a `[...]` placeholder (for example, `[Project Name]`).
- The `§J8` **Active substrate** or **Active modules** value still contains a `[...]` placeholder.

Detection is purely textual (a `[` inside the field value), the same signal the bundled CLI already uses. There is no separate marker file; the filled fields are the marker.

### Framework-source carve-out

If a sentinel file named `.lead-protocol-source` exists at the repository root, the gate is disabled. This marks the Lead Protocol framework's own development and distribution source, whose scaffold is pristine by design and must stay that way to ship. The sentinel lives outside `.agents/`, so it never travels to a consumer project through either install path.

### The gate (interactive environments)

When a project is unconfigured and not carved out, the agent MUST, before performing any other requested work:

1. Pause the user's request and state that the project is not yet configured.
2. Run the setup interview (below).
3. Write the answers into `PROJECT_RULES.md`.
4. Resume the user's original request.

The user may defer exactly once by replying `later` or `skip`. The agent then performs the requested work but operates under an explicit "project unconfigured" caveat, and the gate re-fires at the start of every subsequent session. Deferral is never persisted: there is no "don't ask again". This mirrors the `§P3` AGENTS_MAP fallback, where an unresolved state recurs as a social signal rather than being silently suppressed.

### Non-interactive environments

If the environment is non-interactive (any of `CI`, `GITHUB_ACTIONS`, `CODESPACES`, `DEVCONTAINER` is set, or no interactive input channel exists, the same signals `§P3` uses for `<actor>` ephemeral detection), the agent skips the interview, emits a single warning that `PROJECT_RULES.md` is unconfigured, proceeds with the task, and persists no configured state. The next interactive session is gated normally.

### Interview content

The interview gathers the minimum needed for identity and operation. Soft fields are defaulted with a `refine later` note rather than asked:

| # | Question | Writes to |
|---|---|---|
| 1 | Project name | `§J1` Name and the document title line |
| 2 | Type and one-line purpose | `§J1` Type, Purpose |
| 3 | Primary stack | `§J1` Stack |
| 4 | Substrate (`git+github` / `git` / `local` / `cloud-sync` / `other`) | `§J8` Active substrate; auto-derives `§J8` Active modules (`git` or `git+github` gives `git-substrate`; otherwise `none`) and a default branch convention |
| 5 | Primary language for source and docs | `§J4` (source/docs row). AI operational files stay EN-US regardless, per `§P5` |
| 6 | Which agents operate here | `§J2` table (defaults: the current agent as lead, Humans as reviewer) |

After the interview the agent:

- Fills every bracketed field it has an answer for. Sets soft or unsupplied fields (`§J3` tone, `§J5` extra checks, `§J1` Consumers) to sensible defaults annotated `<!-- refine later -->`. It never leaves a `[...]` placeholder in Name or `§J8`.
- Stamps the `> Updated:` header with today's date.
- Proposes any new agent-signature rows for `AGENTS_MAP.md` to the user for confirmation, but does NOT write `AGENTS_MAP.md` itself (`§P3`: AGENTS_MAP is maintainer-managed).

### Idempotency

Once Name and `§J8` carry real values, pristine detection returns false and the gate never fires again. No flag, no marker, nothing to drift.
