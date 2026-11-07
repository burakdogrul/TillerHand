// Run: node --test "kit/tests/adopt.test.mjs"
// /adopt in two passes: the command text contract (AD-1..AD-7, AD-9) and the commit gate on adopt/structure and try/* (AD-8).
// Exact tokens are checked, not prose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => {
  const file = path.join(ROOT, rel);
  assert.equal(fs.existsSync(file), true, `${rel} exists`);
  return fs.readFileSync(file, 'utf8');
};
const missing = (text, tokens) => tokens.filter((t) => !text.includes(t));
// Text of one "## " section, up to the next "## " heading
const section = (text, heading) => {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `${heading} exists`);
  const rest = text.slice(start + heading.length);
  const end = rest.search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end);
};
const ADOPT = '.claude/commands/adopt.md';

// ---------- command text ----------

test('AD-1 adopt.md: names the two passes (First pass, Second pass run by /lock)', () => {
  assert.deepEqual(missing(read(ADOPT), ['**Two passes.**', '**First pass', '**Second pass (`/lock` runs it)']), []);
});

test('AD-2 adopt.md: Step 0 maps /start 0a and the limit to the scan-depth question', () => {
  const step0 = section(read(ADOPT), '## Step 0');
  assert.deepEqual(missing(step0, ['0a', 'Scan depth', 'limit']), []);
});

test('AD-3 adopt.md: Step 4b and Step 4c exist, headings come in order', () => {
  const text = read(ADOPT);
  const headings = ['## Step 0', '## Step 1', '## Step 2', '## Step 3', '## Step 4:', '## Step 4b', '## Step 4c', '## Step 5', '## Step 6', '## Step 7', '## Step 8', '## Step 9'];
  const lines = text.split(/\r?\n/);
  const at = headings.map((h) => lines.findIndex((l) => l.startsWith(h)));
  assert.equal(at.every((i) => i !== -1), true, `all headings exist, got ${JSON.stringify(at)}`);
  assert.deepEqual(at, [...at].sort((a, b) => a - b), 'heading order');
  assert.equal(new Set(at).size, headings.length, 'different lines');
});

test('AD-3 adopt.md: Step 4b holds the kit-install commit, the --skip and the word asked; Step 4c names /try and 4/9', () => {
  const text = read(ADOPT);
  assert.deepEqual(missing(section(text, '## Step 4b'), ['chore: kit install (adopt)', 'commit-gate.mjs --skip', 'asked']), []);
  assert.deepEqual(missing(section(text, '## Step 4c'), ['/try', '4/9']), []);
});

test('AD-4 lock.md: the Setup section covers Setup (adopt) and points to adopt.md and start.md', () => {
  assert.deepEqual(missing(section(read('.claude/commands/lock.md'), '## Setup'), ['Setup (adopt)', '.claude/commands/adopt.md', '.claude/commands/start.md']), []);
});

test('AD-5 adopt.md: Step 8 names /tweak, /try and /lock; Step 9 does not send to /build G-001', () => {
  const text = read(ADOPT);
  assert.deepEqual(missing(section(text, '## Step 8'), ['/tweak', '/try', '/lock']), []);
  assert.equal(section(text, '## Step 9').includes('/build G-001'), false, 'Step 9 has no /build G-001');
});

test('AD-6 adopt.md: Step 8 merges adopt/structure safely, in order; no squash, no branch -D', () => {
  const text = read(ADOPT);
  const step8 = section(text, '## Step 8');
  const tokens = ['git status --porcelain', 'gate.mjs --run', 'git merge --no-ff adopt/structure', 'merge-base --is-ancestor', 'git branch -d adopt/structure'];
  const at = tokens.map((t) => step8.indexOf(t));
  assert.equal(at.every((i) => i !== -1), true, `all tokens in Step 8, got ${JSON.stringify(at)}`);
  assert.deepEqual(at, [...at].sort((a, b) => a - b), 'token order');
  assert.equal(new Set(at).size, tokens.length, 'different places');
  assert.equal(text.includes('merge --squash'), false, 'no merge --squash');
  assert.equal(text.includes('branch -D'), false, 'no branch -D');
});

test('AD-7 adopt.md: Step 9 hands the first slice to try/* and /lock', () => {
  assert.deepEqual(missing(section(read(ADOPT), '## Step 9'), ['try/*', '/lock']), []);
});

test('AD-9 adopt.md: code changes are limited to a try/* branch; the old blanket ban is gone', () => {
  const text = read(ADOPT);
  assert.equal(text.includes('only on a `try/*` branch'), true, 'only on a try/* branch');
  assert.equal(text.includes('Do not change application code or move files in this session'), false, 'old ban removed');
});

// ---------- AD-8: the real commit-gate hook ----------

const COMMIT_GATE = path.join(ROOT, '.claude', 'hooks', 'commit-gate.mjs');
let p;
const env = () => {
  const e = { ...process.env, CLAUDE_PROJECT_DIR: p, SEMGREP: 'missing-semgrep-command' };
  delete e.NODE_TEST_CONTEXT;
  return e;
};
const sh = (c) => execSync(c, { cwd: p, stdio: 'ignore' });
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
const gate = (...args) => spawnSync(process.execPath, [path.join(ROOT, '.claude', 'hooks', 'gate.mjs'), ...args], { cwd: p, encoding: 'utf8', env: env() });
const hook = (command) => spawnSync(process.execPath, [COMMIT_GATE], { cwd: p, input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8', env: env() });
const decisionOf = (r) => (r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : null);

// A repo on main with a board and commit review on, a green gate command and four small files committed
function inRepo(fn) {
  const outer = p;
  p = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-'));
  try {
    sh('git init -q && git config user.email t@t && git config user.name t && git config commit.gpgsign false && git symbolic-ref HEAD refs/heads/main');
    write('.gitignore', '.claude/state/\n');
    write('docs/workflow/board.md', '**Commit review:** on\n');
    write('.claude/agents/board-x.md', '---\nname: board-x\n---\n');
    write('AGENTS.md', '# X\n\n## Commands\n\n```bash\ndev:  [ ]\ntest:        node -e "process.exit(0)"\nlint:        node -e "process.exit(0)"\ntype check: [ ]\nbuild:       [ ]\n```\n');
    for (const n of ['a', 'b', 'c']) write(`src/${n}.js`, 'export const v = 1;\n');
    sh('git add -A && git commit -qm init');
    fn();
  } finally {
    fs.rmSync(p, { recursive: true, force: true });
    p = outer;
  }
}
// Three changed files (over the /tweak limit of 2) and a green gate for exactly these changes
const bigChange = () => {
  for (const n of ['a', 'b', 'c']) fs.appendFileSync(path.join(p, 'src', `${n}.js`), '// change\n');
  gate('--approve');
  const g = gate('--run');
  assert.equal(g.status, 0, `green gate\n${g.stdout}${g.stderr}`);
};

test('AD-8 commit-gate: on adopt/structure a commit above the /tweak limit with no board approval is stopped', () => inRepo(() => {
  sh('git checkout -q -b adopt/structure');
  bigChange();
  const r = hook('git commit -am "move files"');
  assert.equal(r.status, 2, `${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /Commit stopped/);
  assert.match(r.stderr, /the board has not reviewed these changes/);
}));

test('AD-8 commit-gate: the same commit on try/x is allowed (try exemption)', () => inRepo(() => {
  sh('git checkout -q -b try/x');
  bigChange();
  const r = hook('git commit -am "wip: try x round 1"');
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.equal(decisionOf(r), null, 'no deny or ask');
}));

test('AD-8 commit-gate: git merge --no-ff adopt/structure on main is asked, not silently allowed', () => inRepo(() => {
  const r = hook('git merge --no-ff adopt/structure');
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.equal(decisionOf(r), 'ask');
}));
