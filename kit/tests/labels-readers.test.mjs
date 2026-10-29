// Run: node --test "kit/tests/*.test.mjs"
// The hooks that read project files read English labels. 3.49.0: a Turkish label (pre-3.48 projects) is no longer
// understood: each reader returns what it returns when the label is missing, never a translated value.
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

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(REPO, '.claude', 'hooks');
const lines = (...a) => a.join('\n');
const made = [];
const approvals = [];
after(() => {
  for (const f of approvals) fs.rmSync(f, { force: true });
  for (const p of made) fs.rmSync(p, { recursive: true, force: true });
});

function project(files) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'labels-readers-'));
  made.push(p);
  approvals.push(approvalPath(p));
  for (const [f, s] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    fs.writeFileSync(path.join(p, f), typeof s === 'string' ? s : JSON.stringify(s));
  }
  return p;
}

// ---------- fixtures: English, and a Turkish twin (labels only) that must NOT be understood ----------

const progressDoc = (L) => lines('# Progress', '',
  `**${L.lastUpdated}:** 2026-10-27`,
  `**${L.activePhase}:** Phase 1 — Core`,
  `**${L.activeTask}:** G-011 data model`,
  `**${L.setupStep}:** 9/9`,
  `**${L.questionMode}:** on · closed topics: design`,
  `**${L.profile}:** Standard`, '',
  `## ${L.currentState}`, '', '> template note', 'Sign-in works.', 'Data model is next.', '',
  `## ${L.doneLastSession}`, '', '- G-010 auth finished', '- CI set up', '',
  `## ${L.nextStep}`, '', '1. `/build G-011` data model', '',
  `## ${L.pendingDecisions}`, '', '- Postgres or SQLite?', '',
  `## ${L.whereWeLeftOff} (if stopped because of a limit or midway)`, '', '- G-011 migration half written', '',
  `## ${L.openIssues}`, '', '- CI is slow', '',
  '## Watch out (notes for the AI)', '', '- keep it small', '');
const P_EN = { lastUpdated: 'Last updated', activePhase: 'Active phase', activeTask: 'Active task', setupStep: 'Setup step', questionMode: 'Question mode',
  profile: 'Profile', currentState: 'Current state', doneLastSession: 'Done last session', nextStep: 'Next step', pendingDecisions: 'Pending decisions',
  whereWeLeftOff: 'Where we left off', openIssues: 'Open issues / blockers' };
const P_TR = { lastUpdated: 'Son güncelleme', activePhase: 'Aktif faz', activeTask: 'Aktif görev', setupStep: 'Başlangıç adımı', questionMode: 'Soru modu',
  profile: 'Profil', currentState: 'Şu anki durum', doneLastSession: 'Son oturumda yapılanlar', nextStep: 'Sıradaki adım', pendingDecisions: 'Bekleyen kararlar',
  whereWeLeftOff: 'Kaldığı yer', openIssues: 'Açık sorunlar / bloklayıcılar' };
const PROGRESS = { en: progressDoc(P_EN), tr: progressDoc(P_TR) };

const roadmap = (h) => lines('# Roadmap', '', '> Phase headings keep the word "Phase": the dashboard reads it.', '',
  `## ${h} 0 — Setup (skeleton)`, '', '- [x] G-001: Repo ready — done when: first commit', '- [x] G-002: Skeleton runs — done when: dev starts', '',
  `## ${h} 1 — Core (the must-haves of the MVP)`, '', '- [x] G-010: Auth — done when: sign in works', '- [ ] G-011: Data model — done when: migration runs', '',
  '## Idea pool (not planned)', '', '- [ ] Dark mode', '');
const ROADMAP = { en: roadmap('Phase'), tr: roadmap('Faz') };

const decisions = (h) => lines('# Decisions', '', `## ${h}`, '', '`/dashboard` reads this table; do not change the columns.', '',
  '| # | Date | Stage | Topic | Question | Chosen | Door | Decided by |', '|---|---|---|---|---|---|---|---|',
  '| 1 | 2026-10-26 | Phase 0 | tech | Database? | Postgres | one-way | user |',
  '| 2 | 2026-10-27 | Phase 1 | design | Font? | Inter | two-way | automatic |', '',
  '## ADR list', '', '| ADR | Title | Status | Log no |', '|---|---|---|---|', '| 0001 | Postgres | accepted | 1 |', '');
const DECISIONS = { en: decisions('Decision log'), tr: decisions('Karar günlüğü') };

const MEETINGS = [
  '| 1 | 2026-10-20 | task | G-001 | QA | APPROVE | - | - |',
  '| 2 | 2026-10-21 | task | G-002 | QA | CONDITIONAL (1 condition) | - | fixed |',
  '| 3 | 2026-10-22 | task | G-010 | QA | REJECT — no test | missing test |  |',
  '| 4 | 2026-10-23 | phase | Phase 0 | QA | CONDITIONAL | - | accepted |',
];
const board = ({ status, review, members, log }, rows = MEETINGS) => lines('# Expert Board', '',
  '> The `/dashboard` and the session-start note read the **bold-labeled** lines below; do not break their format.', '',
  `**${status}:** set up`, `**${review}:** on`, '',
  `## ${members}`, '', '| Member | Agent | Model | Focus | Meetings |', '|---|---|---|---|---|', '| QA | board-qa | sonnet | tests | 4 |', '',
  `## ${log}`, '', '| # | Date | Type | Scope | Attendees | Result | Critical | User decision |', '|---|---|---|---|---|---|---|---|', ...rows, '');
const BOARD_EN = { status: 'Status', review: 'Commit review', members: 'Members', log: 'Meeting log' };
const BOARD_TR = { status: 'Durum', review: 'Commit denetimi', members: 'Üyeler', log: 'Toplantı günlüğü' };
const BOARD = { en: board(BOARD_EN), tr: board(BOARD_TR) };

const HANDOFF = {
  en: lines('# Handoff note', '', '**Status:** waiting', '**Date:** 2026-10-27', '', '## Where we left off', '- G-011', ''),
  tr: lines('# Handoff note', '', '**Durum:** waiting', '**Date:** 2026-10-27', '', '## Where we left off', '- G-011', ''),
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
const AGENTS_EN_KEYS = { heading: 'Commands', dev: 'dev:', preview: 'preview:', typeCheck: 'type check:' };
const AGENTS_TR_KEYS = { heading: 'Komutlar', dev: 'geliştirme:', preview: 'önizleme:', typeCheck: 'tip kontrol:' };
const AGENTS = { en: agents(AGENTS_EN_KEYS), tr: agents(AGENTS_TR_KEYS) };

const prd = (priority, outOfScope) => lines('# PRD', '', '## 1. Problem', '', 'Invoices take too long.', '',
  '## 5. MVP scope', '', '### AC-01: Invoice list', '', '- [x] AC-01.1: List shows invoices', '- [ ] AC-01.2: Empty list message', '', `**${priority}:** Must have`, '',
  '### AC-02: PDF export', '', '- [ ] AC-02.1: PDF downloads', '', `**${priority}:** Nice to have`, '',
  `## 6. ${outOfScope} (out of scope: NOT built in this release)`, '', '- Native mobile app', '- Multi-currency', '',
  '## 7. Main user flows', '', '- sign in, list, export', '');
const PRD = { en: prd('Priority', 'Out of scope'), tr: prd('Öncelik', 'Kapsam dışı') };

const stack = (h) => lines('# Stack', '', `## ${h}`, '', '> /start fills this in.', '', '| Layer | Choice | Note |', '|---|---|---|',
  '| Framework | Next.js | |', '| Database | Postgres | |', '');
const STACK = { en: stack('Chosen technologies'), tr: stack('Seçilen teknolojiler') };

const maintenance = (h) => lines('# Maintenance', '', `## ${h}`, '', '| Date | Type | Findings | Done / task opened |', '|---|---|---|---|',
  '| 2026-10-25 | weekly | 2 outdated packages | updated |', '');
const MAINTENANCE = { en: maintenance('Maintenance log'), tr: maintenance('Bakım kaydı') };

const changelog = (h) => lines('# Changelog', '', `## [${h}]`, '', '### Added', '- Invoice PDF export', '', '### Fixed', '- Empty list crash', '',
  '## [0.1.0] - 2026-10-01', '', '### Added', '- Project skeleton', '');
const CHANGELOG = { en: changelog('Unreleased'), tr: changelog('Yayınlanmamış') };

const flagDoc = (h) => lines('# Feature flags', '', `## ${h}`, '', 'The `/dashboard` dashboard reads this table.', '',
  '| Flag | Purpose | Status | Owner | Added | Removal date | Kill switch tested |', '|---|---|---|---|---|---|---|',
  '| new_pdf | pdf export | on | me | 2026-09-01 | 2026-10-01 | yes |', '| beta_list | list | off | me | 2026-10-01 | 2026-12-31 | no |', '',
  '## Rules', '', '- remove after launch', '');
const FLAGS = { en: flagDoc('Flags'), tr: flagDoc('Bayraklar') };

const UNIT = {
  en: lines('# Unit economics', '', '## Inputs', '', '**Currency:** TL', '**Price (per user, monthly):** 200', '**Payment fee (%):** 5',
    '**Fixed monthly cost:** 1500', '**Variable cost per user (monthly):** 20', '**Target active users:** 100', '**Free user share (%):** 50', ''),
  tr: lines('# Unit economics', '', '## Inputs', '', '**Para birimi:** TL', '**Fiyat (kullanıcı başı aylık):** 200', '**Ödeme komisyonu (%):** 5',
    '**Sabit aylık maliyet:** 1500', '**Kullanıcı başı değişken maliyet (aylık):** 20', '**Hedef aktif kullanıcı:** 100', '**Ücretsiz kullanıcı oranı (%):** 50', ''),
};

const learningDoc = (h) => lines('# Learning', '', `## ${h}`, '', '| Date | Task | Concept | Result |', '|---|---|---|---|',
  '| 2026-10-25 | G-01 | validation | right |', '| 2026-10-25 | G-01 | API | wrong |', '| 2026-10-26 | G-02 | API | wrong |', '');
const LEARNING = { en: learningDoc('Records'), tr: learningDoc('Kayıtlar') };

const metricsDoc = (h) => lines('# Metrics', '', '## Definitions', '', '- a', '', `## ${h}`, '',
  '| Period | Completed tasks | Avg. task duration (min) | Avg. limit cost (%) | Fix rate (%) | Rollbacks | Duplicate code (%) | Open critical | Acceptance tests (%) | Note |',
  '|---|---|---|---|---|---|---|---|---|---|', '| 2026-09 | 12 | 45 | 6 | 20 | 1 | 3 | 0 | 90 | |', '| 2026-10 | 15 | 40 | 5 | 15 | 0 | 2 | 1 | 95 | |', '');
const METRICS = { en: metricsDoc('Records'), tr: metricsDoc('Kayıtlar') };

const spec = (type, cls, keep, n) => lines(`# Spec: bug ${n}`, '', `**${type}:** bug`, `**${cls}:** authorization`, '**Rule:** [bug only]', '',
  '## Current behavior', '', '- another user can open the invoice', '', `## ${keep}`, '', `- AC-01.${n}: list stays sorted`, 'AC-01.9 in prose is not in list form', '');
const SPECS = {
  en: { 'docs/product/specs/2026-10-01-a.md': spec('Type', 'Class', 'Behavior that must not change', 1), 'docs/product/specs/2026-10-02-b.md': spec('Type', 'Class', 'Behavior that must not change', 2) },
  tr: { 'docs/product/specs/2026-10-01-a.md': spec('Tür', 'Sınıf', 'Değişmemesi gereken davranış', 1), 'docs/product/specs/2026-10-02-b.md': spec('Tür', 'Sınıf', 'Değişmemesi gereken davranış', 2) },
};

const KIT = { version: '3.49.0', type: 'web-saas', addons: [], tool: null, lang: 'en', created: '2026-10-01', updated: '2026-10-01', files: {} };
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
const openPhase = (html) => [...html.matchAll(/<details class="card phase" open>\s*<summary><b>([^<]*)<\/b>/g)].map((m) => m[1]);

// ---------- status-read: readStatus ----------

const STATUS_WANT = {
  fields: {
    'Last updated': '2026-10-27', 'Active phase': 'Phase 1 — Core', 'Active task': 'G-011 data model', 'Setup step': '9/9',
    'Question mode': 'on · closed topics: design', Profile: 'Standard',
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
    { no: '1', date: '2026-10-26', stage: 'Phase 0', topic: 'tech', question: 'Database?', chosen: 'Postgres', door: 'one-way', decidedBy: 'user' },
    { no: '2', date: '2026-10-27', stage: 'Phase 1', topic: 'design', question: 'Font?', chosen: 'Inter', door: 'two-way', decidedBy: 'automatic' },
  ],
  board: {
    state: 'set up', commitReview: 'on',
    members: [{ member: 'QA', agent: 'board-qa', model: 'sonnet', focus: 'tests', meetings: '4' }],
    meetings: [
      { no: '1', date: '2026-10-20', kind: 'task', scope: 'G-001', attendees: 'QA', result: 'APPROVE', critical: '-', decision: '-' },
      { no: '2', date: '2026-10-21', kind: 'task', scope: 'G-002', attendees: 'QA', result: 'CONDITIONAL (1 condition)', critical: '-', decision: 'fixed' },
      { no: '3', date: '2026-10-22', kind: 'task', scope: 'G-010', attendees: 'QA', result: 'REJECT — no test', critical: 'missing test', decision: '' },
      { no: '4', date: '2026-10-23', kind: 'phase', scope: 'Phase 0', attendees: 'QA', result: 'CONDITIONAL', critical: '-', decision: 'accepted' },
    ],
  },
};
const pick = (s) => Object.fromEntries(Object.keys(STATUS_WANT).map((k) => [k, s[k]]));

test('AC-48.2 readStatus: an English project gives keys, sections, Phase N names, decisions, board and handoff', () => {
  const en = readStatus(project(statusFiles('en')));
  assert.deepEqual(pick(en), STATUS_WANT);
  assert.equal(en.project, 'Demo Project');
});

test('AC-48.2 readStatus: no handoff waiting and no board file fall back to the defaults', () => {
  const files = statusFiles('en');
  files['docs/workflow/handoff.md'] = HANDOFF.en.replace('waiting', 'taken over');
  delete files['docs/workflow/board.md'];
  const s = readStatus(project(files));
  assert.equal(s.handoffPending, false);
  assert.deepEqual(s.board, { state: 'not set up', commitReview: 'on', members: [], meetings: [] });
});

test('AC-49.5 readStatus: Turkish progress, roadmap, decision log, board and handoff labels are not found (same as missing files)', () => {
  const tr = readStatus(project(statusFiles('tr')));
  const none = readStatus(project({ 'AGENTS.md': AGENTS.en, '.kit.json': KIT }));
  for (const k of ['state', 'lastSession', 'next', 'pending', 'issues', 'leftOff', 'handoffPending', 'phases', 'taskCount', 'decisions', 'board']) {
    assert.deepEqual(tr[k], none[k], `${k}: read like a missing file`);
  }
  for (const k of Object.keys(STATUS_WANT.fields)) assert.equal(tr.fields[k], undefined, `field "${k}" is not filled from a Turkish label`);
  assert.equal(tr.handoffPending, false, '"**Durum:** waiting" is not a waiting handoff');
  assert.deepEqual(tr.board, { state: 'not set up', commitReview: 'on', members: [], meetings: [] }, 'a Turkish board is not set up');
});

// ---------- dashboard-data: pure readers ----------

const NOW = Date.parse('2026-10-28T12:00:00');

test('AC-48.2 flags: "## Flags" reads the rows', () => {
  assert.deepEqual(flags(FLAGS.en, NOW).map((b) => [b.name, b.isOverdue, b.untested]), [['new_pdf', true, false], ['beta_list', false, true]]);
});

test('AC-48.2 unitEconomics: the English input labels give the numbers', () => {
  const en = unitEconomics(UNIT.en);
  assert.equal(en.currency, 'TL');
  assert.equal(en.margin, 170);
  assert.equal(en.breakEven, 10);
  assert.equal(unitEconomics('**Price (per user, monthly):** 0\n**Fixed monthly cost:** 0'), null, 'empty English input: no card');
});

test('AC-48.2 learning and metrics: "## Records" reads the table', () => {
  const l = learning(LEARNING.en);
  assert.deepEqual([l.right, l.wrong], [1, 2]);
  assert.deepEqual(metrics(METRICS.en).map((r) => [r.period, r.taskCount, r.acceptance]), [['2026-09', '12', '90'], ['2026-10', '15', '95']]);
});

test('AC-48.2 specInvariants: "## Behavior that must not change" lists the ids', () => {
  const en = specInvariants(project(SPECS.en));
  assert.deepEqual(en.invariants.map((k) => [k.spec, k.id, k.test, k.result]),
    [['2026-10-01-a.md', 'AC-01.1', false, null], ['2026-10-02-b.md', 'AC-01.2', false, null]]);
  assert.equal(en.unreadable.length, 2);
});

test('AC-48.2 repeatedBugClasses: "**Type:** bug" + "**Class:**" count', () => {
  assert.deepEqual(repeatedBugClasses(project(SPECS.en)), [{ cls: 'authorization', specs: ['2026-10-01-a.md', '2026-10-02-b.md'] }]);
});

test('AC-49.5 dashboard-data: Turkish flags, unit-economics, records, spec and bug-class labels are not found', () => {
  assert.deepEqual(flags(FLAGS.tr, NOW), flags('', NOW), 'flags: ## Bayraklar');
  assert.equal(unitEconomics(UNIT.tr), null, 'unit economics: Turkish input labels give no card');
  assert.deepEqual(learning(LEARNING.tr), learning(''), 'learning: ## Kayıtlar');
  assert.deepEqual(metrics(METRICS.tr), metrics(''), 'metrics: ## Kayıtlar');
  assert.deepEqual(specInvariants(project(SPECS.tr)), { invariants: [], unreadable: [] }, 'spec: ## Değişmemesi gereken davranış');
  assert.deepEqual(repeatedBugClasses(project(SPECS.tr)), [], 'bug class: **Tür:** / **Sınıf:**');
});

// ---------- dashboard.mjs ----------

test('AC-48.2 dashboard: priority, out of scope, chosen technologies, maintenance log and [Unreleased] read from English files', () => {
  const html = dashboard(project(allFiles('en')));
  assert.ok(html.includes('<span class="tag">Must have</span>'), 'priority');
  assert.ok(html.includes('<li>Native mobile app</li>') && html.includes('<li>Multi-currency</li>'), 'out of scope');
  assert.ok(html.includes('<dt>Framework</dt><dd>Next.js</dd>'), 'chosen technologies');
  assert.ok(html.includes('weekly: 2 outdated packages'), 'maintenance log');
  assert.ok(html.includes('<li>Invoice PDF export</li>') && html.includes('<li>Empty list crash</li>'), 'unreleased');
  assert.ok(!html.includes('<li>Project skeleton</li>'), 'a released version is not unreleased');
});

test('AC-49.5 dashboard: Turkish priority, out-of-scope, technology, maintenance, CHANGELOG and roadmap headings are not found', () => {
  const html = dashboard(project(allFiles('tr')));
  assert.equal(html.includes('<span class="tag">Must have</span>'), false, '**Öncelik:**');
  assert.equal(html.includes('<li>Native mobile app</li>'), false, '## 6. Kapsam dışı');
  assert.equal(html.includes('<dt>Framework</dt><dd>Next.js</dd>'), false, '## Seçilen teknolojiler');
  assert.equal(html.includes('weekly: 2 outdated packages'), false, '## Bakım kaydı');
  assert.equal(html.includes('<li>Invoice PDF export</li>'), false, '## [Yayınlanmamış]');
  assert.deepEqual(openPhase(html), [], '"## Faz N" is not a phase card');
  assert.equal(html.includes('Core (the must-haves of the MVP)'), false, 'no phase from a Faz heading');
});

test('AC-49.14 CHANGELOG: the shipped template heading is "## [Unreleased]" and the dashboard reads it', () => {
  const shipped = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(shipped, /^## \[Unreleased\]$/m);
  assert.doesNotMatch(shipped, /Yayınlanmamış/);
  const filled = shipped.replace(/^## \[Unreleased\]\n\n### Added\n- $/m, '## [Unreleased]\n\n### Added\n- Invoice PDF export');
  assert.notEqual(filled, shipped, 'the template has "## [Unreleased]" then "### Added" with an empty "- " item');
  const html = dashboard(project({ ...allFiles('en'), 'CHANGELOG.md': filled }));
  assert.ok(html.includes('<li>Invoice PDF export</li>'), 'the item under the shipped heading is shown');
});

test('AC-48.2 dashboard: the active phase is found for a "Phase 1" value under the Phase roadmap heading', () => {
  for (const value of ['Phase 1 — Core', 'Phase 1']) {
    const files = allFiles('en');
    files['docs/workflow/progress.md'] = PROGRESS.en.replace('Phase 1 — Core', value);
    const html = dashboard(project(files));
    assert.equal(activeStep(html), '1', `active phase "${value}": stage strip`);
    assert.deepEqual(openPhase(html), ['Phase 1 — Core (the must-haves of the MVP)'], `active phase "${value}": open phase card`);
  }
});

test('AC-48.2 dashboard: English board verdicts (APPROVE / CONDITIONAL / REJECT) count', () => {
  const html = dashboard(project(allFiles('en')));
  assert.deepEqual(summaryKpis(html), ['4', '1', '%25'], 'meetings, rejects, approval rate');
  assert.match(html, /The board rejected \(task, G-010\)/, 'an unanswered REJECT raises the critical alert');
});

test('A-49.1 dashboard: old Turkish meeting results ONAY / KOŞULLU ONAY / RET are neither approvals nor rejects', () => {
  const rows = ['| 1 | 2026-10-20 | task | G-001 | QA | ONAY | - | - |', '| 2 | 2026-10-21 | task | G-002 | QA | KOŞULLU ONAY (1 condition) | - | fixed |',
    '| 3 | 2026-10-22 | task | G-010 | QA | RET — no test | missing test |  |', '| 4 | 2026-10-23 | phase | Phase 0 | QA | KOŞULLU | - | accepted |'];
  const files = allFiles('en');
  files['docs/workflow/board.md'] = board(BOARD_EN, rows);
  const html = dashboard(project(files));
  assert.deepEqual(summaryKpis(html), ['4', '0', '%0'], 'no reject counted, no approval counted');
  assert.doesNotMatch(html, /The board rejected/, 'RET is not a reject alert');
});

test('A-48.7 dashboard: a verdict whose note contains "RET" letters (SECRET, interpret) is not a reject', () => {
  const rows = ['| 1 | 2026-10-20 | task | G-001 | QA | APPROVE — SECRET key rotated | - |  |', '| 2 | 2026-10-21 | task | G-002 | QA | APPROVE — interpret logs later | - |  |'];
  const files = allFiles('en');
  files['docs/workflow/board.md'] = board(BOARD_EN, rows);
  const html = dashboard(project(files));
  assert.deepEqual(summaryKpis(html), ['2', '0', '%100']);
  assert.doesNotMatch(html, /The board rejected/, 'no reject alert');
});

// ---------- gate.mjs: the Commands block and the approval digest ----------

test('AC-48.2 gate readCommands: "## Commands" with lint / type check / test is read under English names', () => {
  assert.deepEqual(readCommands(AGENTS.en), [
    { name: 'lint', command: CMD.lint }, { name: 'type check', command: CMD.typeCheck }, { name: 'test', command: CMD.test },
  ]);
});

test('AC-48.2 gate approvedCommands: an English AGENTS.md gives lint, type check, test, dev, preview', () => {
  assert.deepEqual(approvedCommands(project({ 'AGENTS.md': AGENTS.en })), [
    { name: 'lint', command: CMD.lint }, { name: 'type check', command: CMD.typeCheck }, { name: 'test', command: CMD.test },
    { name: 'dev', command: CMD.dev }, { name: 'preview', command: CMD.preview },
  ]);
});

test('AC-49.5 gate: a Turkish "## Komutlar" block is not read; no command is taken from it', () => {
  assert.deepEqual(readCommands(AGENTS.tr), [{ name: 'lint', command: null }, { name: 'type check', command: null }, { name: 'test', command: null }]);
  assert.deepEqual(approvedCommands(project({ 'AGENTS.md': AGENTS.tr })).map((k) => k.command), [null, null, null, null, null]);
  // English heading, Turkish keys: only the English keys count
  const mixed = agents({ ...AGENTS_TR_KEYS, heading: 'Commands' });
  assert.deepEqual(readCommands(mixed), [{ name: 'lint', command: CMD.lint }, { name: 'type check', command: null }, { name: 'test', command: CMD.test }]);
  assert.deepEqual(approvedCommands(project({ 'AGENTS.md': mixed })).map((k) => [k.name, k.command]),
    [['lint', CMD.lint], ['type check', null], ['test', CMD.test], ['dev', null], ['preview', null]]);
});

// What 3.49 writes: sha256 of the [name, command] pairs with the English names, in this order
const digestEn = (c) => crypto.createHash('sha256')
  .update(JSON.stringify([['lint', c.lint], ['type check', c.typeCheck], ['test', c.test], ['dev', c.dev], ['preview', c.preview]])).digest('hex');
// What 3.47.1 / 3.48 wrote: the same pairs under the Turkish names
const digest347 = (c) => crypto.createHash('sha256')
  .update(JSON.stringify([['lint', c.lint], ['tip kontrol', c.typeCheck], ['test', c.test], ['geliştirme', c.dev], ['önizleme', c.preview]])).digest('hex');

test('AC-49.8 gate digest: a new approval uses the English names; a changed command invalidates it', () => {
  const p = project({ 'AGENTS.md': AGENTS.en });
  const file = approvalPath(p);
  approve(p);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).digest, digestEn(CMD), 'digest over [lint, type check, test, dev, preview]');
  assert.equal(isApproved(p), true);
  for (const key of Object.keys(CMD)) {
    fs.writeFileSync(path.join(p, 'AGENTS.md'), agents(AGENTS_EN_KEYS, { ...CMD, [key]: `${CMD[key]} --changed` }));
    assert.equal(isApproved(p), false, `${key} changed`);
  }
});

test('A-49.2 gate digest: an approval written with the old Turkish-name digest is not valid; the gate asks again and runs nothing', () => {
  const marker = 'gate-ran.txt';
  const c = { ...CMD, test: `node -e "require('fs').writeFileSync('${marker}', 'x')"`, lint: `node -e "require('fs').writeFileSync('${marker}', 'x')"` };
  const p = project({ 'AGENTS.md': agents(AGENTS_EN_KEYS, c) });
  const file = approvalPath(p);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ digest: digest347(c), commands: [], date: '2026-10-20T10:00:00.000Z' }, null, 2));
  assert.equal(isApproved(p), false, 'a 3.48 approval does not cover the English digest');
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), '--run'], { cwd: p, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, SEMGREP: 'missing-semgrep-command' } });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /command approval needed/);
  assert.equal(fs.existsSync(path.join(p, marker)), false, 'no command ran');
});

const gateRun = (p) => {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: p, SEMGREP: 'missing-semgrep-command' };
  const gate = (a) => spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), a], { cwd: p, encoding: 'utf8', env });
  assert.equal(gate('--approve').status, 0);
  return gate('--run');
};

test('AC-48.2 gate --run: an English Commands block runs lint, type check and test', () => {
  const r = gateRun(project({ 'AGENTS.md': AGENTS.en }));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✅ lint/);
  assert.match(r.stdout, /✅ type check/);
  assert.match(r.stdout, /✅ test/);
});

test('AC-49.6 gate --run: an unknown key under "## Commands" (tip kontrol:, geliştirme:) is named in a warning, not silently ignored', () => {
  const md = lines('# X', '', '## Commands', '', '```bash', `lint:        ${CMD.lint}`, `tip kontrol: ${CMD.typeCheck}`, 'geliştirme:  node dev.mjs', '```', '');
  const r = gateRun(project({ 'AGENTS.md': md }));
  assert.match(r.stdout, /tip kontrol/, `the unknown key is named\n${r.stdout}`);
  assert.match(r.stdout, /geliştirme/, `every unknown key is named\n${r.stdout}`);
  assert.match(r.stdout, /✅ lint/, 'the known key still runs');
  assert.doesNotMatch(r.stdout, /✅ type check/, 'tip kontrol is not run as type check');
});

test('AC-49.6 gate --run: the shipped keys (dev, preview, test, lint, type check, build) and comments raise no unknown-key warning', () => {
  const r = gateRun(project({ 'AGENTS.md': AGENTS.en }));
  assert.equal(r.status, 0, r.stdout);
  for (const word of ['dev', 'preview', 'build', '/start']) assert.doesNotMatch(r.stdout, new RegExp(`(^|[^\\w/-])${word.replace('/', '\\/')}(?![\\w-])`, 'm'), `no warning names "${word}"\n${r.stdout}`);
});

test('AC-49.6 gate --run: an AGENTS.md without "## Commands" (a Turkish "## Komutlar" too) stays EMPTY as before, no command runs', () => {
  const marker = 'gate-ran.txt';
  const c = { ...CMD, test: `node -e "require('fs').writeFileSync('${marker}', 'x')"` };
  for (const md of [agents(AGENTS_TR_KEYS, c), '# X\n\nNo commands yet.\n']) {
    const p = project({ 'AGENTS.md': md });
    const r = gateRun(p);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /Result: EMPTY/);
    assert.equal(fs.existsSync(path.join(p, marker)), false, 'nothing ran');
    assert.doesNotMatch(r.stdout, /tip kontrol|geliştirme|önizleme/, 'keys outside "## Commands" are not reported');
  }
});

// ---------- commit-gate.mjs: commit review off ----------

function commitDoor() {
  const p = project({ '.claude/agents/board-qa.md': '---\nname: board-qa\n---\n', 'a.js': 'x', 'docs/workflow/board.md': '**Commit review:** on\n' });
  const sh = (c) => execSync(c, { cwd: p, stdio: 'ignore' });
  sh('git init -q && git config user.email t@t && git config user.name t && git add . && git commit -qm init');
  fs.writeFileSync(path.join(p, 'b.js'), 'code');
  sh('git add b.js');
  const door = () => spawnSync(process.execPath, [path.join(HOOKS, 'commit-gate.mjs')],
    { input: JSON.stringify({ tool_input: { command: 'git commit -m x' } }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  return { p, door };
}

test('AC-48.2 commit gate: "**Commit review:** off" exempts; on does not', () => {
  const { p, door } = commitDoor();
  for (const [line, status] of [['**Commit review:** off', 0], ['**Commit review:** on', 2]]) {
    fs.writeFileSync(path.join(p, 'docs/workflow/board.md'), `**Status:** set up\n${line}\n`);
    const r = door();
    assert.equal(r.status, status, `${line}: ${r.stderr}`);
  }
});

test('A-49.3 commit gate: "**Commit denetimi:** kapalı" and "**Commit review:** kapalı" no longer exempt a commit', () => {
  const { p, door } = commitDoor();
  for (const line of ['**Commit denetimi:** kapalı', '**Commit review:** kapalı', '**Commit denetimi:** off', '**Commit denetimi:** açık']) {
    fs.writeFileSync(path.join(p, 'docs/workflow/board.md'), `**Status:** set up\n${line}\n`);
    const r = door();
    assert.equal(r.status, 2, `${line}: the board must review: ${r.stderr}`);
  }
});

test('AC-49.7 commit gate: the review instruction names REJECT, not the old RET', () => {
  const { p, door } = commitDoor();
  fs.writeFileSync(path.join(p, 'docs/workflow/board.md'), '**Status:** set up\n**Commit review:** on\n');
  const r = door();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /the board has not reviewed these changes/);
  assert.match(r.stderr, /\bREJECT\b/);
  assert.doesNotMatch(r.stderr, /\bRET\b/);
});

// ---------- status line and session start (built on readStatus) ----------

function statusline(p) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'statusline.mjs')], { input: JSON.stringify({ workspace: { project_dir: p } }), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
function sessionContext(p) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'session-start.mjs')], {
    input: '{}', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, HOME: p, USERPROFILE: p }, // not the developer's preferences
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
}

test('AC-48.2 statusline: an English progress.md shows the phase, the task and the roadmap count', () => {
  assert.match(statusline(project(statusFiles('en'))), /▶ Phase 1 — Core · G-011 data model · task 3\/4/);
});

test('AC-49.5 statusline: a Turkish progress.md is not read (no phase, no task from it)', () => {
  const out = statusline(project({ ...statusFiles('en'), 'docs/workflow/progress.md': PROGRESS.tr }));
  assert.doesNotMatch(out, /G-011 data model/, out);
  assert.doesNotMatch(out, /Phase 1 — Core/, out);
});

test('AC-48.2 session-start: an English progress.md gives the phase, the task and the next roadmap task', () => {
  const context = sessionContext(project(statusFiles('en')));
  assert.match(context, /Phase: Phase 1 — Core · Task: G-011 data model/);
  assert.match(context, /Next: \/build G-011 · Data model/);
  assert.match(context, /Where we left off: G-011 migration half written/);
  assert.match(context, /Pending decisions: Postgres or SQLite\?/);
});

test('AC-49.5 session-start: a Turkish progress.md is not read; phase and task stay unset', () => {
  const context = sessionContext(project({ ...statusFiles('en'), 'docs/workflow/progress.md': PROGRESS.tr }));
  assert.match(context, /Phase: - · Task: - · Question mode: on · Board:/);
  assert.doesNotMatch(context, /Where we left off: G-011/);
  assert.doesNotMatch(context, /Pending decisions: Postgres/);
});
