# Contributing to Lead Protocol

Thank you for your interest in contributing to the Lead Protocol. This document explains how to get involved.

---

## How to contribute

### Reporting bugs

Open an [issue](https://github.com/mmilanez/lead-protocol/issues/new) with:

- A clear title describing the problem
- Steps to reproduce
- Expected vs. actual behavior
- Your environment (OS, tool versions)

### Suggesting features

Open an issue with the `enhancement` label. Describe:

- The problem you're trying to solve
- Your proposed solution
- Why this belongs in the protocol (vs. a project-specific customization)

### Submitting code

1. **Fork** this repository
2. **Create a branch** from `main`:
   - `feat/<description>` for new features
   - `fix/<description>` for bug fixes
   - `docs/<description>` for documentation changes
3. **Make your changes** — keep commits focused and atomic
4. **Test** your changes locally
5. **Open a Pull Request** against `main` with a clear description of what and why

### Commit messages

For human contributors, use clear conventional commit messages:

```
feat: add JSON Schema validation for handoff.md
fix: correct takeover rule timestamp comparison
docs: clarify recovery mode procedure
```

AI agents working on this repo follow the `[Agent] <type>: <summary>` convention defined in `.agents/PROTOCOL_RULES.md`.

---

## What makes a good contribution

### We welcome

- Bug fixes and improvements to the schemas, validator, migration tool, or documentation
- New `PROJECT_RULES.md` templates for different industries/use cases
- Documentation improvements (typos, clarity, examples)
- Test coverage for existing functionality
- Integrations with new AI coding agents or IDEs
- Design input on the planned CLI and MCP server (open an issue to discuss)

### Please avoid

- Changes to `PROTOCOL_RULES.md` without discussion — this is the framework layer and follows a controlled upgrade path
- Adding vendor-specific dependencies — the protocol must remain LLM-agnostic
- Over-engineering simple features — the protocol's value is in its simplicity
- Marketing language in documentation — be technical and direct

---

## Code style

- Keep code simple and readable
- Write tests for new functionality
- Follow existing patterns in the codebase
- No unnecessary abstractions — three similar lines are better than a premature abstraction

---

## Protocol files

If your contribution touches the `.agents/` directory:

- **`PROTOCOL_RULES.md`** — do not modify directly. Propose changes via an issue first.
- **`PROJECT_RULES.md`** — bump version (`X.Y`) on structural changes.
- **`handoff.md`** — located in `local/<actor>/<agent>/handoff.md` (gitignored), follows an immutable schema. Do not add new fields.
- **`decisions.jsonl`** — append-only JSONL. Never edit past entries.

---

## Review process

1. A maintainer will review your PR within a few days
2. Feedback may be requested — this is normal and collaborative
3. Once approved, a maintainer will merge your PR
4. Your contribution will be credited in the git history

---

## Dogfooding workflow

The Lead Protocol is developed using itself. Maintainers may keep a private development workspace that runs the protocol on every session — each architectural decision is recorded in `decisions.jsonl`, significant deliveries are promoted to `JOURNAL.md`, and agent state is tracked per-pair in `local/<actor>/<agent>/handoff.md`.

Finished artifacts (schemas, scripts, module files, documentation) are then published to this public repository as releases. This means:

- The `.agents/` directory in this repo is the **distributable scaffold** — pristine, consumer-ready.
- The private workspace carries the real operational history.
- Contributors never see private operational state; they see only the polished product.

This is the recommended pattern for any team that wants to use Lead Protocol to develop Lead Protocol — or any other protocol-governed project where operational history is private.

---

## Questions?

Open an [issue](https://github.com/mmilanez/lead-protocol/issues). We're happy to help you get started.
