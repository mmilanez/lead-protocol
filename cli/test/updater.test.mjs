import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, readlinkSync, realpathSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const bin = process.env.LEAD_PROTOCOL_TEST_BIN ?? fileURLToPath(new URL('../dist/index.js', import.meta.url));
const packageVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
function fixture(t) {
  // Match spawned CLI cwd resolution (e.g. macOS /var -> /private/var).
  // Resolve only the allocation root, preserving hazards created inside fixtures.
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), 'lp-update-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function put(root, rel, value = 'custom sentinel\r\n\n\n') {
  const dest = path.join(root, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, value);
}
function run(root, ...args) {
  return spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8' });
}
function snapshot(root) {
  const result = {};
  function walk(dir, prefix = '') {
    for (const name of readdirSync(dir).sort()) {
      const rel = prefix + name;
      const full = path.join(dir, name);
      const stat = lstatSync(full);
      result[rel] = stat.isSymbolicLink() ? ['link', readlinkSync(full)] : stat.isDirectory() ? ['dir'] : ['file', readFileSync(full).toString('base64'), stat.mode, stat.mtimeMs];
      if (stat.isDirectory()) walk(full, rel + '/');
    }
  }
  walk(root);
  return result;
}
test('init refuses any existing install without force, even partial or malformed', t => {
  for (const kind of ['partial', 'complete', 'file', 'dangling']) {
    const root = fixture(t);
    if (kind === 'file') put(root, '.agents');
    else if (kind === 'dangling') symlinkSync(path.join(root, 'missing'), path.join(root, '.agents'));
    else {
      put(root, '.agents/PROJECT_RULES.md');
      if (kind === 'complete') put(root, '.agents/CORE_RULES.md');
    }
    const before = snapshot(root);
    const result = run(root, 'init', '--yes');
    assert.notEqual(result.status, 0, kind + result.stdout);
    assert.match(result.stdout + result.stderr, /force|update/i);
    assert.deepEqual(snapshot(root), before, kind);
  }
});
test('init --force overlays seeds but preserves actor local including bundled example names', t => {
  const root = fixture(t);
  put(root, '.agents/PROJECT_RULES.md');
  put(root, '.agents/local/example-actor/claude/handoff.md');
  put(root, '.agents/local/mike/codex/handoff.md');
  const before = snapshot(path.join(root, '.agents/local'));
  const result = run(root, 'init', '--force', '--yes');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(snapshot(path.join(root, '.agents/local')), before);
  assert.notEqual(readFileSync(path.join(root, '.agents/PROJECT_RULES.md'), 'utf8'), 'custom sentinel\r\n\n\n');
});

test('update refreshes manifest/framework, seeds missing project files, preserves project/local/orphans and is idempotent', t => {
  const root = fixture(t);
  assert.equal(run(root, 'init', '--yes').status, 0);
  const projectPaths = ['PROJECT_RULES.md', 'AGENTS_MAP.md', 'JOURNAL.md', 'LESSONS.md', 'decisions.jsonl', 'sessions/active_sessions.md', 'checkpoints/custom.md'];
  for (const rel of projectPaths) put(root, '.agents/' + rel, 'project bytes ' + rel + '\r\n\n\n');
  put(root, '.agents/local/example-actor/claude/handoff.md');
  put(root, '.agents/local/mike/codex/tasks/TASK.md');
  put(root, '.agents/modules/orphan.md');
  put(root, '.agents/manifest.json', '{"product_version":"0.0.0"}');
  put(root, '.agents/CORE_RULES.md', 'old framework');
  rmSync(path.join(root, '.agents/checkpoints/.gitkeep'));
  const preserved = new Map(projectPaths.map(rel => [rel, readFileSync(path.join(root, '.agents', rel))]));
  const local = snapshot(path.join(root, '.agents/local'));
  const beforeDryRun = snapshot(root);
  const dry = run(root, 'update', '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.deepEqual(snapshot(root), beforeDryRun, 'dry-run must not change bytes or mtimes');
  const result = run(root, 'update', '--yes');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(path.join(root, '.agents/manifest.json'))).product_version, packageVersion);
  assert.match(readFileSync(path.join(root, '.agents/CORE_RULES.md'), 'utf8'), /CORE_RULES/);
  assert.ok(lstatSync(path.join(root, '.agents/checkpoints/.gitkeep')).isFile());
  for (const [rel, bytes] of preserved) assert.deepEqual(readFileSync(path.join(root, '.agents', rel)), bytes, rel);
  assert.deepEqual(snapshot(path.join(root, '.agents/local')), local);
  assert.equal(readFileSync(path.join(root, '.agents/modules/orphan.md'), 'utf8'), 'custom sentinel\r\n\n\n');
  assert.match(result.stdout, /orphan.md/);
  const beforeRepeat = snapshot(path.join(root, '.agents'));
  assert.equal(run(root, 'update', '--yes').status, 0);
  assert.deepEqual(snapshot(path.join(root, '.agents')), beforeRepeat);
});

test('update repairs a partial pre-manifest install without creating local seeds', t => {
  const root = fixture(t);
  put(root, '.agents/PROJECT_RULES.md');
  const result = run(root, 'update', '--yes');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(path.join(root, '.agents/PROJECT_RULES.md'), 'utf8'), 'custom sentinel\r\n\n\n');
  assert.equal(JSON.parse(readFileSync(path.join(root, '.agents/manifest.json'))).product_version, packageVersion);
  assert.equal(lstatSync(path.join(root, '.agents/local'), { throwIfNoEntry: false }), undefined);
});

test('manifest is a framework file and stale manifests are planned for refresh', async t => {
  const { planUpdate, applyUpdate } = await import(new URL('./lib/updater.js', pathToFileURL(bin)).href);
  const root = fixture(t);
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  put(source, 'manifest.json', '{"product_version":"2.1.5"}');
  put(target, 'manifest.json', '{"product_version":"old"}');
  const plan = planUpdate(source, target);
  assert.deepEqual(plan.files, [{ relPath: 'manifest.json', layer: 'framework', action: 'updated' }]);
  applyUpdate(source, target, plan);
  assert.deepEqual(readFileSync(path.join(target, 'manifest.json')), readFileSync(path.join(source, 'manifest.json')));
});

for (const command of [['update', '--yes'], ['update', '--dry-run'], ['init', '--force', '--yes']]) {
  for (const hazard of ['.agents', '.agents/CORE_RULES.md', '.agents/modules', '.agents/modules/git-substrate.md', '.agents/modules/extra-link', 'CLAUDE.md', 'AGENTS.md', '.gitignore', 'malformed-schemas', 'malformed-guideline']) {
    test(`${command.join(' ')} preflights ${hazard} before any writes and retains links`, t => {
      const root = fixture(t);
      const target = path.join(root, 'project');
      mkdirSync(target);
      put(target, '.agents/CORE_RULES.md', 'stale framework');
      put(target, '.agents/PROJECT_RULES.md');
      if (hazard === 'malformed-schemas') put(target, '.agents/schemas', 'not a directory');
      else if (hazard === 'malformed-guideline') mkdirSync(path.join(target, 'AGENTS.md'));
      else {
        const dest = path.join(target, hazard);
        rmSync(dest, { recursive: true, force: true });
        mkdirSync(path.dirname(dest), { recursive: true });
        const external = path.join(root, 'outside');
        if (['.agents', '.agents/modules'].includes(hazard)) {
          mkdirSync(external);
          put(external, 'CORE_RULES.md', 'external framework sentinel');
          put(external, 'git-substrate.md', 'external module sentinel');
        } else writeFileSync(external, 'external sentinel');
        symlinkSync(external, dest);
      }
      const before = snapshot(root);
      const result = run(target, ...command);
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stdout + result.stderr, /symlink|symbolic|unsafe|directory|regular file/i);
      assert.deepEqual(snapshot(root), before, 'no writes anywhere before refusal');
    });
  }
}

test('update refuses nearest malformed .agents instead of falling back to a parent install', t => {
  const root = fixture(t);
  put(root, '.agents/CORE_RULES.md', 'parent unchanged');
  put(root, 'child/.agents', 'malformed');
  const before = snapshot(root);
  assert.notEqual(run(path.join(root, 'child'), 'update', '--yes').status, 0);
  assert.deepEqual(snapshot(root), before);
});

test('update and force init do not inspect or seed linked actor-local directories', t => {
  for (const args of [['update', '--yes'], ['init', '--force', '--yes']]) {
    const root = fixture(t);
    put(root, '.agents/PROJECT_RULES.md');
    symlinkSync(path.join(root, 'missing-local'), path.join(root, '.agents/local'));
    assert.equal(run(root, ...args).status, 0);
    assert.equal(readlinkSync(path.join(root, '.agents/local')), path.join(root, 'missing-local'));
    assert.equal(lstatSync(path.join(root, 'missing-local'), { throwIfNoEntry: false }), undefined);
  }
});

test('updater rejects injected traversal/local paths and late symlinks before earlier writes', async t => {
  const { planUpdate, applyUpdate } = await import(new URL('./lib/updater.js', pathToFileURL(bin)).href);
  const root = fixture(t);
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  put(source, 'CORE_RULES.md', 'new');
  put(source, 'PROTOCOL_RULES.md', 'new');
  put(target, 'CORE_RULES.md', 'old');
  put(target, 'PROTOCOL_RULES.md', 'old');
  const plan = planUpdate(source, target);
  for (const relPath of ['../outside', '/absolute', 'modules/../../outside', 'local/mike/codex/handoff.md', 'modules\\..\\outside']) {
    const before = snapshot(root);
    assert.throws(() => applyUpdate(source, target, { ...plan, files: [...plan.files, { relPath, action: 'created', layer: 'framework' }] }), /unsafe|path|local/i);
    assert.deepEqual(snapshot(root), before);
  }
  rmSync(path.join(target, 'PROTOCOL_RULES.md'));
  put(root, 'outside', 'outside');
  symlinkSync(path.join(root, 'outside'), path.join(target, 'PROTOCOL_RULES.md'));
  const before = snapshot(root);
  assert.throws(() => applyUpdate(source, target, plan), /symlink|symbolic/i);
  assert.deepEqual(snapshot(root), before);
});

for (const args of [['init', '--yes'], ['update', '--yes']]) {
  test(`${args[0]} preserves guideline bytes outside tags and repeat update does no writes`, t => {
    const root = fixture(t);
    if (args[0] === 'update') put(root, '.agents/PROJECT_RULES.md');
    const prefix = 'user prefix\r\n\n\n  \n';
    const suffix = '\n\n\nuser suffix  ';
    put(root, 'CLAUDE.md', prefix + '<lead-protocol>old</lead-protocol>' + suffix);
    put(root, 'AGENTS.md', prefix);
    assert.equal(run(root, ...args).status, 0);
    const claude = readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
    assert.ok(claude.startsWith('<lead-protocol>'), 'block moved to the top');
    assert.ok(claude.endsWith('</lead-protocol>\n\n' + prefix + suffix), 'user bytes around the old block');
    assert.ok(readFileSync(path.join(root, 'AGENTS.md'), 'utf8').endsWith('</lead-protocol>\n\n' + prefix), 'untagged content preserved');
    const before = snapshot(root);
    assert.equal(run(root, 'update', '--yes').status, 0);
    assert.deepEqual(snapshot(root), before, 'repeat update must not rewrite identical guidelines');
  });
}


test('template actor seeds are excluded entirely even under force overlay', async t => {
  const { planUpdate, applyUpdate } = await import(new URL('./lib/updater.js', pathToFileURL(bin)).href);
  const root = fixture(t);
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  put(source, 'CORE_RULES.md', 'new');
  put(source, 'local/example-actor/claude/handoff.md', 'bundled example');
  symlinkSync(path.join(root, 'absent'), path.join(source, 'local/broken'));
  put(target, 'local/example-actor/claude/handoff.md', 'real actor state');
  const local = snapshot(path.join(target, 'local'));
  for (const force of [false, true]) {
    const plan = planUpdate(source, target, force);
    assert.ok(plan.files.every(file => !file.relPath.startsWith('local/')));
    applyUpdate(source, target, plan);
    assert.deepEqual(snapshot(path.join(target, 'local')), local);
  }
});


test('init --force warning names project files and describes overlay preservation', t => {
  const root = fixture(t);
  put(root, '.agents/PROJECT_RULES.md');
  put(root, '.agents/checkpoints/custom.md', 'keep checkpoint');
  const result = run(root, 'init', '--force', '--yes');
  assert.equal(result.status, 0, result.stderr);
  const warning = result.stdout.slice(0, result.stdout.indexOf('.agents/ created'));
  for (const rel of ['PROJECT_RULES.md', 'AGENTS_MAP.md', 'JOURNAL.md', 'LESSONS.md', 'decisions.jsonl', 'sessions/active_sessions.md', 'checkpoints/.gitkeep']) {
    assert.ok(warning.includes('.agents/' + rel), 'warning must name ' + rel);
  }
  assert.match(warning, /overwrite/i);
  assert.match(warning, /overlay/i);
  assert.match(warning, /custom checkpoints.*preserved/i);
  assert.equal(readFileSync(path.join(root, '.agents/checkpoints/custom.md'), 'utf8'), 'keep checkpoint');
});

for (const option of ['--dry-run', '--yes']) {
  test(`update ${option} reports every bundled file with its planned status`, t => {
    const root = fixture(t);
    assert.equal(run(root, 'init', '--yes').status, 0);
    const files = Object.entries(snapshot(path.join(root, '.agents')))
      .filter(([, value]) => value[0] === 'file').map(([rel]) => rel);
    put(root, '.agents/CORE_RULES.md', 'old framework');
    put(root, '.agents/PROJECT_RULES.md', 'custom project');
    rmSync(path.join(root, '.agents/checkpoints/.gitkeep'));
    const result = run(root, 'update', option);
    assert.equal(result.status, 0, result.stderr);
    const report = [...result.stdout.matchAll(/\b(updated|created|unchanged)\s+\.agents\/(\S+)/g)]
      .map(([, action, rel]) => [rel, action]);
    const expected = files.map(rel => [rel, rel === 'CORE_RULES.md' ? 'updated' : rel === 'checkpoints/.gitkeep' ? 'created' : 'unchanged']);
    assert.deepEqual(report.sort(), expected.sort());
    assert.equal(readFileSync(path.join(root, '.agents/PROJECT_RULES.md'), 'utf8'), 'custom project');
  });
}
