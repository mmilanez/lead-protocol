import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { closeSession, createCheckpoint, LifecycleError, openSession, parseActiveSessions } from "../dist/lib/session-lifecycle.js";

function fixture(newline = "\n", peer = true) {
  const root = mkdtempSync(path.join(os.tmpdir(), "lp-lifecycle-"));
  const agents = path.join(root, ".agents");
  mkdirSync(path.join(agents, "modules"), { recursive: true });
  mkdirSync(path.join(agents, "sessions"), { recursive: true });
  mkdirSync(path.join(agents, "checkpoints"), { recursive: true });
  writeFileSync(path.join(agents, "CORE_RULES.md"), "# Core\n");
  writeFileSync(path.join(agents, "PROJECT_RULES.md"), "# Project\n\n- **Active modules:** `git-substrate`\n");
  writeFileSync(path.join(agents, "modules", "git-substrate.md"), "# Git module\n");
  writeFileSync(path.join(agents, "AGENTS_MAP.md"), "| Tool signature | Agent slug |\n|---|---|\n| codex-cli | codex |\n");
  writeFileSync(path.join(agents, "decisions.jsonl"), "");
  const rows = peer ? ["| 2026-07-18-0700-claude | [Claude] | 2026-07-18T07:00:00.000Z | Peer work | — |"] : [];
  writeFileSync(path.join(agents, "sessions", "active_sessions.md"), [
    "# active_sessions.md — Sessions currently live", "", "| Session ID | Agent | Started | Topic | Last checkpoint |",
    "|---|---|---|---|---|", ...rows, "---", "", "## Usage", "Keep this text byte-for-byte.", "",
  ].join(newline));
  return root;
}

async function inFixture(options, fn) {
  const root = fixture(options?.newline, options?.peer);
  const previous = process.cwd();
  process.chdir(root);
  try { await fn(root); } finally { process.chdir(previous); rmSync(root, { recursive: true, force: true }); }
}

test("open -> checkpoint -> close preserves peer state and emits verifiable receipts", { concurrency: false }, async () => {
  await inFixture({}, (root) => {
    const openedAt = new Date("2026-07-18T08:00:00.000Z");
    const receipt = openSession({ actor: "marco", agent: "codex", signature: "[Codex / GPT-5]", topic: "Build Week", now: openedAt });
    assert.equal(receipt.sessionId, "2026-07-18-0800-codex");
    assert.deepEqual(receipt.files.map((f) => f.path), [
      ".agents/CORE_RULES.md", ".agents/PROJECT_RULES.md", ".agents/modules/git-substrate.md",
      ".agents/AGENTS_MAP.md", ".agents/sessions/active_sessions.md", ".agents/local/marco/codex/handoff.md",
    ]);
    for (const file of receipt.files) {
      const bytes = readFileSync(path.join(root, file.path));
      assert.equal(file.sha256, createHash("sha256").update(bytes).digest("hex"));
    }
    const registryPath = path.join(root, ".agents", "sessions", "active_sessions.md");
    let registry = readFileSync(registryPath, "utf8");
    assert.match(registry, /2026-07-18-0700-claude/);
    assert.match(registry, /Keep this text byte-for-byte\./);
    const checkpoint = createCheckpoint({ actor: "marco", agent: "codex", title: "mvp-proof", body: "Evidence body", now: new Date("2026-07-18T08:01:02.000Z") });
    assert.equal(path.basename(checkpoint.checkpoint), "20260718T080102Z_codex_mvp-proof.md");
    registry = readFileSync(registryPath, "utf8");
    assert.match(registry, /20260718T080102Z_codex_mvp-proof\.md/);
    const closed = closeSession({ actor: "marco", agent: "codex", journal: "not-significant", status: "STABLE", lastAction: "Verified lifecycle.", pendingStep: "None", confirmChecklist: true, now: new Date("2026-07-18T08:02:00.000Z") });
    assert.equal(closed.sessionId, receipt.sessionId);
    registry = readFileSync(registryPath, "utf8");
    assert.match(registry, /2026-07-18-0700-claude/);
    assert.doesNotMatch(registry, /2026-07-18-0800-codex/);
    const handoff = readFileSync(path.join(root, ".agents", "local", "marco", "codex", "handoff.md"), "utf8");
    assert.match(handoff, /\*\*Status:\*\* STABLE/);
    assert.equal((handoff.match(/^- \[x\]/gm) ?? []).length, 8);
  });
});

test("duplicate same-pair open fails safely without changing registry", { concurrency: false }, async () => {
  await inFixture({}, (root) => {
    openSession({ actor: "marco", agent: "codex", topic: "one", now: new Date("2026-07-18T08:00:00.000Z") });
    const registryPath = path.join(root, ".agents", "sessions", "active_sessions.md");
    const before = readFileSync(registryPath, "utf8");
    assert.throws(() => openSession({ actor: "marco", agent: "codex", topic: "two", now: new Date("2026-07-18T08:03:00.000Z") }), LifecycleError);
    assert.equal(readFileSync(registryPath, "utf8"), before);
  });
});

test("registry parser rejects duplicate IDs", () => {
  const text = "| Session ID | Agent | Started | Topic | Last checkpoint |\n|---|---|---|---|---|\n| same | [A] | now | one | — |\n| same | [B] | now | two | — |\n";
  assert.throws(() => parseActiveSessions(text), /duplicate active session ID/);
});

test("CRLF registry remains CRLF after open", { concurrency: false }, async () => {
  await inFixture({ newline: "\r\n", peer: false }, (root) => {
    openSession({ actor: "marco", agent: "codex", topic: "crlf", now: new Date("2026-07-18T08:00:00.000Z") });
    const bytes = readFileSync(path.join(root, ".agents", "sessions", "active_sessions.md"), "utf8");
    assert.equal(bytes.replace(/\r\n/g, "").includes("\n"), false);
  });
});

test("significant close requires explicit JOURNAL confirmation", { concurrency: false }, async () => {
  await inFixture({}, () => {
    openSession({ actor: "marco", agent: "codex", topic: "journal", now: new Date("2026-07-18T08:00:00.000Z") });
    assert.throws(() => closeSession({ actor: "marco", agent: "codex", journal: "significant", status: "STABLE", lastAction: "Done", pendingStep: "None", confirmChecklist: true }), /journal-entry-confirmed/);
  });
});
