import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bin = process.env.LEAD_PROTOCOL_TEST_BIN ?? fileURLToPath(new URL('../dist/index.js', import.meta.url));
const templates = path.join(path.dirname(bin), 'templates');
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const boost = '<laravel-boost-guidelines>\n=== foundation rules ===\n\n- Follow Laravel conventions.\r\n</laravel-boost-guidelines>\n';

function fixture(t) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), 'lp-guidelines-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function run(root, ...args) {
  return spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8' });
}
function block(name) {
  return `<lead-protocol>\n${readFileSync(path.join(templates, name), 'utf8').trimEnd()}\n\n</lead-protocol>`;
}
// Seeds both pointers, runs init, and returns each resulting file as bytes.
function initWith(t, content) {
  const root = fixture(t);
  for (const name of ['CLAUDE.md', 'AGENTS.md']) writeFileSync(path.join(root, name), content);
  const result = run(root, 'init', '--yes');
  assert.equal(result.status, 0, result.stderr);
  return { root, stdout: result.stdout, read: name => readFileSync(path.join(root, name)) };
}
function expectBoth(read, expected) {
  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    const bytes = typeof expected === 'function' ? expected(name) : expected;
    assert.deepEqual(read(name), Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes), name);
  }
}

test('missing pointers are created with only the managed block', t => {
  const root = fixture(t);
  const result = run(root, 'init', '--yes');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CLAUDE\.md created/);
  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    assert.equal(readFileSync(path.join(root, name), 'utf8'), block(name) + '\n', name);
  }
});

test('a new block is prepended above existing user content', t => {
  const { read, stdout } = initWith(t, boost);
  expectBoth(read, name => block(name) + '\n\n' + boost);
  assert.match(stdout, /CLAUDE\.md updated \(<lead-protocol> block added at the top\)/);
});

test('a legacy appended block moves to the top and restores user bytes exactly', t => {
  for (const [separator, newline] of [['\n\n===\n\n', '\n'], ['\r\n\r\n===\r\n\r\n', '\r\n'], ['\n\n===\n\n', '\r\n']]) {
    const { read, stdout } = initWith(t, boost + separator + '<lead-protocol>old</lead-protocol>' + newline);
    expectBoth(read, name => block(name) + '\n\n' + boost);
    assert.match(stdout, /CLAUDE\.md updated \(<lead-protocol> block moved to the top\)/);
  }
});

test('relocation only removes the exact adjacent legacy separator', t => {
  const before = 'intro\n\n===\n\nmore\n';
  const after = '\nuser footer\n';
  const { read } = initWith(t, before + '\n<lead-protocol>old</lead-protocol>' + after);
  expectBoth(read, name => block(name) + '\n\n' + before + '\n' + after);
});

test('relocation keeps a legacy separator trailing newline when content follows', t => {
  const { read } = initWith(t, 'user\n\n\n===\n\n<lead-protocol>old</lead-protocol>\n' + boost);
  expectBoth(read, name => block(name) + '\n\nuser\n\n' + boost);
});

test('relocation that leaves no user content ends with a single newline', t => {
  const { read } = initWith(t, '\n\n===\n\n<lead-protocol>old</lead-protocol>\n');
  expectBoth(read, name => block(name) + '\n');
});

test('a UTF-8 BOM stays at byte zero and is never duplicated', t => {
  const body = Buffer.from('# Project\n\n<lead-protocol>old</lead-protocol>\n');
  const { root, read } = initWith(t, Buffer.concat([BOM, body]));
  expectBoth(read, name => Buffer.concat([BOM, Buffer.from(block(name) + '\n\n# Project\n\n\n')]));
  const result = run(root, 'update', '--yes');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /AGENTS\.md unchanged/);
  expectBoth(read, name => Buffer.concat([BOM, Buffer.from(block(name) + '\n\n# Project\n\n\n')]));
});

test('a block already at the top is replaced in place, keeping leading blank lines', t => {
  const { read } = initWith(t, '\r\n\n<lead-protocol>old</lead-protocol>\nuser\n');
  expectBoth(read, name => '\r\n\n' + block(name) + '\nuser\n');
});

test('repeat update after relocation writes nothing and reports unchanged', t => {
  const { root, read } = initWith(t, boost + '\n\n===\n\n<lead-protocol>old</lead-protocol>\n');
  const first = { claude: read('CLAUDE.md'), agents: read('AGENTS.md') };
  const result = run(root, 'update', '--yes');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CLAUDE\.md unchanged/);
  assert.deepEqual(read('CLAUDE.md'), first.claude);
  assert.deepEqual(read('AGENTS.md'), first.agents);
});

test('update relocates a block that another tool pushed below its own content', t => {
  const root = fixture(t);
  mkdirSync(path.join(root, '.agents'));
  writeFileSync(path.join(root, '.agents/PROJECT_RULES.md'), 'custom');
  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    writeFileSync(path.join(root, name), '# Notes\n\n' + block(name) + '\n\n' + boost);
  }
  const result = run(root, 'update', '--yes');
  assert.equal(result.status, 0, result.stderr);
  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    assert.equal(readFileSync(path.join(root, name), 'utf8'), block(name) + '\n\n# Notes\n\n\n\n' + boost, name);
  }
});
