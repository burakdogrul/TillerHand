// Run: node --test "kit/tests/*.test.mjs"
// Deterministic gate (F-03): lint, type, test and Semgrep feed the board; a red result stops the commit.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readCommands, approvalPath } from '../../.claude/hooks/gate.mjs';
import { permissionEquivalent, evaluate } from '../../.claude/hooks/destructive-guard.mjs';
import { maskOwnHook } from '../../.claude/hooks/commit-gate.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');
let p;
const env = () => ({ ...process.env, CLAUDE_PROJECT_DIR: p, SEMGREP: 'olmayan-semgrep-komutu' });
const gate = (...a) => spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), ...a], { cwd: p, encoding: 'utf8', env: env() });
// Command approval has its own test; elsewhere the user counts as having approved the commands
const runGate = () => (gate('--approve'), gate('--run'));
const commit = (command = 'git commit -m x') => spawnSync(process.execPath, [path.join(HOOKS, 'commit-gate.mjs')], { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8', env: env() });
const approve = (note) => spawnSync(process.execPath, [path.join(HOOKS, 'commit-gate.mjs'), '--approve', note], { encoding: 'utf8', env: env() });
const skip = (note) => spawnSync(process.execPath, [path.join(HOOKS, 'commit-gate.mjs'), '--skip', note], { encoding: 'utf8', env: env() });
const sh = (c) => execSync(c, { cwd: p, stdio: 'ignore' });
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
const agents = (test) => write('AGENTS.md', `# X\n\n## Komutlar\n\n\`\`\`bash\ngeliştirme:  [ ]\ntest:        ${test}\nlint:        node -e "console.log('lint temiz')"\ntip kontrol: [ ]\nbuild:       [ ]\n\`\`\`\n`);
const ask = (command) => {
  const r = commit(command);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : null;
};

before(() => {
  p = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
  sh('git init -q && git config user.email t@t && git config user.name t');
  write('docs/workflow/board.md', '**Commit denetimi:** açık\n');
  write('.gitignore', '.claude/state/\n'); // like the kit .gitignore
  write('.claude/agents/board-qa.md', '---\nname: board-qa\n---\n');
  agents('node -e "process.exit(0)"');
  write('a.js', 'x');
  sh('git add . && git commit -qm init');
});
after(() => {
  fs.rmSync(approvalPath(p), { force: true });
  fs.rmSync(p, { recursive: true, force: true });
});

test('F-03 commands come from the AGENTS.md → Komutlar block; an empty one is unset', () => {
  const md = '## Komutlar\n\n```bash\n# /start doldurur\ngeliştirme:  npm run dev\ntest:        npm run test   # vitest\nlint:        [ ]\ntip kontrol: npx tsc --noEmit\nbuild:       npm run build\n```\n';
  assert.deepEqual(readCommands(md), [
    { name: 'lint', command: null }, { name: 'tip kontrol', command: 'npx tsc --noEmit' }, { name: 'test', command: 'npm run test   # vitest' },
  ]);
  assert.deepEqual(readCommands('# başlık yok'), [{ name: 'lint', command: null }, { name: 'tip kontrol', command: null }, { name: 'test', command: null }]);
});

test('F-03 gate: a red check shows its last lines, a green one writes no output, empty and Semgrep are skipped', () => {
  agents('node -e "console.error(\'HATA satiri\'); process.exit(1)"');
  const r = runGate();
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /❌ test/);
  assert.match(r.stdout, /HATA satiri/);
  assert.match(r.stdout, /✅ lint/);
  assert.doesNotMatch(r.stdout, /lint temiz/, 'a green check\'s output costs no tokens');
  assert.match(r.stdout, /tip kontrol.*tanımsız/);
  assert.match(r.stdout, /Semgrep.*atlandı/);
  const state = JSON.parse(fs.readFileSync(path.join(p, '.claude/state/gate.json'), 'utf8'));
  assert.equal(state.passed, false);
  assert.match(state.signature, /^[0-9a-f]{64}$/);
  agents('node -e "process.exit(0)"');
  const green = runGate();
  assert.equal(green.status, 0);
  assert.doesNotMatch(green.stdout, /hiçbir kontrol çalışmadı/);
  fs.renameSync(path.join(p, 'AGENTS.md'), path.join(p, 'AGENTS.yok'));
  const empty = runGate();
  assert.equal(empty.status, 1, '3.14.1: if no check ran the gate is empty, not green');
  assert.match(empty.stdout, /BOŞ.*hiçbir kontrol çalışmadı/);
  assert.doesNotMatch(empty.stdout, /onay/i, 'no command approval is needed when nothing runs');
  assert.equal(JSON.parse(fs.readFileSync(path.join(p, '.claude/state/gate.json'), 'utf8')).empty, true);
  fs.renameSync(path.join(p, 'AGENTS.yok'), path.join(p, 'AGENTS.md'));
});

test('F-03 commit gate: stops if the gate is missing, red or stale; passes with green + approval or "atlandı"', () => {
  sh('git add -A && git commit -qm ara --allow-empty');
  write('a.js', 'y');
  assert.equal(approve('board-qa').status, 0);
  const none = commit();
  assert.equal(none.status, 2);
  assert.match(none.stderr, /gate\.mjs --run/);
  assert.equal(runGate().status, 0);
  assert.equal(commit().status, 0, 'green gate + approval');
  write('a.js', 'z');
  assert.equal(approve('board-qa').status, 0);
  assert.equal(commit().status, 2, 'an old gate result is not used after a change');
  agents('node -e "process.exit(1)"');
  runGate();
  approve('board-qa');
  const red = commit();
  assert.equal(red.status, 2);
  assert.match(red.stderr, /kırmızı/);
  const refused = approve('atlandı: kullanıcı isteği');
  assert.equal(refused.status, 1, '--approve never writes an "atlandı" note (a $\'\\x..\' spelling arrives here decoded)');
  assert.match(refused.stderr, /--skip/);
  assert.equal(commit().status, 2);
  assert.equal(skip('kullanıcı isteği').status, 0);
  assert.equal(commit().status, 0, 'skipped at the user\'s request');
  write('a.js', 'w');
  approve('board-qa');
  fs.writeFileSync(path.join(p, '.claude/state/gate.json'), JSON.stringify({ signature: 'f'.repeat(64), passed: true }));
  assert.equal(commit().status, 2, 'a hand-written green result with a wrong signature does not pass');
});

test('F-03 audit: an untracked new file is in the signature; global git options and chains are caught; a heredoc message is free', () => {
  agents('node -e "process.exit(0)"');
  sh('git add -A && git commit -qm ara2 --allow-empty');
  write('yeni.js', 'yeni');
  assert.equal(commit('git add -A && git commit -m x').status, 2, 'new file only: gate and board are required');
  runGate();
  approve('board-qa');
  const message = "git add -A && git commit -m \"$(cat <<'EOF'\nfeat: x && rm -rf /\nEOF\n)\"";
  assert.equal(commit(message).status, 0, 'a heredoc message is not a chain');
  write('kotu.js', 'gizli');
  assert.equal(commit('git add -A && git commit -m x').status, 2, 'a new file added after approval voids it');
  assert.equal(commit('git --no-pager commit -m x').status, 2);
  assert.equal(commit('git -C . commit -m x').status, 2);
  runGate();
  approve('board-qa');
  const chain = commit("sed -i s/a/b/ a.js && git commit -am x");
  assert.equal(chain.status, 2, 'a chain that changes files before the commit');
  assert.match(chain.stderr, /tek başına/);
  assert.equal(commit('git commit -m "$(rm -rf x)"').status, 2, 'command substitution');
  assert.equal(commit('git commit -m x && git push').status, 2, 'push is a separate command');
  assert.equal(commit('cd . && git add -A && git commit -m x').status, 0, 'commit with cd and git add is free');
});

test('F-03 audit: --skip is put to the user in every spelling', () => {
  assert.equal(ask('node .claude/hooks/commit-gate.mjs --skip "kullanıcı isteği"'), 'ask');
  // B9: a commit message that names --skip is not a --skip: the commit checks still run (no board approval here: stopped)
  write('b9.js', 'b9');
  const b9 = commit('git commit -am "docs: commit-gate.mjs --skip anlatıldı"');
  assert.equal(b9.status, 2, 'not waved through by the --skip ask');
  assert.equal(commit('node .claude/hooks/commit-gate.mjs --skip x && git commit -m y').status, 2, 'a real --skip chained to a commit is stopped');
  fs.rmSync(path.join(p, 'b9.js'));
  assert.equal(ask("node ./.claude/hooks/commit-gate.mjs '--skip'"), 'ask');
  assert.equal(ask('node .claude\\hooks\\commit-gate.mjs --sk""ip x'), 'ask');
  assert.equal(permissionEquivalent('node .claude/hooks/commit-gate.mjs --skip x')?.decision, 'ask', 'Codex/Antigravity');
  assert.equal(ask('node .claude/hooks/commit-gate.mjs --approve "board-qa"'), null);
});

test('3.14.1 an empty gate stops the commit; the user passes with "atlandı"', () => {
  agents('node -e "process.exit(0)"');
  sh('git add -A && git commit -qm ara3 --allow-empty');
  fs.renameSync(path.join(p, 'AGENTS.md'), path.join(p, 'AGENTS.yok'));
  write('a.js', 'bos');
  assert.equal(runGate().status, 1);
  approve('board-qa');
  const r = commit();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /boş/);
  skip('kullanıcı isteği');
  assert.equal(commit().status, 0);
  fs.renameSync(path.join(p, 'AGENTS.yok'), path.join(p, 'AGENTS.md'));
});

test('3.14.1 command approval: a new or changed command does not run unapproved; approving is asked', () => {
  const marker = path.join(p, 'calisti');
  agents(`node -e "require('fs').writeFileSync('calisti', '1')"`);
  const r = gate('--run');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /onay/i);
  assert.match(r.stdout, /writeFileSync/, 'the user sees what they approve');
  assert.ok(!fs.existsSync(marker), 'an unapproved command does not run');
  assert.equal(gate('--approve').status, 0);
  assert.ok(fs.existsSync(approvalPath(p)), '3.14.3: the approval is outside the project, in the user folder');
  assert.ok(!approvalPath(p).startsWith(p), 'no repo or archive can carry an approval');
  assert.equal(gate('--run').status, 0);
  assert.ok(fs.existsSync(marker), 'runs after approval');
  fs.rmSync(marker);
  agents(`node -e "require('fs').writeFileSync('calisti', '2')"`);
  assert.equal(gate('--run').status, 1, 'an old approval does not pass once the command changes');
  assert.ok(!fs.existsSync(marker));
  // A fake approval that came with the repo or an archive (.git, .claude/state) is not read
  for (const y of ['.git/kit-kapi-onayi.json', '.claude/state/kit-kapi-onayi.json']) fs.copyFileSync(approvalPath(p), path.join(p, y));
  assert.equal(gate('--run').status, 1);
  assert.equal(ask('node .claude/hooks/gate.mjs --approve'), 'ask', 'Claude: the hook asks');
  assert.match(JSON.parse(commit('node .claude/hooks/gate.mjs --approve').stdout).hookSpecificOutput.permissionDecisionReason, /writeFileSync/, 'the user sees what they approve');
  assert.equal(ask("node ./.claude/hooks/gate.mjs '--approve'"), 'ask');
  assert.equal(ask('node .claude/hooks/gate.mjs --run'), null);
  // 3.14.2: a command in the chain could change AGENTS.md after the approval prompt (the prompt shows the old list)
  for (const k of ['node -e "1" && node .claude/hooks/gate.mjs --approve', 'cd . ; node .claude/hooks/gate.mjs --approve', 'node .claude/hooks/gate.mjs --approve $(true)',
    'NODE_OPTIONS=--require=./x.js node .claude/hooks/gate.mjs --approve', 'node --require ./x.js .claude/hooks/gate.mjs --approve', 'node .claude/hooks/gate.mjs --approve > >(cat)'])
    assert.equal(ask(k), 'deny', k);
  assert.equal(permissionEquivalent('node .claude/hooks/gate.mjs --approve')?.decision, 'ask', 'Codex/Antigravity');
  assert.equal(permissionEquivalent('echo x > .git/kit-kapi-onayi.json')?.decision, 'ask', '.git is not written from the shell');
  agents('node -e "process.exit(0)"');
});

test('3.14.1 audit: an approval record elsewhere via GIT_DIR cannot be used', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-'));
  execSync('git init --bare -q .', { cwd: bare, stdio: 'ignore' });
  agents('node -e "process.exit(3)"');
  gate('--approve');
  fs.copyFileSync(approvalPath(p), path.join(bare, 'kit-kapi-onayi.json')); // fake approval: exit(3)
  agents('node -e "process.exit(0)"');
  gate('--approve'); // the real approval is for another command
  agents('node -e "process.exit(3)"');
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), '--run'], { cwd: p, encoding: 'utf8', env: { ...env(), GIT_DIR: bare, GIT_COMMON_DIR: bare } });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /komut onayı gerekli/);
  fs.rmSync(bare, { recursive: true, force: true });
  agents('node -e "process.exit(0)"');
});

test('3.17.0 the pre-3.15 flag and state are gone: --onayla does not approve; the old approval folder and gate keys are not read', () => {
  agents('node -e "process.exit(0)"');
  fs.rmSync(approvalPath(p), { force: true }); // an earlier test approved this same list
  const old = gate('--onayla');
  assert.equal(old.status, 1);
  assert.match(old.stderr, /Kullanım/);
  assert.equal(gate('--run').status, 1, 'the old flag wrote no approval');
  assert.equal(permissionEquivalent('node .claude/hooks/gate.mjs --onayla'), null, 'Codex/Antigravity: no rule for a flag that does nothing');
  assert.equal(permissionEquivalent('node .claude/hooks/commit-gate.mjs --approve "board-qa"'), null, 'commit-gate --approve is not the gate approval');
  assert.equal(permissionEquivalent('node .claude\\hooks\\commit-gate.mjs --approve "board-qa"'), null, 'Windows path too');
  // Only the real commit-gate is exempt: a copy of gate.mjs named commit-gate.mjs elsewhere is still the gate approval
  assert.equal(permissionEquivalent('node tmp/commit-gate.mjs --approve')?.decision, 'ask');
  assert.equal(ask('node tmp/commit-gate.mjs --approve'), 'deny', 'not the exact spelling of the gate approval');
  // 3.28.0: the exemption is anchored at the path start; a nested .claude/hooks/commit-gate.mjs is still the gate approval
  for (const c of ['node sandbox/.claude/hooks/commit-gate.mjs --approve', 'node x\\.claude\\hooks\\commit-gate.mjs --approve']) {
    assert.equal(permissionEquivalent(c)?.decision, 'ask', c);
    assert.equal(ask(c), 'deny', c);
  }
  for (const c of ['node ./.claude/hooks/commit-gate.mjs --approve "board-qa"', 'node ".claude/hooks/commit-gate.mjs" --approve x'])
    assert.equal(permissionEquivalent(c), null, c);
  // 3.15.0 audit: Windows paths (unquote drops backslashes) and a renamed copy must not slip past the gate approval rule
  assert.equal(ask('node .claude\\hooks\\gate.mjs --approve'), 'ask', 'Windows path, exact spelling');
  assert.equal(ask('node ".claude\\hooks\\gate.mjs" --approve'), 'deny', 'quoted Windows path is not the exact spelling');
  assert.equal(ask('node hooks\\gate.mjs --approve ; echo x'), 'deny');
  assert.equal(ask("node '.claude\\hooks\\gate.mjs' --approve ; echo x"), 'deny');
  assert.equal(ask('node /tmp/h/x-gate.mjs --approve'), 'deny', 'renamed copy');
  assert.equal(permissionEquivalent('node /tmp/h/x-gate.mjs --approve')?.decision, 'ask', 'Codex/Antigravity: renamed copy');
  assert.equal(permissionEquivalent('node .claude\\hooks\\gate.mjs --approve')?.decision, 'ask', 'Codex/Antigravity: Windows path');
  // An approval left in the pre-3.15 folder (kapi-onayi) with the pre-3.15 key
  gate('--approve');
  const a = JSON.parse(fs.readFileSync(approvalPath(p), 'utf8'));
  fs.rmSync(approvalPath(p));
  const oldFile = path.join(path.dirname(path.dirname(approvalPath(p))), 'kapi-onayi', path.basename(approvalPath(p)));
  const hadOldDir = fs.existsSync(path.dirname(oldFile));
  fs.mkdirSync(path.dirname(oldFile), { recursive: true });
  fs.writeFileSync(oldFile, JSON.stringify({ ozet: a.digest, digest: a.digest }));
  assert.equal(gate('--run').status, 1, 'the old approval folder is not read');
  fs.rmSync(oldFile, { force: true });
  if (!hadOldDir) fs.rmdirSync(path.dirname(oldFile)); // the test must not bring back the retired folder
  // A gate result written before 3.15 is not read by the commit gate: the gate has to run again
  gate('--approve');
  sh('git add -A && git commit -qm ara4 --allow-empty');
  write('a.js', 'eski');
  approve('board-qa');
  const signature = JSON.parse(fs.readFileSync(path.join(p, '.claude/state/commit-approval.json'), 'utf8')).signature;
  fs.writeFileSync(path.join(p, '.claude/state/gate.json'), JSON.stringify({ imza: signature, gecti: true }));
  assert.equal(commit().status, 2, 'an old green result does not open the commit gate');
});

test('3.14.1 audit: a semgrep placed inside the project is not suggested', { skip: process.platform !== 'win32' }, () => {
  fs.writeFileSync(path.join(p, 'semgrep.cmd'), '@echo off\r\nexit /b 0\r\n');
  write('c.js', 'kod');
  gate('--approve');
  const e = { ...env() };
  delete e.SEMGREP;
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), '--run'], { cwd: p, encoding: 'utf8', env: e });
  assert.doesNotMatch(r.stdout, /SEMGREP=/, r.stdout);
  fs.rmSync(path.join(p, 'semgrep.cmd'));
  fs.rmSync(path.join(p, 'c.js'));
});

test('3.14.1 Semgrep: installed as .cmd on Windows does not say "kurulu değil"', { skip: process.platform !== 'win32' }, () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-'));
  fs.writeFileSync(path.join(bin, 'semgrep.cmd'), '@echo off\r\nexit /b 0\r\n');
  write('b.js', 'yeni kod');
  gate('--approve');
  const e = { ...process.env, CLAUDE_PROJECT_DIR: p, PATH: `${bin};${process.env.PATH}` };
  delete e.SEMGREP;
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), '--run'], { cwd: p, encoding: 'utf8', env: e });
  assert.match(r.stdout, /Semgrep.*atlandı.*SEMGREP=/);
  assert.doesNotMatch(r.stdout, /kurulu değil/);
  fs.rmSync(bin, { recursive: true, force: true });
  fs.rmSync(path.join(p, 'b.js'));
});

test('3.28.0 commit-gate exemption: this project\'s own script in any spelling; another commit-gate.mjs is the gate approval', () => {
  const REPO = path.resolve(HOOKS, '..', '..');
  for (const [c, dir] of [['node ../.claude/hooks/commit-gate.mjs --approve x', path.join(REPO, 'kit')],
    [`node "${path.join(REPO, '.claude', 'hooks', 'commit-gate.mjs')}" --approve x`, REPO],
    ['node "$CLAUDE_PROJECT_DIR/.claude/hooks/commit-gate.mjs" --approve x', path.join(REPO, 'kit')],
    ['node ./.claude/hooks/commit-gate.mjs --approve x', REPO]])
    assert.match(maskOwnHook(c, dir), /KIT-COMMIT-HOOK/, c);
  for (const [c, dir] of [['node .claude/hooks/commit-gate.mjs --approve x', path.join(REPO, 'kit')],
    ['cd sandbox && node .claude/hooks/commit-gate.mjs --approve x', REPO], ['node sandbox/.claude/hooks/commit-gate.mjs --approve x', REPO]])
    assert.doesNotMatch(maskOwnHook(c, dir), /KIT-COMMIT-HOOK/, c);
  assert.equal(ask(`node "${path.join(p, '.claude', 'hooks', 'commit-gate.mjs')}" --approve x`), null, 'absolute path to the real script');
  assert.equal(ask('node "$CLAUDE_PROJECT_DIR/.claude/hooks/commit-gate.mjs" --approve x'), null);
  assert.equal(ask('cd sandbox && node .claude/hooks/commit-gate.mjs --approve x'), 'deny', 'a cd hides which file runs');
});

test('3.28.0 a guard script run with an indirect spelling is asked; plain and heredoc spellings are not', () => {
  for (const c of ['S=--skip; node .claude/hooks/commit-gate.mjs $S x', 'node .claude/hooks/commit-gate.mjs --sk$()ip x',
    'node .claude/hooks/commit-*.mjs --skip x', 'node .claude/hooks/commit-gate.mjs --ski? x', 'node .claude/hooks/commit-gate.mjs "$(echo --skip)" x',
    'node .claude/hooks/freeze-guard.mjs `echo --plan-end`'])
    assert.equal(evaluate(c)?.decision, 'ask', c);
  for (const c of ['node .claude/hooks/gate.mjs --run 2>&1 | tail -30', 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/notify.mjs" --stop',
    'node .claude/hooks/commit-gate.mjs --approve "board-qa, board-security"', "node .claude/hooks/x.mjs 'a*b?'",
    "git commit -m \"$(cat <<'EOF'\nfix: node .claude/hooks/x.mjs $S *\nEOF\n)\""])
    assert.equal(evaluate(c), null, c);
});

test('3.28.1 staging the approved changes keeps the approval and the gate (git add does not change the signature)', () => {
  agents('node -e "process.exit(0)"');
  sh('git add -A && git commit -qm ara4 --allow-empty');
  write('a.js', 'imza');
  write('yeni-dosya.js', 'yeni');
  fs.rmSync(path.join(p, 'b.js'), { force: true });
  runGate();
  approve('board-qa');
  sh('git add -A');
  assert.equal(commit().status, 0, 'same content, now staged');
  write('a.js', 'imza2');
  assert.equal(commit().status, 2, 'a change after staging still voids it');
});

test('3.28.1 audit: the exemption needs one plain command; arguments fed from elsewhere are asked', () => {
  const REPO = path.resolve(HOOKS, '..', '..');
  for (const c of ['env -C sandbox node .claude/hooks/commit-gate.mjs --approve x', '(cd sandbox; node .claude/hooks/commit-gate.mjs --approve x)',
    'node .claude/hooks/commit-gate.mjs --approve x && node sandbox/x.mjs', 'pushd sandbox\nnode .claude/hooks/commit-gate.mjs --approve x'])
    assert.doesNotMatch(maskOwnHook(c, REPO), /KIT-COMMIT-HOOK/, c);
  for (const c of ['echo --skip | xargs node .claude/hooks/commit-gate.mjs', 'echo --skip | node .claude/hooks/commit-gate.mjs',
    'node .claude/hooks/commit-gate.mjs < args.txt', 'node .claude/hooks/commit-gate.mjs $(<args.txt)'])
    assert.equal(evaluate(c)?.decision, 'ask', c);
});

test('3.28.2 audit: content staged behind skip-worktree or assume-unchanged voids the approval', () => {
  agents('node -e "process.exit(0)"');
  sh('git add -A && git commit -qm ara5 --allow-empty');
  write('a.js', 'onayli');
  runGate();
  approve('board-qa');
  const blob = execSync('git hash-object -w --stdin', { cwd: p, input: 'kotu', encoding: 'utf8' }).trim();
  sh(`git update-index --cacheinfo 100644,${blob},a.js`);
  sh('git update-index --skip-worktree a.js');
  assert.equal(commit().status, 2, 'the index holds content that was not approved');
  sh('git update-index --no-skip-worktree a.js');
  sh('git add a.js');
});

test('3.28.3 git.exe and commit aliases are commits too', () => {
  agents('node -e "process.exit(0)"');
  sh('git add -A && git commit -qm ara6 --allow-empty');
  write('alias.js', 'x');
  sh('git config alias.ci "commit -v"');
  sh('git config alias.yaz "!git commit"');
  sh('git config alias.zincir ci');
  sh('git config alias.kabuk "!f() { git commit -m x; }; f"');
  for (const c of ['git.exe commit -m x', 'git ci -m x', 'git CI -m x', 'git yaz -m x', 'git zincir -m x', 'git kabuk', 'git -c alias.zz=commit zz -m x',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.q GIT_CONFIG_VALUE_0=commit git q', 'git config alias.w commit && git w -m x', '"/usr/bin/git" commit -m x'])
    assert.equal(commit(c).status, 2, c);
  assert.equal(commit('git status').status, 0);
  const inline = commit('git -c alias.zz=commit zz -m x && git checkout -- a.js');
  assert.match(inline.stderr, /zincirli/, 'an inline alias never lets another git command through the chain check');
  sh('git config --unset alias.ci');
  sh('git config --unset alias.yaz');
  sh('git config --unset alias.zincir');
  sh('git config --unset alias.kabuk');
  fs.rmSync(path.join(p, 'alias.js'));
});

test('3.29.0 a path of this machine in a changed file turns the gate red; kit:yol-izinli allows a deliberate one', async () => {
  const { absPathCheck } = await import('../../.claude/hooks/gate.mjs');
  agents('node -e "process.exit(0)"');
  sh('git add -A && git commit -qm ara-yol --allow-empty');
  const fwd = p.replace(/\\/g, '/');
  write('src/yol.test.js', `const f = '${fwd}/fixtures/a.json';\n`);
  const red = runGate();
  assert.equal(red.status, 1, red.stdout);
  assert.match(red.stdout, /❌ Mutlak yol[\s\S]*src\/yol\.test\.js:1/);
  write('src/yol.test.js', "const f = path.join(import.meta.dirname, 'fixtures', 'a.json');\n");
  assert.equal(runGate().status, 0, 'a derived path is fine');
  // red = this machine's path (blocks), note = looks like a user folder (listed, does not block), ok = nothing
  for (const [text, want] of [
    [`const r = "${p.replace(/\\/g, '\\\\')}\\\\x";`, 'red'], // JSON / JS escaped backslashes
    // No path boundary: another folder that starts the same way (still red where the temp folder is under home, as on Windows)
    [`const r = '${p.replace(/\\/g, '/')}-eski/x';`, path.relative(os.homedir(), p).startsWith('..') ? 'ok' : 'red'],
    ["cwd: 'C:\\Users\\ayse\\proje'", 'note'], // kit:yol-izinli
    ['const t = "/home/mehmet/proje/a";', 'note'], // kit:yol-izinli
    ['WORKDIR /home/node/app', 'note'], // kit:yol-izinli
    ['const t = "/Users/zeynep/Desktop/x";', 'note'], // kit:yol-izinli
    ["fetch('/users/42/posts')", 'ok'],
    ["router.push('/home/settings')", 'ok'],
    ['// örnek: /home/<ad>/proje', 'ok'],
    ["const u = 'https://example.com/home/page/';", 'ok'],
  ]) {
    write('src/b.js', `${text}\n`);
    const r = absPathCheck(p, ['src/b.js']);
    assert.equal(r.status === 'failed' ? 'red' : r.note ? 'note' : 'ok', want, text);
  }
  write('src/b.js', `// kit:yol-izinli\n"${p.replace(/\\/g, '/')}/a"\n`);
  assert.equal(absPathCheck(p, ['src/b.js']).status, 'passed', 'the marker on the line above (Dockerfile, JSON)');
  // Only added lines: an old path already committed in the file is not this change's
  write('src/eski.js', `const a = '${p.replace(/\\/g, '/')}/eski';\n`);
  sh('git add -A && git commit -qm eski-yol --no-verify');
  write('src/eski.js', `const a = '${p.replace(/\\/g, '/')}/eski';\nconst b = 1;\n`);
  assert.equal(absPathCheck(p, ['src/eski.js']).status, 'passed', 'an unrelated added line');
  fs.rmSync(path.join(p, 'src/eski.js'));
  sh('git add -A && git commit -qm eski-yol-sil --no-verify');
  fs.rmSync(path.join(p, 'src/b.js'));
  fs.rmSync(path.join(p, 'src/yol.test.js'));
});

test('B9 Codex/Antigravity: a commit message that names --skip is text, not a call; a real one is still asked', () => {
  for (const c of ['git commit -am "docs: commit-gate.mjs --skip anlatıldı"', "git commit -m 'commit-gate.mjs --skip notu'", 'git commit --message="node .claude/hooks/commit-gate.mjs --skip x"'])
    assert.equal(permissionEquivalent(c), null, c);
  for (const c of ['git commit -m "$(node .claude/hooks/commit-gate.mjs --skip x)"', 'git commit -m "`node .claude/hooks/commit-gate.mjs --skip x`"',
    'git commit -m x && node .claude/hooks/commit-gate.mjs --skip y', 'node .claude/hooks/commit-gate.mjs "--skip" x', "git commit -m $'commit-gate.mjs --skip'",
    // --skip given to commit-gate itself after an -m, not to git commit
    "node .claude/hooks/commit-gate.mjs -m '--skip' x", "git commit -m x $(node .claude/hooks/commit-gate.mjs -m '--skip' y)",
    "git commit -m x `node .claude/hooks/commit-gate.mjs -m '--skip' y`",
    // a quote opened before "git commit -m" turns the real command into the "message" (audit)
    'echo "git commit -m "; node .claude/hooks/commit-gate.mjs --skip x; echo "end"',
    "echo 'git commit -m '; node .claude/hooks/commit-gate.mjs --skip x; echo ' end'",
    '# git commit -m "\nnode .claude/hooks/commit-gate.mjs --skip x\n# "',
    "FOO='git commit -m ' node .claude/hooks/commit-gate.mjs --skip x ' \"'",
    ": <<'ZZ'\ngit commit -m \"\nZZ\nnode .claude/hooks/commit-gate.mjs --skip x\n: \"",
    'git commit -m "a" ; node .claude/hooks/commit-gate.mjs --skip x',
    // PowerShell and cmd do not treat \ as an escape: "a\" closes the string there
    'git commit -m "a\\"; node .claude/hooks/commit-gate.mjs --skip x; echo \\""',
    'git add -A && git commit -m "a\\" && node .claude/hooks/commit-gate.mjs --skip x && echo \\""',
    // PowerShell also ends a string at typographic quotes
    'git commit -m "a”; node .claude/hooks/commit-gate.mjs --skip x; “b"', "git commit -m 'a’; node .claude/hooks/commit-gate.mjs --skip x; ‘b'",
    'git commit -m "a„; node .claude/hooks/commit-gate.mjs --skip x; “b"'])
    assert.equal(permissionEquivalent(c)?.decision, 'ask', c);
  // the same trick must not hide any other rule either
  for (const c of ['echo "git commit -m "; node .claude/hooks/gate.mjs --approve; echo "e"', 'echo "git commit -m "; rm -rf /tmp/x; echo "e"',
    'echo "git commit -m "; node .claude/hooks/prefs.mjs --add kacin x; echo "e"', 'git commit -m "a\\"; rm -rf /tmp/x; echo \\""', 'git commit -m "a”; rm -rf /tmp/x; “b"'])
    assert.ok(permissionEquivalent(c), c);
  assert.equal(permissionEquivalent('git add -A && git commit -qm "docs: gate.mjs --approve ve commit-gate.mjs --skip anlatıldı"'), null, 'git add && git commit');
});

test('3.32.0 one review per change: the task-end approval covers the commit; after a change only the changed files are reviewed', () => {
  const status = () => spawnSync(process.execPath, [path.join(HOOKS, 'commit-gate.mjs'), '--status'], { encoding: 'utf8', env: env() });
  agents('node -e "process.exit(0)"');
  sh('git add -A && git commit -qm base');
  fs.rmSync(path.join(p, '.claude/state/commit-approval.json'), { force: true });
  write('b.js', '1');
  write('c.js', '1');
  assert.match(status().stdout, /Onay yok/);
  runGate();
  assert.equal(approve('görev sonu: board-qa, code-reviewer').status, 0);
  const ok = status();
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /Onay geçerli.*görev sonu: board-qa, code-reviewer/s);
  assert.match(ok.stdout, /yeniden inceleme gerekmez/);
  assert.equal(commit().status, 0, 'the commit passes on the task-end approval: no second board');
  write('c.js', '2');
  write('d.js', 'yeni');
  const stale = status();
  assert.match(stale.stdout, /Son onaydan sonra değişen: c\.js, d\.js/);
  assert.doesNotMatch(stale.stdout.split('değişen:')[1], /b\.js/, 'an unchanged reviewed file is not reviewed again');
  const r = commit();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /c\.js, d\.js/);
  assert.match(r.stderr, /yalnız/);
  sh('git add -A && git commit -qm t');
  assert.match(status().stdout, /Değişiklik yok/);
  // a skipped review covers no file: it is not "reviewed" and a later change does not narrow the review to the delta
  write('e.js', '1');
  write('f.js', '1');
  assert.equal(skip('kullanıcı isteği').status, 0);
  assert.match(status().stdout, /atlandı.*denetlenmedi/s);
  assert.doesNotMatch(status().stdout, /Onay geçerli/);
  write('f.js', '2');
  assert.match(status().stdout, /Onay yok.*2 dosya/s, 'the skipped e.js is still to be reviewed');
  assert.doesNotMatch(commit().stderr, /yalnız/);
  sh('git add -A && git commit -qm t2');
  // the commands use it: task-end approval opens the commit; /review-changes and the commit board check first
  const read = (f) => fs.readFileSync(path.join(HOOKS, '..', f), 'utf8');
  assert.match(read('commands/build.md'), /commit-gate\.mjs --approve "görev sonu: /);
  assert.match(read('commands/review-changes.md'), /commit-gate\.mjs --status/);
  assert.match(read('board/rules.md'), /commit-gate\.mjs --status/);
  assert.ok(JSON.parse(read('settings.json')).permissions.allow.includes('Bash(node .claude/hooks/commit-gate.mjs --status)'));
});
