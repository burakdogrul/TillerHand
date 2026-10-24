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

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');
let p;
const env = () => ({ ...process.env, CLAUDE_PROJECT_DIR: p, SEMGREP: 'olmayan-semgrep-komutu' });
const kapi = () => spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), '--run'], { cwd: p, encoding: 'utf8', env: env() });
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
  assert.match(kapi().stdout, /YEŞİL.*hiçbir kontrol çalışmadı/, 'komutsuz projede uyarı');
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
