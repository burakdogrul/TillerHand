// Run: node --test "kit/tests/friction.test.mjs"
// Less friction in the fast lane and around dependencies: A) trial-branch commits skip the board stop,
// B) structure maps know the ORM folders, C) clean.mjs removes recreatable folders, D) commit-gate --accept-tests <reason> <files>,
// E) moving a protected branch is asked, F) opening a trial branch is asked.
// Every test builds its own temp project; nothing reads .claude/state/ of the working copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readMap, check } from '../../.claude/hooks/structure-guard.mjs';
import { permissionEquivalent } from '../../.claude/hooks/destructive-guard.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(REPO, '.claude', 'hooks');
const COMMIT_GATE = path.join(HOOKS, 'commit-gate.mjs');
const readRepo = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// ---------- temp project with a board ----------

let p;
const env = () => ({ ...process.env, CLAUDE_PROJECT_DIR: p, SEMGREP: 'missing-semgrep-command' });
const sh = (c) => execSync(c, { cwd: p, stdio: 'ignore' });
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
const agents = (test) => write('AGENTS.md', `# X\n\n## Commands\n\n\`\`\`bash\ndev:  [ ]\ntest:        ${test}\nlint:        node -e "console.log('lint clean')"\ntype check: [ ]\nbuild:       [ ]\n\`\`\`\n`);
const run = (script, ...args) => spawnSync(process.execPath, [path.join(HOOKS, script), ...args], { cwd: p, encoding: 'utf8', env: env() });
const commit = (command = 'git commit -m x') => spawnSync(process.execPath, [COMMIT_GATE], { cwd: p, input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8', env: env() });
const approve = (note = 'board-x') => run('commit-gate.mjs', '--approve', note);
const accept = (reason, ...files) => run('commit-gate.mjs', '--accept-tests', reason, ...files);
const askOf = (command) => {
  const r = commit(command);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : null;
};
// A green deterministic gate and a board approval for the changes on disk now
const ready = () => {
  run('gate.mjs', '--approve');
  assert.equal(run('gate.mjs', '--run').status, 0, 'green gate');
  assert.equal(approve().status, 0, 'board approval');
};
const branchNow = () => execSync('git branch --show-current', { cwd: p, encoding: 'utf8' }).trim();

// A fresh repo on main with a board member and one committed code file; `p` is swapped for the run
function inRepo(fn, { test = 'node -e "process.exit(0)"' } = {}) {
  const outer = p;
  p = fs.mkdtempSync(path.join(os.tmpdir(), 'friction-'));
  try {
    sh('git init -q && git config user.email t@t && git config user.name t && git config commit.gpgsign false && git symbolic-ref HEAD refs/heads/main');
    write('.gitignore', '.claude/state/\n');
    write('docs/workflow/board.md', '**Commit review:** on\n');
    write('.claude/agents/board-x.md', '---\nname: board-x\n---\n');
    agents(test);
    write('src/app.js', 'export const app = 1;\n');
    sh('git add -A && git commit -qm init');
    fn();
  } finally {
    fs.rmSync(p, { recursive: true, force: true });
    p = outer;
  }
}
const TEST_V1 = "test('feature', () => { expect(1).toBe(1); });\n";

// ---------- A. commit gate on trial branches ----------

const notStopped = (r, why) => {
  assert.equal(r.status, 0, `${why}\n${r.stderr}${r.stdout}`);
  assert.doesNotMatch(r.stdout, /permissionDecision/, `${why}: no deny or ask`);
};
const stopped = (r, why) => {
  assert.equal(r.status, 2, `${why}\n${r.stdout}`);
  assert.match(r.stderr, /Commit stopped/, why);
};

test('A-1 commit gate: on try/topic a plain wip commit of code is not stopped without any approval', () => inRepo(() => {
  sh('git checkout -q -b try/topic');
  write('src/feature.js', 'export const f = 1;\n');
  notStopped(commit('git commit -m "wip: try topic round 1"'), 'plain commit');
  notStopped(commit('git add -A && git commit -m "wip: try topic round 1"'), 'git add first');
  write('src/app.js', 'export const app = 2;\n');
  notStopped(commit('git commit -am "wip: try topic round 2"'), 'commit -a');
}));

test('A-2 commit gate: the same commit on main is stopped (exit 2)', () => inRepo(() => {
  write('src/feature.js', 'export const f = 1;\n');
  const r = commit('git commit -m "wip: try topic round 1"');
  stopped(r, 'main');
  assert.match(r.stderr, /the board has not reviewed these changes/);
}));

test('A-3 commit gate: on try/topic a changed code test file test-writer did not write still stops the commit', () => inRepo(() => {
  sh('git checkout -q -b try/topic');
  write('src/feature.js', 'export const f = 1;\n');
  write('src/feature.test.js', TEST_V1);
  const r = commit('git commit -m "wip: try topic round 1"');
  stopped(r, 'untracked test file');
  assert.match(r.stderr, /src\/feature\.test\.js/);
  assert.match(r.stderr, /test-writer/);
  // only the test changed
  fs.rmSync(path.join(p, 'src/feature.js'));
  stopped(commit('git commit -m "wip: try topic round 1"'), 'test file alone');
  // a tracked test changed afterwards
  sh('git add -A && git commit -qm "wip: base" --no-verify');
  write('src/feature.test.js', `${TEST_V1}// edited by a script\n`);
  stopped(commit('git commit -am "wip: try topic round 2"'), 'tracked test file changed');
}));

test('A-4 commit gate: on try/topic a branch switch chained in front of the commit is still stopped', () => inRepo(() => {
  sh('git checkout -q -b try/topic');
  write('src/feature.js', 'export const f = 1;\n');
  for (const c of ['git switch main && git commit -m x', 'git checkout main && git commit -m x', 'git switch main; git commit -m x',
    'git checkout -q main && git add -A && git commit -m x', 'git commit -m x && git switch main']) {
    const r = commit(c);
    assert.equal(r.status, 2, c);
    assert.doesNotMatch(r.stdout, /"permissionDecision":\s*"allow"/, c);
  }
}));

test('A-5 commit gate: tryout, try, feature/try/x and a detached HEAD get no exemption', () => {
  for (const make of [
    'git checkout -q -b tryout', 'git checkout -q -b try', 'git checkout -q -b feature/try/x',
    'git checkout -q -b try/topic && git checkout -q --detach',
  ]) {
    inRepo(() => {
      sh(make);
      write('src/feature.js', 'export const f = 1;\n');
      const r = commit('git commit -m "wip: try topic round 1"');
      assert.equal(r.status, 2, `${make} (branch "${branchNow()}")\n${r.stdout}`);
      assert.match(r.stderr, /the board has not reviewed these changes/, make);
    });
  }
});

test('A-6 board rules and try.md no longer tell round commits to use --skip "try round"', () => {
  const rules = readRepo('.claude/board/rules.md');
  assert.equal(rules.includes('--skip "try round"'), false, 'rules.md');
  assert.equal(/--skip[^\n]*try round/.test(rules), false, 'rules.md, any quoting');
  assert.equal(readRepo('.claude/commands/try.md').includes('--skip "try round"'), false, 'try.md');
});

// ---------- B. structure map ----------

for (const type of ['web-saas', 'backend']) {
  test(`B-1 structure map ${type}: ORM files (prisma/, drizzle/, their configs) are allowed; notes.md in the root is not`, () => {
    const map = readMap(path.join(REPO, 'kit', 'templates', type));
    assert.equal(map?.broken, undefined, 'the map parses');
    const refused = ['prisma/schema.prisma', 'prisma/seed.ts', 'prisma/migrations/1_init/migration.sql', 'drizzle/0001_init.sql', 'drizzle.config.ts', 'prisma.config.ts']
      .filter((f) => check(f, map) !== null);
    assert.deepEqual(refused, []);
    assert.equal(check('notes.md', map)?.decision, 'ask', 'a stray root file is still asked');
  });
}

// ---------- C. clean.mjs ----------

const CLEAN_SRC = path.join(HOOKS, 'clean.mjs');
const ALLOWED = ['node_modules', '.next', '.turbo', '.expo', 'dist', 'coverage', '.venv', '.pytest_cache'];
let outer;
// Project root = the script's location, so the script runs from a copy inside the temp project.
// .gitignore uses names without a slash on purpose: a trailing slash would not match a symbolic link.
function inClean(fn, { git = true, ignore = ALLOWED.join('\n') } = {}) {
  assert.equal(fs.existsSync(CLEAN_SRC), true, '.claude/hooks/clean.mjs exists');
  outer = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-'));
  const proj = path.join(outer, 'proj');
  try {
    fs.mkdirSync(path.join(proj, '.claude', 'hooks'), { recursive: true });
    for (const f of fs.readdirSync(HOOKS)) if (f.endsWith('.mjs')) fs.copyFileSync(path.join(HOOKS, f), path.join(proj, '.claude', 'hooks', f));
    fs.cpSync(path.join(REPO, '.claude', 'i18n'), path.join(proj, '.claude', 'i18n'), { recursive: true });
    fs.writeFileSync(path.join(proj, '.gitignore'), `${ignore}\n`);
    const old = p;
    p = proj;
    try {
      if (git) sh('git init -q && git config user.email t@t && git config user.name t && git config commit.gpgsign false');
      fn(proj);
    } finally { p = old; }
  } finally { fs.rmSync(outer, { recursive: true, force: true }); }
}
const clean = (proj, args, { cwd = proj, extra = {} } = {}) => {
  const e = { ...process.env, GIT_CEILING_DIRECTORIES: outer, ...extra };
  if (!('CLAUDE_PROJECT_DIR' in extra)) delete e.CLAUDE_PROJECT_DIR;
  return spawnSync(process.execPath, [path.join(proj, '.claude', 'hooks', 'clean.mjs'), ...args], { cwd, encoding: 'utf8', env: e });
};
const fill = (proj, ...dirs) => { for (const d of dirs) { fs.mkdirSync(path.join(proj, d), { recursive: true }); fs.writeFileSync(path.join(proj, d, 'file.txt'), 'x'); } };
const there = (proj, d) => fs.existsSync(path.join(proj, d));

test('C-1 clean.mjs: ignored node_modules and dist given together are both deleted, exit 0', () => inClean((proj) => {
  fill(proj, 'node_modules/pkg', 'dist');
  const r = clean(proj, ['node_modules', 'dist']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(there(proj, 'node_modules'), false);
  assert.equal(there(proj, 'dist'), false);
}));

test('C-1 clean.mjs: every one of the eight allowed names can be deleted', () => inClean((proj) => {
  fill(proj, ...ALLOWED);
  const r = clean(proj, ALLOWED);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.deepEqual(ALLOWED.filter((d) => there(proj, d)), []);
}));

test('C-1 clean.mjs: the project is the script location, not the cwd or CLAUDE_PROJECT_DIR', () => inClean((proj) => {
  fill(proj, 'dist');
  const decoy = path.join(outer, 'decoy');
  fs.mkdirSync(decoy);
  fs.writeFileSync(path.join(decoy, '.gitignore'), 'dist\n');
  execSync('git init -q', { cwd: decoy, stdio: 'ignore' });
  fill(decoy, 'dist');
  const r = clean(proj, ['dist'], { cwd: decoy, extra: { CLAUDE_PROJECT_DIR: decoy } });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(there(proj, 'dist'), false, 'the folder next to the script is deleted');
  assert.equal(there(decoy, 'dist'), true, 'the folder of the cwd / env project is kept');
}));

test('C-2 clean.mjs: names off the list or not a plain name are refused with exit 1 and nothing is deleted', () => inClean((proj) => {
  fill(proj, 'src', 'dist', 'sub/dist', 'node_modules');
  fill(outer, 'x');
  const bad = ['src', '../x', './dist', 'dist/', 'sub/dist', path.join(proj, 'dist'), '*', '.', '', 'Dist', 'node_modules/..', 'dist\\'];
  for (const arg of bad) {
    const r = clean(proj, [arg]);
    assert.equal(r.status, 1, `"${arg}" is refused\n${r.stdout}${r.stderr}`);
  }
  for (const d of ['src', 'dist', 'sub/dist', 'node_modules']) assert.equal(there(proj, d), true, `${d} kept`);
  assert.equal(fs.existsSync(path.join(outer, 'x', 'file.txt')), true, '../x kept');
  assert.equal(fs.existsSync(path.join(proj, '.gitignore')), true, 'project files kept');
}));

test('C-3 clean.mjs: one bad name among good ones makes exit 1 and nothing at all is deleted', () => inClean((proj) => {
  fill(proj, 'node_modules', 'dist', 'src');
  for (const args of [['node_modules', 'src', 'dist'], ['src', 'node_modules', 'dist'], ['node_modules', 'dist', '../x']]) {
    const r = clean(proj, args);
    assert.equal(r.status, 1, args.join(' '));
    assert.deepEqual(['node_modules', 'dist', 'src'].filter((d) => !there(proj, d)), [], `${args.join(' ')}: nothing deleted`);
  }
}));

test('C-4 clean.mjs: a listed folder that git does not ignore is refused and kept', () => inClean((proj) => {
  fill(proj, 'coverage', 'dist');
  fs.writeFileSync(path.join(proj, 'dist', 'a.map'), 'm');
  let r = clean(proj, ['coverage']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(there(proj, 'coverage/file.txt'), true);
  // only some files inside are ignored: the folder is not, and its other files are unsaved work
  r = clean(proj, ['dist']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(there(proj, 'dist/file.txt'), true);
  assert.equal(there(proj, 'dist/a.map'), true);
}, { ignore: 'node_modules\ndist/*.map' }));

test('C-5 clean.mjs: an ignored folder that holds a git-tracked file is refused and kept', () => inClean((proj) => {
  fill(proj, 'node_modules/pkg');
  fs.writeFileSync(path.join(proj, 'node_modules', 'tracked.js'), 'x');
  sh('git add -f node_modules/tracked.js && git commit -qm vendored');
  const r = clean(proj, ['node_modules']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(there(proj, 'node_modules/tracked.js'), true);
  assert.equal(there(proj, 'node_modules/pkg/file.txt'), true);
  // the same, with the tracked file only staged
  fill(proj, 'dist');
  sh('git add -f dist/file.txt');
  const staged = clean(proj, ['dist']);
  assert.equal(staged.status, 1, staged.stdout + staged.stderr);
  assert.equal(there(proj, 'dist/file.txt'), true);
}));

test('C-6 clean.mjs: a folder that is a symbolic link is refused; the link and its target stay', (t) => inClean((proj) => {
  fill(proj, 'real-target');
  const link = path.join(proj, 'node_modules');
  try {
    fs.symlinkSync(path.join(proj, 'real-target'), link, 'dir');
  } catch {
    try { fs.symlinkSync(path.join(proj, 'real-target'), link, 'junction'); } catch { return t.skip('this OS refuses to create a link'); }
  }
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'setup: a link');
  const r = clean(proj, ['node_modules']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'the link stays');
  assert.equal(there(proj, 'real-target/file.txt'), true, 'the target stays');
}));

test('C-7 clean.mjs: a listed folder that does not exist is not an error', () => inClean((proj) => {
  assert.equal(clean(proj, ['.venv']).status, 0);
  fill(proj, 'dist');
  const r = clean(proj, ['.next', 'dist', '.pytest_cache']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(there(proj, 'dist'), false);
}));

test('C-8 clean.mjs: no arguments exit 1 with a usage line; outside a git repository nothing is deleted', () => {
  inClean((proj) => {
    fill(proj, 'dist');
    const r = clean(proj, []);
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /usage/i);
    assert.equal(there(proj, 'dist'), true);
  });
  inClean((proj) => {
    fill(proj, 'node_modules', 'dist');
    const r = clean(proj, ['node_modules', 'dist']);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(there(proj, 'node_modules/file.txt'), true);
    assert.equal(there(proj, 'dist/file.txt'), true);
  }, { git: false });
});

test('C-9 settings.json: clean.mjs is allowed and rm -rf is still denied', () => {
  const { permissions } = JSON.parse(readRepo('.claude/settings.json'));
  assert.equal(permissions.allow.includes('Bash(node .claude/hooks/clean.mjs:*)'), true);
  assert.equal(permissions.deny.includes('Bash(rm -rf:*)'), true);
  assert.equal(permissions.allow.some((a) => /\brm\b/.test(a)), false, 'no rm in allow');
});

test('C-10 AGENTS.md names clean.mjs', () => {
  assert.match(readRepo('AGENTS.md'), /clean\.mjs/);
});

const APPEND_IGNORES = {
  'web-saas': ['node_modules/', '.next/', 'coverage/'],
  backend: ['.venv/', '.pytest_cache/', 'dist/'],
  mobile: ['node_modules/', '.expo/', 'dist/', 'coverage/'],
};
for (const [type, folders] of Object.entries(APPEND_IGNORES)) {
  test(`C-10 ${type} .gitignore.append ignores ${folders.join(', ')}`, () => {
    const lines = readRepo(`kit/templates/${type}/.gitignore.append`).split(/\r?\n/).map((l) => l.trim());
    assert.deepEqual(folders.filter((f) => !lines.includes(f)), []);
  });
}

// ---------- D. commit-gate --accept-tests ----------

test('D-1 commit gate: the "test-writer did not write" stop names --accept-tests', () => inRepo(() => {
  write('src/feature.test.js', TEST_V1);
  ready();
  const r = commit();
  stopped(r, 'foreign test');
  assert.match(r.stderr, /test-writer did not write/);
  assert.match(r.stderr, /--accept-tests/);
}));

test('D-2 --accept-tests: with a valid --approve and a green gate for the same changes the commit passes', () => inRepo(() => {
  write('src/feature.js', 'export const f = 1;\n');
  write('src/feature.test.js', TEST_V1);
  write('tests/ödeme/İade ı.test.js', "test('İade', () => { expect(2).toBe(2); });\n");
  const a = accept('I edited these tests myself', 'src/feature.test.js', 'tests/ödeme/İade ı.test.js');
  assert.equal(a.status, 0, a.stderr + a.stdout);
  ready();
  const r = commit();
  assert.equal(r.status, 0, r.stderr);
  notStopped(r, 'accepted tests');
  sh('git add -A && git commit -qm feature');
  // a tracked test edited by hand, accepted, reviewed
  write('src/feature.test.js', `${TEST_V1}test('more', () => { expect(2).toBe(2); });\n`);
  stopped(commit('git commit -am x'), 'before accepting');
  assert.equal(accept('second edit', 'src/feature.test.js').status, 0);
  ready();
  assert.equal(commit('git commit -am x').status, 0, 'after accepting the edit');
}));

test('D-3 --accept-tests: without the board approval, without a gate run or with a red gate the commit is still stopped', () => inRepo(() => {
  write('src/feature.test.js', TEST_V1);
  assert.equal(accept('user edited the test', 'src/feature.test.js').status, 0);
  // nothing else
  let r = commit();
  stopped(r, 'no approval, no gate');
  assert.doesNotMatch(r.stderr, /test-writer did not write/, 'the test stop is lifted');
  // green gate, no board approval
  run('gate.mjs', '--approve');
  assert.equal(run('gate.mjs', '--run').status, 0);
  r = commit();
  stopped(r, 'green gate, no approval');
  assert.match(r.stderr, /the board has not reviewed these changes/);
  // approval, but the gate has not run for these changes
  fs.rmSync(path.join(p, '.claude/state/gate.json'), { force: true });
  assert.equal(approve().status, 0);
  r = commit();
  stopped(r, 'approval, no gate run');
  assert.match(r.stderr, /deterministic gate has not run/);
}));

test('D-3 --accept-tests: a red deterministic gate still stops the commit', () => inRepo(() => {
  write('src/feature.test.js', TEST_V1);
  assert.equal(accept('user edited the test', 'src/feature.test.js').status, 0);
  run('gate.mjs', '--approve');
  assert.equal(run('gate.mjs', '--run').status, 1, 'red gate');
  assert.equal(approve().status, 0);
  const r = commit();
  stopped(r, 'red gate');
  assert.match(r.stderr, /deterministic gate is red/);
}, { test: 'node -e "process.exit(1)"' }));

test('D-4 --accept-tests: a test file changed after accepting is stopped again', () => inRepo(() => {
  write('src/feature.test.js', TEST_V1);
  assert.equal(accept('user edited the test', 'src/feature.test.js').status, 0);
  ready();
  assert.equal(commit().status, 0, 'as accepted');
  write('src/feature.test.js', `${TEST_V1}// slipped in later\n`);
  ready();
  const r = commit();
  stopped(r, 'changed after accepting');
  assert.match(r.stderr, /test-writer did not write/);
  assert.match(r.stderr, /src\/feature\.test\.js/);
  // back to the accepted content: accepted again
  write('src/feature.test.js', TEST_V1);
  ready();
  assert.equal(commit().status, 0, 'exactly the accepted content');
}));

test('D-5 --accept-tests: a partially staged test stays stopped', () => inRepo(() => {
  write('src/feature.test.js', TEST_V1);
  sh('git add src/feature.test.js');
  write('src/feature.test.js', `${TEST_V1}test('second', () => { expect(2).toBe(2); });\n`); // disk differs from the index
  accept('user edited the test', 'src/feature.test.js');
  ready();
  const r = commit();
  stopped(r, 'partially staged');
  assert.match(r.stderr, /src\/feature\.test\.js/);
  assert.match(r.stderr, /partially staged/);
}));

// Everything under .claude/state/ as one text: what the accept command recorded, wherever it keeps it
const recordedText = () => {
  const names = [];
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name)); else names.push(path.join(d, e.name));
    }
  })(path.join(p, '.claude', 'state'));
  return names.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
};

test('D-6 --accept-tests: only the named test file is recorded; a test file added later is not covered', () => inRepo(() => {
  write('src/helper.js', 'export const h = 1;\n');
  write('src/first.test.js', TEST_V1);
  write('vitest.config.ts', 'export default {};\n');
  assert.equal(accept('user edited the test', 'src/first.test.js').status, 0);
  // a changed non-test file and a test config are not put in the record
  const recorded = recordedText();
  assert.equal(recorded.includes('src/first.test.js'), true, 'the named file is in the record');
  assert.equal(recorded.includes('src/helper.js'), false, 'non-test file not in the record');
  assert.equal(recorded.includes('vitest.config.ts'), false, 'test config not in the record');
  // a second test file appears after accepting
  write('src/second.test.js', "test('second', () => { expect(2).toBe(2); });\n");
  ready();
  const r = commit();
  stopped(r, 'a later test file');
  assert.match(r.stderr, /src\/second\.test\.js/);
  assert.doesNotMatch(r.stderr, /src\/first\.test\.js/, 'the accepted one is not named');
}));

test('D-7 hook: --accept-tests is put to the user in every spelling', () => inRepo(() => {
  for (const c of [
    'node .claude/hooks/commit-gate.mjs --accept-tests "user edited the test" src/a.test.js',
    'node ./.claude/hooks/commit-gate.mjs --accept-tests x src/a.test.js',
    'node "$CLAUDE_PROJECT_DIR/.claude/hooks/commit-gate.mjs" --accept-tests "x" src/a.test.js src/b.test.js',
    'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/commit-gate.mjs" --accept-tests x src/a.test.js',
    "node '.claude/hooks/commit-gate.mjs' '--accept-tests' x src/a.test.js",
    'node .claude\\hooks\\commit-gate.mjs --accept-tests x src\\a.test.js',
    'node .claude/hooks/commit-gate.mjs --accept-t""ests x src/a.test.js',
    'node .claude/hooks/commit-gate.mjs "--accept-tests" x src/a.test.js',
  ]) assert.equal(askOf(c), 'ask', c);
  // chained to a commit: never passed silently
  const chained = commit('node .claude/hooks/commit-gate.mjs --accept-tests x src/a.test.js && git commit -m y');
  assert.equal(chained.status === 2 || JSON.parse(chained.stdout || '{}').hookSpecificOutput?.permissionDecision === 'ask', true, 'chained accept + commit');
  assert.equal(askOf('node .claude/hooks/commit-gate.mjs --approve "board-x"'), null, '--approve is not asked');
  assert.equal(askOf('node .claude/hooks/commit-gate.mjs --status'), null, '--status is not asked');
}));

test('D-7 hook: a commit whose message only mentions --accept-tests is not asked for that reason', () => inRepo(() => {
  write('src/other.js', 'export const o = 1;\n');
  const r = commit('git commit -am "docs: commit-gate.mjs --accept-tests explained"');
  stopped(r, 'goes on to the commit checks');
  assert.match(r.stderr, /the board has not reviewed these changes/);
  assert.equal(r.stdout.trim(), '', 'no ask');
  ready();
  notStopped(commit('git add -A && git commit -qm "docs: commit-gate.mjs --accept-tests explained"'), 'approved commit with such a message');
}));

test('D-8 destructive-guard and settings.json: --accept-tests is an ask for Codex/Antigravity and for Claude', () => {
  for (const c of ['node .claude/hooks/commit-gate.mjs --accept-tests "x" src/a.test.js', 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/commit-gate.mjs" --accept-tests x src/a.test.js',
    'node .claude/hooks/commit-gate.mjs --accept-t""ests x src/a.test.js'])
    assert.equal(permissionEquivalent(c)?.decision, 'ask', c);
  assert.equal(permissionEquivalent('git add -A && git commit -qm "docs: commit-gate.mjs --accept-tests explained"'), null, 'a message is text');
  const { permissions } = JSON.parse(readRepo('.claude/settings.json'));
  const entry = 'Bash(node .claude/hooks/commit-gate.mjs --accept-tests:*)';
  assert.equal(permissions.ask.includes(entry), true, 'ask list');
  assert.equal(permissions.allow.includes(entry), false, 'not in the allow list');
});

test('D-9 messages: the new ask texts exist in messages.mjs and in tr.json', async () => {
  const { MESSAGES } = await import('../../.claude/hooks/messages.mjs');
  const tr = JSON.parse(readRepo('.claude/i18n/tr.json'));
  for (const key of ['guard.commit.acceptTestsAsk', 'guard.destructive.perm.commitAcceptTests']) {
    assert.equal(typeof MESSAGES[key]?.en, 'string', `${key} in messages.mjs`);
    assert.notEqual(MESSAGES[key].en.trim(), '', `${key} English text`);
    assert.equal(typeof tr[key], 'string', `${key} in tr.json`);
    assert.notEqual(tr[key].trim(), '', `${key} Turkish text`);
    assert.notEqual(tr[key], MESSAGES[key].en, `${key} is translated`);
  }
});

const noRecord = () => {
  const text = recordedText();
  return !/\.test\.|\.config\.|helper\.js/.test(text);
};

test('D-10 --accept-tests: only the named files are accepted; the other changed test file stops the commit and is named', () => inRepo(() => {
  write('src/a.test.js', TEST_V1);
  write('src/b.test.js', "test('b', () => { expect(2).toBe(2); });\n");
  const a = accept('user edited a', 'src/a.test.js');
  assert.equal(a.status, 0, a.stderr + a.stdout);
  ready();
  const r = commit();
  stopped(r, 'b.test.js not accepted');
  assert.match(r.stderr, /test-writer did not write/);
  assert.match(r.stderr, /src\/b\.test\.js/);
  assert.doesNotMatch(r.stderr, /src\/a\.test\.js/, 'the accepted one is not named');
  // naming the second one as well lets the commit through
  assert.equal(accept('user edited b', 'src/b.test.js').status, 0);
  ready();
  assert.equal(commit().status, 0, 'both accepted');
}));

test('D-11 --accept-tests: no file named exits 1 and records nothing', () => inRepo(() => {
  write('src/a.test.js', TEST_V1);
  for (const args of [['user edited the test'], []]) {
    const r = run('commit-gate.mjs', '--accept-tests', ...args);
    assert.equal(r.status, 1, `args: ${JSON.stringify(args)}\n${r.stdout}${r.stderr}`);
    assert.equal(noRecord(), true, 'nothing recorded');
  }
  ready();
  const c = commit();
  stopped(c, 'still not accepted');
  assert.match(c.stderr, /src\/a\.test\.js/);
}));

test('D-12 --accept-tests: a named file that is not a changed test file is refused with exit 1 and nothing is recorded, valid files named with it included', () => inRepo(() => {
  write('src/old.test.js', TEST_V1);
  sh('git add -A && git commit -qm "old test"');
  write('src/first.test.js', TEST_V1);
  write('src/helper.js', 'export const h = 1;\n');
  write('vitest.config.ts', 'export default {};\n');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'friction-out-'));
  try {
    fs.writeFileSync(path.join(outside, 'x.test.js'), TEST_V1);
    const bad = {
      'a non-test file': 'src/helper.js',
      'a test config': 'vitest.config.ts',
      'an unchanged test': 'src/old.test.js',
      'a file that does not exist': 'src/missing.test.js',
      'an absolute path outside the repo': path.join(outside, 'x.test.js'),
      'a relative path outside the repo': path.relative(p, path.join(outside, 'x.test.js')),
      'a parent-folder path': '../x.test.js',
    };
    for (const [what, file] of Object.entries(bad)) {
      for (const args of [[file], ['src/first.test.js', file], [file, 'src/first.test.js']]) {
        const r = accept('user edited the test', ...args);
        assert.equal(r.status, 1, `${what}: ${args.join(' ')}\n${r.stdout}${r.stderr}`);
        assert.equal(recordedText().includes('first.test.js'), false, `${what}: valid file not recorded either`);
        assert.equal(noRecord(), true, `${what}: nothing recorded`);
      }
    }
  } finally { fs.rmSync(outside, { recursive: true, force: true }); }
  ready();
  const c = commit();
  stopped(c, 'nothing was accepted');
  assert.match(c.stderr, /src\/first\.test\.js/);
}));

test('D-13 --accept-tests: when the record cannot be written the command exits 1 and does not say the files were accepted', () => inRepo(() => {
  write('src/a.test.js', TEST_V1);
  fs.mkdirSync(path.join(p, '.claude', 'state', 'test-writer.json'), { recursive: true }); // a folder where the file belongs
  const r = accept('user edited the test', 'src/a.test.js');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /accepted/i, 'no success message');
  assert.notEqual((r.stdout + r.stderr).trim(), '', 'the failure is explained');
  ready();
  stopped(commit(), 'not accepted');
}));

// ---------- C (added). clean.mjs and git environment variables ----------

test('C-11 clean.mjs: GIT_DIR and GIT_INDEX_FILE from the environment do not change its checks', () => {
  const decoyRepo = (dir, tracked) => {
    fs.mkdirSync(dir, { recursive: true });
    execSync('git init -q', { cwd: dir, stdio: 'ignore' });
    if (tracked) {
      fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'dist', 'file.txt'), 'x');
      execSync('git add -f dist/file.txt', { cwd: dir, stdio: 'ignore' });
    }
    return { GIT_DIR: path.join(dir, '.git'), GIT_INDEX_FILE: path.join(dir, '.git', 'index') };
  };
  // a tracked file still refuses the folder while the variables point at an empty repo
  inClean((proj) => {
    fill(proj, 'node_modules/pkg');
    fs.writeFileSync(path.join(proj, 'node_modules', 'tracked.js'), 'x');
    sh('git add -f node_modules/tracked.js && git commit -qm vendored');
    const extra = { ...decoyRepo(path.join(outer, 'empty'), false), GIT_INDEX_FILE: path.join(outer, 'no-such-index') };
    const r = clean(proj, ['node_modules'], { extra });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(there(proj, 'node_modules/tracked.js'), true);
    assert.equal(there(proj, 'node_modules/pkg/file.txt'), true);
  });
  // another repo that tracks dist/file.txt does not refuse this project's ignored dist
  inClean((proj) => {
    fill(proj, 'dist');
    const r = clean(proj, ['dist'], { extra: decoyRepo(path.join(outer, 'other'), true) });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(there(proj, 'dist'), false);
  });
  // outside a git repository the variables cannot make the folder look ignored and untracked
  inClean((proj) => {
    fill(proj, 'dist');
    const r = clean(proj, ['dist'], { extra: decoyRepo(path.join(outer, 'other'), false) });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(there(proj, 'dist/file.txt'), true);
  }, { git: false });
});

// ---------- E and F. branch moves are asked (destructive-guard as the Claude Code host) ----------

const GUARD = path.join(HOOKS, 'destructive-guard.mjs');
const guardOf = (command) => {
  const r = spawnSync(process.execPath, [GUARD], { cwd: p, input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8', env: env() });
  assert.equal(r.status, 0, `${command}\n${r.stderr}`);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : null;
};
const allAsked = (commands) => inRepo(() => {
  const wrong = commands.map((c) => [c, guardOf(c)]).filter(([, d]) => d !== 'ask');
  assert.deepEqual(wrong, [], 'each should be ask');
});
const noneAsked = (commands) => inRepo(() => {
  const wrong = commands.map((c) => [c, guardOf(c)]).filter(([, d]) => d !== null);
  assert.deepEqual(wrong, [], 'each should pass without a decision');
});

test('E-1 destructive-guard: moving main, master or production is asked', () => allAsked([
  'git branch -f main try/x', 'git branch --force main try/x', 'git update-ref refs/heads/main try/x',
  'git checkout -B main try/x', 'git switch -C main try/x', 'git switch --force-create main try/x',
  'git fetch . try/x:main', 'git reset --soft try/x',
  'git branch -f master try/x', 'git update-ref refs/heads/production try/x', 'git checkout -B production try/x',
]));

test('E-2 destructive-guard: a global git option in front does not hide a protected-branch move', () => allAsked([
  'git -c a=b branch -f main try/x', 'git --no-pager update-ref refs/heads/main x',
]));

test('E-3 destructive-guard: switching to, listing and reading main, and moving other branches, is not asked and not denied', () => noneAsked([
  'git switch main', 'git checkout main', 'git branch', 'git branch feature', 'git branch -f feature x', 'git checkout -b feature',
  'git fetch origin main', 'git symbolic-ref --short HEAD', 'git log main', 'git merge-base main HEAD',
]));

test('E-4 destructive-guard: git symbolic-ref HEAD moving to main or to a trial branch is asked', () => allAsked([
  'git symbolic-ref HEAD refs/heads/main', 'git symbolic-ref HEAD refs/heads/try/x',
]));

test('E-5 destructive-guard: a protected-branch move is asked in a chain, and only mentioned in a commit message it is not', () => {
  allAsked(['git add -A && git branch -f main try/x', 'echo ok; git update-ref refs/heads/main try/x']);
  noneAsked(['git commit -m "docs: git branch -f main explained"']);
});

test('F-1 destructive-guard: opening a try/ branch is asked', () => allAsked([
  'git switch -c try/x', 'git switch --create try/x', 'git checkout -b try/x', 'git branch try/x',
  'git update-ref refs/heads/try/x HEAD', 'git worktree add -b try/x ../w',
]));

test('F-2 destructive-guard: using, deleting or looking like a try/ branch is not asked', () => noneAsked([
  'git switch try/x', 'git checkout try/x', 'git branch -D try/x', 'git branch feature/try', 'git switch -c tryout',
]));

// ---------- G. other ways to move a branch ----------

test('G-1 destructive-guard: git reset to a branch, a remote branch, a special ref or a commit id is asked', () => allAsked([
  'git reset refs/heads/try/x', 'git reset origin/try/x', 'git reset ORIG_HEAD', 'git reset HEAD@{1}', 'git reset FETCH_HEAD',
  'git reset --soft try/x', 'git reset abc1234',
]));

test('G-2 destructive-guard: git reset of paths or a few commits back is not asked and not denied', () => noneAsked([
  'git reset', 'git reset --soft', 'git reset --soft HEAD~1', 'git reset --mixed HEAD~2', 'git reset HEAD^',
  'git reset HEAD src/a.ts', 'git reset -- src/a.ts', 'git reset src/a.ts', 'git reset .',
]));

test('G-3 destructive-guard: git pull from the local repository is asked', () => allAsked([
  'git pull . try/x', 'git pull --ff-only . try/x', 'git pull --rebase . try/x',
]));

test('G-4 destructive-guard: git pull from a remote is not asked and not denied', () => noneAsked([
  'git pull', 'git pull origin main', 'git pull --ff-only',
]));

test('G-5 destructive-guard: git branch with a tracking or quiet option that creates try/x is asked', () => allAsked([
  'git branch -t try/x origin/main', 'git branch --track try/x origin/main', 'git branch -q try/x', 'git branch --no-track try/x main',
]));

test('G-6 destructive-guard: listing or safely deleting a try/ branch is not asked and not denied', () => noneAsked([
  'git branch --list try/x', 'git branch -d try/x', 'git branch --delete try/x', 'git branch -a',
]));

test('F-3 try.md: opening the trial branch tells the user it asks them once', () => {
  const start = readRepo('.claude/commands/try.md').split(/\r?\n## Build/)[0];
  const line = start.split(/\r?\n/).find((l) => l.includes('git switch -c try/'));
  assert.equal(typeof line, 'string', 'the Start section has the open-branch step');
  assert.match(line, /\bask/i, 'says it asks');
  assert.match(line, /\bonce\b/i, 'says once');
});
