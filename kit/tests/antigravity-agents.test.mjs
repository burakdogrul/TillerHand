// Run: node --test kit/tests/antigravity-agents.test.mjs
// 3.76.0: per-agent model tier for Antigravity (.agents/agents/<name>.md), set from the Claude agent files in .claude/agents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TIERS, isAntigravity, tierLabel, defaultTier, setAgentTier, showAgents } from '../../.claude/hooks/antigravity-agents.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(REPO, '.claude', 'hooks', 'antigravity-agents.mjs');

const CLAUDE_AGENT = (name) => `---\nname: ${name}\ndescription: Writes "tests": before the code, for Turkish I/İ/ı/i too.\ntools: Read, Grep, Write\nmodel: sonnet\n---\n\nYou are ${name}.\nmodel: this body line is not frontmatter\n\n- one\n- two\n`;

// Temporary project with the given Claude agents; every test removes it in finally
function project(...names) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-agents-'));
  fs.mkdirSync(path.join(root, '.claude', 'agents'), { recursive: true });
  for (const n of names) fs.writeFileSync(path.join(root, '.claude', 'agents', `${n}.md`), CLAUDE_AGENT(n));
  return root;
}
const target = (root, name) => path.join(root, '.agents', 'agents', `${name}.md`);
const read = (p) => fs.readFileSync(p, 'utf8');
const cleanup = (root) => fs.rmSync(root, { recursive: true, force: true });
// The kit's hooks are copied into the temp project (as after install), then run with cwd = that project
const cli = (root, ...args) => {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  fs.cpSync(path.dirname(SCRIPT), path.join(root, '.claude', 'hooks'), { recursive: true });
  return spawnSync(process.execPath, [path.join(root, '.claude', 'hooks', 'antigravity-agents.mjs'), ...args], { cwd: root, env, encoding: 'utf8', timeout: 15000 });
};

test('AC-76.1 TIERS is exactly inherit, flash, pro', () => {
  assert.deepEqual(TIERS, ['inherit', 'flash', 'pro']);
});

test('AC-76.2 isAntigravity is true only for ANTIGRAVITY_AGENT=1', () => {
  assert.equal(isAntigravity({ ANTIGRAVITY_AGENT: '1' }), true);
  for (const v of ['0', 'true', '', ' 1', '1 ', 'yes', 1, undefined, null]) assert.equal(isAntigravity({ ANTIGRAVITY_AGENT: v }), false, `value: ${JSON.stringify(v)}`);
  assert.equal(isAntigravity({}), false);
});

test('AC-76.2 isAntigravity reads process.env by default', () => {
  const saved = process.env.ANTIGRAVITY_AGENT;
  try {
    process.env.ANTIGRAVITY_AGENT = '1';
    assert.equal(isAntigravity(), true);
    delete process.env.ANTIGRAVITY_AGENT;
    assert.equal(isAntigravity(), false);
  } finally {
    if (saved === undefined) delete process.env.ANTIGRAVITY_AGENT; else process.env.ANTIGRAVITY_AGENT = saved;
  }
});

test('AC-76.3 tierLabel names every tier', () => {
  assert.equal(tierLabel('pro'), 'Pro (Antigravity)');
  assert.equal(tierLabel('flash'), 'Flash (Antigravity)');
  assert.equal(tierLabel('inherit'), 'Main session model (Antigravity)');
});

test('AC-76.4 defaultTier maps the Claude model to a tier; missing or unknown means inherit', () => {
  for (const m of ['opus', 'sonnet', 'fable']) assert.equal(defaultTier(m), 'pro', m);
  assert.equal(defaultTier('haiku'), 'flash');
  for (const m of [undefined, null, '', 'gpt-5', 'inherit', 42]) assert.equal(defaultTier(m), 'inherit', `value: ${JSON.stringify(m)}`);
});

test('AC-76.5 setAgentTier creates the Antigravity agent from the Claude agent: name, description, model, no tools, body unchanged', () => {
  const root = project('test-writer');
  try {
    const r = setAgentTier(root, 'test-writer', 'pro');
    assert.equal(r.ok, true);
    assert.equal(path.resolve(r.file), path.resolve(target(root, 'test-writer')));
    const src = CLAUDE_AGENT('test-writer');
    const out = read(target(root, 'test-writer'));
    const split = (s) => { const i = s.indexOf('\n---', 3); return [s.slice(4, i), s.slice(i + 4)]; };
    const [srcFm, srcBody] = split(src);
    const [outFm, outBody] = split(out);
    assert.ok(out.startsWith('---\n'));
    const srcLines = srcFm.split('\n');
    assert.deepEqual(outFm.split('\n'), [srcLines.find((l) => l.startsWith('name:')), srcLines.find((l) => l.startsWith('description:')), 'model: pro']);
    assert.doesNotMatch(outFm, /tools:|sonnet/);
    assert.equal(outBody, srcBody, 'everything after the closing --- is identical');
    assert.equal(read(path.join(root, '.claude', 'agents', 'test-writer.md')), src, 'the Claude agent file is not touched');
  } finally { cleanup(root); }
});

test('AC-76.5 setAgentTier accepts every tier on a new file', () => {
  const root = project('a', 'b', 'c');
  try {
    for (const [n, t] of [['a', 'inherit'], ['b', 'flash'], ['c', 'pro']]) {
      assert.equal(setAgentTier(root, n, t).ok, true, t);
      assert.match(read(target(root, n)), new RegExp(`^model: ${t}$`, 'm'), t);
    }
  } finally { cleanup(root); }
});

test('AC-76.6 setAgentTier on an existing file changes only the frontmatter model line', () => {
  const root = project('a');
  try {
    const existing = '---\nname: a\ndescription: my own text\nmodel: flash\nextra: keep me\n---\n\nMy own body.\nmodel: flash\n\n\ttabs and trailing spaces  \n';
    fs.mkdirSync(path.dirname(target(root, 'a')), { recursive: true });
    fs.writeFileSync(target(root, 'a'), existing);
    assert.equal(setAgentTier(root, 'a', 'pro').ok, true);
    assert.equal(read(target(root, 'a')), existing.replace('\nmodel: flash\nextra', '\nmodel: pro\nextra'));
  } finally { cleanup(root); }
});

test('AC-76.6 setAgentTier keeps CRLF line endings and a model line in the body', () => {
  const root = project('a');
  try {
    const existing = '---\r\nname: a\r\nmodel: flash\r\n---\r\n\r\nbody\r\nmodel: flash\r\n';
    fs.mkdirSync(path.dirname(target(root, 'a')), { recursive: true });
    fs.writeFileSync(target(root, 'a'), existing);
    assert.equal(setAgentTier(root, 'a', 'inherit').ok, true);
    assert.equal(read(target(root, 'a')), '---\r\nname: a\r\nmodel: inherit\r\n---\r\n\r\nbody\r\nmodel: flash\r\n');
  } finally { cleanup(root); }
});

test('AC-76.6 setAgentTier inserts the model line before the closing --- when there is none, and leaves a body model line alone', () => {
  const root = project('a');
  try {
    fs.mkdirSync(path.dirname(target(root, 'a')), { recursive: true });
    fs.writeFileSync(target(root, 'a'), '---\nname: a\ndescription: d\n---\nbody\nmodel: flash\n');
    assert.equal(setAgentTier(root, 'a', 'pro').ok, true);
    assert.equal(read(target(root, 'a')), '---\nname: a\ndescription: d\nmodel: pro\n---\nbody\nmodel: flash\n');
  } finally { cleanup(root); }
});

test('AC-76.6 setAgentTier is idempotent', () => {
  const root = project('a');
  try {
    assert.equal(setAgentTier(root, 'a', 'flash').ok, true);
    const once = read(target(root, 'a'));
    assert.equal(setAgentTier(root, 'a', 'flash').ok, true);
    assert.equal(read(target(root, 'a')), once);
    assert.equal(setAgentTier(root, 'a', 'pro').ok, true);
    assert.equal(read(target(root, 'a')), once.replace('model: flash', 'model: pro'));
  } finally { cleanup(root); }
});

test('AC-76.7 ATTACK setAgentTier refuses an existing file without valid frontmatter and leaves it unchanged', () => {
  const root = project('a');
  try {
    fs.mkdirSync(path.dirname(target(root, 'a')), { recursive: true });
    for (const bad of ['just a body\nmodel: flash\n', '\n---\nname: a\n---\nbody\n', '---\nname: a\nmodel: flash\nno closing line\n', '']) {
      fs.writeFileSync(target(root, 'a'), bad);
      const r = setAgentTier(root, 'a', 'pro');
      assert.equal(r.ok, false, JSON.stringify(bad));
      assert.equal(typeof r.message, 'string');
      assert.notEqual(r.message, '');
      assert.equal(read(target(root, 'a')), bad, `unchanged: ${JSON.stringify(bad)}`);
    }
  } finally { cleanup(root); }
});

test('AC-76.8 ATTACK setAgentTier refuses bad agent names and writes nothing', () => {
  const root = project('foo');
  try {
    fs.writeFileSync(path.join(root, '.claude', 'x.md'), CLAUDE_AGENT('x')); // reachable as agents/../x.md
    fs.writeFileSync(path.join(root, '.claude', 'agents', 'x.md'), CLAUDE_AGENT('x'));
    const names = ['../x', '..', '.', 'x.md', 'a/b', 'a\\b', 'FOO', 'Foo', '', ' foo', 'foo ', 'foo\n', '-foo', 'foo.md', 'nope', 'a'.repeat(65), path.join(root, '.claude', 'agents', 'foo'), '/etc/passwd', undefined, null, 5, {}];
    for (const n of names) {
      const r = setAgentTier(root, n, 'pro');
      assert.equal(r.ok, false, `name: ${JSON.stringify(n)}`);
      assert.equal(typeof r.message, 'string');
      assert.notEqual(r.message, '');
    }
    assert.ok(!fs.existsSync(path.join(root, '.agents')), 'nothing was created');
    assert.ok(!fs.existsSync(path.join(root, '.claude', 'agents', 'x', 'pro')), 'no stray files');
  } finally { cleanup(root); }
});

test('AC-76.8 setAgentTier accepts a 64-character name that exists, refuses an unknown one', () => {
  const long = 'a'.repeat(64);
  const root = project(long);
  try {
    assert.equal(setAgentTier(root, long, 'flash').ok, true);
    assert.equal(setAgentTier(root, 'missing', 'flash').ok, false);
  } finally { cleanup(root); }
});

test('AC-76.9 ATTACK setAgentTier refuses any tier outside inherit, flash, pro and writes nothing', () => {
  const root = project('a');
  try {
    for (const t of ['opus', 'sonnet', 'haiku', 'Pro', 'PRO', 'FLASH', 'pro\nhooks: x', 'pro\r\n', 'pro ', ' pro', '', 'pro: x', undefined, null, 1, ['pro'], {}]) {
      const r = setAgentTier(root, 'a', t);
      assert.equal(r.ok, false, `tier: ${JSON.stringify(t)}`);
      assert.equal(typeof r.message, 'string');
      assert.notEqual(r.message, '');
    }
    assert.ok(!fs.existsSync(path.join(root, '.agents')), 'nothing was created');
  } finally { cleanup(root); }
});

test('AC-76.9 ATTACK a refused tier leaves an existing file unchanged', () => {
  const root = project('a');
  try {
    const existing = '---\nname: a\nmodel: flash\n---\nbody\n';
    fs.mkdirSync(path.dirname(target(root, 'a')), { recursive: true });
    fs.writeFileSync(target(root, 'a'), existing);
    assert.equal(setAgentTier(root, 'a', 'pro\nhooks: x').ok, false);
    assert.equal(read(target(root, 'a')), existing);
  } finally { cleanup(root); }
});

test('AC-76.10 setAgentTier never throws, also with no .claude/agents folder or a missing root', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-agents-empty-'));
  try {
    assert.equal(setAgentTier(empty, 'a', 'pro').ok, false);
    assert.equal(setAgentTier(path.join(empty, 'does-not-exist'), 'a', 'pro').ok, false);
    assert.equal(setAgentTier(undefined, 'a', 'pro').ok, false);
    assert.ok(!fs.existsSync(path.join(empty, '.agents')));
  } finally { cleanup(empty); }
});

test('AC-76.11 showAgents lists every Claude agent; tier comes from the Antigravity file, inherit when file or line is missing', () => {
  const root = project('alpha', 'beta', 'gamma', 'delta');
  try {
    fs.writeFileSync(path.join(root, '.claude', 'agents', 'README.txt'), 'not an agent');
    fs.mkdirSync(path.join(root, '.agents', 'agents'), { recursive: true });
    fs.writeFileSync(target(root, 'alpha'), '---\nname: alpha\nmodel: pro\n---\nbody\n');
    fs.writeFileSync(target(root, 'beta'), '---\r\nname: beta\r\nmodel: flash\r\n---\r\nbody\r\n');
    fs.writeFileSync(target(root, 'gamma'), '---\nname: gamma\n---\nmodel: pro\n'); // model line is in the body only
    const list = showAgents(root).sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual(list, [
      { name: 'alpha', tier: 'pro', label: 'Pro (Antigravity)' },
      { name: 'beta', tier: 'flash', label: 'Flash (Antigravity)' },
      { name: 'delta', tier: 'inherit', label: 'Main session model (Antigravity)' },
      { name: 'gamma', tier: 'inherit', label: 'Main session model (Antigravity)' },
    ]);
  } finally { cleanup(root); }
});

test('AC-76.11 showAgents is empty without agents and reflects setAgentTier', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-agents-empty-'));
  const root = project('a');
  try {
    assert.deepEqual(showAgents(empty), []);
    assert.equal(setAgentTier(root, 'a', 'flash').ok, true);
    assert.deepEqual(showAgents(root), [{ name: 'a', tier: 'flash', label: 'Flash (Antigravity)' }]);
  } finally { cleanup(empty); cleanup(root); }
});

test('AC-76.12 CLI --show prints one "<name>: <label>" line per agent', () => {
  const root = project('alpha', 'beta');
  try {
    assert.equal(setAgentTier(root, 'beta', 'pro').ok, true);
    const r = cli(root, '--show');
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.trim().split(/\r?\n/).sort(), ['alpha: Main session model (Antigravity)', 'beta: Pro (Antigravity)']);
  } finally { cleanup(root); }
});

test('AC-76.13 CLI --set applies every pair and exits 0', () => {
  const root = project('alpha', 'beta');
  try {
    const r = cli(root, '--set', 'alpha=pro', 'beta=flash');
    assert.equal(r.status, 0, r.stderr);
    assert.match(read(target(root, 'alpha')), /^model: pro$/m);
    assert.match(read(target(root, 'beta')), /^model: flash$/m);
  } finally { cleanup(root); }
});

test('AC-76.14 ATTACK CLI --set exits 1 with a message on a bad tier, unknown agent, bad name or malformed pair, and the file stays unchanged', () => {
  const root = project('alpha');
  try {
    const existing = '---\nname: alpha\nmodel: flash\n---\nbody\n';
    fs.mkdirSync(path.dirname(target(root, 'alpha')), { recursive: true });
    fs.writeFileSync(target(root, 'alpha'), existing);
    for (const pair of ['alpha=opus', 'alpha=Pro', 'alpha=', 'nope=pro', '../x=pro', 'alpha', '=pro']) {
      const r = cli(root, '--set', pair);
      assert.equal(r.status, 1, `pair: ${pair}`);
      assert.notEqual((r.stdout + r.stderr).trim(), '', `message for ${pair}`);
      assert.equal(read(target(root, 'alpha')), existing, `unchanged after ${pair}`);
    }
    assert.ok(!fs.existsSync(path.join(root, '.agents', 'agents', 'x.md')));
  } finally { cleanup(root); }
});

test('AC-76.14 CLI --set exits 1 when one of several pairs is refused', () => {
  const root = project('alpha', 'beta');
  try {
    const r = cli(root, '--set', 'alpha=pro', 'beta=opus');
    assert.equal(r.status, 1);
    assert.doesNotMatch(fs.existsSync(target(root, 'beta')) ? read(target(root, 'beta')) : '', /opus/);
  } finally { cleanup(root); }
});
