// Run: node --test "kit/tests/*.test.mjs"
// The dashboard's data sources: acceptance tests, accounts, flags, unit economics, feedback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prdCriteria, junitResults, acceptanceStatus, accounts, flags, unitEconomics, feedback, learning, daysLeft, envWarnings } from '../../.claude/hooks/dashboard-data.mjs';

test('environment (3.13): prod ref in .mcp.json is critical, Supabase without an RLS test is a warning', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'ortam-'));
  const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
  assert.deepEqual(envWarnings(p), [], 'no Supabase and no record');
  write('docs/operations/accounts.md', '## Ortamlar (dev / prod)\n\n| Ortam | Servis | Proje ref / URL | Kim bağlanır |\n|---|---|---|---|\n| dev | Supabase | devref111 | yerel |\n| prod | Supabase | prodref999 | barındırma |\n');
  write('.mcp.json', '{"url":"https://mcp.supabase.com/mcp?project_ref=devref111&read_only=true"}');
  write('supabase/config.toml', 'project_id = "x"');
  assert.deepEqual(envWarnings(p).map((u) => u.sev), ['warn'], 'no RLS test');
  write('tests/security/rls.mjs', '//');
  assert.deepEqual(envWarnings(p), []);
  write('.mcp.json', '{"url":"https://mcp.supabase.com/mcp?project_ref=prodref999&read_only=true"}');
  assert.equal(envWarnings(p)[0].sev, 'critical');
  write('docs/operations/accounts.md', '## Ortamlar (dev / prod)\n\n| Ortam | Servis | Proje ref / URL | Kim bağlanır |\n|---|---|---|---|\n| prod | [Supabase] | [prod ref] | x |\n');
  assert.deepEqual(envWarnings(p), [], 'a template row is ignored');
  fs.rmSync(p, { recursive: true, force: true });
});

test('acceptance: PRD criteria are read with ids, template rows are skipped', () => {
  const prd = '- [x] Ö-01.1: Zorunlu alan boşsa kaydedilmez\n- [ ] Ö-01.2: PDF indirilir\n- [ ] Ö-02.1: [Gözlemlenebilir davranış]\n- [ ] kimliksiz madde';
  assert.deepEqual(prdCriteria(prd).map((k) => [k.id, k.key, k.checked]), [['Ö-01.1', 'O_01_1', true], ['Ö-01.2', 'O_01_2', false]]);
});

test('acceptance: JUnit results match the Ö and O_ forms, a failure wins', () => {
  const xml = `<testsuite>
    <testcase name="Ö-01.1 zorunlu alan" classname="form"/>
    <testcase name="test_O_01_2_pdf" classname="tests.test_fatura"><failure message="x"/></testcase>
    <testcase name="Ö-01.2 pdf ikinci" classname="e2e"></testcase>
    <testcase name="Ö-03.1 atlandı"><skipped/></testcase>
  </testsuite>`;
  const s = junitResults([xml]);
  assert.equal(s.get('O_01_1'), 'passed');
  assert.equal(s.get('O_01_2'), 'failed');
  assert.equal(s.has('O_03_1'), false);
});

test('acceptance: project scan for test files, reports and mismatches', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'kabul-'));
  fs.mkdirSync(path.join(p, 'docs/product'), { recursive: true }); fs.mkdirSync(path.join(p, 'tests')); fs.mkdirSync(path.join(p, 'test-results'));
  fs.writeFileSync(path.join(p, 'docs/product/prd.md'), '- [x] Ö-01.1: a\n- [x] Ö-01.2: b\n- [ ] Ö-02.1: c\n');
  fs.writeFileSync(path.join(p, 'tests/fatura.spec.ts'), "test('Ö-01.1 a', () => {}); test('Ö-02.1 c', () => {});");
  fs.writeFileSync(path.join(p, 'test-results/junit.xml'), '<testcase name="Ö-01.1 a"/>');
  const k = acceptanceStatus(p);
  assert.equal(k.total, 3);
  assert.equal(k.tested, 2);
  assert.equal(k.passing, 1);
  assert.deepEqual(k.mismatched.map((x) => x.id), ['Ö-01.2'], 'checked but has no test');
  fs.rmSync(p, { recursive: true, force: true });
});

test('accounts and flags: date math, 2FA, overdue', () => {
  const now = Date.parse('2026-10-11T12:00:00');
  assert.equal(daysLeft('2026-10-21', now), 10);
  const h = accounts(`## Hesaplar\n\n| Servis | Amaç | Sahip | 2FA | Plan | Bitiş | Anahtar | Not |\n|---|---|---|---|---|---|---|---|\n| [GitHub] | Kod | | | | - | - | |\n| Alan adı | site | ben | hayır | 300 TL/yıl | 2026-10-21 | - | |\n`, now);
  assert.equal(h.length, 1, 'a template row is skipped');
  assert.equal(h[0].noTwoFactor, true);
  assert.equal(h[0].dates[0].left, 10);
  const b = flags(`## Bayraklar\n\n| Bayrak | Amaç | Durum | Sahibi | Eklendi | Kaldırma | Test |\n|---|---|---|---|---|---|---|\n| yeni_odeme | ödeme | açık | ben | 2026-09-01 | 2026-10-01 | evet |\n`, now);
  assert.equal(b[0].isOverdue, true);
  assert.equal(b[0].untested, false);
});

test('unit economics: margin, break-even, free user share', () => {
  const text = '**Para birimi:** TL\n**Fiyat (kullanıcı başı aylık):** 200\n**Ödeme komisyonu (%):** 5\n**Sabit aylık maliyet:** 1500\n**Kullanıcı başı değişken maliyet (aylık):** 20\n**Hedef aktif kullanıcı:** 100\n**Ücretsiz kullanıcı oranı (%):** 50';
  const e = unitEconomics(text);
  assert.equal(e.margin, 200 * 0.95 - 20); // 170
  assert.equal(e.effectiveMargin, 170 - 20); // her ödeyen bir ücretsiz kullanıcıyı taşır
  assert.equal(e.breakEven, Math.ceil(1500 / 150));
  assert.equal(Math.round(e.profit), Math.round(50 * 190 - (1500 + 100 * 20)));
  assert.equal(unitEconomics('**Fiyat (kullanıcı başı aylık):** 0'), null, 'empty input');
});

test('Ö-22.3 learning: right/wrong counts and the most missed concepts; an empty log gives no card', () => {
  const table = '| Tarih | Görev | Kavram | Sonuç |\n|---|---|---|---|\n';
  const l = learning(`## Kayıtlar\n\n${table}| 2026-10-25 | G-01 | doğrulama | doğru |\n| 2026-10-25 | G-01 | API | yanlış |\n| 2026-10-26 | G-02 | API | Yanlış |\n| 2026-10-26 | G-02 | migration | yanlış |\n| 2026-10-26 | G-02 | RLS | Şimdi değil |\n`);
  assert.deepEqual([l.right, l.wrong], [1, 3]);
  assert.deepEqual(l.missed.map((m) => [m.concept, m.count]), [['API', 2], ['migration', 1]]);
  assert.equal(learning(`## Kayıtlar\n\n${table}`), null);
  assert.equal(learning(''), null, 'no file: no card');
});

test('feedback: new count and theme order', () => {
  const g = feedback(`## Gelen kutusu\n\n| # | Tarih | Kaynak | Kullanıcı | Özet | Tür | Tema | Öncelik | Durum | Görev |\n|---|---|---|---|---|---|---|---|---|---|\n| 1 | 2026-10-01 | e-posta | K-001 | PDF yok | istek | PDF | yüksek | yeni | |\n| 2 | 2026-10-02 | form | K-002 | yavaş | şikayet | hız | orta | planlandı | G-030 |\n\n## Temalar\n\n| Tema | Sayı | Özellik | Karar |\n|---|---|---|---|\n| hız | 2 | liste | |\n| PDF | 5 | fatura | |\n`);
  assert.equal(g.newCount, 1);
  assert.deepEqual(g.themes.map((t) => t.theme), ['PDF', 'hız']);
});

test('finding reports: latest report per kind, numbers are parsed', async () => {
  const { findingReports } = await import('../../.claude/hooks/dashboard-data.mjs');
  const r = findingReports(`## Raporlar\n\n| Tarih | Tür | Sağlık | Önceki | Bulgu | Kritik | Rapor |\n|---|---|---|---|---|---|---|\n| 2026-10-01 | tech | 61 | - | 14 | 2 | [rapor](tech/2026-10-01.md) |\n| 2026-10-11 | tech | 74 | 61 | 9 | 0 | [rapor](tech/2026-10-11.md) |\n| 2026-10-11 | business | 58/100 | - | 12 | 1 | x |\n`);
  assert.equal(r.rows.length, 3);
  assert.equal(r.latest.tech.health, 74);
  assert.equal(r.latest.tech.previous, 61);
  assert.equal(r.latest.business.health, 58);
  assert.equal(r.latest.business.critical, 1);
});

test('produced assets: brand kit, video output, research title', async () => {
  const { producedAssets } = await import('../../.claude/hooks/dashboard-data.mjs');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'varlik-'));
  assert.deepEqual(producedAssets(p), { brandDir: null, brand: [], brandGuide: false, videos: [], research: [], codeMapDays: null });
  for (const k of ['assets/brand', 'marketing/motion/demo/out', 'marketing/motion/taslak', 'docs/research', 'docs/design']) fs.mkdirSync(path.join(p, k), { recursive: true });
  fs.writeFileSync(path.join(p, 'assets/brand/logo.svg'), '<svg/>');
  fs.writeFileSync(path.join(p, 'docs/design/brand.md'), '# Marka');
  fs.writeFileSync(path.join(p, 'marketing/motion/demo/out/demo.mp4'), '');
  fs.writeFileSync(path.join(p, 'docs/research/2026-10-01-odeme.md'), '# Ödeme sağlayıcıları\n');
  fs.writeFileSync(path.join(p, 'docs/research/2026-10-05-kvkk.md'), 'başlıksız');
  const v = producedAssets(p);
  assert.equal(v.brandDir, 'assets/brand');
  assert.deepEqual(v.brand, ['logo.svg']);
  assert.equal(v.brandGuide, true);
  assert.deepEqual(v.videos, [{ name: 'demo', mp4: 'marketing/motion/demo/out/demo.mp4' }, { name: 'taslak', mp4: null }]);
  assert.deepEqual(v.research.map((r) => r.title), ['2026-10-05-kvkk', 'Ödeme sağlayıcıları']);
  // Understand-Anything graph: its age in days (auto-update is off, the dashboard hints when it gets old)
  fs.mkdirSync(path.join(p, '.ua'));
  const graph = path.join(p, '.ua/knowledge-graph.json');
  fs.writeFileSync(graph, '{}');
  const fortyDaysAgo = new Date(Date.now() - 40 * 864e5);
  fs.utimesSync(graph, fortyDaysAgo, fortyDaysAgo);
  assert.equal(producedAssets(p).codeMapDays, 40);
});

test('cost: ccusage project name and daily summary (date/period fields)', async () => {
  const { ccusageProjectName, costSummary } = await import('../../.claude/hooks/dashboard-data.mjs');
  if (process.platform === 'win32') assert.equal(ccusageProjectName(String.raw`D:\Claude Projeler\Vibe_Kit`), 'D--Claude-Projeler-Vibe-Kit');
  else assert.equal(ccusageProjectName('/home/a/my.app'), '-home-a-my-app'); // kit:yol-izinli
  const o = costSummary({ projects: { x: [{ date: '2026-10-11', totalTokens: 2e6, totalCost: 3 }, { date: '2026-10-09', totalTokens: 1e6, totalCost: 1.5 }] }, totals: {} });
  assert.deepEqual(o.days.map((g) => g.date), ['2026-10-09', '2026-10-11']);
  assert.deepEqual(o.total, { token: 3e6, cost: 4.5 });
  assert.equal(costSummary({ daily: [{ period: '2026-10-01', totalTokens: 5, totalCost: 0 }] }).days[0].date, '2026-10-01');
  assert.deepEqual(costSummary(null), { days: [], total: { token: 0, cost: 0 } });
});

test('spend alarms: a row without an amount is unset, an old check is flagged', async () => {
  const { spendAlarms } = await import('../../.claude/hooks/dashboard-data.mjs');
  const now = Date.parse('2026-10-12T12:00:00');
  const a = spendAlarms(`## Alarmlar\n\n| Servis | Tür | Tutar | Uyarı eşikleri | Nereden ayarlandı | Son kontrol |\n|---|---|---|---|---|---|\n| Anthropic | tavan | 50 USD | %50, %80 | Console | 2026-10-10 |\n| Vercel | uyarı | - | | | 2026-08-01 |\n`, now);
  assert.equal(a.length, 2);
  assert.equal(a[0].unset, false);
  assert.equal(a[0].stale, false);
  assert.equal(a[1].unset, true);
  assert.equal(a[1].stale, true);
});

test('status labels: control characters from the repo never reach the terminal status line', async () => {
  const { labels } = await import('../../.claude/hooks/status-read.mjs');
  const a = labels('**Aktif faz:** Faz\u001b]52;c;ZXZpbA==\u0007 1\n**Aktif görev:** \u001b[2K\u001b[1GG-01\n');
  assert.equal(a['Aktif faz'], 'Faz]52;c;ZXZpbA== 1');
  assert.equal(a['Aktif görev'], '[2K[1GG-01');
  assert.ok(!/[\u0000-\u001f\u007f-\u009f]/.test(Object.values(a).join('')));
});

test('3.28.6 audit: JUnit output that mentions <skipped does not skip a failing case; a placeholder prod ref is not critical', async () => {
  const { junitCases } = await import('../../.claude/hooks/dashboard-data.mjs');
  const xml = '<testcase name="Ö-01.1 kayıt"><failure message="x"/><system-out><![CDATA[log: <skipped/> yazıldı]]></system-out></testcase>';
  assert.equal([...junitCases(xml)].length, 1, 'the failing case is still counted');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'ortam2-'));
  fs.mkdirSync(path.join(p, 'docs/operations'), { recursive: true });
  fs.writeFileSync(path.join(p, 'docs/operations/accounts.md'), '## Ortamlar (dev / prod)\n\n| Ortam | Servis | Proje ref / URL | Kim bağlanır |\n|---|---|---|---|\n| prod | Supabase | - | x |\n');
  fs.writeFileSync(path.join(p, '.mcp.json'), '{"args":["-y","x"]}');
  assert.deepEqual(envWarnings(p), [], '"-" is not a ref');
  fs.rmSync(p, { recursive: true, force: true });
});

test('3.28.6 audit: the dashboard escapes repo text (commit messages, progress, roadmap) and drops non-https cache links', async () => {
  const { spawnSync, execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { githubStatus } = await import('../../.claude/hooks/dashboard-data.mjs');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-xss-'));
  const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
  const XSS = '<img src=x onerror=alert(1)>';
  write('docs/workflow/progress.md', `**Aktif faz:** ${XSS}\n**Aktif görev:** <script>alert(2)</script>\n\n## Sıradaki adım\n\n1. ${XSS}\n`);
  write('docs/product/roadmap.md', `## Faz 1\n\n- [ ] G-001 ${XSS}\n`);
  const git = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: p, stdio: 'ignore' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', `feat: ${XSS}`);
  const now = Date.now();
  write('.claude/state/github-cache.json', JSON.stringify({ time: now, data: { runs: [{ workflowName: 'CI', url: 'javascript:alert(3)', conclusion: 'success' }], prs: [], liveMonitoring: [] } }));
  assert.equal(githubStatus(p, now).runs[0].url, '', 'javascript: link dropped');
  const r = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks', 'dashboard.mjs'), p, '--quiet'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const html = fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8');
  assert.ok(!html.includes(XSS) && !html.includes('<script>alert(2)') && !html.includes('javascript:alert'), 'no raw repo HTML or script link');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'the text is shown escaped');
  fs.rmSync(p, { recursive: true, force: true });
});

test('a date-only entry (decision log) shows the same day in every time zone', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-tarih-'));
  const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
  write('docs/decisions/log.md', '## Karar günlüğü\n\n| # | Tarih | Aşama | Konu | Soru | Seçilen | Kapı | Karar veren |\n|---|---|---|---|---|---|---|---|\n| 1 | 2026-10-26 | Başlangıç | teknik | Veritabanı? | Postgres | tek | kullanıcı |\n');
  const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks', 'dashboard.mjs');
  for (const TZ of ['America/New_York', 'Pacific/Kiritimati']) {
    const r = spawnSync(process.execPath, [hook, p, '--quiet'], { encoding: 'utf8', env: { ...process.env, TZ } });
    assert.equal(r.status, 0, r.stderr);
    const html = fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8');
    assert.match(html, /26 Eki · teknik · kullanıcı/, `${TZ}: no day shift in the feed`);
    const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short', timeZone: TZ });
    assert.equal([...html.matchAll(/data-tip="([^"]+): \d+ commit"/g)].at(-1)?.[1], today, `${TZ}: the last commit bar is today`);
  }
  fs.rmSync(p, { recursive: true, force: true });
});

test('3.41.0 copy buttons: the next step and slash-command actions get the bare command, escaped', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-kopya-'));
  const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
  write('docs/workflow/progress.md', '**Aktif faz:** Faz 1\n\n## Sıradaki adım\n\n1. `/build G-013` şifre sıfırlama\n\n## Kaldığı yer\n\n- yarım iş\n\n## Açık sorunlar / bloklayıcılar\n\n- `/fix "x` sorunu\n');
  const run = () => {
    const r = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks', 'dashboard.mjs'), p, '--quiet'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8');
  };
  const html = run();
  assert.ok(html.includes('data-cmd="/build G-013"'), 'next step command');
  assert.ok(html.includes('data-cmd="/build"'), '"/build ile devam" gives /build');
  write('docs/workflow/progress.md', '**Aktif faz:** Faz 1\n\n## Sıradaki adım\n\n1. `/build " onclick="alert(1)` x\n');
  const bad = run();
  assert.ok(!bad.includes('onclick="alert(1)'), 'a quote in the command is escaped');
  assert.ok(bad.includes('data-cmd="/build &quot; onclick=&quot;alert"'), 'escaped, cut at the "(" note');
  fs.rmSync(p, { recursive: true, force: true });
});

// 3.44.0 language selection: the dashboard waits for a language and takes <html lang> from it
const langDashboard = async (files) => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-dil-'));
  for (const [f, s] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    fs.writeFileSync(path.join(p, f), typeof s === 'string' ? s : JSON.stringify(s));
  }
  // A fresh GitHub cache: an installed project would otherwise call gh
  fs.mkdirSync(path.join(p, '.claude/state'), { recursive: true });
  fs.writeFileSync(path.join(p, '.claude/state/github-cache.json'), JSON.stringify({ time: Date.now(), data: { runs: [], prs: [], liveMonitoring: [] } }));
  const r = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks', 'dashboard.mjs'), p, '--quiet'], { encoding: 'utf8' });
  const out = fs.existsSync(path.join(p, 'dashboard.html')) ? fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8') : null;
  fs.rmSync(p, { recursive: true, force: true });
  return { status: r.status, stderr: r.stderr, html: out };
};
const kitRecord = (extra) => ({ version: '3.43.0', type: 'web-saas', addons: [], tool: null, created: '2026-10-01', updated: '2026-10-01', files: {}, ...extra });

test('lang dashboard: not set up and no language chosen: no dashboard is written', async () => {
  for (const files of [{ 'kit/kit.mjs': '// kit\n' }, { '.kit.json': kitRecord({ type: null }) }]) {
    const r = await langDashboard(files);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.html, null, `no dashboard.html: ${Object.keys(files).join(', ')}`);
  }
});

test('lang dashboard: <html lang> follows the language (.kit.json, state file, tr in old projects)', async () => {
  const en = await langDashboard({ '.kit.json': kitRecord({ lang: 'en' }) });
  assert.equal(en.status, 0, en.stderr);
  assert.ok(en.html?.includes('<html lang="en">'), '.kit.json lang en');
  const state = await langDashboard({ 'kit/kit.mjs': '// kit\n', '.claude/state/lang.json': { lang: 'pt-BR' } });
  assert.equal(state.status, 0, state.stderr);
  assert.ok(state.html?.includes('<html lang="pt-BR">'), 'not set up but a language is chosen: the dashboard is written');
  const old = await langDashboard({ '.kit.json': kitRecord() });
  assert.ok(old.html?.includes('<html lang="tr">'), 'installed before 3.44.0: tr');
  const plain = await langDashboard({});
  assert.ok(plain.html?.includes('<html lang="tr">'), 'plain folder: tr');
});
