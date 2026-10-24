// Run: node --test "kit/tests/*.test.mjs"
// Kit evaluation (kit/eval): the fixture is green, every task is complete and its hidden tests are red on the fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tally } from '../eval/run.mjs';

const EVAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'eval');
const tasks = fs.readdirSync(path.join(EVAL, 'tasks')).filter((d) => fs.statSync(path.join(EVAL, 'tasks', d)).isDirectory());
// A child of node --test inherits NODE_TEST_CONTEXT and would report to the parent instead of printing its summary
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
const nodeTest = (cwd, file) => tally(spawnSync(process.execPath, ['--test', file], { cwd, env, encoding: 'utf8', timeout: 60000 }).stdout);

test('eval: the fixture tests are green', () => {
  const r = nodeTest(path.join(EVAL, 'fixture'), path.join('tests', 'notes.test.mjs'));
  assert.ok(r.pass > 0 && r.fail === 0, JSON.stringify(r));
});

test('eval: every task has a prompt, a kit command and hidden tests that fail on the fixture', () => {
  assert.ok(tasks.length >= 3);
  for (const t of tasks) {
    const dir = path.join(EVAL, 'tasks', t);
    assert.ok(fs.readFileSync(path.join(dir, 'prompt.md'), 'utf8').trim(), `${t}: prompt`);
    assert.match(JSON.parse(fs.readFileSync(path.join(dir, 'task.json'), 'utf8')).kitCommand, /^\/[a-z-]+$/, `${t}: kit command`);
    const p = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-'));
    fs.cpSync(path.join(EVAL, 'fixture'), p, { recursive: true });
    const hidden = path.join(p, 'tests', '__hidden__');
    fs.mkdirSync(hidden);
    fs.copyFileSync(path.join(EVAL, 'tasks', 'helper.mjs'), path.join(hidden, 'helper.mjs'));
    fs.copyFileSync(path.join(dir, 'hidden.test.mjs'), path.join(hidden, 'hidden.test.mjs'));
    const r = nodeTest(p, path.join('tests', '__hidden__', 'hidden.test.mjs'));
    assert.ok(r.fail > 0, `${t}: the hidden tests are red before the task (${JSON.stringify(r)})`);
    fs.rmSync(p, { recursive: true, force: true });
  }
});

test('eval: tally reads the node --test summary', () => {
  assert.deepEqual(tally('ℹ tests 5\nℹ pass 3\nℹ fail 2\n'), { pass: 3, fail: 2 });
  assert.deepEqual(tally(''), { pass: 0, fail: 0 });
});
