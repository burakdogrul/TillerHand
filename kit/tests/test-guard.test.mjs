// Run: node --test "kit/tests/*.test.mjs"
// Test guard (F-02): an edit that weakens a test is put to the user.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isTestFile, weakening } from '../../.claude/hooks/test-guard.mjs';
import { parseInput } from '../../.claude/hooks/shared.mjs';

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks', 'test-guard.mjs');
let p;
before(() => { p = fs.mkdtempSync(path.join(os.tmpdir(), 'test-guard-')); });
after(() => fs.rmSync(p, { recursive: true, force: true }));

const run = (input, env = { CLAUDE_PROJECT_DIR: p }) => {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, ...env } });
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
};

test('F-02 test file detection', () => {
  for (const f of ['src/a.test.ts', 'b.spec.tsx', 'tests/e2e/giris.ts', 'src/features/x/__tests__/y.ts', 'app/test_odeme.py', 'odeme_test.py', 'kit/tests/x.test.mjs'])
    assert.ok(isTestFile(f), f);
  for (const f of ['src/test-utils.ts', 'src/latest.ts', 'docs/test-plan.md', 'contest.py'])
    assert.ok(!isTestFile(f), f);
});

test('F-02 deleting an assert, adding .skip/.only, loosening an expectation are caught', () => {
  const old = "test('Ö-01.1 toplam', () => {\n  expect(topla(1, 2)).toBe(3);\n  expect(topla(0, 0)).toBe(0);\n});\n";
  assert.match(weakening(old, old.replace('  expect(topla(0, 0)).toBe(0);\n', '')), /beklenti/);
  assert.match(weakening(old, old.replace("test('", "test.skip('")), /atlan/);
  assert.match(weakening(old, old.replace("test('", "test .only ('")), /atlan/, 'spaced spelling');
  assert.match(weakening(old, old.replace("test('", "it.skip.each([1])('")), /atlan/);
  assert.match(weakening(old, old.replace('.toBe(3)', '.toBeTruthy()')), /gevşe/);
  assert.match(weakening(old, old.replace('  expect(topla(0', '  // expect(topla(0')), /beklenti/, 'commenting out counts as deleting');
  assert.match(weakening(old, old.replace('  expect(topla(0, 0)).toBe(0);', '  /* expect(topla(0, 0)).toBe(0); */')), /beklenti/);
  assert.match(weakening('def test_a():\n    assert a == 1\n    assert b == 2\n', 'def test_a():\n    assert a == 1\n    # assert b == 2\n'), /beklenti/);
  assert.match(weakening('def test_a():\n    assert a\n', '@pytest.mark.skip\ndef test_a():\n    assert a\n'), /atlan/);
  assert.match(weakening('', "test.only('x', () => {});"), /atlan/, '.only in a new file');
});

test('F-02 an edit that strengthens a test or is neutral stays silent', () => {
  const old = "test('a', () => {\n  expect(x).toBeTruthy();\n});\n";
  assert.equal(weakening(old, old.replace('.toBeTruthy()', '.toBe(3)')), null, 'tightening');
  assert.equal(weakening(old, old + "test('b', () => { expect(y).toBe(1); });\n"), null, 'adding a test');
  assert.equal(weakening(old, old.replace("'a'", "'a yeniden adlandı'")), null);
  assert.equal(weakening('', "test('yeni', () => { expect(1).toBe(1); });"), null, 'new test file');
  assert.equal(weakening("const url = 'http://x';\nexpect(a).toBe(1);\n", "const url = 'http://y';\nexpect(a).toBe(1);\n"), null, 'a URL is not a comment');
});

test('F-02 parseInput gives the old and new text (three tools)', () => {
  const c = parseInput({ tool_name: 'Edit', tool_input: { file_path: '/p/a.test.ts', old_string: 'A', new_string: 'B' } }).files[0];
  assert.deepEqual([c.before, c.after], ['A', 'B']);
  const m = parseInput({ tool_name: 'MultiEdit', tool_input: { file_path: '/p/a.test.ts', edits: [{ old_string: 'A', new_string: 'B' }, { old_string: 'C', new_string: 'D' }] } }).files[0];
  assert.deepEqual([m.before, m.after], ['A\nC', 'B\nD']);
  const w = parseInput({ tool_name: 'Write', tool_input: { file_path: '/p/a.test.ts', content: 'X' } }).files[0];
  assert.deepEqual([w.before, w.after], [undefined, 'X'], 'Write: the old text is read from disk');
  const x = parseInput({ tool_name: 'apply_patch', turn_id: 't', tool_input: { command: '*** Begin Patch\n*** Update File: a.test.ts\n@@\n-  expect(a).toBe(1);\n+  // yok\n*** Delete File: b.test.ts\n*** End Patch' } }).files;
  assert.deepEqual([x[0].before, x[0].after], ['  expect(a).toBe(1);\n', '  // yok\n']);
  assert.equal(x[1].deleted, true);
  const ag = parseInput({ toolCall: { name: 'replace_file_content', args: { TargetFile: '/p/a.test.ts', TargetContent: 'A', ReplacementContent: 'B' } }, workspacePaths: ['/p'] }).files[0];
  assert.deepEqual([ag.before, ag.after], ['A', 'B']);
  const agm = parseInput({ toolCall: { name: 'multi_replace_file_content', args: { TargetFile: '/p/a.test.ts', ReplacementChunks: [{ TargetContent: 'A', ReplacementContent: 'B' }] } }, workspacePaths: ['/p'] }).files[0];
  assert.deepEqual([agm.before, agm.after], ['A', 'B']);
});

test('F-02 hook: Claude asks, Codex denies and has the AI ask, non-test files are free', () => {
  const file = path.join(p, 'a.test.ts');
  fs.writeFileSync(file, "test('a', () => {\n  expect(1).toBe(1);\n  expect(2).toBe(2);\n});\n");
  const overwrite = { tool_name: 'Write', cwd: p, tool_input: { file_path: file, content: "test('a', () => {\n  expect(1).toBe(1);\n});\n" } };
  assert.equal(run(overwrite).hookSpecificOutput.permissionDecision, 'ask', 'Write is compared with the file on disk');
  const code = { tool_name: 'Edit', cwd: p, tool_input: { file_path: path.join(p, 'src/a.ts'), old_string: 'expect(1)', new_string: '' } };
  assert.equal(run(code), null);
  const codex = { tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: '*** Begin Patch\n*** Update File: a.test.ts\n@@\n-  expect(2).toBe(2);\n*** End Patch' } };
  assert.equal(run(codex, { CLAUDE_PROJECT_DIR: '' }).hookSpecificOutput.permissionDecision, 'deny');
  const del = { tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: '*** Begin Patch\n*** Delete File: a.test.ts\n*** End Patch' } };
  assert.match(run(del, { CLAUDE_PROJECT_DIR: '' }).hookSpecificOutput.permissionDecisionReason, /siliniyor/);
  const ag = { toolCall: { name: 'replace_file_content', args: { TargetFile: file, TargetContent: "test('a'", ReplacementContent: "test.only('a'" } }, workspacePaths: [p] };
  assert.equal(run(ag, { CLAUDE_PROJECT_DIR: '' }).decision, 'ask');
});

test('F-02 hook: asks when a Codex Add File overwrites an existing test or a test moves to a non-test path', () => {
  const file = path.join(p, 'b.test.ts');
  fs.writeFileSync(file, "test('b', () => {\n  expect(1).toBe(1);\n});\n");
  const patch = (body) => ({ tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: `*** Begin Patch\n${body}\n*** End Patch` } });
  const codex = { CLAUDE_PROJECT_DIR: '' };
  assert.match(run(patch("*** Add File: b.test.ts\n+test('b', () => {});"), codex).hookSpecificOutput.permissionDecisionReason, /beklenti/, 'Add File is compared with the file on disk');
  assert.equal(run(patch("*** Add File: c.test.ts\n+test('c', () => { expect(1).toBe(1); });"), codex), null, 'a new test file is free');
  assert.match(run(patch('*** Update File: b.test.ts\n*** Move to: src/b.ts'), codex).hookSpecificOutput.permissionDecisionReason, /taşınıyor/);
  assert.equal(run(patch('*** Update File: b.test.ts\n*** Move to: tests/b.test.ts'), codex), null, 'test to test move is free');
});

test('F-02 3.13.1 heuristics: ;// comment, #assert, skipIf/runIf, expect without a matcher are caught; model.fit and chains are free', () => {
  const old = "test('a', () => {\n  expect(a).toBe(1); expect(b).toBe(2);\n});\n";
  assert.match(weakening(old, old.replace(' expect(b)', '// expect(b)')), /beklenti/, ';// comment');
  assert.match(weakening('def test_a():\n    assert a\n    assert b\n', 'def test_a():\n    assert a\n    #assert b\n'), /beklenti/, '# without a space');
  assert.match(weakening(old, old.replace("test('", "test.skipIf(ci)('")), /atlan/);
  assert.match(weakening(old, old.replace("test('", "it.runIf(false)('")), /atlan/);
  assert.match(weakening(old, old.replace('expect(b).toBe(2)', 'expect(b)')), /gevşe/, 'no matcher');
  const fit = "test('m', () => {\n  model.fit(x);\n  expect(model.w).toBe(1);\n});\n";
  assert.equal(weakening(fit, fit + "test('n', () => {\n  model.fit(z);\n  expect(f(g(1))).toBe(1);\n});\n"), null, 'model.fit is not a focus');
  assert.equal(weakening(old, old + "test('c', () => {\n  expect(c)\n    .toBe(3);\n});\n"), null, 'chain broken across lines');
});

test('F-02 3.13.1 test path patterns', () => {
  for (const f of ['src/app.e2e-spec.ts', 'pkg/odeme_test.go', 'spec/models/user_spec.rb']) assert.ok(isTestFile(f), f);
});

test('F-02 3.13.1 a scope-narrowing change in a test config is asked, others are free', () => {
  const edit = (file, old_string, new_string) => run({ tool_name: 'Edit', cwd: p, tool_input: { file_path: path.join(p, file), old_string, new_string } });
  assert.equal(edit('vitest.config.ts', "include: ['src/**/*.test.ts'],", "include: ['src/a.test.ts'],").hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(edit('vitest.config.ts', "plugins: [],", "plugins: [react()],"), null, 'a plugin is free');
  assert.equal(edit('package.json', '"test": "vitest run",', '"test": "vitest run --passWithNoTests",').hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(edit('package.json', '"lint": "eslint .",', '"lint": "eslint src",'), null);
  assert.equal(edit('conftest.py', '', 'collect_ignore = ["tests/odeme"]\n').hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(edit('src/package.json.ts', '"test": 1', '"test": 2'), null, 'not a config file');
});

test('F-02 3.13.1 Codex Move: a move in the test folder to a name that does not run, or onto an existing test, is asked', () => {
  fs.writeFileSync(path.join(p, 'd.test.ts'), "test('d', () => { expect(1).toBe(1); });\n");
  fs.writeFileSync(path.join(p, 'e.test.ts'), "test('e', () => { expect(2).toBe(2); });\n");
  const patch = (body) => ({ tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: `*** Begin Patch\n${body}\n*** End Patch` } });
  const codex = { CLAUDE_PROJECT_DIR: '' };
  assert.match(run(patch('*** Update File: d.test.ts\n*** Move to: tests/d.ts'), codex).hookSpecificOutput.permissionDecisionReason, /taşınıyor/);
  assert.match(run(patch('*** Update File: d.test.ts\n*** Move to: e.test.ts'), codex).hookSpecificOutput.permissionDecisionReason, /üstüne/);
});

test('F-02 3.13.1 audit: supertest .expect is free, thresholds and the ci script are asked, moving a non-test file onto an existing test is asked', () => {
  const old = "test('a', async () => {\n  expect(1).toBe(1);\n});\n";
  assert.equal(weakening(old, old + "test('b', async () => {\n  await request(app).get('/x').expect(200);\n});\n"), null, 'supertest');
  const edit = (file, old_string, new_string) => run({ tool_name: 'Edit', cwd: p, tool_input: { file_path: path.join(p, file), old_string, new_string } });
  assert.equal(edit('vitest.config.ts', '    lines: 80,', '    lines: 10,').hookSpecificOutput.permissionDecision, 'ask', 'multi-line threshold');
  assert.equal(edit('package.json', '"ci": "npm run lint && vitest run",', '"ci": "npm run lint",').hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(edit('pyproject.toml', 'fail_under = 80', 'fail_under = 0').hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(edit('jest.config.json', '"bail": 0', '"bail": 1').hookSpecificOutput.permissionDecision, 'ask', 'json config');
  fs.writeFileSync(path.join(p, 'f.test.ts'), "test('f', () => { expect(1).toBe(1); });\n");
  const patch = { tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: '*** Begin Patch\n*** Update File: src/f.ts\n*** Move to: f.test.ts\n*** End Patch' } };
  assert.match(run(patch, { CLAUDE_PROJECT_DIR: '' }).hookSpecificOutput.permissionDecisionReason, /üstüne/);
});
