#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Migrate a consumer project from Lead Protocol v1.x to v2.0.0.

v1.x layout (what we migrate FROM):

    .agents/
    ├── agent_log/
    │   ├── handoff.md
    │   ├── decisions.json              (JSON array)
    │   ├── agent_lessons.md
    │   ├── activity_YYYY-MM.md
    │   ├── sessions/
    │   │   └── active_sessions.md
    │   └── checkpoints/
    │       └── *.md
    └── tasks/TASK.md                   (repo-root, not under .agents/)

v2.0.0 layout (what we migrate TO):

    .agents/
    ├── JOURNAL.md                      (created empty with header)
    ├── LESSONS.md                      (seeded from agent_lessons.md project-level split)
    ├── decisions.jsonl                 (JSONL, one line per object)
    ├── AGENTS_MAP.md                   (created if absent)
    ├── checkpoints/                    (promoted from agent_log/checkpoints/)
    ├── sessions/active_sessions.md     (promoted from agent_log/sessions/)
    └── local/<actor>/<agent>/          (gitignored)
        ├── handoff.md                  (from agent_log/handoff.md)
        ├── tasks/TASK.md               (from <repo>/tasks/TASK.md)
        ├── activity.log                (from agent_log/activity_*.md, concatenated)
        └── lessons.md                  (seeded from agent_lessons.md personal split)

Usage:
    python .agents/scripts/migrate_to_v2.py                     # interactive, dry-run
    python .agents/scripts/migrate_to_v2.py --apply             # actually mutate
    python .agents/scripts/migrate_to_v2.py --actor alice@laptop --agent claude --apply

Exit codes:
    0 — dry-run completed or migration applied successfully
    1 — migration failed or user aborted
    2 — configuration errors (bad invocation, no v1.x layout found)

Design:
    - Dry-run by default. Nothing mutates until --apply is passed.
    - Rerun-safe by refusal, not by idempotent overwrite: a second --apply is
      rejected when non-pristine v2 destinations already exist (decisions.jsonl
      has lines, LESSONS.md has body content past the seed header, or any
      local/<actor>/<agent>/handoff.md is present). Pass --force to override
      (destructive — overwrites v2 destinations from legacy v1 sources).
    - The v1 handoff is rewritten into the v2 8-item checklist shape during
      migration (preserves Last Action / Pending Step; the two new checklist
      items land unchecked with N/A notes so the next session regenerates them).
    - Atomic where possible: convert-then-write for decisions.jsonl; os.replace for moves.
    - Conservative: old agent_log/ is NOT deleted. The user removes it after validating.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path


DEFAULT_AGENTS_MAP_SEED = """\
# AGENTS_MAP.md — Tool-signature → agent-slug map

> Version: 1.0 | Added: Lead Protocol v2.0.0
> Scope: shared project state, maintainer-managed.

| Tool signature | Agent slug |
|---|---|
| claude-code | claude |
| claude-desktop | claude |
| codex-cli | codex |
| antigravity-codex | codex |
| antigravity-gemini | gemini |
| cursor | cursor |

## Governance

Agents never edit this file autonomously — they propose additions to the user
and wait for explicit confirmation. See PROTOCOL_RULES.md §P3
"AGENTS_MAP.md governance" for details.
"""


JOURNAL_SEED_HEADER = """\
# JOURNAL.md — Project biography

> Version: 1.0 | Added: Lead Protocol v2.0.0
> Curated timeline of structurally significant deliveries. Append at the bottom.
> Newest entries at the tail — read with `tail`, not `head`.

---
"""


LESSONS_SEED_HEADER = """\
# LESSONS.md — Project-level lessons

> Version: 1.0 | Added: Lead Protocol v2.0.0
> Institutional knowledge for any actor working on this project. Append at the bottom.
> Query via grep on inline tags.

---
"""


# Pristine scaffold shipped in .agents/LESSONS.md. A consumer who
# has copied the release scaffold but not yet authored any project lesson will have
# this exact content (byte-for-byte) in their .agents/LESSONS.md. The rerun-
# safety guard compares against this constant to avoid false-positives from
# the example heading in the scaffold's code block (v2.0.1 fix for the
# first-external-consumer bug reported in the downstream consumer repo migration).
LESSONS_TEMPLATE_SCAFFOLD = """\
# LESSONS.md — Project-level lessons

> Version: 1.0 | Added: Lead Protocol v2.0.0
> Institutional knowledge about working on this project specifically. Append at the bottom. Never rewrite past entries or maintain a manual top-of-file index — agents query this file via grep on inline tags.

Criterion for an entry: *"any actor working on this project needs to know this."* If the lesson is about how **you** work, not about the project, it belongs in `local/<actor>/<agent>/lessons.md` instead.

Each entry follows:

```
## YYYY-MM-DD | <actor> | tags: <comma, separated, tags>

One or two short paragraphs. State the lesson, its consequence, and the mitigation.
```

Typical consultation: `grep -A 10 "tags:.*rate-limit" LESSONS.md` surfaces every lesson carrying that tag. No manual index is ever written at the top — a top-of-file index would conflict with the append-only-at-the-tail rule that keeps this file safe under simultaneous writes in synced folders (OneDrive/GDrive).

When this file grows past ~300 lines, move older entries into `archive/LESSONS-<year>.md`.

---

*(No lessons yet — this file accumulates as reusable knowledge emerges.)*
"""


PERSONAL_LESSONS_HEADER_TEMPLATE = """\
# lessons.md — Personal lessons for {actor} × {agent}

> Seeded from v1.x agent_lessons.md during the v2.0.0 migration on {date}.
> Add lessons about how THIS pair works here. Project-level lessons go in .agents/LESSONS.md.

---
"""


@dataclass
class Plan:
    """What the migration will do. Printed on dry-run, executed on --apply."""
    repo_root: Path
    agents_dir: Path
    actor: str
    agent: str
    moves: list[tuple[Path, Path]] = field(default_factory=list)
    creates: list[tuple[Path, str]] = field(default_factory=list)
    convert_decisions: tuple[Path, Path] | None = None
    split_lessons: tuple[Path, Path, Path] | None = None  # (src, project_dst, personal_dst)
    concat_activity: tuple[list[Path], Path] | None = None
    rewrite_handoff: tuple[Path, Path] | None = None  # (src v1, dst v2); source NOT moved — dst is a rewrite
    notes: list[str] = field(default_factory=list)

    def describe(self) -> str:
        lines = ["Migration plan:", f"  repo_root: {self.repo_root}", f"  actor: {self.actor}", f"  agent: {self.agent}", ""]
        if self.moves:
            lines.append("Moves:")
            for src, dst in self.moves:
                lines.append(f"  {src.relative_to(self.repo_root)} → {dst.relative_to(self.repo_root)}")
            lines.append("")
        if self.creates:
            lines.append("New files:")
            for dst, _ in self.creates:
                lines.append(f"  {dst.relative_to(self.repo_root)}")
            lines.append("")
        if self.convert_decisions:
            src, dst = self.convert_decisions
            lines.append("Convert decisions log:")
            lines.append(f"  {src.relative_to(self.repo_root)} (JSON array) → {dst.relative_to(self.repo_root)} (JSONL)")
            lines.append("")
        if self.split_lessons:
            src, proj_dst, pers_dst = self.split_lessons
            lines.append("Split agent_lessons.md:")
            lines.append(f"  source: {src.relative_to(self.repo_root)}")
            lines.append(f"  → project-level: {proj_dst.relative_to(self.repo_root)}")
            lines.append(f"  → personal:      {pers_dst.relative_to(self.repo_root)}")
            lines.append("  (interactive prompt: you classify each lesson)")
            lines.append("")
        if self.concat_activity:
            srcs, dst = self.concat_activity
            lines.append("Concatenate activity logs:")
            for s in srcs:
                lines.append(f"  + {s.relative_to(self.repo_root)}")
            lines.append(f"  → {dst.relative_to(self.repo_root)}")
            lines.append("")
        if self.rewrite_handoff:
            src, dst = self.rewrite_handoff
            lines.append("Rewrite handoff to v2.0.0 shape:")
            lines.append(f"  source (kept):   {src.relative_to(self.repo_root)}")
            lines.append(f"  v2 destination:  {dst.relative_to(self.repo_root)}")
            lines.append("  (7-item checklist → 8-item; personal_lessons_appended renamed; journal_appended added)")
            lines.append("")
        if self.notes:
            lines.append("Notes:")
            for n in self.notes:
                lines.append(f"  - {n}")
        return "\n".join(lines)


_SLUG_RE = re.compile(r'^[A-Za-z0-9._@-]+$')


def _validate_slug(value: str, label: str) -> None:
    """Reject actor/agent values that could cause path traversal.

    Allowed: alphanumerics plus . _ @ - (covers alice@workstation, codex-cli, user.name).
    Rejected: empty, path separators, drive letters, bare '..' or any segment containing '..'.
    Belt-and-suspenders: after joining, the resolved path must still start with the expected
    prefix — catches edge cases in Path resolution across platforms.
    """
    if not value:
        raise SystemExit(f"error: {label} must not be empty")
    if re.search(r'[/\\:]', value):
        raise SystemExit(
            f"error: {label} {value!r} contains a path separator or drive letter — "
            "use a plain identifier such as 'alice@workstation' or 'claude'"
        )
    if value == ".." or "/../" in f"/{value}/" or value.startswith("../") or value.endswith("/.."):
        raise SystemExit(
            f"error: {label} {value!r} contains a traversal segment — "
            "use a plain identifier such as 'alice@workstation' or 'claude'"
        )
    if not _SLUG_RE.match(value):
        raise SystemExit(
            f"error: {label} {value!r} contains invalid characters — "
            "allowed: alphanumerics, hyphen, underscore, dot, at-sign "
            "(e.g. 'alice@workstation', 'claude', 'codex-cli')"
        )


def _check_slug_destination(agents_dir: Path, actor: str, agent: str) -> None:
    """Verify the resolved pair directory is under agents_dir/local/."""
    expected_prefix = (agents_dir / "local").resolve()
    candidate = (agents_dir / "local" / actor / agent).resolve()
    try:
        candidate.relative_to(expected_prefix)
    except ValueError:
        raise SystemExit(
            f"error: resolved pair directory {candidate} escapes the expected "
            f"prefix {expected_prefix} — check --actor and --agent values"
        )


def find_repo_root(start: Path) -> Path:
    """Walk up from `start` looking for a Lead Protocol .agents/ tree."""
    for ancestor in [start, *start.parents]:
        agents_dir = ancestor / ".agents"
        if agents_dir.is_dir() and (agents_dir / "CORE_RULES.md").is_file():
            return ancestor
    raise SystemExit(
        "error: no .agents/ Lead Protocol tree found from CWD or its ancestors. "
        "Run this script from inside a Lead Protocol consumer project."
    )


def detect_v1_layout(agents_dir: Path) -> None:
    """Verify the project looks like v1.x. Raise SystemExit if not."""
    agent_log = agents_dir / "agent_log"
    if not agent_log.is_dir():
        raise SystemExit(
            f"error: no {agent_log} found. This project does not appear to be "
            "on Lead Protocol v1.x — nothing to migrate."
        )


def check_framework_present(agents_dir: Path) -> list[str]:
    """Detect whether the v2 framework files have been copied into the target.

    The migration tool only moves STATE (agent_log/, decisions.json, etc).
    It does NOT replace FRAMEWORK files (schemas, scripts, CORE_RULES,
    PROTOCOL_RULES, modules/). Per PROTOCOL_RULES §M-meta-6, framework
    replacement is a separate step that the consumer must do BEFORE running
    this migration — otherwise the migrated state will not validate against
    the still-v1 schemas sitting in the consumer repo.

    Returns a list of missing framework signals. Empty list = framework is
    v2. Non-empty = caller should warn (not error: the migration itself
    still works; validation is what breaks afterward).
    """
    missing: list[str] = []
    entry_schema = agents_dir / "schemas" / "decisions.entry.schema.json"
    if not entry_schema.is_file():
        missing.append(
            "  - schemas/decisions.entry.schema.json not present — the v1 "
            "array-shaped schema is still in place"
        )
    legacy_schema = agents_dir / "schemas" / "decisions.schema.json"
    if legacy_schema.is_file():
        missing.append(
            "  - schemas/decisions.schema.json (v1 array schema) is still "
            "present — should be removed after copying v2 schemas"
        )
    return missing


def check_rerun_safety(agents_dir: Path, force: bool) -> None:
    """Refuse to run when v2 destinations already hold non-pristine content.

    The migration tool is NOT idempotent — a second run would overwrite v2
    state (decisions.jsonl, LESSONS.md, personal lessons.md, handoffs) from
    the still-present v1 sources under agent_log/. That would destroy any
    work the user added after the first successful apply.

    Detection is conservative: any of the following makes the repo unsafe
    to re-migrate without --force:
      - .agents/decisions.jsonl has any non-blank line;
      - .agents/LESSONS.md has body content beyond the seed header;
      - any .agents/local/<actor>/<agent>/handoff.md exists (regardless of content).
    """
    if force:
        return

    reasons: list[str] = []

    decisions = agents_dir / "decisions.jsonl"
    if decisions.is_file() and any(
        line.strip() for line in decisions.read_text(encoding="utf-8").splitlines()
    ):
        reasons.append(f"  - {decisions.relative_to(agents_dir.parent)} has decision entries")

    lessons = agents_dir / "LESSONS.md"
    if lessons.is_file():
        body = lessons.read_text(encoding="utf-8")
        # v2.0.1: compare byte-for-byte against the known template scaffold.
        # If the live file matches the pristine scaffold exactly, it was
        # copied from the v2 template but never populated — safe to migrate.
        # Anything else (including the old v1.x layout missing LESSONS.md
        # entirely — handled by is_file() above) is treated as populated.
        # The previous heuristic (startswith('## ')) false-positived on the
        # example heading inside the scaffold's code block. Found in the
        # first external consumer migration (downstream consumer repo, 2026-04-23).
        if body != LESSONS_TEMPLATE_SCAFFOLD:
            reasons.append(f"  - {lessons.relative_to(agents_dir.parent)} has lesson entries")

    local = agents_dir / "local"
    if local.is_dir():
        pair_handoffs = list(local.glob("*/*/handoff.md"))
        if pair_handoffs:
            for h in pair_handoffs:
                reasons.append(f"  - {h.relative_to(agents_dir.parent)} already exists")

    if reasons:
        raise SystemExit(
            "error: this project already looks migrated to v2.0.0:\n"
            + "\n".join(reasons)
            + "\n\nRe-running the migration would overwrite v2 state from the\n"
            "legacy agent_log/ sources and destroy any work added since the\n"
            "first apply.\n\n"
            "If you are sure you want to re-migrate (destructive), pass\n"
            "--force and understand that decisions.jsonl / LESSONS.md / each\n"
            "pair's handoff.md / lessons.md / activity.log will be rewritten\n"
            "from the v1 agent_log/ contents."
        )


def resolve_actor(explicit: str | None) -> str:
    if explicit:
        return explicit
    env = os.environ.get("LEAD_PROTOCOL_ACTOR_ID")
    if env:
        return env
    user = os.environ.get("USERNAME") or os.environ.get("USER") or "unknown-user"
    host = (
        os.environ.get("COMPUTERNAME")
        or (os.uname().nodename if hasattr(os, "uname") else None)
        or "unknown-host"
    )
    return f"{user}@{host}"


def resolve_agent(explicit: str | None) -> str:
    if explicit:
        return explicit
    env = os.environ.get("LEAD_PROTOCOL_AGENT_ID")
    if env:
        return env
    # No env, no CLI flag, no AGENTS_MAP available at migration time — prompt.
    return _prompt(
        "Which agent is performing this migration? (e.g., claude, codex, gemini): "
    ).strip() or "unknown-agent"


def _prompt(msg: str) -> str:
    """Interactive prompt. Falls back to empty string when stdin is not a TTY."""
    if not sys.stdin.isatty():
        return ""
    try:
        return input(msg)
    except EOFError:
        return ""


def build_plan(
    repo_root: Path,
    agents_dir: Path,
    actor: str,
    agent: str,
) -> Plan:
    plan = Plan(repo_root=repo_root, agents_dir=agents_dir, actor=actor, agent=agent)

    agent_log = agents_dir / "agent_log"
    pair_dir = agents_dir / "local" / actor / agent

    # 1. handoff.md — rewrite (not a plain move) so the migrated file conforms
    # to the v2 8-item checklist shape with the renamed/new keys. The v1 source
    # is preserved in agent_log/ — the user removes it together with the rest
    # of agent_log/ after validating the new layout.
    old_handoff = agent_log / "handoff.md"
    new_handoff = pair_dir / "handoff.md"
    if old_handoff.is_file():
        plan.rewrite_handoff = (old_handoff, new_handoff)

    # 2. decisions.json (array) → .agents/decisions.jsonl
    old_decisions = agent_log / "decisions.json"
    new_decisions = agents_dir / "decisions.jsonl"
    if old_decisions.is_file():
        plan.convert_decisions = (old_decisions, new_decisions)

    # 3. activity_YYYY-MM.md (all) → local/<pair>/activity.log (concatenated)
    activity_files = sorted(agent_log.glob("activity_*.md"))
    if activity_files:
        plan.concat_activity = (activity_files, pair_dir / "activity.log")

    # 4. agent_lessons.md — split into LESSONS.md (project) + local/<pair>/lessons.md (personal)
    old_agent_lessons = agent_log / "agent_lessons.md"
    new_project_lessons = agents_dir / "LESSONS.md"
    new_personal_lessons = pair_dir / "lessons.md"
    if old_agent_lessons.is_file():
        plan.split_lessons = (
            old_agent_lessons,
            new_project_lessons,
            new_personal_lessons,
        )
    else:
        # no lessons file — still create a seeded project LESSONS.md header
        if not new_project_lessons.is_file():
            plan.creates.append((new_project_lessons, LESSONS_SEED_HEADER))

    # 5. checkpoints/ → .agents/checkpoints/
    old_checkpoints = agent_log / "checkpoints"
    new_checkpoints = agents_dir / "checkpoints"
    if old_checkpoints.is_dir():
        for ckpt in sorted(old_checkpoints.iterdir()):
            if ckpt.is_file():
                plan.moves.append((ckpt, new_checkpoints / ckpt.name))

    # 6. sessions/active_sessions.md → .agents/sessions/active_sessions.md
    old_sessions = agent_log / "sessions" / "active_sessions.md"
    new_sessions = agents_dir / "sessions" / "active_sessions.md"
    if old_sessions.is_file():
        plan.moves.append((old_sessions, new_sessions))

    # 7. repo-root tasks/TASK.md → local/<pair>/tasks/TASK.md
    old_task = repo_root / "tasks" / "TASK.md"
    new_task = pair_dir / "tasks" / "TASK.md"
    if old_task.is_file():
        plan.moves.append((old_task, new_task))

    # 8. Scaffolding for shared files that must exist in v2.0.0
    if not (agents_dir / "JOURNAL.md").is_file():
        plan.creates.append((agents_dir / "JOURNAL.md", JOURNAL_SEED_HEADER))
    if not (agents_dir / "AGENTS_MAP.md").is_file():
        plan.creates.append((agents_dir / "AGENTS_MAP.md", DEFAULT_AGENTS_MAP_SEED))
    if not (agents_dir / "decisions.jsonl").is_file() and plan.convert_decisions is None:
        plan.creates.append((agents_dir / "decisions.jsonl", ""))

    # 9. Post-migration notes
    plan.notes.append(
        "Old agent_log/ will NOT be deleted. After validating the new layout, "
        "remove it manually: git rm -r .agents/agent_log/"
    )
    plan.notes.append(
        "Append .agents/local/ to your .gitignore so per-pair state stops being tracked."
    )
    plan.notes.append(
        "Consider logging this migration as a JOURNAL.md entry and as a decisions.jsonl entry."
    )

    return plan


def apply_plan(plan: Plan, assume_yes: bool) -> None:
    # Creates first (idempotent — skip if already present)
    for dst, content in plan.creates:
        if dst.is_file():
            print(f"skip (exists): {dst.relative_to(plan.repo_root)}", file=sys.stderr)
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(content, encoding="utf-8")
        print(f"created: {dst.relative_to(plan.repo_root)}")

    # Convert decisions.json array → decisions.jsonl
    if plan.convert_decisions:
        src, dst = plan.convert_decisions
        _convert_decisions(src, dst, plan.repo_root)

    # Split agent_lessons.md
    if plan.split_lessons:
        src, proj_dst, pers_dst = plan.split_lessons
        _split_lessons(src, proj_dst, pers_dst, plan, assume_yes)

    # Concatenate activity logs
    if plan.concat_activity:
        srcs, dst = plan.concat_activity
        _concat_activity(srcs, dst, plan.repo_root)

    # Rewrite handoff in v2.0.0 shape
    if plan.rewrite_handoff:
        src, dst = plan.rewrite_handoff
        _rewrite_handoff(src, dst, plan.repo_root)

    # Moves
    for src, dst in plan.moves:
        if not src.is_file():
            print(f"skip (already moved or missing): {src}", file=sys.stderr)
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        os.replace(src, dst)
        print(f"moved: {src.relative_to(plan.repo_root)} → {dst.relative_to(plan.repo_root)}")


def _convert_decisions(src: Path, dst: Path, repo_root: Path) -> None:
    try:
        data = json.loads(src.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise SystemExit(f"error: {src} is not valid JSON — {e}")
    if not isinstance(data, list):
        raise SystemExit(f"error: {src} is not a JSON array (expected v1.x format)")
    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open("w", encoding="utf-8") as f:
        for entry in data:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(
        f"converted: {src.relative_to(repo_root)} ({len(data)} entries) → "
        f"{dst.relative_to(repo_root)} (JSONL)"
    )
    # Do not delete src — the user removes agent_log/ manually after validation.


def _split_lessons(
    src: Path, proj_dst: Path, pers_dst: Path, plan: Plan, assume_yes: bool
) -> None:
    """Split v1.x agent_lessons.md into project and personal halves.

    Interactive by default. With --yes, puts everything into project LESSONS.md
    under the assumption that pre-v2 agent_lessons was the closer analog and
    the user will move personal bits over later.
    """
    content = src.read_text(encoding="utf-8")
    proj_dst.parent.mkdir(parents=True, exist_ok=True)
    pers_dst.parent.mkdir(parents=True, exist_ok=True)

    personal_header = PERSONAL_LESSONS_HEADER_TEMPLATE.format(
        actor=plan.actor, agent=plan.agent, date=_today_iso()
    )

    if assume_yes or not sys.stdin.isatty():
        proj_dst.write_text(
            LESSONS_SEED_HEADER
            + "\n<!-- migrated from v1.x agent_lessons.md; review and move any personal lessons to .agents/local/<actor>/<agent>/lessons.md -->\n\n"
            + content,
            encoding="utf-8",
        )
        pers_dst.write_text(personal_header, encoding="utf-8")
        print(
            "WARNING: non-interactive lessons split — the entire v1.x agent_lessons.md was\n"
            f"         copied into {proj_dst.relative_to(plan.repo_root)} (project-level).\n"
            f"         {pers_dst.relative_to(plan.repo_root)} (personal) was left with only\n"
            "         its header. Personal lessons were NOT automatically separated.\n"
            "         Manual triage required: review the migrated file and move any\n"
            "         entries that describe how THIS (actor, agent) pair works into the\n"
            "         personal lessons file. Re-run interactively (without --yes and with\n"
            "         a TTY) for guided classification."
        )
        return

    print(
        f"\nSplitting {src.relative_to(plan.repo_root)}: classify each top-level section as\n"
        "  [p]roject (any actor on this project should know this)\n"
        "  [e]rsonal (about how this specific actor × agent pair works)\n"
        "  [s]kip (leave out of both)\n"
    )
    sections = _split_into_sections(content)
    project_bits: list[str] = [LESSONS_SEED_HEADER, ""]
    personal_bits: list[str] = [personal_header, ""]
    for i, section in enumerate(sections, 1):
        preview = section.strip().splitlines()[0][:80]
        while True:
            choice = _prompt(f"[{i}/{len(sections)}] {preview!r} — [p/e/s]? ").lower().strip()
            if choice in ("p", "e", "s"):
                break
        if choice == "p":
            project_bits.append(section)
        elif choice == "e":
            personal_bits.append(section)
    proj_dst.write_text("\n".join(project_bits), encoding="utf-8")
    pers_dst.write_text("\n".join(personal_bits), encoding="utf-8")
    print(f"split: {proj_dst.relative_to(plan.repo_root)} and {pers_dst.relative_to(plan.repo_root)} written")


def _split_into_sections(content: str) -> list[str]:
    """Split on `## ` headings; everything before the first heading is the preamble."""
    sections: list[str] = []
    current: list[str] = []
    for line in content.splitlines():
        if line.startswith("## ") and current:
            sections.append("\n".join(current))
            current = [line]
        else:
            current.append(line)
    if current:
        sections.append("\n".join(current))
    return sections


V2_CHECKLIST_LINES = [
    "- [ ] `activity.log` contains an entry for this session",
    "- [ ] `decisions.jsonl` appended (if any decision was made)",
    "- [ ] `local/<actor>/<agent>/lessons.md` appended (if a personal lesson emerged) — N/A — new in v2.0.0, will be filled on next session close",
    "- [ ] `LESSONS.md` appended (if a project-level lesson emerged)",
    "- [ ] `JOURNAL.md` appended (if the session produced a structurally significant delivery) — N/A — new in v2.0.0, will be filled on next session close",
    "- [ ] Commit(s) follow `[Agent] <type>: <summary>` convention",
    "- [ ] Version bumps applied to any rules file whose content changed",
    "- [ ] `active_sessions.md` row for this session removed (if registry is in use)",
]


def _rewrite_handoff(src: Path, dst: Path, repo_root: Path) -> None:
    """Rewrite a v1 handoff.md into the v2.0.0 8-item-checklist shape.

    Preserves the seven canonical fields verbatim (Last Agent, Timestamp,
    Status, Last Action, Pending Step, Blockers/Context, Open Threads).
    Replaces the 7-item v1 checklist with the v2 8-item checklist; the two
    new entries (personal_lessons_appended, journal_appended) land as
    unchecked with an explicit N/A note so the next session regenerates
    them in v2 format.

    The v1 source is preserved under agent_log/ — the user removes it
    together with the rest of agent_log/ after validating the new layout.
    """
    text = src.read_text(encoding="utf-8")
    dst.parent.mkdir(parents=True, exist_ok=True)

    # Split on the checklist header — everything above is preserved as-is.
    checklist_header_re = re.compile(
        r"^\*\*Session close checklist.*?\*\*\s*$", re.MULTILINE
    )
    m = checklist_header_re.search(text)
    if not m:
        # No recognizable v1 checklist header — write the file as-is plus a
        # fresh v2 checklist appended at the end. Better than silently losing
        # the handoff content when the v1 file had drifted from the schema.
        body = text.rstrip() + "\n\n"
        header_line = "**Session close checklist (self-verified):**"
        print(
            f"warning: {src.relative_to(repo_root)} has no recognizable v1 checklist — "
            "appending a fresh v2 checklist at the end.",
            file=sys.stderr,
        )
    else:
        body = text[: m.start()].rstrip() + "\n\n"
        header_line = "**Session close checklist (self-verified):**"

    v2_text = body + header_line + "\n" + "\n".join(V2_CHECKLIST_LINES) + "\n"
    dst.write_text(v2_text, encoding="utf-8")
    print(
        f"rewrote handoff to v2.0.0: {src.relative_to(repo_root)} → "
        f"{dst.relative_to(repo_root)}"
    )


def _concat_activity(srcs: list[Path], dst: Path, repo_root: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open("w", encoding="utf-8") as out:
        for src in srcs:
            out.write(f"# --- from {src.name} ---\n")
            out.write(src.read_text(encoding="utf-8"))
            if not out.tell() == 0 and not src.read_text(encoding="utf-8").endswith("\n"):
                out.write("\n")
    print(
        f"concatenated: {len(srcs)} activity file(s) → {dst.relative_to(repo_root)}"
    )


def _today_iso() -> str:
    from datetime import date
    return date.today().isoformat()


def _force_utf8_stdio() -> None:
    """On Windows, stdout/stderr default to cp1252 and fail on U+2192 ('→')
    and similar characters used throughout the plan output. Reconfigure both
    streams to UTF-8 so the script runs in a vanilla cmd/PowerShell session
    without requiring PYTHONIOENCODING=utf-8 to be set upstream. No-op on
    POSIX (default encoding is already UTF-8)."""
    if sys.platform == "win32":
        for stream in (sys.stdout, sys.stderr):
            reconfigure = getattr(stream, "reconfigure", None)
            if callable(reconfigure):
                reconfigure(encoding="utf-8", errors="replace")


def main() -> int:
    _force_utf8_stdio()
    parser = argparse.ArgumentParser(
        description="Migrate a consumer project from Lead Protocol v1.x to v2.0.0.",
    )
    parser.add_argument("--actor", help="Override the (actor) identifier (e.g., alice@laptop).")
    parser.add_argument("--agent", help="Override the (agent) slug (e.g., claude, codex).")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually perform the migration. Without this flag, the script runs in dry-run mode.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Explicit no-op alias for the default behavior (no --apply = dry-run). Accepted for readability; mutually exclusive with --apply.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Assume yes on interactive prompts (non-interactive split: everything goes to project LESSONS.md).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-run the migration even when v2 destinations already exist. DESTRUCTIVE — overwrites v2 state from legacy agent_log/ sources. Use only when you know the prior apply did not complete or produced the wrong result.",
    )
    args = parser.parse_args()

    if args.dry_run and args.apply:
        parser.error(
            "--dry-run and --apply are mutually exclusive. --dry-run is the default "
            "(run without --apply); --apply actually performs the migration."
        )

    repo_root = find_repo_root(Path.cwd())
    agents_dir = repo_root / ".agents"
    detect_v1_layout(agents_dir)
    check_rerun_safety(agents_dir, force=args.force)

    actor = resolve_actor(args.actor)
    agent = resolve_agent(args.agent)
    _validate_slug(actor, "--actor / LEAD_PROTOCOL_ACTOR_ID")
    _validate_slug(agent, "--agent / LEAD_PROTOCOL_AGENT_ID")
    _check_slug_destination(agents_dir, actor, agent)

    plan = build_plan(repo_root, agents_dir, actor, agent)
    print(plan.describe())

    framework_gaps = check_framework_present(agents_dir)
    if framework_gaps:
        print("\nWARNING: v2 framework files are not fully in place in this repo:")
        for line in framework_gaps:
            print(line)
        print(
            "\n  This migration moves STATE only. It does NOT replace framework files\n"
            "  (schemas/, scripts/, CORE_RULES.md, PROTOCOL_RULES.md, modules/).\n"
            "  Before running with --apply, copy those files verbatim from the v2.0.0\n"
            "  release scaffold into this repo — otherwise the migrated state will not validate\n"
            "  against the v1 schemas sitting in .agents/schemas/. See\n"
            "  PROTOCOL_RULES.md §M-meta-6 for the full framework-replacement contract."
        )

    if not args.apply:
        print("\nDry-run complete. Re-run with --apply to perform the migration.")
        return 0

    if not args.yes and sys.stdin.isatty():
        confirm = _prompt("\nProceed with the migration above? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.", file=sys.stderr)
            return 1

    apply_plan(plan, assume_yes=args.yes)
    print("\nMigration applied. Next steps:")
    print("  1. Review the new layout under .agents/")
    print("  2. Add `.agents/local/` to your .gitignore (if not already present)")
    print("  3. Run the validator to confirm the migrated handoff + decisions conform:")
    print("        python .agents/scripts/validate_state.py")
    if plan.split_lessons and (args.yes or not sys.stdin.isatty()):
        print("  4. MANUAL: the non-interactive lessons split left all entries in the")
        print("     project-level LESSONS.md. Move any personal lessons (about how THIS")
        print("     actor × agent pair works) into .agents/local/<actor>/<agent>/lessons.md.")
        print("  5. Log this migration as a decisions.jsonl entry")
        print("  6. Remove the old agent_log/ directory: git rm -r .agents/agent_log/")
    else:
        print("  4. Log this migration as a decisions.jsonl entry")
        print("  5. Remove the old agent_log/ directory: git rm -r .agents/agent_log/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
