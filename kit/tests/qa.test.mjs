// Run: node --test "kit/tests/*.test.mjs"
// Browser QA (F-18): /qa runs the criteria as Playwright tests; the report is written from JUnit, not from the agent's claim.
// 3.49.0: criterion ids are AC-01.1 / AC_01_1; the report values are passed / failed / not run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { qaSummary, junitResults, prdCriteria } from '../../.claude/hooks/dashboard-data.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const project = () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
  write('docs/product/prd.md', '- [ ] AC-01.1: Required field is not saved empty\n- [ ] AC-01.2: The record shows in the list\n- [ ] AC-02.1: PDF downloads\n');
  return { p, write };
};
const report = (p, ...args) => spawnSync(process.execPath, [path.join(REPO, '.claude/hooks/qa-report.mjs'), ...args], { cwd: p, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
const reports = (p) => (fs.existsSync(path.join(p, 'docs/quality/qa')) ? fs.readdirSync(path.join(p, 'docs/quality/qa')).filter((f) => f.endsWith('.md')) : []);
const suite = (cases) => `<testsuites><testsuite>${cases}</testsuite></testsuites>`;
const keyOf = (id) => prdCriteria(`- [ ] ${id}: x`)[0]?.key;

test('Ö-18.1 the QA report comes from JUnit: passed, failed with its reason and evidence, not run', () => {
  const { p, write } = project();
  write('test-results-qa/junit.xml', suite(`
    <testcase name="AC-01.1 required field" classname="qa"/>
    <testcase name="AC-01.2 in the list" classname="qa"><failure message="record.spec.ts:12:1 AC-01.2 in the list" type="FAILURE"><![CDATA[  tests\\e2e\\qa\\record.spec.ts:12:1 › AC-01.2 in the list ───────

    Error: expect(locator).toBeVisible() | expected row missing

    at tests/e2e/qa/record.spec.ts:12]]></failure></testcase>`));
  write('test-results-qa/shots/AC-01.1.png', 'png');
  write('test-results-qa/shots/AC-01.2.png', 'png');
  const r = report(p);
  assert.equal(r.status, 1, 'a failed criterion makes the exit code red');
  assert.match(r.stdout, /1 passed · 1 failed · 1 not run/);
  const [file] = reports(p);
  assert.match(file, /^\d{4}-\d{2}-\d{2}-\d{6}\.md$/, 'seconds: two runs in a minute do not overwrite each other');
  const stamp = file.slice(0, -3);
  const text = fs.readFileSync(path.join(p, 'docs/quality/qa', file), 'utf8');
  assert.match(text, new RegExp(`\\| AC-01\\.1 Required field is not saved empty \\| passed \\| \\.previews/qa-${stamp}/AC-01\\.1\\.png \\|`));
  assert.ok(fs.existsSync(path.join(p, '.previews', `qa-${stamp}`, 'AC-01.2.png')), 'the evidence is copied: the next Playwright run empties its folder');
  assert.match(text, /\| failed \| [^|]+ \| Error: expect\(locator\)\.toBeVisible\(\) \/ expected row missing \|/, 'first Error line, the pipe replaced');
  assert.match(text, /\| AC-02\.1 PDF downloads \| not run \| {2}\| {2}\|/);
  const s = qaSummary(text);
  assert.deepEqual([s.passed, s.failed, s.notRun], [1, 1, 1]);
  assert.deepEqual(s.failures.map((f) => [f.criterion, f.note]), [['AC-01.2 The record shows in the list', 'Error: expect(locator).toBeVisible() / expected row missing']]);
  fs.rmSync(p, { recursive: true, force: true });
});

test('Ö-18.1 a failure wins over a later pass; skipped does not count; the id may be in the classname only', () => {
  const { p, write } = project();
  write('test-results-qa/junit.xml', suite(`
    <testcase name="AC-01.1 first" classname="qa"><failure message="x">Error: first try</failure></testcase>
    <testcase name="AC-01.1 again" classname="qa"/>
    <testcase name="AC-02.1 skipped" classname="qa"><skipped/></testcase>
    <testcase name="shows in the list" classname="tests/e2e/AC-01.2.spec.ts"/>`));
  const r = report(p);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /1 passed · 1 failed · 1 not run/);
  fs.rmSync(p, { recursive: true, force: true });
});

test('Ö-18.1 nothing to report is exit 2 with no report: no JUnit, no test ran, no PRD, no criteria; all green is 0', () => {
  const { p, write } = project();
  const none = report(p);
  assert.equal(none.status, 2);
  assert.match(none.stdout, /test-results-qa\/junit\.xml/);
  write('test-results-qa/junit.xml', suite(''));
  const empty = report(p);
  assert.equal(empty.status, 2, 'zero tests is not a green report');
  assert.match(empty.stdout, /no test result tied to a PRD criterion/);
  write('test-results-qa/junit.xml', suite('<testcase name="test without an id"/>'));
  assert.equal(report(p).status, 2, 'tests without criterion ids');
  write('test-results-qa/junit.xml', suite('<testcase name="Ö-01.1 a"/><testcase name="test_O_01_2_b"/>'));
  assert.equal(report(p).status, 2, 'tests with the old Ö / O_ ids are tied to no criterion');
  assert.deepEqual(reports(p), [], 'no report written');
  write('test-results/other.xml', suite('<testcase name="AC-01.1 a"/><testcase name="AC-01.2 b"/><testcase name="AC-02.1 c"/>'));
  const green = report(p, 'test-results/other.xml');
  assert.equal(green.status, 0, green.stdout);
  assert.match(green.stdout, /3 passed · 0 failed · 0 not run/);
  write('docs/product/prd.md', '# PRD\n\n- [ ] AC-01.1: [Observable behavior]\n');
  assert.equal(report(p, 'test-results/other.xml').status, 2, 'only template criteria');
  fs.rmSync(path.join(p, 'docs/product/prd.md'));
  const noPrd = report(p, 'test-results/other.xml');
  assert.equal(noPrd.status, 2);
  assert.match(noPrd.stdout, /prd\.md not found/);
  assert.equal(noPrd.stderr, '', 'a message, not a stack trace');
  fs.rmSync(p, { recursive: true, force: true });
});

test('F-18 audit: a failure tag with an unescaped ">" or no end tag is still a failure (acceptance card)', () => {
  const r = junitResults([suite('<testcase name="AC-01.1 a"><failure message="1 > 2"/></testcase><testcase name="AC-01.2 b"><failure>broken</testcase>')]);
  assert.equal(r.get(keyOf('AC-01.1')), 'failed');
  assert.equal(r.get(keyOf('AC-01.2')), 'failed');
});

test('Ö-18.2 dashboard: the latest report is a card on the Quality tab; /qa scratch tests are not a criterion\'s test', () => {
  const { p, write } = project();
  const row = (r) => `# QA report\n\n| Criterion | Result | Evidence | Note |\n|---|---|---|---|\n| AC-01.1 Required field | ${r} |  |  |\n`;
  write('docs/quality/qa/2026-10-01-090000.md', row('passed'));
  write('docs/quality/qa/2026-10-02-090000.md', row('failed'));
  write('tests/e2e/qa/AC-01.2.spec.ts', "test('AC-01.2 scratch', () => {});");
  const r = spawnSync(process.execPath, [path.join(REPO, '.claude/hooks/dashboard.mjs'), p, '--quiet'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const html = fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8');
  // A plain folder (no language chosen) is English since 3.49.0
  assert.match(html, /Last QA · 2026-10-02-090000/, 'the newest report');
  assert.match(html, /docs\/quality\/qa\/2026-10-02-090000\.md/);
  assert.match(html, /With a test[\s\S]{0,80}0\/3/, 'the uncommitted /qa test is not counted');
  fs.rmSync(p, { recursive: true, force: true });
  assert.equal(qaSummary(''), null);
  assert.equal(qaSummary('# QA report\n\n| Criterion | Result | Evidence | Note |\n|---|---|---|---|\n'), null);
});

test('Ö-18.3 /build suggests /qa for interface work, the release checklist asks for it, /qa is a light command', async () => {
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  assert.match(read('.claude/commands/build.md'), /\/qa/);
  assert.match(read('docs/operations/release-checklist.md'), /\/qa/);
  const qa = read('.claude/commands/qa.md');
  assert.match(qa, /qa-report\.mjs/);
  assert.match(qa, /--output=test-results-qa/, 'its own output folder');
  assert.match(qa, /afterEach[\s\S]*screenshot/, 'evidence also for a failed test');
  const { LIGHT_COMMANDS } = await import('../../.claude/hooks/tools.mjs');
  assert.ok(LIGHT_COMMANDS.includes('qa'));
});
