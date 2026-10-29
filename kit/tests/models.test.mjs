// Run: node --test "kit/tests/*.test.mjs"
// Model and effort per role (3.31.0): asked at the start of every task, saved through the script, handed to the subagents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readModels, setModels, showModels, RECOMMENDED, ROLES } from '../../.claude/hooks/models.mjs';
import { evaluate, permissionEquivalent } from '../../.claude/hooks/destructive-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'model-')), 'state', 'models.json');

test('models: recommended by default, --set changes only the given roles, bad input is refused', (t) => {
  // The saved-choice note goes through t(): pin the project language (findRoot reads CLAUDE_PROJECT_DIR)
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'model-lang-'));
  fs.writeFileSync(path.join(project, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  const previous = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = project;
  t.after(() => { if (previous === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = previous; });
  const file = tmpFile();
  assert.deepEqual(readModels(file), RECOMMENDED);
  assert.match(showModels(file), /no saved choice/);
  assert.equal(setModels(['code=haiku:medium', 'PLAN=Opus:XHIGH'], file), null);
  assert.deepEqual(readModels(file), { ...RECOMMENDED, code: 'haiku:medium', plan: 'opus:xhigh' });
  assert.match(showModels(file), /^plan: opus \/ xhigh \(Planning and architecture\) · recommended opus \/ high$/m);
  for (const bad of ['code=gpt:low', 'code=sonnet:max', 'code=sonnet', 'code=sonnet:low:x', 'code=sonnet:medium=x', 'none=sonnet:low', '__proto__=sonnet:low', 'code'])
    assert.match(setModels([bad], file), /Invalid/, bad);
  assert.match(setModels([], file), /Usage/);
  assert.equal(readModels(file).code, 'haiku:medium', 'a refused --set writes nothing');
  fs.writeFileSync(file, '{"code":"gpt-9:ultra","docs":"sonnet:low"}');
  assert.deepEqual(readModels(file), { ...RECOMMENDED, docs: 'sonnet:low' }, 'a bad hand edit falls back to the recommended value');
  fs.writeFileSync(file, 'broken');
  assert.deepEqual(readModels(file), RECOMMENDED);
  assert.match(showModels(file), /saved choice unreadable/, 'a broken file is not shown as a saved choice');
});

test('models: the CLI exits 1 on a bad --set and writes nothing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-cli-'));
  const run = (...args) => spawnSync(process.execPath, [path.join(ROOT, '.claude/hooks/models.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  const bad = run('--set', 'code=gpt:low');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Invalid/);
  assert.equal(fs.existsSync(path.join(root, '.claude/state/models.json')), false);
  const ok = run('--set', 'docs=sonnet:low');
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /^docs: sonnet \/ low/m);
  assert.equal(run('--nope').status, 1);
});

test('models: the commands ask both screens and hand the role to the subagent; the doc ships with the kit', () => {
  const build = read('.claude/commands/build.md');
  assert.match(build, /models\.mjs --set/);
  assert.match(build, /docs\/workflow\/models\.md/);
  for (const c of ['start', 'adopt', 'release']) assert.match(read(`.claude/commands/${c}.md`), /docs\/workflow\/models\.md/, c);
  const doc = read('docs/workflow/models.md');
  for (const r of ['plan', 'code', 'review', 'test', 'docs']) assert.match(doc, new RegExp('`' + r + '`'), r);
  assert.match(read('kit/kit.mjs'), /workflow\\\/\([^)]*\bmodels\b/, 'models.md is replaced on update (KIT_OWNED)');
  const settings = JSON.parse(read('.claude/settings.json')).permissions;
  assert.ok(settings.allow.includes('Bash(node .claude/hooks/models.mjs --show)'));
  assert.ok(settings.allow.includes('Bash(node .claude/hooks/models.mjs --set:*)'));
  for (const c of ['node .claude/hooks/models.mjs --set code=haiku:low', 'node .claude/hooks/models.mjs --show'])
    assert.equal(permissionEquivalent(c) ?? evaluate(c), null, `Codex/Antigravity: not asked either (${c})`);
});

test('test-writer K4 models: a test role, recommended opus:high, saved and shown like the others', () => {
  assert.ok(Object.hasOwn(ROLES, 'test'), 'ROLES.test');
  assert.equal(RECOMMENDED.test, 'opus:high');
  const file = tmpFile();
  assert.equal(readModels(file).test, 'opus:high');
  assert.equal(setModels(['test=sonnet:high'], file), null);
  assert.equal(readModels(file).test, 'sonnet:high');
  assert.match(showModels(file), /^test: sonnet \/ high/m);
});

test('test-writer K4 models: the CLI warns when the code and test roles share a model, not otherwise', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-tw-'));
  const run = (...args) => spawnSync(process.execPath, [path.join(ROOT, '.claude/hooks/models.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  const same = run('--set', 'code=sonnet:high', 'test=sonnet:medium');
  assert.equal(same.status, 0, same.stderr);
  assert.match(same.stdout, /code and test roles use the same model/, '--set warns');
  assert.equal(readModels(path.join(root, '.claude/state/models.json')).test, 'sonnet:medium', 'the choice is still saved');
  assert.match(run('--show').stdout, /code and test roles use the same model/, '--show warns');
  const diff = run('--set', 'code=sonnet:high', 'test=opus:high');
  assert.equal(diff.status, 0, diff.stderr);
  assert.doesNotMatch(diff.stdout, /same model/);
  assert.doesNotMatch(run('--show').stdout, /same model/);
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'model-tw0-'));
  const show = spawnSync(process.execPath, [path.join(ROOT, '.claude/hooks/models.mjs'), '--show'], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: fresh } });
  assert.doesNotMatch(show.stdout, /same model/, 'recommended values differ (sonnet / opus)');
});

test('test-writer K4 models: build.md saves the test role', () => {
  const set = read('.claude/commands/build.md').split('\n').find((l) => /models\.mjs --set/.test(l));
  assert.ok(set, 'build.md has a --set example');
  assert.match(set, /models\.mjs --set [^`]*\btest=/);
});
