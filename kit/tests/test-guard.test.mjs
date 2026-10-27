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
  const rule = doc.split('\n').find((l) => /kopyala/i.test(l) && /kriter/i.test(l));
  assert.equal(typeof rule, 'string', 'a line in test-writer.md mentions both "kopyala" and "kriter"');
});
