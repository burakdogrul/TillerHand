// Çalıştır: node --test "kit/tests/*.test.mjs"
// Template klonunu geçici klasöre kopyalar, kur ve guncelle akışlarını uçtan uca dener.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { birlestir } from '../kit.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT_MJS = path.join(REPO, 'kit', 'kit.mjs');
let tmp;

const oku = (p) => fs.readFileSync(p, 'utf8');
const yaz = (p, s) => fs.writeFileSync(p, s);
const hashOf = (s) => crypto.createHash('sha256').update(s).digest('hex');
const node = (...args) => spawnSync(process.execPath, args, { encoding: 'utf8' });

// Template'ten "Use this template" ile açılmış yeni bir projeyi taklit eder
function klonla(ad) {
  const hedef = path.join(tmp, ad);
  fs.cpSync(REPO, hedef, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)$/.test(src) && !src.endsWith('.kit.json') });
  return hedef;
}
const kur = (p, ...args) => node(path.join(p, 'kit', 'kit.mjs'), 'install', ...args);
const guncelle = (p, ...args) => node(KIT_MJS, 'update', '--project', p, ...args);
const kayit = (p) => JSON.parse(oku(path.join(p, '.kit.json')));

before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-test-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('birlestir: nesneleri derin, dizileri tekrarsız birleştirir', () => {
  assert.deepEqual(birlestir({ a: [1, 2], b: { c: 1 } }, { a: [2, 3], b: { d: 2 } }), { a: [1, 2, 3], b: { c: 1, d: 2 } });
});

test('kur: web-saas + ai', () => {
  const p = klonla('web');
  const r = kur(p, '--type', 'web-saas', '--addons', 'ai');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(path.join(p, 'kit')), 'kit/ silindi');
  assert.match(oku(path.join(p, 'docs/architecture/stack.md')), /Next\.js/, 'stack yer tutucusu tip dosyasıyla değişti');
  assert.ok(fs.existsSync(path.join(p, 'docs/design/design-guide.md')));
  assert.ok(fs.existsSync(path.join(p, 'docs/ai/guide.md')));
  assert.ok(fs.existsSync(path.join(p, '.claude/structure.json')) && fs.existsSync(path.join(p, 'docs/architecture/structure.md')), 'yapı haritası ve rehberi');
  assert.ok(fs.existsSync(path.join(p, '.claude/findings/protocol.md')) && fs.existsSync(path.join(p, '.claude/commands/findings-business.md')), 'bulgu sistemi');
  assert.ok(!fs.existsSync(path.join(p, '.github/workflows/kit-tests.yml')), 'kite özel iş akışı projeye taşınmaz');
  assert.match(oku(path.join(p, 'README.md')), /\[PROJE ADI\]/, 'README proje şablonu');
  const s = JSON.parse(oku(path.join(p, '.claude/settings.json')));
  assert.ok(s.hooks.PostToolUse && s.hooks.PreToolUse && s.statusLine && s.enabledPlugins, 'settings birleşti');
  assert.ok(s.permissions.allow.includes('Bash(npm run lint)') && s.permissions.allow.includes('Bash(git status)'));
  const gi = oku(path.join(p, '.gitignore'));
  assert.ok(gi.includes('dashboard.html') && gi.includes('node_modules/'), '.gitignore = ortak + tip');
  const env = oku(path.join(p, '.env.example'));
  assert.ok(env.includes('NEXT_PUBLIC_SUPABASE_URL') && env.includes('AI_MODEL_VARSAYILAN'), '.env.example = tip + AI');
  assert.ok(!fs.readdirSync(p, { recursive: true }).some((f) => /\.(ekle|birlestir\.json)$/.test(f)), 'parça dosyası kopyalanmadı');
  const k = kayit(p);
  assert.equal(k.type, 'web-saas');
  assert.deepEqual(k.addons, ['ai']);
  assert.ok(k.files['.claude/commands/start.md'] && k.files['docs/architecture/stack.md']);
});

test('kur: ikinci kez çalışmaz, geçersiz tip reddedilir', () => {
  const p = klonla('iki');
  assert.equal(kur(p, '--type', 'yok').status, 1);
  assert.equal(kur(p, '--type', 'mobile', '--keep-kit').status, 0);
  assert.equal(kur(p, '--type', 'mobile', '--keep-kit').status, 1);
});

test('guncelle: senaryolar', () => {
  const p = klonla('gnc');
  assert.equal(kur(p, '--type', 'backend').status, 0);
  let r = guncelle(p);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Değişiklik yok/);

  const k = kayit(p);
  const f1 = '.claude/commands/plan-task.md'; yaz(path.join(p, f1), 'eski kit'); k.files[f1] = hashOf('eski kit');
  const f2 = '.claude/commands/review-changes.md'; yaz(path.join(p, f2), 'kullanici'); k.files[f2] = hashOf('eski kit');
  const f3 = 'docs/security/checklist.md'; yaz(path.join(p, f3), 'kullanici notu');
  const f4 = 'docs/product/launch.md'; fs.rmSync(path.join(p, f4));
  const f5 = 'docs/product/glossary.md'; fs.rmSync(path.join(p, f5)); delete k.files[f5];
  yaz(path.join(p, 'CLAUDE.md'), 'proje kurali');
  fs.writeFileSync(path.join(p, '.kit.json'), JSON.stringify(k));

  r = guncelle(p);
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(oku(path.join(p, f1)), 'eski kit', '(1) dokunulmamış kit dosyası güncellendi');
  assert.equal(oku(path.join(p, f2)), 'kullanici', '(2) kullanıcı değişikliği korundu');
  assert.ok(fs.existsSync(path.join(p, f2 + '.kit-new')), '(2) .kit-new bırakıldı');
  assert.equal(oku(path.join(p, f3)), 'kullanici notu', '(3) kit değişmemiş: dokunulmadı');
  assert.ok(!fs.existsSync(path.join(p, f3 + '.kit-new')));
  assert.ok(!fs.existsSync(path.join(p, f4)), '(4) silinen dosya geri gelmedi');
  assert.ok(fs.existsSync(path.join(p, f5)), '(5) yeni kit dosyası eklendi');
  assert.equal(oku(path.join(p, 'CLAUDE.md')), 'proje kurali', '(6) projeye ait dosyaya dokunulmadı');
});

test('guncelle: sonradan AI eki', () => {
  const p = klonla('ek');
  assert.equal(kur(p, '--type', 'mobile').status, 0);
  assert.ok(!fs.existsSync(path.join(p, 'docs/ai/guide.md')));
  const r = guncelle(p, '--addons', 'ai');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(p, 'docs/ai/guide.md')));
  const env = oku(path.join(p, '.env.example'));
  assert.equal(env.split('AI_MODEL_VARSAYILAN').length, 2, 'parça bir kez eklendi');
  guncelle(p, '--addons', 'ai');
  assert.equal(oku(path.join(p, '.env.example')).split('AI_MODEL_VARSAYILAN').length, 2, 'tekrar eklenmedi');
  assert.deepEqual(kayit(p).addons, ['ai']);
});

test('durum çubuğu ve pano: kurulum öncesi ve sonrası', () => {
  const durumCubugu = (p) => spawnSync(process.execPath, [path.join(p, '.claude/hooks/statusline.mjs')], {
    input: JSON.stringify({ workspace: { project_dir: p } }), encoding: 'utf8',
  }).stdout;
  const p = klonla('durum');
  assert.match(durumCubugu(p), /Kit kurulmadı/);
  assert.equal(kur(p, '--type', 'web-saas').status, 0);
  const ilerleme = path.join(p, 'docs/workflow/progress.md');
  yaz(ilerleme, oku(ilerleme).replace(/^\*\*Aktif faz:\*\* .*$/m, '**Aktif faz:** Faz 1').replace(/^\*\*Soru modu:\*\* .*$/m, '**Soru modu:** açık · kapalı konular: tasarim'));
  const kararlar = path.join(p, 'docs/decisions/log.md');
  const ayirici = '|---|---|---|---|---|---|---|---|\n';
  assert.ok(oku(kararlar).includes(ayirici), 'karar günlüğü 8 sütun');
  yaz(kararlar, oku(kararlar).replace(ayirici, ayirici + '| 1 | 2026-01-01 | Başlangıç | teknik | Framework? | Next.js | tek | kullanıcı |\n'));
  assert.match(durumCubugu(p), /▶ Faz 1 · .* · görev 0\/\d+ · soru: açık \(kapalı: tasarim\)/);
  const r = node(path.join(p, '.claude/hooks/dashboard.mjs'), p);
  assert.equal(r.status, 0, r.stderr);
  const html = oku(path.join(p, 'dashboard.html'));
  assert.ok(html.includes('Next.js') && html.includes('step now'), 'pano kararı ve aktif aşamayı gösteriyor');
  assert.ok(html.includes('Dikkat gerektirenler') && (html.match(/role="tab"/g) ?? []).length === 10, 'pano: dikkat alanı ve 10 sekme');
});
