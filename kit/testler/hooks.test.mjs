// Çalıştır: node --test "kit/testler/*.test.mjs"
// Commit kapısı ve limit okuyucu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { limitYaz, limitOku, seviye } from '../../.claude/hooks/limit.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');
const KAPI = path.join(HOOKS, 'commit-kapisi.mjs');
let p;

const env = () => ({ ...process.env, CLAUDE_PROJECT_DIR: p });
const kapi = (komut) => spawnSync(process.execPath, [KAPI], { input: JSON.stringify({ tool_input: { command: komut } }), encoding: 'utf8', env: env() });
const onayla = (not) => spawnSync(process.execPath, [KAPI, '--onayla', not], { encoding: 'utf8', env: env() });
const sh = (k) => execSync(k, { cwd: p, stdio: 'ignore' });
const yaz = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };

before(() => {
  p = fs.mkdtempSync(path.join(os.tmpdir(), 'kapi-test-'));
  sh('git init -q && git config user.email t@t && git config user.name t');
  yaz('docs/KURUL.md', '**Durum:** kuruldu\n**Commit denetimi:** açık\n');
  yaz('a.js', 'x');
  sh('git add . && git commit -qm init');
});
after(() => fs.rmSync(p, { recursive: true, force: true }));

test('commit kapısı: kurul yoksa geçer', () => {
  yaz('a.js', 'y');
  sh('git add a.js');
  assert.equal(kapi('git commit -m x').status, 0);
});

test('commit kapısı: kurul varsa onaysız kod commit\'i durur, onayla geçer', () => {
  yaz('.claude/agents/kurul-qa.md', '---\nname: kurul-qa\n---\n');
  assert.equal(kapi('git status').status, 0, 'commit olmayan komut geçer');
  const r = kapi('git commit -m "feat: x"');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /kurul denetimi/);
  assert.equal(onayla('kurul-qa').status, 0);
  assert.equal(kapi('git commit -m "feat: x"').status, 0, 'onaydan sonra geçer');
  yaz('a.js', 'z'); // onaydan sonra değişiklik: onay geçersiz
  assert.equal(kapi('git -c core.x=1 commit -am x').status, 2);
});

test('commit kapısı: sadece doküman değiştiyse ve denetim kapalıysa geçer', () => {
  sh('git commit -qam ara'); // önceki testlerin değişikliklerini temizle
  yaz('docs/NOT.md', 'not');
  sh('git add docs/NOT.md');
  assert.equal(kapi('git commit -m docs').status, 0);
  yaz('b.js', 'kod');
  sh('git add b.js');
  assert.equal(kapi('git commit -m x').status, 2);
  yaz('docs/KURUL.md', '**Commit denetimi:** kapalı\n');
  assert.equal(kapi('git commit -m x').status, 0);
});

test('limit: yazar, okur, seviye ve sıfırlanma', () => {
  const simdi = 1_800_000_000_000;
  fs.mkdirSync(path.join(p, '.claude'), { recursive: true });
  assert.equal(seviye(limitOku(path.join(p, 'yok'))), 'bilinmiyor');
  limitYaz(p, { five_hour: { used_percentage: 64.4, resets_at: simdi / 1000 + 3600 }, seven_day: { used_percentage: 5, resets_at: simdi / 1000 + 86400 } }, simdi);
  assert.equal(seviye(limitOku(p, simdi)), 'sarı');
  limitYaz(p, { five_hour: { used_percentage: 91, resets_at: simdi / 1000 + 60 } }, simdi);
  assert.equal(seviye(limitOku(p, simdi)), 'kırmızı');
  const sonra = limitOku(p, simdi + 120_000); // sıfırlanma geçti
  assert.equal(sonra.five_hour.yuzde, 0);
  assert.equal(seviye(sonra), 'yeşil');
  limitYaz(p, undefined, simdi); // rate_limits yoksa dosyaya dokunmaz
  assert.ok(limitOku(p, simdi));
});
