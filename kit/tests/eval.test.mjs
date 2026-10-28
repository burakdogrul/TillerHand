// Run: node --test "kit/tests/*.test.mjs"
// Kit evaluation (kit/eval): the fixture is green, every task is complete and its hidden tests are red on the fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tally, parseStream, caughtTests, scrub, mutantsKilled, summary, limitHit } from '../eval/run.mjs';

const EVAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'eval');
const tasks = fs.readdirSync(path.join(EVAL, 'tasks')).filter((d) => fs.statSync(path.join(EVAL, 'tasks', d)).isDirectory());
// A child of node --test inherits NODE_TEST_CONTEXT and would report to the parent instead of printing its summary
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
const nodeTest = (cwd, file) => tally(spawnSync(process.execPath, ['--test', '--test-reporter=spec', file], { cwd, env, encoding: 'utf8', timeout: 60000 }).stdout);

// The fixture in a temp folder with the hidden tests next to it, optionally with the task's reference solution on top
// (and a mutant on top of that)
function hiddenRun(task, { solution = false, mutant = null } = {}) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-'));
  fs.cpSync(path.join(EVAL, 'fixture'), p, { recursive: true });
  if (solution || mutant) fs.cpSync(path.join(EVAL, 'tasks', task, 'solution'), p, { recursive: true });
  if (mutant) fs.cpSync(path.join(EVAL, 'tasks', task, 'mutants', mutant), p, { recursive: true });
  const hidden = path.join(p, 'tests', '__hidden__');
  fs.mkdirSync(hidden);
  fs.copyFileSync(path.join(EVAL, 'tasks', 'helper.mjs'), path.join(hidden, 'helper.mjs'));
  fs.copyFileSync(path.join(EVAL, 'tasks', task, 'hidden.test.mjs'), path.join(hidden, 'hidden.test.mjs'));
  const r = { hidden: nodeTest(p, path.join('tests', '__hidden__', 'hidden.test.mjs')), visible: nodeTest(p, path.join('tests', 'notes.test.mjs')) };
  fs.rmSync(p, { recursive: true, force: true });
  return r;
}

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
    const { hidden } = hiddenRun(t);
    assert.ok(hidden.fail > 0, `${t}: the hidden tests are red before the task (${JSON.stringify(hidden)})`);
  }
});

test('eval: every task\'s reference solution turns the hidden tests green and keeps the visible ones green', () => {
  for (const t of tasks) {
    const { hidden, visible } = hiddenRun(t, { solution: true });
    assert.ok(hidden.pass > 0 && hidden.fail === 0, `${t}: hidden ${JSON.stringify(hidden)}`);
    assert.ok(visible.pass > 0 && visible.fail === 0, `${t}: visible ${JSON.stringify(visible)}`);
  }
});

test('eval: every task has at least two mutants and each one turns the hidden tests red', () => {
  assert.ok(tasks.length >= 6, 'second round: 6 tasks');
  for (const t of tasks) {
    const list = fs.readdirSync(path.join(EVAL, 'tasks', t, 'mutants'));
    assert.ok(list.length >= 2, `${t}: mutants`);
    for (const m of list) {
      const { hidden, visible } = hiddenRun(t, { mutant: m });
      assert.ok(hidden.fail > 0, `${t}/${m}: the mutant is caught by the hidden tests (${JSON.stringify(hidden)})`);
      // The fixture's own tests miss it: a kill can only come from a test the agent wrote
      assert.ok(visible.pass > 0 && visible.fail === 0, `${t}/${m}: visible tests stay green (${JSON.stringify(visible)})`);
    }
  }
});

test('eval: mutantsKilled runs the agent\'s tests that pass on the reference solution against each mutant', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-'));
  fs.cpSync(path.join(EVAL, 'fixture'), p, { recursive: true });
  const total = fs.readdirSync(path.join(EVAL, 'tasks', 'bug-sort', 'mutants')).length;
  assert.deepEqual(mutantsKilled(p, 'bug-sort'), { killed: 0, total }, 'the fixture\'s own tests do not check the order');
  fs.writeFileSync(path.join(p, 'tests', 'sort.test.mjs'), `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/features/notes/server/store.js';
test('newest first', () => {
  const s = createStore();
  for (const d of ['2025-03-01', '2024-01-01', '2025-10-01']) s.create({ title: d, createdAt: d });
  assert.deepEqual(s.list().map((n) => n.createdAt), ['2025-10-01', '2025-03-01', '2024-01-01']);
});
`);
  // The agent's own module is missing from the reference solution: that file is left out, not counted as a kill
  fs.writeFileSync(path.join(p, 'tests', 'own.test.mjs'), `import { test } from 'node:test';
import { helper } from '../src/features/notes/server/agent-only.js';
test('own module', () => helper());
`);
  assert.deepEqual(mutantsKilled(p, 'bug-sort'), { killed: total, total });
  fs.rmSync(p, { recursive: true, force: true });
});

test('eval: summary groups repeated runs by task and condition', () => {
  const row = (task, cond, pass, fail, cost) => ({ task, cond, hidden: { pass, fail }, mutants: { killed: pass, total: 2 }, costUsd: cost, durationS: 10 });
  const broken = { task: 'a', cond: 'plain', error: 'harness error: x' }; // no hidden, no mutants
  const s = summary([row('a', 'kit', 2, 0, 0.2), row('a', 'kit', 1, 1, 0.4), broken, row('a', 'plain', 2, 0, 0.1)]);
  assert.deepEqual(s.map((x) => [x.task, x.cond, x.runs]), [['a', 'kit', 2], ['a', 'plain', 2]]);
  assert.deepEqual([s[0].hiddenAvg, s[0].hiddenMin, s[0].hiddenMax], [0.75, 0.5, 1]);
  assert.ok(Math.abs(s[0].costAvg - 0.3) < 1e-9);
  assert.equal(s[0].killedAvg, 1.5);
  assert.deepEqual([s[1].hiddenAvg, s[1].hiddenMin, s[1].mutantTotal], [0.5, 0, 2], 'a run without a result counts as 0; the total comes from a scored run');
});

test('eval: limitHit recognizes the plan limit message, not other errors', () => {
  assert.equal(limitHit({ error: "You've hit your session limit · resets 3:10am (Europe/Istanbul)" }), true);
  assert.equal(limitHit({ error: "You've hit your weekly limit · resets Oct 31" }), true);
  for (const error of [null, undefined, 'error_max_budget_usd', 'harness error: rate limit in test']) assert.equal(limitHit({ error }), false, String(error));
});

test('eval: tally reads the node --test summary', () => {
  assert.deepEqual(tally('ℹ tests 5\nℹ pass 3\nℹ fail 2\n'), { pass: 3, fail: 2 });
  assert.deepEqual(tally(''), { pass: 0, fail: 0 });
});

test('eval: parseStream reads the result, the init event and whether tests came before code', () => {
  const dir = path.join(os.tmpdir(), 'run');
  const use = (name, input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
  const init = JSON.stringify({ type: 'system', subtype: 'init', claude_code_version: '9.9.9', plugins: [{ name: 'p1' }] });
  const result = JSON.stringify({ type: 'result', total_cost_usd: 0.1, num_turns: 3 });
  const testFirst = [init, use('Read', { file_path: path.join(dir, 'src', 'a.js') }), use('Write', { file_path: path.join(dir, 'tests', 'a.test.mjs') }),
    use('Bash', { command: 'node .claude/hooks/gate.mjs --run' }), use('Edit', { file_path: path.join(dir, 'src', 'a.js') }), 'not json', result].join('\n');
  const r = parseStream(testFirst, dir);
  assert.equal(r.json.total_cost_usd, 0.1);
  assert.equal(r.init.claude_code_version, '9.9.9');
  assert.equal(r.testFirst, true);
  assert.equal(r.gateRan, true);
  const codeFirst = parseStream([use('Edit', { file_path: path.join(dir, 'src', 'a.js') }), use('Edit', { file_path: path.join(dir, 'tests', 'a.test.mjs') })].join('\n'), dir);
  assert.equal(codeFirst.testFirst, false);
  assert.equal(codeFirst.gateRan, false);
  assert.equal(codeFirst.json, null, 'no result event');
  assert.equal(parseStream(use('Edit', { file_path: path.join(dir, 'src', 'a.js') }), dir).testFirst, null, 'no test written');
  const colocated = [use('Write', { file_path: path.join(dir, 'src', 'features', 'n', '__tests__', 'n.test.mjs') }), use('Edit', { file_path: path.join(dir, 'src', 'a.js') })].join('\n');
  assert.equal(parseStream(colocated, dir).testFirst, true, 'a test file under src/ counts as a test, not code');
});

test('eval: scrub masks the temp folder and the home folder in both slash styles', () => {
  const home = os.homedir();
  const s = scrub(`a ${path.join(home, 'x')} b ${home.replaceAll('\\', '/')}/y c ${path.join(os.tmpdir(), 'kit-eval-1', 'f')}`, path.join(os.tmpdir(), 'kit-eval-1'));
  assert.ok(!s.includes(home) && !s.includes(home.replaceAll('\\', '/')), s);
  assert.match(s, /<tmp>/);
});

test('eval: caughtTests counts the agent\'s tests that pass on its code and fail on the unchanged fixture', () => {
  // The bug-sort reference solution stands in for the agent's code
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-'));
  fs.cpSync(path.join(EVAL, 'fixture'), p, { recursive: true });
  fs.cpSync(path.join(EVAL, 'tasks', 'bug-sort', 'solution'), p, { recursive: true });
  assert.equal(caughtTests(p), 0, 'the fixture\'s own tests pass on the fixture');
  fs.writeFileSync(path.join(p, 'tests', 'sort.test.mjs'), `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/features/notes/server/store.js';
test('newest first', () => {
  const s = createStore();
  for (const d of ['2025-03-01', '2024-01-01', '2025-10-01']) s.create({ title: d, createdAt: d });
  assert.deepEqual(s.list().map((n) => n.createdAt), ['2025-10-01', '2025-03-01', '2024-01-01']);
});
test('still passes', () => assert.ok(true));
test('broken: red on both', () => assert.equal(1, 2));
`);
  // A test file that cannot load on the fixture (it imports a module the task added) counts its passing tests
  fs.mkdirSync(path.join(p, 'src', 'features', 'extra'), { recursive: true });
  fs.writeFileSync(path.join(p, 'src', 'features', 'extra', 'x.js'), 'export const x = 1;\n');
  fs.writeFileSync(path.join(p, 'tests', 'extra.test.mjs'), `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { x } from '../src/features/extra/x.js';
test('new module works', () => assert.equal(x, 1));
`);
  assert.equal(caughtTests(p), 2, 'newest first + new module works; not the broken one');
  fs.rmSync(p, { recursive: true, force: true });
});
