// Çalıştır: node --test "kit/tests/*.test.mjs"
// Kitin kendi skill'leri: motion-video yay formülü (skill dosyasından okunur), bildirim hook'u, ayarlar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('motion-video: SKILL.md içindeki kapalı formlu yay, diferansiyel denklemi sağlar', () => {
  const md = fs.readFileSync(path.join(KOK, '.claude/skills/motion-video/SKILL.md'), 'utf8');
  const kod = md.match(/```js\n([\s\S]*?function yay[\s\S]*?)```/)[1];
  const yay = new Function(`${kod}; return yay;`)();
  for (const [zeta, omega, y0, v0] of [[0.75, 12, 1, 0], [0.7, 20, -2, 5], [1, 10, 1, -3]]) {
    const h = 1e-4;
    for (const t of [0, 0.05, 0.13, 0.3, 0.6]) {
      const a = yay(y0, v0, omega, zeta, t);
      const ileri = yay(y0, v0, omega, zeta, t + h), geri = yay(y0, v0, omega, zeta, Math.max(0, t - h));
      const dt = t === 0 ? h : 2 * h;
      // hız, konumun türevi olmalı
      assert.ok(Math.abs((ileri.y - geri.y) / dt - a.v) < 1e-2 * Math.max(1, Math.abs(a.v)), `v=y' (ζ=${zeta}, t=${t})`);
      // y'' + 2ζω y' + ω² y = 0
      const ivme = (ileri.v - geri.v) / dt;
      assert.ok(Math.abs(ivme + 2 * zeta * omega * a.v + omega * omega * a.y) < 0.05 * omega * omega, `ODE (ζ=${zeta}, t=${t})`);
    }
    const bas = yay(y0, v0, omega, zeta, 0);
    assert.ok(Math.abs(bas.y - y0) < 1e-12 && Math.abs(bas.v - v0) < 1e-9, 'başlangıç koşulları');
    const Ts = 4 / (zeta * omega);
    assert.ok(Math.abs(yay(y0, v0, omega, zeta, Ts * 1.5).y) < 0.03 * Math.max(Math.abs(y0), 1), 'oturma süresinde hedefe yakın');
  }
});

test('bildirim: kısa işte ve KIT_NOTIFY=off iken bildirim yok, hata yok', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'bildirim-'));
  fs.mkdirSync(path.join(p, '.claude', 'state'), { recursive: true });
  fs.writeFileSync(path.join(p, '.claude/state/reminder.json'), JSON.stringify({ tur: Date.now() }));
  const calistir = (arg, env = {}) => spawnSync(process.execPath, [path.join(KOK, '.claude/hooks/notify.mjs'), ...arg], {
    input: '{}', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, ...env }, timeout: 10000,
  });
  assert.equal(calistir(['--stop']).status, 0, 'eşik altı sessiz çıkar');
  assert.equal(calistir([], { KIT_NOTIFY: 'off' }).status, 0);
  fs.rmSync(p, { recursive: true, force: true });
});

test('ayarlar: bildirim hook\'ları, skill bütçesi, MCP sürümleri sabit', () => {
  const s = JSON.parse(fs.readFileSync(path.join(KOK, '.claude/settings.json'), 'utf8'));
  assert.ok(s.hooks.Notification && s.hooks.Stop[0].hooks.some((h) => h.command.includes('notify.mjs --stop')));
  assert.equal(s.enabledPlugins['remotion@remotion'], false, 'Remotion varsayılan kapalı');
  const backend = JSON.parse(fs.readFileSync(path.join(KOK, 'kit/templates/backend/.claude/settings.merge.json'), 'utf8'));
  assert.equal(backend.enabledPlugins['impeccable@impeccable'], false, 'backend tasarım skill bütçesi');
  for (const t of ['web-saas', 'mobile', 'backend']) {
    const m = JSON.stringify(JSON.parse(fs.readFileSync(path.join(KOK, `kit/templates/${t}/.mcp.json`), 'utf8')));
    assert.ok(m.includes('mcp.context7.com'), `${t}: Context7`);
    assert.ok(!m.includes('@latest'), `${t}: @latest yok`);
  }
});

test('ayarlar 3.2: resmi eklentiler, kota ayarı, kilit hook\'u, tipe özel eklentiler', () => {
  const s = JSON.parse(fs.readFileSync(path.join(KOK, '.claude/settings.json'), 'utf8'));
  for (const e of ['security-guidance', 'claude-security', 'hookify', 'claude-md-management', 'session-report']) assert.equal(s.enabledPlugins[`${e}@claude-plugins-official`], true, e);
  assert.equal(s.env.ENABLE_STOP_REVIEW, '0', 'tur sonu güvenlik incelemesi kotadan yer, kapalı gelir');
  assert.ok(s.hooks.PreToolUse.some((m) => m.matcher === 'Write|Edit|MultiEdit' && m.hooks.some((h) => h.command.includes('freeze-guard.mjs'))));
  JSON.parse(fs.readFileSync(path.join(KOK, '.claude/security-patterns.json'), 'utf8')).patterns.forEach((p) => new RegExp(p.regex));
  const beklenen = { 'web-saas': 'typescript-lsp', mobile: 'typescript-lsp', backend: 'pyright-lsp' };
  for (const [t, lsp] of Object.entries(beklenen)) {
    const m = JSON.parse(fs.readFileSync(path.join(KOK, `kit/templates/${t}/.claude/settings.merge.json`), 'utf8'));
    assert.equal(m.enabledPlugins[`${lsp}@claude-plugins-official`], true, `${t}: ${lsp}`);
    for (const e of Object.keys(m.enabledPlugins)) {
      const pazar = e.split('@')[1];
      assert.ok(pazar === 'claude-plugins-official' || s.extraKnownMarketplaces[pazar] || m.extraKnownMarketplaces?.[pazar], `${t}: ${pazar} pazarı tanımlı`);
    }
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(KOK, 'kit/templates/mobile/.mcp.json'), 'utf8')).mcpServers.maestro, { command: 'maestro', args: ['mcp'] });
});
