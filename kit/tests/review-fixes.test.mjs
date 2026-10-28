// Run: node --test "kit/tests/*.test.mjs"
// 3.48.0 review and security audit fixes: verdict() reads bold and punctuated verdicts, the dashboard shows an unreadable
// result as neutral, the commit gate's review-off switch needs the whole word, --approve refuses "skipped" in any case,
// tools.mjs survives prototype names, kit update keeps a user's changed anlatici.md working, qa-report finds evidence under
// the other id prefix, and the prod-ref action names the English accounts.md heading.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verdict } from '../../.claude/hooks/labels.mjs';
import { MESSAGES } from '../../.claude/hooks/messages.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(REPO, '.claude', 'hooks');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8').replace(/\r\n/g, '\n');
const made = [];
after(() => { for (const p of made) fs.rmSync(p, { recursive: true, force: true }); });

function project(files, prefix = 'review-fixes-') {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(p);
  for (const [f, s] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    fs.writeFileSync(path.join(p, f), typeof s === 'string' ? s : JSON.stringify(s));
  }
  return p;
}

// ---------- 1. verdict(): bold and trailing punctuation ----------

test('Ö-48.81 verdict: bold around the word is read (**RET**, **REJECT**, **ONAY**)', () => {
  const cases = [
    ['**RET**', 'reject'], ['**REJECT**', 'reject'], ['**ONAY**', 'approve'], ['**APPROVE**', 'approve'],
    ['**KOŞULLU ONAY**', 'conditional'], ['**CONDITIONAL**', 'conditional'], ['  **Ret**  ', 'reject'],
    ['**Result:** **REJECT**', 'reject'], ['**RET** — eksik test', 'reject'],
  ];
  for (const [input, want] of cases) assert.equal(verdict(input), want, JSON.stringify(input));
});

test('Ö-48.82 verdict: the word may be followed by ":", ",", ";" or "."', () => {
  const cases = [
    ['RET: güvenlik', 'reject'], ['REJECT, 1 critical', 'reject'], ['APPROVE.', 'approve'], ['KOŞULLU ONAY; 2 fixes', 'conditional'],
    ['ret: güvenlik', 'reject'], ['ONAY.', 'approve'], ['CONDITIONAL: fix the test first', 'conditional'], ['koşullu onay, 1 koşul', 'conditional'],
    ['RET; no test', 'reject'], ['**RET**: güvenlik', 'reject'], ['**Sonuç:** RET: güvenlik', 'reject'],
  ];
  for (const [input, want] of cases) assert.equal(verdict(input), want, JSON.stringify(input));
});

test('A-48.23 verdict: bold or punctuation does not turn a substring, question, negation or mixed result into a verdict', () => {
  for (const input of ['**RETRY**', '**SECRET**', '**APPROVED**', '**APPROVE?**', '**RET değil**', '**ONAY değil**', '**APPROVE / REJECT**',
    '**RET**değil', 'RETRY:', 'SECRET.', 'APPROVED.', 'APPROVED,', 'REJECTED:', 'onaylandı.', 'conditionally;', 'RET değil.',
    'NOT APPROVE.', '**NOT APPROVE**', '****', '**:**', '**Result:** **RETRY**']) {
    assert.equal(verdict(input), 'unknown', JSON.stringify(input));
  }
});

// ---------- 2. dashboard badges and the reject KPI ----------

const KIT = (lang) => ({ version: '3.48.0', type: 'web-saas', addons: [], tool: null, ...(lang ? { lang } : {}), created: '2026-10-01', updated: '2026-10-01', files: {} });
const CACHE = () => ({ time: Date.now(), data: { runs: [], prs: [], liveMonitoring: [] } });
const boardFile = (rows) => `**Status:** set up\n**Commit review:** on\n\n## Meeting log\n\n| # | Date | Kind | Scope | Attendees | Result | Critical | Decision |\n|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
const councilFile = (marker, kind, line) => `# Council: ${kind} · ${marker}\n**Date:** 2026-10-14 · **Type:** ${kind}\n\n## 4. Chair decision\n${line}\n`;

function dashboard({ lang = 'en', rows = [], councils = {} } = {}) {
  const files = { '.kit.json': KIT(lang), '.claude/state/github-cache.json': CACHE() };
  if (rows.length) files['docs/workflow/board.md'] = boardFile(rows);
  let day = 10;
  for (const [marker, [kind, line]] of Object.entries(councils)) files[`docs/workflow/council/2026-10-${day++}-${kind}-${marker}.md`] = councilFile(marker, kind, line);
  const p = project(files, 'review-dash-');
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'dashboard.mjs'), p, '--quiet'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8');
}
// The badge class inside the table row that holds the marker
const rowBadge = (html, marker) => {
  const row = html.match(new RegExp(`<tr>(?:(?!</tr>)[\\s\\S])*?${marker}(?:(?!</tr>)[\\s\\S])*?</tr>`))?.[0];
  assert.equal(typeof row, 'string', `a table row for ${marker}`);
  return row.match(/class="badge (\w+)"/)?.[1] ?? null;
};
const msg = (key, lang) => MESSAGES[key][lang];
const summaryCard = (html, lang) => html.match(new RegExp(`<h3>${msg('dashboard.summary', lang)}</h3><div class="kpis mini">([\\s\\S]*?)</section>`))?.[1] ?? '';
const kpis = (card) => [...card.matchAll(/<div class="kpi-l">([^<]*)<\/div><div class="kpi-v">([^<]*)</g)].map((m) => [m[1], m[2]]);
const row = (no, scope, result, decision = 'noted') => `| ${no} | 2026-10-2${no} | task | ${scope} | board-qa | ${result} | - | ${decision} |`;

test('Ö-48.83 dashboard: a meeting result verdict() cannot read gets the neutral info badge, never good', () => {
  const html = dashboard({ rows: [
    row(1, 'zqmcondapprove', 'CONDITIONAL APPROVE'), row(2, 'zqmmaybe', 'maybe'), row(3, 'zqmapprove', 'APPROVE'),
    row(4, 'zqmbold', '**ONAY**'), row(5, 'zqmpunct', 'KOŞULLU ONAY; 2 fixes'),
  ] });
  assert.equal(rowBadge(html, 'zqmcondapprove'), 'info');
  assert.equal(rowBadge(html, 'zqmmaybe'), 'info');
  assert.equal(rowBadge(html, 'zqmapprove'), 'good', 'a real approval stays good');
  assert.equal(rowBadge(html, 'zqmbold'), 'good', 'a bold approval is an approval');
  assert.equal(rowBadge(html, 'zqmpunct'), 'warn', 'a punctuated conditional is conditional');
});

test('Ö-48.84 dashboard: a council decision that is an option name or unreadable is info, in the table and in the latest-council KPI', () => {
  const html = dashboard({ councils: { zqpostgres: ['decision', '**Recommendation:** Postgres'], zqmaybe: ['plan', '**Decision:** maybe'] } });
  assert.equal(rowBadge(html, 'zqpostgres'), 'info');
  assert.equal(rowBadge(html, 'zqmaybe'), 'info');
  const latest = dashboard({ councils: { zqoption: ['decision', '**Decision:** Postgres'] } });
  assert.equal(rowBadge(latest, 'zqoption'), 'info');
  const kpiBadge = latest.match(new RegExp(`<div class="kpi-l">${msg('dashboard.th.decision', 'en')}</div><div class="kpi-v"><span class="badge (\\w+)"`))?.[1];
  assert.equal(kpiBadge, 'info', 'the latest council\'s decision KPI');
});

test('Ö-48.85 dashboard: "RET: güvenlik" in the meeting log counts as a reject and raises the board-reject alert like RET', () => {
  for (const result of ['RET: güvenlik', 'REJECT, 1 critical', '**RET**']) {
    const html = dashboard({ rows: [row(1, 'G-001', 'APPROVE'), row(2, 'G-010', result, '')] });
    assert.deepEqual(kpis(summaryCard(html, 'en')).map(([, v]) => v), ['2', '1', '%50'], `${result}: meetings, rejects, approval rate`);
    assert.match(html, /The board rejected \(task, G-010\)/, `${result}: an unanswered reject raises the critical alert`);
    assert.equal(rowBadge(html, 'G-010'), 'critical', `${result}: reject badge`);
  }
});

test('Ö-48.86 dashboard: the reject KPI label comes from messages.mjs in the project language, no hard-coded RET on an English dashboard', () => {
  const rows = [row(1, 'G-001', 'APPROVE'), row(2, 'G-010', 'REJECT, 1 critical', '')];
  const en = dashboard({ rows });
  const tr = dashboard({ lang: 'tr', rows });
  const enLabels = kpis(summaryCard(en, 'en')).map(([l]) => l);
  const trLabels = kpis(summaryCard(tr, 'tr')).map(([l]) => l);
  assert.equal(enLabels.length, 3, 'three summary KPIs (English)');
  assert.equal(trLabels.length, 3, 'three summary KPIs (Turkish)');
  assert.notEqual(enLabels[1], 'RET');
  assert.doesNotMatch(summaryCard(en, 'en'), /\bRET\b/, 'no RET in the English summary card');
  assert.doesNotMatch(en, /\bRET\b/, 'no RET anywhere on an English dashboard whose log says REJECT');
  const keys = Object.entries(MESSAGES).filter(([, v]) => v.en === enLabels[1]).map(([k]) => k);
  assert.notDeepEqual(keys, [], `the English label "${enLabels[1]}" is a messages.mjs text`);
  assert.equal(keys.some((k) => MESSAGES[k].tr === trLabels[1]), true, `the Turkish dashboard shows the same key's tr text (got "${trLabels[1]}")`);
});

// ---------- 3. commit gate: review off needs the whole word ----------

test('Ö-48.87 commit gate: "off", "off (solo)" and "kapalı" exempt; "offer" and "kapalıdır" do not', () => {
  const p = project({ '.claude/agents/board-qa.md': '---\nname: board-qa\n---\n', 'a.js': 'x', 'docs/workflow/board.md': '**Commit review:** on\n' }, 'review-gate-');
  const sh = (c) => execSync(c, { cwd: p, stdio: 'ignore' });
  sh('git init -q && git config user.email t@t && git config user.name t && git add . && git commit -qm init');
  fs.writeFileSync(path.join(p, 'b.js'), 'code');
  sh('git add b.js');
  const door = () => spawnSync(process.execPath, [path.join(HOOKS, 'commit-gate.mjs')],
    { input: JSON.stringify({ tool_input: { command: 'git commit -m x' } }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  for (const [line, status] of [
    ['**Commit review:** off', 0], ['**Commit review:** off (solo)', 0], ['**Commit denetimi:** kapalı', 0],
    ['**Commit review:** offer', 2], ['**Commit denetimi:** kapalıdır', 2], ['**Commit review:** offline', 2], ['**Commit review:** on', 2],
  ]) {
    fs.writeFileSync(path.join(p, 'docs/workflow/board.md'), `**Status:** set up\n${line}\n`);
    const r = door();
    assert.equal(r.status, status, `${line}: ${r.stderr}`);
  }
});

// ---------- 4. commit gate: --approve refuses "skipped" ----------

test('A-48.24 commit gate: --approve "skipped: …" and --approve "Skipped" are refused and record nothing', () => {
  const p = project({ '.claude/agents/board-qa.md': '---\nname: board-qa\n---\n', 'a.js': 'x', 'docs/workflow/board.md': '**Status:** set up\n**Commit review:** on\n' }, 'review-skip-');
  execSync('git init -q && git config user.email t@t && git config user.name t && git add . && git commit -qm init', { cwd: p, stdio: 'ignore' });
  fs.writeFileSync(path.join(p, 'a.js'), 'y');
  const approvalFile = path.join(p, '.claude', 'state', 'commit-approval.json');
  for (const note of ['skipped: user request', 'Skipped', 'SKIPPED', 'skipped']) {
    const r = spawnSync(process.execPath, [path.join(HOOKS, 'commit-gate.mjs'), '--approve', note], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
    assert.equal(r.status, 1, `${note}: refused`);
    assert.match(r.stderr, /--skip/, `${note}: points to --skip`);
    assert.equal(fs.existsSync(approvalFile), false, `${note}: no approval recorded`);
  }
  const ok = spawnSync(process.execPath, [path.join(HOOKS, 'commit-gate.mjs'), '--approve', 'board-qa'], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  assert.equal(ok.status, 0, 'a plain note is still recorded (control)');
  assert.equal(JSON.parse(fs.readFileSync(approvalFile, 'utf8')).note, 'board-qa');
});

// ---------- 5. tools.mjs: prototype names ----------

test('A-48.25 tools: --required __proto__ / --enable constructor fail as an unknown package, no TypeError', () => {
  const p = project({ '.claude/settings.json': { enabledPlugins: { 'taste-skill@taste-skill': false } } }, 'review-tools-');
  for (const args of [['--required', '__proto__'], ['--required', 'constructor'], ['--enable', 'constructor'], ['--enable', '__proto__'],
    ['--disable', 'hasOwnProperty'], ['--required', 'toString']]) {
    const r = spawnSync(process.execPath, [path.join(HOOKS, 'tools.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p }, timeout: 15000 });
    const what = args.join(' ');
    assert.equal(r.status, 1, `${what}: exit 1`);
    assert.doesNotMatch(r.stderr, /TypeError/, `${what}: no TypeError`);
    assert.match(r.stderr, new RegExp(`Unknown package: ${args[1]}\\b`), `${what}: names the typed package`);
    for (const name of ['design', 'security', 'release', 'video']) assert.match(r.stderr, new RegExp(`\\b${name}\\b`), `${what}: lists ${name}`);
  }
  assert.equal(fs.existsSync(path.join(p, '.claude/settings.local.json')), false, 'nothing written');
});

// ---------- 6. kit update: a user-changed anlatici.md keeps working ----------

const KIT_MJS = path.join(REPO, 'kit', 'kit.mjs');
const sha = (s) => crypto.createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');
const OLD_STYLE = read('.claude/output-styles/narrator.md').replace(/^name: narrator$/m, 'name: anlatici');
// An installed project made to look like one set up before 3.48: anlatici.md recorded by the kit, no narrator.md
function oldProject(styleText) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'review-style-')), 'changed');
  made.push(path.dirname(p));
  fs.cpSync(REPO, p, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules|\.calisma)$/.test(src) && !src.endsWith('.kit.json') && !src.endsWith('settings.local.json') });
  const r = spawnSync(process.execPath, [path.join(p, 'kit', 'kit.mjs'), 'install', '--type', 'backend'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const rec = JSON.parse(fs.readFileSync(path.join(p, '.kit.json'), 'utf8'));
  fs.rmSync(path.join(p, '.claude/output-styles/narrator.md'), { force: true });
  delete rec.files['.claude/output-styles/narrator.md'];
  fs.writeFileSync(path.join(p, '.claude/output-styles/anlatici.md'), styleText);
  rec.files['.claude/output-styles/anlatici.md'] = sha(OLD_STYLE);
  fs.writeFileSync(path.join(p, '.kit.json'), JSON.stringify(rec));
  return p;
}

test('Ö-48.88 kit update: a user-changed anlatici.md stays, outputStyle "anlatici" is not rewritten, a second update does not report it again', () => {
  const mine = `${OLD_STYLE}\nMy own rule: explain every step twice.\n`;
  const p = oldProject(mine);
  const style = path.join(p, '.claude/output-styles/anlatici.md');
  const local = path.join(p, '.claude/settings.local.json');
  const sharedFile = path.join(p, '.claude/settings.json');
  fs.writeFileSync(local, JSON.stringify({ outputStyle: 'anlatici', env: { A: '1' } }, null, 2));
  const shared = JSON.parse(fs.readFileSync(sharedFile, 'utf8'));
  fs.writeFileSync(sharedFile, JSON.stringify({ ...shared, outputStyle: 'anlatici' }, null, 2));
  const update = () => spawnSync(process.execPath, [KIT_MJS, 'update', '--project', p], { encoding: 'utf8' });

  const first = update();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(fs.readFileSync(style, 'utf8'), mine, 'the user\'s anlatici.md is untouched');
  assert.equal(JSON.parse(fs.readFileSync(local, 'utf8')).outputStyle, 'anlatici', 'settings.local.json still picks the user\'s style');
  assert.equal(JSON.parse(fs.readFileSync(sharedFile, 'utf8')).outputStyle, 'anlatici', 'settings.json still picks the user\'s style');
  assert.match(first.stdout, /anlatici\.md/, 'the first update tells the user once');

  const second = update();
  assert.equal(second.status, 0, second.stderr);
  assert.equal(fs.readFileSync(style, 'utf8'), mine, 'still there after a second update');
  assert.equal(JSON.parse(fs.readFileSync(local, 'utf8')).outputStyle, 'anlatici', 'second update: settings.local.json unchanged');
  assert.equal(JSON.parse(fs.readFileSync(sharedFile, 'utf8')).outputStyle, 'anlatici', 'second update: settings.json unchanged');
  assert.doesNotMatch(second.stdout, /anlatici\.md/, 'the second update does not report the same file again');
});

// ---------- 7. qa-report: evidence under the other id prefix ----------

function qaRun(prdId, shotId) {
  const p = project({
    'docs/product/prd.md': `- [ ] ${prdId}: Zorunlu alan boşsa kaydedilmez\n`,
    'test-results-qa/junit.xml': `<testsuites><testsuite><testcase name="${shotId} zorunlu alan" classname="qa"/></testsuite></testsuites>`,
    [`test-results-qa/shots/${shotId}.png`]: 'png',
  }, 'review-qa-');
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'qa-report.mjs')], { cwd: p, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const [file] = fs.readdirSync(path.join(p, 'docs/quality/qa')).filter((f) => f.endsWith('.md'));
  const stamp = file.slice(0, -3);
  const text = fs.readFileSync(path.join(p, 'docs/quality/qa', file), 'utf8');
  return { p, stamp, text };
}

test('Ö-48.89 qa-report: PRD Ö-01.1 with shots/AC-01.1.png, and PRD AC-01.1 with shots/Ö-01.1.png, still copy and link the evidence', () => {
  for (const [prdId, shotId] of [['Ö-01.1', 'AC-01.1'], ['AC-01.1', 'Ö-01.1']]) {
    const { p, stamp, text } = qaRun(prdId, shotId);
    const evidence = text.match(new RegExp(`\\| ${prdId.replace('.', '\\.')} Zorunlu alan boşsa kaydedilmez \\| passed \\| ([^|]*) \\|`))?.[1]?.trim();
    assert.match(evidence ?? '', new RegExp(`^\\.previews/qa-${stamp}/(Ö|AC)-01\\.1\\.png$`), `${prdId} / ${shotId}: the evidence cell links the copy`);
    assert.equal(fs.existsSync(path.join(p, evidence)), true, `${prdId} / ${shotId}: the linked file is copied`);
    assert.equal(fs.readFileSync(path.join(p, evidence), 'utf8'), 'png');
  }
});

// ---------- 8. messages.mjs: prod-ref action names the English heading ----------

test('Ö-48.90 messages: dashboardData.prodRefAction names the "Environments" heading of accounts.md in en and tr', () => {
  assert.match(read('docs/operations/accounts.md'), /^## Environments \(dev \/ prod\)$/m, 'the heading it points to');
  for (const lang of ['en', 'tr']) {
    const text = MESSAGES['dashboardData.prodRefAction'][lang];
    assert.match(text, /accounts\.md → Environments\b/, lang);
    assert.doesNotMatch(text, /Ortamlar/, `${lang}: not the old Turkish heading`);
  }
});
