# Lead Protocol

**Continuity state for AI coding agents.**

When one AI coding session ends, it records what it did, what remains, and why it made the calls it made. The next session — in the same tool or a different one, minutes or days later — can read that state and continue from there.

> Current version: **2.1.4**

---

## The problem

You've probably hit this: you spend an afternoon working through a problem with an AI assistant, close the session, and the next day it remembers none of it. Open the next session in a different tool and you start from zero again. Ask it later *why* it made some change, and there's no record.

When more than one AI assistant works on the same project — across different days, tools, and people — there's no shared place for them to leave notes for each other. So context gets lost, decisions go unexplained, and interrupted work is hard to resume.

Lead Protocol gives every assistant the same simple habit: **read the notes before you start, leave notes before you stop.**

<details>
<summary>For developers: where this sits relative to AGENTS.md, mem0, and LangGraph</summary>

Phrased technically, the gap is the *operational state layer* — what was done, what's pending, who decided what, who is live right now, and how to recover. Existing tools solve adjacent problems, not this one:

- **AGENTS.md / spec-kit** tell agents *what to know* about a project (instructions layer)
- **mem0 / engram** remember *what happened* in the past (memory layer, DB-backed)
- **LangGraph / CrewAI** orchestrate agents *in real time* (runtime layer)

Lead Protocol is vendor-agnostic, file-based, and git-native: the state lives as plain files committed alongside your code, so it is diffable, reviewable, and auditable like any other part of the repo.

</details>

## The solution

Lead Protocol is a set of structured files committed to your git repository:

- **`handoff.md`** — current state: what's done, what's in progress, what's blocked
- **`decisions.jsonl`** — append-only audit trail: why each important decision was made
- **`JOURNAL.md`** — curated timeline of structurally significant deliveries
- **`LESSONS.md`** — mistakes not to repeat, searchable by tag

Any agent that can read text files can use it. No database or API keys are required — it's just files in your git repo. The optional Node.js CLI can now execute a verifiable session lifecycle; an MCP server remains on the roadmap.

In practice, the whole protocol is a single folder of markdown and JSON files dropped into your repository:

```
your-project/
├── .agents/
│   ├── CORE_RULES.md                    # Rules index + essential contracts (read first)
│   ├── manifest.json                    # Installed product release + kernel identity
│   ├── PROTOCOL_RULES.md                # Framework kernel (substrate-agnostic, upgradable)
│   ├── PROJECT_RULES.md                 # Your project's identity and context — edit this
│   ├── JOURNAL.md                       # Curated timeline of structurally significant deliveries
│   ├── LESSONS.md                       # Project-level lessons (append-at-tail, grep by tag)
│   ├── decisions.jsonl                  # Append-only audit trail (one JSON object per line)
│   ├── AGENTS_MAP.md                    # Tool-signature → agent-slug map (maintainer-managed)
│   ├── modules/                         # Opt-in extension rule files
│   │   ├── README.md                    # Index of available modules
│   │   ├── git-substrate.md             # Branching + PR + README-sync + .gitignore baseline
│   │   └── meta-repo.md                 # IDE/template duality + promotion lifecycle
│   ├── schemas/
│   │   ├── handoff.schema.json          # Validates parsed handoff.md
│   │   └── decisions.entry.schema.json  # Validates one decisions.jsonl line
│   ├── scripts/
│   │   ├── validate_state.py            # Schema validator
│   │   ├── migrate_to_v2.py             # v1.x → v2.0.0 migration tool
│   │   ├── conftest.py                  # Pytest config
│   │   └── test_validate_state.py       # Validator tests
│   ├── checkpoints/                     # Cross-agent coordination snapshots (shared)
│   ├── sessions/
│   │   └── active_sessions.md           # Concurrent session registry
│   └── local/                           # ← gitignored — per (actor, agent) state
│       └── <actor>/<agent>/
│           ├── handoff.md               # Current operational state for this pair
│           ├── tasks/TASK.md            # TODO for the active session
│           ├── activity.log             # Per-pair raw activity log
│           └── lessons.md               # Personal lessons for this pair
├── .gitignore                           # Ignores .agents/local/
├── CLAUDE.md                            # Compatibility pointer for Claude Code
└── AGENTS.md                            # Universal pointer for agent tools
```

The bundled Python scripts are validation and migration helpers — you do not need them to get started.

<details>
<summary>For developers: where Lead Protocol sits in the agent stack</summary>

Lead Protocol fills the operational-state slot in the broader agent stack:

```
┌─────────────────────────────────────────────┐
│  Agent tools (Codex, Cursor, Gemini,        │  ← where you work
│              Claude Code, Windsurf)         │
├─────────────────────────────────────────────┤
│  Communication (MCP, A2A)                   │  ← how agents connect
├─────────────────────────────────────────────┤
│  Orchestration (LangGraph, CrewAI)          │  ← how agents execute
├─────────────────────────────────────────────┤
│  ★ Lead Protocol                            │  ← what agents know between
│  (continuity, handoff, audit, recovery,     │     sessions (this project)
│   concurrency, cross-agent consultation)    │
├─────────────────────────────────────────────┤
│  Compliance (MS Governance Toolkit)         │  ← what agents may do
├─────────────────────────────────────────────┤
│  Infrastructure (Git, CI/CD, Cloud)         │  ← where it all runs
└─────────────────────────────────────────────┘
```

</details>

## Quick start

```bash
# Clone the latest stable release
# Check https://github.com/mmilanez/lead-protocol/releases for the current version number
git clone --branch v2.1.4 --depth 1 https://github.com/mmilanez/lead-protocol.git /tmp/lp

# Copy the scaffold into your project
cp -R /tmp/lp/.agents   your-project/.agents
cp    /tmp/lp/CLAUDE.md  your-project/CLAUDE.md
cp    /tmp/lp/AGENTS.md  your-project/AGENTS.md

# Set your project's identity
$EDITOR your-project/.agents/PROJECT_RULES.md

# Verify the scaffold state
cd your-project
python .agents/scripts/validate_state.py
```

**Windows (PowerShell):**

```powershell
# Clone the latest stable release
# Check https://github.com/mmilanez/lead-protocol/releases for the current version number
git clone --branch v2.1.4 --depth 1 https://github.com/mmilanez/lead-protocol.git $env:TEMP\lp

# Copy the scaffold into your project
Copy-Item -Recurse $env:TEMP\lp\.agents   your-project\.agents
Copy-Item           $env:TEMP\lp\CLAUDE.md your-project\CLAUDE.md
Copy-Item           $env:TEMP\lp\AGENTS.md your-project\AGENTS.md

# Set your project's identity
code your-project\.agents\PROJECT_RULES.md

# Verify the scaffold state
Set-Location your-project
python .agents/scripts/validate_state.py
```

That's it. Read the sections below or browse [`.agents/CORE_RULES.md`](.agents/CORE_RULES.md) to understand how agents use the protocol inside your project.

### Product and kernel versions

`.agents/manifest.json` is the machine-readable identity of the installed
scaffold. `product_version` is the exact Lead Protocol release that produced
the scaffold; `kernel_version` identifies the shipped `PROTOCOL_RULES.md`
contract. `lead-protocol status` reports these separately as **Product
Version** and **Kernel Version**, including in JSON as `productVersion` and
`kernelVersion`.

Framework files remain independently versioned. A Markdown header's `Version:`
is the revision of that document or component, while `Protocol:` compatibility
metadata describes the supported kernel floor or range. Neither value is a
substitute for the manifest's exact product release. On an older installation
without a manifest, status reports Product Version as `unknown` and reads the
kernel only from `PROTOCOL_RULES.md`.

## Executable session lifecycle

The optional CLI turns the boot and close contract into three commands:

```bash
npx @leadsolutions/lead-protocol@2.1.4 session open \
  --actor judge --agent codex --topic "Try the lifecycle" --json

echo "A self-contained checkpoint body" | \
  npx @leadsolutions/lead-protocol@2.1.4 checkpoint \
    --actor judge --agent codex --title first-checkpoint --json

npx @leadsolutions/lead-protocol@2.1.4 session close \
  --actor judge --agent codex \
  --journal not-significant --status stable \
  --last-action "Verified the lifecycle." --pending-step None \
  --confirm-checklist --json

# Start a clean second session. The JSON receipt includes the terminal handoff
# from the first session under `previousHandoff`, proving immediate resume.
npx @leadsolutions/lead-protocol@2.1.4 session open \
  --actor judge --agent codex --topic "Resume from prior handoff" --json
```

`session open` records the active session, updates the pair handoff, and emits a
receipt containing the canonical file order and SHA-256 hashes. `checkpoint`
creates a UTC-named shared snapshot without overwriting peer state. `session
close` validates the close contract and removes only the current row.

Supported platforms: Windows, macOS, and Linux with Node.js 18 or newer. See
[`cli/README.md`](cli/README.md) for all flags and judge testing instructions.

### Build Week 2026 provenance

Lead Protocol and its core engineering predate OpenAI Build Week. The maintainer
used Codex as an implementation and adversarial-review partner for the public
executable lifecycle. Codex accelerated the work by tracing each state
transition, turning rollback and concurrency risks into focused fault-injection
tests, and checking the packaged CLI path rather than only the happy path.

The key human engineering decisions remained with the maintainer: keep the
protocol vendor-neutral and file-based; isolate volatile state by `(actor,
agent)`; preserve peer-owned rows; require explicit JOURNAL significance; use
deterministic receipts; reject unconfigured pristine project state; and hold the
review to a public-only, offline boundary.

For this public-only adversarial review, **GPT-5.6 Sol (Medium)** independently
examined `session open -> checkpoint -> session close`. Its specific Build Week
contribution was to confirm and repair transactional rollback and
receipt-ownership defects, strengthen peer-row preservation, and add regression
coverage for pristine/malformed state, optimistic concurrency, and interrupted
operations. The hardening was created after the immutable `v2.1.1` tag and is
published in `v2.1.2`; `v2.1.1` remains unchanged and does not contain these
fixes. The model configuration, Codex thread ID, findings, and validation
are recorded in the [public adversarial review](docs/build-week-2026/gpt-5.6-lifecycle-review.md).

**Contribution boundary:** everything that predates the Build Week submission
period beginning on 2026-07-13 is pre-existing work and is not claimed for the
challenge. Work added during the submission period is limited to the executable
lifecycle (`session open`, `checkpoint`, and `session close`), its receipts,
ownership/concurrency/rollback safeguards, lifecycle tests, package smoke
coverage, and this provenance disclosure. The underlying protocol design,
templates, documentation, validation/migration tooling, and earlier CLI
commands remain pre-existing work.

## Installing a specific version

`main` is the development branch and may contain in-progress work. **Do not install directly from `main`.** Always install from a published release.

Available versions are listed on the [Releases page](https://github.com/mmilanez/lead-protocol/releases). Versions follow [SemVer](https://semver.org):

- **`vX.Y.Z`** (no suffix) — stable release, recommended for production use
- **`vX.Y.Z-alpha.N` / `-beta.N` / `-rc.N`** — pre-releases, for preview and testing only

### Alternative — download the release archive

On the [Releases page](https://github.com/mmilanez/lead-protocol/releases), pick a version and download the `Source code (zip)` or `(tar.gz)` asset. Extract and copy the files into your project as shown in Quick start.

For Windows PowerShell, use equivalent `Copy-Item` commands and run the same validator command from the target project root.

### Checking which version you have

`.agents/PROTOCOL_RULES.md` records the **kernel** version (the framework rules). A patch release may leave the kernel untouched — for example, release `2.0.1` ships kernel `2.0.0` because it only fixed tooling and docs. So the kernel version is a floor, not the release number. The exact release you installed is the one named in the top entry of [`CHANGELOG.md`](CHANGELOG.md); compare it against the [Version history](#version-history) table below.

### Release notes and migration

- **Changelog:** [`CHANGELOG.md`](CHANGELOG.md) — release-by-release summary of what changed.
- **v1.x → v2.0.0 migration:** [`docs/MIGRATION-v2.md`](docs/MIGRATION-v2.md) — required reading for consumer repos upgrading from any `v1.x` release.

---

## Three-layer state model

Every file under `.agents/` belongs to exactly one of three layers:

| Layer | Owner | Lifecycle | Shared? |
|---|---|---|---|
| **Framework** | Upstream Lead Protocol | Changes with framework version | Yes — ships in the release |
| **Project** | Your project | Changes with project evolution | Yes — versioned with the repo |
| **Actor × Agent** | One human operator running one AI agent | Changes every session | **No** — gitignored, one folder per pair |

<details>
<summary>Why the pair (actor × agent) is the unit of concurrency</summary>

The smallest unit that owns volatile state is the pair `(actor, agent)`, not the actor alone. Codex, Cursor, Gemini, Claude Code, and other agents operated by the same human each get their own `local/<actor>/<agent>/`. That is what makes cross-agent interchange in the same project viable — agents never overwrite each other's handoff.

Full detail: `.agents/PROTOCOL_RULES.md §P3 — Three-layer state model`.

</details>

---

## How agents boot in your project

> You don't run these steps — your AI agent does, automatically, when it reads an applicable root pointer such as `AGENTS.md`. This section explains what's happening under the hood.

Every compliant agent reads, in order:

1. `.agents/CORE_RULES.md` — index + essential contracts.
2. `.agents/PROJECT_RULES.md` — your project's identity, language rules, tone, operational preferences. Read `§J8 Active modules` first.
3. `.agents/modules/<scope>.md` — for each scope listed in `§J8 Active modules`, in declaration order.
4. `.agents/AGENTS_MAP.md` — resolve this agent's own `<agent>` slug from its tool signature.
5. `.agents/sessions/active_sessions.md` — concurrent-session awareness.
6. `.agents/local/<actor>/<agent>/handoff.md` — current state of this pair.

`PROTOCOL_RULES.md` itself is read **on demand**, not in the baseline — `CORE_RULES.md` points agents there when needed. This keeps baseline cost bounded. See `PROTOCOL_RULES.md §P-Access` for the full load contract.

The universal `AGENTS.md` pointer and tool-specific compatibility pointers such as `CLAUDE.md` let agent tools discover `.agents/` without custom configuration.

---

## Upgrading

### Upgrading from v1.x to v2.0.0 (structural — state layout changed)

v2.0.0 introduces the three-layer state model with an actor × agent sub-dimension. The old `agent_log/` layout is gone. Run the migration tool:

```bash
python .agents/scripts/migrate_to_v2.py            # dry-run first
python .agents/scripts/migrate_to_v2.py --apply    # then mutate
```

Full consumer migration guide: [`docs/MIGRATION-v2.md`](docs/MIGRATION-v2.md).

### Upgrading between v2.Y patches/minors

Replace framework files verbatim (`CORE_RULES.md`, `PROTOCOL_RULES.md`, `modules/`, `schemas/`, `scripts/`). Do not replace `PROJECT_RULES.md`, project-layer state, or per-pair state. Append a decision entry to `decisions.jsonl` recording the upgrade.

Patch bumps (Z) never break anything. Minor bumps (Y) may introduce new features but preserve backward compatibility. Major bumps (X) may require migration — the release notes will say so explicitly and typically ship a migration script.

---

## Version history

| Version | Highlights |
|---|---|
| **2.1.4** | Adds explicit installed product/kernel identity through `.agents/manifest.json`, corrects human and JSON status reporting with a safe legacy fallback, and reconciles branch-ordering prose with the backward-compatible eight-item handoff checklist. Kernel 2.0.2; git-substrate module 1.2.2. |
| **2.1.3** | Corrects generic AI branch provenance across the source scaffold and the npm-installed CLI template: AI branches use the mapped `<agent-slug>/<description>` convention, package smoke coverage verifies the installed `init` output, and CLI CI now runs whenever bundled scaffold inputs change. |
| **2.1.2** | Publishes the Codex/GPT-5.6 transactional hardening from public PR #34: validate close fields before mutation, serialize cooperating lifecycle operations, strengthen receipt ownership and rollback, preserve peer rows byte-for-byte, and prevent live source state from leaking into packaged templates. |
| **2.1.1** | Completes the lifecycle acceptance contract: human-readable resume context, deterministic malformed-state and interrupted-close rollback tests, hosted macOS coverage, and a package smoke test that proves continuation across two clean sessions. |
| **2.1.0** | **Build Week executable lifecycle.** Adds `session open`, `checkpoint`, and `session close`, deterministic SHA-256 boot receipts, optimistic peer-safe registry mutation, guarded terminal handoffs, unit tests, and package-install smoke coverage. |
| **2.0.4** | **Branch ordering rule (kernel 2.0.1).** Adds an explicit rule (PROTOCOL_RULES §P3) requiring session-close state to be committed on the feature branch before the PR is opened, not written to the default branch after merge. Adds §M-git-6 to `git-substrate.md` with git-specific enforcement and a reviewer signal for post-merge closeout PRs. The proof is derived from git/PR state; the persisted handoff schema remains the existing eight-item checklist. Fixes #2. |
| **2.0.3** | Security patch: `migrate_to_v2.py` now validates `--actor` / `--agent` values against path traversal (rejects `..`, `/`, `\`, absolute paths, drive letters). README Quick Start updated to current release with PowerShell copy block added. `SECURITY.md` and `CONTRIBUTING.md` scope corrected (CLI/MCP are roadmap, not shipped). CI workflow permissions hardened. No kernel or schema changes. |
| **2.0.2** | Documentation and release infrastructure fixes. README version references corrected. No kernel or schema changes. |
| **2.0.1** | Patch from first external consumer feedback. `migrate_to_v2.py --dry-run` now accepted; pristine `LESSONS.md` scaffold no longer false-positives the rerun-safety guard; `docs/MIGRATION-v2.md` Step 3 rewritten with agent-driven callout and `--agent` slug warning. No kernel or schema changes. |
| **2.0.0** | **Three-layer state model (Framework / Project / Actor × Agent).** New files: `JOURNAL.md`, `LESSONS.md`, `AGENTS_MAP.md`. `decisions.json` replaced by `decisions.jsonl` (append-only). `handoff.md` relocates to `local/<actor>/<agent>/handoff.md`. New `migrate_to_v2.py` migration tool. Six-step baseline boot order. |

<details>
<summary>Earlier versions (v1.0.0 – v1.9.1)</summary>

| Version | Highlights |
|---|---|
| **1.9.1** | Template cosmetic pass — clarifies opt-in nature of pre-commit tooling, adds `scripts/README.md`, reframes validation section so local ad-hoc validation is the default path. No framework rules changed. |
| **1.9.0** | **Substrate-agnostic kernel + opt-in modules.** `PROTOCOL_RULES.md` rewritten as kernel (§P1–§P7, new §P9 module contract); git/PR/README-sync rules extracted to `modules/git-substrate.md`; meta-repo promotion (former §P8) relocated to `modules/meta-repo.md`. |
| **1.8.3** | CI state validation workflow — GitHub Action that runs `validate_state.py` on every PR. |
| **1.8.2** | Pre-commit hook integration — Python validator enforces JSON Schemas against `handoff.md` and `decisions.json`. |
| **1.8.1** | Formal JSON Schemas (`handoff.schema.json`, `decisions.schema.json`). |
| **1.8.0** | **Meta-repo promotion lifecycle (§P8).** Formalizes IDE↔template dual-copy model: version invariant, when/how to promote, anti-patterns. |
| **1.7.1** | Clarifications across §P1–§P5; branch-protection override note; pristine-vs-populated handoff distinction. |
| **1.7.0** | Public-facing documentation sync rule + CI enforcement; §P7 dual-tier private context. |
| **1.6.0** | Concurrent session registry (`active_sessions.md`) + mid-session checkpoints. |
| **1.5.0** | Session close ritual + embedded self-verification checklist in `handoff.md`. |
| **1.4.0** | SemVer for rules files + pull-request-required rule. |
| **1.3.0** | §P6 cross-repo references + §P7 private vs shared context separation. |
| **1.0.0** | Initial protocol: handoff, decisions, takeover, recovery, authority hierarchy. |

</details>

## Roadmap

| Priority | Component | Status |
|---|---|---|
| **P1** | CLI (`init`, `handoff`, `status`, `validate`, and session lifecycle) | ✅ Shipped in v2.1.2 |
| **P1** | JSON Schemas for `handoff.md` and `decisions.jsonl` | ✅ Shipped in v1.8.1 |
| **P1** | Pre-commit hook for schema enforcement | ✅ Shipped in v1.8.2 |
| **P2** | MCP Server (protocol operations as MCP tools) | Planned |
| **P2** | GitHub Action for CI validation | ✅ Shipped in v1.8.3 |
| **P3** | Decisions dashboard (web UI) | Planned |
| **P3** | Template marketplace (`PROJECT_RULES.md` by industry) | Planned |

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

[Apache 2.0](LICENSE) — see also [`NOTICE`](NOTICE) for required attribution.

---

*Built by [mmilanez](https://github.com/mmilanez) — born from managing AI agents across 100+ repositories.*
