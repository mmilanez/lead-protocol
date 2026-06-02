# PROTOCOL_RULES.md — Lead Protocol framework rules (generic)

> Version: 1.9.2 | Updated: 2026-06-01
> Scope: Substrate-agnostic kernel. Opt-in modules live in `modules/` and are activated via `PROJECT_RULES.md §J8`.
> This file contains no project-specific content — that lives in `PROJECT_RULES.md`.

---

## §P1 — Versioning

| File type | Format | Example | When to bump |
|---|---|---|---------|
| Agent operation files (`CORE_RULES.md`, `PROTOCOL_RULES.md`, `PROJECT_RULES.md`, `handoff.md`) | `X.Y.Z` | `1.4.0` | Patch (Z) for clarifications/text fixes; Minor (Y) for new sections/rules; Major (X) for structural rewrites |
| Module files (`modules/*.md`) | `X.Y.Z` | `1.0.0` | Same rules as agent operation files. Each module versions independently from the kernel. |

Projects that adopt Lead Protocol may use any versioning scheme for their own product releases — the Lead Protocol versioning rules apply only to the agent operation files and module files listed above.

Meta-repos that develop the protocol itself see `modules/meta-repo.md §M-meta-1`.

## §P2 — Authority hierarchy (framework tier)

1. `PROTOCOL_RULES.md` (framework kernel)
2. Active modules listed in `PROJECT_RULES.md §J8` (in declaration order)
3. `handoff.md` (current state — may temporarily override stale rules if the project owner defines a temporary directive)
4. `PROJECT_RULES.md` (business context)
5. `README.md` (public surface — kept synced to the kernel per the active substrate module if any; kernel wins on conflict)
6. Project reference files (brand, product, channel, etc.)
7. Official platform policies
8. General best practices

A module cannot contradict the kernel — it can only add rules specific to a substrate, scope, or role. Where a module cites a kernel anchor, the qualifier `PROTOCOL_RULES §Px` makes the cross-file reference explicit.

Meta-repos maintaining two copies of the framework see `modules/meta-repo.md §M-meta-2`.

## §P3 — Multi-agent coordination

### Handoff schema (`agent_log/handoff.md`) — strict, always overwritten

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
- [ ] `activity_YYYY-MM.md` contains an entry for this session
- [ ] `decisions.json` appended (if any decision was made)
- [ ] `agent_lessons.md` appended (if an agent-level lesson emerged)
- [ ] `tasks/lessons.md` appended (if a project-level lesson emerged)
- [ ] Commit(s) follow `[Agent] <type>: <summary>` convention
- [ ] Version bumps applied to any rules file whose content changed
- [ ] `active_sessions.md` row for this session removed (if registry is in use)
- [ ] Session-close state written on the feature branch before the PR is opened (when substrate uses pull requests — see §M-git-5)
```

Schema is immutable — no agent may add sections, tables, or free paragraphs. Timestamp must include HH:MM. The session close checklist is **part of the schema** (added in Lead Protocol v1.5.0; `active_sessions.md` entry added in v1.6.0) — each box is self-verified by the agent before closing. Unchecked boxes signal incomplete close to the next agent.

Projects that distribute pristine handoff templates (placeholder-populated, not yet in use) see `modules/meta-repo.md §M-meta-4`.

### Takeover rule

| Condition | Behavior |
|---|---|
| Timestamp **< 30 min ago** AND no peer session live in `active_sessions.md` | Do not proceed. Assume prior agent is still active. |
| Timestamp **< 30 min ago** AND a different session is live in `active_sessions.md` | Two sessions are legitimately concurrent. Do NOT take over — see §P3 concurrent sessions. |
| Timestamp **≥ 30 min ago** | Assume interrupted. Record takeover in `decisions.json` with rationale `"Takeover: previous session assumed interrupted (>30min)"`. Run recovery mode before proceeding. |
| Timestamp **< 30 min** + explicit human override | Proceed. Rationale: `"Forced takeover: human override"`. |

### Recovery mode

Before continuing a prior `Pending Step`:
1. Read the last entry in `decisions.json`.
2. Spot-check files listed in `files_affected`.
3. If state is inconsistent (missing headers, version conflicts, half-written content): fix or revert first — never build on corrupted state.
4. Log the recovery action in `decisions.json`.

Meta-repos with two `decisions.json` files (IDE vs. template) see `modules/meta-repo.md §M-meta-3`.

### Decisions log (`agent_log/decisions.json`) — append-only, immutable

```json
[
  {
    "timestamp": "2026-04-17T15:30:00",
    "agent": "[Claude Code / claude-opus-4-6]",
    "decision": "Short imperative",
    "rationale": "Why",
    "files_affected": ["path/to/file.md"],
    "status": "completed"
  }
]
```

Never edit past entries. If the JSON is corrupted, the recovery agent fixes structure before appending.

### Commit convention

```
[Agent] <type>: <short summary>
```

Where `[Agent]` is `[Claude]`, `[Cursor]`, `[Codex]`, etc., and `<type>` is `feat|fix|refactor|docs|ops|chore`. This convention is substrate-neutral — it applies whether the underlying system is git, a cloud-sync folder, or any other change-tracked substrate. Substrate-specific workflows (branching, pull requests, CI) live in substrate modules such as `modules/git-substrate.md`.

### Session close ritual *(v1.5.0+)*

A **"non-trivial session"** is one where any of the following occurred:

- A change was committed (by the active substrate's commit mechanism)
- A review/approval artifact was opened, updated, or merged (when a substrate module defines one)
- A file outside `agent_log/` was modified
- A product, strategy, or architectural decision was made
- A user-facing deliverable was shipped (listing, pin, copy, export)

At the end of a non-trivial session, the agent **must** update every applicable artifact below **and** check the corresponding box in the `handoff.md` session close checklist:

| Artifact | Mandatory trigger | Skip if |
|---|---|---|
| `handoff.md` | Always | Never skipped |
| `decisions.json` | A decision was made, a file was created/renamed/deleted, or a version was bumped | No decisions and no file state changed |
| `activity_YYYY-MM.md` | A commit, review artifact, or major artifact change occurred | Pure reads / inspection / Q&A sessions |
| `agent_lessons.md` | An **agent-level** lesson emerged (format drift, tool failure, recovery incident, cross-agent coordination pattern) | No new agent-level lesson |
| `tasks/lessons.md` | A **project-level** lesson emerged (bug pattern, process flaw, systemic decision criterion) | No new project-level lesson |
| `active_sessions.md` | Registry is in use and this session has an open row | Registry not in use, or no open row |

### Branch ordering rule *(v1.9.2+)*

Session close is the **final operational step on the feature branch**. Complete all session-close artifacts — handoff, decisions, lessons, and journal updates — before opening or merging the pull request.

**Why this order matters:** if session-close state is written on the default branch after merge, protected-branch settings may block the write or force a follow-up PR for state files only. This creates unnecessary review overhead and an audit gap where the handoff describes work that is not yet in the branch history.

**Implementation rule:** the session-close checklist in `handoff.md` is complete (all boxes checked) when the pull request is **opened**, not after it merges. Agents must not mark the session closed and then create a separate follow-up PR to write state files.

This rule is substrate-neutral. Git-specific enforcement and rationale live in the active substrate module (see `modules/git-substrate.md §M-git-5`).

**Verification step (mandatory before closing):**

Before the final response of the session, the agent runs:

```bash
grep -l "YYYY-MM-DD" .agents/agent_log/*.md .agents/agent_log/*.json tasks/*.md
```

(substituting `YYYY-MM-DD` with today's date) and confirms that each *applicable* artifact appears in the output. If an applicable artifact does not appear, the update was skipped — fix before closing.

**Agent-level vs project-level lessons — decision rule:**

- `agent_lessons.md` captures lessons **about how agents operate**: format drift, tool failure modes, recovery protocols, cross-agent coordination patterns. Examples: "the file-reader cache got confused after a rename", "I took an attribute dropdown value as ground truth without cross-checking".
- `tasks/lessons.md` captures lessons **about the project or domain**: systemic mistakes, decision criteria, recurring bug patterns, process fixes. Examples: "anchor election from local sales data underweights cross-shop demand", "lessons about customer behavior, pricing elasticity, or category positioning".

When in doubt, a lesson is project-level if removing the specific agent would still leave the lesson valid. If the lesson is about *how the agent failed as an agent*, it is agent-level.

### Concurrent sessions and mid-session checkpoints *(v1.6.0+)*

The v1.5 takeover rule assumes at most one session is live per repo at any time. Real-world tooling (multiple IDEs, multiple agents, multiple terminals rooted at the same repo) routinely breaks this assumption. Two additions address concurrent sessions and mid-session cross-agent consultation without breaking any existing schema.

**Active sessions registry** — `.agents/agent_log/sessions/active_sessions.md`

Optional but recommended when more than one agent may operate on the repo. A flat markdown table, one row per live session. The agent appends its row on session start and removes the row on session close (session close checklist item).

Schema — immutable columns:

```markdown
# active_sessions.md — Sessions currently live
> Append row on session start. Remove row on session close.
> Stale rows (>24h with no checkpoint update) may be removed by any next agent with a decisions.json log.

| Session ID | Agent | Started | Topic | Last checkpoint |
|---|---|---|---|---|
| 2026-04-19-1310-claude | [Claude Code / claude-opus-4-7] | 2026-04-19 13:10 | <1-line topic> | <checkpoint filename or —> |
```

**Session ID format:** `YYYY-MM-DD-HHMM-<agent-short>`. The `<agent-short>` suffix (`claude`, `gemini`, `cursor`, `codex`, etc.) prevents ID collision when two agents boot in the same minute.

**Effect on takeover rule:** when `active_sessions.md` exists and holds a row for a peer session whose Started timestamp is within the last 30 minutes OR whose Last checkpoint is within the last 30 minutes, the current agent MUST NOT take over. Concurrent sessions are legitimate — append a new row for the current session instead. The `handoff.md` 30-minute takeover rule remains in effect only when `active_sessions.md` is absent or empty.

**Mid-session checkpoints** — `.agents/agent_log/checkpoints/YYYY-MM-DD-HHMM-<topic>.md`

A checkpoint is a pre-execution snapshot written voluntarily by the agent at the owner's request (or proactively when the agent is about to take an action that would benefit from a second opinion). Checkpoints are ephemeral working notes — authoritative state lives in `handoff.md`, `decisions.json`, and project files.

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

**Usage pattern:** when the owner asks for a second opinion from a peer agent, the current agent writes the checkpoint and updates the `Last checkpoint` column of its row in `active_sessions.md`. The owner opens the peer agent in another window; the peer agent boots per §P5, sees the fresh checkpoint referenced in `active_sessions.md`, reads it, and responds with contrarian input. No copy-paste required.

**Retention:** no automatic retention policy. Checkpoints accumulate as an audit trail. If the `checkpoints/` directory grows beyond practical limits, the project may adopt a retention rule in `PROJECT_RULES.md §J8`.

**Scope limits:**
- The registry is advisory, not a lock. It does not prevent two agents from editing the same file concurrently — resolve conflicts per the active substrate module.
- Checkpoints do not replace `handoff.md`. They coexist: checkpoint = live snapshot of an in-progress decision; handoff = authoritative state at session close.
- Neither the registry nor checkpoints are required when only one agent operates on the repo. Projects may opt into v1.6 features via `PROJECT_RULES.md §J8`.

## §P4 — Generic quality checklist

Before closing any significant action:
- [ ] Persona/agent signature present in every recorded change and in `handoff.md`
- [ ] `handoff.md` overwritten with current state (Status, Timestamp HH:MM, Last Action, Pending Step, session close checklist)
- [ ] `decisions.json` appended with rationale and files_affected (if applicable per §P3 session close ritual)
- [ ] `activity_YYYY-MM.md` appended with one line per logical action (if applicable per §P3 session close ritual)
- [ ] If a new **agent-level** pattern/bug learned → append to `agent_log/agent_lessons.md`
- [ ] If a new **project-level** pattern/bug learned → append to `tasks/lessons.md`
- [ ] Commit record follows `[Agent] <type>: <summary>` convention (§P3)
- [ ] Version bumps applied to any rules file or module whose content changed
- [ ] Session close checklist in `handoff.md` fully verified (`grep` confirmed entries exist per §P3)
- [ ] If `active_sessions.md` is in use, the row for this session has been removed (per §P3 concurrent sessions)
- [ ] Any additional checks required by an active module have been satisfied

## §P5 — Operational model (generic)

- Every agent reads `CORE_RULES.md` → `PROTOCOL_RULES.md` (kernel) → `PROJECT_RULES.md` → each module file listed in `§J8 Active modules` (in declaration order) → `handoff.md` on session start.
- Additionally (v1.6.0+), when `agent_log/sessions/active_sessions.md` exists, the agent reads it to detect concurrent peer sessions. If a peer session has a Last checkpoint referenced, the agent reads the latest checkpoint in `agent_log/checkpoints/` before responding to the owner.
- The active Session Protocol level (1/2/3), the active substrate, and the list of active modules are declared in `PROJECT_RULES.md §J8`.
- Edits to framework files (`PROTOCOL_RULES.md` kernel, any module file) only happen via methodology upgrade — never ad-hoc.
- Edits to business files (`PROJECT_RULES.md`, project reference docs) happen per project rules in `§J8`.
- Language: operational files (`CORE_RULES`, `PROTOCOL_RULES`, `PROJECT_RULES`, module files, `handoff`, `decisions`, `agent_lessons`, `activity`, `active_sessions`, `checkpoints`) are always EN-US.
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
4. **The private repo** must follow the full Lead Protocol (`.agents/`, `PROTOCOL_RULES.md`, `PROJECT_RULES.md`, `handoff.md`, `decisions.json`) like any other project.
5. **Content that belongs in the personal private repo (`private-context`):** owner's identity, personal strategic goals, permanent personal decisions, personal lessons learned, personal digital presence, family/health/financial context.
6. **Content that belongs in the organizational private repo (`business-vault`):** company financials, strategic plans not yet public, personnel and compensation, legal matters under privilege.
7. **Content that belongs in the team-shared repo:** methodology, system architecture, runbooks, product technical decisions, team operational context.
8. **Opt-in activation:** projects without sensitive context at a given tier do not need to create a corresponding private repo. The rule activates only when such context exists and needs a home.

## §P9 — Modules architecture *(v1.9.0+)*

The kernel above is substrate-agnostic and role-agnostic. Substrate-specific and role-specific rules live in opt-in module files under `.agents/modules/`. This section defines the module contract.

### File layout

- `.agents/modules/<scope>.md` — one file per module; `<scope>` is lowercase kebab-case.
- `.agents/modules/README.md` — one-paragraph index listing available modules.
- Each module file carries its own `> Version: X.Y.Z` header and bumps per §P1 independently of the kernel.

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

Agents read active modules after `PROJECT_RULES.md` and before `handoff.md`, in the order listed in `§J8 Active modules`. See §P5 for the full boot sequence.

### Authoring rules

- A module cannot contradict the kernel. It can only add substrate-specific or role-specific rules.
- When a module cites a kernel anchor, use the fully qualified form `PROTOCOL_RULES §Px` to mark the module→kernel crossing explicitly.
- A module may depend on another module only if it declares the dependency in its header.
- Module CI/tooling (if any) must include a top-of-file comment identifying the module it enforces, so consumer repos that do not list the module know not to copy the tooling.

### Relation to earlier opt-in language

The field historically called `Active optional modules` in `PROJECT_RULES.md §J8` (introduced v1.6 for the concurrent-session registry feature flag) is renamed to `Active modules` in v1.9.0. The semantic shift is deliberate: v1.6 used the field to toggle a kernel-internal feature; v1.9 uses the field to activate external rule files. Projects upgrading from v1.8 or earlier move any v1.6 feature-flag values into the new `Active modules` field, or drop them if the feature is now part of the kernel by default.
