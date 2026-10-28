// Run: node --test "kit/tests/*.test.mjs"
// Feature and bug specs (F-23): "must not change" lines are tied to test ids; the gate checks those tests exist and are not red.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { specInvariants, junitResults, idsInTests } from '../../.claude/hooks/dashboard-data.mjs';
import { approvalPath } from '../../.claude/hooks/gate.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let p;
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
const env = () => ({ ...process.env, CLAUDE_PROJECT_DIR: p, SEMGREP: 'olmayan-semgrep-komutu' });
const gate = (...a) => spawnSync(process.execPath, [path.join(REPO, '.claude/hooks/gate.mjs'), ...a], { cwd: p, encoding: 'utf8', env: env() });
const spec = (lines) => `# Spec: G-07 Not arama\n\n**Tür:** özellik\n\n## Mevcut davranış\n\nArama yok.\n\n## Beklenen davranış\n\nBaşlıkta arama.\n\n## Değişmemesi gereken davranış\n\n${lines}\n`;
// The gate's test command writes this run's JUnit report from fixture.xml (no fixture: it writes none)
const runResult = (cases) => (cases == null ? fs.rmSync(path.join(p, 'fixture.xml'), { force: true }) : write('fixture.xml', `<testsuite>${cases}</testsuite>`));
const AGENTS = '# X\n\n## Komutlar\n\n```bash\ntest:        node write-junit.mjs\nlint:        [ ]\ntip kontrol: [ ]\n```\n';

before(() => {
  p = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-'));
  write('AGENTS.md', AGENTS);
  write('write-junit.mjs', "import fs from 'node:fs';\nif (fs.existsSync('fixture.xml')) { fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/junit.xml', fs.readFileSync('fixture.xml')); }\n"); // written, not copied: a Windows copy keeps the old mtime
  write('tests/notes.test.mjs', "test('Ö-01.1 not kaydedilir', () => {}); test('Ö-01.2 başkasının notu görünmez', () => {});");
  write('docs/product/specs/_template.md', spec('- Ö-09.9: şablon satırı'));
  gate('--approve');
});
after(() => {
  fs.rmSync(approvalPath(p), { force: true });
  fs.rmSync(p, { recursive: true, force: true });
});

test('F-23 invariants are read from the specs with their test and result; the template is skipped; odd lines are reported', () => {
  write('docs/product/specs/G-07.md', spec('- Ö-01.1: Not kaydedilir\n- Ö-01.2: Başkasının notu görünmez\n- Ö-02.1: Liste en yeni önde\n- [ ] Ö-03.1: kutulu satır\n- kimliksiz madde'));
  write('test-results/junit.xml', '<testsuite><testcase name="Ö-01.1 not kaydedilir"/><testcase name="Ö-01.2 başkasının notu"><failure message="x"/></testcase></testsuite>');
  const { invariants, unreadable } = specInvariants(p);
  assert.deepEqual(invariants.map((k) => [k.spec, k.id, k.test, k.result]), [
    ['G-07.md', 'Ö-01.1', true, 'passed'], ['G-07.md', 'Ö-01.2', true, 'failed'], ['G-07.md', 'Ö-02.1', false, null],
  ]);
  assert.deepEqual(unreadable, [{ spec: 'G-07.md', line: '- [ ] Ö-03.1: kutulu satır' }]);
  assert.deepEqual(specInvariants(p, Date.now() + 60000).invariants.map((k) => k.result), [null, null, null], 'an older report is not read');
  fs.rmSync(path.join(p, 'test-results'), { recursive: true });
});

test('Ö-23.1 the gate is red when a "must not change" test is missing or red in this run; green when present and green', () => {
  write('docs/product/specs/G-07.md', spec('- Ö-01.1: Not kaydedilir\n- Ö-02.1: Liste en yeni önde'));
  runResult('<testcase name="Ö-01.1 not kaydedilir"/>');
  const missing = gate('--run');
  assert.equal(missing.status, 1, missing.stdout);
  assert.match(missing.stdout, /❌ Spec/);
  assert.match(missing.stdout, /Ö-02\.1.*no test/);
  write('docs/product/specs/G-07.md', spec('- Ö-01.1: Not kaydedilir\n- Ö-01.2: Başkasının notu görünmez'));
  runResult('<testcase name="Ö-01.1 not kaydedilir"/><testcase name="Ö-01.2 başkasının notu"><failure message="x"/></testcase>');
  const red = gate('--run');
  assert.equal(red.status, 1);
  assert.match(red.stdout, /Ö-01\.2.*test red/);
  runResult('<testcase name="Ö-01.1 not kaydedilir"/><testcase name="Ö-01.2 başkasının notu"/>');
  const green = gate('--run');
  assert.equal(green.status, 0, green.stdout);
  assert.match(green.stdout, /✅ Spec/);
});

test('F-23 audit: an old red report does not stop the gate when this run writes none; it is a note', () => {
  write('docs/product/specs/G-07.md', spec('- Ö-01.2: Başkasının notu görünmez'));
  runResult(null);
  write('test-results/junit.xml', '<testsuite><testcase name="Ö-01.2 başkasının notu"><failure message="geçen hafta"/></testcase></testsuite>');
  const week = (Date.now() - 7 * 864e5) / 1000;
  fs.utimesSync(path.join(p, 'test-results/junit.xml'), week, week);
  const r = gate('--run');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /no result in this run/);
  fs.rmSync(path.join(p, 'test-results'), { recursive: true });
});

test('Ö-23.2 no spec: no extra step, and a passing Spec check alone does not make an empty gate green', () => {
  fs.rmSync(path.join(p, 'docs/product/specs/G-07.md'));
  runResult('<testcase name="Ö-01.1 not kaydedilir"/>');
  const r = gate('--run');
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /Spec/, 'nothing shown without a spec');
  write('docs/product/specs/G-07.md', spec('- Ö-01.1: Not kaydedilir'));
  write('AGENTS.md', '# X\n\n## Komutlar\n\n```bash\ntest:        [ ]\n```\n');
  const empty = gate('--run');
  assert.equal(empty.status, 1, 'no command ran: still empty');
  assert.match(empty.stdout, /EMPTY/);
  write('AGENTS.md', AGENTS);
  fs.rmSync(path.join(p, 'docs/product/specs/G-07.md'));
});

test('F-23 audit: test files of other stacks are seen; build/ and kit/ are skipped only at the root; "ISO-27.1" is not an id', () => {
  const q = fs.mkdtempSync(path.join(os.tmpdir(), 'ids-'));
  const put = (f) => { fs.mkdirSync(path.dirname(path.join(q, f)), { recursive: true }); fs.writeFileSync(path.join(q, f), `// ${f.match(/O_\d\d_\d/)[0]}`); };
  for (const f of ['test/O_01_1_notes_test.dart', 'pkg/O_01_2_test.go', 'src/__tests__/O_01_3.tsx', 'app/src/test/O_01_4NotesTest.kt', 'src/features/build/O_01_5.test.ts', 'build/O_01_6.test.ts'])
    put(f);
  assert.deepEqual([...idsInTests(q)].sort(), ['O_01_1', 'O_01_2', 'O_01_3', 'O_01_4', 'O_01_5']);
  fs.rmSync(q, { recursive: true, force: true });
  assert.equal(junitResults(['<testsuite><testcase name="ISO-27.1 uyumu"><failure/></testcase></testsuite>']).size, 0);
});

test('Ö-23.2 the commands: /plan-task writes a feature spec only for 3+ files, /fix-bug a short bug spec, the template exists', () => {
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  assert.match(read('.claude/commands/plan-task.md'), /3[^\n]*files[^\n]*docs\/product\/specs\//);
  assert.match(read('.claude/commands/fix-bug.md'), /docs\/product\/specs\//);
  assert.match(read('.claude/commands/review-changes.md'), /docs\/product\/specs\//);
  const t = read('docs/product/specs/_template.md');
  for (const h of ['## Current behavior', '## Expected behavior', '## Behavior that must not change']) assert.ok(t.includes(h), h);
});
