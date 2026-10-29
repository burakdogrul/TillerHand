// Run: node --test "kit/tests/*.test.mjs"
// The dashboard's data sources: acceptance tests, accounts, flags, unit economics, feedback.
// 3.49.0: English labels and values only (Turkish files are covered as "not understood" in labels-*.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prdCriteria, junitResults, acceptanceStatus, accounts, flags, unitEconomics, feedback, learning, daysLeft, envWarnings } from '../../.claude/hooks/dashboard-data.mjs';

const ENV_TABLE = (rows) => `## Environments (dev / prod)\n\n| Environment | Service | Project ref / URL | Who connects |\n|---|---|---|---|\n${rows}`;

test('environment (3.13): prod ref in .mcp.json is critical, Supabase without an RLS test is a warning', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'env-'));
  const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
  assert.deepEqual(envWarnings(p), [], 'no Supabase and no record');
  write('docs/operations/accounts.md', ENV_TABLE('| dev | Supabase | devref111 | local |\n| prod | Supabase | prodref999 | hosting |\n'));
  write('.mcp.json', '{"url":"https://mcp.supabase.com/mcp?project_ref=devref111&read_only=true"}');
  write('supabase/config.toml', 'project_id = "x"');
  assert.deepEqual(envWarnings(p).map((u) => u.sev), ['warn'], 'no RLS test');
  write('tests/security/rls.mjs', '//');
  assert.deepEqual(envWarnings(p), []);
  write('.mcp.json', '{"url":"https://mcp.supabase.com/mcp?project_ref=prodref999&read_only=true"}');
  assert.equal(envWarnings(p)[0].sev, 'critical');
  write('docs/operations/accounts.md', ENV_TABLE('| prod | [Supabase] | [prod ref] | x |\n'));
  assert.deepEqual(envWarnings(p), [], 'a template row is ignored');
  fs.rmSync(p, { recursive: true, force: true });
});

const keyOf = (id) => prdCriteria(`- [ ] ${id}: x`)[0]?.key;

test('acceptance: PRD criteria are read with ids, template rows are skipped', () => {
  const prd = '- [x] AC-01.1: Required field is not saved empty\n- [ ] AC-01.2: PDF downloads\n- [ ] AC-02.1: [Observable behavior]\n- [ ] item without an id';
  assert.deepEqual(prdCriteria(prd).map((k) => [k.id, k.checked]), [['AC-01.1', true], ['AC-01.2', false]]);
  assert.notEqual(keyOf('AC-01.1'), keyOf('AC-01.2'));
});

test('acceptance: JUnit results match the AC- and AC_ forms, a failure wins', () => {
  const xml = `<testsuite>
    <testcase name="AC-01.1 required field" classname="form"/>
    <testcase name="test_AC_01_2_pdf" classname="tests.test_invoice"><failure message="x"/></testcase>
    <testcase name="AC-01.2 pdf second" classname="e2e"></testcase>
    <testcase name="AC-03.1 skipped"><skipped/></testcase>
  </testsuite>`;
  const s = junitResults([xml]);
  assert.equal(s.get(keyOf('AC-01.1')), 'passed');
  assert.equal(s.get(keyOf('AC-01.2')), 'failed');
  assert.equal(s.has(keyOf('AC-03.1')), false);
});

test('acceptance: project scan for test files, reports and mismatches', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-'));
  fs.mkdirSync(path.join(p, 'docs/product'), { recursive: true }); fs.mkdirSync(path.join(p, 'tests')); fs.mkdirSync(path.join(p, 'test-results'));
  fs.writeFileSync(path.join(p, 'docs/product/prd.md'), '- [x] AC-01.1: a\n- [x] AC-01.2: b\n- [ ] AC-02.1: c\n');
  fs.writeFileSync(path.join(p, 'tests/invoice.spec.ts'), "test('AC-01.1 a', () => {}); test('AC-02.1 c', () => {});");
  fs.writeFileSync(path.join(p, 'test-results/junit.xml'), '<testcase name="AC-01.1 a"/>');
  const k = acceptanceStatus(p);
  assert.equal(k.total, 3);
  assert.equal(k.tested, 2);
  assert.equal(k.passing, 1);
  assert.deepEqual(k.mismatched.map((x) => x.id), ['AC-01.2'], 'checked but has no test');
  fs.rmSync(p, { recursive: true, force: true });
});

test('accounts and flags: date math, 2FA, overdue', () => {
  const now = Date.parse('2026-10-11T12:00:00');
  assert.equal(daysLeft('2026-10-21', now), 10);
  const h = accounts('## Accounts\n\n| Service | Purpose | Owner | 2FA | Plan | Expiry | Key | Note |\n|---|---|---|---|---|---|---|---|\n| [GitHub] | Code | | | | - | - | |\n| Domain | site | me | no | 300 TL/yr | 2026-10-21 | - | |\n', now);
  assert.equal(h.length, 1, 'a template row is skipped');
  assert.equal(h[0].noTwoFactor, true);
  assert.equal(h[0].dates[0].left, 10);
  const b = flags('## Flags\n\n| Flag | Purpose | Status | Owner | Added | Removal | Test |\n|---|---|---|---|---|---|---|\n| new_payment | payment | on | me | 2026-09-01 | 2026-10-01 | yes |\n', now);
  assert.equal(b[0].isOverdue, true);
  assert.equal(b[0].untested, false);
});

const flagTable = (header, answer) => `## Flags\n\n| Flag | Purpose | Status | Owner | Added | Removal | ${header} |\n|---|---|---|---|---|---|---|\n| new_payment | payment | on | me | 2026-09-01 | 2026-12-01 | ${answer} |\n`;
const untestedOf = (answer, header = 'Kill switch tested') => flags(flagTable(header, answer), Date.parse('2026-10-11T12:00:00'))[0].untested;

test('Ö-yes.1 flags: English "yes" in the kill switch column counts as tested', () => {
  for (const answer of ['yes', 'Yes', 'YES', 'yes (2026-10-01)']) {
    assert.equal(untestedOf(answer), false, `"${answer}" must be tested`);
  }
  assert.equal(untestedOf('yes', 'Test'), false, 'older "Test" header too');
});

test('Ö-yes.2 flags: ✅ counts as tested', () => {
  assert.equal(untestedOf('✅'), false);
});

test('Ö-yes.3 flags: no / - / empty / "not yet" / words merely starting with "yes" / the old Turkish evet, var, hayır stay untested', () => {
  for (const answer of ['no', '-', '', 'not yet', 'yesterday', 'yesterday (2026-10-01)', 'yeses', 'evet', 'var', 'hayır']) {
    assert.equal(untestedOf(answer), true, `"${answer}" must be untested`);
  }
});

test('Ö-yes.4 accounts: 2FA column yes -> noTwoFactor false, no -> true (regression guard)', () => {
  const now = Date.parse('2026-10-11T12:00:00');
  const row = (answer) => accounts(`## Accounts\n\n| Service | Purpose | Owner | 2FA | Plan | Expiry | Key | Note |\n|---|---|---|---|---|---|---|---|\n| Domain | site | me | ${answer} | 300 TL/yr | 2026-10-21 | - | |\n`, now)[0].noTwoFactor;
  assert.equal(row('yes'), false);
  assert.equal(row('Yes'), false);
  assert.equal(row('no'), true);
  assert.equal(row('No'), true);
});

test('unit economics: margin, break-even, free user share', () => {
  const text = '**Currency:** TL\n**Price (per user, monthly):** 200\n**Payment fee (%):** 5\n**Fixed monthly cost:** 1500\n**Variable cost per user (monthly):** 20\n**Target active users:** 100\n**Free user share (%):** 50';
  const e = unitEconomics(text);
  assert.equal(e.margin, 200 * 0.95 - 20); // 170
  assert.equal(e.effectiveMargin, 170 - 20); // every payer carries one free user
  assert.equal(e.breakEven, Math.ceil(1500 / 150));
  assert.equal(Math.round(e.profit), Math.round(50 * 190 - (1500 + 100 * 20)));
  assert.equal(unitEconomics('**Price (per user, monthly):** 0'), null, 'empty input');
});

test('Ö-22.3 learning: right/wrong counts and the most missed concepts; an empty log gives no card', () => {
  const table = '| Date | Task | Concept | Result |\n|---|---|---|---|\n';
  const l = learning(`## Records\n\n${table}| 2026-10-25 | G-01 | validation | right |\n| 2026-10-25 | G-01 | API | wrong |\n| 2026-10-26 | G-02 | API | Wrong |\n| 2026-10-26 | G-02 | migration | wrong |\n| 2026-10-26 | G-02 | RLS | Not now |\n`);
  assert.deepEqual([l.right, l.wrong], [1, 3]);
  assert.deepEqual(l.missed.map((m) => [m.concept, m.count]), [['API', 2], ['migration', 1]]);
  assert.equal(learning(`## Records\n\n${table}`), null);
  assert.equal(learning(''), null, 'no file: no card');
});

test('feedback: new count and theme order', () => {
  const g = feedback('## Inbox\n\n| # | Date | Source | User | Summary | Type | Theme | Priority | Status | Task |\n|---|---|---|---|---|---|---|---|---|---|\n| 1 | 2026-10-01 | email | K-001 | no PDF | request | PDF | high | new | |\n| 2 | 2026-10-02 | form | K-002 | slow | complaint | speed | medium | planned | G-030 |\n\n## Themes\n\n| Theme | Count | Feature | Decision |\n|---|---|---|---|\n| speed | 2 | list | |\n| PDF | 5 | invoice | |\n');
  assert.equal(g.newCount, 1);
  assert.deepEqual(g.themes.map((t) => t.theme), ['PDF', 'speed']);
});

test('finding reports: latest report per kind, numbers are parsed', async () => {
  const { findingReports } = await import('../../.claude/hooks/dashboard-data.mjs');
  const r = findingReports('## Reports\n\n| Date | Type | Health | Previous | Findings | Critical | Report |\n|---|---|---|---|---|---|---|\n| 2026-10-01 | tech | 61 | - | 14 | 2 | [report](tech/2026-10-01.md) |\n| 2026-10-11 | tech | 74 | 61 | 9 | 0 | [report](tech/2026-10-11.md) |\n| 2026-10-11 | business | 58/100 | - | 12 | 1 | x |\n');
  assert.equal(r.rows.length, 3);
  assert.equal(r.latest.tech.health, 74);
  assert.equal(r.latest.tech.previous, 61);
  assert.equal(r.latest.business.health, 58);
  assert.equal(r.latest.business.critical, 1);
});

test('produced assets: brand kit, video output, research title', async () => {
  const { producedAssets } = await import('../../.claude/hooks/dashboard-data.mjs');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-'));
  assert.deepEqual(producedAssets(p), { brandDir: null, brand: [], brandGuide: false, videos: [], research: [], codeMapDays: null });
  for (const k of ['assets/brand', 'marketing/motion/demo/out', 'marketing/motion/draft', 'docs/research', 'docs/design']) fs.mkdirSync(path.join(p, k), { recursive: true });
  fs.writeFileSync(path.join(p, 'assets/brand/logo.svg'), '<svg/>');
  fs.writeFileSync(path.join(p, 'docs/design/brand.md'), '# Brand');
  fs.writeFileSync(path.join(p, 'marketing/motion/demo/out/demo.mp4'), '');
  // A research title with Turkish letters is content: shown as written
  fs.writeFileSync(path.join(p, 'docs/research/2026-10-01-payment.md'), '# Payment providers\n');
  fs.writeFileSync(path.join(p, 'docs/research/2026-10-05-kvkk.md'), 'no title');
  const v = producedAssets(p);
  assert.equal(v.brandDir, 'assets/brand');
  assert.deepEqual(v.brand, ['logo.svg']);
  assert.equal(v.brandGuide, true);
  assert.deepEqual(v.videos, [{ name: 'demo', mp4: 'marketing/motion/demo/out/demo.mp4' }, { name: 'draft', mp4: null }]);
  assert.deepEqual(v.research.map((r) => r.title), ['2026-10-05-kvkk', 'Payment providers']);
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
  if (process.platform === 'win32') assert.equal(ccusageProjectName(String.raw`D:\Claude Projects\Vibe_Kit`), 'D--Claude-Projects-Vibe-Kit');
  else assert.equal(ccusageProjectName('/home/a/my.app'), '-home-a-my-app'); // kit:path-allowed
  const o = costSummary({ projects: { x: [{ date: '2026-10-11', totalTokens: 2e6, totalCost: 3 }, { date: '2026-10-09', totalTokens: 1e6, totalCost: 1.5 }] }, totals: {} });
  assert.deepEqual(o.days.map((g) => g.date), ['2026-10-09', '2026-10-11']);
  assert.deepEqual(o.total, { token: 3e6, cost: 4.5 });
  assert.equal(costSummary({ daily: [{ period: '2026-10-01', totalTokens: 5, totalCost: 0 }] }).days[0].date, '2026-10-01');
  assert.deepEqual(costSummary(null), { days: [], total: { token: 0, cost: 0 } });
});

test('spend alarms: a row without an amount is unset, an old check is flagged', async () => {
  const { spendAlarms } = await import('../../.claude/hooks/dashboard-data.mjs');
  const now = Date.parse('2026-10-12T12:00:00');
  const a = spendAlarms('## Alarms\n\n| Service | Type | Amount | Alert thresholds | Set up at | Last check |\n|---|---|---|---|---|---|\n| Anthropic | cap | 50 USD | 50%, 80% | Console | 2026-10-10 |\n| Vercel | alert | - | | | 2026-08-01 |\n', now);
  assert.equal(a.length, 2);
  assert.equal(a[0].unset, false);
  assert.equal(a[0].stale, false);
  assert.equal(a[1].unset, true);
  assert.equal(a[1].stale, true);
});

test('status labels: control characters from the repo never reach the terminal status line', async () => {
  const { labels } = await import('../../.claude/hooks/status-read.mjs');
  const a = labels('**Active phase:** Phase\u001b]52;c;ZXZpbA==\u0007 1\n**Active task:** \u001b[2K\u001b[1GG-01\n');
  assert.equal(a['Active phase'], 'Phase]52;c;ZXZpbA== 1');
  assert.equal(a['Active task'], '[2K[1GG-01');
  assert.ok(!/[\u0000-\u001f\u007f-\u009f]/.test(Object.values(a).join('')));
});

test('3.28.6 audit: JUnit output that mentions <skipped does not skip a failing case; a placeholder prod ref is not critical', async () => {
  const { junitCases } = await import('../../.claude/hooks/dashboard-data.mjs');
  const xml = '<testcase name="AC-01.1 save"><failure message="x"/><system-out><![CDATA[log: <skipped/> written]]></system-out></testcase>';
  assert.equal([...junitCases(xml)].length, 1, 'the failing case is still counted');
  assert.equal([...junitCases(xml)][0].failed, true, 'and it is failed');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'env2-'));
  fs.mkdirSync(path.join(p, 'docs/operations'), { recursive: true });
  fs.writeFileSync(path.join(p, 'docs/operations/accounts.md'), ENV_TABLE('| prod | Supabase | - | x |\n'));
  fs.writeFileSync(path.join(p, '.mcp.json'), '{"args":["-y","x"]}');
  assert.deepEqual(envWarnings(p), [], '"-" is not a ref');
  fs.rmSync(p, { recursive: true, force: true });
});

test('3.28.6 audit: the dashboard escapes repo text (commit messages, progress, roadmap) and drops non-https cache links', async () => {
  const { spawnSync, execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { githubStatus } = await import('../../.claude/hooks/dashboard-data.mjs');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-xss-'));
  const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
  const XSS = '<img src=x onerror=alert(1)>';
  write('docs/workflow/progress.md', `**Active phase:** ${XSS}\n**Active task:** <script>alert(2)</script>\n\n## Next step\n\n1. ${XSS}\n`);
  write('docs/product/roadmap.md', `## Phase 1\n\n- [ ] G-001 ${XSS}\n`);
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
  // The English labels were read: the escaped text comes from progress.md and the roadmap, not only the commit message
  assert.ok(html.split('&lt;img src=x onerror=alert(1)&gt;').length - 1 >= 3, 'phase, next step and roadmap task are shown (escaped)');
  assert.ok(html.includes('&lt;script&gt;alert(2)&lt;/script&gt;'), 'the active task is shown escaped');
  fs.rmSync(p, { recursive: true, force: true });
});

test('a date-only entry (decision log) shows the same day in every time zone', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-date-'));
  const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
  write('docs/decisions/log.md', '## Decision log\n\n| # | Date | Stage | Topic | Question | Chosen | Door | Decided by |\n|---|---|---|---|---|---|---|---|\n| 1 | 2026-10-26 | Setup | tech | Database? | Postgres | one-way | user |\n');
  const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks', 'dashboard.mjs');
  for (const TZ of ['America/New_York', 'Pacific/Kiritimati']) {
    const r = spawnSync(process.execPath, [hook, p, '--quiet'], { encoding: 'utf8', env: { ...process.env, TZ } });
    assert.equal(r.status, 0, r.stderr);
    const html = fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8');
    // A plain folder (no language chosen) is English since 3.49.0
    assert.match(html, /Oct 26 · tech · user/, `${TZ}: no day shift in the feed`);
    const today = new Date().toLocaleDateString('en', { day: 'numeric', month: 'short', weekday: 'short', timeZone: TZ });
    assert.equal([...html.matchAll(/data-tip="([^"]+): \d+ commits"/g)].at(-1)?.[1], today, `${TZ}: the last commit bar is today`);
  }
  fs.rmSync(p, { recursive: true, force: true });
});

test('3.41.0 copy buttons: the next step and slash-command actions get the bare command, escaped', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-copy-'));
  const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
  write('docs/workflow/progress.md', '**Active phase:** Phase 1\n\n## Next step\n\n1. `/build G-013` password reset\n\n## Where we left off\n\n- half done\n\n## Open issues / blockers\n\n- `/fix "x` issue\n');
  const run = () => {
    const r = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks', 'dashboard.mjs'), p, '--quiet'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8');
  };
  const html = run();
  assert.ok(html.includes('data-cmd="/build G-013"'), 'next step command');
  assert.ok(html.includes('data-cmd="/build"'), '"continue with /build" gives /build');
  write('docs/workflow/progress.md', '**Active phase:** Phase 1\n\n## Next step\n\n1. `/build " onclick="alert(1)` x\n');
  const bad = run();
  assert.ok(!bad.includes('onclick="alert(1)'), 'a quote in the command is escaped');
  assert.ok(bad.includes('data-cmd="/build &quot; onclick=&quot;alert"'), 'escaped, cut at the "(" note');
  fs.rmSync(p, { recursive: true, force: true });
});

// 3.44.0 language selection: the dashboard waits for a language and takes <html lang> from it
const langDashboard = async (files) => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-lang-'));
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

test('AC-49.11 lang dashboard: <html lang> follows the language (.kit.json, state file); a set-up project without one is en', async () => {
  const en = await langDashboard({ '.kit.json': kitRecord({ lang: 'en' }) });
  assert.equal(en.status, 0, en.stderr);
  assert.ok(en.html?.includes('<html lang="en">'), '.kit.json lang en');
  const tr = await langDashboard({ '.kit.json': kitRecord({ lang: 'tr' }) });
  assert.ok(tr.html?.includes('<html lang="tr">'), '.kit.json lang tr');
  const state = await langDashboard({ 'kit/kit.mjs': '// kit\n', '.claude/state/lang.json': { lang: 'pt-BR' } });
  assert.equal(state.status, 0, state.stderr);
  assert.ok(state.html?.includes('<html lang="pt-BR">'), 'not set up but a language is chosen: the dashboard is written');
  const old = await langDashboard({ '.kit.json': kitRecord() });
  assert.ok(old.html?.includes('<html lang="en">'), 'set up without a language: en');
  const plain = await langDashboard({});
  assert.ok(plain.html?.includes('<html lang="en">'), 'plain folder: en');
});
