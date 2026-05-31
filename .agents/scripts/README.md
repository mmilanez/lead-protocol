# scripts/ — Lead Protocol framework scripts

<!-- Private launch smoke-test change. Remove before merge. -->

This directory holds two categories of files. The distinction matters when deciding what to keep, delete, or copy on upgrade.

## Framework (keep on every project)

Part of the Lead Protocol framework. Copied verbatim on every `§M-meta-6` promotion. Do not hand-edit inside a consumer repo — edits happen in the template.

| File | Purpose |
|---|---|
| `validate_state.py` | Validates `.agents/local/<actor>/<agent>/handoff.md` and `.agents/decisions.jsonl` against the JSON Schemas in `.agents/schemas/`. Invoked manually (`python .agents/scripts/validate_state.py`), from a pre-commit hook, or from CI. |
| `migrate_to_v2.py` | One-time migration tool for consumer projects upgrading from v1.x to v2.0.0. Moves `agent_log/*` into the new three-layer layout, converts `decisions.json` (array) to `decisions.jsonl` (one object per line), and promotes `checkpoints/` and `sessions/` to the project level. |
| `conftest.py` | Pytest configuration for the validator test suite. |
| `test_validate_state.py` | Unit tests for the validator. Run with `pytest .agents/scripts/ -v`. |

## Distribution (opt-in, safe to delete)

Packaging conveniences for projects that adopt a specific external ecosystem. Not part of the framework — the kernel and active modules work the same way without them.

| File | Ecosystem | Safe to delete if… |
|---|---|---|
| `.pre-commit-hooks.yaml` | [pre-commit.com](https://pre-commit.com) | You are not publishing this repo as a reusable pre-commit hook source. |

See `.agents/modules/git-substrate.md` → *"Optional tooling that ships with the template"* for the full list of opt-in tooling that ships with the template and when to keep or drop each file.
