// Çalıştır: node --test "kit/tests/*.test.mjs"
// /rollback: çalışan nokta kaydı, listeleme, geçmişi silmeden geri dönüş, kaydedilmemiş işin saklanması.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git, saveCheckpoint, listCheckpoints, restore } from '../../.claude/hooks/checkpoint.mjs';

function depo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'geri-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(root, '.gitignore'), '.env\n');
  return root;
}
const yaz = (root, f, m) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), m); };
const commit = (root, m) => { git(root, 'add', '-A'); git(root, 'commit', '-qm', m); };

test('geri alma: çalışan noktaya döner, geçmiş ve .env korunur, kaydedilmemiş iş saklanır', () => {
  const root = depo();
  yaz(root, 'app.js', 'calisiyor');
  commit(root, 'feat: ilk');
  const label = saveCheckpoint(root, 'G-001 bitti');
  assert.match(label, /^calisan\/\d{8}-\d{6}$/);

  yaz(root, 'app.js', 'bozuk');
  yaz(root, 'yeni.js', 'sonradan eklendi');
  commit(root, 'feat: bozan değişiklik');
  yaz(root, 'app.js', 'yarım iş');
  yaz(root, '.env', 'GIZLI=1');

  const { points, commits } = listCheckpoints(root);
  assert.equal(points[0].label, label);
  assert.equal(points[0].note, 'G-001 bitti');
  assert.equal(commits[0].message, 'feat: bozan değişiklik');

  const r = restore(root, label);
  assert.equal(r.changed, true);
  assert.ok(r.stashed, 'yarım iş stash\'e alındı');
  assert.equal(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), 'calisiyor');
  assert.equal(fs.existsSync(path.join(root, 'yeni.js')), false, 'hedefte olmayan takipli dosya kaldırıldı');
  assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), 'GIZLI=1', '.gitignore dosyasına dokunulmaz');
  assert.match(git(root, 'log', '-1', '--format=%s'), /^revert: calisan\/.+ haline dönüldü$/);
  assert.match(git(root, 'log', '--format=%s'), /feat: bozan değişiklik/, 'geçmiş silinmedi');
  assert.match(git(root, 'stash', 'list'), /geri-alma öncesi/);

  // Geri dönüş de geri alınabilir
  restore(root, 'HEAD~1');
  assert.equal(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), 'bozuk');
});

test('geri alma: kaydedilmemiş değişiklikle çalışan nokta konmaz; aynı haldeyse commit atılmaz', () => {
  const root = depo();
  yaz(root, 'a.js', '1');
  commit(root, 'ilk');
  yaz(root, 'a.js', '2');
  assert.throws(() => saveCheckpoint(root), /Kaydedilmemiş/);
  git(root, 'checkout', '--', 'a.js');
  const once = git(root, 'rev-parse', 'HEAD');
  assert.equal(restore(root, 'HEAD').changed, false);
  assert.equal(git(root, 'rev-parse', 'HEAD'), once);
  assert.throws(() => restore(root, 'yok-boyle-bir-sey'));
});

test('geri alma: izin listesindeki --list/--save önekiyle geri dönüş tetiklenemez (ilk argüman modu belirler)', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks', 'checkpoint.mjs');
  const root = depo();
  yaz(root, 'a.js', 'ilk');
  commit(root, 'ilk');
  yaz(root, 'a.js', 'ikinci');
  commit(root, 'ikinci');
  const run = (...arg) => spawnSync('node', [script, ...arg], { cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  run('--list', '--restore', 'HEAD~1', '--yes');
  run('--save', 'x', '--restore', 'HEAD~1', '--yes');
  assert.equal(fs.readFileSync(path.join(root, 'a.js'), 'utf8'), 'ikinci', 'izinli önekle geri dönüş olmamalı');
  assert.equal(run('--restore', 'HEAD~1', '--yes').status, 0);
  assert.equal(fs.readFileSync(path.join(root, 'a.js'), 'utf8'), 'ilk');
});
