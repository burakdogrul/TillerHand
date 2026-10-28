// Run: node --test "kit/tests/*.test.mjs"
// 3.48.0 step 2: the hooks that read project files read Turkish (pre-3.48) and English labels alike.
// Each reader gets a Turkish file and the same file with English labels (values untouched) and must return the same thing.
// Turkish fixtures follow the 3.47.1 templates; English ones translate only the labels, per the approved dictionary.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readStatus } from '../../.claude/hooks/status-read.mjs';
import { flags, unitEconomics, learning, metrics, specInvariants, repeatedBugClasses } from '../../.claude/hooks/dashboard-data.mjs';
import { readCommands, approvedCommands, isApproved, approvalPath, approve } from '../../.claude/hooks/gate.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');
const lines = (...a) => a.join('\n');
const made = [];
after(() => { for (const p of made) fs.rmSync(p, { recursive: true, force: true }); });

function project(files) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'labels-readers-'));
  made.push(p);
  for (const [f, s] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    fs.writeFileSync(path.join(p, f), typeof s === 'string' ? s : JSON.stringify(s));
  }
  return p;
}

// ---------- fixtures: one TR / EN pair per document type ----------

const PROGRESS = {
  tr: lines('# Progress', '',
    '**Son güncelleme:** 2026-10-27',
    '**Aktif faz:** Faz 1 — Core',
    '**Aktif görev:** G-011 data model',
    '**Başlangıç adımı:** 9/9',
    '**Soru modu:** açık · kapalı konular: tasarim',
    '**Profil:** Standart', '',
    '## Şu anki durum', '', '> template note', 'Sign-in works.', 'Data model is next.', '',
    '## Son oturumda yapılanlar', '', '- G-010 auth finished', '- CI set up', '',
    '## Sıradaki adım', '', '1. `/build G-011` data model', '',
    '## Bekleyen kararlar', '', '- Postgres or SQLite?', '',
    '## Kaldığı yer (if stopped because of a limit or midway)', '', '- G-011 migration half written', '',
    '## Açık sorunlar / bloklayıcılar', '', '- CI is slow', '',
    '## Watch out (notes for the AI)', '', '- keep it small', ''),
  en: lines('# Progress', '',
    '**Last updated:** 2026-10-27',
    '**Active phase:** Faz 1 — Core',
    '**Active task:** G-011 data model',
    '**Setup step:** 9/9',
    '**Question mode:** açık · kapalı konular: tasarim',
    '**Profile:** Standart', '',
    '## Current state', '', '> template note', 'Sign-in works.', 'Data model is next.', '',
    '## Done last session', '', '- G-010 auth finished', '- CI set up', '',
    '## Next step', '', '1. `/build G-011` data model', '',
    '## Pending decisions', '', '- Postgres or SQLite?', '',
    '## Where we left off (if stopped because of a limit or midway)', '', '- G-011 migration half written', '',
    '## Open issues / blockers', '', '- CI is slow', '',
    '## Watch out (notes for the AI)', '', '- keep it small', ''),
};

const roadmap = (h0, h1) => lines('# Roadmap', '', '> Phase headings keep the word "Faz" (phase): the dashboard reads it.', '',
  `## ${h0} 0 — Setup (skeleton)`, '', '- [x] G-001: Repo ready — done when: first commit', '- [x] G-002: Skeleton runs — done when: dev starts', '',
  `## ${h1} 1 — Core (the must-haves of the MVP)`, '', '- [x] G-010: Auth — done when: sign in works', '- [ ] G-011: Data model — done when: migration runs', '',
  '## Idea pool (not planned)', '', '- [ ] Dark mode', '');
const ROADMAP = { tr: roadmap('Faz', 'Faz'), en: roadmap('Phase', 'Phase'), mixed: roadmap('Faz', 'Phase') };

const decisions = (h) => lines('# Decisions', '', `## ${h}`, '', '`/dashboard` reads this table; do not change the columns.', '',
  '| # | Date | Stage | Topic | Question | Chosen | Door | Decided by |', '|---|---|---|---|---|---|---|---|',
  '| 1 | 2026-10-26 | Faz 0 | teknik | Database? | Postgres | tek | kullanıcı |',
  '| 2 | 2026-10-27 | Faz 1 | tasarim | Font? | Inter | çift | otomatik |', '',
  '## ADR list', '', '| ADR | Title | Status | Log no |', '|---|---|---|---|', '| 0001 | Postgres | accepted | 1 |', '');
const DECISIONS = { tr: decisions('Karar günlüğü'), en: decisions('Decision log') };

const MEETINGS_TR_RESULTS = [
  '| 1 | 2026-10-20 | task | G-001 | QA | ONAY | - | - |',
  '| 2 | 2026-10-21 | task | G-002 | QA | KOŞULLU ONAY (1 condition) | - | fixed |',
  '| 3 | 2026-10-22 | task | G-010 | QA | RET — no test | missing test |  |',
  '| 4 | 2026-10-23 | phase | Faz 0 | QA | KOŞULLU | - | accepted |',
];
const board = ({ status, review, members, log }, rows = MEETINGS_TR_RESULTS) => lines('# Expert Board', '',
  '> The `/dashboard` and the session-start note read the **bold-labeled** lines below; do not break their format.', '',
  `**${status}:** kuruldu`, `**${review}:** açık`, '',
  `## ${members}`, '', '| Member | Agent | Model | Focus | Meetings |', '|---|---|---|---|---|', '| QA | board-qa | sonnet | tests | 4 |', '',
  `## ${log}`, '', '| # | Date | Type | Scope | Attendees | Result | Critical | User decision |', '|---|---|---|---|---|---|---|---|', ...rows, '');
const BOARD_TR = { status: 'Durum', review: 'Commit denetimi', members: 'Üyeler', log: 'Toplantı günlüğü' };
const BOARD_EN = { status: 'Status', review: 'Commit review', members: 'Members', log: 'Meeting log' };
const BOARD = { tr: board(BOARD_TR), en: board(BOARD_EN) };

const HANDOFF = {
  tr: lines('# Handoff note', '', '**Durum:** bekliyor', '**Date:** 2026-10-27', '', '## Where we left off', '- G-011', ''),
  en: lines('# Handoff note', '', '**Status:** bekliyor', '**Date:** 2026-10-27', '', '## Where we left off', '- G-011', ''),
};

const CMD = {
  dev: 'node dev.mjs',
  preview: 'http://127.0.0.1:3999',
  test: 'node -e "process.exit(0)"',
  lint: 'node -e "console.log(\'lint ok\')"',
  typeCheck: 'node -e "console.log(\'types ok\')"',
};
const agents = ({ heading, dev, preview, typeCheck }, c = CMD) => lines('# Demo Project', '', '> For the label tests.', '',
  `## ${heading}`, '', '```bash', '# /start fills these in for the chosen stack',
  `${dev}  ${c.dev}`, `${preview}    ${c.preview}`, `test:        ${c.test}`, `lint:        ${c.lint}`, `${typeCheck} ${c.typeCheck}`, 'build:       [ ]', '```', '',
  '## Definition of "done"', '', '- [ ] tests green', '');
const AGENTS_TR_KEYS = { heading: 'Komutlar', dev: 'geliştirme:', preview: 'önizleme:', typeCheck: 'tip kontrol:' };
const AGENTS_EN_KEYS = { heading: 'Commands', dev: 'dev:', preview: 'preview:', typeCheck: 'type check:' };
const AGENTS = { tr: agents(AGENTS_TR_KEYS), en: agents(AGENTS_EN_KEYS) };

const prd = (priority, outOfScope) => lines('# PRD', '', '## 1. Problem', '', 'Invoices take too long.', '',
  '## 5. MVP scope', '', '### Ö-01: Invoice list', '', '- [x] Ö-01.1: List shows invoices', '- [ ] Ö-01.2: Empty list message', '', `**${priority}:** Must have`, '',
  '### Ö-02: PDF export', '', '- [ ] Ö-02.1: PDF downloads', '', `**${priority}:** Nice to have`, '',
  `## 6. ${outOfScope} (out of scope: NOT built in this release)`, '', '- Native mobile app', '- Multi-currency', '',
  '## 7. Main user flows', '', '- sign in, list, export', '');
const PRD = { tr: prd('Öncelik', 'Kapsam dışı'), en: prd('Priority', 'Out of scope') };

const stack = (h) => lines('# Stack', '', `## ${h}`, '', '> /start fills this in.', '', '| Layer | Choice | Note |', '|---|---|---|',
  '| Framework | Next.js | |', '| Database | Postgres | |', '');
const STACK = { tr: stack('Seçilen teknolojiler'), en: stack('Chosen technologies') };

const maintenance = (h) => lines('# Maintenance', '', `## ${h}`, '', '| Date | Type | Findings | Done / task opened |', '|---|---|---|---|',
  '| 2026-10-25 | weekly | 2 outdated packages | updated |', '');
const MAINTENANCE = { tr: maintenance('Bakım kaydı'), en: maintenance('Maintenance log') };

const changelog = (h) => lines('# Changelog', '', `## [${h}]`, '', '### Added', '- Invoice PDF export', '', '### Fixed', '- Empty list crash', '',
  '## [0.1.0] - 2026-10-01', '', '### Added', '- Project skeleton', '');
const CHANGELOG = { tr: changelog('Yayınlanmamış'), en: changelog('Unreleased') };

const flagDoc = (h) => lines('# Feature flags', '', `## ${h}`, '', 'The `/dashboard` dashboard reads this table.', '',
  '| Flag | Purpose | Status | Owner | Added | Removal date | Kill switch tested |', '|---|---|---|---|---|---|---|',
  '| new_pdf | pdf export | on | me | 2026-09-01 | 2026-10-01 | evet |', '| beta_list | list | off | me | 2026-10-01 | 2026-12-31 | hayır |', '',
  '## Rules', '', '- remove after launch', '');
const FLAGS = { tr: flagDoc('Bayraklar'), en: flagDoc('Flags') };

const UNIT = {
  tr: lines('# Unit economics', '', '## Inputs', '', '**Para birimi:** TL', '**Fiyat (kullanıcı başı aylık):** 200', '**Ödeme komisyonu (%):** 5',
    '**Sabit aylık maliyet:** 1500', '**Kullanıcı başı değişken maliyet (aylık):** 20', '**Hedef aktif kullanıcı:** 100', '**Ücretsiz kullanıcı oranı (%):** 50', ''),
  en: lines('# Unit economics', '', '## Inputs', '', '**Currency:** TL', '**Price (per user, monthly):** 200', '**Payment fee (%):** 5',
    '**Fixed monthly cost:** 1500', '**Variable cost per user (monthly):** 20', '**Target active users:** 100', '**Free user share (%):** 50', ''),
};

const learningDoc = (h) => lines('# Learning', '', `## ${h}`, '', '| Date | Task | Concept | Result |', '|---|---|---|---|',
  '| 2026-10-25 | G-01 | validation | doğru |', '| 2026-10-25 | G-01 | API | yanlış |', '| 2026-10-26 | G-02 | API | yanlış |', '');
const LEARNING = { tr: learningDoc('Kayıtlar'), en: learningDoc('Records') };

const metricsDoc = (h) => lines('# Metrics', '', '## Definitions', '', '- a', '', `## ${h}`, '',
  '| Period | Completed tasks | Avg. task duration (min) | Avg. limit cost (%) | Fix rate (%) | Rollbacks | Duplicate code (%) | Open critical | Acceptance tests (%) | Note |',
  '|---|---|---|---|---|---|---|---|---|---|', '| 2026-09 | 12 | 45 | 6 | 20 | 1 | 3 | 0 | 90 | |', '| 2026-10 | 15 | 40 | 5 | 15 | 0 | 2 | 1 | 95 | |', '');
const METRICS = { tr: metricsDoc('Kayıtlar'), en: metricsDoc('Records') };

const spec = (type, cls, keep, n) => lines(`# Spec: bug ${n}`, '', `**${type}:** hata`, `**${cls}:** yetki`, '**Kural:** [bug only]', '',
  '## Current behavior', '', '- another user can open the invoice', '', `## ${keep}`, '', `- Ö-01.${n}: list stays sorted`, 'Ö-01.9 in prose is not in list form', '');
const SPECS = {
  tr: { 'docs/product/specs/2026-10-01-a.md': spec('Tür', 'Sınıf', 'Değişmemesi gereken davranış', 1), 'docs/product/specs/2026-10-02-b.md': spec('Tür', 'Sınıf', 'Değişmemesi gereken davranış', 2) },
  en: { 'docs/product/specs/2026-10-01-a.md': spec('Type', 'Class', 'Behavior that must not change', 1), 'docs/product/specs/2026-10-02-b.md': spec('Type', 'Class', 'Behavior that must not change', 2) },
};

const KIT = { version: '3.48.0', type: 'web-saas', addons: [], tool: null, lang: 'en', created: '2026-10-01', updated: '2026-10-01', files: {} };
// A fresh GitHub cache: an installed project would otherwise call gh
const CACHE = () => ({ time: Date.now(), data: { runs: [], prs: [], liveMonitoring: [] } });

const statusFiles = (v) => ({
  'docs/workflow/progress.md': PROGRESS[v], 'docs/product/roadmap.md': ROADMAP[v], 'docs/decisions/log.md': DECISIONS[v],
  'docs/workflow/board.md': BOARD[v], 'docs/workflow/handoff.md': HANDOFF[v], 'AGENTS.md': AGENTS[v], '.kit.json': KIT,
});
const allFiles = (v) => ({
  ...statusFiles(v), 'docs/product/prd.md': PRD[v], 'docs/architecture/stack.md': STACK[v], 'docs/operations/maintenance.md': MAINTENANCE[v],
  'CHANGELOG.md': CHANGELOG[v], 'docs/operations/feature-flags.md': FLAGS[v], 'docs/product/unit-economics.md': UNIT[v],
  'docs/workflow/learning.md': LEARNING[v], 'docs/quality/metrics.md': METRICS[v], ...SPECS[v], '.claude/state/github-cache.json': CACHE(),
});

// The dashboard HTML without its generation time (the only part that changes between two runs)
function dashboard(p) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'dashboard.mjs'), p, '--quiet'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8').replace(/<footer>[\s\S]*?<\/footer>/, '<footer></footer>');
}
const summaryKpis = (html) => [...(html.match(/<h3>Summary<\/h3><div class="kpis mini">([\s\S]*?)<\/section>/)?.[1] ?? '')
  .matchAll(/<div class="kpi-v">([^<]*)</g)].map((m) => m[1]);
const activeStep = (html) => html.match(/<li class="step now[^"]*"><span class="step-n">([^<]*)<\/span>/)?.[1] ?? null;
const openPhase = (html) => [...html.matchAll(/<details class="card faz" open>\s*<summary><b>([^<]*)<\/b>/g)].map((m) => m[1]);

// ---------- status-read: readStatus ----------

const STATUS_WANT = {
  fields: {
    'Last updated': '2026-10-27', 'Active phase': 'Faz 1 — Core', 'Active task': 'G-011 data model', 'Setup step': '9/9',
    'Question mode': 'açık · kapalı konular: tasarim', Profile: 'Standart',
  },
  state: 'Sign-in works. Data model is next.',
  lastSession: ['G-010 auth finished', 'CI set up'],
  next: ['`/build G-011` data model'],
  pending: ['Postgres or SQLite?'],
  issues: ['CI is slow'],
  leftOff: ['G-011 migration half written'],
  handoffPending: true,
  phases: [
    { name: 'Phase 0 — Setup (skeleton)', done: 2, total: 2, tasks: [
      { done: true, text: 'G-001: Repo ready — done when: first commit' }, { done: true, text: 'G-002: Skeleton runs — done when: dev starts' }] },
    { name: 'Phase 1 — Core (the must-haves of the MVP)', done: 1, total: 2, tasks: [
      { done: true, text: 'G-010: Auth — done when: sign in works' }, { done: false, text: 'G-011: Data model — done when: migration runs' }] },
  ],
  taskCount: { done: 3, total: 4 },
  decisions: [
    { no: '1', date: '2026-10-26', stage: 'Faz 0', topic: 'teknik', question: 'Database?', chosen: 'Postgres', door: 'tek', decidedBy: 'kullanıcı' },
    { no: '2', date: '2026-10-27', stage: 'Faz 1', topic: 'tasarim', question: 'Font?', chosen: 'Inter', door: 'çift', decidedBy: 'otomatik' },
  ],
  board: {
    state: 'kuruldu', commitReview: 'açık',
    members: [{ member: 'QA', agent: 'board-qa', model: 'sonnet', focus: 'tests', meetings: '4' }],
    meetings: [
      { no: '1', date: '2026-10-20', kind: 'task', scope: 'G-001', attendees: 'QA', result: 'ONAY', critical: '-', decision: '-' },
      { no: '2', date: '2026-10-21', kind: 'task', scope: 'G-002', attendees: 'QA', result: 'KOŞULLU ONAY (1 condition)', critical: '-', decision: 'fixed' },
      { no: '3', date: '2026-10-22', kind: 'task', scope: 'G-010', attendees: 'QA', result: 'RET — no test', critical: 'missing test', decision: '' },
      { no: '4', date: '2026-10-23', kind: 'phase', scope: 'Faz 0', attendees: 'QA', result: 'KOŞULLU', critical: '-', decision: 'accepted' },
    ],
  },
};
const pick = (s) => Object.fromEntries(Object.keys(STATUS_WANT).map((k) => [k, s[k]]));

test('AC-48.2 readStatus: a Turkish project gives English keys, sections, Phase N names, decisions, board and handoff', () => {
  assert.deepEqual(pick(readStatus(project(statusFiles('tr')))), STATUS_WANT);
});

test('AC-48.2 readStatus: the same project with English labels reads exactly the same', () => {
  const tr = readStatus(project(statusFiles('tr')));
  const en = readStatus(project(statusFiles('en')));
  assert.deepEqual(pick(en), STATUS_WANT);
  assert.deepEqual(en, tr, 'whole reader output');
  assert.equal(en.project, 'Demo Project');
});

test('AC-48.2 readStatus: no handoff waiting and no board file fall back the same way in both languages', () => {
  for (const v of ['tr', 'en']) {
    const files = statusFiles(v);
    files['docs/workflow/handoff.md'] = HANDOFF[v].replace('bekliyor', 'devralındı');
    delete files['docs/workflow/board.md'];
    const s = readStatus(project(files));
    assert.equal(s.handoffPending, false, v);
    assert.deepEqual(s.board, { state: 'kurulmadı', commitReview: 'açık', members: [], meetings: [] }, v);
  }
});

// ---------- dashboard-data: pure readers take either language ----------

const NOW = Date.parse('2026-10-28T12:00:00');

test('AC-48.2 flags: "## Flags" reads the same rows as "## Bayraklar"', () => {
  const tr = flags(FLAGS.tr, NOW);
  assert.deepEqual(tr.map((b) => [b.name, b.isOverdue, b.untested]), [['new_pdf', true, false], ['beta_list', false, true]]);
  assert.deepEqual(flags(FLAGS.en, NOW), tr);
});

test('AC-48.2 unitEconomics: the English input labels give the same numbers as the Turkish ones', () => {
  const tr = unitEconomics(UNIT.tr);
  assert.equal(tr.currency, 'TL');
  assert.equal(tr.margin, 170);
  assert.equal(tr.breakEven, 10);
  assert.deepEqual(unitEconomics(UNIT.en), tr);
  assert.equal(unitEconomics('**Price (per user, monthly):** 0\n**Fixed monthly cost:** 0'), null, 'empty English input: no card');
});

test('AC-48.2 learning and metrics: "## Records" reads the same table as "## Kayıtlar"', () => {
  const l = learning(LEARNING.tr);
  assert.deepEqual([l.right, l.wrong], [1, 2]);
  assert.deepEqual(learning(LEARNING.en), l);
  const m = metrics(METRICS.tr);
  assert.deepEqual(m.map((r) => [r.period, r.taskCount, r.acceptance]), [['2026-09', '12', '90'], ['2026-10', '15', '95']]);
  assert.deepEqual(metrics(METRICS.en), m);
});

test('AC-48.2 specInvariants: "## Behavior that must not change" lists the same ids as the Turkish heading', () => {
  const tr = specInvariants(project(SPECS.tr));
  assert.deepEqual(tr.invariants.map((k) => [k.spec, k.id, k.key, k.test, k.result]),
    [['2026-10-01-a.md', 'Ö-01.1', 'O_01_1', false, null], ['2026-10-02-b.md', 'Ö-01.2', 'O_01_2', false, null]]);
  assert.equal(tr.unreadable.length, 2);
  assert.deepEqual(specInvariants(project(SPECS.en)), tr);
});

test('AC-48.2 repeatedBugClasses: "**Type:** hata" + "**Class:**" count like "**Tür:**" + "**Sınıf:**"', () => {
  const want = [{ cls: 'yetki', specs: ['2026-10-01-a.md', '2026-10-02-b.md'] }];
  assert.deepEqual(repeatedBugClasses(project(SPECS.tr)), want);
  assert.deepEqual(repeatedBugClasses(project(SPECS.en)), want);
});

// ---------- dashboard.mjs ----------

test('AC-48.2 dashboard: priority, out of scope, chosen technologies, maintenance log and [Unreleased] read from English files', () => {
  const tr = dashboard(project(allFiles('tr')));
  const en = dashboard(project(allFiles('en')));
  for (const [what, html] of [['tr', tr], ['en', en]]) {
    assert.ok(html.includes('<span class="tag">Must have</span>'), `${what}: priority`);
    assert.ok(html.includes('<li>Native mobile app</li>') && html.includes('<li>Multi-currency</li>'), `${what}: out of scope`);
    assert.ok(html.includes('<dt>Framework</dt><dd>Next.js</dd>'), `${what}: chosen technologies`);
    assert.ok(html.includes('weekly: 2 outdated packages'), `${what}: maintenance log`);
    assert.ok(html.includes('<li>Invoice PDF export</li>') && html.includes('<li>Empty list crash</li>'), `${what}: unreleased`);
    assert.ok(!html.includes('<li>Project skeleton</li>'), `${what}: a released version is not unreleased`);
  }
  assert.equal(en, tr, 'the whole dashboard is the same');
});

test('AC-48.2 dashboard: the active phase is found for a "Faz 1" or "Phase 1" value under either roadmap heading', () => {
  for (const v of ['tr', 'en']) {
    for (const value of ['Faz 1 — Core', 'Phase 1 — Core', 'Phase 1']) {
      const files = allFiles(v);
      files['docs/workflow/progress.md'] = PROGRESS[v].replace('Faz 1 — Core', value);
      const html = dashboard(project(files));
      assert.equal(activeStep(html), '1', `${v} roadmap, active phase "${value}": stage strip`);
      assert.deepEqual(openPhase(html), ['Phase 1 — Core (the must-haves of the MVP)'], `${v} roadmap, active phase "${value}": open phase card`);
    }
  }
});

test('AC-48.2 dashboard: English board verdicts (APPROVE / CONDITIONAL / REJECT) count like the Turkish ones', () => {
  const rows = MEETINGS_TR_RESULTS.map((r) => r.replace('KOŞULLU ONAY', 'CONDITIONAL').replace('| KOŞULLU |', '| CONDITIONAL |')
    .replace('| ONAY |', '| APPROVE |').replace('RET —', 'REJECT —'));
  const files = allFiles('en');
  files['docs/workflow/board.md'] = board(BOARD_EN, rows);
  const html = dashboard(project(files));
  assert.deepEqual(summaryKpis(html), ['4', '1', '%25'], 'meetings, rejects, approval rate');
  assert.match(html, /The board rejected \(task, G-010\)/, 'an unanswered REJECT raises the critical alert');
});

test('A-48.7 dashboard: old Turkish meeting results ONAY / KOŞULLU ONAY / RET still count right', () => {
  for (const v of ['tr', 'en']) {
    const html = dashboard(project(allFiles(v)));
    assert.deepEqual(summaryKpis(html), ['4', '1', '%25'], `${v}: KOŞULLU ONAY and KOŞULLU are not rejects, only ONAY is an approval`);
    assert.match(html, /The board rejected \(task, G-010\)/, `${v}: an unanswered RET raises the critical alert`);
  }
});

test('A-48.7 dashboard: a verdict whose note contains "RET" letters (SECRET, interpret) is not a reject', () => {
  const rows = ['| 1 | 2026-10-20 | task | G-001 | QA | ONAY — SECRET key rotated | - |  |', '| 2 | 2026-10-21 | task | G-002 | QA | APPROVE — interpret logs later | - |  |'];
  for (const [v, labels] of [['tr', BOARD_TR], ['en', BOARD_EN]]) {
    const files = allFiles(v);
    files['docs/workflow/board.md'] = board(labels, rows);
    const html = dashboard(project(files));
    assert.deepEqual(summaryKpis(html), ['2', '0', '%100'], v);
    assert.doesNotMatch(html, /The board rejected/, `${v}: no reject alert`);
  }
});

// ---------- gate.mjs: the Commands block and the approval digest ----------

test('AC-48.2 gate readCommands: "## Commands" with lint / type check / test is read under English names', () => {
  assert.deepEqual(readCommands(AGENTS.en), [
    { name: 'lint', command: CMD.lint }, { name: 'type check', command: CMD.typeCheck }, { name: 'test', command: CMD.test },
  ]);
});

test('AC-48.2 gate approvedCommands: a Turkish and an English AGENTS.md give the same list (lint, type check, test, dev, preview)', () => {
  const want = [
    { name: 'lint', command: CMD.lint }, { name: 'type check', command: CMD.typeCheck }, { name: 'test', command: CMD.test },
    { name: 'dev', command: CMD.dev }, { name: 'preview', command: CMD.preview },
  ];
  assert.deepEqual(approvedCommands(project({ 'AGENTS.md': AGENTS.tr })), want);
  assert.deepEqual(approvedCommands(project({ 'AGENTS.md': AGENTS.en })), want);
});

// Exactly what 3.47.1 gate.mjs wrote: sha256 of the [name, command] pairs with the Turkish names, in this order
const digest347 = (c) => crypto.createHash('sha256')
  .update(JSON.stringify([['lint', c.lint], ['tip kontrol', c.typeCheck], ['test', c.test], ['geliştirme', c.dev], ['önizleme', c.preview]])).digest('hex');

test('AC-48.2 gate digest: a 3.47.1 approval stays valid after AGENTS.md labels turn English; a changed command invalidates it', () => {
  const p = project({ 'AGENTS.md': AGENTS.tr });
  const file = approvalPath(p);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ digest: digest347(CMD), commands: [], date: '2026-10-20T10:00:00.000Z' }, null, 2));
    assert.equal(isApproved(p), true, 'Turkish AGENTS.md, 3.47.1 approval');
    fs.writeFileSync(path.join(p, 'AGENTS.md'), AGENTS.en);
    assert.deepEqual(approvedCommands(p).map((k) => k.command), [CMD.lint, CMD.typeCheck, CMD.test, CMD.dev, CMD.preview], 'English commands are read');
    assert.equal(isApproved(p), true, 'English labels, same commands: still approved');
    for (const key of Object.keys(CMD)) {
      fs.writeFileSync(path.join(p, 'AGENTS.md'), agents(AGENTS_EN_KEYS, { ...CMD, [key]: `${CMD[key]} --changed` }));
      assert.equal(isApproved(p), false, `English AGENTS.md, ${key} changed`);
      fs.writeFileSync(path.join(p, 'AGENTS.md'), agents(AGENTS_TR_KEYS, { ...CMD, [key]: `${CMD[key]} --changed` }));
      assert.equal(isApproved(p), false, `Turkish AGENTS.md, ${key} changed`);
    }
    // A new approval written from the English file is the same digest 3.47.1 would write, so the Turkish file stays approved
    fs.writeFileSync(path.join(p, 'AGENTS.md'), AGENTS.en);
    approve(p);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).digest, digest347(CMD));
    fs.writeFileSync(path.join(p, 'AGENTS.md'), AGENTS.tr);
    assert.equal(isApproved(p), true);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('AC-48.2 gate --run: an English Commands block runs lint, type check and test', () => {
  const p = project({ 'AGENTS.md': AGENTS.en });
  const env = { ...process.env, CLAUDE_PROJECT_DIR: p, SEMGREP: 'olmayan-semgrep-komutu' };
  const gate = (a) => spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), a], { cwd: p, encoding: 'utf8', env });
  try {
    assert.equal(gate('--approve').status, 0);
    const r = gate('--run');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /✅ lint/);
    assert.match(r.stdout, /✅ type check/);
    assert.match(r.stdout, /✅ test/);
  } finally {
    fs.rmSync(approvalPath(p), { force: true });
  }
});

// ---------- commit-gate.mjs: commit review off ----------

test('AC-48.2 commit gate: "**Commit review:** off" exempts like "**Commit denetimi:** kapalı"; on / açık do not', () => {
  const p = project({ '.claude/agents/board-qa.md': '---\nname: board-qa\n---\n', 'a.js': 'x', 'docs/workflow/board.md': '**Commit review:** on\n' });
  const sh = (c) => execSync(c, { cwd: p, stdio: 'ignore' });
  sh('git init -q && git config user.email t@t && git config user.name t && git add . && git commit -qm init');
  fs.writeFileSync(path.join(p, 'b.js'), 'code');
  sh('git add b.js');
  const door = () => spawnSync(process.execPath, [path.join(HOOKS, 'commit-gate.mjs')],
    { input: JSON.stringify({ tool_input: { command: 'git commit -m x' } }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  for (const [board, status] of [['**Commit review:** off', 0], ['**Commit denetimi:** kapalı', 0], ['**Commit review:** on', 2], ['**Commit denetimi:** açık', 2]]) {
    fs.writeFileSync(path.join(p, 'docs/workflow/board.md'), `**Status:** set up\n${board}\n`);
    const r = door();
    assert.equal(r.status, status, `${board}: ${r.stderr}`);
  }
});

// ---------- a half-migrated project ----------

test('A-48.3 a half-migrated project (progress EN, board TR, roadmap mixed, AGENTS TR) reads the same as a fully Turkish one', () => {
  const tr = project(allFiles('tr'));
  const mixedFiles = { ...allFiles('tr'), 'docs/workflow/progress.md': PROGRESS.en, 'docs/product/roadmap.md': ROADMAP.mixed, 'docs/workflow/handoff.md': HANDOFF.en };
  const mixed = project(mixedFiles);
  assert.deepEqual(pick(readStatus(mixed)), STATUS_WANT);
  assert.deepEqual(readStatus(mixed), readStatus(tr));
  assert.deepEqual(approvedCommands(mixed), approvedCommands(tr));
  assert.deepEqual(approvedCommands(mixed).map((k) => k.name), ['lint', 'type check', 'test', 'dev', 'preview']);
  assert.equal(dashboard(mixed), dashboard(tr));
});

// ---------- status line and session start (built on readStatus) ----------

const EN_PROJECT = () => project({
  ...statusFiles('en'),
  'docs/workflow/progress.md': PROGRESS.en.replace('Faz 1 — Core', 'Phase 1 — Core').replace('açık · kapalı konular: tasarim', 'on · closed topics: none'),
});

test('AC-48.2 statusline: an all-English progress.md shows the phase, the task and the roadmap count', () => {
  const p = EN_PROJECT();
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'statusline.mjs')], { input: JSON.stringify({ workspace: { project_dir: p } }), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /▶ Phase 1 — Core · G-011 data model · task 3\/4/);
});

test('AC-48.2 session-start: an all-English progress.md gives the phase, the task and the next roadmap task', () => {
  const p = EN_PROJECT();
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'session-start.mjs')], {
    input: '{}', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, HOME: p, USERPROFILE: p }, // not the developer's preferences
  });
  assert.equal(r.status, 0, r.stderr);
  const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /Phase: Phase 1 — Core · Task: G-011 data model/);
  assert.match(context, /Next: \/build G-011 · Data model/);
  assert.match(context, /Where we left off: G-011 migration half written/);
  assert.match(context, /Pending decisions: Postgres or SQLite\?/);
});
