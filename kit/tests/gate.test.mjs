// Çalıştır: node --test "kit/tests/*.test.mjs"
// Deterministik kapı (F-03): lint, tip, test ve Semgrep kurula girdi olur; kırmızıysa commit durur.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { komutlar } from '../../.claude/hooks/gate.mjs';
import { izinKarsiligi } from '../../.claude/hooks/destructive-guard.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');
let p;
const env = () => ({ ...process.env, CLAUDE_PROJECT_DIR: p, SEMGREP: 'olmayan-semgrep-komutu' });
const gate = (...a) => spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), ...a], { cwd: p, encoding: 'utf8', env: env() });
// Komut onayı ayrı testte; diğer testlerde kullanıcı komutları onaylamış sayılır
const kapi = () => (gate('--onayla'), gate('--run'));
const commit = (komut = 'git commit -m x') => spawnSync(process.execPath, [path.join(HOOKS, 'commit-gate.mjs')], { input: JSON.stringify({ tool_input: { command: komut } }), encoding: 'utf8', env: env() });
const onayla = (not) => spawnSync(process.execPath, [path.join(HOOKS, 'commit-gate.mjs'), '--approve', not], { encoding: 'utf8', env: env() });
const sh = (k) => execSync(k, { cwd: p, stdio: 'ignore' });
const yaz = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
const agents = (test) => yaz('AGENTS.md', `# X\n\n## Komutlar\n\n\`\`\`bash\ngeliştirme:  [ ]\ntest:        ${test}\nlint:        node -e "console.log('lint temiz')"\ntip kontrol: [ ]\nbuild:       [ ]\n\`\`\`\n`);

before(() => {
  p = fs.mkdtempSync(path.join(os.tmpdir(), 'kapi-'));
  sh('git init -q && git config user.email t@t && git config user.name t');
  yaz('docs/workflow/board.md', '**Commit denetimi:** açık\n');
  yaz('.gitignore', '.claude/state/\n'); // kit .gitignore'u gibi
  yaz('.claude/agents/board-qa.md', '---\nname: board-qa\n---\n');
  agents('node -e "process.exit(0)"');
  yaz('a.js', 'x');
  sh('git add . && git commit -qm init');
});
after(() => fs.rmSync(p, { recursive: true, force: true }));

test('F-03 komutlar AGENTS.md → Komutlar bloğundan okunur; boş olan tanımsız', () => {
  const md = '## Komutlar\n\n```bash\n# /start doldurur\ngeliştirme:  npm run dev\ntest:        npm run test   # vitest\nlint:        [ ]\ntip kontrol: npx tsc --noEmit\nbuild:       npm run build\n```\n';
  assert.deepEqual(komutlar(md), [
    { ad: 'lint', komut: null }, { ad: 'tip kontrol', komut: 'npx tsc --noEmit' }, { ad: 'test', komut: 'npm run test   # vitest' },
  ]);
  assert.deepEqual(komutlar('# başlık yok'), [{ ad: 'lint', komut: null }, { ad: 'tip kontrol', komut: null }, { ad: 'test', komut: null }]);
});

test('F-03 kapı: kırmızı kontrolün son satırları görünür, yeşil olanın çıktısı yazılmaz, boş ve Semgrep atlanır', () => {
  agents('node -e "console.error(\'HATA satiri\'); process.exit(1)"');
  const r = kapi();
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /❌ test/);
  assert.match(r.stdout, /HATA satiri/);
  assert.match(r.stdout, /✅ lint/);
  assert.doesNotMatch(r.stdout, /lint temiz/, 'yeşil kontrolün çıktısı token harcamasın');
  assert.match(r.stdout, /tip kontrol.*tanımsız/);
  assert.match(r.stdout, /Semgrep.*atlandı/);
  const durum = JSON.parse(fs.readFileSync(path.join(p, '.claude/state/gate.json'), 'utf8'));
  assert.equal(durum.gecti, false);
  assert.match(durum.imza, /^[0-9a-f]{64}$/);
  agents('node -e "process.exit(0)"');
  const yesil = kapi();
  assert.equal(yesil.status, 0);
  assert.doesNotMatch(yesil.stdout, /hiçbir kontrol çalışmadı/);
  fs.renameSync(path.join(p, 'AGENTS.md'), path.join(p, 'AGENTS.yok'));
  const bos = kapi();
  assert.equal(bos.status, 1, '3.14.1: hiçbir kontrol çalışmadıysa kapı boş, yeşil değil');
  assert.match(bos.stdout, /BOŞ.*hiçbir kontrol çalışmadı/);
  assert.doesNotMatch(bos.stdout, /onay/i, 'çalışacak komut yoksa komut onayı aranmaz');
  assert.equal(JSON.parse(fs.readFileSync(path.join(p, '.claude/state/gate.json'), 'utf8')).bos, true);
  fs.renameSync(path.join(p, 'AGENTS.yok'), path.join(p, 'AGENTS.md'));
});

test('F-03 commit kapısı: kapı yoksa, kırmızıysa veya eskiyse durur; yeşil + onayla veya "atlandı" ile geçer', () => {
  sh('git add -A && git commit -qm ara --allow-empty');
  yaz('a.js', 'y');
  assert.equal(onayla('board-qa').status, 0);
  const yok = commit();
  assert.equal(yok.status, 2);
  assert.match(yok.stderr, /gate\.mjs --run/);
  assert.equal(kapi().status, 0);
  assert.equal(commit().status, 0, 'yeşil kapı + onay');
  yaz('a.js', 'z');
  assert.equal(onayla('board-qa').status, 0);
  assert.equal(commit().status, 2, 'değişiklikten sonra eski kapı sonucu kullanılmaz');
  agents('node -e "process.exit(1)"');
  kapi();
  onayla('board-qa');
  const kirmizi = commit();
  assert.equal(kirmizi.status, 2);
  assert.match(kirmizi.stderr, /kırmızı/);
  assert.equal(onayla('atlandı: kullanıcı isteği').status, 0);
  assert.equal(commit().status, 0, 'kullanıcı isteğiyle atlanır');
  yaz('a.js', 'w');
  onayla('board-qa');
  fs.writeFileSync(path.join(p, '.claude/state/gate.json'), JSON.stringify({ imza: 'f'.repeat(64), gecti: true }));
  assert.equal(commit().status, 2, 'imzası tutmayan elle yazılmış yeşil sonuç geçmez');
});

test('F-03 denetim: izlenmeyen yeni dosya imzaya girer; genel git seçenekleri ve zincirler yakalanır; heredoc mesajı serbest', () => {
  agents('node -e "process.exit(0)"');
  sh('git add -A && git commit -qm ara2 --allow-empty');
  yaz('yeni.js', 'yeni');
  assert.equal(commit('git add -A && git commit -m x').status, 2, 'sadece yeni dosya: kapı ve kurul aranır');
  kapi();
  onayla('board-qa');
  const mesaj = "git add -A && git commit -m \"$(cat <<'EOF'\nfeat: x && rm -rf /\nEOF\n)\"";
  assert.equal(commit(mesaj).status, 0, 'heredoc mesajı zincir sayılmaz');
  yaz('kotu.js', 'gizli');
  assert.equal(commit('git add -A && git commit -m x').status, 2, 'onaydan sonra eklenen yeni dosya onayı geçersiz kılar');
  assert.equal(commit('git --no-pager commit -m x').status, 2);
  assert.equal(commit('git -C . commit -m x').status, 2);
  kapi();
  onayla('board-qa');
  const zincir = commit("sed -i s/a/b/ a.js && git commit -am x");
  assert.equal(zincir.status, 2, 'commit öncesi dosya değiştiren zincir');
  assert.match(zincir.stderr, /tek başına/);
  assert.equal(commit('git commit -m "$(rm -rf x)"').status, 2, 'komut ikamesi');
  assert.equal(commit('git commit -m x && git push').status, 2, 'push ayrı komut');
  assert.equal(commit('cd . && git add -A && git commit -m x').status, 0, 'cd ve git add ile commit serbest');
});

test('F-03 denetim: "atlandı" onayı her biçimde kullanıcıya sorulur', () => {
  const sor = (komut) => {
    const r = commit(komut);
    return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : null;
  };
  assert.equal(sor('node .claude/hooks/commit-gate.mjs --approve "atlandı: kullanıcı isteği"'), 'ask');
  assert.equal(sor("node .claude/hooks/commit-gate.mjs --approve 'atlandı'"), 'ask');
  assert.equal(sor('node .claude/hooks/commit-gate.mjs --approve atlandı:x'), 'ask');
  assert.equal(sor('node .claude/hooks/commit-gate.mjs --approve "board-qa"'), null);
});

test('3.14.1 boş kapı commit\'i durdurur; kullanıcı "atlandı" ile geçer', () => {
  agents('node -e "process.exit(0)"');
  sh('git add -A && git commit -qm ara3 --allow-empty');
  fs.renameSync(path.join(p, 'AGENTS.md'), path.join(p, 'AGENTS.yok'));
  yaz('a.js', 'bos');
  assert.equal(kapi().status, 1);
  onayla('board-qa');
  const r = commit();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /boş/);
  onayla('atlandı: kullanıcı isteği');
  assert.equal(commit().status, 0);
  fs.renameSync(path.join(p, 'AGENTS.yok'), path.join(p, 'AGENTS.md'));
});

test('3.14.1 komut onayı: yeni veya değişen komut onaysız çalışmaz; onay .git\'te durur, onaylama sorulur', () => {
  const isaret = path.join(p, 'calisti');
  agents(`node -e "require('fs').writeFileSync('calisti', '1')"`);
  const r = gate('--run');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /onay/i);
  assert.match(r.stdout, /writeFileSync/, 'kullanıcı neyi onayladığını görür');
  assert.ok(!fs.existsSync(isaret), 'onaysız komut çalışmaz');
  assert.equal(gate('--onayla').status, 0);
  assert.ok(fs.existsSync(path.join(p, '.git', 'kit-kapi-onayi.json')), 'onay klonla gelemeyecek yerde');
  assert.equal(gate('--run').status, 0);
  assert.ok(fs.existsSync(isaret), 'onaydan sonra çalışır');
  fs.rmSync(isaret);
  agents(`node -e "require('fs').writeFileSync('calisti', '2')"`);
  assert.equal(gate('--run').status, 1, 'komut değişince eski onay geçmez');
  assert.ok(!fs.existsSync(isaret));
  // Depoyla gelen sahte onay (.claude/state) .git varken okunmaz
  fs.copyFileSync(path.join(p, '.git', 'kit-kapi-onayi.json'), path.join(p, '.claude/state/kit-kapi-onayi.json'));
  assert.equal(gate('--run').status, 1);
  const sor = (k) => {
    const c = commit(k);
    return c.stdout.trim() ? JSON.parse(c.stdout).hookSpecificOutput.permissionDecision : null;
  };
  assert.equal(sor('node .claude/hooks/gate.mjs --onayla'), 'ask', 'Claude: hook sorar');
  assert.match(JSON.parse(commit('node .claude/hooks/gate.mjs --onayla').stdout).hookSpecificOutput.permissionDecisionReason, /writeFileSync/, 'kullanıcı neyi onayladığını görür');
  assert.equal(sor("node ./.claude/hooks/gate.mjs '--onayla'"), 'ask');
  assert.equal(sor('node .claude/hooks/gate.mjs --run'), null);
  // 3.14.2: zincirdeki komut AGENTS.md'yi onay penceresinden sonra değiştirebilir (pencere eski listeyi gösterir)
  for (const k of ['node -e "1" && node .claude/hooks/gate.mjs --onayla', 'cd . ; node .claude/hooks/gate.mjs --onayla', 'node .claude/hooks/gate.mjs --onayla $(true)'])
    assert.equal(sor(k), 'deny', k);
  assert.equal(izinKarsiligi('node .claude/hooks/gate.mjs --onayla')?.karar, 'ask', 'Codex/Antigravity');
  assert.equal(izinKarsiligi('echo x > .git/kit-kapi-onayi.json')?.karar, 'ask', '.git kabukla yazılmaz');
  agents('node -e "process.exit(0)"');
});

test('3.14.1 denetim: GIT_DIR ile başka yerdeki onay kaydı kullanılamaz', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-'));
  execSync('git init --bare -q .', { cwd: bare, stdio: 'ignore' });
  agents('node -e "process.exit(3)"');
  gate('--onayla');
  fs.copyFileSync(path.join(p, '.git', 'kit-kapi-onayi.json'), path.join(bare, 'kit-kapi-onayi.json')); // sahte onay: exit(3)
  agents('node -e "process.exit(0)"');
  gate('--onayla'); // gerçek onay başka komut için
  agents('node -e "process.exit(3)"');
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), '--run'], { cwd: p, encoding: 'utf8', env: { ...env(), GIT_DIR: bare, GIT_COMMON_DIR: bare } });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /komut onayı gerekli/);
  fs.rmSync(bare, { recursive: true, force: true });
  agents('node -e "process.exit(0)"');
});

test('3.14.1 denetim: proje içine konmuş semgrep önerilmez', { skip: process.platform !== 'win32' }, () => {
  fs.writeFileSync(path.join(p, 'semgrep.cmd'), '@echo off\r\nexit /b 0\r\n');
  yaz('c.js', 'kod');
  gate('--onayla');
  const e = { ...env() };
  delete e.SEMGREP;
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), '--run'], { cwd: p, encoding: 'utf8', env: e });
  assert.doesNotMatch(r.stdout, /SEMGREP=/, r.stdout);
  fs.rmSync(path.join(p, 'semgrep.cmd'));
  fs.rmSync(path.join(p, 'c.js'));
});

test('3.14.1 Semgrep: Windows\'ta .cmd olarak kuruluysa "kurulu değil" denmez', { skip: process.platform !== 'win32' }, () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-'));
  fs.writeFileSync(path.join(bin, 'semgrep.cmd'), '@echo off\r\nexit /b 0\r\n');
  yaz('b.js', 'yeni kod');
  gate('--onayla');
  const e = { ...process.env, CLAUDE_PROJECT_DIR: p, PATH: `${bin};${process.env.PATH}` };
  delete e.SEMGREP;
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), '--run'], { cwd: p, encoding: 'utf8', env: e });
  assert.match(r.stdout, /Semgrep.*atlandı.*SEMGREP=/);
  assert.doesNotMatch(r.stdout, /kurulu değil/);
  fs.rmSync(bin, { recursive: true, force: true });
  fs.rmSync(path.join(p, 'b.js'));
});
