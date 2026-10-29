// Run: node --test "kit/tests/*.test.mjs"
// Scope shield (F-06): while an approved plan is active, a write to an existing file not on the list is asked; work without a plan is silent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { permissionEquivalent } from '../../.claude/hooks/destructive-guard.mjs';
import { approvalPath } from '../../.claude/hooks/gate.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');
let p, HOOK;
const write = (f, s = 'x') => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
const cli = (...a) => spawnSync(process.execPath, [HOOK, ...a], { cwd: p, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
const hook = (input, env = { CLAUDE_PROJECT_DIR: p }) => {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), cwd: p, encoding: 'utf8', env: { ...process.env, ...env } });
  if (!r.stdout.trim()) return null;
  const o = JSON.parse(r.stdout);
  return { decision: o.decision ?? o.hookSpecificOutput.permissionDecision, reason: o.reason ?? o.hookSpecificOutput.permissionDecisionReason };
};
const edit = (file) => hook({ tool_name: 'Edit', cwd: p, tool_input: { file_path: path.isAbsolute(file) ? file : path.join(p, file), old_string: 'x', new_string: 'y' } });

before(() => {
  p = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-'));
  // On Codex the project root comes from the script's location: hooks are copied into the temporary project
  fs.cpSync(HOOKS, path.join(p, '.claude', 'hooks'), { recursive: true });
  HOOK = path.join(p, '.claude', 'hooks', 'freeze-guard.mjs');
  for (const f of ['src/a.ts', 'src/b.ts', 'src/lib/c.ts', 'src/ödeme dosyası.ts', 'docs/note.md', 'CHANGELOG.md']) write(f);
});
after(() => { fs.rmSync(approvalPath(p), { force: true }); fs.rmSync(p, { recursive: true, force: true }); });

test('F-06 silent without a plan; once a plan is saved an existing file off the list is asked', () => {
  assert.equal(edit('src/b.ts'), null, 'work without a plan');
  const r = cli('--plan-save', 'G-1', 'src/a.ts', 'src/lib/', 'src/ödeme dosyası.ts');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(edit('src/a.ts'), null);
  assert.equal(edit('src/lib/c.ts'), null, 'folder prefix');
  assert.equal(edit('src/ödeme dosyası.ts'), null, 'Turkish path with spaces');
  const off = edit('src/b.ts');
  assert.equal(off.decision, 'ask');
  assert.match(off.reason, /Scope shield.*src\/b\.ts.*G-1/);
  assert.equal(edit(path.join(p, 'src/b.ts')).decision, 'ask', 'absolute path');
  assert.equal(edit('src/lib/../b.ts').decision, 'ask', 'with ..');
  assert.equal(edit('src/new.ts'), null, 'new file: the structure guard looks at it');
  assert.equal(edit('docs/note.md'), null, 'docs is free');
  assert.equal(edit('CHANGELOG.md'), null);
  assert.match(cli('--status').stdout, /G-1.*3 paths/);
});

test('F-06 an active plan does not widen without a question; add and end work; the shield asks on add', () => {
  const again = cli('--plan-save', 'G-2', 'src/b.ts');
  assert.equal(again.status, 1);
  assert.match(again.stderr, /plan is active/);
  assert.equal(edit('src/b.ts').decision, 'ask', 'list unchanged');
  assert.equal(permissionEquivalent('node .claude/hooks/freeze-guard.mjs --plan-add src/b.ts')?.decision, 'ask', 'Codex/Antigravity equivalent');
  assert.equal(permissionEquivalent('node .claude/hooks/freeze-guard.mjs --plan-end')?.decision, 'ask', '3.28.0: closing the shield is asked too');
  assert.equal(permissionEquivalent('node .claude/hooks/freeze-guard.mjs --plan-save G-2 src/')?.decision, 'ask', '--plan-end + --plan-save must not widen unasked');
  assert.equal(cli('--plan-add', 'src/b.ts').status, 0);
  assert.equal(edit('src/b.ts'), null);
  assert.equal(cli('--plan-add', '../dis.ts').status, 1, 'a path outside the project is not added');
  assert.equal(cli('--plan-end').status, 0);
  assert.equal(edit('src/lib/c.ts'), null);
  assert.equal(cli('--plan-add', 'src/b.ts').status, 1, 'nothing to add to without a plan');
});

test('F-06 Codex and Antigravity; the lock comes first; a broken plan file does not crash', () => {
  cli('--plan-save', 'G-3', 'src/a.ts');
  const codex = hook({ tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: '*** Begin Patch\n*** Update File: src/b.ts\n@@\n-x\n+y\n*** End Patch' } }, { CLAUDE_PROJECT_DIR: '' });
  assert.equal(codex?.decision, 'deny', 'Codex: ask is denied and asked');
  const del = hook({ tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: '*** Begin Patch\n*** Delete File: src/b.ts\n*** End Patch' } }, { CLAUDE_PROJECT_DIR: '' });
  assert.equal(del?.decision, 'deny');
  const ag = hook({ toolCall: { name: 'replace_file_content', args: { TargetFile: path.join(p, 'src/b.ts'), TargetContent: 'x', ReplacementContent: 'y' } }, workspacePaths: [p] }, { CLAUDE_PROJECT_DIR: '' });
  assert.equal(ag?.decision, 'ask');
  cli('--set', 'src/lib');
  assert.equal(edit('src/a.ts').decision, 'deny', 'in the plan but outside the lock');
  fs.rmSync(path.join(p, '.claude/state/freeze.json'));
  fs.writeFileSync(path.join(p, '.claude/state/plan.json'), '{broken');
  assert.equal(edit('src/b.ts'), null);
  cli('--plan-end');
});

test('F-06 audit: a quoted mode is asked too; called from a subfolder the plan is written to the project root', () => {
  for (const k of ["node .claude/hooks/freeze-guard.mjs '--plan-add' x", 'node ".claude/hooks/freeze-guard.mjs" "--plan-add" x', "node .claude/hooks/freeze-guard.mjs '--off'"])
    assert.equal(permissionEquivalent(k)?.decision, 'ask', k);
  fs.mkdirSync(path.join(p, 'src', 'alt'), { recursive: true });
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  const r = spawnSync(process.execPath, [HOOK, '--plan-save', 'G-9', 'src/b.ts'], { cwd: path.join(p, 'src', 'alt'), encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(p, '.claude/state/plan.json')), 'at the root');
  assert.ok(!fs.existsSync(path.join(p, 'src/alt/.claude')), 'not in the subfolder');
  assert.equal(edit('src/b.ts'), null, 'plan paths are relative to the project root');
  cli('--plan-end');
});

test('3.17.0 the pre-3.15 plan flags are unknown flags (an error, not a silent no-op); an old plan.json is not read', () => {
  for (const flag of ['--plan-kaydet', '--plan-ekle', '--plan-bitir']) {
    const r = cli(flag, 'G-10', 'src/a.ts');
    assert.equal(r.status, 1, flag);
    assert.match(r.stderr, /Unknown flag/, flag);
  }
  assert.ok(!fs.existsSync(path.join(p, '.claude/state/plan.json')), 'no plan was saved');
  assert.equal(permissionEquivalent('node .claude/hooks/freeze-guard.mjs --plan-ekle src/b.ts'), null, 'Codex/Antigravity: no rule for a flag that does nothing');
  fs.writeFileSync(path.join(p, '.claude/state/plan.json'), JSON.stringify({ gorev: 'G-11', yollar: ['src/a.ts'] }));
  assert.equal(edit('src/b.ts'), null, 'pre-3.15 keys: no plan');
  cli('--plan-end');
});

// 3.14.1: a shell command (sed -i, mv, >, Set-Content…) that changes an existing file outside the plan or lock is asked
const shell = (command, dir = p) => {
  const r = spawnSync(process.execPath, [path.join(p, '.claude', 'hooks', 'destructive-guard.mjs')], { input: JSON.stringify({ tool_name: 'Bash', cwd: dir, tool_input: { command } }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
};

test('3.14.1 shell: while a plan is active a shell write to an existing file off the list is asked', () => {
  assert.equal(shell('sed -i s/x/y/ src/b.ts'), null, 'silent without a plan');
  cli('--plan-save', 'G-4', 'src/a.ts');
  for (const k of ['sed -i s/x/y/ src/b.ts', 'echo y > src/b.ts', 'echo y >> src/b.ts', 'mv src/b.ts src/b2.ts', 'git checkout -- src/b.ts',
    'sed -i s/x/y/ "src/ödeme dosyası.ts"', 'cd src && sed -i s/x/y/ b.ts', 'Set-Content -Path src/b.ts -Value y']) {
    const r = shell(k);
    assert.equal(r?.permissionDecision, 'ask', k);
    assert.match(r.permissionDecisionReason, /Scope shield/, k);
  }
  assert.equal(shell('sed -i s/x/y/ b.ts', path.join(p, 'src'))?.permissionDecision, 'ask', 'relative to the session cwd');
  for (const k of ['sed -i s/x/y/ src/a.ts', 'cat src/b.ts', 'grep x src/b.ts > /dev/null', 'echo y > src/new.ts', 'echo y > docs/not.md', 'node --test 2>&1'])
    assert.equal(shell(k), null, k);
  cli('--plan-end');
});

test('3.14.1 shell: a shell write outside the lock is asked', () => {
  cli('--set', 'src/lib');
  const r = shell('rm src/a.ts');
  assert.equal(r?.permissionDecision, 'ask');
  assert.match(r.permissionDecisionReason, /Edit lock/);
  assert.equal(shell('sed -i s/x/y/ src/lib/c.ts'), null);
  fs.rmSync(path.join(p, '.claude/state/freeze.json'));
});

test('3.14.1 symlink/junction: a file outside cannot be written from inside the plan or lock', () => {
  const link = path.join(p, 'src', 'lib', 'up');
  fs.symlinkSync(p, link, 'junction');
  try {
    cli('--plan-save', 'G-5', 'src/lib/');
    assert.equal(edit('src/lib/up/src/b.ts')?.decision, 'ask', 'real path is src/b.ts');
    cli('--plan-end');
    cli('--set', 'src/lib');
    assert.equal(edit('src/lib/up/src/b.ts')?.decision, 'deny');
    fs.rmSync(path.join(p, '.claude/state/freeze.json'));
    const codex = hook({ tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: '*** Begin Patch\n*** Update File: src/lib/up/AGENTS.md\n@@\n-x\n+y\n*** End Patch' } }, { CLAUDE_PROJECT_DIR: '' });
    assert.equal(codex?.decision, 'deny');
    assert.match(codex.reason, /AGENTS\.md:/, 'a protected file stays protected through a link');
  } finally {
    try { fs.unlinkSync(link); } catch { fs.rmdirSync(link); }
  }
});

test('3.14.1 audit: MSYS paths, globs, variables, root targets, subshells and the wide writer list are asked', () => {
  cli('--plan-save', 'G-7', 'src/a.ts');
  const asked = [
    'sed -i s/x/y/ src/*.ts', 'rm -r src/*', 'mv * ../', 'sed -i s/x/y/ $PWD/src/b.ts', 'sed -i s/x/y/ `pwd`/src/b.ts',
    'git checkout .', 'git restore .', 'git checkout -- .', 'echo x >| src/b.ts', 'ln -sf x src/b.ts', 'curl -o src/b.ts http://x',
    'dd if=/dev/zero of=src/b.ts', 'git apply x.patch', 'git stash', 'patch -p1 < x.patch', '(cd src && sed -i s/x/y/ b.ts)',
    'pushd src && sed -i s/x/y/ b.ts', 'npx prettier --write src/b.ts', 'npx eslint --fix src/b.ts',
  ];
  if (process.platform === 'win32') asked.push(`sed -i s/x/y/ /${p[0].toLowerCase()}${p.slice(2).replace(/\\/g, '/')}/src/b.ts`);
  for (const k of asked) assert.equal(shell(k)?.permissionDecision, 'ask', k);
  for (const k of ['grep -rn tee src', "sed -i 's/a*/b/' src/a.ts", "sed -i 's/$/x/' src/a.ts", 'git status', 'npx prettier --check src/b.ts'])
    assert.equal(shell(k), null, k);
  cli('--plan-end');
});

test('3.14.1 audit: kit guard state files cannot be changed from the shell (the lock and plan must not close via Bash)', () => {
  for (const k of ['rm .claude/state/plan.json', 'echo {} > .claude/state/freeze.json', 'echo {} > .claude/state/gate.json', 'rm -f .claude/state/commit-approval.json'])
    assert.equal(shell(k)?.permissionDecision, 'ask', k);
  const codex = hook({ tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: '*** Begin Patch\n*** Update File: .git\n@@\n-x\n+y\n*** End Patch' } }, { CLAUDE_PROJECT_DIR: '' });
  assert.equal(codex?.decision, 'deny', 'the worktree .git pointer file is protected');
});

test('3.14.1 re-audit: cd resolution, shell wrappers, combined flags, guard folders', () => {
  cli('--set', 'src/lib');
  const msys = `/${p[0].toLowerCase()}${p.slice(2).replace(/\\/g, '/')}`;
  const asked = [
    'cd $PWD/src && rm a.ts', 'cd "$(pwd)/src" && rm a.ts', '(cd src/lib); rm CHANGELOG.md', 'cd missing || rm CHANGELOG.md',
    'cd', 'Set-Location src; rm a.ts', 'rm {src/a.ts,x}', 'rm src/{a,b}.ts', "rm sr'c'/a.ts", '\\rm src/a.ts', `rm ~/${path.relative(os.homedir(), p).split(path.sep).join('/')}/src/a.ts`,
    'bash -c "rm src/a.ts"', "sh -c 'sed -i s/x/y/ src/a.ts'", 'find src -delete', 'find src -name x -exec rm {} ;', 'ls | xargs rm',
    'git checkout main', 'git switch main', 'curl -sSLo src/a.ts http://x', 'curl -osrc/a.ts http://x', 'wget -qO src/a.ts http://x',
    'tar -xf x.tar', 'unzip x.zip', 'rsync -a x/ src/',
  ];
  if (process.platform === 'win32') asked.push(`cd ${msys}/src && rm a.ts`);
  for (const k of asked) assert.equal(shell(k)?.permissionDecision, 'ask', k);
  for (const k of ['cd src/lib && sed -i s/x/y/ c.ts', 'pushd src/lib && sed -i s/x/y/ c.ts && popd', 'git checkout -- src/lib/c.ts', 'git status'])
    assert.equal(shell(k), null, k);
  fs.rmSync(path.join(p, '.claude/state/freeze.json'));
  cli('--plan-save', 'G-8', 'src/a.ts');
  for (const k of ['rm -r .claude/state', 'rm .claude/state/*', 'cp x .claude/state/', 'tar -C .claude/state -xf x.tar', 'echo x > .git/hooks/pre-commit', 'sed -i s/a/b/ AGENTS.md', 'echo x > .claude/settings.json'])
    assert.equal(shell(k)?.permissionDecision, 'ask', k);
  cli('--plan-end');
  assert.equal(shell('echo x > .git/hooks/pre-commit')?.permissionDecision, 'ask', 'without a plan too');
  assert.equal(shell('echo SIR=1 > .env')?.permissionDecision, 'deny', '.env is not written from the shell either');
});

test('AC-48.8 guards: ~/.vibe-kit/preferences.md gets the personal-preferences message', () => {
  // the hooks only decide here; nothing is written to the home folder
  for (const f of ['preferences.md']) {
    for (const k of [`echo x > ~/.vibe-kit/${f}`, `rm ~/.vibe-kit/${f}`, `cp x.md ~/.vibe-kit/${f}`]) {
      const s = shell(k);
      assert.equal(s?.permissionDecision, 'ask', k);
      assert.match(s.permissionDecisionReason, /prefs\.mjs --add \/ --remove/, k);
      assert.doesNotMatch(s.permissionDecisionReason, /gate\.mjs --approve/, k);
    }
    const e = edit(path.join(os.homedir(), '.vibe-kit', f));
    assert.equal(e?.decision, 'ask', `file tool: ${f}`);
    assert.match(e.reason, /prefs\.mjs --add \/ --remove/, `file tool: ${f}`);
    assert.doesNotMatch(e.reason, /gate\.mjs --approve/, `file tool: ${f}`);
  }
  // the gate approval record keeps its own message
  assert.match(shell('echo {} > ~/.vibe-kit/gate-approval/x.json').permissionDecisionReason, /gate\.mjs --approve/);
  assert.match(edit(approvalPath(p)).reason, /gate\.mjs --approve/);
});

test('3.14.3 an unresolvable target that names a rule file is asked even without a lock/plan; local UNC is converted', () => {
  write('AGENTS.md', '# x');
  const asked = ['echo x > $D/AGENTS.md', 'sed -i s/a/b/ {AGENTS,X}.md', 'cp x `pwd`/.claude/settings.json',
    `echo x > \\\\?\\${p}\\AGENTS.md`];
  if (process.platform === 'win32') asked.push(`echo x > \\\\localhost\\${p[0]}$\\${p.slice(3)}\\AGENTS.md`);
  for (const k of asked) assert.equal(shell(k)?.permissionDecision, 'ask', k);
  for (const k of ['echo x > $OUT', 'echo $HOME > out.txt']) assert.equal(shell(k), null, k);
  assert.equal(shell('echo {} > ~/.vibe-kit/gate-approval/x.json')?.permissionDecision, 'ask', 'the approval record in the user folder');
  assert.equal(shell('echo {} > ~/.vibe-kit/kapi-onayi/x.json')?.permissionDecision, 'ask', 'the pre-3.15 approval folder');
  assert.equal(edit(`${approvalPath(p)}`)?.decision, 'ask', 'via a file tool too');
  // 3.14.4: a glob resolves to the home folder, a link to its real path; a device path is converted only with a drive letter
  const vk = path.dirname(path.dirname(approvalPath(p)));
  fs.mkdirSync(vk, { recursive: true });
  const link = path.join(p, 'vkbag');
  fs.symlinkSync(vk, link, 'junction');
  try {
    for (const k of ['rm ~/.v*/gate-approval/x.json', 'echo {} > vkbag/gate-approval/x.json', 'echo x > \\\\?\\GLOBALROOT\\x\\AGENTS.md', 'echo x > \\\\?\\UNC\\srv\\s\\AGENTS.md'])
      assert.equal(shell(k)?.permissionDecision, 'ask', k);
  } finally {
    try { fs.unlinkSync(link); } catch { fs.rmdirSync(link); }
  }
});

test('3.14.1 NotebookEdit hits the shield', () => {
  write('src/n.ipynb', '{}');
  cli('--plan-save', 'G-6', 'src/a.ts');
  const r = hook({ tool_name: 'NotebookEdit', cwd: p, tool_input: { notebook_path: path.join(p, 'src/n.ipynb'), new_source: 'x' } });
  assert.equal(r?.decision, 'ask');
  cli('--plan-end');
});
