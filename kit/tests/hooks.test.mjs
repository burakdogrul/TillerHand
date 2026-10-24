// Run: node --test "kit/tests/*.test.mjs"
// Commit gate and limit reader.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeLimits, readLimits, level } from '../../.claude/hooks/usage.mjs';
import { approvalPath } from '../../.claude/hooks/gate.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');
const COMMIT_GATE = path.join(HOOKS, 'commit-gate.mjs');
let p;

const env = () => ({ ...process.env, CLAUDE_PROJECT_DIR: p });
const door = (command) => spawnSync(process.execPath, [COMMIT_GATE], { input: JSON.stringify({ tool_input: { command: command } }), encoding: 'utf8', env: env() });
const approve = (note) => spawnSync(process.execPath, [COMMIT_GATE, '--approve', note], { encoding: 'utf8', env: env() });
const sh = (k) => execSync(k, { cwd: p, stdio: 'ignore' });
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };

before(() => {
  p = fs.mkdtempSync(path.join(os.tmpdir(), 'kapi-test-'));
  sh('git init -q && git config user.email t@t && git config user.name t');
  write('docs/workflow/board.md', '**Durum:** kuruldu\n**Commit denetimi:** açık\n');
  write('a.js', 'x');
  sh('git add . && git commit -qm init');
});
after(() => { fs.rmSync(approvalPath(p), { force: true }); fs.rmSync(p, { recursive: true, force: true }); });

test('commit gate: passes without a board (the chair and advisor from the template are not a board)', () => {
  write('.claude/agents/board-chair.md', '---\nname: board-chair\n---\n');
  write('.claude/agents/council-advisor.md', '---\nname: council-advisor\n---\n');
  write('a.js', 'y');
  sh('git add a.js');
  assert.equal(door('git commit -m x').status, 0);
});

test('commit gate: with a board an unapproved code commit stops, passes with approval', () => {
  write('.claude/agents/board-qa.md', '---\nname: board-qa\n---\n');
  assert.equal(door('git status').status, 0, 'a non-commit command passes');
  const r = door('git commit -m "feat: x"');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /kurul denetimi/);
  assert.equal(approve('board-qa').status, 0);
  // 3.14.1: an empty gate does not open the commit; commands run with user approval
  write('AGENTS.md', '## Komutlar\n\n```bash\ntest: node -e "process.exit(0)"\n```\n');
  assert.equal(approve('board-qa').status, 0);
  spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), '--approve'], { cwd: p, env: env() });
  spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), '--run'], { cwd: p, env: { ...env(), SEMGREP: 'olmayan-semgrep-komutu' } });
  assert.equal(door('git commit -m "feat: x"').status, 0, 'passes after approval and a green gate');
  write('a.js', 'z'); // onaydan sonra değişiklik: onay geçersiz
  assert.equal(door('git -c core.x=1 commit -am x').status, 2);
});

test('commit gate: passes when only docs changed and when review is off', () => {
  sh('git commit -qam ara'); // önceki testlerin değişikliklerini temizle
  write('docs/NOT.md', 'not');
  sh('git add docs/NOT.md');
  const rd = door('git commit -m docs');
  assert.equal(rd.status, 0, rd.stderr);
  write('b.js', 'kod');
  sh('git add b.js');
  assert.equal(door('git commit -m x').status, 2);
  write('docs/workflow/board.md', '**Commit denetimi:** kapalı\n');
  assert.equal(door('git commit -m x').status, 0);
});

test('limit: write, read, level and reset', () => {
  const now = 1_800_000_000_000;
  fs.mkdirSync(path.join(p, '.claude'), { recursive: true });
  assert.equal(level(readLimits(path.join(p, 'yok'))), 'unknown');
  writeLimits(p, { five_hour: { used_percentage: 64.4, resets_at: now / 1000 + 3600 }, seven_day: { used_percentage: 5, resets_at: now / 1000 + 86400 } }, now);
  assert.equal(level(readLimits(p, now)), 'yellow');
  writeLimits(p, { five_hour: { used_percentage: 91, resets_at: now / 1000 + 60 } }, now);
  assert.equal(level(readLimits(p, now)), 'red');
  const later = readLimits(p, now + 120_000); // sıfırlanma geçti
  assert.equal(later.five_hour.percent, 0);
  assert.equal(level(later), 'green');
  writeLimits(p, undefined, now); // rate_limits yoksa dosyaya dokunmaz
  assert.ok(readLimits(p, now));
});
