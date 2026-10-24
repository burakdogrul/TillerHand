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
import { permissionEquivalent } from '../../.claude/hooks/destructive-guard.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');
let p;
const env = () => ({ ...process.env, CLAUDE_PROJECT_DIR: p, SEMGREP: 'olmayan-semgrep-komutu' });
const gate = (...a) => spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), ...a], { cwd: p, encoding: 'utf8', env: env() });
// Command approval has its own test; elsewhere the user counts as having approved the commands
const runGate = () => (gate('--approve'), gate('--run'));
const commit = (command = 'git commit -m x') => spawnSync(process.execPath, [path.join(HOOKS, 'commit-gate.mjs')], { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8', env: env() });
const approve = (note) => spawnSync(process.execPath, [path.join(HOOKS, 'commit-gate.mjs'), '--approve', note], { encoding: 'utf8', env: env() });
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
  for (const legacy of [false, true]) fs.rmSync(approvalPath(p, { legacy }), { force: true });
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
  assert.equal(approve('atlandı: kullanıcı isteği').status, 0);
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

test('F-03 audit: an "atlandı" approval is put to the user in every spelling', () => {
  assert.equal(ask('node .claude/hooks/commit-gate.mjs --approve "atlandı: kullanıcı isteği"'), 'ask');
  assert.equal(ask("node .claude/hooks/commit-gate.mjs --approve 'atlandı'"), 'ask');
  assert.equal(ask('node .claude/hooks/commit-gate.mjs --approve atlandı:x'), 'ask');
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
  approve('atlandı: kullanıcı isteği');
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

test('3.15.0 old flag and old state: --onayla still approves (with a warning) and is asked; old approval and gate keys are read', () => {
  agents('node -e "process.exit(0)"');
  const old = gate('--onayla');
  assert.equal(old.status, 0);
  assert.match(old.stderr, /eski bayrak.*--approve/);
  assert.equal(gate('--run').status, 0, 'approval written by the old flag counts');
  assert.equal(ask('node .claude/hooks/gate.mjs --onayla'), 'ask', 'the old flag is still asked');
  assert.equal(ask('node -e "1" && node .claude/hooks/gate.mjs --onayla'), 'deny', 'the old flag keeps the exact-spelling rule');
  assert.equal(permissionEquivalent('node .claude/hooks/gate.mjs --onayla')?.decision, 'ask', 'Codex/Antigravity: old flag');
  assert.equal(permissionEquivalent('node .claude/hooks/commit-gate.mjs --approve "board-qa"'), null, 'commit-gate --approve is not the gate approval');
  // An approval left in the pre-3.15 folder with the pre-3.15 key
  const a = JSON.parse(fs.readFileSync(approvalPath(p), 'utf8'));
  fs.rmSync(approvalPath(p));
  assert.equal(gate('--run').status, 1, 'no approval anywhere');
  fs.mkdirSync(path.dirname(approvalPath(p, { legacy: true })), { recursive: true });
  fs.writeFileSync(approvalPath(p, { legacy: true }), JSON.stringify({ ozet: a.digest }));
  assert.equal(gate('--run').status, 0, 'the old approval folder and key are read');
  // A gate result written before 3.15 is read by the commit gate
  sh('git add -A && git commit -qm ara4 --allow-empty');
  write('a.js', 'eski');
  approve('board-qa');
  const signature = JSON.parse(fs.readFileSync(path.join(p, '.claude/state/commit-approval.json'), 'utf8')).signature;
  fs.writeFileSync(path.join(p, '.claude/state/gate.json'), JSON.stringify({ imza: signature, gecti: false, bos: false, kontroller: [{ ad: 'test', durum: 'kaldı' }] }));
  const red = commit();
  assert.equal(red.status, 2);
  assert.match(red.stderr, /kırmızı \(test\)/, 'old status values are mapped');
  fs.writeFileSync(path.join(p, '.claude/state/gate.json'), JSON.stringify({ imza: signature, gecti: true }));
  assert.equal(commit().status, 0, 'an old green result with the right signature passes');
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
