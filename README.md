# Lead Protocol

**Operational continuity protocol for AI agents** — vendor-agnostic, file-based, and easy to audit.

> The missing layer between agent instructions (AGENTS.md) and agent memory (mem0).

> Current version: **2.0.1**

---

## The problem

When multiple AI agents (Claude Code, Cursor, Codex, Antigravity, Windsurf) work on the same codebase — across different sessions, tools, and LLMs — there is no standard way to:

- **Hand off state** from one agent session to the next
- **Audit decisions** made by agents with rationale
- **Recover from interrupted sessions** without losing context
- **Coordinate concurrent agents** operating on the same repo
- **Consult a peer agent mid-session** without copy-pasting context

Existing solutions solve adjacent problems:

- **AGENTS.md / spec-kit** tell agents *what to know* about a project (instructions layer)
- **mem0 / engram** remember *what happened* in the past (memory layer, DB-backed)
- **LangGraph / CrewAI** orchestrate agents *in real time* (runtime layer)

**Nobody solves the operational state layer** — what was done, what's pending, who decided what, who is live right now, and how to recover.

## The solution

Lead Protocol defines a set of structured files committed to your project — a per-pair `handoff.md` with a strict schema, an append-only `decisions.jsonl` audit trail, a curated `JOURNAL.md` timeline and queryable `LESSONS.md`, rules for takeover and recovery, a concurrent-session registry, and a three-layer separation (framework / project / actor × agent). Any agent that can read text files can use it. No runtime, no API, no vendor dependency.

This release is the file-based protocol scaffold. A CLI and MCP server are planned, but you do not need either one to use Lead Protocol today.

## Where it fits

```
┌─────────────────────────────────────────────┐
│  Agentic IDE (Cursor, Claude Code, Windsurf)│  ← where you work
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

## Quick start

```bash
# Clone or download a specific release — never install from main
git clone --branch v2.0.1 --depth 1 https://github.com/mmilanez/lead-protocol.git /tmp/lp

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

That's it. Read the [operational manual](.agents/modules/README.md) or the sections below to understand how agents use the protocol inside your project.

## Installing a specific version

`main` is the development branch and may contain in-progress work. **Do not install directly from `main`.** Always install from a published release.

Available versions are listed on the [Releases page](https://github.com/mmilanez/lead-protocol/releases). Versions follow [SemVer](https://semver.org):

- **`vX.Y.Z`** (no suffix) — stable release, recommended for production use
- **`vX.Y.Z-alpha.N` / `-beta.N` / `-rc.N`** — pre-releases, for preview and testing only

### Option 1 — clone a specific version

```bash
git clone --branch v2.0.1 --depth 1 https://github.com/mmilanez/lead-protocol.git /tmp/lp
cp -R /tmp/lp/.agents   your-project/.agents
cp    /tmp/lp/CLAUDE.md  your-project/CLAUDE.md
cp    /tmp/lp/AGENTS.md  your-project/AGENTS.md
cd your-project
python .agents/scripts/validate_state.py
```

### Option 2 — download the release archive

On the [Releases page](https://github.com/mmilanez/lead-protocol/releases), pick a version and download the `Source code (zip)` or `(tar.gz)` asset. Extract and copy the files into your project as shown in Quick start.

For Windows PowerShell, use equivalent `Copy-Item` commands and run the same validator command from the target project root.

### Checking which version you have

The version is recorded inside `.agents/PROTOCOL_RULES.md`. Compare against the [Version history](#version-history) table below.

### Release notes and migration

- **Changelog:** [`CHANGELOG.md`](CHANGELOG.md) — release-by-release summary of what changed.
- **v1.x → v2.0.0 migration:** [`docs/MIGRATION-v2.md`](docs/MIGRATION-v2.md) — required reading for consumer repos upgrading from any `v1.x` release.

---

## What gets installed

```
your-project/
├── .agents/
│   ├── CORE_RULES.md                    # Rules index + essential contracts (read first)
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
├── CLAUDE.md                            # Pointer for Claude Code
└── AGENTS.md                            # Pointer for other agents
```

Any agent that can read text files can work with the protocol. No runtime, no API, no vendor dependency. The bundled Python scripts are only validation and migration helpers.

---

## Three-layer state model

Every file under `.agents/` belongs to exactly one of three layers:

| Layer | Owner | Lifecycle | Shared? |
|---|---|---|---|
| **Framework** | Upstream Lead Protocol | Changes with framework version | Yes — ships in the release |
| **Project** | Your project | Changes with project evolution | Yes — versioned with the repo |
| **Actor × Agent** | One human operator running one AI agent | Changes every session | **No** — gitignored, one folder per pair |

The smallest unit that owns volatile state is the pair `(actor, agent)`, not the actor alone. Claude Code, Codex, Gemini, and Cursor operated by the same human each get their own `local/<actor>/<agent>/`. That is what makes cross-agent interchange in the same project viable — agents never overwrite each other's handoff.

Full detail: `.agents/PROTOCOL_RULES.md §P3 — Three-layer state model`.

---

## How agents boot in your project

Every compliant agent reads, in order:

1. `.agents/CORE_RULES.md` — index + essential contracts.
2. `.agents/PROJECT_RULES.md` — your project's identity, language rules, tone, operational preferences. Read `§J8 Active modules` first.
3. `.agents/modules/<scope>.md` — for each scope listed in `§J8 Active modules`, in declaration order.
4. `.agents/AGENTS_MAP.md` — resolve this agent's own `<agent>` slug from its tool signature.
5. `.agents/sessions/active_sessions.md` — concurrent-session awareness.
6. `.agents/local/<actor>/<agent>/handoff.md` — current state of this pair.

`PROTOCOL_RULES.md` itself is read **on demand**, not in the baseline — `CORE_RULES.md` points agents there when needed. This keeps baseline cost bounded. See `PROTOCOL_RULES.md §P-Access` for the full load contract.

Pointer files `CLAUDE.md` and `AGENTS.md` at the project root exist so each vendor-specific agent tool discovers `.agents/` without custom configuration.

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
| **2.0.1** | Patch from first external consumer feedback. `migrate_to_v2.py --dry-run` now accepted (was documented but rejected by argparse); pristine `LESSONS.md` scaffold no longer false-positives the rerun-safety guard; `docs/MIGRATION-v2.md` Step 3 rewritten with a prominent agent-driven callout on `--yes` and a warning on `--agent` slug seeding pair-local continuity. No kernel or schema changes. |
| **2.0.0** | **Three-layer state model (Framework / Project / Actor × Agent).** Structural major. New files: `JOURNAL.md`, `LESSONS.md`, `AGENTS_MAP.md`. `decisions.json` (JSON array) replaced by `decisions.jsonl` (one object per line, append-only). `handoff.md` relocates to `local/<actor>/<agent>/handoff.md`. New `migrate_to_v2.py` migration tool. Six-step baseline boot order. `PROTOCOL_RULES.md` loads on demand via `§P-Access`. |
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

## Roadmap

| Priority | Component | Status |
|---|---|---|
| **P1** | CLI (`lead-protocol init / handoff / validate`) | Planned |
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
