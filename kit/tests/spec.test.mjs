// Run: node --test "kit/tests/*.test.mjs"
// Feature and bug specs (F-23): "must not change" lines are tied to test ids; the gate checks those tests exist and are not red.
// 3.49.0: English spec headings and AC ids only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { specInvariants, junitResults, idsInTests, prdCriteria } from '../../.claude/hooks/dashboard-data.mjs';
import { approvalPath } from '../../.claude/hooks/gate.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let p;
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
const env = () => ({ ...process.env, CLAUDE_PROJECT_DIR: p, SEMGREP: 'missing-semgrep-command' });
const gate = (...a) => spawnSync(process.execPath, [path.join(REPO, '.claude/hooks/gate.mjs'), ...a], { cwd: p, encoding: 'utf8', env: env() });
const spec = (lines) => `# Spec: G-07 Note search\n\n**Type:** feature\n\n## Current behavior\n\nNo search.\n\n## Expected behavior\n\nSearch in titles.\n\n## Behavior that must not change\n\n${lines}\n`;
// The gate's test command writes this run's JUnit report from fixture.xml (no fixture: it writes none)
const runResult = (cases) => (cases == null ? fs.rmSync(path.join(p, 'fixture.xml'), { force: true }) : write('fixture.xml', `<testsuite>${cases}</testsuite>`));
const AGENTS = '# X\n\n## Commands\n\n```bash\ntest:        node write-junit.mjs\nlint:        [ ]\ntype check: [ ]\n```\n';
const keyOf = (id) => prdCriteria(`- [ ] ${id}: x`)[0]?.key;

before(() => {
  p = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-'));
  write('AGENTS.md', AGENTS);
  write('write-junit.mjs', "import fs from 'node:fs';\nif (fs.existsSync('fixture.xml')) { fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/junit.xml', fs.readFileSync('fixture.xml')); }\n"); // written, not copied: a Windows copy keeps the old mtime
  write('tests/notes.test.mjs', "test('AC-01.1 note is saved', () => {}); test('AC-01.2 another user\\'s note is hidden', () => {});");
  write('docs/product/specs/_template.md', spec('- AC-09.9: template line'));
  gate('--approve');
});
after(() => {
  fs.rmSync(approvalPath(p), { force: true });
  fs.rmSync(p, { recursive: true, force: true });
});

test('F-23 invariants are read from the specs with their test and result; the template is skipped; odd lines are reported', () => {
  write('docs/product/specs/G-07.md', spec('- AC-01.1: Note is saved\n- AC-01.2: Another user\'s note is hidden\n- AC-02.1: List newest first\n- [ ] AC-03.1: boxed line\n- item without an id'));
  write('test-results/junit.xml', '<testsuite><testcase name="AC-01.1 note is saved"/><testcase name="AC-01.2 another user"><failure message="x"/></testcase></testsuite>');
  const { invariants, unreadable } = specInvariants(p);
  assert.deepEqual(invariants.map((k) => [k.spec, k.id, k.test, k.result]), [
    ['G-07.md', 'AC-01.1', true, 'passed'], ['G-07.md', 'AC-01.2', true, 'failed'], ['G-07.md', 'AC-02.1', false, null],
  ]);
  assert.deepEqual(unreadable, [{ spec: 'G-07.md', line: '- [ ] AC-03.1: boxed line' }]);
  assert.deepEqual(specInvariants(p, Date.now() + 60000).invariants.map((k) => k.result), [null, null, null], 'an older report is not read');
  fs.rmSync(path.join(p, 'test-results'), { recursive: true });
});

test('Ö-23.1 the gate is red when a "must not change" test is missing or red in this run; green when present and green', () => {
  write('docs/product/specs/G-07.md', spec('- AC-01.1: Note is saved\n- AC-02.1: List newest first'));
  runResult('<testcase name="AC-01.1 note is saved"/>');
  const missing = gate('--run');
  assert.equal(missing.status, 1, missing.stdout);
  assert.match(missing.stdout, /❌ Spec/);
  assert.match(missing.stdout, /AC-02\.1.*no test/);
  write('docs/product/specs/G-07.md', spec('- AC-01.1: Note is saved\n- AC-01.2: Another user\'s note is hidden'));
  runResult('<testcase name="AC-01.1 note is saved"/><testcase name="AC-01.2 another user"><failure message="x"/></testcase>');
  const red = gate('--run');
  assert.equal(red.status, 1);
  assert.match(red.stdout, /AC-01\.2.*test red/);
  runResult('<testcase name="AC-01.1 note is saved"/><testcase name="AC-01.2 another user"/>');
  const green = gate('--run');
  assert.equal(green.status, 0, green.stdout);
  assert.match(green.stdout, /✅ Spec/);
});

test('AC-49.5 spec: a Turkish "## Değişmemesi gereken davranış" heading holds no invariant; the gate shows no Spec step for it', () => {
  write('docs/product/specs/G-07.md', '# Spec: G-07\n\n**Tür:** özellik\n\n## Değişmemesi gereken davranış\n\n- AC-02.1: List newest first\n');
  assert.deepEqual(specInvariants(p), { invariants: [], unreadable: [] });
  runResult('<testcase name="AC-01.1 note is saved"/>');
  const r = gate('--run');
  assert.doesNotMatch(r.stdout, /Spec/, 'no Spec step from a Turkish heading');
  fs.rmSync(path.join(p, 'docs/product/specs/G-07.md'));
  fs.rmSync(path.join(p, 'test-results'), { recursive: true, force: true });
});

test('F-23 audit: an old red report does not stop the gate when this run writes none; it is a note', () => {
  write('docs/product/specs/G-07.md', spec('- AC-01.2: Another user\'s note is hidden'));
  runResult(null);
  write('test-results/junit.xml', '<testsuite><testcase name="AC-01.2 another user"><failure message="last week"/></testcase></testsuite>');
  const week = (Date.now() - 7 * 864e5) / 1000;
  fs.utimesSync(path.join(p, 'test-results/junit.xml'), week, week);
  const r = gate('--run');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /no result in this run/);
  fs.rmSync(path.join(p, 'test-results'), { recursive: true });
});

test('Ö-23.2 no spec: no extra step, and a passing Spec check alone does not make an empty gate green', () => {
  fs.rmSync(path.join(p, 'docs/product/specs/G-07.md'));
  runResult('<testcase name="AC-01.1 note is saved"/>');
  const r = gate('--run');
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /Spec/, 'nothing shown without a spec');
  write('docs/product/specs/G-07.md', spec('- AC-01.1: Note is saved'));
  write('AGENTS.md', '# X\n\n## Commands\n\n```bash\ntest:        [ ]\n```\n');
  const empty = gate('--run');
  assert.equal(empty.status, 1, 'no command ran: still empty');
  assert.match(empty.stdout, /EMPTY/);
  write('AGENTS.md', AGENTS);
  fs.rmSync(path.join(p, 'docs/product/specs/G-07.md'));
});

test('F-23 audit: test files of other stacks are seen; build/ and kit/ are skipped only at the root; "ISO-27.1" is not an id', () => {
  const q = fs.mkdtempSync(path.join(os.tmpdir(), 'ids-'));
  const put = (f) => { fs.mkdirSync(path.dirname(path.join(q, f)), { recursive: true }); fs.writeFileSync(path.join(q, f), `// ${f.match(/AC_\d\d_\d/)[0]}`); };
  for (const f of ['test/AC_01_1_notes_test.dart', 'pkg/AC_01_2_test.go', 'src/__tests__/AC_01_3.tsx', 'app/src/test/AC_01_4NotesTest.kt', 'src/features/build/AC_01_5.test.ts', 'build/AC_01_6.test.ts'])
    put(f);
  assert.deepEqual([...idsInTests(q)].sort(), ['AC-01.1', 'AC-01.2', 'AC-01.3', 'AC-01.4', 'AC-01.5'].map(keyOf).sort());
  fs.rmSync(q, { recursive: true, force: true });
  assert.equal(junitResults(['<testsuite><testcase name="ISO-27.1 compliance"><failure/></testcase></testsuite>']).size, 0);
});

test('Ö-23.2 the commands: /plan-task writes a feature spec only for 3+ files, /fix-bug a short bug spec, the template exists', () => {
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  assert.match(read('.claude/commands/plan-task.md'), /3[^\n]*files[^\n]*docs\/product\/specs\//);
  assert.match(read('.claude/commands/fix-bug.md'), /docs\/product\/specs\//);
  assert.match(read('.claude/commands/review-changes.md'), /docs\/product\/specs\//);
  const t = read('docs/product/specs/_template.md');
  for (const h of ['## Current behavior', '## Expected behavior', '## Behavior that must not change']) assert.ok(t.includes(h), h);
});
