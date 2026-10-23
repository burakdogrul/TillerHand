// Çalıştır: node --test "kit/tests/*.test.mjs"
// Bağlam paketleri (tools.mjs): paket aç/kapat kişisel ayara yazılır, proje ayarı ve diğer anahtarlar korunur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PAKETLER, paketAyarla, paketDurumu } from '../../.claude/hooks/tools.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BETIK = path.join(KOK, '.claude/hooks/tools.mjs');
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function proje(local) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'paket-'));
  fs.mkdirSync(path.join(p, '.claude'));
  fs.writeFileSync(path.join(p, '.claude/settings.json'), JSON.stringify({
    enabledPlugins: { 'taste-skill@taste-skill': false, 'ui-ux-pro-max@ui-ux-pro-max-skill': false, 'ponytail@ponytail': true },
  }));
  if (local !== undefined) fs.writeFileSync(path.join(p, '.claude/settings.local.json'), typeof local === 'string' ? local : JSON.stringify(local));
  return p;
}
const calistir = (p, arg, env = {}) => spawnSync(process.execPath, [BETIK, ...arg], {
  encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, ...env }, timeout: 15000,
});

test('paket açma: kişisel ayara yazar, diğer anahtarları ve projede olmayan eklentileri korur', () => {
  const p = proje({ permissions: { allow: ['Bash(x)'] }, enabledPlugins: { 'foo@bar': true } });
  paketAyarla(p, 'tasarim', true);
  const l = json(path.join(p, '.claude/settings.local.json'));
  assert.deepEqual(l.permissions, { allow: ['Bash(x)'] }, 'izinler korunur');
  assert.equal(l.enabledPlugins['foo@bar'], true, 'başka eklenti korunur');
  assert.equal(l.enabledPlugins['taste-skill@taste-skill'], true);
  assert.equal(l.enabledPlugins['ui-ux-pro-max@ui-ux-pro-max-skill'], true);
  assert.ok(!('gsap-skills@gsap-skills' in l.enabledPlugins), 'projenin tanımadığı eklenti eklenmez');
  assert.equal(json(path.join(p, '.claude/settings.json')).enabledPlugins['taste-skill@taste-skill'], false, 'proje ayarı değişmez');
  assert.equal(paketDurumu(p).find((d) => d.ad === 'tasarim').acik, true);

  paketAyarla(p, 'tasarim', false);
  const k = json(path.join(p, '.claude/settings.local.json'));
  assert.ok(!('taste-skill@taste-skill' in k.enabledPlugins), 'kapatınca kişisel istisna silinir, proje varsayılanına döner');
  assert.equal(k.enabledPlugins['foo@bar'], true);
  assert.equal(paketDurumu(p).find((d) => d.ad === 'tasarim').acik, false);
  fs.rmSync(p, { recursive: true, force: true });
});

test('paket açma: kişisel ayar dosyası yoksa oluşturur', () => {
  const p = proje();
  paketAyarla(p, 'tasarim', true);
  assert.equal(json(path.join(p, '.claude/settings.local.json')).enabledPlugins['taste-skill@taste-skill'], true);
  fs.rmSync(p, { recursive: true, force: true });
});

test('saldırgan: bilinmeyen paket, yol ve JSON argümanı reddedilir; bozuk kişisel ayar ezilmez', () => {
  const bozuk = '{"enabledPlugins": {';
  const p = proje(bozuk);
  for (const ad of ['yok', '../x', '{"a":1}', '__proto__', 'constructor']) {
    assert.throws(() => paketAyarla(p, ad, true), /paket/i, ad);
    const r = calistir(p, ['--ac', ad]);
    assert.equal(r.status, 1, `${ad}: çıkış kodu 1`);
  }
  assert.throws(() => paketAyarla(p, 'tasarim', true), /settings\.local\.json/);
  assert.equal(fs.readFileSync(path.join(p, '.claude/settings.local.json'), 'utf8'), bozuk, 'bozuk dosya olduğu gibi kalır');
  fs.rmSync(p, { recursive: true, force: true });
});

test('--gerekli: kapalı paket 2 ile çıkar ve açma yolunu söyler, açıkken 0', () => {
  const p = proje();
  const kapali = calistir(p, ['--gerekli', 'tasarim']);
  assert.equal(kapali.status, 2);
  assert.match(kapali.stdout, /kapalı/);
  assert.match(kapali.stdout, /--ac tasarim/);
  assert.equal(calistir(p, ['--ac', 'tasarim']).status, 0);
  const acik = calistir(p, ['--gerekli', 'tasarim']);
  assert.equal(acik.status, 0);
  assert.match(acik.stdout, /açık/);
  assert.equal(calistir(p, []).status, 0, 'durum tablosu');
  fs.rmSync(p, { recursive: true, force: true });
});

test('--olc: kurulu eklentilerin skill açıklama yükünü ölçer', () => {
  const p = proje();
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  const kurulum = path.join(cfg, 'plugins/cache/x/taste-skill');
  fs.mkdirSync(path.join(kurulum, 'skills/a'), { recursive: true });
  fs.writeFileSync(path.join(kurulum, 'skills/a/SKILL.md'), `---\nname: a\ndescription: ${'x'.repeat(400)}\n---\ngövde`);
  fs.writeFileSync(path.join(cfg, 'plugins/installed_plugins.json'), JSON.stringify({ plugins: { 'taste-skill@taste-skill': [{ scope: 'user', installPath: kurulum }] } }));
  const r = calistir(p, ['--olc'], { CLAUDE_CONFIG_DIR: cfg });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /taste-skill@taste-skill/);
  assert.match(r.stdout, /\b100\b/, '400 karakter ≈ 100 token');
  fs.rmSync(p, { recursive: true, force: true });
  fs.rmSync(cfg, { recursive: true, force: true });
});

test('ayarlar: paket eklentileri varsayılan kapalı, çekirdek açık, pazarlar tanımlı', () => {
  const s = json(path.join(KOK, '.claude/settings.json'));
  const paketli = new Set(Object.values(PAKETLER).flatMap((k) => k.eklentiler));
  for (const id of paketli) {
    assert.equal(s.enabledPlugins[id], false, `${id} paket eklentisi kapalı gelir`);
    const pazar = id.split('@')[1];
    assert.ok(pazar === 'claude-plugins-official' || s.extraKnownMarketplaces[pazar], `${pazar} pazarı tanımlı`);
  }
  for (const id of ['caveman@caveman', 'ponytail@ponytail', 'mattpocock-skills@mattpocock', 'impeccable@impeccable', 'humanizer@humanizer',
    'security-guidance@claude-plugins-official', 'hookify@claude-plugins-official', 'claude-md-management@claude-plugins-official']) {
    assert.equal(s.enabledPlugins[id], true, `${id} çekirdekte`);
    assert.ok(!paketli.has(id), `${id} pakette değil`);
  }
  assert.ok(s.permissions.allow.includes('Bash(node .claude/hooks/tools.mjs --gerekli:*)'));
  // Paket açmak eklenti hook'larını kullanıcının yetkisiyle çalıştırır: her zaman sorulur
  assert.ok(s.permissions.ask.includes('Bash(node .claude/hooks/tools.mjs --ac:*)'));
  assert.ok(!s.permissions.allow.some((r) => r.startsWith('Bash(node .claude/hooks/tools.mjs') && (r.includes(':*)') && !/--(gerekli|kapat):\*\)$/.test(r))), 'geniş izin yok');
});
