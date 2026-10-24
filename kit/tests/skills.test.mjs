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
  assert.ok(s.hooks.Notification && s.hooks.Stop[0].hooks.some((h) => /notify\.mjs" --stop$/.test(h.command)));
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
  for (const e of ['security-guidance', 'hookify', 'claude-md-management']) assert.equal(s.enabledPlugins[`${e}@claude-plugins-official`], true, e);
  for (const e of ['claude-security', 'session-report']) assert.equal(s.enabledPlugins[`${e}@claude-plugins-official`], false, `${e} pakette, varsayılan kapalı`);
  assert.equal(s.env.ENABLE_STOP_REVIEW, '0', 'tur sonu güvenlik incelemesi kotadan yer, kapalı gelir');
  assert.ok(s.hooks.PreToolUse.some((m) => m.matcher === 'Write|Edit|MultiEdit' && m.hooks.some((h) => h.command.includes('freeze-guard.mjs'))));
  // 3.13: test koruması ve düzenleme turu sayacı üç araçta kayıtlı
  const kayitli = (olaylar, olay, betik) => JSON.stringify(olaylar[olay] ?? []).includes(betik);
  assert.ok(kayitli(s.hooks, 'PreToolUse', 'test-guard.mjs') && kayitli(s.hooks, 'PostToolUse', 'edit-rounds.mjs'), 'Claude');
  const cx = JSON.parse(fs.readFileSync(path.join(KOK, 'kit/tools/codex/.codex/hooks.json'), 'utf8')).hooks;
  assert.ok(kayitli(cx, 'PreToolUse', 'test-guard.mjs') && kayitli(cx, 'PostToolUse', 'edit-rounds.mjs'), 'Codex');
  const ag = Object.values(JSON.parse(fs.readFileSync(path.join(KOK, 'kit/tools/antigravity/.agents/hooks.json'), 'utf8')));
  assert.ok(ag.some((h) => kayitli(h, 'PreToolUse', 'test-guard.mjs')) && ag.some((h) => kayitli(h, 'PostToolUse', 'edit-rounds.mjs') && kayitli(h, 'PreInvocation', 'edit-rounds.mjs --inject')), 'Antigravity');
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

test('ayarlar 3.11: tarayıcı MCP\'leri katalogda, ajan Playwright CLI kullanır, sürümler sabit', () => {
  const web = JSON.parse(fs.readFileSync(path.join(KOK, 'kit/templates/web-saas/.mcp.json'), 'utf8')).mcpServers;
  assert.ok(!web.playwright && !web['chrome-devtools'], 'web .mcp.json\'da varsayılan tarayıcı MCP\'si yok');
  const katalog = fs.readFileSync(path.join(KOK, 'docs/workflow/mcp-catalog.md'), 'utf8');
  for (const s of ['@playwright/mcp@0.0.83', 'chrome-devtools-mcp@1.10.1', '--scope local', 'figma-remote-mcp', 'supabase-dev']) assert.ok(katalog.includes(s), `katalog: ${s}`);
  assert.ok(!/@latest\b/.test(katalog), 'katalogda @latest yok');
  const izin = JSON.parse(fs.readFileSync(path.join(KOK, 'kit/templates/web-saas/.claude/settings.merge.json'), 'utf8')).permissions.allow;
  for (const alt of ['open', 'snapshot', 'console', 'requests', 'screenshot']) assert.ok(izin.includes(`Bash(npx -y @playwright/cli@0.1.22 ${alt}:*)`), `Playwright CLI ${alt} izinli`);
  // Sayfada kod çalıştıran alt komutlar (eval, run-code) izinli değil, sorulur
  assert.ok(!izin.some((r) => /@playwright\/cli@[\d.]+(:\*|\s+(eval|run-code))/.test(r)), 'geniş veya kod çalıştıran Playwright CLI izni yok');
  for (const t of ['web-saas', 'mobile']) {
    const stack = fs.readFileSync(path.join(KOK, `kit/templates/${t}/docs/architecture/stack.md`), 'utf8');
    assert.match(stack, /supabase(@[\d.]+)? migration new/, `${t}: şema değişikliği migration ile`);
  }
  assert.match(fs.readFileSync(path.join(KOK, '.claude/commands/release.md'), 'utf8'), /vercel@63\.1\.1 deploy/, '/release önizleme deploy\'u');
});

test('ayarlar 3.12: rea, Understand-Anything, design-md, three.js sabit sürümle ve uyarıyla', () => {
  const oku = (p) => fs.readFileSync(path.join(KOK, p), 'utf8');
  assert.ok(oku('docs/workflow/mcp-catalog.md').includes('rea-agents@6.2.0'), 'katalog: rea sabit sürüm');
  for (const k of ['research', 'adopt']) {
    const md = oku(`.claude/commands/${k}.md`);
    assert.match(md, /\brea\b/, `/${k}: rea`);
    assert.match(md, /yetkili/, `/${k}: yetki uyarısı`);
  }
  for (const k of ['release', 'handoff', 'adopt']) assert.match(oku(`.claude/commands/${k}.md`), /\/understand/, `/${k}: Understand-Anything`);
  const komutlar = fs.readdirSync(path.join(KOK, '.claude/commands')).map((f) => oku(`.claude/commands/${f}`)).join('\n');
  assert.ok(!/\/understand[^\n`]*--auto-update/.test(komutlar), 'UA --auto-update komutlarda kullanılmaz');
  const design = oku('.claude/commands/design.md');
  assert.ok(design.includes('awesome-design-md/3b605329240ce735b510037cca322f1831fdd7f8/'), '/design: design-md sabit commit');
  assert.match(design, /takli[dt]/, '/design: marka taklidi yok');
  const start = oku('.claude/commands/start.md');
  for (const s of ['threejs-fundamentals', 'threejs-performance', 'threejs-react-three-fiber']) assert.ok(start.includes(s), `/start: ${s}`);
  assert.ok(start.includes('threejs-skills/0e181866f095b5f06d005133876e926515390d95/'), '/start: three.js skill\'leri sabit commit');
  const motion = oku('.claude/skills/ui-motion/SKILL.md');
  for (const s of ['React Three Fiber', 'dispose', 'WebGL', 'GSAP']) assert.ok(motion.includes(s), `ui-motion: ${s}`);
  for (const l of ['perf', 'ux']) assert.match(oku(`.claude/findings/lenses/${l}.md`), /WebGL/, `${l} lens: WebGL`);
});

test('eklenti eşitleme: kurulu olmayanı ve kapalıyı bulur, başka projedeki kurulumu saymaz', async () => {
  const { eksikler } = await import('../../.claude/hooks/plugins-sync.mjs');
  const kok = path.resolve(os.tmpdir(), 'proje-a');
  const kurulu = [
    { id: 'caveman@caveman', scope: 'user' },
    { id: 'hookify@claude-plugins-official', scope: 'project', projectPath: kok.toUpperCase() },
    { id: 'fp-check@trailofbits', scope: 'project', projectPath: path.resolve(os.tmpdir(), 'proje-b') },
  ];
  const acik = { 'caveman@caveman': true, 'hookify@claude-plugins-official': true, 'fp-check@trailofbits': true, 'remotion@remotion': false };
  assert.deepEqual(eksikler(acik, kurulu, kok), [{ id: 'fp-check@trailofbits', etkin: true }, { id: 'remotion@remotion', etkin: false }]);
});

test('eklenti eşitleme: yerelde kapatılan eklenti eksik sayılmaz, bilgi olarak bildirilir', async () => {
  const { eksikler, kapalilar } = await import('../../.claude/hooks/plugins-sync.mjs');
  const kok = path.resolve(os.tmpdir(), 'proje-a');
  const kurulu = [{ id: 'fp-check@trailofbits', scope: 'project', projectPath: kok, enabled: false }];
  const acik = { 'fp-check@trailofbits': true, 'remotion@remotion': false };
  assert.deepEqual(eksikler({ 'fp-check@trailofbits': true }, kurulu, kok), [], 'kurulu: yeniden kurulmaz, tercih ezilmez');
  assert.deepEqual(kapalilar(acik, kurulu, kok), ['fp-check@trailofbits']);
  assert.deepEqual(kapalilar({ 'fp-check@trailofbits': false }, kurulu, kok), [], 'ayarda zaten kapalıysa bilgi yok');
  const baskaProje = [{ id: 'fp-check@trailofbits', scope: 'project', projectPath: path.resolve(os.tmpdir(), 'proje-b'), enabled: false }];
  assert.deepEqual(kapalilar(acik, baskaProje, kok), [], 'başka projedeki kapalı kayıt bu projeyi ilgilendirmez');
  assert.deepEqual(eksikler({ 'fp-check@trailofbits': true }, baskaProje, kok), [{ id: 'fp-check@trailofbits', etkin: true }], 'burada kurulu değil: kurulacaklar listesinde');
});

test('ayarlar: her hook ve durum çubuğu komutu gerçekten çalışır (tırnak, yol, modül hatası yok)', () => {
  const s = JSON.parse(fs.readFileSync(path.join(KOK, '.claude/settings.json'), 'utf8'));
  const komutlar = Object.values(s.hooks).flat().flatMap((m) => m.hooks.map((h) => h.command)).concat(s.statusLine.command);
  const env = { ...process.env, CLAUDE_PROJECT_DIR: KOK, KIT_NOTIFY: 'off' };
  for (const k of komutlar) {
    // Claude Code hook'ları bash ile çalıştırır (Windows'ta Git Bash); "$CLAUDE_PROJECT_DIR" açılımı ve tırnaklar dahil
    const r = spawnSync('bash', ['-c', k], { cwd: KOK, input: '{}', env, encoding: 'utf8', timeout: 60000 });
    assert.doesNotMatch(r.stderr ?? '', /Cannot find module|MODULE_NOT_FOUND|No such file/, k);
    assert.equal(r.status, 0, `${k}\n${r.stderr}`);
  }
});
