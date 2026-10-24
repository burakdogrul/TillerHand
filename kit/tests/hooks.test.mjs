// Çalıştır: node --test "kit/tests/*.test.mjs"
// Commit kapısı ve limit okuyucu.
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
const KAPI = path.join(HOOKS, 'commit-gate.mjs');
let p;

const env = () => ({ ...process.env, CLAUDE_PROJECT_DIR: p });
const door = (command) => spawnSync(process.execPath, [KAPI], { input: JSON.stringify({ tool_input: { command: command } }), encoding: 'utf8', env: env() });
const onayla = (note) => spawnSync(process.execPath, [KAPI, '--approve', note], { encoding: 'utf8', env: env() });
const sh = (k) => execSync(k, { cwd: p, stdio: 'ignore' });
const yaz = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };

before(() => {
  p = fs.mkdtempSync(path.join(os.tmpdir(), 'kapi-test-'));
  sh('git init -q && git config user.email t@t && git config user.name t');
  yaz('docs/workflow/board.md', '**Durum:** kuruldu\n**Commit denetimi:** açık\n');
  yaz('a.js', 'x');
  sh('git add . && git commit -qm init');
});
after(() => { fs.rmSync(approvalPath(p), { force: true }); fs.rmSync(p, { recursive: true, force: true }); });

test('commit kapısı: kurul yoksa geçer (şablonla gelen başkan ve danışman kurul sayılmaz)', () => {
  yaz('.claude/agents/board-chair.md', '---\nname: board-chair\n---\n');
  yaz('.claude/agents/council-advisor.md', '---\nname: council-advisor\n---\n');
  yaz('a.js', 'y');
  sh('git add a.js');
  assert.equal(door('git commit -m x').status, 0);
});

test('commit kapısı: kurul varsa onaysız kod commit\'i durur, onayla geçer', () => {
  yaz('.claude/agents/board-qa.md', '---\nname: board-qa\n---\n');
  assert.equal(door('git status').status, 0, 'commit olmayan komut geçer');
  const r = door('git commit -m "feat: x"');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /kurul denetimi/);
  assert.equal(onayla('board-qa').status, 0);
  // 3.14.1: boş kapı commit'i açmaz; komutlar kullanıcı onayıyla çalışır
  yaz('AGENTS.md', '## Komutlar\n\n```bash\ntest: node -e "process.exit(0)"\n```\n');
  assert.equal(onayla('board-qa').status, 0);
  spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), '--approve'], { cwd: p, env: env() });
  spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), '--run'], { cwd: p, env: { ...env(), SEMGREP: 'olmayan-semgrep-komutu' } });
  assert.equal(door('git commit -m "feat: x"').status, 0, 'onay ve yeşil kapıdan sonra geçer');
  yaz('a.js', 'z'); // onaydan sonra değişiklik: onay geçersiz
  assert.equal(door('git -c core.x=1 commit -am x').status, 2);
});

test('commit kapısı: sadece doküman değiştiyse ve denetim kapalıysa geçer', () => {
  sh('git commit -qam ara'); // önceki testlerin değişikliklerini temizle
  yaz('docs/NOT.md', 'not');
  sh('git add docs/NOT.md');
  const rd = door('git commit -m docs');
  assert.equal(rd.status, 0, rd.stderr);
  yaz('b.js', 'kod');
  sh('git add b.js');
  assert.equal(door('git commit -m x').status, 2);
  yaz('docs/workflow/board.md', '**Commit denetimi:** kapalı\n');
  assert.equal(door('git commit -m x').status, 0);
});

test('limit: yazar, okur, seviye ve sıfırlanma', () => {
  const now = 1_800_000_000_000;
  fs.mkdirSync(path.join(p, '.claude'), { recursive: true });
  assert.equal(level(readLimits(path.join(p, 'yok'))), 'unknown');
  writeLimits(p, { five_hour: { used_percentage: 64.4, resets_at: now / 1000 + 3600 }, seven_day: { used_percentage: 5, resets_at: now / 1000 + 86400 } }, now);
  assert.equal(level(readLimits(p, now)), 'yellow');
  writeLimits(p, { five_hour: { used_percentage: 91, resets_at: now / 1000 + 60 } }, now);
  assert.equal(level(readLimits(p, now)), 'red');
  const sonra = readLimits(p, now + 120_000); // sıfırlanma geçti
  assert.equal(sonra.five_hour.percent, 0);
  assert.equal(level(sonra), 'green');
  writeLimits(p, undefined, now); // rate_limits yoksa dosyaya dokunmaz
  assert.ok(readLimits(p, now));
});
