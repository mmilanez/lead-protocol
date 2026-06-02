# Lead Protocol

**Operational continuity protocol for AI agents** — vendor-agnostic, file-based, git-native.

> The missing layer between agent instructions (AGENTS.md) and agent memory (mem0).

> Current version: **1.8.3** (template) / **1.7.1** (IDE) — see [`template/.agents/PROTOCOL_RULES.md`](template/.agents/PROTOCOL_RULES.md). The development environment at the repo root runs the previous stable version used to build the next release, governed by §P8 (meta-repo promotion lifecycle).

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

Lead Protocol defines a set of structured files committed to your git repository — a `handoff.md` with a strict schema, an append-only `decisions.json` audit trail, rules for takeover and recovery, a concurrent-session registry, and framework/project separation. Any agent that can read text files can use it. No runtime, no API, no vendor dependency.

The full structure, schemas, and operational details live in the [operational manual](template/README.md).

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

Only the `template/` directory is meant to be copied into your project — everything else in this repo is the development environment of the Lead Protocol itself.

```bash
cp -R lead-protocol/template/.agents   your-project/.agents
cp    lead-protocol/template/CLAUDE.md  your-project/CLAUDE.md
cp    lead-protocol/template/AGENTS.md  your-project/AGENTS.md
$EDITOR your-project/.agents/PROJECT_RULES.md   # set your project's identity
```

That's it. Read the [operational manual](template/README.md) to understand how agents will use the protocol inside your project.

## Why `template/` only?

This repository dogfoods its own protocol. Its root `.agents/` records the real decisions, lessons, and history of developing the protocol itself — that would be noise in a consumer repo. The `template/` folder is the clean, versioned baseline that ships. Think of the repo like an IDE: `template/` is the distributable program; the rest is the workshop.

## Version history

| Version | Highlights |
|---|---|
| **1.9.2** | **Branch ordering rule for session close.** Adds an explicit rule (PROTOCOL_RULES §P3) requiring session-close artifacts — handoff, decisions, lessons — to be committed on the feature branch before the PR is opened, not after merge. Adds corresponding git-substrate enforcement (§M-git-5) with reviewer signal for post-merge closeout PRs. Adds one checklist item to the handoff schema. Fixes #2. |
| **1.9.1** | Template cosmetic pass — clarifies opt-in nature of pre-commit tooling (header comment + cross-reference in `modules/git-substrate.md`), adds `template/.agents/scripts/README.md` distinguishing framework files (validator, tests) from distribution files (pre-commit hook manifest), and reframes the "Validating state files" section so local ad-hoc validation is the default path, with pre-commit (requires pre-commit.com) and CI (requires GitHub Actions) presented as opt-in layers. Closed via #36. No framework rules changed. Promoted to IDE on 2026-04-20. |
| **1.9.0** | **Substrate-agnostic kernel + opt-in modules.** PROTOCOL_RULES rewritten as kernel (§P1–§P7, new §P9 module contract); git/GitHub/PR/README-sync concerns extracted to `.agents/modules/git-substrate.md` (§M-git-1..4); meta-repo promotion (former §P8) relocated to `.agents/modules/meta-repo.md` (§M-meta-1..6). PROJECT_RULES §J8 gains `Active substrate` + `Active modules` fields (field previously `Active optional modules`). Promotion copy list expanded to include `modules/`. Promoted to IDE on 2026-04-20. |
| **1.8.3** | CI state validation workflow — GitHub Action that runs `validate_state.py` on every PR that touches state, schemas, or scripts. Two jobs: one for the IDE root state, one for the template's pristine baseline. |
| **1.8.2** | Pre-commit hook integration — Python validator (`validate_state.py`) that enforces the JSON Schemas against `handoff.md` and `decisions.json`. Ships as `.pre-commit-hooks.yaml` for external adoption and a ready `.pre-commit-config.yaml` scaffold in the template. §P8 copy list expanded to include `scripts/`. |
| **1.8.1** | Formal JSON Schemas (`handoff.schema.json`, `decisions.schema.json`) for the two state files — source of truth for the upcoming CLI, pre-commit hook, and CI validator. §P8 promotion procedure updated to treat `schemas/` as framework (copied verbatim on promotion). |
| **1.8.0** | **§P8 — Meta-repo promotion lifecycle.** Formalizes the IDE↔template dual-copy model introduced in PR #17: version invariant (template ≥ IDE), when/how to promote a tested template version into the IDE, anti-patterns (no ad-hoc IDE edits, no multi-minor gaps), and scope (§P8 governs meta-repos only, not consumer repos). Complements the README split (PR #21) and CI dual-sync (PR #22). |
| **1.7.1** | Clarifications across §P1–§P5 reflecting the IDE-vs-template separation (PR #17); branch-protection override note in §P3; pristine-vs-populated handoff distinction; README added to authority hierarchy in §P2 |
| **1.7.0** | Public-facing documentation sync rule + CI enforcement (README ↔ PROTOCOL_RULES); §P7 dual-tier (`private-context` + `business-vault`) with opt-in framing |
| **1.6.0** | Concurrent session registry (`active_sessions.md`) + mid-session checkpoints |
| **1.5.0** | Session close ritual + self-verification checklist in `handoff.md` |
| **1.4.0** | `decisions.json` format stabilized; `agent_lessons.md` introduced |
| **1.3.0** | §P6 (portable cross-repo identifiers) + §P7 (private context separation) |
| **1.2.0** | Recovery mode + takeover rule |
| **1.1.0** | Commit convention (`[Agent] <type>: <summary>`) |
| **1.0.0** | Initial release: handoff schema, decisions log, session protocol levels |
