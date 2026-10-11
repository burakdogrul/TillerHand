// Çalıştır: node --test "kit/testler/*.test.mjs"
// Paket kapısı, yıkıcı komut kalkanı ve bağlam yüzdesi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { paketleriBul, denetle, benzerPopuler } from '../../.claude/hooks/paket-kapisi.mjs';
import { degerlendir } from '../../.claude/hooks/yikici-kalkan.mjs';

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
