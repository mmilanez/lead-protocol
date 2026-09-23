import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, lstatSync, readdirSync, readlinkSync, symlinkSync, chmodSync } from 'node:fs';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtimeBin = process.env.LP_INDEX_BIN || path.join(root, 'cli/dist/index.js');
const seed = readFileSync(path.join(root, 'INDEX.md'));
function fixture(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lp-index-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const target = path.join(dir, 'project');
  mkdirSync(target);
  return { dir, target };
}
function run(target, bin = runtimeBin, args = ['init', '--yes'], input) {
  return spawnSync(process.execPath, [bin, ...args], { cwd: target, encoding: 'utf8', input, timeout: 15000 });
}
function snapshot(dir) {
  return readdirSync(dir).sort().flatMap(name => {
    const file = path.join(dir, name), stat = lstatSync(file);
    if (stat.isSymbolicLink()) return [[name, 'link', readlinkSync(file)]];
    if (stat.isDirectory()) return [[name, 'dir', snapshot(file)]];
    if (stat.isFile()) return [[name, 'file', readFileSync(file).toString('base64')]];
    return [[name, 'other', stat.mode]];
  });
}
function isolatedBin(dir) {
  const dist = path.join(dir, 'dist');
  cpSync(path.dirname(runtimeBin), dist, { recursive: true });
  // Resolve runtime dependencies without modifying the build under test.
  const dependencies = process.env.LP_INDEX_BIN
    ? path.resolve(path.dirname(runtimeBin), '../../..')
    : path.join(root, 'cli/node_modules');
  symlinkSync(dependencies, path.join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(path.join(dist, 'templates/INDEX.md'), seed);
  return path.join(dist, 'index.js');
}

test('fresh INDEX uses exact seed bytes (isolated runtime source)', t => {
  const { dir, target } = fixture(t);
  const result = run(target, isolatedBin(dir));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(path.join(target, 'INDEX.md')), seed);
  assert.match(result.stdout, /INDEX.md created/);
});
for (const content of ['custom map\n', '', 'custom\r\nmap\r\n']) {
  test(`initial and force init preserve regular INDEX ${JSON.stringify(content)}`, t => {
    const { dir, target } = fixture(t), bin = isolatedBin(dir);
    const index = path.join(target, 'INDEX.md');
    writeFileSync(index, content);
    for (let i = 0; i < 2; i++) {
      const result = run(target, bin, i === 0 ? ['init', '--yes'] : ['init', '--force', '--yes']);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(readFileSync(index), Buffer.from(content));
      assert.match(result.stdout, /INDEX.md preserved/);
    }
  });
}
for (const kind of ['directory', 'live-link', 'dangling-link', ...(process.platform === 'win32' ? [] : ['fifo'])]) {
  test(`destination ${kind} refuses before any init write`, t => {
    const { dir, target } = fixture(t), bin = isolatedBin(dir);
    const outside = path.join(dir, 'outside');
    writeFileSync(outside, 'outside unchanged');
    writeFileSync(path.join(target, 'AGENTS.md'), 'consumer\n\n\ncontent');
    mkdirSync(path.join(target, '.agents'));
    writeFileSync(path.join(target, '.agents/sentinel'), 'keep');
    const index = path.join(target, 'INDEX.md');
    if (kind === 'directory') mkdirSync(index);
    else if (kind === 'fifo') assert.equal(spawnSync('mkfifo', [index]).status, 0);
    else symlinkSync(kind === 'live-link' ? outside : path.join(dir, 'absent'), index);
    const before = snapshot(target);
    const result = run(target, bin, ['init', '--force', '--yes']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /INDEX.md/);
    assert.deepEqual(snapshot(target), before);
    assert.equal(readFileSync(outside, 'utf8'), 'outside unchanged');
    assert.throws(() => lstatSync(path.join(dir, 'absent')), { code: 'ENOENT' });
  });
}
for (const kind of ['missing', 'directory', 'live-link', 'dangling-link', ...(process.platform === 'win32' ? [] : ['fifo', 'unreadable'])]) {
  test(`source ${kind} refuses before any init write even with existing map`, t => {
    if (kind === 'unreadable' && process.getuid?.() === 0) return t.skip('root bypasses permission bits');
    const { dir, target } = fixture(t), bin = isolatedBin(dir);
    const source = path.join(dir, 'dist/templates/INDEX.md');
    rmSync(source);
    const outside = path.join(dir, 'outside');
    writeFileSync(outside, 'outside seed');
    if (kind === 'directory') mkdirSync(source);
    if (kind.endsWith('link')) symlinkSync(kind === 'live-link' ? outside : path.join(dir, 'absent'), source);
    if (kind === 'fifo') assert.equal(spawnSync('mkfifo', [source]).status, 0);
    if (kind === 'unreadable') { writeFileSync(source, seed); chmodSync(source, 0); }
    writeFileSync(path.join(target, 'INDEX.md'), 'custom');
    writeFileSync(path.join(target, '.gitignore'), 'keep');
    const before = snapshot(target);
    const result = run(target, bin);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /INDEX.md/);
    assert.deepEqual(snapshot(target), before);
    assert.equal(readFileSync(outside, 'utf8'), 'outside seed');
    assert.throws(() => lstatSync(path.join(dir, 'absent')), { code: 'ENOENT' });
  });
}

for (const content of [null, 'consumer']) {
  test(`cancellation leaves complete target unchanged: ${content === null ? 'missing map' : 'existing map'}`, t => {
    const { dir, target } = fixture(t), bin = isolatedBin(dir);
    if (content !== null) writeFileSync(path.join(target, 'INDEX.md'), content);
    const before = snapshot(target);
    const result = run(target, bin, ['init'], 'n\n');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Aborted/);
    assert.deepEqual(snapshot(target), before);
  });
}

test('both managed pointers include discovery while preserving bytes outside managed blocks', t => {
  const { dir, target } = fixture(t), bin = isolatedBin(dir);
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    writeFileSync(path.join(target, file), 'before\n\n\n<lead-protocol>old</lead-protocol>\n\n\nafter\n');
  }
  assert.equal(run(target, bin).status, 0);
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    const text = readFileSync(path.join(target, file), 'utf8');
    assert.match(text, /^<lead-protocol>/);
    assert.match(text, /<\/lead-protocol>\n\nbefore\n\n\n\n\n\nafter\n$/);
    assert.match(text, /Before answering a project question/);
    assert.match(text, /§J6/);
    assert.match(text, /§P-Access/);
  }
});

// Load the actual helper with a private filesystem adapter; no process-global mocks.
function indexHelper(overrides = {}) {
  const source = readFileSync(path.join(root, 'cli/src/lib/index-seed.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', compiled)(name => {
    assert.equal(name, 'node:fs');
    return { ...fs, ...overrides };
  }, exports);
  return exports;
}

for (const kind of ['regular', 'directory', 'live-link', 'dangling-link']) {
  test(`exclusive creation handles racing ${kind} without changing entries or referents`, t => {
    const { preflightIndex, installIndex } = indexHelper();
    const { dir, target } = fixture(t);
    const seedFile = path.join(dir, 'seed');
    writeFileSync(seedFile, seed);
    const index = path.join(target, 'INDEX.md');
    const plan = preflightIndex(seedFile, index);
    assert.deepEqual(readdirSync(target), []);
    if (kind === 'regular') writeFileSync(index, 'racing\r\n');
    else if (kind === 'directory') mkdirSync(index);
    else symlinkSync(kind === 'live-link' ? seedFile : path.join(dir, 'missing'), index);
    // Includes the external referent: snapshot(target) alone misses its creation.
    const before = snapshot(dir);
    try {
      if (kind === 'regular') assert.equal(installIndex(plan), 'preserved', kind);
      else assert.throws(() => installIndex(plan), /INDEX.md/, kind);
    } finally {
      assert.deepEqual(snapshot(dir), before, `${kind}: entries and referents unchanged`);
    }
    assert.deepEqual(readFileSync(seedFile), seed);
  });
}

test('install refuses a racing dangling-link before a link-following exclusive write (deterministic model)', t => {
  const { dir, target } = fixture(t);
  const seedFile = path.join(dir, 'seed');
  const index = path.join(target, 'INDEX.md');
  const missing = path.join(dir, 'missing');
  writeFileSync(seedFile, seed);
  let writes = 0;
  const { preflightIndex, installIndex } = indexHelper({
    writeFileSync(file, bytes, options) {
      writes++;
      assert.equal(options.flag, 'wx');
      // Model the Windows referent-create path; this is not native Windows evidence.
      return writeFileSync(readlinkSync(file), bytes, options);
    },
  });
  const plan = preflightIndex(seedFile, index);
  symlinkSync(missing, index);
  const before = snapshot(dir);
  let refusal;
  try { installIndex(plan); } catch (error) { refusal = error; }
  assert.equal(writes, 0, 'unsupported entry must be refused before a write can create its referent');
  assert.match(refusal?.message ?? '', /INDEX.md/);
  assert.deepEqual(snapshot(dir), before);
  assert.throws(() => lstatSync(missing), { code: 'ENOENT' });
});

test('exclusive creation still preserves a regular map arriving at the write boundary', t => {
  const { dir, target } = fixture(t);
  const seedFile = path.join(dir, 'seed');
  const index = path.join(target, 'INDEX.md');
  writeFileSync(seedFile, seed);
  let writes = 0;
  const { preflightIndex, installIndex } = indexHelper({
    writeFileSync(file, bytes, options) {
      writes++;
      assert.equal(options.flag, 'wx');
      writeFileSync(file, 'late consumer\r\n');
      return writeFileSync(file, bytes, options);
    },
  });
  assert.equal(installIndex(preflightIndex(seedFile, index)), 'preserved');
  assert.equal(writes, 1);
  assert.equal(readFileSync(index, 'utf8'), 'late consumer\r\n');
  assert.deepEqual(readFileSync(seedFile), seed);
});

for (const content of [null, '', 'consumer\r\nmap\r\n']) {
  test(`update seeds missing INDEX and preserves regular maps: ${JSON.stringify(content)}`, t => {
    const { target } = fixture(t);
    assert.equal(run(target).status, 0);
    const index = path.join(target, 'INDEX.md');
    if (content === null) rmSync(index);
    else writeFileSync(index, content);
    const before = snapshot(target);
    const dry = run(target, runtimeBin, ['update', '--dry-run']);
    assert.equal(dry.status, 0, dry.stderr);
    assert.deepEqual(snapshot(target), before);
    for (let i = 0; i < 2; i++) {
      const result = run(target, runtimeBin, ['update', '--yes']);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(readFileSync(index), content === null ? seed : Buffer.from(content));
    }
  });
}

for (const kind of ['directory', 'live-link', 'dangling-link', 'missing-source']) {
  test(`update rejects INDEX ${kind} before any write, including dry-run`, t => {
    const { dir, target } = fixture(t), bin = isolatedBin(dir);
    assert.equal(run(target, bin).status, 0);
    const index = path.join(target, 'INDEX.md');
    const outside = path.join(dir, 'outside');
    writeFileSync(outside, 'untouched');
    if (kind === 'missing-source') rmSync(path.join(dir, 'dist/templates/INDEX.md'));
    else {
      rmSync(index);
      if (kind === 'directory') mkdirSync(index);
      else symlinkSync(kind === 'live-link' ? outside : path.join(dir, 'absent'), index);
    }
    writeFileSync(path.join(target, '.agents/CORE_RULES.md'), 'old framework');
    const before = snapshot(dir);
    for (const option of ['--dry-run', '--yes']) {
      const result = run(target, bin, ['update', option]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr + result.stdout, /INDEX.md/);
      assert.deepEqual(snapshot(dir), before);
    }
  });
}
