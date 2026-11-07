// Run: node --test "kit/tests/worktree.test.mjs"
// Parallel work in git worktrees (3.70.0): findRoot(cwd), inLinkedWorktree, structure-guard, gate approval, commit-gate,
// and the /parallel command text. Real `git worktree add` in temp repos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(ROOT, '.claude', 'hooks');
const SHARED = path.join(HOOKS, 'shared.mjs');
const HAS_GIT = spawnSync('git', ['--version']).status === 0;
const git = { skip: HAS_GIT ? false : 'git is not on PATH' };

const real = (p) => fs.realpathSync.native(p);
// Windows paths compare without case
const same = (a, b) => (process.platform === 'win32' ? real(a).toLowerCase() === real(b).toLowerCase() : real(a) === real(b));
const sh = (c, cwd) => execSync(c, { cwd, stdio: 'ignore' });
const write = (dir, f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

const MAP = '{"allow":["src/**","docs/**","CHANGELOG.md","AGENTS.md",".claude/**",".gitignore"],"deny":["**/*.bak"]}';
const AGENTS = (test) => `# X\n\n## Commands\n\n\`\`\`bash\ndev:  [ ]\ntest:        ${test}\nlint:        node -e "process.exit(0)"\ntype check: [ ]\nbuild:       [ ]\n\`\`\`\n`;
const FOUR = ['docs/workflow/progress.md', 'docs/product/roadmap.md', 'docs/decisions/log.md', 'CHANGELOG.md'];

// A main repo with a committed base and a linked worktree .claude/worktrees/wt (branch worktree-wt)
async function withRepo(fn) {
  const main = tmp('wt-main-');
  const other = tmp('wt-other-');
  try {
    sh('git init -q && git config user.email t@t && git config user.name t && git config commit.gpgsign false && git config core.autocrlf false', main);
    write(main, '.gitignore', '.claude/worktrees/\n.claude/state/\n');
    write(main, '.claude/structure.json', MAP);
    write(main, 'AGENTS.md', AGENTS('node -e "process.exit(0)"'));
    write(main, 'docs/workflow/board.md', '**Commit review:** on\n');
    write(main, '.claude/agents/board-x.md', '---\nname: board-x\n---\n');
    write(main, 'src/a.js', 'export const v = 1;\n');
    // The kit's own commit-gate.mjs, so main and the worktree both hold a copy to compare real paths against (W-18)
    write(main, '.claude/hooks/commit-gate.mjs', fs.readFileSync(path.join(HOOKS, 'commit-gate.mjs'), 'utf8'));
    for (const f of FOUR) write(main, f, '# old\n');
    sh('git add -A && git commit -qm init', main);
    sh('git worktree add -q .claude/worktrees/wt -b worktree-wt', main);
    const wt = path.join(main, '.claude', 'worktrees', 'wt');
    sh('git init -q', other);
    await fn({ main, wt, other });
  } finally {
    // Prune the worktree link before the temp tree goes, so nothing stale is left behind
    try { sh('git worktree prune', main); } catch { /* repo gone */ }
    fs.rmSync(main, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
}

const envFor = (main) => {
  const e = { ...process.env, CLAUDE_PROJECT_DIR: main, SEMGREP: 'missing-semgrep-command' };
  delete e.NODE_TEST_CONTEXT;
  return e;
};
// Run code against shared.mjs in a child process so the environment is controlled
const esm = (code, cwd, main, env = envFor(main)) => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(SHARED).href)}).then(async (m) => { ${code} })`],
    { cwd, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `child failed\n${r.stdout}${r.stderr}`);
  return r.stdout.trim();
};
const findRootIn = (arg, cwd, main, env) => esm(`console.log(m.findRoot(${arg === undefined ? '' : JSON.stringify(arg)}))`, cwd, main, env);
const hook = (script, input, cwd, main) => spawnSync(process.execPath, [path.join(HOOKS, script)], { cwd, input: JSON.stringify(input), encoding: 'utf8', env: envFor(main) });
const decisionOf = (r) => (r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : null);
const writeInput = (file, cwd) => ({ tool_name: 'Write', tool_input: { file_path: file, content: 'x\n' }, cwd });

// ---------- W-1 ----------

test('W-1 findRoot(cwd) gives the worktree root for the worktree and for a subfolder of it', git, () => withRepo(({ main, wt }) => {
  fs.mkdirSync(path.join(wt, 'src', 'deep'), { recursive: true });
  assert.equal(same(findRootIn(wt, main, main), wt), true, 'worktree');
  assert.equal(same(findRootIn(path.join(wt, 'src', 'deep'), main, main), wt), true, 'subfolder');
  assert.equal(same(findRootIn(main, main, main), main), true, 'main checkout stays main');
}));

test('W-1 parseInput passes the input cwd: root is the worktree root for a worktree cwd, main for a main cwd', git, () => withRepo(({ main, wt }) => {
  const root = (cwd) => esm(`console.log(m.parseInput({ tool_name: 'Write', tool_input: { file_path: 'x', content: '' }, cwd: ${JSON.stringify(cwd)} }).root)`, main, main);
  assert.equal(same(root(wt), wt), true, 'worktree');
  assert.equal(same(root(main), main), true, 'main');
}));

test('W-1 inLinkedWorktree is true for the worktree, false for the main checkout', git, () => withRepo(({ main, wt }) => {
  const is = (dir) => esm(`console.log(m.inLinkedWorktree(${JSON.stringify(dir)}))`, main, main);
  assert.equal(is(wt), 'true');
  assert.equal(is(main), 'false');
}));

test('W-1 inLinkedWorktree is false for a folder that is not a repo', git, () => withRepo(({ main }) => {
  const plain = tmp('wt-plain-');
  try {
    assert.equal(esm(`console.log(m.inLinkedWorktree(${JSON.stringify(plain)}))`, main, main), 'false');
  } finally { fs.rmSync(plain, { recursive: true, force: true }); }
}));

// ---------- W-2 ----------

test('W-2 findRoot keeps base for an unrelated repo, a folder outside any repo and a missing folder', git, () => withRepo(({ main, other }) => {
  const plain = tmp('wt-plain-');
  try {
    assert.equal(same(findRootIn(other, main, main), main), true, 'unrelated repo');
    assert.equal(same(findRootIn(plain, main, main), main), true, 'outside any repo');
    assert.equal(same(findRootIn(path.join(plain, 'nope', 'missing'), main, main), main), true, 'missing folder');
  } finally { fs.rmSync(plain, { recursive: true, force: true }); }
}));

test('W-2 findRoot returns base when base is not a git repo', git, () => withRepo(({ wt }) => {
  const plain = tmp('wt-plain-');
  try {
    assert.equal(same(findRootIn(wt, plain, plain), plain), true);
  } finally { fs.rmSync(plain, { recursive: true, force: true }); }
}));

// ---------- W-3 ----------

test('W-3 findRoot() without an argument uses the process cwd: worktree cwd, main env gives the worktree root', git, () => withRepo(({ main, wt }) => {
  assert.equal(same(findRootIn(undefined, wt, main), wt), true, 'worktree');
  assert.equal(same(findRootIn(undefined, main, main), main), true, 'main');
}));

// ---------- W-4 ----------

test('W-4 structure-guard: the map is applied relative to the worktree (allowed, clutter, off-map)', git, () => withRepo(({ main, wt }) => {
  const run = (rel) => hook('structure-guard.mjs', writeInput(path.join(wt, rel), wt), wt, main);
  const ok = run('src/x.ts');
  assert.equal(ok.stdout, '', 'allowed by the map: no decision');
  assert.equal(decisionOf(run('x.bak')), 'deny', 'clutter');
  assert.equal(decisionOf(run('lib/y.ts')), 'ask', 'off the worktree map (the main path would sit under .claude/**)');
}));

test('W-4 structure-guard: the worktree own structure.json is the one read', git, () => withRepo(({ main, wt }) => {
  write(wt, '.claude/structure.json', '{"allow":["src/**","docs/**",".claude/**"],"deny":["**/*.bak","src/blocked/**"]}');
  const r = hook('structure-guard.mjs', writeInput(path.join(wt, 'src', 'blocked', 'z.ts'), wt), wt, main);
  assert.equal(decisionOf(r), 'deny');
}));

// ---------- W-5 ----------

const commitInput = (cwd) => ({ tool_name: 'Bash', tool_input: { command: 'git commit -am "x"' }, cwd });

test('W-5 commit-gate: a change only in the main checkout does not count for a commit in the worktree', git, () => withRepo(({ main, wt }) => {
  write(main, 'src/dirty.js', 'export const d = 1;\n');
  const r = hook('commit-gate.mjs', commitInput(wt), wt, main);
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.equal(r.stdout, '', 'no decision');
}));

test('W-5 commit-gate: a change in the worktree is reviewed there (stopped without board approval)', git, () => withRepo(({ main, wt }) => {
  write(wt, 'src/dirty.js', 'export const d = 1;\n');
  const r = hook('commit-gate.mjs', commitInput(wt), wt, main);
  assert.equal(r.status, 2, `${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /the board has not reviewed these changes \(1 files\)/);
}));

// ---------- W-6 ----------

test('W-6 structure-guard: in the worktree the four shared state files are asked (new and existing)', git, () => withRepo(({ main, wt }) => {
  for (const f of FOUR) {
    const full = path.join(wt, f);
    assert.equal(decisionOf(hook('structure-guard.mjs', writeInput(full, wt), wt, main)), 'ask', `existing ${f}`);
    fs.rmSync(full);
    assert.equal(decisionOf(hook('structure-guard.mjs', writeInput(full, wt), wt, main)), 'ask', `new ${f}`);
  }
}));

test('W-6 structure-guard: in the main checkout the same four files give no decision (new and existing)', git, () => withRepo(({ main }) => {
  for (const f of FOUR) {
    const full = path.join(main, f);
    const existing = hook('structure-guard.mjs', writeInput(full, main), main, main);
    assert.equal(existing.stdout, '', `existing ${f}`);
    fs.rmSync(full);
    const fresh = hook('structure-guard.mjs', writeInput(full, main), main, main);
    assert.equal(fresh.stdout, '', `new ${f}`);
  }
}));

// ---------- W-7 ----------

test('W-7 gate approval: records are per worktree; main approval does not cover the worktree, a worktree approval does not touch main', git, async () => {
  const { approvalPath, approve, isApproved } = await import(pathToFileURL(path.join(HOOKS, 'gate.mjs')).href);
  await withRepo(async ({ main, wt }) => {
    const files = [approvalPath(main), approvalPath(wt)];
    try {
      assert.notEqual(approvalPath(wt), approvalPath(main), 'different paths');
      approve(main);
      assert.equal(isApproved(main), true, 'main approved');
      assert.equal(isApproved(wt), false, 'worktree has no record of its own');
      write(wt, 'AGENTS.md', AGENTS('node -e "process.exit(1)"'));
      assert.equal(isApproved(wt), false, 'changed command, still no record');
      approve(wt);
      assert.equal(isApproved(wt), true, 'worktree approved with its own list');
      assert.equal(isApproved(main), true, 'main governed by its own record');
    } finally {
      for (const f of files) fs.rmSync(f, { force: true });
    }
  });
});

// ---------- W-8 ----------

const PARALLEL = path.join(ROOT, '.claude', 'commands', 'parallel.md');

test('W-8 parallel.md: holds the exact command tokens', () => {
  assert.equal(fs.existsSync(PARALLEL), true, 'parallel.md exists');
  const text = fs.readFileSync(PARALLEL, 'utf8');
  const tokens = ['claude -w', '.worktreeinclude', 'docs/product/tasks/', 'gh pr create', 'gh pr checks --watch', 'git merge --no-ff', '--no-commit',
    'merge-base --is-ancestor', 'git worktree remove', 'git branch -d'];
  assert.deepEqual(tokens.filter((t) => !text.includes(t)), []);
});

test('W-8 parallel.md: never --force and never branch -D', () => {
  assert.equal(fs.existsSync(PARALLEL), true, 'parallel.md exists');
  const text = fs.readFileSync(PARALLEL, 'utf8');
  assert.equal(text.includes('--force'), false, 'no --force');
  assert.equal(text.includes('branch -D'), false, 'no branch -D');
});

test('W-8 parallel.md: a try/* branch is never pushed', () => {
  assert.equal(fs.existsSync(PARALLEL), true, 'parallel.md exists');
  const text = fs.readFileSync(PARALLEL, 'utf8');
  assert.equal(/try\/\*[^\n]*never[^\n]*push/i.test(text) || /try\/\*[^\n]*push[^\n]*never/i.test(text), true);
});

// ---------- W-9 ----------

test('W-9 tools.mjs: CORE_COMMANDS includes parallel', async () => {
  const { CORE_COMMANDS } = await import(pathToFileURL(path.join(HOOKS, 'tools.mjs')).href);
  assert.equal(CORE_COMMANDS.includes('parallel'), true);
});

test('W-9 .gitignore and kit/project/gitignore each ignore .claude/worktrees/', () => {
  for (const f of ['.gitignore', 'kit/project/gitignore']) {
    const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split(/\r?\n/).map((l) => l.trim());
    assert.equal(lines.includes('.claude/worktrees/'), true, `${f} has the line`);
  }
});

test('W-9 templates: the structure map of each stack allows docs/product/tasks/T-1.md', async () => {
  const { globRegex } = await import(pathToFileURL(path.join(HOOKS, 'structure-guard.mjs')).href);
  for (const stack of ['backend', 'mobile', 'web-saas']) {
    const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit', 'templates', stack, '.claude', 'structure.json'), 'utf8'));
    assert.equal(map.allow.some((g) => globRegex(g).test('docs/product/tasks/T-1.md')), true, `${stack} allows the task file`);
  }
});

test('W-9 AGENTS.md rule 6 mentions /parallel', () => {
  const line = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8').split(/\r?\n/).find((l) => l.startsWith('6. **Plan first'));
  assert.equal(typeof line, 'string', 'rule 6 line exists');
  assert.equal(line.includes('/parallel'), true);
});

// ---------- attack tests (security review of 3.70) ----------

const fwd = (p) => p.replace(/\\/g, '/');
const quoted = (p) => (/\s/.test(p) ? `"${fwd(p)}"` : fwd(p));
const bashInput = (command, cwd) => ({ tool_name: 'Bash', tool_input: { command }, cwd });
const editInput = (file, from, to, cwd) => ({ tool_name: 'Edit', tool_input: { file_path: file, old_string: from, new_string: to }, cwd });
// An environment where git cannot start: PATH (any spelling) is an empty folder
const noGitEnv = (main, empty) => {
  const e = envFor(main);
  for (const k of Object.keys(e)) if (/^path$/i.test(k)) delete e[k];
  e.PATH = empty;
  e.Path = empty;
  return e;
};

// W-11: a command run from a worktree must not be able to write the main checkout's protected files
test('W-11 ATTACK: from the worktree, a redirect into the main checkout hooks or AGENTS.md is asked or denied', git, () => withRepo(({ main, wt }) => {
  for (const rel of ['.claude/hooks/commit-gate.mjs', 'AGENTS.md']) {
    const r = hook('destructive-guard.mjs', bashInput(`echo x > ${quoted(path.join(main, rel))}`, wt), wt, main);
    assert.equal(['ask', 'deny'].includes(decisionOf(r)), true, `${rel}: ${r.stdout}${r.stderr}`);
  }
}));

test('W-11 control: a redirect to a plain file inside the worktree gives no decision', git, () => withRepo(({ main, wt }) => {
  const r = hook('destructive-guard.mjs', bashInput('echo x > src/a.txt', wt), wt, main);
  assert.equal(r.stdout, '');
}));

// W-12: the commit review switch of the main checkout is the user's call, from any session
test('W-12 ATTACK: from the worktree, turning Commit review off in the main board.md is asked', git, () => withRepo(({ main, wt }) => {
  const r = hook('freeze-guard.mjs', editInput(path.join(main, 'docs', 'workflow', 'board.md'), '**Commit review:** on', '**Commit review:** off', wt), wt, main);
  assert.equal(decisionOf(r), 'ask', `${r.stdout}${r.stderr}`);
}));

test('W-12 control: the same edit to the worktree own board.md is asked', git, () => withRepo(({ main, wt }) => {
  const r = hook('freeze-guard.mjs', editInput(path.join(wt, 'docs', 'workflow', 'board.md'), '**Commit review:** on', '**Commit review:** off', wt), wt, main);
  assert.equal(decisionOf(r), 'ask', `${r.stdout}${r.stderr}`);
}));

// W-13: the shared-docs ask and the map follow the file, not the session
test('W-13 ATTACK: from the worktree, a write to the main checkout progress.md (absolute path) is asked', git, () => withRepo(({ main, wt }) => {
  const r = hook('structure-guard.mjs', writeInput(path.join(main, 'docs', 'workflow', 'progress.md'), wt), wt, main);
  assert.equal(decisionOf(r), 'ask', `${r.stdout}${r.stderr}`);
}));

test('W-13 ATTACK: on Windows a differently cased path to the shared docs is still asked', { skip: !HAS_GIT ? git.skip : process.platform !== 'win32' && 'win32 only (case-insensitive file system)' }, () => withRepo(({ main, wt }) => {
  const r = hook('structure-guard.mjs', writeInput(path.join(wt, 'Docs', 'Workflow', 'Progress.md'), wt), wt, main);
  assert.equal(decisionOf(r), 'ask', `${r.stdout}${r.stderr}`);
}));

test('W-13 ATTACK: from the worktree, a new clutter file in the main checkout is denied by main\'s map', git, () => withRepo(({ main, wt }) => {
  const r = hook('structure-guard.mjs', writeInput(path.join(main, 'x.bak'), wt), wt, main);
  assert.equal(decisionOf(r), 'deny', `${r.stdout}${r.stderr}`);
}));

// W-14: root detection must not depend on a git program that an attacker's PATH can hide or replace
test('W-14 ATTACK: without git on PATH the worktree is still found and inLinkedWorktree still answers', git, () => withRepo(({ main, wt }) => {
  const empty = tmp('wt-empty-');
  try {
    const env = noGitEnv(main, empty);
    assert.equal(same(findRootIn(wt, main, main, env), wt), true, 'findRoot(worktree)');
    assert.equal(esm(`console.log(m.inLinkedWorktree(${JSON.stringify(wt)}))`, main, main, env), 'true', 'worktree');
    assert.equal(esm(`console.log(m.inLinkedWorktree(${JSON.stringify(main)}))`, main, main, env), 'false', 'main');
  } finally { fs.rmSync(empty, { recursive: true, force: true }); }
}));

test('W-14 ATTACK: a folder whose .git file names the worktree admin dir but is not linked back is not a worktree', git, () => withRepo(({ main, wt }) => {
  const fake = path.join(main, '.claude', 'worktrees', 'fake');
  write(fake, '.git', `gitdir: ${fwd(main)}/.git/worktrees/wt\n`);
  const empty = tmp('wt-empty-');
  try {
    for (const [label, env] of [['git on PATH', envFor(main)], ['no git', noGitEnv(main, empty)]]) {
      assert.equal(same(findRootIn(fake, main, main, env), main), true, `${label}: findRoot returns base`);
      assert.equal(esm(`console.log(m.inLinkedWorktree(${JSON.stringify(fake)}))`, main, main, env), 'false', `${label}: inLinkedWorktree`);
    }
    // The real worktree is untouched by the forged neighbour
    assert.equal(same(findRootIn(wt, main, main), wt), true, 'real worktree still found');
  } finally { fs.rmSync(empty, { recursive: true, force: true }); }
}));

// W-19: a consistent back link is not enough, the admin dir must sit inside the main repo's own .git/worktrees/
test('W-19 ATTACK: a forged worktree outside the repo .git/worktrees (admin dir elsewhere, consistent back link) is not a worktree', git, () => withRepo(({ main, wt }) => {
  const forgedRoot = tmp('wt-forged-');
  const admin = tmp('wt-admin-');
  const empty = tmp('wt-empty-');
  try {
    write(forgedRoot, '.git', `gitdir: ${fwd(admin)}\n`);
    write(admin, 'commondir', `${fwd(path.join(main, '.git'))}\n`);
    write(admin, 'gitdir', `${fwd(path.join(forgedRoot, '.git'))}\n`);
    write(admin, 'HEAD', fs.readFileSync(path.join(main, '.git', 'HEAD'), 'utf8'));
    for (const [label, env] of [['git on PATH', envFor(main)], ['no git', noGitEnv(main, empty)]]) {
      assert.equal(same(findRootIn(forgedRoot, main, main, env), main), true, `${label}: findRoot returns base`);
      assert.equal(esm(`console.log(m.inLinkedWorktree(${JSON.stringify(forgedRoot)}))`, main, main, env), 'false', `${label}: inLinkedWorktree`);
      assert.equal(same(findRootIn(wt, main, main, env), wt), true, `${label}: the real worktree still resolves to itself`);
    }
  } finally { for (const d of [forgedRoot, admin, empty]) fs.rmSync(d, { recursive: true, force: true }); }
}));

// W-15: commands that open a worktree or merge a PR leave the machine or the branch layout: the user is asked
test('W-15 ATTACK: git worktree add in the main checkout is asked', git, () => withRepo(({ main }) => {
  const r = hook('destructive-guard.mjs', bashInput('git worktree add .claude/worktrees/p -b p', main), main, main);
  assert.equal(decisionOf(r), 'ask', `${r.stdout}${r.stderr}`);
}));

test('W-15 ATTACK: gh pr merge is asked', git, () => withRepo(({ main }) => {
  const r = hook('destructive-guard.mjs', bashInput('gh pr merge 3 --merge', main), main, main);
  assert.equal(decisionOf(r), 'ask', `${r.stdout}${r.stderr}`);
}));

// W-16
test('W-16 settings.json: permissions.ask lists gh pr create and gh pr merge', () => {
  const ask = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8')).permissions.ask;
  assert.deepEqual(['Bash(gh pr create:*)', 'Bash(gh pr merge:*)'].filter((x) => !ask.includes(x)), []);
});

// W-17
test('W-17 parallel.md: checks the branch name, the changed files, the worktree list and logs the cost', () => {
  assert.equal(fs.existsSync(PARALLEL), true, 'parallel.md exists');
  const text = fs.readFileSync(PARALLEL, 'utf8');
  assert.deepEqual(['^worktree-', 'git diff --name-only main...', 'git worktree list --porcelain', 'docs/workflow/cost-log.md'].filter((t) => !text.includes(t)), []);
});

// W-18: in a worktree the relative path is the worktree's own copy of the hook, only the main checkout's copy is the kit's
test('W-18 ATTACK: node .claude/hooks/commit-gate.mjs --approve from the worktree is not the own hook (gets a decision)', git, () => withRepo(({ main, wt }) => {
  const r = hook('commit-gate.mjs', bashInput('node .claude/hooks/commit-gate.mjs --approve', wt), wt, main);
  assert.equal(['ask', 'deny'].includes(decisionOf(r)), true, `${r.stdout}${r.stderr}`);
}));

test('W-18 the main checkout copy by absolute path is the own hook (no decision)', git, () => withRepo(({ main, wt }) => {
  const r = hook('commit-gate.mjs', bashInput(`node "${fwd(path.join(main, '.claude', 'hooks', 'commit-gate.mjs'))}" --approve`, wt), wt, main);
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.equal(r.stdout, '', 'no decision');
}));
