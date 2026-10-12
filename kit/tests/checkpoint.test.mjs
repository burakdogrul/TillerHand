// Çalıştır: node --test "kit/tests/*.test.mjs"
// /rollback: çalışan nokta kaydı, listeleme, geçmişi silmeden geri dönüş, kaydedilmemiş işin saklanması.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git, kaydet, listele, geriDon } from '../../.claude/hooks/checkpoint.mjs';

function depo() {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'geri-'));
  git(kok, 'init', '-q');
  git(kok, 'config', 'user.email', 't@t');
  git(kok, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(kok, '.gitignore'), '.env\n');
  return kok;
}
const yaz = (kok, f, m) => { fs.mkdirSync(path.dirname(path.join(kok, f)), { recursive: true }); fs.writeFileSync(path.join(kok, f), m); };
const commit = (kok, m) => { git(kok, 'add', '-A'); git(kok, 'commit', '-qm', m); };

test('geri alma: çalışan noktaya döner, geçmiş ve .env korunur, kaydedilmemiş iş saklanır', () => {
  const kok = depo();
  yaz(kok, 'app.js', 'calisiyor');
  commit(kok, 'feat: ilk');
  const etiket = kaydet(kok, 'G-001 bitti');
  assert.match(etiket, /^calisan\/\d{8}-\d{6}$/);

  yaz(kok, 'app.js', 'bozuk');
  yaz(kok, 'yeni.js', 'sonradan eklendi');
  commit(kok, 'feat: bozan değişiklik');
  yaz(kok, 'app.js', 'yarım iş');
  yaz(kok, '.env', 'GIZLI=1');

  const { noktalar, commitler } = listele(kok);
  assert.equal(noktalar[0].etiket, etiket);
  assert.equal(noktalar[0].not, 'G-001 bitti');
  assert.equal(commitler[0].mesaj, 'feat: bozan değişiklik');

  const r = geriDon(kok, etiket);
  assert.equal(r.degisti, true);
  assert.ok(r.saklanan, 'yarım iş stash\'e alındı');
  assert.equal(fs.readFileSync(path.join(kok, 'app.js'), 'utf8'), 'calisiyor');
  assert.equal(fs.existsSync(path.join(kok, 'yeni.js')), false, 'hedefte olmayan takipli dosya kaldırıldı');
  assert.equal(fs.readFileSync(path.join(kok, '.env'), 'utf8'), 'GIZLI=1', '.gitignore dosyasına dokunulmaz');
  assert.match(git(kok, 'log', '-1', '--format=%s'), /^revert: calisan\/.+ haline dönüldü$/);
  assert.match(git(kok, 'log', '--format=%s'), /feat: bozan değişiklik/, 'geçmiş silinmedi');
  assert.match(git(kok, 'stash', 'list'), /geri-alma öncesi/);

  // Geri dönüş de geri alınabilir
  geriDon(kok, 'HEAD~1');
  assert.equal(fs.readFileSync(path.join(kok, 'app.js'), 'utf8'), 'bozuk');
});

test('geri alma: kaydedilmemiş değişiklikle çalışan nokta konmaz; aynı haldeyse commit atılmaz', () => {
  const kok = depo();
  yaz(kok, 'a.js', '1');
  commit(kok, 'ilk');
  yaz(kok, 'a.js', '2');
  assert.throws(() => kaydet(kok), /Kaydedilmemiş/);
  git(kok, 'checkout', '--', 'a.js');
  const once = git(kok, 'rev-parse', 'HEAD');
  assert.equal(geriDon(kok, 'HEAD').degisti, false);
  assert.equal(git(kok, 'rev-parse', 'HEAD'), once);
  assert.throws(() => geriDon(kok, 'yok-boyle-bir-sey'));
});
