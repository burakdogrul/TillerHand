// Çalıştır: node --test "kit/tests/*.test.mjs"
// Karmaşıklık bütçesi (F-07): değişen kod dosyalarında fonksiyon karmaşıklığı 15, fonksiyon 80, dosya 400 satır.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BUTCE, secilenler, uzunDosyalar, lizardArgumanlari, degisenler } from '../../.claude/hooks/budget.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BETIK = path.join(KOK, '.claude', 'hooks', 'budget.mjs');
let p;
const sh = (k) => execSync(k, { cwd: p, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const yaz = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
before(() => {
  p = fs.mkdtempSync(path.join(os.tmpdir(), 'butce-'));
  sh('git init -q && git config user.email t@t && git config user.name t');
  yaz('src/kisa.ts', 'export const a = 1;\n');
  yaz('README.md', '# x\n');
  sh('git add . && git commit -qm init');
});
after(() => fs.rmSync(p, { recursive: true, force: true }));

test('F-07 eşikler kararla aynı', () => {
  assert.deepEqual(BUTCE, { karmasiklik: 15, fonksiyon: 80, dosya: 400 });
});

test('F-07 sadece kod dosyaları ölçülür; test, migration, üretilmiş ve kit dosyaları hariç', () => {
  assert.deepEqual(secilenler([
    'src/a.ts', 'app/page.tsx', 'api/odeme.py', 'lib/x.mjs',
    'src/a.test.ts', 'tests/e2e/giris.ts', 'test_api.py', 'supabase/migrations/1.sql', 'alembic/versions/1_x.py',
    'next-env.d.ts', 'src/types.gen.ts', 'dist/app.js', '.claude/hooks/dashboard.mjs', 'README.md', 'package.json',
  ]), ['src/a.ts', 'app/page.tsx', 'api/odeme.py', 'lib/x.mjs']);
});

test('F-07 400 satırı aşan dosya yakalanır, 400 satır geçer', () => {
  yaz('src/sinir.ts', 'x;\n'.repeat(400));
  yaz('src/uzun.ts', 'x;\n'.repeat(401));
  assert.deepEqual(uzunDosyalar(p, ['src/sinir.ts', 'src/uzun.ts']), [{ dosya: 'src/uzun.ts', satir: 401 }]);
});

test('F-07 lizard sabit sürüm ve eşiklerle çağrılır', () => {
  assert.deepEqual(lizardArgumanlari(['src/a.ts']), ['-C', '15', '-L', '80', '-w', 'src/a.ts']);
});

test('F-07 değişen dosyalar: base varsa fark, yoksa veya sıfırsa tüm depo', () => {
  const base = sh('git rev-parse HEAD');
  yaz('src/yeni.ts', 'export const b = 2;\n');
  sh('git add src/yeni.ts && git commit -qm yeni');
  assert.deepEqual(degisenler(p, base), ['src/yeni.ts']);
  assert.ok(degisenler(p, '').includes('src/kisa.ts'), 'base yok: tümü');
  assert.ok(degisenler(p, '0000000000000000000000000000000000000000').includes('src/kisa.ts'), 'yeni dal: tümü');
  assert.ok(degisenler(p, 'deadbeefdeadbeef').includes('src/kisa.ts'), 'klonda olmayan base: tümü');
});

test('F-07 --check: değişen kod dosyası yoksa geçer, uzun dosya CI\'ı kırmızı yapar', () => {
  const base = sh('git rev-parse HEAD');
  yaz('docs/not.md', 'x\n');
  sh('git add docs/not.md && git commit -qm doc');
  const r = spawnSync(process.execPath, [BETIK, '--check', '--base', base], { cwd: p, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /değişen kod dosyası yok/i);
  const base2 = sh('git rev-parse HEAD');
  yaz('src/dev.ts', 'x;\n'.repeat(450));
  sh('git add src/dev.ts && git commit -qm uzun');
  const r2 = spawnSync(process.execPath, [BETIK, '--check', '--base', base2], { cwd: p, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, LIZARD: 'olmayan-lizard-komutu' } });
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /src\/dev\.ts.*450 satır/);
});
