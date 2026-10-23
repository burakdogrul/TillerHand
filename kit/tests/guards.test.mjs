// Çalıştır: node --test "kit/tests/*.test.mjs"
// Paket kapısı, yıkıcı komut kalkanı ve bağlam yüzdesi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { paketleriBul, denetle, benzerPopuler } from '../../.claude/hooks/package-gate.mjs';
import { degerlendir, izinKarsiligi } from '../../.claude/hooks/destructive-guard.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');

test('paket kapısı: komutlardan paket adlarını çıkarır', () => {
  assert.deepEqual(paketleriBul('npm install -D zod @types/node@20 ./yerel'), [{ eko: 'npm', ad: 'zod' }, { eko: 'npm', ad: '@types/node' }]);
  assert.deepEqual(paketleriBul('cd web && pnpm add react-dom@18.3.1'), [{ eko: 'npm', ad: 'react-dom' }]);
  assert.deepEqual(paketleriBul('npx expo install expo-camera'), [{ eko: 'npm', ad: 'expo-camera' }]);
  assert.deepEqual(paketleriBul('uv add "fastapi[standard]>=0.110" httpx'), [{ eko: 'pypi', ad: 'fastapi' }, { eko: 'pypi', ad: 'httpx' }]);
  assert.deepEqual(paketleriBul('pip install -r requirements.txt requests==2.32'), [{ eko: 'pypi', ad: 'requests' }]);
  assert.deepEqual(paketleriBul('npm install'), [], 'argümansız kurulum (kilit dosyası) kontrol edilmez');
  assert.deepEqual(paketleriBul('npm run build && git status'), []);
});

test('paket kapısı: popüler pakete benzeyen adı yakalar', () => {
  assert.equal(benzerPopuler('npm', 'reacts'), 'react');
  assert.equal(benzerPopuler('pypi', 'reqeusts'), null, 'iki harf yer değişimi mesafe 2');
  assert.equal(benzerPopuler('pypi', 'request'), 'requests');
  assert.equal(benzerPopuler('npm', 'react'), null, 'kendisi popüler');
});

const yanit = (status, govde) => ({ status, ok: status >= 200 && status < 300, json: async () => govde });
const simdi = Date.parse('2026-10-11T00:00:00Z');

test('paket kapısı: kayıt defteri kararları', async () => {
  const al = (veri) => async (url) => veri[url.includes('downloads') ? 'indirme' : 'paket'];
  assert.equal((await denetle({ eko: 'npm', ad: 'olmayan-paket' }, al({ paket: yanit(404) }), simdi)).durum, 'yok');
  assert.equal((await denetle({ eko: 'npm', ad: 'taze' }, al({ paket: yanit(200, { time: { created: '2026-10-01' } }), indirme: yanit(200, { downloads: 99999 }) }), simdi)).durum, 'yeni');
  assert.equal((await denetle({ eko: 'npm', ad: 'sessiz' }, al({ paket: yanit(200, { time: { created: '2020-01-01' } }), indirme: yanit(200, { downloads: 12 }) }), simdi)).durum, 'az');
  assert.equal((await denetle({ eko: 'npm', ad: 'saglam' }, al({ paket: yanit(200, { time: { created: '2020-01-01' } }), indirme: yanit(200, { downloads: 50000 }) }), simdi)).durum, 'tamam');
  assert.equal((await denetle({ eko: 'pypi', ad: 'yeni-py' }, al({ paket: yanit(200, { releases: { '0.1': [{ upload_time_iso_8601: '2026-10-05T00:00:00Z' }] } }) }), simdi)).durum, 'yeni');
  assert.equal((await denetle({ eko: 'pypi', ad: 'x' }, async () => { throw new Error('ağ'); }, simdi)).durum, 'bilinmiyor');
});

test('kalkan: yıkıcı komutlar engellenir, normal komutlar geçer', () => {
  const k = (s) => degerlendir(s)?.karar ?? 'serbest';
  const tablo = 'users';
  assert.equal(k(`psql -c "DROP TABLE ${tablo}"`), 'deny');
  assert.equal(k(`psql -c 'TRUNCATE ${tablo}'`), 'deny');
  assert.equal(k(`psql -c 'DELETE FROM ${tablo}'`), 'deny', 'WHERE yok');
  assert.equal(k(`psql -c "DELETE FROM ${tablo} WHERE id=1"`), 'serbest');
  assert.equal(k('npx supabase db reset'), 'deny');
  assert.equal(k('npx prisma migrate reset --force'), 'deny');
  assert.equal(k('docker compose down -v'), 'deny');
  assert.equal(k('git clean -fdx'), 'deny');
  assert.equal(k('vercel --prod'), 'ask');
  assert.equal(k('npx -y vercel@63.1.1 deploy --prod'), 'ask', 'sabit sürümlü npx ile prod deploy');
  assert.equal(k('npx vercel@63.1.1 promote https://app-abc.vercel.app'), 'ask', 'önizlemeyi prod\'a almak');
  assert.equal(k('vercel rollback'), 'ask', 'prod geri alma');
  assert.equal(k('npx -y vercel@63.1.1 deploy'), 'serbest', 'önizleme deploy\'u');
  assert.equal(k('vercel --scope ekip promote https://app-abc.vercel.app'), 'ask', 'araya bayrak girse de promote');
  assert.equal(k('npx vercel@63.1.1 -t $TOKEN rollback'), 'ask', 'araya bayrak girse de rollback');
  assert.equal(k('vercel deploy --target=production'), 'ask', '--target=production');
  assert.equal(k('vercel deploy --target production'), 'ask', '--target production');
  assert.equal(k('vercel deploy --target preview'), 'serbest');
  assert.equal(k('vercel deploy --target "production"'), 'ask', 'tırnaklı hedef');
  assert.equal(k("vercel deploy --target='prod'"), 'ask', 'tırnaklı = hedef');
  assert.equal(k('vercel deploy --target    production'), 'ask', 'çok boşluk');
  assert.equal(k('vercel --scope ekip "promote" https://a.vercel.app'), 'ask', 'tırnaklı alt komut');
  // Kabuk tırnağı ve kaçışı kaldırınca aynı komut: kurallar tırnağı açılmış metne de uygulanır
  assert.equal(k('vercel deploy --pro""d'), 'ask', 'kelime içi tırnak');
  assert.equal(k("vercel deploy --'prod'"), 'ask');
  assert.equal(k('vercel pro\\mote https://a.vercel.app'), 'ask', 'ters eğik çizgi kaçışı');
  assert.equal(k("vercel deploy $'--prod'"), 'ask', "$'..' dizgisi");
  assert.equal(k('psql -c "DR""OP TABLE users"'), 'deny', 'SQL içinde tırnak');
  assert.equal(k('git commit -m "it\'s fine"'), 'serbest', 'tırnaklı sıradan komut serbest');
  assert.equal(izinKarsiligi('git reset --ha"rd" HEAD~1')?.karar, 'deny', 'izin karşılığı da tırnağı açar');
  // Şüpheliyse sor: gizleme işareti + korunan anahtar kelime (kabuğu taklit etmeye çalışmaz)
  assert.equal(k('vercel deploy --pr\\\nod'), 'ask', 'satır sonu \\');
  assert.equal(k("vercel deploy $'\\x2d\\x2dprod'"), 'ask', 'ANSI-C kaçışı');
  assert.equal(k('vercel pro$()mote https://a.vercel.app'), 'ask', 'boş ikame');
  assert.equal(k('git reset --ha${X}rd HEAD~1'), 'ask', 'değişken parçası');
  assert.equal(k('psql -c "DR`true`OP TABLE users"'), 'ask', 'ters tırnak ikamesi');
  assert.equal(k('rm -r$@f build'), 'ask', '$@ parçası');
  assert.equal(k('echo $(date) && npm run build'), 'serbest', 'gizleme var, korunan kelime yok');
  assert.equal(k("vercel deploy $'--target=preview'"), 'serbest', 'önizleme');
  assert.equal(k('git push origin main'), 'ask');
  assert.equal(k('psql postgres://u:p@db.ornek-prod.com:5432/app -c "select 1"'), 'ask', 'uzak veritabanı');
  assert.equal(k('psql postgres://u:p@localhost:5432/app -c "select 1"'), 'serbest');
  assert.equal(k('npm run test && git status'), 'serbest');
  assert.equal(k('git push origin ozellik/fatura'), 'serbest');
});

test('bağlam yüzdesi: durum çubuğu hazır alanı veya token hesabını gösterir', () => {
  const cubuk = (cw) => spawnSync(process.execPath, [path.join(HOOKS, 'statusline.mjs')], {
    input: JSON.stringify({ workspace: { project_dir: os.tmpdir() }, context_window: cw }), encoding: 'utf8',
  }).stdout;
  assert.match(cubuk({ used_percentage: 41.6 }), /bağlam %42/);
  assert.match(cubuk({ context_window_size: 200000, current_usage: { input_tokens: 1000, cache_read_input_tokens: 99000, output_tokens: 5000 } }), /bağlam %50 ⚠/);
  assert.doesNotMatch(cubuk(null), /bağlam/);
});

test('yapı koruyucu: harita, sandbox, dağınıklık kalıpları', async () => {
  const { globRegex, denetle } = await import('../../.claude/hooks/structure-guard.mjs');
  assert.ok(globRegex('src/features/*/components/**').test('src/features/invoice/components/List.tsx'));
  assert.ok(!globRegex('src/features/*/components/**').test('src/features/invoice/random/List.tsx'));
  assert.ok(globRegex('docs/**').test('docs/a/b/c.md'));
  assert.ok(globRegex('next.config.*').test('next.config.mjs'));
  const harita = {
    allow: ['README.md', 'docs/**', 'src/features/*/components/**', 'src/lib/**'].map(globRegex),
    deny: ['**/*.bak', '**/*-old.*', '**/* copy*'].map(globRegex),
    ham: { allow: ['README.md', 'docs/**', 'src/features/*/components/**', 'src/lib/**'] },
  };
  assert.equal(denetle('src/features/invoice/components/List.tsx', harita), null);
  assert.equal(denetle('sandbox/deneme.ts', harita), null, 'sandbox serbest');
  assert.equal(denetle('src/utils/x.ts', harita)?.karar, 'ask', 'harita dışı sorulur');
  assert.equal(denetle('src/lib/db-old.ts', harita)?.karar, 'deny', 'eski sürüm dosyası engellenir');
  assert.equal(denetle('docs/plan copy.md', harita)?.karar, 'deny');
  assert.equal(denetle(['src', 'lib', 'db.ts'].join(String.fromCharCode(92)), harita), null, 'Windows ayırıcısı');
  assert.equal(denetle('herhangi.txt', null), null, 'harita yoksa serbest');
});

test('düzenleme kilidi: klasör içi serbest, dışı ve benzer adlı klasör engellenir', async () => {
  const { izinli } = await import('../../.claude/hooks/freeze-guard.mjs');
  const kok = path.resolve(os.tmpdir(), 'kilit-kok');
  assert.equal(izinli('src/features/auth/login.ts', 'src/features/auth', kok), true);
  assert.equal(izinli(path.join(kok, 'src/features/auth/x.ts'), 'src/features/auth/', kok), true, 'mutlak yol ve sondaki /');
  assert.equal(izinli('src/features/authz/x.ts', 'src/features/auth', kok), false, 'önek benzerliği yetmez');
  assert.equal(izinli('src/lib/db.ts', 'src/features/auth', kok), false);
  assert.equal(izinli('docs/workflow/progress.md', 'src/features/auth', kok), true, 'ilerleme notu serbest');
});

test('düzenleme kilidi: hook kilitliyken dışarıyı reddeder, kilit kalkınca serbest', async () => {
  const fs = await import('node:fs');
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'kilit-'));
  const calistir = (arg, girdi) => spawnSync('node', [path.join(HOOKS, 'freeze-guard.mjs'), ...arg], { input: girdi, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: kok } });
  const yaz = (f) => JSON.stringify({ tool_input: { file_path: path.join(kok, f) } });
  assert.equal(calistir([], yaz('src/lib/x.ts')).stdout, '', 'kilit yokken sessiz');
  assert.match(calistir(['--set', 'src/features/auth'], '').stdout, /src\/features\/auth/);
  assert.match(calistir([], yaz('src/lib/x.ts')).stdout, /"permissionDecision":"deny"/);
  assert.equal(calistir([], yaz('src/features/auth/a.ts')).stdout, '');
  calistir(['--off'], '');
  assert.equal(calistir([], yaz('src/lib/x.ts')).stdout, '');
});

test('düzenleme kilidi: izinli --set önekiyle kilit kaldırılamaz veya genişletilemez, daraltılabilir', async () => {
  const fs = await import('node:fs');
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'kilit2-'));
  const calistir = (...arg) => spawnSync('node', [path.join(HOOKS, 'freeze-guard.mjs'), ...arg], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: kok } });
  const kilit = () => JSON.parse(fs.readFileSync(path.join(kok, '.claude/state/freeze.json'), 'utf8')).dir;
  calistir('--set', 'src/features/auth');
  calistir('--set', 'x', '--off');
  assert.equal(kilit(), 'src/features/auth', '--off sonradan eklenince kilit kalkmaz');
  assert.equal(calistir('--set', '.').status, 1, 'kilit bütün projeye genişletilemez');
  assert.equal(calistir('--set', 'src').status, 1, 'üst klasöre genişletilemez');
  assert.equal(calistir('--set', 'src/features/auth/login').status, 0, 'daraltma serbest');
  assert.equal(kilit(), 'src/features/auth/login');
  calistir('--off');
  assert.equal(fs.existsSync(path.join(kok, '.claude/state/freeze.json')), false);
});
