# Migrating from Lead Protocol v1.x to v2.0.0

This guide is for consumer repositories already running Lead Protocol
`v1.x` (any version in the `1.0.0` – `1.9.1` range). If you are starting
a new project on `v2.0.0`, follow the [Quick start](../README.md#quick-start)
section in the README instead — no migration is needed.

---

## Who needs this

You need to migrate if your repo contains:

- `.agents/agent_log/handoff.md`
- `.agents/agent_log/decisions.json` (JSON **array** form)
- `.agents/agent_log/activity_YYYY-MM.md`
- `.agents/agent_log/agent_lessons.md`

You do **not** need to migrate if your repo is already on the three-layer
state layout (`.agents/local/<actor>/<agent>/...`), if your `decisions.jsonl`
exists and contains JSONL (one object per line), or if `.agents/agent_log/`
no longer exists.

## What v2.0.0 changes structurally

v2.0.0 introduces the **three-layer state model**. Every file under `.agents/`
now belongs to exactly one layer:

| Layer | Examples | Shared? |
|---|---|---|
| **Framework** | `CORE_RULES.md`, `PROTOCOL_RULES.md`, `modules/`, `schemas/`, `scripts/` | Yes — ships with the release |
| **Project** | `PROJECT_RULES.md`, `JOURNAL.md`, `LESSONS.md`, `decisions.jsonl`, `AGENTS_MAP.md`, `checkpoints/`, `sessions/` | Yes — versioned with the project |
| **Actor × Agent** | `local/<actor>/<agent>/handoff.md`, `tasks/TASK.md`, `activity.log`, `lessons.md` | **No — gitignored, one folder per pair** |

The unit of concurrency is the pair `(actor, agent)`, not the actor alone.
Claude, Codex, Gemini, and Cursor operated by the same human each get their
own `local/<actor>/<agent>/` — zero overwrite.

### File-level mapping

| v1.x path | v2.0.0 path |
|---|---|
| `.agents/agent_log/handoff.md` | `.agents/local/<actor>/<agent>/handoff.md` |
| `.agents/agent_log/decisions.json` (JSON array) | `.agents/decisions.jsonl` (one object per line) |
| `.agents/agent_log/activity_YYYY-MM.md` | `.agents/local/<actor>/<agent>/activity.log` (concatenated) |
| `.agents/agent_log/agent_lessons.md` | split between `.agents/LESSONS.md` (project-level) and `.agents/local/<actor>/<agent>/lessons.md` (personal) |
| *(new)* | `.agents/JOURNAL.md` — curated project biography |
| *(new)* | `.agents/LESSONS.md` — project-level lessons, grep-by-tag |
| *(new)* | `.agents/AGENTS_MAP.md` — tool-signature → agent-slug map |
| `.agents/checkpoints/` | unchanged (still shared project layer) |
| `.agents/sessions/active_sessions.md` | unchanged |

## Automated path (recommended)

The migration tool ships inside the template as
`.agents/scripts/migrate_to_v2.py`. Run it from the root of your consumer
repo **after** you have replaced the framework files with the v2.0.0
versions.

### Step 1 — Update framework files to v2.0.0

```bash
# From a clean checkout of your consumer repo, on a migration branch:
git checkout -b chore/migrate-to-lead-protocol-v2

# Get the v2.0.0 release (pick one — clone or archive)
git clone --branch v2.0.0 --depth 1 https://github.com/mmilanez/lead-protocol.git /tmp/lp-v2

# Replace framework files (these are copied verbatim on every release)
cp    /tmp/lp-v2/.agents/CORE_RULES.md       .agents/CORE_RULES.md
cp    /tmp/lp-v2/.agents/PROTOCOL_RULES.md   .agents/PROTOCOL_RULES.md
cp -R /tmp/lp-v2/.agents/modules/            .agents/modules/
cp -R /tmp/lp-v2/.agents/schemas/            .agents/schemas/
cp -R /tmp/lp-v2/.agents/scripts/            .agents/scripts/

# Bring the new project-layer scaffolds only if you do not already have them
cp -n /tmp/lp-v2/.agents/JOURNAL.md    .agents/JOURNAL.md
cp -n /tmp/lp-v2/.agents/LESSONS.md    .agents/LESSONS.md
cp -n /tmp/lp-v2/.agents/AGENTS_MAP.md .agents/AGENTS_MAP.md
```

Do **not** overwrite your existing `PROJECT_RULES.md`, `README.md`, or anything
outside `.agents/` — those are project-specific, not framework.

### Step 2 — Dry-run the migration

```bash
python .agents/scripts/migrate_to_v2.py --dry-run
```

Dry-run is the default when you don't pass `--apply`, but you can pass
`--dry-run` explicitly for readability (the two are equivalent). The tool
prints every move/split/concatenation it would perform. Read the output
carefully. If anything looks wrong, **stop** and inspect — do not proceed
to `--apply`.

### Step 3 — Apply the migration

You need to provide an actor ID and an agent slug. The actor ID identifies
the human operator (default is `<user>@<host>`, but you can pass an explicit
one). The agent slug identifies which AI tool ran the v1 state (look at the
signature in your old `handoff.md`).

> ### ⚠️ Running under an AI agent? Always pass `--yes`.
>
> **If you are running the migration under an AI agent (Claude Code, Codex,
> Cursor, Antigravity, or any automated session), *always* pass `--yes`.**
>
> The `--apply` command prints a plan and then asks *"Proceed with the migration
> above? [y/N]"*. That confirmation prompt assumes a human at the keyboard. In
> an agent-driven session, stdin often looks like a TTY but there is no human
> to answer — the prompt hangs or returns empty and the migration aborts.
> Passing `--yes` tells the tool to skip the confirmation (and, as a side
> effect, to classify every legacy lesson as project-level; see the
> *Non-interactive apply* section below for the full implication).
>
> **You will also choose which pair's local continuity this migration seeds —
> see the warning on `--agent` at the end of this section.**

> ### ⚠️ The `--agent` slug seeds pair-local continuity forever.
>
> The `--agent` slug you pass becomes the per-pair continuity path
> (`.agents/local/<actor>/<agent>/`) for all future sessions on this consumer
> repo. Use the slug that matches the tool actually running the migration —
> check the canonical mapping in `AGENTS_MAP.md` (typically `claude`,
> `codex`, `gemini`, `cursor`).
>
> If you pass `--agent claude` while *running* Codex, you are writing Claude's
> pair-local state with Codex's hands. The gitignored `local/<actor>/claude/`
> directory contains your `handoff.md`, `activity.log`, and `lessons.md` — the
> next Codex session will look under `local/<actor>/codex/` instead and will
> find nothing. Fix it before the next session (just `mv` the directory) or
> future continuity reads from the wrong pair.

#### Agent-driven apply (with `--yes`) — recommended for AI sessions

```bash
python .agents/scripts/migrate_to_v2.py \
  --apply \
  --actor <your-actor-id> \
  --agent <your-agent-slug> \
  --yes
```

With `--yes`, the tool **skips the confirmation prompt** and **sends every
legacy lesson to `.agents/LESSONS.md`** (project-level). You can move any
entries that are really personal into `local/<actor>/<agent>/lessons.md`
by editing the two files directly after migration.

Example (the IDE of this repository used this exact command on 2026-04-22):

```bash
python .agents/scripts/migrate_to_v2.py \
  --apply \
  --actor alice@workstation \
  --agent claude \
  --yes
```

#### Interactive apply (for human operators at a real terminal)

```bash
python .agents/scripts/migrate_to_v2.py \
  --apply \
  --actor <your-actor-id> \
  --agent <your-agent-slug>
```

Without `--yes`, the tool prompts for confirmation after printing the plan,
and then **prompts on each lesson** in `agent_lessons.md` asking whether it
is *project-level* (goes to `.agents/LESSONS.md`) or *personal* (goes to
`local/<actor>/<agent>/lessons.md`). This path gives you per-lesson control
over the split. It requires a real human at the keyboard — in an agent
session, use the `--yes` form above.

#### What the tool does

1. Moves `agent_log/handoff.md` into `local/<actor>/<agent>/handoff.md`.
2. Converts `agent_log/decisions.json` (JSON array) into `decisions.jsonl`
   (one line per entry, preserved order).
3. Concatenates the monthly `activity_YYYY-MM.md` files into the pair's
   `activity.log`.
4. Classifies each lesson in `agent_lessons.md` as *project-level* or
   *personal* — interactively by default, or entirely project-level under
   `--yes`.
5. Removes the old `.agents/agent_log/` directory.

### Step 4 — Verify

> If the migration aborted at the confirmation prompt or you saw it hang on
> *"Proceed with the migration above? [y/N]"*, you are running under an AI
> agent without `--yes`. Re-read the *"Running under an AI agent? Always
> pass `--yes`"* callout in Step 3 above. Pass `--yes` and re-run.

```bash
python .agents/scripts/validate_state.py
```

Must return OK. If tests ship with your template:

```bash
pytest .agents/scripts/
```

Commit the migration on its own branch and open a PR so the structural move
is reviewable in one place.

## Manual path

If you prefer to migrate by hand — for example, to inspect each move or to
work around an edge case the tool does not cover — follow the
file-level mapping table above and do the moves with `git mv`. The key
transformations:

1. **`decisions.json` → `decisions.jsonl`.** The v1 file is a JSON array at
   the top level: `[{"ts": ..., "decision": ...}, ...]`. The v2 file is
   JSONL: one JSON object per line, no enclosing array, no commas between
   lines. A one-liner with `jq`:

   ```bash
   jq -c '.[]' .agents/agent_log/decisions.json > .agents/decisions.jsonl
   ```

2. **`agent_lessons.md` split.** Read each lesson. If the lesson applies to
   the project regardless of which agent learned it (business rules, domain
   context, architecture decisions), move it to `.agents/LESSONS.md`. If the
   lesson is about how a specific agent should behave (tool quirks, personal
   workflow preferences), move it to
   `.agents/local/<actor>/<agent>/lessons.md`. When in doubt, project-level.

3. **Monthly `activity_YYYY-MM.md` files.** Concatenate in chronological
   order into `.agents/local/<actor>/<agent>/activity.log`.

4. **Ensure `.agents/local/` is gitignored.** The template ships a
   `.gitignore` with this line; confirm it is present in your repo.

## Post-migration verification

- [ ] `python .agents/scripts/validate_state.py` returns OK.
- [ ] `.agents/agent_log/` no longer exists.
- [ ] `.agents/decisions.jsonl` exists and every line is a valid JSON object
      matching `schemas/decisions.entry.schema.json`.
- [ ] `.agents/local/<actor>/<agent>/handoff.md` exists and has the 8-item
      session-close checklist.
- [ ] `.agents/local/` is gitignored.
- [ ] `CLAUDE.md` / `AGENTS.md` at the repo root reflect the six-step boot
      order. Copy from the release's `CLAUDE.md` and `AGENTS.md` if you
      had not customized them.
- [ ] `AGENTS_MAP.md` lists the agents you operate. Propose additions if
      missing (per the governance rule, agents do not edit this file
      autonomously).

## Rollback

The migration is idempotent in the "already migrated" direction — running it
again on a v2 tree is refused by the three-signal guard
(`.agents/local/`, `.agents/decisions.jsonl`, and absence of
`.agents/agent_log/`).

To roll back, `git revert` the migration commit. State is preserved in the
v1 layout by the revert. Do not attempt a manual "undo" with `mv` — the
split of `agent_lessons.md` is lossy to revert cleanly.

### `--force` (escape hatch; use only when necessary)

The script exposes `--force` for the case where a prior `--apply` did not
complete or produced the wrong result and you need to re-run against the
legacy `agent_log/` sources. `--force` is **destructive** — it overwrites v2
state from the v1 sources. Only use it after `git revert` or equivalent has
restored the legacy `agent_log/` directory. Never use `--force` on a tree
where the v2 state has diverged from its post-migration baseline.

## Common pitfalls

These are the three pitfalls encountered during the first external consumer
migration and patched in `v2.0.1`. Read them once before Step 3.

### Pitfall 1 — `--dry-run` is the default; passing it explicitly is rarely needed

`migrate_to_v2.py` runs in dry-run mode by default (no flag). The `--dry-run`
flag exists as an explicit no-op alias for documentation purposes — passing it
does nothing different from passing no flag at all.

Use `--dry-run` only when you want the *intent* of the command to be obvious
in shell history or scripts (e.g., `python migrate.py --dry-run` reads more
clearly than `python migrate.py`). Never combine it with `--apply` — the tool
errors out cleanly with a targeted message rather than silently picking one.

### Pitfall 2 — AI-agent sessions must pass `--yes` to `--apply`

Without `--yes`, `migrate_to_v2.py --apply` opens an interactive
`y/N` confirmation prompt and reads from stdin. AI-agent sessions
(Claude Code, Codex, Cursor, etc.) typically run the tool in a non-TTY
context where the prompt either hangs forever or auto-rejects with the
default `N`, leaving the migration incomplete and the agent stuck.

**Always pass `--yes` from agent sessions:**

```bash
python .agents/scripts/migrate_to_v2.py --apply --actor <id> --agent <slug> --yes
```

Human operators at a real terminal can omit `--yes` to keep the
confirmation step.

### Pitfall 3 — The `--agent` slug seeds the per-pair path permanently

The slug you pass via `--agent` becomes the **directory name** under
`.agents/local/<actor>/<agent>/` for the remainder of this pair's life. Every
future session by the same agent reads its handoff from that path. Picking
the wrong slug at migration time means future sessions read from the wrong
pair — silent context loss.

The fix is mechanical (`mv .agents/local/<actor>/<wrong-slug>/
.agents/local/<actor>/<right-slug>/`), but the consequence is easy to miss
if no one notices the slug was off. Recommended slugs:

| Agent | Recommended slug |
|---|---|
| Claude Code | `claude-code` (lowercase, hyphenated) |
| Codex CLI | `codex-cli` |
| Cursor | `cursor` |
| Antigravity | `antigravity` |

If a project has multiple instances of the same agent (e.g., two Claude Code
sessions on different model variants), differentiate via the model suffix:
`claude-code-opus-4-7`, `claude-code-haiku-4-5`. Once chosen, the slug
becomes load-bearing — pick deliberately.

---

## Troubleshooting

### `validate_state.py` fails after migration

Read the error line-by-line. The most common cause is a malformed line in
`decisions.jsonl` left over from a manual edit. Each line must be valid JSON
on its own; no trailing commas, no multi-line objects.

### The interactive lesson split is ambiguous

Default to project-level (`.agents/LESSONS.md`). Project-level lessons are
the shared, valuable ones; personal lessons are ergonomic preferences that
are easy to rewrite if misplaced. You can move a lesson later by editing the
two files directly.

### I have more than one agent that wrote v1 state

v1 stored a **single shared `agent_log/`** regardless of how many agents
wrote to it — per-pair state did not exist in v1. Because of that, the
migration is a one-shot structural move into the v2 layout under one
chosen `(actor, agent)` pair. You do **not** rerun the tool per pair — the
three-signal rerun guard will refuse a second run, and `--force` rewrites
from the legacy sources rather than partitioning state per agent.

After the single migration run completes, if you want additional agents to
start their own per-pair state under v2, create their directories manually
from the resulting layout:

```bash
mkdir -p .agents/local/<actor>/<other-agent>/
# Copy a valid v2 handoff.md (e.g., from the pair that was just migrated)
# into the new pair directory, then edit it to describe the new pair's state.
cp .agents/local/<actor>/<migrated-agent>/handoff.md \
   .agents/local/<actor>/<other-agent>/handoff.md
$EDITOR .agents/local/<actor>/<other-agent>/handoff.md
```

The per-pair `handoff.md` format is specified in
[`schemas/handoff.schema.json`](../.agents/schemas/handoff.schema.json).
The shared project-layer files (`decisions.jsonl`, `LESSONS.md`,
`JOURNAL.md`) are already in the v2 layout and serve all pairs — no
per-pair copies needed for those.

### My `agent_log/` has files the tool does not mention

The tool handles `handoff.md`, `decisions.json`, the monthly `activity_*.md`
files, and `agent_lessons.md`. Any other file — project-specific notes,
design drafts, experimental logs — is left in place. Decide per-file whether
to move it into the v2 layout (`.agents/checkpoints/` is often the right
target for design drafts) or into your project's `docs/`.

## Getting help

- Open an issue on the [lead-protocol repository](https://github.com/mmilanez/lead-protocol/issues)
  with the label `migration` and include the output of
  `migrate_to_v2.py --dry-run`.
- Read [`PROTOCOL_RULES.md §P3`](../.agents/PROTOCOL_RULES.md) for
  the full three-layer specification — it is the authoritative source when
  this guide is ambiguous.
