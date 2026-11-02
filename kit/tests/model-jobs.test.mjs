// Run: node --test kit/tests/model-jobs.test.mjs
// 3.62.0: model choice per job under the five roles (models.mjs --for / --set / --reset / --show, run-role.mjs <job>),
// and the commands stop asking about models. Behaviour is tested through the CLI on a temp project and a temp HOME.
// Modules load inside the tests, so a missing export turns that test red on its own, not the whole file.
// 3.64.0: no ready-made provider; the user names it, and the key is sealed with its address in a vault. These tests use a vault in a folder (fake-vault.mjs).
// No real provider and no real claude: run-role.mjs gets the fake-vault preload, which records the claude call and never runs it. Keys are fake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fileBackend, makeFakeClaude, FAKE_VAULT_URL } from './fake-vault.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(ROOT, '.claude', 'hooks');
const load = (name) => import(pathToFileURL(path.join(HOOKS, name)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const T = { timeout: 180000 };

// Nothing in this file may touch the real key store
const TMP_HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mj-top-home-')));
process.env.HOME = TMP_HOME;
process.env.USERPROFILE = TMP_HOME;
process.on('exit', () => { try { fs.rmSync(TMP_HOME, { recursive: true, force: true }); } catch { /* temp */ } });

// The key goes in through the same code the command uses, in this process, into a vault folder that is not the real one
const keystore = await load('keystore.mjs');
const DEFAULT_VAULT = path.join(TMP_HOME, 'default-vault');
keystore.setVaultBackend(fileBackend(DEFAULT_VAULT)); // never null: null would fall back to the real vault of this machine

// Split up so this file does not trip the secret scan
const OR_URL = 'https://llm.example/anthropic';
const OR_KEY = 'sk-' + 'or-v1-' + 'a1b2c3d4'.repeat(6);
const EXT = 'openrouter/x/y:high';
const MODEL = 'deepseek/deepseek-v4.1-flash-1017';
const MODEL_VALUE = `openrouter/${MODEL}:high`;

const tmpDir = (t, prefix) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* temp */ } });
  return dir;
};
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

// ---- The job table, written out here on purpose (not read from the code under test) ----

const GENERAL = {
  plan: ['plan.task', 'plan.architecture', 'plan.text'],
  code: ['code.simple', 'code.feature', 'code.critical', 'code.bugfix', 'code.refactor', 'code.ui'],
  test: ['test.simple', 'test.feature', 'test.adversarial', 'test.critical'],
  review: ['review.code', 'review.security'],
  docs: ['docs.changelog', 'docs.report', 'docs.scan', 'docs.research'],
};
const REPORT_TYPES = ['tech', 'security', 'perf', 'ux', 'business', 'legal'];
const MEMBERS = ['product', 'architect', 'ux', 'performance', 'privacy', 'api', 'qa', 'devops', 'mobile', 'ai'];
const ALL_JOBS = [
  'main', ...Object.values(GENERAL).flat(),
  'findings.default', ...REPORT_TYPES.map((x) => `findings.${x}`),
  'board.default', 'board.commit', ...MEMBERS.map((x) => `board.${x}`),
];
// What each job gives with no saved choice: the recommended value of its chain
const rec = (job) => (job === 'main' || job.startsWith('plan.') ? 'opus:high' : job === 'board.commit' ? 'haiku:low' : job.startsWith('docs.') ? 'haiku:high' : 'sonnet:high');

// ---- A temp project and a temp home; models.mjs from the repository ----

const storeOf = (home) => path.join(home, '.vibe-kit', 'providers.json');
// What a run refuses to start under, and what the desktop app sets in every child, are put aside: the result must not depend on this machine
const AMBIENT = /^(ANTHROPIC|CLAUDE|KIT_)|_API_KEY$|^(NODE_TLS_REJECT_UNAUTHORIZED|NODE_EXTRA_CA_CERTS|NODE_USE_SYSTEM_CA|NODE_USE_ENV_PROXY|SSL_CERT_FILE|SSL_CERT_DIR)$/i;
function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (AMBIENT.test(k)) delete env[k];
  return env;
}
async function seedKey(vaultDir, storeFile) {
  const { setProvider } = await load('providers.mjs');
  keystore.setVaultBackend(fileBackend(vaultDir));
  try { assert.equal(setProvider('openrouter', OR_URL, OR_KEY, storeFile), null); } finally { keystore.setVaultBackend(fileBackend(DEFAULT_VAULT)); }
}
function mk(t) {
  const root = tmpDir(t, 'mj-proj-');
  const home = tmpDir(t, 'mj-home-');
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  const modelsFile = path.join(root, '.claude', 'state', 'models.json');
  const localFile = path.join(root, '.claude', 'settings.local.json');
  const run = (...args) => spawnSync(process.execPath, [path.join(HOOKS, 'models.mjs'), ...args], {
    encoding: 'utf8', timeout: 30000, env: { ...cleanEnv(), HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: root },
  });
  const forJob = (job) => {
    const r = run('--for', job);
    return { status: r.status, out: r.stdout.trim(), lines: r.stdout.split('\n').filter(Boolean).length, err: r.stderr };
  };
  return {
    root, home, modelsFile, localFile, run, forJob,
    put: (v) => write(modelsFile, typeof v === 'string' ? v : JSON.stringify(v)),
    saved: () => JSON.parse(fs.readFileSync(modelsFile, 'utf8')),
    has: () => fs.existsSync(modelsFile),
    bytes: () => fs.readFileSync(modelsFile, 'utf8'),
    key: () => seedKey(DEFAULT_VAULT, storeOf(home)),
  };
}
const REASON = /invalid|not valid|unknown|unsupported|skipp|ignor|no key|not allowed|cannot/i;

// ---- AC-62.1 ----

test('AC-62.1 JOBS is exported from models.mjs and holds exactly the job keys', T, async () => {
  const { JOBS } = await load('models.mjs');
  assert.equal(typeof JOBS, 'object', 'JOBS is exported');
  assert.equal(Array.isArray(JOBS), false);
  assert.deepEqual(Object.keys(JOBS).sort(), [...ALL_JOBS].sort());
});

test('AC-62.1 no file at all: every job gives its recommended value on one line, nothing on stderr', T, (t) => {
  const m = mk(t);
  for (const job of ALL_JOBS) {
    const r = m.forJob(job);
    assert.equal(r.status, 0, job);
    assert.equal(r.out, rec(job), job);
    assert.equal(r.lines, 1, `${job}: one line`);
    assert.equal(r.err, '', `${job}: nothing on stderr`);
  }
  assert.equal(m.has(), false, '--for reads, never writes');
  assert.equal(m.forJob('code').out, 'sonnet:high', 'a role name works as the job');
  assert.equal(m.forJob('plan').out, 'opus:high');
  assert.equal(m.forJob('docs').out, 'haiku:high');
});

test('AC-62.1 general job: the job, then its role, then the recommended value', T, (t) => {
  const m = mk(t);
  for (const [role, jobs] of Object.entries(GENERAL)) {
    jobs.forEach((job, i) => {
      const sibling = jobs[(i + 1) % jobs.length];
      m.put({ [role]: 'haiku:medium' });
      assert.equal(m.forJob(job).out, 'haiku:medium', `${job} follows ${role}`);
      m.put({ [role]: 'haiku:medium', tasks: { [job]: 'opus:xhigh' } });
      assert.equal(m.forJob(job).out, 'opus:xhigh', `${job} own choice wins`);
      assert.equal(m.forJob(sibling).out, 'haiku:medium', `${sibling} is not touched by ${job}`);
      assert.equal(m.forJob(role).out, 'haiku:medium', `${role} is not touched by ${job}`);
    });
  }
});

test('AC-62.1 report: findings.<type>, then findings.default, then review, then recommended', T, (t) => {
  const m = mk(t);
  for (const type of REPORT_TYPES) {
    const job = `findings.${type}`;
    const other = REPORT_TYPES.find((x) => x !== type);
    m.put({});
    assert.equal(m.forJob(job).out, 'sonnet:high', `${job} recommended`);
    m.put({ review: 'haiku:medium' });
    assert.equal(m.forJob(job).out, 'haiku:medium', `${job} follows review`);
    m.put({ review: 'haiku:medium', tasks: { 'findings.default': 'opus:medium' } });
    assert.equal(m.forJob(job).out, 'opus:medium', `${job} follows findings.default`);
    m.put({ review: 'haiku:medium', tasks: { 'findings.default': 'opus:medium', [job]: 'sonnet:xhigh' } });
    assert.equal(m.forJob(job).out, 'sonnet:xhigh', `${job} own choice`);
    assert.equal(m.forJob(`findings.${other}`).out, 'opus:medium', `findings.${other} is not touched by ${job}`);
  }
  m.put({ review: 'haiku:medium' });
  assert.equal(m.forJob('findings.default').out, 'haiku:medium', 'findings.default follows review');
  m.put({ review: 'haiku:medium', tasks: { 'findings.default': 'opus:low' } });
  assert.equal(m.forJob('findings.default').out, 'opus:low');
});

test('AC-62.1 board member: board.<member>, then board.default, then review, then recommended', T, (t) => {
  const m = mk(t);
  for (const member of MEMBERS) {
    const job = `board.${member}`;
    const other = MEMBERS.find((x) => x !== member);
    m.put({});
    assert.equal(m.forJob(job).out, 'sonnet:high', `${job} recommended`);
    m.put({ review: 'haiku:medium' });
    assert.equal(m.forJob(job).out, 'haiku:medium', `${job} follows review`);
    m.put({ review: 'haiku:medium', tasks: { 'board.default': 'opus:medium' } });
    assert.equal(m.forJob(job).out, 'opus:medium', `${job} follows board.default`);
    m.put({ review: 'haiku:medium', tasks: { 'board.default': 'opus:medium', [job]: 'sonnet:xhigh' } });
    assert.equal(m.forJob(job).out, 'sonnet:xhigh', `${job} own choice`);
    assert.equal(m.forJob(`board.${other}`).out, 'opus:medium', `board.${other} is not touched by ${job}`);
  }
  m.put({ review: 'haiku:medium', tasks: { 'board.default': 'opus:low' } });
  assert.equal(m.forJob('board.default').out, 'opus:low');
});

test('AC-62.1 commit board: board.commit, then haiku:low; review and board.default do not reach it', T, (t) => {
  const m = mk(t);
  m.put({ review: 'opus:xhigh', tasks: { 'board.default': 'opus:high' } });
  assert.equal(m.forJob('board.commit').out, 'haiku:low');
  m.put({ review: 'opus:xhigh', plan: 'opus:xhigh', code: 'opus:xhigh', docs: 'opus:xhigh', tasks: { 'board.default': 'opus:high', 'findings.default': 'opus:high' } });
  assert.equal(m.forJob('board.commit').out, 'haiku:low');
  m.put({ review: 'opus:xhigh', tasks: { 'board.default': 'opus:high', 'board.commit': 'sonnet:low' } });
  assert.equal(m.forJob('board.commit').out, 'sonnet:low', 'its own choice');
  assert.equal(m.forJob('board.qa').out, 'opus:high', 'the other members still follow board.default');
});

test('AC-62.1 main: main, then plan, then the recommended plan value', T, (t) => {
  const m = mk(t);
  m.put({});
  assert.equal(m.forJob('main').out, 'opus:high');
  m.put({ plan: 'sonnet:medium' });
  assert.equal(m.forJob('main').out, 'sonnet:medium', 'follows plan');
  m.put({ plan: 'sonnet:medium', tasks: { main: 'haiku:low' } });
  assert.equal(m.forJob('main').out, 'haiku:low', 'own choice');
  assert.equal(m.forJob('plan').out, 'sonnet:medium', 'main does not move plan');
  assert.equal(m.forJob('plan.task').out, 'sonnet:medium');
  m.put({ code: 'haiku:low', review: 'haiku:low', docs: 'opus:high' });
  assert.equal(m.forJob('main').out, 'opus:high', 'other roles do not reach main');
});

test('AC-62.1 an external value prints the model and the run command that names the job', T, async (t) => {
  const m = mk(t);
  await m.key();
  m.put({ code: 'haiku:medium', tasks: { 'code.ui': EXT, 'test.critical': EXT, 'docs.report': EXT } });
  for (const job of ['code.ui', 'test.critical', 'docs.report']) {
    const r = m.forJob(job);
    assert.equal(r.status, 0, job);
    assert.equal(r.lines, 1, `${job}: one line`);
    assert.match(r.out, new RegExp(`^openrouter/x/y:high .*run-role\\.mjs ${job.replace('.', '\\.')}(\\s|$)`), job);
  }
  assert.equal(m.forJob('code.feature').out, 'haiku:medium');
  m.put({ code: EXT });
  assert.match(m.forJob('code').out, /^openrouter\/x\/y:high .*run-role\.mjs code(\s|$)/, 'a role name works as the job');
  assert.match(m.forJob('code.feature').out, /^openrouter\/x\/y:high .*run-role\.mjs code\.feature(\s|$)/, 'a job that follows the role names itself');
});

// ---- AC-62.2 ----

test('AC-62.2 an invalid saved value on a link is skipped, the next link is used, stderr names the link', T, (t) => {
  const m = mk(t);
  m.put({ code: 'haiku:medium', tasks: { 'code.ui': 'gpt-9:ultra' } });
  let r = m.forJob('code.ui');
  assert.equal(r.status, 0);
  assert.equal(r.out, 'haiku:medium', 'the role is the next link');
  assert.match(r.err, /code\.ui/);
  assert.match(r.err, REASON);
  m.put({ code: 'gpt-9:ultra', tasks: { 'code.ui': 'opus:ultra' } });
  r = m.forJob('code.ui');
  assert.equal(r.status, 0);
  assert.equal(r.out, 'sonnet:high', 'both links bad: recommended');
  assert.match(r.err, /code\.ui/);
  assert.ok(r.err.split('\n').filter((l) => /\S/.test(l)).length >= 2, 'one reason per skipped link');
  m.put({ tasks: { 'board.qa': 'gpt-9:ultra', 'board.default': 'opus:low' } });
  r = m.forJob('board.qa');
  assert.equal(r.out, 'opus:low', 'a report chain skips one link too');
  assert.match(r.err, /board\.qa/);
  for (const bad of [5, null, true, {}, [], 'opus', 'opus:', ':high', 'Opus:high', '']) {
    m.put({ code: 'haiku:medium', tasks: { 'code.ui': bad } });
    r = m.forJob('code.ui');
    assert.equal(r.status, 0, JSON.stringify(bad));
    assert.equal(r.out, 'haiku:medium', JSON.stringify(bad));
    assert.doesNotMatch(r.err, /TypeError|at file:/, JSON.stringify(bad));
  }
});

test('AC-62.2 a role with an external value and no key for the provider: recommended value and a reason', T, (t) => {
  const m = mk(t);
  m.put({ code: EXT });
  let r = m.forJob('code');
  assert.equal(r.status, 0);
  assert.equal(r.out, 'sonnet:high');
  assert.match(r.err, /openrouter/);
  assert.match(r.err, /key/i);
  r = m.forJob('code.feature');
  assert.equal(r.status, 0);
  assert.equal(r.out, 'sonnet:high', 'a job that follows the role falls back too');
  assert.match(r.err, /key/i);
  m.put({ code: 'haiku:medium', tasks: { 'code.ui': EXT } });
  r = m.forJob('code.ui');
  assert.equal(r.out, 'haiku:medium', 'the job link is skipped, the role link is used');
  assert.match(r.err, /code\.ui/);
  assert.match(r.err, /key/i);
});

test('AC-62.2 broken JSON in the file: recommended values, a reason on stderr, --for still exits 0', T, (t) => {
  const m = mk(t);
  for (const broken of ['{"code":', 'broken', '{"tasks":{"code.ui":"opus:xhigh"}']) {
    m.put(broken);
    for (const job of ['code.ui', 'main', 'board.commit', 'code']) {
      const r = m.forJob(job);
      assert.equal(r.status, 0, `${JSON.stringify(broken)} ${job}`);
      assert.equal(r.out, rec(job === 'code' ? 'code.ui' : job), `${JSON.stringify(broken)} ${job}`);
      assert.match(r.err, /\S/, `${JSON.stringify(broken)} ${job}: a reason`);
      assert.doesNotMatch(r.err, /TypeError|at file:/);
    }
  }
  for (const odd of ['[]', 'null', '12', '"x"', 'true']) {
    m.put(odd);
    const r = m.forJob('code.ui');
    assert.equal(r.status, 0, odd);
    assert.equal(r.out, 'sonnet:high', odd);
    assert.doesNotMatch(r.err, /TypeError|at file:/, odd);
  }
});

test('AC-62.2 an unknown key under tasks is ignored by --for, survives --set and --reset of another job, and --show lists it', T, (t) => {
  const m = mk(t);
  m.put({ tasks: { 'code.nope': 'opus:high', 'code.ui': 'opus:xhigh', 'x.y': { a: 1 } } });
  assert.equal(m.forJob('code.ui').out, 'opus:xhigh');
  assert.equal(m.forJob('code.feature').out, 'sonnet:high', 'an unknown key moves no known job');
  let show = m.run('--show');
  assert.equal(show.status, 0, show.stderr);
  assert.match(show.stdout, /^code\.nope: .*\(unknown job, ignored\)$/m);
  assert.match(show.stdout, /^x\.y: .*\(unknown job, ignored\)$/m, 'a value that is not text does not crash --show');
  assert.doesNotMatch(show.stderr, /TypeError|at file:/);
  assert.equal(m.run('--set', 'code.simple=haiku:low').status, 0);
  assert.equal(m.saved().tasks['code.nope'], 'opus:high', 'survives --set');
  assert.deepEqual(m.saved().tasks['x.y'], { a: 1 });
  assert.equal(m.run('--reset', 'code.ui').status, 0);
  assert.equal(m.saved().tasks['code.nope'], 'opus:high', 'survives --reset');
  assert.deepEqual(m.saved().tasks['x.y'], { a: 1 });
  assert.equal(m.saved().tasks['code.simple'], 'haiku:low');
  assert.equal(m.saved().tasks['code.ui'], undefined, 'the reset job is gone');
  show = m.run('--show');
  assert.match(show.stdout, /^code\.nope: .*\(unknown job, ignored\)$/m);
  assert.doesNotMatch(show.stdout, /^code\.ui: /m);
});

test('AC-62.2 ATTACK: --set of an unknown job is refused with exit 1 and writes nothing', T, (t) => {
  const bad = ['code.nope=sonnet:high', '__proto__=sonnet:low', 'tasks=sonnet:low', 'constructor=sonnet:low', 'prototype=sonnet:low', 'toString=sonnet:low', 'acknowledged=sonnet:low', 'code.=sonnet:low', '.ui=sonnet:low', 'board.=sonnet:low', '__proto__.x=sonnet:low'];
  const m = mk(t);
  for (const pair of bad) {
    const r = m.run('--set', pair);
    assert.equal(r.status, 1, pair);
    assert.match(r.stderr, /Invalid/, pair);
    assert.equal(m.has(), false, `nothing written: ${pair}`);
  }
  const mixed = m.run('--set', 'code.ui=opus:high', 'code.nope=sonnet:high');
  assert.equal(mixed.status, 1);
  assert.equal(m.has(), false, 'one bad pair stops the whole call');
  assert.equal(m.run('--set', 'code.ui=opus:xhigh').status, 0);
  const before = m.bytes();
  for (const pair of bad) assert.equal(m.run('--set', pair).status, 1, pair);
  assert.equal(m.bytes(), before, 'a refused --set leaves the file as it was');
  assert.equal(({}).polluted, undefined, 'no prototype pollution');
});

test('AC-62.2 ATTACK: --for with an unknown job exits 1 and names the valid jobs; __proto__ and constructor too', T, (t) => {
  const m = mk(t);
  for (const job of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'code.nope', 'tasks', 'acknowledged', '', 'CODE.UI ', 'none']) {
    const r = m.run('--for', job);
    assert.equal(r.status, 1, JSON.stringify(job));
    assert.doesNotMatch(r.stderr, /TypeError|at file:/, JSON.stringify(job));
    assert.equal(r.stdout.trim(), '', `${JSON.stringify(job)}: nothing on stdout`);
  }
  const r = m.run('--for', 'code.nope');
  for (const valid of ['code.ui', 'board.commit', 'plan.task', 'main']) assert.ok(r.stderr.includes(valid), `stderr names ${valid}`);
  assert.equal(m.run('--for').status, 1, 'no job at all');
});

test('AC-62.2 a tasks value that is not an object (string, array, number, null) does not crash --for, --show or --set', T, (t) => {
  const m = mk(t);
  for (const tasks of ['oops', ['code.ui'], 7, null, true]) {
    m.put({ code: 'haiku:medium', tasks });
    const label = JSON.stringify(tasks);
    const f = m.forJob('code.ui');
    assert.equal(f.status, 0, label);
    assert.equal(f.out, 'haiku:medium', label);
    assert.doesNotMatch(f.err, /TypeError|at file:/, label);
    const s = m.run('--show');
    assert.equal(s.status, 0, `${label} ${s.stderr}`);
    assert.doesNotMatch(s.stderr, /TypeError|at file:/, label);
    assert.match(s.stdout, /^code: haiku \/ medium/m, `${label}: the role lines stay`);
    m.put({ code: 'haiku:medium', tasks });
    const set = m.run('--set', 'code.ui=opus:high');
    assert.equal(set.status, 0, `${label} ${set.stderr}`);
    assert.deepEqual(m.saved().tasks, { 'code.ui': 'opus:high' }, label);
    assert.equal(m.saved().code, 'haiku:medium', label);
    m.put({ code: 'haiku:medium', tasks });
    const reset = m.run('--reset', 'code.ui');
    assert.doesNotMatch(reset.stderr, /TypeError|at file:/, label);
    assert.notEqual(reset.status, null, label);
  }
});

// 3.64.0: any job may take an outside model, as long as its provider has a key. Without a key the value is invalid, and a hand-edited one is skipped.
const ANY_JOB = ['review.code', 'review.security', 'board.qa', 'board.commit', 'board.default', 'findings.tech', 'findings.default', 'plan.task', 'plan.text', 'main', 'review', 'plan', 'code.ui', 'code.simple', 'test.critical', 'test.adversarial', 'docs.report', 'docs.research', 'code', 'test', 'docs'];

test('AC-62.2 ATTACK: an external value with no key for its provider is refused on every job, and a hand-edited one is skipped with a reason', T, (t) => {
  const m = mk(t);
  for (const job of ANY_JOB) {
    const r = m.run('--set', `${job}=${EXT}`);
    assert.equal(r.status, 1, `${job}: no key yet`);
    assert.match(r.stderr, /Invalid/, job);
    assert.doesNotMatch(r.stderr, /TypeError|at file:/, job);
    assert.equal(m.has(), false, `nothing written: ${job}`);
  }
  assert.equal(fs.existsSync(m.localFile), false, 'main was not applied to the session either');
  // The same by hand edit: the link is skipped with the missing key as the reason, the next one is used
  m.put({ review: 'haiku:medium', tasks: { 'review.code': EXT, 'board.qa': EXT, 'findings.tech': EXT, 'plan.task': EXT, 'code.ui': EXT } });
  for (const [job, want] of [['review.code', 'haiku:medium'], ['board.qa', 'haiku:medium'], ['findings.tech', 'haiku:medium'], ['plan.task', 'opus:high'], ['code.ui', 'sonnet:high']]) {
    const r = m.forJob(job);
    assert.equal(r.status, 0, job);
    assert.equal(r.out, want, job);
    assert.match(r.err, new RegExp(job.replace('.', '\\.')), job);
    assert.match(r.err, /no key for openrouter/, job);
  }
  m.put({ tasks: { main: EXT } });
  assert.equal(m.forJob('main').out, 'opus:high');
  m.put({ review: EXT, plan: EXT });
  assert.equal(m.forJob('review.code').out, 'sonnet:high');
  assert.equal(m.forJob('plan.task').out, 'opus:high');
});

test('AC-62.2 with a key, an external value is accepted on any job, main and the review and board jobs too, and each prints the command that runs it', T, async (t) => {
  const m = mk(t);
  await m.key();
  for (const job of ANY_JOB) {
    const r = m.run('--set', `${job}=${EXT}`);
    assert.equal(r.status, 0, `${job} ${r.stderr}`);
  }
  assert.equal(m.saved().tasks['code.ui'], EXT);
  assert.equal(m.saved().tasks['test.critical'], EXT);
  assert.equal(m.saved().tasks['docs.report'], EXT);
  assert.equal(m.saved().tasks['review.code'], EXT);
  assert.equal(m.saved().tasks.main, EXT);
  assert.equal(m.saved().review, EXT);
  assert.equal(fs.existsSync(m.localFile), false, 'an outside main leaves settings.local.json alone: the session is opened by run-session.mjs');
  for (const job of ['review.code', 'board.qa', 'plan.task', 'findings.tech']) assert.match(m.forJob(job).out, new RegExp(`^openrouter/x/y:high .*run-role\\.mjs ${job.replace('.', '\\.')}(\\s|$)`), job);
  const main = m.forJob('main');
  assert.equal(main.lines, 1);
  assert.match(main.out, /^openrouter\/x\/y:high .*run-session\.mjs$/);
  assert.doesNotMatch(main.out, /run-role/);
  // Another provider name, with no key, is still not valid
  assert.equal(m.run('--set', 'code.ui=other/x/y:high').status, 1);
  assert.equal(m.run('--set', 'code.ui=Openrouter/x/y:high').status, 1, 'a provider name is lower case');
  assert.equal(m.run('--set', 'code.ui=con/x/y:high').status, 1, 'a reserved name');
});

test('AC-62.2 ATTACK: the destructive guard asks for an external --set and leaves --for, --reset and a plain --set alone', T, async () => {
  const { evaluate, permissionEquivalent } = await load('destructive-guard.mjs');
  for (const ctx of [{}, { tool: 'claude', agent: '' }, { tool: 'claude', agent: 'test-writer' }]) {
    assert.equal(evaluate('node .claude/hooks/models.mjs --set code.ui=openrouter/x/y:high', ctx)?.decision, 'ask', JSON.stringify(ctx));
    assert.equal(evaluate('node .claude/hooks/models.mjs --set code.ui=opus:high board.qa=sonnet:low code.simple=openrouter/x/y:high', ctx)?.decision, 'ask', 'one external pair among plain ones');
    for (const c of ['node .claude/hooks/models.mjs --for code.ui', 'node .claude/hooks/models.mjs --reset code.ui', 'node .claude/hooks/models.mjs --set code.ui=opus:high', 'node .claude/hooks/models.mjs --set code.simple=main', 'node .claude/hooks/models.mjs --set main=sonnet:high', 'node .claude/hooks/models.mjs --for board.commit'])
      assert.equal(evaluate(c, ctx), null, `${c} ${JSON.stringify(ctx)}`);
  }
  for (const c of ['node .claude/hooks/models.mjs --for code.ui', 'node .claude/hooks/models.mjs --reset code.ui', 'node .claude/hooks/models.mjs --set code.ui=opus:high'])
    assert.equal(permissionEquivalent(c) ?? evaluate(c), null, `Codex/Antigravity: not asked either (${c})`);
});

test('AC-62.2 settings.json allows models.mjs --for and --reset', T, () => {
  const { allow } = JSON.parse(read('.claude/settings.json')).permissions;
  assert.ok(allow.includes('Bash(node .claude/hooks/models.mjs --for:*)'));
  assert.ok(allow.includes('Bash(node .claude/hooks/models.mjs --reset:*)'));
  assert.ok(allow.includes('Bash(node .claude/hooks/models.mjs --set:*)'), 'still there');
  assert.ok(allow.includes('Bash(node .claude/hooks/models.mjs --show)'), 'still there');
});

// ---- AC-62.3 ----

test('AC-62.3 build.md step 0b asks nothing: no AskUserQuestion, no --set, no two screens; one Model line from --for', T, () => {
  const build = read('.claude/commands/build.md');
  const step = build.split('\n').find((l) => /^0b\./.test(l));
  assert.ok(step, 'step 0b is still there');
  assert.doesNotMatch(step, /AskUserQuestion/);
  assert.doesNotMatch(step, /--set/);
  assert.doesNotMatch(step, /\btwo\b/i);
  assert.doesNotMatch(step, /screens?\b/i);
  assert.match(step, /models\.mjs --for/);
  assert.match(step, /Model: code\.critical → opus \/ high/, 'the one-line format');
  assert.doesNotMatch(build, /models\.mjs --set/, 'build.md saves no model choice');
});

test('AC-62.3 release.md step 0 and start.md step 0e no longer mention asking or two screens; no command says "two screens"', T, () => {
  const lineOf = (file, re) => read(file).split('\n').find((l) => re.test(l));
  const rel = lineOf('.claude/commands/release.md', /^0\./);
  const start = lineOf('.claude/commands/start.md', /^0e\./);
  // 3.63.0 (AC-63.20): start 0e asks one question (recommended setup or the panel), so only the two-screens wording stays forbidden there. Release stays strict.
  if (rel !== undefined) assert.doesNotMatch(rel, /\bask|screens?\b|AskUserQuestion/i, 'release step 0');
  if (start !== undefined) assert.doesNotMatch(start, /screens?\b/i, 'start step 0e');
  for (const c of ['build', 'release', 'start', 'adopt']) {
    const text = read(`.claude/commands/${c}.md`);
    assert.doesNotMatch(text, /two screens/i, c);
    assert.doesNotMatch(text, /models\.mjs --set/, `${c} saves no model choice`);
  }
});

test('AC-62.3 models.md no longer says the commands ask; the doc still lists the roles', T, () => {
  const doc = read('docs/workflow/models.md');
  assert.doesNotMatch(doc, /two screens/i);
  assert.doesNotMatch(doc, /`\/build` asks/);
  assert.doesNotMatch(doc, /asks? one question per role/i);
  assert.doesNotMatch(doc, /AskUserQuestion/);
  for (const r of ['plan', 'code', 'review', 'test', 'docs']) assert.match(doc, new RegExp('`' + r + '`'), r);
});

// ---- AC-62.4 ----

// File -> text its subagent line must carry (the convention: the line that starts a subagent contains `--for <job>`)
const CALLS = {
  '.claude/commands/build.md': ['--for test.', '--for code.', '--for docs.changelog'],
  '.claude/commands/fix-bug.md': ['--for test.', '--for code.bugfix'],
  '.claude/commands/release.md': ['--for review.security'],
  '.claude/commands/review-changes.md': ['--for review.code', '--for review.security'],
  '.claude/commands/findings-all.md': ['--for findings.<type>'],
  '.claude/findings/protocol.md': ['--for findings.<type>'],
  '.claude/commands/research.md': ['--for docs.research'],
  '.claude/commands/user-feedback.md': ['--for board.product'],
  '.claude/commands/plan-task.md': ['--for plan.'],
  '.claude/board/rules.md': ['--for board.<member>', '--for board.commit', '--for review.code', '--for review.security'],
  '.claude/board/council.md': ['--for board.<member>'],
};
// Files that match the subagent pattern but are not a call site: commands/models.md says an external role runs "not with the Agent tool"
const NOT_A_CALL = ['.claude/commands/models.md'];
const SUBAGENT = /Agent tool|\b(run|start)\b[^.]*\b(subagent|sub-agent)\b/i;

test('AC-62.4 every subagent call names its job with --for <job>', T, () => {
  for (const [file, tokens] of Object.entries(CALLS)) {
    const text = read(file);
    for (const token of tokens) assert.ok(text.includes(token), `${file} has "${token}"`);
  }
});

test('AC-62.4 every --for in the commands, the board and the findings names a real job (or a pattern of jobs)', T, () => {
  for (const file of Object.keys(CALLS)) {
    for (const [, raw] of read(file).matchAll(/--for\s+([\w.<>-]+)/g)) {
      const token = raw.replace(/<[^>]+>/g, '@');
      const re = new RegExp('^' + token.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/@/g, '[a-z]+') + '$');
      const ok = ALL_JOBS.some((j) => re.test(j) || (token.endsWith('.') && (j.startsWith(token) || j === token.slice(0, -1))));
      assert.ok(ok, `${file}: "--for ${raw}" is not a job`);
    }
  }
});

test('AC-62.4 sweep: a file that starts a subagent is in the table or on the not-a-call list, so a new call site fails here', T, () => {
  const files = [
    ...['.claude/commands', '.claude/board', '.claude/findings'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.md')).map((f) => `${d}/${f}`)),
  ];
  assert.ok(files.length > 30, 'the sweep found the files');
  const unlisted = files.filter((f) => read(f).split('\n').some((l) => SUBAGENT.test(l)) && !Object.hasOwn(CALLS, f) && !NOT_A_CALL.includes(f));
  assert.deepEqual(unlisted, [], 'add the call to CALLS (with its --for) or, if it is not a call, to NOT_A_CALL');
  for (const f of NOT_A_CALL) assert.ok(read(f).split('\n').some((l) => SUBAGENT.test(l)), `${f} no longer matches: remove it from NOT_A_CALL`);
});

test('AC-62.4 models.md lists every job key', T, () => {
  const doc = read('docs/workflow/models.md');
  assert.deepEqual(ALL_JOBS.filter((k) => !doc.includes('`' + k + '`')), []);
});

// ---- AC-62.5 ----

test('AC-62.5 max effort: accepted on code and board.qa, refused on main and on an external value', T, async (t) => {
  const m = mk(t);
  const ok = m.run('--set', 'code=sonnet:max', 'board.qa=opus:max');
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(m.forJob('code').out, 'sonnet:max');
  assert.equal(m.forJob('code.ui').out, 'sonnet:max');
  assert.equal(m.forJob('board.qa').out, 'opus:max');
  assert.equal(m.run('--set', 'plan=opus:max', 'code.ui=haiku:max').status, 0, 'any role and job but main');
  const before = m.bytes();
  for (const bad of ['main=opus:max', 'main=sonnet:max', 'main=haiku:max']) {
    const r = m.run('--set', bad);
    assert.equal(r.status, 1, bad);
    assert.match(r.stderr, /Invalid/, bad);
  }
  assert.equal(m.bytes(), before, 'a refused --set writes nothing');
  assert.equal(fs.existsSync(m.localFile), false, 'main was not applied to the session');
  await m.key();
  for (const bad of ['code=openrouter/x/y:max', 'code.ui=openrouter/x/y:max', 'test=openrouter/x/y:max', 'docs.report=openrouter/x/y:max']) {
    const r = m.run('--set', bad);
    assert.equal(r.status, 1, bad);
    assert.equal(m.bytes(), before, bad);
  }
});

test('AC-62.5 plan=opus:max and no choice for main: --for main skips that link and gives the recommended plan value, with a reason', T, (t) => {
  const m = mk(t);
  assert.equal(m.run('--set', 'plan=opus:max').status, 0);
  assert.equal(m.forJob('plan').out, 'opus:max');
  assert.equal(m.forJob('plan.task').out, 'opus:max');
  const r = m.forJob('main');
  assert.equal(r.status, 0);
  assert.equal(r.out, 'opus:high');
  assert.match(r.err, /main|plan/);
  assert.match(r.err, /max/i);
  // A hand-edited main=opus:max is skipped as well
  m.put({ plan: 'sonnet:medium', tasks: { main: 'opus:max' } });
  const h = m.forJob('main');
  assert.equal(h.out, 'sonnet:medium', 'the next link is plan');
  assert.match(h.err, /main/);
  m.put({ plan: 'opus:max', tasks: { main: 'sonnet:low' } });
  assert.equal(m.forJob('main').out, 'sonnet:low', 'main with its own choice does not need plan');
});

// ---- AC-62.6 ----

test('AC-62.6 a role change moves the jobs that follow it, not the ones with their own choice; --reset follows the chain again', T, (t) => {
  const m = mk(t);
  assert.equal(m.run('--set', 'code.ui=opus:xhigh').status, 0);
  assert.equal(m.run('--set', 'code=haiku:medium').status, 0);
  assert.equal(m.forJob('code.feature').out, 'haiku:medium');
  assert.equal(m.forJob('code.ui').out, 'opus:xhigh');
  assert.equal(m.forJob('code').out, 'haiku:medium');
  const reset = m.run('--reset', 'code.ui');
  assert.equal(reset.status, 0, reset.stderr);
  assert.equal(m.forJob('code.ui').out, 'haiku:medium', 'follows the role again');
  assert.equal(m.saved().tasks?.['code.ui'], undefined, 'the saved choice is gone from the file');
  const resetRole = m.run('--reset', 'code');
  assert.equal(resetRole.status, 0, resetRole.stderr);
  assert.equal(m.forJob('code').out, 'sonnet:high', 'the role is back to recommended');
  assert.equal(m.forJob('code.feature').out, 'sonnet:high');
  assert.equal(Object.hasOwn(m.saved(), 'code'), false, 'the role key is gone from the file');
});

test('AC-62.6 review does not reach board.commit; a job --set changes only that job', T, (t) => {
  const m = mk(t);
  assert.equal(m.run('--set', 'review=opus:high').status, 0);
  assert.equal(m.forJob('board.commit').out, 'haiku:low');
  assert.equal(m.forJob('board.qa').out, 'opus:high');
  assert.equal(m.forJob('review.code').out, 'opus:high');
  assert.equal(m.forJob('findings.tech').out, 'opus:high');
  assert.equal(m.run('--set', 'board.commit=sonnet:low').status, 0);
  assert.equal(m.forJob('board.commit').out, 'sonnet:low');
  assert.equal(m.forJob('board.qa').out, 'opus:high');
  assert.equal(m.forJob('review').out, 'opus:high');
  assert.equal(m.run('--reset', 'board.commit').status, 0);
  assert.equal(m.forJob('board.commit').out, 'haiku:low');
});

test('AC-62.6 --set of one job on an empty project does not freeze the roles', T, (t) => {
  const m = mk(t);
  const r = m.run('--set', 'code.ui=opus:xhigh');
  assert.equal(r.status, 0, r.stderr);
  const file = m.saved();
  for (const role of ['plan', 'code', 'test', 'review', 'docs']) assert.equal(Object.hasOwn(file, role), false, `no ${role} key`);
  assert.deepEqual(file.tasks, { 'code.ui': 'opus:xhigh' });
  assert.equal(m.run('--set', 'board.qa=haiku:low', 'main=sonnet:high').status, 0);
  for (const role of ['plan', 'code', 'test', 'review', 'docs']) assert.equal(Object.hasOwn(m.saved(), role), false, `still no ${role} key`);
  assert.equal(m.forJob('plan.task').out, 'opus:high', 'roles still follow the recommended value, which can change with the kit');
});

test('AC-62.6 acknowledged and other unknown top-level fields survive --set and --reset', T, (t) => {
  const m = mk(t);
  const extra = { acknowledged: { review: '2026-11-02' }, custom: { a: [1, 2], b: 'İıŞş' }, note: 'keep' };
  m.put({ ...extra, code: 'haiku:low', tasks: { 'code.ui': 'opus:xhigh', 'board.qa': 'sonnet:low' } });
  for (const args of [['--set', 'code.feature=opus:high'], ['--set', 'docs=sonnet:low'], ['--reset', 'code.ui'], ['--reset', 'code'], ['--set', 'code.simple=main']]) {
    const r = m.run(...args);
    assert.equal(r.status, 0, `${args.join(' ')} ${r.stderr}`);
    const file = m.saved();
    for (const [k, v] of Object.entries(extra)) assert.deepEqual(file[k], v, `${k} after ${args.join(' ')}`);
  }
  assert.equal(m.saved().tasks['board.qa'], 'sonnet:low', 'other jobs stay');
});

test('AC-62.6 readModels(file) still returns only the five roles', T, async (t) => {
  const { readModels, RECOMMENDED, ROLES } = await load('models.mjs');
  const m = mk(t);
  m.put({ code: 'haiku:medium', acknowledged: { review: '2026-11-02' }, tasks: { 'code.ui': 'opus:xhigh', 'board.commit': 'sonnet:low', main: 'sonnet:high' } });
  const models = readModels(m.modelsFile);
  assert.deepEqual(Object.keys(models).sort(), Object.keys(ROLES).sort());
  assert.deepEqual(Object.keys(models).sort(), ['code', 'docs', 'plan', 'review', 'test']);
  assert.deepEqual(models, { ...RECOMMENDED, code: 'haiku:medium' });
});

test('AC-62.6 --show keeps the role lines and adds one line per saved job', T, (t) => {
  const m = mk(t);
  m.put({ code: 'haiku:medium', tasks: { 'code.ui': 'opus:xhigh', 'board.commit': 'sonnet:low' } });
  const show = m.run('--show');
  assert.equal(show.status, 0, show.stderr);
  assert.match(show.stdout, /^plan: opus \/ high \(Planning and architecture\)$/m);
  assert.match(show.stdout, /^code: haiku \/ medium \(Writing code\) · recommended sonnet \/ high$/m);
  assert.match(show.stdout, /^code\.ui: opus \/ xhigh \(custom\)$/m);
  assert.match(show.stdout, /^board\.commit: sonnet \/ low \(custom\)$/m);
  assert.doesNotMatch(show.stdout, /^code\.feature: /m, 'a job without a saved choice adds no line');
});

// ---- AC-62.7 ----

test('AC-62.7 code.simple prints main when it equals what the main session uses, and the value when it differs', T, (t) => {
  const m = mk(t);
  assert.equal(m.forJob('code.simple').out, 'sonnet:high', 'recommended state: sonnet:high against opus:high');
  assert.equal(m.forJob('code.feature').out, 'sonnet:high');
  m.put({ code: 'opus:high' });
  assert.equal(m.forJob('code.simple').out, 'main', 'opus:high equals the recommended plan value');
  assert.equal(m.forJob('code').out, 'opus:high', 'the role itself prints the value, never main');
  assert.equal(m.forJob('code.feature').out, 'opus:high', 'no other job prints main');
  m.put({ code: 'opus:low' });
  assert.equal(m.forJob('code.simple').out, 'opus:low', 'same model, other effort: not main');
  m.put({ code: 'sonnet:high', plan: 'sonnet:high' });
  assert.equal(m.forJob('code.simple').out, 'main', 'main follows plan');
  m.put({ code: 'sonnet:high', tasks: { main: 'sonnet:high' } });
  assert.equal(m.forJob('code.simple').out, 'main', 'main has a choice of its own');
  m.put({ code: 'sonnet:high', plan: 'sonnet:high', tasks: { main: 'haiku:low' } });
  assert.equal(m.forJob('code.simple').out, 'sonnet:high', 'main moved away');
  m.put({ tasks: { 'code.simple': 'opus:high' } });
  assert.equal(m.forJob('code.simple').out, 'main', 'its own value equals main too');
});

test('AC-62.7 code.simple=main is saved and prints main whatever the role says', T, (t) => {
  const m = mk(t);
  const r = m.run('--set', 'code.simple=main');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(m.saved().tasks['code.simple'], 'main');
  assert.equal(m.forJob('code.simple').out, 'main');
  assert.equal(m.run('--set', 'code=haiku:low').status, 0);
  assert.equal(m.forJob('code.simple').out, 'main');
  assert.equal(m.forJob('code.feature').out, 'haiku:low');
  assert.equal(m.run('--reset', 'code.simple').status, 0);
  assert.equal(m.forJob('code.simple').out, 'haiku:low');
});

test('AC-62.7 ATTACK: no other job accepts the main value; a hand-edited one is skipped', T, (t) => {
  const m = mk(t);
  for (const bad of ['code.feature=main', 'test.simple=main', 'plan=main', 'main=main', 'code=main', 'test=main', 'review=main', 'docs=main', 'board.qa=main', 'code.ui=main', 'MAIN=main']) {
    const r = m.run('--set', bad);
    assert.equal(r.status, 1, bad);
    assert.match(r.stderr, /Invalid/, bad);
    assert.equal(m.has(), false, `nothing written: ${bad}`);
  }
  m.put({ tasks: { 'code.feature': 'main', 'test.simple': 'main', 'board.qa': 'main' }, plan: 'main', code: 'main' });
  for (const job of ['code.feature', 'test.simple', 'board.qa', 'plan', 'code', 'main']) {
    const r = m.forJob(job);
    assert.equal(r.status, 0, job);
    assert.equal(r.out, rec(job === 'code' || job === 'code.feature' ? 'code.ui' : job === 'plan' ? 'plan.task' : job === 'test.simple' ? 'test.feature' : job), job);
    assert.doesNotMatch(r.out, /main/, `${job} never prints main`);
  }
});

test('AC-62.7 an external value on code.simple never prints main', T, async (t) => {
  const m = mk(t);
  await m.key();
  assert.equal(m.run('--set', `code.simple=${EXT}`).status, 0);
  const r = m.forJob('code.simple');
  assert.equal(r.status, 0);
  assert.match(r.out, /^openrouter\/x\/y:high .*run-role\.mjs code\.simple(\s|$)/);
  assert.notEqual(r.out, 'main');
  m.put({ code: EXT });
  assert.match(m.forJob('code.simple').out, /^openrouter\/x\/y:high .*run-role\.mjs code\.simple(\s|$)/, 'following an external role');
});

// ---- AC-62.8 ----

const AGENTS_FIXTURE = '# Fixture\n\n## Commands\n\n```bash\ntest:        npm test\n```\n';
// The claude call is recorded by the fake-vault preload (KIT_TEST_SPY) and never run; the key comes from a vault folder of this project
async function roleProject(t, models) {
  const { setLimit } = await load('providers.mjs');
  const root = tmpDir(t, 'mj-run-');
  const home = tmpDir(t, 'mj-run-home-');
  const vault = tmpDir(t, 'mj-run-vault-');
  const bin = tmpDir(t, 'mj-run-bin-');
  makeFakeClaude(bin);
  fs.cpSync(HOOKS, path.join(root, '.claude', 'hooks'), { recursive: true });
  fs.cpSync(path.join(ROOT, '.claude', 'agents'), path.join(root, '.claude', 'agents'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, '.claude', 'settings.json'), path.join(root, '.claude', 'settings.json'));
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  write(path.join(root, 'AGENTS.md'), AGENTS_FIXTURE);
  write(path.join(root, 'p.md'), 'PROMPT-MARKER do the task\n');
  write(path.join(root, '.claude', 'state', 'models.json'), JSON.stringify(models));
  const store = storeOf(home);
  fs.mkdirSync(path.dirname(store), { recursive: true });
  await seedKey(vault, store);
  setLimit('openrouter', 5, store);
  const spy = path.join(home, 'spy.jsonl');
  const run = (...args) => {
    fs.rmSync(spy, { force: true });
    const env = { ...cleanEnv(), HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: root, KIT_TEST_VAULT_DIR: vault, KIT_TEST_SPY: spy };
    const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
    env[pathKey] = [bin, path.dirname(process.execPath), env[pathKey] ?? ''].join(path.delimiter);
    const r = spawnSync(process.execPath, ['--import', FAKE_VAULT_URL, path.join(root, '.claude', 'hooks', 'run-role.mjs'), ...args], { cwd: root, encoding: 'utf8', timeout: 45000, env });
    const spied = fs.existsSync(spy) ? fs.readFileSync(spy, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, spawned: spied.filter((x) => x.kind === 'program' && x.name === 'claude'), net: spied.filter((x) => x.kind === 'net') };
  };
  const logFile = path.join(root, '.claude', 'state', 'role-runs.jsonl');
  const log = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  return { root, run, log, logFile };
}
const argAfter = (args, flag) => args[args.indexOf(flag) + 1];

test('AC-62.8 run-role with a job that has an external value runs like the code role, with that model, and logs job and role', T, async (t) => {
  const p = await roleProject(t, { code: 'haiku:medium', tasks: { 'code.ui': MODEL_VALUE } });
  const r = p.run('code.ui', 'p.md');
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.equal(r.spawned.length, 1, 'claude spawned once');
  const child = r.spawned[0];
  assert.equal(argAfter(child.args, '--model'), MODEL);
  assert.equal(child.args.includes('--agent'), false, 'a code run has no test-writer agent');
  assert.equal(child.env.ANTHROPIC_MODEL, MODEL);
  assert.equal(child.env.CLAUDE_CODE_EFFORT_LEVEL, 'high');
  assert.ok(child.args.some((a) => /PROMPT-MARKER/.test(a)), 'the prompt reaches the child');
  const rows = p.log();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].job, 'code.ui');
  assert.equal(rows[0].role, 'code');
  assert.equal(rows[0].model, MODEL);
  assert.equal(rows[0].provider, 'openrouter');
  assert.equal(rows[0].exit, 0);
});

test('AC-62.8 the role comes from the job: test.* runs the test-writer agent, docs.* has no Bash', T, async (t) => {
  const p = await roleProject(t, { tasks: { 'test.critical': MODEL_VALUE, 'docs.report': MODEL_VALUE } });
  const test = p.run('test.critical', 'p.md');
  assert.equal(test.status, 0, `${test.stdout}\n${test.stderr}`);
  assert.equal(test.spawned.length, 1);
  assert.equal(argAfter(test.spawned[0].args, '--agent'), 'test-writer');
  const docs = p.run('docs.report', 'p.md');
  assert.equal(docs.status, 0, `${docs.stdout}\n${docs.stderr}`);
  assert.equal(docs.spawned.length, 1);
  assert.equal(docs.spawned[0].args.includes('--agent'), false);
  const disallowed = docs.spawned[0].args.slice(docs.spawned[0].args.indexOf('--disallowedTools') + 1, docs.spawned[0].args.indexOf('--allowedTools'));
  assert.equal(disallowed.includes('Bash'), true, 'the docs role keeps Bash off');
  const rows = p.log();
  assert.deepEqual(rows.map((x) => [x.job, x.role]), [['test.critical', 'test'], ['docs.report', 'docs']]);
});

test('AC-62.8 a role argument works as today; the log row carries the role as the job; a job that follows an external role runs it', T, async (t) => {
  const p = await roleProject(t, { code: MODEL_VALUE });
  const byRole = p.run('code', 'p.md');
  assert.equal(byRole.status, 0, `${byRole.stdout}\n${byRole.stderr}`);
  assert.equal(byRole.spawned.length, 1);
  assert.equal(argAfter(byRole.spawned[0].args, '--model'), MODEL);
  const byJob = p.run('code.feature', 'p.md');
  assert.equal(byJob.status, 0, `${byJob.stdout}\n${byJob.stderr}`);
  assert.equal(byJob.spawned.length, 1, 'code.feature follows the code role');
  assert.equal(argAfter(byJob.spawned[0].args, '--model'), MODEL);
  assert.deepEqual(p.log().map((x) => [x.job, x.role]), [['code', 'code'], ['code.feature', 'code']]);
});

test('AC-62.8 a job with no external value fails with the existing kind of message and runs nothing', T, async (t) => {
  const p = await roleProject(t, { code: 'sonnet:high', tasks: { 'code.ui': 'opus:xhigh' } });
  for (const job of ['code.ui', 'code.feature', 'code', 'test.simple', 'docs.scan']) {
    const r = p.run(job, 'p.md');
    assert.notEqual(r.status, 0, job);
    assert.equal(r.status === null, false, job);
    assert.match(r.stdout + r.stderr, /no external model/, job);
    assert.doesNotMatch(r.stderr, /ERR_MODULE_NOT_FOUND|TypeError|at file:/, job);
    assert.deepEqual(r.spawned, [], `${job}: no child`);
  }
  assert.deepEqual(p.log(), [], 'a refused run leaves no log row');
});

test('AC-62.8 ATTACK: main is not a role run, and unknown jobs are refused, even with an external value saved for main', T, async (t) => {
  const p = await roleProject(t, { review: MODEL_VALUE, plan: MODEL_VALUE, tasks: { main: MODEL_VALUE } });
  for (const job of ['main', 'code.nope', '__proto__', 'constructor', 'tasks', 'acknowledged', 'CODE.UI', '']) {
    const r = p.run(job, 'p.md');
    assert.notEqual(r.status, 0, job);
    assert.equal(r.status === null, false, job);
    assert.match(r.stdout + r.stderr, /\S/, `${job}: says why`);
    assert.doesNotMatch(r.stderr, /ERR_MODULE_NOT_FOUND|TypeError|at file:/, job);
    assert.deepEqual(r.spawned, [], `${job}: no child`);
    assert.deepEqual(r.net, [], `${job}: nothing sent`);
  }
  assert.match(p.run('main', 'p.md').stderr, /run-session\.mjs/, 'main points to the session command');
  assert.deepEqual(p.log(), []);
});

test('AC-62.8 plan, review, board and findings jobs run on an external value, with read tools only: no Write, Edit or Bash', T, async (t) => {
  const p = await roleProject(t, { plan: MODEL_VALUE, review: MODEL_VALUE, tasks: { 'board.qa': MODEL_VALUE } });
  const expected = [['plan.task', 'plan'], ['plan', 'plan'], ['review.code', 'review'], ['review', 'review'], ['board.qa', 'review'], ['findings.tech', 'review']];
  for (const [job] of expected) {
    const r = p.run(job, 'p.md');
    assert.equal(r.status, 0, `${job} ${r.stdout}\n${r.stderr}`);
    assert.equal(r.spawned.length, 1, job);
    const args = r.spawned[0].args;
    assert.equal(argAfter(args, '--model'), MODEL, job);
    const disallowed = args.slice(args.indexOf('--disallowedTools') + 1, args.indexOf('--allowedTools'));
    const allowed = args.slice(args.indexOf('--allowedTools') + 1, args.indexOf('--'));
    for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'Agent']) assert.equal(disallowed.includes(tool), true, `${job}: ${tool} is off`);
    assert.deepEqual(allowed, ['Read(./**)'], job);
  }
  assert.deepEqual(p.log().map((x) => [x.job, x.role]), expected);
});

// ---- AC-62.9 ----

test('AC-62.9 --set main=sonnet:high writes model and effortLevel to settings.local.json and keeps the other keys', T, (t) => {
  const m = mk(t);
  const others = { permissions: { allow: ['Bash(ls)'] }, enabledPlugins: { 'a@b': true }, model: 'opus', effortLevel: 'low', note: 'İıŞş' };
  write(m.localFile, JSON.stringify(others));
  const r = m.run('--set', 'main=sonnet:high');
  assert.equal(r.status, 0, r.stderr);
  const local = JSON.parse(fs.readFileSync(m.localFile, 'utf8'));
  assert.equal(local.model, 'sonnet');
  assert.equal(local.effortLevel, 'high');
  assert.deepEqual({ ...local, model: undefined, effortLevel: undefined }, { ...others, model: undefined, effortLevel: undefined });
  assert.equal(m.forJob('main').out, 'sonnet:high');
  assert.equal(m.run('--set', 'main=opus:xhigh').status, 0);
  const again = JSON.parse(fs.readFileSync(m.localFile, 'utf8'));
  assert.equal(again.model, 'opus');
  assert.equal(again.effortLevel, 'xhigh');
  assert.deepEqual(again.permissions, others.permissions);
});

test('AC-62.9 --set main=… with no settings.local.json creates it with the two keys', T, (t) => {
  const m = mk(t);
  const r = m.run('--set', 'main=haiku:medium');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(m.localFile, 'utf8')), { model: 'haiku', effortLevel: 'medium' });
});

test('AC-62.9 ATTACK: broken JSON in settings.local.json: --set main=… exits 1 and changes neither file', T, (t) => {
  const m = mk(t);
  write(m.localFile, '{"model":');
  let r = m.run('--set', 'main=sonnet:high');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\S/);
  assert.equal(fs.readFileSync(m.localFile, 'utf8'), '{"model":', 'settings.local.json untouched');
  assert.equal(m.has(), false, 'models.json not written');
  m.put({ code: 'haiku:low', tasks: { 'code.ui': 'opus:high' } });
  const before = m.bytes();
  r = m.run('--set', 'main=sonnet:high');
  assert.equal(r.status, 1);
  assert.equal(m.bytes(), before, 'models.json untouched');
  assert.equal(fs.readFileSync(m.localFile, 'utf8'), '{"model":');
  r = m.run('--set', 'code.ui=sonnet:low', 'main=sonnet:high');
  assert.equal(r.status, 1, 'main among other pairs');
  assert.equal(m.bytes(), before, 'the other pair is not written either');
  r = m.run('--set', 'code=haiku:medium');
  assert.equal(r.status, 0, `a --set without main does not care: ${r.stderr}`);
  assert.equal(fs.readFileSync(m.localFile, 'utf8'), '{"model":', 'still untouched');
});

test('AC-62.9 --reset main removes model and effortLevel and keeps the others', T, (t) => {
  const m = mk(t);
  const others = { permissions: { allow: ['Bash(ls)'] }, enabledPlugins: { 'a@b': true } };
  write(m.localFile, JSON.stringify(others));
  assert.equal(m.run('--set', 'main=sonnet:high').status, 0);
  assert.equal(m.forJob('main').out, 'sonnet:high');
  const r = m.run('--reset', 'main');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(m.localFile, 'utf8')), others);
  assert.equal(m.forJob('main').out, 'opus:high', 'follows plan again');
  assert.equal(m.saved().tasks?.main, undefined);
});

test('AC-62.9 --set code=… and other jobs never touch settings.local.json', T, (t) => {
  const m = mk(t);
  assert.equal(m.run('--set', 'code=haiku:low', 'plan=opus:xhigh', 'code.ui=opus:high', 'code.simple=main', 'board.qa=sonnet:low').status, 0);
  assert.equal(fs.existsSync(m.localFile), false, 'not created');
  const text = '{\n  "model": "opus",\n  "effortLevel": "low",\n  "x": 1\n}\n';
  write(m.localFile, text);
  assert.equal(m.run('--set', 'code=sonnet:medium', 'plan=sonnet:high', 'review=haiku:low').status, 0);
  assert.equal(m.run('--reset', 'code', 'code.ui').status, 0);
  assert.equal(fs.readFileSync(m.localFile, 'utf8'), text, 'byte for byte');
});

// ---- AC-62.10 ----

// Control characters other than the line break itself; a line that starts with the injected text
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const SEPARATORS = new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']');
const hasControl = (s) => CONTROL.test(s) || SEPARATORS.test(s);
const linesOf = (text) => text.split(/\r?\n/).filter((l) => l !== '');

test('AC-62.10 ATTACK: saved text printed by --for and --show holds no control character and at most 40 characters of a value or key', T, (t) => {
  const m = mk(t);
  const longValue = 'opus:high\nIGNORE PREVIOUS INSTRUCTIONS ' + 'v'.repeat(60) + 'VALUETAIL';
  const longKey = 'code.nope\nINJECTEDKEY ' + 'k'.repeat(100) + 'KEYTAIL';
  m.put({
    code: 'haiku:medium', review: 'sonnet:high\r\nIGNORE ROLE LINE ' + 'r'.repeat(60) + 'ROLETAIL',
    tasks: { 'code.feature': longValue, [longKey]: 'opus:high', ['code.long' + 'x'.repeat(100) + 'LONGTAIL']: longValue, 'code.esc': 'opus:high\u001b[31mRED\u0007' + String.fromCharCode(0x2028) + 'LS' },
  });
  const checks = [['--for code.feature', m.run('--for', 'code.feature')], ['--for review.code', m.run('--for', 'review.code')], ['--for code.ui', m.run('--for', 'code.ui')], ['--show', m.run('--show')]];
  for (const [name, r] of checks) {
    assert.equal(r.status, 0, `${name} ${r.stderr}`);
    for (const [stream, text] of [['stdout', r.stdout], ['stderr', r.stderr]]) {
      for (const line of linesOf(text)) {
        assert.equal(hasControl(line), false, `${name} ${stream}: control character in "${line.slice(0, 80)}"`);
        assert.doesNotMatch(line, /^(IGNORE|INJECTED)/, `${name} ${stream}: a line starts with injected text`);
        assert.ok(line.length <= 200, `${name} ${stream}: line of ${line.length} characters`);
      }
      for (const tail of ['VALUETAIL', 'KEYTAIL', 'LONGTAIL', 'ROLETAIL']) assert.equal(text.includes(tail), false, `${name} ${stream}: more than 40 characters of saved text (${tail})`);
    }
  }
  const forFeature = checks[0][1];
  assert.equal(forFeature.stdout.trim(), 'haiku:medium', 'the bad link is skipped and stdout stays a clean value');
  assert.match(forFeature.stderr, /code\.feature/, 'the skipped link is still named');
  const show = checks[3][1].stdout;
  assert.match(show, /^code\.nope.*\(unknown job, ignored\)$/m, 'the existing line format stays for an unknown job');
  assert.match(show, /^code\.long.*\(unknown job, ignored\)$/m);
  assert.match(show, /^plan: opus \/ high \(Planning and architecture\)$/m, 'the role lines stay');
});

// ---- AC-62.11 ----

test('AC-62.11 ATTACK: only a string is a valid value; a one-element array is skipped, not read as its text', T, async (t) => {
  const { readModels, customJobs, RECOMMENDED } = await load('models.mjs');
  const m = mk(t);
  m.put({ code: ['sonnet:high'], tasks: { 'code.ui': ['opus:high'], 'board.qa': 'opus:low' } });
  let r = m.forJob('code.ui');
  assert.equal(r.status, 0);
  assert.equal(r.out, 'sonnet:high', 'both links skipped: recommended');
  assert.equal(r.lines, 1);
  assert.match(r.err, /code\.ui/, 'the job link is named');
  assert.match(r.err, REASON);
  r = m.forJob('code');
  assert.equal(r.out, 'sonnet:high');
  assert.match(r.err, /\bcode\b/, 'the role link is named');
  assert.match(r.err, REASON);
  m.put({ code: 'haiku:medium', tasks: { 'code.ui': ['opus:high'] } });
  r = m.forJob('code.ui');
  assert.equal(r.out, 'haiku:medium', 'the array job link is skipped, the role link is used');
  assert.match(r.err, /code\.ui/);
  m.put({ code: ['haiku:medium'], tasks: { 'board.qa': ['opus:low'], main: ['opus:high'] } });
  assert.equal(m.forJob('board.qa').out, 'sonnet:high');
  assert.equal(m.forJob('main').out, 'opus:high');
  // The same through the exported functions
  m.put({ code: ['sonnet:high'], plan: ['haiku:low'], tasks: { 'code.ui': ['opus:high'], 'board.qa': 'opus:low' } });
  assert.equal(readModels(m.modelsFile).code, RECOMMENDED.code, 'readModels falls back to the recommended value');
  assert.equal(readModels(m.modelsFile).plan, RECOMMENDED.plan);
  m.put({ code: ['haiku:low'], tasks: { 'code.ui': ['opus:high'], 'board.qa': 'opus:low' } });
  assert.equal(readModels(m.modelsFile).code, 'sonnet:high', 'a different one-element array is not read as its text either');
  assert.equal(typeof customJobs, 'function', 'customJobs is exported');
  const listed = customJobs(m.modelsFile);
  const text = JSON.stringify(listed instanceof Map ? [...listed] : listed);
  assert.equal(text.includes('code.ui'), false, 'customJobs does not list the array value');
  assert.equal(text.includes('board.qa'), true, 'customJobs still lists a valid saved job');
  const show = m.run('--show').stdout;
  assert.doesNotMatch(show, /^code\.ui: .*\(custom\)/m);
  assert.match(show, /^board\.qa: opus \/ low \(custom\)$/m);
  assert.match(show, /^code: sonnet \/ high/m, 'the role line shows the recommended value');
});

// ---- AC-62.12 ----

test('AC-62.12 ATTACK: --reset main removes the two keys only when they match the saved main; a hand-set model stays', T, (t) => {
  const m = mk(t);
  const others = { permissions: { allow: ['Bash(ls)'] }, enabledPlugins: { 'a@b': true } };
  // The kit wrote them, the user changed the model by hand afterwards
  write(m.localFile, JSON.stringify(others));
  assert.equal(m.run('--set', 'main=sonnet:high').status, 0);
  const local = JSON.parse(fs.readFileSync(m.localFile, 'utf8'));
  write(m.localFile, JSON.stringify({ ...local, model: 'claude-opus-5-5' }));
  const handSet = fs.readFileSync(m.localFile, 'utf8');
  let r = m.run('--reset', 'main');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(m.localFile, 'utf8'), handSet, 'a model the user set by hand is not removed');
  assert.equal(m.saved().tasks?.main, undefined, 'the saved main is removed anyway');
  assert.equal(m.forJob('main').out, 'opus:high');
  // The user set both by hand and the kit never saved a main
  const mine = { ...others, model: 'claude-opus-5-5', effortLevel: 'high', note: 'keep' };
  m.put({ tasks: { 'code.ui': 'opus:high' } });
  write(m.localFile, JSON.stringify(mine));
  r = m.run('--reset', 'main');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(m.localFile, 'utf8')), mine, 'no saved main: nothing is removed');
  assert.equal(m.saved().tasks['code.ui'], 'opus:high', 'other jobs stay');
  // Saved main is sonnet:high; the user's own opus / low matches neither key
  m.put({ tasks: { main: 'sonnet:high' } });
  write(m.localFile, JSON.stringify({ ...others, model: 'opus', effortLevel: 'low' }));
  r = m.run('--reset', 'main');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(m.localFile, 'utf8')), { ...others, model: 'opus', effortLevel: 'low' }, 'neither key matches the saved main');
  assert.equal(m.saved().tasks?.main, undefined);
  // The match case still removes them and keeps the rest
  assert.equal(m.run('--set', 'main=opus:xhigh').status, 0);
  assert.equal(JSON.parse(fs.readFileSync(m.localFile, 'utf8')).model, 'opus');
  assert.equal(m.run('--reset', 'main').status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(m.localFile, 'utf8')), others);
});
