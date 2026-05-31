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
