// Static instruction contracts and real consumer boundaries; not an LLM simulator.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync, mkdtempSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (base, file) => readFileSync(path.join(base, file), 'utf8');
const bin = process.env.LEAD_PROTOCOL_TEST_BIN ?? path.join(root, 'cli/dist/index.js');
const templates = path.join(path.dirname(bin), 'templates');
function pointers(base, wrapped = false) {
  for (const file of ['AGENTS.md', 'CLAUDE.md', '.agents/CORE_RULES.md', '.agents/PROTOCOL_RULES.md']) {
    const text = read(base, file);
    assert.match(text, /2\. .*PROJECT_RULES[^\n]*\n2a\. .*§P10[^\n]*\n3\. .*modules/, file);
    if (wrapped && !file.startsWith('.agents/')) {
      assert.equal(text.split('<lead-protocol>')[1]?.split('</lead-protocol>')[0].trim(), read(root, file).trim(), file);
    }
  }
}
test('source sentinel and all baseline pointers place P10 before modules', () => {
  assert.ok(existsSync(path.join(root, '.lead-protocol-source')));
  pointers(root);
});
test('kernel retains the literal heuristic and session-scoped escape paths', () => {
  const text = read(root, '.agents/PROTOCOL_RULES.md').split('## §P10')[1];
  assert.ok(text, 'missing P10');
  for (const pattern of [/`\[`/, /`later`.*`skip`/, /Deferral is never persisted/, /subsequent session/, /single warning/, /persists no configured state/, /\.lead-protocol-source/, /`local`/, /does NOT write `AGENTS_MAP.md`/]) assert.match(text, pattern);
});
test('setup preserves configured values and clarifies required answers', () => {
  const text = read(root, '.agents/PROTOCOL_RULES.md').split('## §P10')[1] ?? '';
  assert.match(text, /preserve every existing non-placeholder value/i);
  assert.match(text, /unless the user specifically asks to change it/i);
  assert.match(text, /unknown or ambiguous required answers.*clarif.*rather than guessed/i);
  assert.match(read(root, '.agents/modules/meta-repo.md'), /Mixed state[^\n]*§P10[^\n]*Name[^\n]*§J8/);
});
test('current release retains the setup contract introduced in 2.4.0', () => {
  const version = JSON.parse(read(root, 'cli/package.json')).version;
  const manifest = JSON.parse(read(root, '.agents/manifest.json'));
  assert.equal(manifest.product_version, version);
  assert.equal(manifest.kernel_version, '2.2.0');
  assert.ok(read(root, 'README.md').includes(`Current version: **${version}**`));
  assert.match(read(root, 'README.md'), /\| \*\*2\.4\.0\*\* \|.*§P10/);
});
for (const mode of ['direct copy', 'CLI']) test(`${mode} ships setup without source exemption and preserves configured local state on update`, t => {
  const target = mkdtempSync(path.join(tmpdir(), 'lp-first-run-'));
  t.after(() => rmSync(target, {recursive:true, force:true}));
  const run = (...args) => {
    const r = spawnSync(process.execPath, [bin, ...args], {cwd:target, encoding:'utf8'});
    assert.equal(r.status, 0, r.stdout + r.stderr);
  };
  if (mode === 'direct copy') for (const file of ['.agents','AGENTS.md','CLAUDE.md']) cpSync(path.join(templates,file),path.join(target,file),{recursive:true});
  else run('init','--yes');
  pointers(target, mode === 'CLI');
  for (const file of ['.agents/CORE_RULES.md', '.agents/PROTOCOL_RULES.md', '.agents/PROJECT_RULES.md', '.agents/modules/meta-repo.md']) {
    assert.equal(read(target, file), read(root, file), file);
    assert.equal(read(templates, file), read(root, file), `bundled ${file}`);
  }
  assert.ok(!existsSync(path.join(target,'.git')));
  for (const base of [target, templates]) assert.ok(!existsSync(path.join(base,'.lead-protocol-source')));
  const project = read(target,'.agents/PROJECT_RULES.md').replaceAll('[Project Name]','Local fixture').replace(/- \*\*Active substrate:\*\*.*$/m,'- **Active substrate:** local').replace(/- \*\*Active modules:\*\*.*$/m,'- **Active modules:** none');
  writeFileSync(path.join(target,'.agents/PROJECT_RULES.md'),project);
  const history = read(target,'.agents/JOURNAL.md') + '\nLocal fixture history.\n';
  writeFileSync(path.join(target,'.agents/JOURNAL.md'),history);
  run('update','--yes');
  assert.equal(read(target,'.agents/PROJECT_RULES.md'),project);
  assert.equal(read(target,'.agents/JOURNAL.md'),history);
  assert.ok(!existsSync(path.join(target,'.lead-protocol-source')));
  pointers(target,true);
  run('validate'); run('status','--json');
  assert.ok(!existsSync(path.join(target,'.git')));
});
