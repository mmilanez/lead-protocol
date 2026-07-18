# Public lifecycle adversarial review — final report

> Completed: 2026-07-18T19:51:53Z
> Scope: public checkout only; offline; unreleased main-branch hardening after the immutable v2.1.1 tag
> Codex model: `gpt-5.6-sol` with `model_reasoning_effort="medium"`
> Codex thread ID: `019f76b1-7ad4-7133-88bb-1e7f6c26dacf`

## Confirmed findings and disposition

1. **Rejected pristine open committed partial state — fixed.** `session open` created or updated the pair handoff and appended its active-session row before rejecting the pristine `PROJECT_RULES.md` Active modules placeholder. Boot prerequisites and open metadata are now validated before any pair-state write, and post-write failures compensate only the opening session's mutations.
2. **Interrupted open could leave an unowned active row or handoff — fixed.** Failure after registry mutation but before receipt creation now removes only the failed session row, preserves concurrent peer rows, and restores or removes the handoff as appropriate.
3. **Checkpoint registry conflict orphaned the checkpoint file — fixed.** A failed optimistic registry compare now removes the just-created checkpoint while preserving the concurrent registry update.
4. **Close validated user fields after removing its active row — fixed.** All handoff fields are built and validated before registry mutation, so malformed close input leaves both registry and handoff unchanged.
5. **Close temporarily released pair ownership before completion — fixed.** The active row is now removed by the final compare-and-swap only after handoff and receipt writes succeed, so a same-pair open cannot interleave with an incomplete close. A final registry conflict restores only artifacts created by that close and preserves the concurrent peer mutation.
6. **Receipt location was treated as proof of ownership — fixed.** Open receipts are structurally checked; filename, session ID, actor/agent identity, safe signature, and active-row signature must agree before checkpoint or close can mutate state.
7. **Peer rows were semantically preserved but re-rendered — fixed.** Registry mutation now retains the exact original bytes of unchanged peer rows, including spacing and CRLF style.
8. **Malformed registry could create empty pair directories — fixed.** Registry parsing now completes before pair directories are materialized; dot segments and symbolic-link pair roots are rejected.
9. **Same-pair races and partial rollback were insufficiently defended — fixed.** A fail-closed, per-repository filesystem transaction guard serializes cooperating local CLI mutations without a daemon, network service, or distributed lock. Open establishes registry ownership before handoff/receipt writes, close releases it last, exclusive artifacts become visible only after a complete temporary write is hard-linked into place, and compensation attempts every independent cleanup even if one fails. Direct external edits remain outside the CLI's concurrency contract and are detected on a best-effort double comparison before registry replacement.
10. **Build-time template mirroring leaked live project history — fixed.** The first tarball smoke showed the source repository's decision entry in a fresh consumer. Template sync now clears active-session rows, decisions, and checkpoints while preserving their scaffold structure; the package smoke asserts all three are pristine.

Existing behavior independently verified as correct and left unchanged: duplicate same-pair open rejection, duplicate registry-ID rejection, malformed handoff rejection, significant-JOURNAL confirmation, deterministic same-minute session suffixes, terminal handoff resume, and removal of only the owned row on normal close.

## Changes

- `cli/src/lib/session-lifecycle.ts`: preflight validation, receipt ownership checks, exact peer-row preservation, a local filesystem transaction guard for cooperating CLI processes, complete-before-visible exclusive artifacts, transactional compensation for open/checkpoint/close, and focused fault-injection hooks.
- `cli/test/session-lifecycle.test.mjs`: lifecycle regressions covering happy path, pristine/malformed state, ownership and receipt binding, exact peer preservation, same-pair interleavings, optimistic concurrency, path safety, and interrupted operations.
- `cli/scripts/sync-templates.mjs`: package-template sanitization for source-repository sessions, decisions, checkpoints, and pair-local state.
- `cli/scripts/test-pack.mjs`: fresh-install assertions that source-checkout sessions, decisions, and checkpoints are not shipped to consumers.
- `README.md`: concise Build Week provenance covering Codex collaboration, acceleration, maintainer-owned engineering decisions, GPT-5.6 Sol (Medium)'s specific public-review contribution, and the boundary between pre-existing work and work added during the submission period beginning on 2026-07-13.
- `.agents/decisions.jsonl`: public decision record for this lifecycle hardening.

The repository's package-version field remains `2.1.1`, but these fixes are not in the v2.1.1 tag or npm artifact. This report accompanies a main-branch patch that remains unreleased as a package; it creates no package version, release, or tag.

## Validation

- `npm run typecheck` — PASS.
- `npm test` — PASS, 23/23 tests.
- `npm run test:pack` — PASS: built and packed `@leadsolutions/lead-protocol@2.1.1`, installed the tarball in a clean temporary consumer from available package cache, proved the consumer inherited zero sessions, decisions, and checkpoints, ran init/validate/status, completed open/checkpoint/close, and verified a second-session resume. The temporary consumer was removed.
- Package version check — PASS, `cli/package.json` remains `2.1.1`.

Boundary note: no network tool, external source/history, issue, checkpoint, account data, or secret was used. One initial `git status` ran before the checkout's `.git` pointer was inspected; after discovering that it resolved outside this public directory, all Git commands were stopped and no external history or source content was incorporated.
