// Çalıştır: node --test "kit/tests/*.test.mjs"
// Bağlam paketleri (tools.mjs): paket aç/kapat kişisel ayara yazılır, proje ayarı ve diğer anahtarlar korunur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PACKAGES, setPackage, packageStatus } from '../../.claude/hooks/tools.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BETIK = path.join(KOK, '.claude/hooks/tools.mjs');
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function project(local) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'paket-'));
  fs.mkdirSync(path.join(p, '.claude'));
  fs.writeFileSync(path.join(p, '.claude/settings.json'), JSON.stringify({
    enabledPlugins: { 'taste-skill@taste-skill': false, 'ui-ux-pro-max@ui-ux-pro-max-skill': false, 'ponytail@ponytail': true },
  }));
  if (local !== undefined) fs.writeFileSync(path.join(p, '.claude/settings.local.json'), typeof local === 'string' ? local : JSON.stringify(local));
  return p;
}
const run = (p, arg, env = {}) => spawnSync(process.execPath, [BETIK, ...arg], {
  encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, ...env }, timeout: 15000,
});

test('paket açma: kişisel ayara yazar, diğer anahtarları ve projede olmayan eklentileri korur', () => {
  const p = project({ permissions: { allow: ['Bash(x)'] }, enabledPlugins: { 'foo@bar': true } });
  setPackage(p, 'tasarim', true);
  const l = json(path.join(p, '.claude/settings.local.json'));
  assert.deepEqual(l.permissions, { allow: ['Bash(x)'] }, 'izinler korunur');
  assert.equal(l.enabledPlugins['foo@bar'], true, 'başka eklenti korunur');
  assert.equal(l.enabledPlugins['taste-skill@taste-skill'], true);
  assert.equal(l.enabledPlugins['ui-ux-pro-max@ui-ux-pro-max-skill'], true);
  assert.ok(!('gsap-skills@gsap-skills' in l.enabledPlugins), 'projenin tanımadığı eklenti eklenmez');
  assert.equal(json(path.join(p, '.claude/settings.json')).enabledPlugins['taste-skill@taste-skill'], false, 'proje ayarı değişmez');
  assert.equal(packageStatus(p).find((d) => d.name === 'tasarim').enabled, true);

  setPackage(p, 'tasarim', false);
  const k = json(path.join(p, '.claude/settings.local.json'));
  assert.ok(!('taste-skill@taste-skill' in k.enabledPlugins), 'kapatınca kişisel istisna silinir, proje varsayılanına döner');
  assert.equal(k.enabledPlugins['foo@bar'], true);
  assert.equal(packageStatus(p).find((d) => d.name === 'tasarim').enabled, false);
  fs.rmSync(p, { recursive: true, force: true });
});

test('paket açma: kişisel ayar dosyası yoksa oluşturur', () => {
  const p = project();
  setPackage(p, 'tasarim', true);
  assert.equal(json(path.join(p, '.claude/settings.local.json')).enabledPlugins['taste-skill@taste-skill'], true);
  fs.rmSync(p, { recursive: true, force: true });
});

test('saldırgan: bilinmeyen paket, yol ve JSON argümanı reddedilir; bozuk kişisel ayar ezilmez', () => {
  const bozuk = '{"enabledPlugins": {';
  const p = project(bozuk);
  for (const name of ['yok', '../x', '{"a":1}', '__proto__', 'constructor']) {
    assert.throws(() => setPackage(p, name, true), /paket/i, name);
    const r = run(p, ['--enable', name]);
    assert.equal(r.status, 1, `${name}: çıkış kodu 1`);
  }
  assert.throws(() => setPackage(p, 'tasarim', true), /settings\.local\.json/);
  assert.equal(fs.readFileSync(path.join(p, '.claude/settings.local.json'), 'utf8'), bozuk, 'bozuk dosya olduğu gibi kalır');
  fs.rmSync(p, { recursive: true, force: true });
});

test('--required: kapalı paket 2 ile çıkar ve açma yolunu söyler, açıkken 0', () => {
  const p = project();
  const off = run(p, ['--required', 'tasarim']);
  assert.equal(off.status, 2);
  assert.match(off.stdout, /kapalı/);
  assert.match(off.stdout, /--enable tasarim/);
  assert.equal(run(p, ['--enable', 'tasarim']).status, 0);
  const enabled = run(p, ['--required', 'tasarim']);
  assert.equal(enabled.status, 0);
  assert.match(enabled.stdout, /açık/);
  assert.equal(run(p, []).status, 0, 'durum tablosu');
  fs.rmSync(p, { recursive: true, force: true });
});

test('--measure: kurulu eklentilerin skill açıklama yükünü ölçer', () => {
  const p = project();
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  const kurulum = path.join(cfg, 'plugins/cache/x/taste-skill');
  fs.mkdirSync(path.join(kurulum, 'skills/a'), { recursive: true });
  fs.writeFileSync(path.join(kurulum, 'skills/a/SKILL.md'), `---\nname: a\ndescription: ${'x'.repeat(400)}\n---\ngövde`);
  fs.writeFileSync(path.join(cfg, 'plugins/installed_plugins.json'), JSON.stringify({ plugins: { 'taste-skill@taste-skill': [{ scope: 'user', installPath: kurulum }] } }));
  const r = run(p, ['--measure'], { CLAUDE_CONFIG_DIR: cfg });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /taste-skill@taste-skill/);
  assert.match(r.stdout, /\b100\b/, '400 karakter ≈ 100 token');
  fs.rmSync(p, { recursive: true, force: true });
  fs.rmSync(cfg, { recursive: true, force: true });
});

test('ayarlar: paket eklentileri varsayılan kapalı, çekirdek açık, pazarlar tanımlı', () => {
  const s = json(path.join(KOK, '.claude/settings.json'));
  const packaged = new Set(Object.values(PACKAGES).flatMap((k) => k.plugins));
  for (const id of packaged) {
    assert.equal(s.enabledPlugins[id], false, `${id} paket eklentisi kapalı gelir`);
    const pazar = id.split('@')[1];
    assert.ok(pazar === 'claude-plugins-official' || s.extraKnownMarketplaces[pazar], `${pazar} pazarı tanımlı`);
  }
  for (const id of ['caveman@caveman', 'ponytail@ponytail', 'mattpocock-skills@mattpocock', 'impeccable@impeccable', 'humanizer@humanizer',
    'security-guidance@claude-plugins-official', 'hookify@claude-plugins-official', 'claude-md-management@claude-plugins-official']) {
    assert.equal(s.enabledPlugins[id], true, `${id} çekirdekte`);
    assert.ok(!packaged.has(id), `${id} pakette değil`);
  }
  assert.ok(s.permissions.allow.includes('Bash(node .claude/hooks/tools.mjs --required:*)'));
  // Paket açmak eklenti hook'larını kullanıcının yetkisiyle çalıştırır: her zaman sorulur
  assert.ok(s.permissions.ask.includes('Bash(node .claude/hooks/tools.mjs --enable:*)'));
  assert.ok(!s.permissions.allow.some((r) => r.startsWith('Bash(node .claude/hooks/tools.mjs') && (r.includes(':*)') && !/--(required|disable):\*\)$/.test(r))), 'geniş izin yok');
  assert.ok(s.permissions.ask.includes('Bash(node .claude/hooks/tools.mjs --ac:*)'), '3.15.0: the old flag is still asked');
});
