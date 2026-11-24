// Run: node --test kit/tests/away.test.mjs
// 3.77.0 away mode: while the user is away, anything that would ask is denied and queued; /back lists the queue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(REPO, '.claude', 'hooks');

const SETTINGS = {
  permissions: {
    ask: [
      'Bash(git push:*)',
      'Bash(node .claude/hooks/gate.mjs --approve)',
      'Edit(./.claude/**)',
      'Edit(./CLAUDE.md)',
    ],
  },
};

// Temporary project: hook scripts copied in, settings with a few ask rules
const project = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'away-'));
  fs.cpSync(HOOKS, path.join(root, '.claude', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify(SETTINGS));
  fs.writeFileSync(path.join(root, '.kit.json'), JSON.stringify({ lang: 'en' }));
  fs.mkdirSync(path.join(root, 'docs', 'workflow'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'workflow', 'board.md'), '**Status:** set up\n**Commit review:** on\n');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'export const a = 1;\n');
  return root;
};
const cleanup = (root) => fs.rmSync(root, { recursive: true, force: true });
const stateFile = (root, n) => path.join(root, '.claude', 'state', n);
const awayOn = (root) => {
  fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
  fs.writeFileSync(stateFile(root, 'away.json'), JSON.stringify({ since: new Date().toISOString() }));
};
const queueOf = (root) => {
  try {
    return fs.readFileSync(stateFile(root, 'away-queue.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
};
const env = (root) => ({ ...process.env, CLAUDE_PROJECT_DIR: root, HOME: root, USERPROFILE: root });
const away = (root, args, input) => spawnSync(process.execPath, [path.join(root, '.claude', 'hooks', 'away.mjs'), ...args], {
  input, encoding: 'utf8', env: env(root), cwd: root,
});
// PreToolUse hook: returns { status, out } where out is the parsed JSON or null
const hook = (root, input) => {
  const r = away(root, ['--hook'], typeof input === 'string' ? input : JSON.stringify(input));
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
};
const bash = (root, command) => hook(root, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
const edit = (root, tool, file_path) => hook(root, { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { file_path, content: 'x', new_string: 'x', old_string: 'a' } });
const askQ = (root, questions) => hook(root, { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions } });
const mod = (root) => import(pathToFileURL(path.join(root, '.claude', 'hooks', 'away.mjs')).href + `?t=${Math.random()}`);

// ---------- module API ----------

test('AC-77.1 module: isAway follows away.json, addToQueue appends, readQueue skips bad lines', async () => {
  const root = project();
  try {
    const m = await mod(root);
    assert.equal(m.isAway(root), false);
    assert.deepEqual(m.readQueue(root), []);
    awayOn(root);
    assert.equal(m.isAway(root), true);
    m.addToQueue(root, 'question', 'which db?');
    m.addToQueue(root, 'command', 'git push');
    fs.appendFileSync(stateFile(root, 'away-queue.jsonl'), 'not json\n{broken\n');
    m.addToQueue(root, 'edit', 'CLAUDE.md');
    const q = m.readQueue(root);
    assert.deepEqual(q.map((i) => [i.kind, i.text]), [['question', 'which db?'], ['command', 'git push'], ['edit', 'CLAUDE.md']]);
    for (const i of q) assert.equal(new Date(i.date).toISOString(), i.date);
  } finally { cleanup(root); }
});

test('AC-77.1 module: queued text is cut to 2000 characters', async () => {
  const root = project();
  try {
    const m = await mod(root);
    m.addToQueue(root, 'ask', 'x'.repeat(5000));
    const [i] = m.readQueue(root);
    assert.equal(i.text.length, 2000);
    assert.equal(i.kind, 'ask');
  } finally { cleanup(root); }
});

test('AC-77.1 module: a corrupt away.json does not crash isAway', async () => {
  const root = project();
  try {
    const m = await mod(root);
    fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
    fs.writeFileSync(stateFile(root, 'away.json'), '{nope');
    assert.equal(typeof m.isAway(root), 'boolean');
  } finally { cleanup(root); }
});

// ---------- CLI: --on / --status / --off ----------

test('AC-77.2 --on writes away.json with an ISO since date and prints "Away mode is on"; twice keeps working', () => {
  const root = project();
  try {
    const a = away(root, ['--on']);
    assert.equal(a.status, 0, a.stderr);
    assert.match(a.stdout, /Away mode is on/);
    const j = JSON.parse(fs.readFileSync(stateFile(root, 'away.json'), 'utf8'));
    assert.equal(new Date(j.since).toISOString(), j.since);
    const b = away(root, ['--on']);
    assert.equal(b.status, 0, b.stderr);
    assert.match(b.stdout, /Away mode is on/);
  } finally { cleanup(root); }
});

test('AC-77.3 --status prints off, then on, as the first word; exit 0', () => {
  const root = project();
  try {
    const off = away(root, ['--status']);
    assert.equal(off.status, 0, off.stderr);
    assert.equal(off.stdout.trim().split(/\s+/)[0], 'off');
    awayOn(root);
    const on = away(root, ['--status']);
    assert.equal(on.status, 0, on.stderr);
    assert.equal(on.stdout.trim().split(/\s+/)[0], 'on');
  } finally { cleanup(root); }
});

test('AC-77.4 --off deletes away.json, prints the queue numbered, then empties it', async () => {
  const root = project();
  try {
    awayOn(root);
    const m = await mod(root);
    m.addToQueue(root, 'question', 'Use Postgres or SQLite?');
    m.addToQueue(root, 'command', 'git push origin main');
    const r = away(root, ['--off']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.existsSync(stateFile(root, 'away.json')), false);
    assert.match(r.stdout, /^1\. \[question\] Use Postgres or SQLite\?$/m);
    assert.match(r.stdout, /^2\. \[command\] git push origin main$/m);
    assert.deepEqual(queueOf(root), []);
    const again = away(root, ['--off']);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /Nothing queued/);
  } finally { cleanup(root); }
});

test('AC-77.4 --off with an empty queue prints "Nothing queued" and exits 0', () => {
  const root = project();
  try {
    awayOn(root);
    const r = away(root, ['--off']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Nothing queued/);
    assert.doesNotMatch(r.stdout, /^1\./m);
  } finally { cleanup(root); }
});

// ---------- CLI: --push ----------

const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8' });
// A project that is a git repo with a local bare remote and one pushed commit
const pushProject = () => {
  const root = project();
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'away-bare-'));
  assert.equal(git(bare, 'init', '--bare', '-b', 'main').status, 0);
  assert.equal(git(root, 'init', '-b', 'main').status, 0);
  fs.writeFileSync(path.join(root, '.gitignore'), '.claude/\n');
  assert.equal(git(root, 'add', '-A').status, 0);
  assert.equal(git(root, 'commit', '-m', 'one').status, 0);
  assert.equal(git(root, 'remote', 'add', 'origin', bare).status, 0);
  assert.equal(git(root, 'push', '-u', 'origin', 'main').status, 0);
  fs.writeFileSync(path.join(root, 'src', 'b.js'), 'export const b = 2;\n');
  assert.equal(git(root, 'add', '-A').status, 0);
  assert.equal(git(root, 'commit', '-m', 'two').status, 0);
  return { root, bare, head: git(root, 'rev-parse', 'HEAD').stdout.trim(), remote: () => git(bare, 'rev-parse', 'main').stdout.trim() };
};

test('AC-77.5 --push while away runs plain git push and the remote receives the commit', () => {
  const p = pushProject();
  try {
    awayOn(p.root);
    assert.notEqual(p.remote(), p.head);
    const r = away(p.root, ['--push']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(p.remote(), p.head);
  } finally { cleanup(p.root); cleanup(p.bare); }
});

test('AC-77.5 --push while not away exits 1 with "only in away mode" and pushes nothing', () => {
  const p = pushProject();
  try {
    const before = p.remote();
    const r = away(p.root, ['--push']);
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /only in away mode/);
    assert.equal(p.remote(), before);
  } finally { cleanup(p.root); cleanup(p.bare); }
});

test('AC-77.5 ATTACK --push with any extra argument is refused and pushes nothing', () => {
  const p = pushProject();
  try {
    awayOn(p.root);
    const before = p.remote();
    for (const extra of [['--force'], ['origin'], ['-f'], ['--force-with-lease'], ['origin', 'main'], ['--delete', 'origin', 'main']]) {
      const r = away(p.root, ['--push', ...extra]);
      assert.equal(r.status, 1, extra.join(' '));
      assert.equal(p.remote(), before, extra.join(' '));
    }
  } finally { cleanup(p.root); cleanup(p.bare); }
});

test('AC-77.5 --push exits with the code git exits with when the push fails', () => {
  const p = pushProject();
  try {
    awayOn(p.root);
    assert.equal(git(p.root, 'remote', 'set-url', 'origin', path.join(p.bare, 'does-not-exist')).status, 0);
    const direct = git(p.root, 'push').status;
    assert.notEqual(direct, 0);
    const r = away(p.root, ['--push']);
    assert.equal(r.status, direct);
  } finally { cleanup(p.root); cleanup(p.bare); }
});

// ---------- hook: not away ----------

test('AC-77.6 hook while not away: no output, exit 0, for every tool', () => {
  const root = project();
  try {
    assert.equal(askQ(root, [{ question: 'q?' }]), null);
    assert.equal(bash(root, 'git push origin main'), null);
    assert.equal(bash(root, 'node .claude/hooks/gate.mjs --approve'), null);
    assert.equal(edit(root, 'Edit', '.claude/settings.json'), null);
    assert.equal(edit(root, 'Write', 'CLAUDE.md'), null);
    assert.equal(bash(root, 'npm test'), null);
    assert.deepEqual(queueOf(root), []);
  } finally { cleanup(root); }
});

test('AC-77.6 ATTACK a hook run never creates away.json, even for the --on command while not away', () => {
  const root = project();
  try {
    assert.equal(bash(root, 'node .claude/hooks/away.mjs --on'), null);
    assert.equal(fs.existsSync(stateFile(root, 'away.json')), false);
    awayOn(root);
    fs.rmSync(stateFile(root, 'away.json'));
    askQ(root, [{ question: 'q?' }]);
    bash(root, 'git push');
    assert.equal(fs.existsSync(stateFile(root, 'away.json')), false);
  } finally { cleanup(root); }
});

// ---------- hook: away ----------

test('AC-77.7 hook away + AskUserQuestion: deny, reason names two-way, one-way and queued; questions are queued', () => {
  const root = project();
  try {
    awayOn(root);
    const o = askQ(root, [{ question: 'Postgres or SQLite?' }, { question: 'Which payment provider?' }]);
    assert.equal(o.hookEventName, 'PreToolUse');
    assert.equal(o.permissionDecision, 'deny');
    assert.match(o.permissionDecisionReason, /two-way/);
    assert.match(o.permissionDecisionReason, /one-way/);
    assert.match(o.permissionDecisionReason, /queued/);
    assert.deepEqual(queueOf(root).map((i) => [i.kind, i.text]), [['question', 'Postgres or SQLite?'], ['question', 'Which payment provider?']]);
  } finally { cleanup(root); }
});

test('AC-77.7 hook away + AskUserQuestion with no questions array still denies and does not crash', () => {
  const root = project();
  try {
    awayOn(root);
    const o = hook(root, { tool_name: 'AskUserQuestion', tool_input: {} });
    assert.equal(o.permissionDecision, 'deny');
  } finally { cleanup(root); }
});

test('AC-77.8 hook away + Bash matching an ask rule: deny and queued as command', () => {
  const root = project();
  try {
    awayOn(root);
    const o = bash(root, 'node .claude/hooks/gate.mjs --approve');
    assert.equal(o.permissionDecision, 'deny');
    assert.deepEqual(queueOf(root).map((i) => [i.kind, i.text]), [['command', 'node .claude/hooks/gate.mjs --approve']]);
  } finally { cleanup(root); }
});

test('AC-77.8 hook away + git push: deny, queued, reason points at away.mjs --push', () => {
  const root = project();
  try {
    awayOn(root);
    const o = bash(root, 'git push origin main');
    assert.equal(o.permissionDecision, 'deny');
    assert.match(o.permissionDecisionReason, /away\.mjs --push/);
    assert.deepEqual(queueOf(root).map((i) => [i.kind, i.text]), [['command', 'git push origin main']]);
  } finally { cleanup(root); }
});

test('AC-77.8 ATTACK hook away: extra spaces, leading spaces and chained commands still match the rule', () => {
  const root = project();
  try {
    awayOn(root);
    for (const c of ['git  push', '   git push', 'git   push   origin  main', 'git push && echo done']) {
      const o = bash(root, c);
      assert.equal(o?.permissionDecision, 'deny', c);
    }
  } finally { cleanup(root); }
});

test('AC-77.8 hook away: an exact rule does not match the same command with extra arguments, a prefix rule does not match another command', () => {
  const root = project();
  try {
    awayOn(root);
    assert.equal(bash(root, 'node .claude/hooks/gate.mjs --approve extra'), null);
    assert.equal(bash(root, 'git status'), null);
    assert.equal(bash(root, 'git pull'), null);
  } finally { cleanup(root); }
});

test('AC-77.9 hook away + Edit/Write on a path matching an ask rule: deny and queued as edit (relative and absolute)', () => {
  const root = project();
  try {
    awayOn(root);
    for (const [tool, file] of [
      ['Edit', '.claude/hooks/commit-gate.mjs'],
      ['Write', '.claude/settings.json'],
      ['Edit', path.join(root, '.claude', 'hooks', 'x.mjs')],
      ['Edit', 'CLAUDE.md'],
      ['Edit', path.join(root, 'CLAUDE.md')],
      ['Write', './CLAUDE.md'],
    ]) {
      const o = edit(root, tool, file);
      assert.equal(o?.permissionDecision, 'deny', `${tool} ${file}`);
    }
    const q = queueOf(root);
    assert.equal(q.length, 6);
    assert.deepEqual([...new Set(q.map((i) => i.kind))], ['edit']);
  } finally { cleanup(root); }
});

test('AC-77.9 hook away + Edit/Write outside every ask rule is allowed (src/a.js, CLAUDE.md in another folder, a look-alike name)', () => {
  const root = project();
  try {
    awayOn(root);
    for (const [tool, file] of [['Edit', 'src/a.js'], ['Write', 'src/new.js'], ['Edit', 'docs/CLAUDE.md'], ['Edit', 'CLAUDE.md.bak'], ['Edit', path.join(root, 'src', 'a.js')]]) {
      assert.equal(edit(root, tool, file), null, `${tool} ${file}`);
    }
    assert.deepEqual(queueOf(root), []);
  } finally { cleanup(root); }
});

test('AC-77.10 hook away: away.mjs --push, --off, --status and ordinary commands are allowed', () => {
  const root = project();
  try {
    awayOn(root);
    for (const c of ['node .claude/hooks/away.mjs --push', 'node .claude/hooks/away.mjs --off', 'node .claude/hooks/away.mjs --status', 'npm test', 'node .claude/hooks/away.mjs --on']) {
      assert.equal(bash(root, c), null, c);
    }
    assert.deepEqual(queueOf(root), []);
    assert.equal(fs.existsSync(stateFile(root, 'away.json')), true);
  } finally { cleanup(root); }
});

test('AC-77.10 hook: malformed stdin exits 0 with no output, away or not', () => {
  const root = project();
  try {
    for (const input of ['', 'not json', '{"tool_name":', '[]', 'null', '42']) {
      assert.equal(hook(root, input), null, `off: ${input}`);
    }
    awayOn(root);
    for (const input of ['', 'not json', '{"tool_name":', '[]', 'null', '42']) {
      assert.equal(hook(root, input), null, `on: ${input}`);
    }
  } finally { cleanup(root); }
});

test('AC-77.10 hook: a missing or unreadable settings.json while away denies nothing and does not crash', () => {
  const root = project();
  try {
    awayOn(root);
    fs.rmSync(path.join(root, '.claude', 'settings.json'));
    assert.equal(bash(root, 'git push'), null);
    fs.writeFileSync(path.join(root, '.claude', 'settings.json'), '{oops');
    assert.equal(bash(root, 'git push'), null);
  } finally { cleanup(root); }
});

// ---------- hook: UserPromptSubmit ----------

test('AC-77.11 --prompt while away reminds: "Away mode is on" and away.mjs --off', () => {
  const root = project();
  try {
    awayOn(root);
    const r = away(root, ['--prompt'], JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'hi' }));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Away mode is on/);
    assert.match(r.stdout, /away\.mjs --off/);
  } finally { cleanup(root); }
});

test('AC-77.11 --prompt while not away prints nothing', () => {
  const root = project();
  try {
    const r = away(root, ['--prompt'], JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'hi' }));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
  } finally { cleanup(root); }
});

// ---------- shared.mjs decide() ----------

const guard = (root, command) => {
  const r = spawnSync(process.execPath, [path.join(root, '.claude', 'hooks', 'destructive-guard.mjs')], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: root }),
    encoding: 'utf8', env: env(root),
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
};

// A command destructive-guard asks about (a git command writing its output over a rule file)
const ASKED = 'git diff --output=AGENTS.md';

test('AC-77.12 decide(): not away, a guard that asks still asks, with its original reason', () => {
  const root = project();
  try {
    const o = guard(root, ASKED);
    assert.equal(o.permissionDecision, 'ask');
    assert.doesNotMatch(o.permissionDecisionReason, /^Away mode:/);
    assert.deepEqual(queueOf(root), []);
  } finally { cleanup(root); }
});

test('AC-77.12 decide(): away, the same ask becomes deny "Away mode: <original reason>" and is queued as ask', () => {
  const root = project();
  try {
    const asked = guard(root, ASKED);
    awayOn(root);
    const o = guard(root, ASKED);
    assert.equal(o.permissionDecision, 'deny');
    assert.ok(o.permissionDecisionReason.startsWith('Away mode:'), o.permissionDecisionReason);
    assert.ok(o.permissionDecisionReason.includes(asked.permissionDecisionReason), o.permissionDecisionReason);
    const q = queueOf(root);
    assert.equal(q.length, 1);
    assert.equal(q[0].kind, 'ask');
  } finally { cleanup(root); }
});

test('AC-77.12 decide(): away, a decision that was already deny stays deny with its own reason and is not queued', () => {
  const root = project();
  try {
    const before = guard(root, 'rm src/a.test.ts');
    assert.equal(before.permissionDecision, 'deny');
    awayOn(root);
    const o = guard(root, 'rm src/a.test.ts');
    assert.equal(o.permissionDecision, 'deny');
    assert.equal(o.permissionDecisionReason, before.permissionDecisionReason);
    assert.deepEqual(queueOf(root), []);
  } finally { cleanup(root); }
});

test('AC-77.12 decide(): away, a command the guard allows stays silent', () => {
  const root = project();
  try {
    awayOn(root);
    assert.equal(guard(root, 'git status'), null);
    assert.deepEqual(queueOf(root), []);
  } finally { cleanup(root); }
});

// ---------- settings and commands ----------

const settings = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8'));

test('AC-77.13 settings: --on asks, --off / --status / --push are allowed', () => {
  assert.ok(settings.permissions.ask.includes('Bash(node .claude/hooks/away.mjs --on)'));
  for (const f of ['--off', '--status', '--push']) {
    assert.ok(settings.permissions.allow.includes(`Bash(node .claude/hooks/away.mjs ${f})`), f);
    assert.ok(!settings.permissions.ask.includes(`Bash(node .claude/hooks/away.mjs ${f})`), f);
  }
});

test('AC-77.13 settings: --push is allowed only without arguments (no :* prefix rule)', () => {
  const rules = [...settings.permissions.allow, ...settings.permissions.ask];
  assert.deepEqual(rules.filter((r) => /away\.mjs --push/.test(r)), ['Bash(node .claude/hooks/away.mjs --push)']);
});

test('AC-77.13 settings: a PreToolUse hook covers Bash, Edit, Write and AskUserQuestion and runs away.mjs --hook', () => {
  const blocks = settings.hooks.PreToolUse.filter((b) => b.hooks.some((h) => h.command.includes('away.mjs" --hook')));
  assert.equal(blocks.length, 1);
  for (const t of ['Bash', 'Edit', 'Write', 'AskUserQuestion']) assert.match(t, new RegExp(`^(?:${blocks[0].matcher})$`), t);
  assert.equal(blocks[0].hooks.find((h) => h.command.includes('away.mjs" --hook')).type, 'command');
});

test('AC-77.13 settings: UserPromptSubmit runs away.mjs --prompt', () => {
  const hooks = settings.hooks.UserPromptSubmit.flatMap((b) => b.hooks);
  assert.equal(hooks.filter((h) => h.command.includes('away.mjs" --prompt')).length, 1);
});

test('AC-77.14 commands: /away runs away.mjs --on, /back runs away.mjs --off', () => {
  const read = (n) => fs.readFileSync(path.join(REPO, '.claude', 'commands', `${n}.md`), 'utf8');
  assert.match(read('away'), /away\.mjs --on/);
  assert.match(read('back'), /away\.mjs --off/);
});
