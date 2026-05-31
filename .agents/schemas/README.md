# Lead Protocol — JSON Schemas

Formal schemas for the state files that carry the protocol's operational truth:

| Schema | Validates | Format |
|---|---|---|
| [`handoff.schema.json`](handoff.schema.json) | `.agents/local/<actor>/<agent>/handoff.md` (parsed) | JSON Schema Draft 2020-12 |
| [`decisions.entry.schema.json`](decisions.entry.schema.json) | One entry (one line) of `.agents/decisions.jsonl` | JSON Schema Draft 2020-12 |

Each pair `(actor, agent)` has its own `handoff.md` under `.agents/local/<actor>/<agent>/`. The validator walks the `local/` tree to discover them. `decisions.jsonl` is a single project-level log — one line per decision, one object per line.

## What these schemas are for

- **Validation** — catch malformed handoff/decisions entries before they hit `main`. Corrupted state is expensive: a broken line in `decisions.jsonl` can take down an entire session's recovery logic.
- **Source of truth for tooling** — the `lead-protocol` CLI, pre-commit hook, and GitHub Action consume these schemas. Defining them formally prevents each tool from reimplementing validation rules ad hoc.
- **Living documentation** — a JSON Schema reads tighter than prose. Anything ambiguous in `§P3` of `PROTOCOL_RULES.md` tends to surface here first.

## What these schemas are NOT

- **Not a replacement for §P3.** The markdown file is the human source of truth; the schema validates a canonical parsed representation. Humans read `PROTOCOL_RULES.md`; tools read the schemas.
- **Not a runtime.** These files do not enforce anything by themselves — they describe structure. Enforcement happens when a validator (CLI, CI, pre-commit) loads the schema and checks a file against it.

## `handoff.schema.json`

Represents the handoff as a JSON object with:

- Top-level metadata: `version`, `updated`.
- Seven canonical fields: `last_agent`, `timestamp`, `status` (enum), `last_action`, `pending_step`, `blockers_context`, `open_threads`.
- Session close checklist (one object per checkbox, each with `checked` / `na` / `note`).

Key constraints:

- `timestamp` regex requires `HH:MM` — date-only values fail validation. Takeover rules need minute-level precision to compute elapsed time.
- `status` is an enum of three values (`STABLE`, `BLOCKED`, `IN_PROGRESS`). Any other string fails.
- `additionalProperties: false` at every level — the handoff schema is immutable per `§P3`; no agent may add new sections or fields.

A pristine template `handoff.md` (first-use skeleton) does not pass validation by design — it contains literal placeholders (`YYYY-MM-DD`, `[Your Agent Signature]`) that violate the regex constraints. Tooling detects a pristine handoff separately from a corrupted one; the schema only validates populated handoffs.

## `decisions.entry.schema.json`

`decisions.jsonl` is **JSON Lines**: one decision object per line, no enclosing array. This schema describes **one line**. A valid file is a sequence of lines, each matching this schema.

Each entry requires:

- `timestamp` (ISO-8601 with seconds), `agent` signature, `decision`, `rationale`, `files_affected` (array, possibly empty), `status` (enum).
- Optional `supersedes` for decisions that replace earlier ones.

Four `status` values are allowed: `completed`, `in_progress`, `rolled_back`, `superseded`. The latter two enforce auditability — past decisions are never deleted, only marked as replaced by a newer entry that cites the older timestamp.

An empty file is valid — a pristine template's `decisions.jsonl` starts empty.

### Why JSONL, not a JSON array

1. **Atomic append.** Adding a decision is writing one line at the end. No read + parse + re-serialize + rewrite. Two contributors appending from a synced folder in the worst case reorder lines; the file remains structurally valid.
2. **Cheap line-by-line query.** Agents grep or filter line-by-line without loading the full file — consistent with the demand-load contract in `PROTOCOL_RULES.md §P-Access`.
3. **Scales past the point a JSON array becomes an anti-pattern.**

The pre-v2.0.0 array-form `decisions.schema.json` has been **removed** (not kept as a legacy alias) to avoid ambiguity about which schema is authoritative. Projects upgrading from v1.x run `.agents/scripts/migrate_to_v2.py` to convert their existing `decisions.json` array into `decisions.jsonl`.

## Validating manually

Validate locally with any JSON Schema validator. Example with `ajv-cli` (Node.js), validating each line of the JSONL file:

```bash
npm i -g ajv-cli
while IFS= read -r line; do
  echo "$line" | ajv validate -s .agents/schemas/decisions.entry.schema.json -d /dev/stdin || break
done < your-project/.agents/decisions.jsonl
```

Or use the Python validator that ships in the template: `python .agents/scripts/validate_state.py`.

For the handoff, you first parse the markdown into the canonical JSON shape defined in `handoff.schema.json` — `validate_state.py` does that automatically.

## Versioning

These schemas version independently from `PROTOCOL_RULES.md`. Breaking schema changes (new required field, tightened constraint) require a major version bump of the schema file itself, which should be bundled with a `PROTOCOL_RULES.md` minor/major bump. Additive non-breaking changes (new optional field, loosened constraint) can ship in a patch.

Current iteration: these schemas land in their v2.0.0 form alongside Lead Protocol v2.0.0, reflecting the shift to JSONL for decisions and the move of `handoff.md` into per-pair `local/` folders.

## Scope limits

- The schemas validate **structure**, not semantics. A decision entry with a plausible-but-meaningless `rationale` passes validation.
- Cross-field invariants that cannot be expressed in JSON Schema (e.g., "when `status=superseded`, the replacing entry must also exist") are enforced by `validate_state.py` / the CLI, not the schema.
- The handoff schema validates a parsed representation — it cannot check markdown formatting issues (missing `**` around field labels, wrong section order). The parser in `validate_state.py` handles that layer.
