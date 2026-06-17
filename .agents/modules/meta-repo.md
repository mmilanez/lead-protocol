# modules/meta-repo.md — Meta-repo rules (IDE ↔ template lifecycle)

> Version: 1.1.1 | Updated: 2026-06-17 | Protocol: Lead Protocol v2.0.0+
> Scope: Opt-in module. Activate via `PROJECT_RULES.md §J8 Active modules: meta-repo`.
> Applies to: **meta-repos** — repositories that develop the Lead Protocol itself and contain both a root `.agents/` directory and a `template/` directory. Consumer repos almost never list this module.

---

This module extends `PROTOCOL_RULES.md` with rules specific to meta-repos that dogfood the protocol while building the next version of it. The rules below govern the two-copy dynamic (IDE and template), pristine-template handling, and the promotion lifecycle that moves a template version into the IDE.

## §M-meta-1 — IDE vs. template roles

In a meta-repo, two copies of the framework files coexist:

- The root `.agents/PROTOCOL_RULES.md` runs the **stable version** used for development (the **IDE**).
- `template/.agents/PROTOCOL_RULES.md` carries the **version under development** that will be distributed (the **product**).

The template is typically one minor/major version ahead of the root. Consumer repos have no template — only `.agents/PROTOCOL_RULES.md` exists there, and this module is absent from their `§J8`.

The same dual-copy relationship applies to every framework file: `CORE_RULES.md`, `modules/*.md`, `schemas/*`, `scripts/*`. `PROJECT_RULES.md`, `README.md`, project-layer state files (`JOURNAL.md`, `LESSONS.md`, `decisions.jsonl`, `AGENTS_MAP.md`, `checkpoints/`, `sessions/`) and per-pair state (`local/<actor>/<agent>/*`) are **not** paired — the IDE has its own, specific to the meta-repo; the template has a generic skeleton or empty baseline shipped to consumers.

## §M-meta-2 — Authoritative copy for meta-repo operation

When two copies of `PROTOCOL_RULES.md` coexist, the **root IDE copy is authoritative for the current operation of the meta-repo**. The template copy describes the *product being built* — it is the source for distribution, not for governing the meta-repo's own day-to-day work.

This rule extends to every paired framework file: module files, schemas, scripts. The IDE copy governs; the template copy is the output target.

## §M-meta-3 — Recovery mode in a meta-repo

Recovery per `PROTOCOL_RULES §P3 Recovery mode` always reads from the root `.agents/decisions.jsonl` — the IDE's live log. The template's `decisions.jsonl` is part of the distributable product baseline and is always empty by design; it never holds operational history. Do not attempt to recover from the template's project-state files.

## §M-meta-4 — Pristine vs. populated state files

Templates distributed with the Lead Protocol ship state files populated with placeholders or empty baselines to signal "not yet in use". Agents must not treat a pristine state file as a live state snapshot. The pristine markers are:

| File | Pristine indicator |
|---|---|
| `PROJECT_RULES.md` | `[Project Name]` in `§J1` Name, or `[...]` in `§J8` substrate/modules. Triggers the `PROTOCOL_RULES §P10` first-run setup interview |
| `handoff.md` | Literal `YYYY-MM-DD` or `[Your Agent Signature]` placeholders |
| `decisions.jsonl` | Empty file |
| `JOURNAL.md` | Only the header + the "*(No entries yet — …)*" placeholder |
| `LESSONS.md` | Only the header + the "*(No lessons yet — …)*" placeholder |
| `AGENTS_MAP.md` | Header + the default table of known agents, no project-specific additions |
| `active_sessions.md` | Empty table body (header present, no session rows) |
| `checkpoints/` | Empty directory (or only `.gitkeep`) |

A state file with real dates, real agent signatures, real decision entries, or real checkpoint files is populated and authoritative. Mixed state (some placeholders, some real entries) is treated as populated — the real entries are authoritative.

## §M-meta-5 — Boot sequence in a meta-repo

Agents operating in a meta-repo read the root `.agents/*` first (IDE — governs current work), then inspect `template/.agents/*` (product under development — the distributable baseline). This ensures the agent understands both the working environment and the product being produced. Consumer repos have no `template/` and skip this step — which is why, in a consumer repo, this module is not listed in `§J8`.

## §M-meta-6 — Promotion lifecycle (IDE ↔ template)

### Two roles, two copies

| Location | Role | Version it runs |
|---|---|---|
| Root `.agents/` (the **IDE**) | Development environment — dogfoods the protocol while the next version is being built | Previous stable version (N) |
| `template/.agents/` (the **product**) | Distributable baseline — what consumers clone | Version under development (N+1) |

The bootstrapping analogy: the C compiler is built with the previous C compiler; Claude Code is developed using a prior version of Claude Code. The environment always runs one version behind what is being produced.

### Version invariant

At any moment, for every paired framework file, `template/.agents/<file>.version ≥ .agents/<file>.version`. In steady state the difference is exactly one minor (e.g., IDE kernel v1.8.x, template kernel v1.9.0-dev) or one major during structural rewrites (IDE kernel v1.9.x, template kernel v2.0.0-dev). The difference may grow temporarily during multi-version work, but must collapse back to ≤1 minor/major at every promotion.

The invariant applies **per file** starting in v1.9.0 — the kernel has its own version pair, and each module has its own version pair. A module may be entirely absent from the IDE until first activation; the invariant then takes effect from the first paired publication onward.

### When to promote

Promotion means: "the version currently in `template/` is stable enough to become the IDE's running version." Triggers:

1. **Usage signal** — the meta-repo itself has operated under the template's rules (via dogfooding decisions, commits, handoff cycles) without unresolved friction for a reasonable interval.
2. **Owner declaration** — the project owner explicitly declares the template version promoted (e.g., "promote v2.0.0 to IDE").
3. **Downstream adoption signal** — at least one external project has successfully adopted the template version and reported no blocking issues (optional but strongly recommended for X.0 majors).

A promotion is **not** automatic on every minor bump. The template may accumulate multiple patch versions before the owner promotes the latest stable patch to the IDE.

### How to promote

A promotion is a discrete, auditable operation. The promoting agent:

1. **Copies the framework files** from template to IDE, verbatim:
   ```
   template/.agents/CORE_RULES.md           → .agents/CORE_RULES.md
   template/.agents/PROTOCOL_RULES.md       → .agents/PROTOCOL_RULES.md
   template/.agents/modules/                → .agents/modules/
   template/.agents/schemas/                → .agents/schemas/
   template/.agents/scripts/                → .agents/scripts/
   ```
   All are framework: copied verbatim on promotion, never hand-edited in the IDE. The per-file invariant from §M-meta-6 *Version invariant* applies.
2. **Updates the IDE's `PROJECT_RULES.md`** reference line so it declares the new Protocol version (e.g., "Protocol: Lead Protocol v2.0.0"). Does not touch the rest of `PROJECT_RULES.md` beyond the `§J8 Active modules` field if the promotion introduces a new module the IDE should activate.
3. **If the promotion carries a structural state-layout change (e.g., v1.x → v2.0.0):** run `.agents/scripts/migrate_to_v2.py` (or the equivalent migration tool for that major) against the IDE so existing state moves into the new layout. Do not skip this — the new framework files assume the new layout.
4. **Appends a promotion entry to `.agents/decisions.jsonl`** with `decision: "Promote Lead Protocol vX.Y.Z from template to IDE"` and rationale citing the triggers above.
5. **Opens the next development cycle on the template** by bumping `template/.agents/PROTOCOL_RULES.md` to the next version with a `-dev` marker (e.g., `v2.1.0-dev`) and adding a stub entry to the README's Version history row for the new cycle.
6. **Never copies** `PROJECT_RULES.md`, any project-layer state file (`JOURNAL.md`, `LESSONS.md`, `decisions.jsonl`, `AGENTS_MAP.md`, `checkpoints/`, `sessions/`), any per-pair state (`local/<actor>/<agent>/*`), `README.md`, or any consumer-facing file. The template's skeletons are generic; the IDE's are specific to the meta-repo itself. The two must not overwrite each other.

### Post-promotion state

Immediately after promotion:

- IDE runs version N+1 (the just-promoted version).
- Template is at N+2-dev (the next cycle opens).
- Version gap returns to ≤ one minor per paired file.

### Anti-patterns

- **Ad-hoc patches to the IDE's framework files.** Never edit `.agents/CORE_RULES.md`, `.agents/PROTOCOL_RULES.md`, or `.agents/modules/*.md` directly. All rule evolution happens in the template; only promotion moves changes into the IDE.
- **Promoting without the template being tested.** If no dogfooding occurred on the template version, promotion is premature — the IDE would be running code that has never been exercised.
- **Letting the template outpace the IDE by multiple minors.** A gap larger than one minor on any paired file (except during a cycle that opens a new major) signals an undone promotion; catch up before the divergence compounds.
- **Skipping migration during a major promotion.** When the template carries a structural state-layout change, the IDE must run the migration tool after copying framework files. Skipping it leaves the IDE with new rules and old state — instant split-brain.
- **Using this module in a consumer repo.** It governs the meta-repo only. Consumer repos upgrade via the normal "replace framework files with a newer template" flow documented in the operational manual, plus the relevant migration script for major upgrades.

### Relationship to `PROTOCOL_RULES §P3` and `§P1`

- `PROTOCOL_RULES §P1` (versioning) describes *when* version numbers bump. This section describes *when and how* a version promotes between roles.
- `PROTOCOL_RULES §P3` defines commit/session conventions. When `modules/git-substrate.md` is also active, promotions flow through a PR like any other framework change (see `modules/git-substrate.md §M-git-2`).
- When both `meta-repo` and `git-substrate` modules are active and a promotion PR touches `.agents/CORE_RULES.md`, `.agents/PROTOCOL_RULES.md`, or `.agents/modules/*.md`, it triggers the `check-root-sync` job of `readme-sync.yml` (see `modules/git-substrate.md §M-git-3`). The promoting agent must include a root README version-history entry in the same PR.
