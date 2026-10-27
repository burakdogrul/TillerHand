// Run: node --test "kit/tests/*.test.mjs"
// Test guard (F-02): an edit that weakens a test is put to the user.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
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
  const overwrite = { tool_name: 'Write', agent_type: 'test-writer', cwd: p, tool_input: { file_path: file, content: "test('a', () => {\n  expect(1).toBe(1);\n});\n" } };
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

// Test writer ≠ code writer: in Claude Code only the test-writer subagent may write a test file.
const withClaudeEnv = (fn) => {
  const old = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = p;
  try { return fn(); } finally { if (old === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = old; }
};

test('test-writer K1 parseInput gives the subagent name (agent), empty when missing, not a string, or not Claude', () => {
  const write = (extra) => ({ tool_name: 'Write', tool_input: { file_path: '/p/a.test.ts', content: 'x' }, ...extra });
  withClaudeEnv(() => {
    assert.equal(parseInput(write({ agent_type: 'test-writer' })).agent, 'test-writer');
    assert.equal(parseInput(write({ agent_type: 'general-purpose' })).agent, 'general-purpose');
    assert.equal(parseInput(write({})).agent, '', 'main session: no agent_type');
    for (const bad of [5, null, { name: 'test-writer' }, ['test-writer'], true])
      assert.equal(parseInput(write({ agent_type: bad })).agent, '', `not a string: ${JSON.stringify(bad)}`);
  });
  const codex = parseInput({ tool_name: 'apply_patch', turn_id: 't', agent_type: 'test-writer', tool_input: { command: '*** Begin Patch\n*** Add File: a.test.ts\n+x\n*** End Patch' } });
  assert.equal(codex.tool, 'codex');
  assert.equal(codex.agent, '', 'Codex');
  const ag = parseInput({ toolCall: { name: 'write_to_file', args: { TargetFile: '/p/a.test.ts', CodeContent: 'x' } }, workspacePaths: ['/p'], agent_type: 'test-writer' });
  assert.equal(ag.tool, 'antigravity');
  assert.equal(ag.agent, '', 'Antigravity');
});

test('test-writer K2 hook: in Claude a test file is written only by the test-writer agent', () => {
  const file = path.join(p, 'g.test.ts');
  fs.writeFileSync(file, "test('g', () => {\n  expect(1).toBe(1);\n  expect(2).toBe(2);\n});\n");
  const grow = (extra) => ({ tool_name: 'Edit', cwd: p, ...extra, tool_input: { file_path: file, old_string: '  expect(2).toBe(2);\n', new_string: '  expect(2).toBe(2);\n  expect(3).toBe(3);\n' } });
  const fresh = (extra) => ({ tool_name: 'Write', cwd: p, ...extra, tool_input: { file_path: path.join(p, 'src/yeni.test.ts'), content: "test('y', () => { expect(1).toBe(1); });\n" } });
  const multi = (extra) => ({ tool_name: 'MultiEdit', cwd: p, ...extra, tool_input: { file_path: file, edits: [{ old_string: "test('g'", new_string: "test('g yeniden'" }] } });
  for (const [label, extra] of [['no agent_type (main session)', {}], ['general-purpose', { agent_type: 'general-purpose' }], ['another agent', { agent_type: 'code-reviewer' }], ['not a string', { agent_type: 7 }]]) {
    for (const input of [grow(extra), fresh(extra), multi(extra)]) {
      const out = run(input)?.hookSpecificOutput;
      assert.equal(out?.permissionDecision, 'deny', `${label}: ${input.tool_name}`);
      assert.match(out.permissionDecisionReason, /test-writer/, `${label}: the reason names the agent`);
    }
  }
  const tw = { agent_type: 'test-writer' };
  assert.equal(run(grow(tw)), null, 'test-writer, stronger test');
  assert.equal(run(fresh(tw)), null, 'test-writer, new test file');
  assert.equal(run(multi(tw)), null, 'test-writer, rename');
  const weaken = { tool_name: 'Edit', cwd: p, agent_type: 'test-writer', tool_input: { file_path: file, old_string: '  expect(2).toBe(2);\n', new_string: '' } };
  assert.equal(run(weaken).hookSpecificOutput.permissionDecision, 'ask', 'test-writer weakening a test is still asked');
});

test('test-writer K2 hook: non-test files, test config files, Codex and Antigravity keep today\'s behavior', () => {
  assert.equal(run({ tool_name: 'Edit', cwd: p, tool_input: { file_path: path.join(p, 'src/a.ts'), old_string: 'a', new_string: 'b' } }), null, 'code file, no agent');
  const config = run({ tool_name: 'Edit', cwd: p, tool_input: { file_path: path.join(p, 'vitest.config.ts'), old_string: "include: ['src/**/*.test.ts'],", new_string: "include: ['src/a.test.ts']," } });
  assert.equal(config.hookSpecificOutput.permissionDecision, 'ask', 'test config, no agent: asked, not denied');
  assert.equal(run({ tool_name: 'Edit', cwd: p, tool_input: { file_path: path.join(p, 'vitest.config.ts'), old_string: 'plugins: [],', new_string: 'plugins: [react()],' } }), null, 'harmless config change, no agent');
  fs.writeFileSync(path.join(p, 'h.test.ts'), "test('h', () => {\n  expect(1).toBe(1);\n});\n");
  const codex = { CLAUDE_PROJECT_DIR: '' };
  const patch = (body) => ({ tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: `*** Begin Patch\n${body}\n*** End Patch` } });
  assert.equal(run(patch("*** Update File: h.test.ts\n@@\n   expect(1).toBe(1);\n+  expect(2).toBe(2);"), codex), null, 'Codex: stronger test is free');
  assert.equal(run(patch("*** Add File: i.test.ts\n+test('i', () => { expect(1).toBe(1); });"), codex), null, 'Codex: new test file is free');
  const ag = (name, args) => ({ toolCall: { name, args }, workspacePaths: [p] });
  assert.equal(run(ag('write_to_file', { TargetFile: path.join(p, 'j.test.ts'), CodeContent: "test('j', () => { expect(1).toBe(1); });\n" }), codex), null, 'Antigravity: new test file is free');
  assert.equal(run(ag('replace_file_content', { TargetFile: path.join(p, 'h.test.ts'), TargetContent: "test('h'", ReplacementContent: "test('h2'" }), codex), null, 'Antigravity: neutral edit is free');
});

test('test-writer K5 the agent and the docs: build, fix-bug and AGENTS.md rule 7 hand tests to test-writer', () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  assert.match(read('.claude/agents/test-writer.md'), /^---\n(?:.*\n)*?name: test-writer\n(?:.*\n)*?---\n/);
  assert.match(read('.claude/commands/build.md'), /test-writer/, 'build.md');
  assert.match(read('.claude/commands/fix-bug.md'), /test-writer/, 'fix-bug.md');
  const rule7 = read('AGENTS.md').split('\n').find((l) => /^7\.\s/.test(l));
  assert.ok(rule7, 'AGENTS.md has rule 7');
  assert.match(rule7, /test-writer/, 'rule 7 ties writing tests to the test-writer agent');
});

// K7: the code writer cannot slip past the test split.
test('test-writer K7a hook: spellings Windows resolves to the same test file are test files too', () => {
  const base = path.join(p, 'src', 'a.test.ts');
  const content = "test('k7', () => { expect(1).toBe(1); });\n";
  for (const [label, file] of [['trailing dot', `${base}.`], ['trailing space', `${base} `], ['::$DATA stream', `${base}::$DATA`], ['named stream', `${base}:akis`]]) {
    const out = run({ tool_name: 'Write', cwd: p, tool_input: { file_path: file, content } })?.hookSpecificOutput;
    assert.equal(out?.permissionDecision, 'deny', `no agent, ${label}`);
    assert.match(out.permissionDecisionReason, /test-writer/, `${label}: the reason names the agent`);
    assert.notEqual(run({ tool_name: 'Write', cwd: p, agent_type: 'test-writer', tool_input: { file_path: file, content } })?.hookSpecificOutput?.permissionDecision, 'deny', `test-writer, ${label}`);
  }
});

test('test-writer K7a hook: a folder link inside the project that points at tests counts as the test folder', (t) => {
  const target = path.join(p, 'tests');
  const link = path.join(p, 'lnk');
  fs.mkdirSync(target, { recursive: true });
  try { fs.symlinkSync(target, link, 'junction'); } catch (e) {
    // The link needs OS support or rights (e.g. no junctions, symlinks not allowed); without it there is nothing to check.
    t.skip(`folder link could not be created: ${e.code}`);
    return;
  }
  const write = (extra) => ({ tool_name: 'Write', cwd: p, ...extra, tool_input: { file_path: path.join(link, 'x.ts'), content: "test('x', () => { expect(1).toBe(1); });\n" } });
  const out = run(write({}))?.hookSpecificOutput;
  assert.equal(out?.permissionDecision, 'deny', 'no agent, lnk/x.ts');
  assert.match(out.permissionDecisionReason, /test-writer/);
  assert.notEqual(run(write({ agent_type: 'test-writer' }))?.hookSpecificOutput?.permissionDecision, 'deny', 'test-writer, lnk/x.ts');
});

test('test-writer K7c the agent does not copy a ready test text from the prompt; it writes from the criteria', () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const doc = fs.readFileSync(path.join(ROOT, '.claude/agents/test-writer.md'), 'utf8');
  const rule = doc.split('\n').find((l) => /copy/i.test(l) && /criteri/i.test(l));
  assert.equal(typeof rule, 'string', 'a line in test-writer.md mentions both "copy" and "criterion"');
});

// K8: path tricks cannot slip past the test split.
test('test-writer K8b hook: a write through a folder link to tests into a nested path that does not exist yet is a test write', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-guard-k8-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, 'tests');
  const link = path.join(root, 'lnk');
  fs.mkdirSync(target, { recursive: true });
  try { fs.symlinkSync(target, link, 'junction'); } catch (e) {
    // The link needs OS support or rights (e.g. no junctions, symlinks not allowed); without it there is nothing to check.
    t.skip(`folder link could not be created: ${e.code}`);
    return;
  }
  const file = path.join(link, 'yeni', 'alt', 'x.ts');
  assert.equal(fs.existsSync(path.dirname(file)), false, 'the nested folder does not exist yet');
  const write = (extra) => run({ tool_name: 'Write', cwd: root, ...extra, tool_input: { file_path: file, content: "test('x', () => { expect(1).toBe(1); });\n" } }, { CLAUDE_PROJECT_DIR: root })?.hookSpecificOutput;
  const out = write({});
  assert.equal(out?.permissionDecision, 'deny', 'no agent, lnk/yeni/alt/x.ts');
  assert.match(out.permissionDecisionReason, /test-writer/);
  assert.notEqual(write({ agent_type: 'test-writer' })?.permissionDecision, 'deny', 'test-writer, lnk/yeni/alt/x.ts');
});

// K9: test-writer's writes are recorded (PostToolUse --record) so the commit gate can tell them from indirect changes.
const record = (input, root) => spawnSync(process.execPath, [HOOK, '--record'], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
const stateFile = (root) => path.join(root, '.claude', 'state', 'test-writer.json');
// A missing or unreadable record shows up as a wrong value in the assertion, not as a crash of the test
const recorded = (root) => {
  try { return JSON.parse(fs.readFileSync(stateFile(root), 'utf8')).files; } catch (e) { return `kayıt okunamadı: ${e.code ?? e.message}`; }
};
const freshRoot = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-guard-k9-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
};
const put = (root, rel, text) => {
  const file = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};
const neverBlocks = (r, label) => {
  assert.equal(r.status, 0, `${label}: exit 0 (${r.stderr})`);
  assert.doesNotMatch(r.stdout, /"(deny|block|ask)"/, `${label}: no decision`);
};

test('test-writer K9a --record: a test file test-writer wrote is recorded by its content on disk (Write, Edit); records merge and refresh', (t) => {
  const root = freshRoot(t);
  const a = put(root, 'src/a.test.ts', "test('a', () => { expect(1).toBe(1); });\n");
  const w = record({ tool_name: 'Write', agent_type: 'test-writer', cwd: root, tool_input: { file_path: a, content: fs.readFileSync(a, 'utf8') } }, root);
  neverBlocks(w, 'Write');
  assert.deepEqual(recorded(root), { 'src/a.test.ts': digest(a) });
  assert.match(recorded(root)['src/a.test.ts'], /^[0-9a-f]{16}$/, 'first 16 hex characters of sha256');
  // Edit: the tool input has only the changed part; the record is the whole file on disk. Turkish and spaced path, test folder.
  const b = put(root, 'tests/e2e/ödeme İade.ts', "test('İade ı/i', () => {\n  expect(2).toBe(2);\n});\n");
  neverBlocks(record({ tool_name: 'Edit', agent_type: 'test-writer', cwd: root, tool_input: { file_path: b, old_string: 'expect(1)', new_string: 'expect(2)' } }, root), 'Edit');
  assert.deepEqual(recorded(root), { 'src/a.test.ts': digest(a), 'tests/e2e/ödeme İade.ts': digest(b) }, 'the earlier record is kept; path is relative with /');
  // test-writer changes a recorded file again: its record follows the new content
  const old = digest(a);
  fs.appendFileSync(a, "test('a2', () => { expect(3).toBe(3); });\n");
  neverBlocks(record({ tool_name: 'Edit', agent_type: 'test-writer', cwd: root, tool_input: { file_path: a, old_string: 'x', new_string: 'y' } }, root), 'second Edit');
  assert.notEqual(digest(a), old);
  assert.deepEqual(recorded(root), { 'src/a.test.ts': digest(a), 'tests/e2e/ödeme İade.ts': digest(b) });
});

test('test-writer K9a --record: other agents, the main session, non-test files and test config files are not recorded', (t) => {
  const root = freshRoot(t);
  const a = put(root, 'src/a.test.ts', "test('a', () => { expect(1).toBe(1); });\n");
  neverBlocks(record({ tool_name: 'Write', agent_type: 'test-writer', cwd: root, tool_input: { file_path: a, content: fs.readFileSync(a, 'utf8') } }, root), 'test-writer');
  const kept = digest(a);
  const b = put(root, 'src/b.test.ts', "test('b', () => {});\n");
  const write = (file, extra) => record({ tool_name: 'Write', cwd: root, ...extra, tool_input: { file_path: file, content: fs.readFileSync(file, 'utf8') } }, root);
  for (const [label, extra] of [['main session (no agent_type)', {}], ['general-purpose', { agent_type: 'general-purpose' }], ['code-reviewer', { agent_type: 'code-reviewer' }], ['not a string', { agent_type: ['test-writer'] }]])
    neverBlocks(write(b, extra), label);
  // another agent changes the recorded file: its record is not refreshed
  fs.appendFileSync(a, '// betik\n');
  neverBlocks(write(a, {}), 'main session on a recorded file');
  for (const rel of ['src/a.ts', 'package.json', 'vitest.config.ts', 'docs/test-plan.md'])
    neverBlocks(write(put(root, rel, '{}\n'), { agent_type: 'test-writer' }), `test-writer, ${rel}`);
  assert.deepEqual(recorded(root), { 'src/a.test.ts': kept });
});

test('test-writer K9a --record: a broken or missing state file and a broken input do not crash it', (t) => {
  const root = freshRoot(t);
  const a = put(root, 'src/a.test.ts', "test('a', () => { expect(1).toBe(1); });\n");
  const input = { tool_name: 'Write', agent_type: 'test-writer', cwd: root, tool_input: { file_path: a, content: fs.readFileSync(a, 'utf8') } };
  for (const broken of ['{bozuk', '', 'null', '[]', '{"files": 5}', '{"files": "x"}']) {
    put(root, '.claude/state/test-writer.json', broken);
    neverBlocks(record(input, root), `state file: ${JSON.stringify(broken)}`);
    assert.deepEqual(recorded(root), { 'src/a.test.ts': digest(a) }, `state file: ${JSON.stringify(broken)}`);
  }
  for (const bad of ['', 'json değil', '{"tool_name": "Write"}', JSON.stringify({ tool_name: 'Write', agent_type: 'test-writer', tool_input: { file_path: path.join(root, 'src/yok.test.ts') } })])
    neverBlocks(record(bad, root), `input: ${bad.slice(0, 30)}`);
});

test('test-writer K9g test-writer.md says to write tests with Write/Edit (a test written through Bash stops at the commit gate); settings.json runs --record after writes', () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const doc = fs.readFileSync(path.join(ROOT, '.claude/agents/test-writer.md'), 'utf8');
  const body = doc.replace(/^---\n[\s\S]*?\n---\n/, '');
  const rule = body.split('\n').find((l) => /\bWrite\b/.test(l) && /\bEdit\b/.test(l) && /\bBash\b/.test(l) && /commit/i.test(l));
  assert.equal(typeof rule, 'string', 'a line in the body of test-writer.md names Write, Edit, Bash and the commit');
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'));
  const groups = (settings.hooks.PostToolUse ?? []).filter((g) => (g.hooks ?? []).some((h) => /test-guard\.mjs"?\s+--record\b/.test(h.command)));
  assert.equal(groups.length, 1, 'one PostToolUse entry runs test-guard.mjs --record');
  const matcher = new RegExp(`^(?:${groups[0].matcher})$`);
  for (const tool of ['Write', 'Edit', 'MultiEdit']) assert.match(tool, matcher, `the matcher covers ${tool}`);
});
