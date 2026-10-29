// Run: node --test "kit/tests/*.test.mjs"
// Label VALUES are English (on, off, not set up, passed ...). 3.49.0: hooks read English only. labels.mjs has VALUES and
// isValue() for English values; a Turkish value or heading (açık, kurulmadı, ## Hesaplar ...) is not understood any more.
// qa-report writes English values; the dashboard's internal ids carry no Turkish word.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as labels from '../../.claude/hooks/labels.mjs';
import { readStatus } from '../../.claude/hooks/status-read.mjs';
import { accounts, feedback, learning, qaSummary, findingReports, spendAlarms, flags, repeatedBugClasses, FINDING_KINDS } from '../../.claude/hooks/dashboard-data.mjs';
import { LIGHT_COMMANDS } from '../../.claude/hooks/tools.mjs';
import { t } from '../../.claude/hooks/lang.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');
const lines = (...a) => a.join('\n');
const made = [];
after(() => { for (const p of made) fs.rmSync(p, { recursive: true, force: true }); });

function project(files) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'labels-values-'));
  made.push(p);
  for (const [f, s] of Object.entries(files)) {
    if (s == null) continue;
    fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    fs.writeFileSync(path.join(p, f), typeof s === 'string' ? s : JSON.stringify(s));
  }
  return p;
}

const NOW = Date.parse('2026-10-28T12:00:00');
// A date relative to the real clock (dashboard.mjs uses Date.now())
const day = (offset) => new Date(Date.now() + offset * 864e5).toLocaleDateString('sv-SE');
const crlfBom = (s) => `\uFEFF${s.replace(/\n/g, '\r\n')}`;

const valuesApi = () => {
  assert.equal(typeof labels.isValue, 'function', 'labels.mjs exports isValue(text, key)');
  return labels;
};

// ---------- the value dictionary: key, English value, and the old Turkish value that no longer counts ----------

const VALUE_PAIRS = [
  ['on', 'on', 'açık'], ['off', 'off', 'kapalı'], ['none', 'none', 'yok'], ['setup', 'Setup', 'Başlangıç'],
  ['notSetUp', 'not set up', 'kurulmadı'], ['setUp', 'set up', 'kuruldu'], ['full', 'Full', 'Tam'], ['light', 'Light', 'Hafif'],
  ['standard', 'Standard', 'Standart'], ['waiting', 'waiting', 'bekliyor'], ['automatic', 'automatic', 'otomatik'], ['user', 'user', 'kullanıcı'],
  ['oneWay', 'one-way', 'tek'], ['twoWay', 'two-way', 'çift'], ['yes', 'yes', 'evet'], ['no', 'no', 'hayır'], ['right', 'right', 'doğru'],
  ['wrong', 'wrong', 'yanlış'], ['passed', 'passed', 'geçti'], ['failed', 'failed', 'kaldı'], ['notRun', 'not run', 'koşulmadı'],
  ['bug', 'bug', 'hata'], ['feature', 'feature', 'özellik'],
];
const V = Object.fromEntries(VALUE_PAIRS.map(([k, en]) => [k, en]));

// ---------- 1. isValue ----------

test('Ö-48.12 isValue: the English value matches, case-insensitive, trimmed', () => {
  const { isValue } = valuesApi();
  for (const [key, en] of VALUE_PAIRS) {
    for (const text of [en, en.toUpperCase(), en.toLowerCase(), en[0].toUpperCase() + en.slice(1), `  ${en}  `, `\t${en}\n`]) {
      assert.equal(isValue(text, key), true, `${JSON.stringify(text)} is ${key}`);
    }
  }
  // English words with I: a Turkish-locale lowercasing would give "faıled", "waıtıng"
  for (const [text, key] of [['FAILED', 'failed'], ['WAITING', 'waiting'], ['LIGHT', 'light'], ['NOT SET UP', 'notSetUp'], ['Not Set Up', 'notSetUp'],
    ['NOT RUN', 'notRun'], ['ONE-WAY', 'oneWay'], ['FULL', 'full'], ['YES', 'yes'], ['RIGHT', 'right'], ['ON', 'on']]) {
    assert.equal(isValue(text, key), true, `${text} is ${key}`);
  }
});

test('Ö-48.12 isValue: the value followed by a non-letter matches (the rest of the line is a note)', () => {
  const { isValue } = valuesApi();
  for (const [text, key] of [
    ['on · closed topics: none', 'on'], ['off · closed topics: design', 'off'], ['Setup (adopt)', 'setup'], ['yes (2026-10-01)', 'yes'],
    ['Full (all commands)', 'full'], ['Full — every command', 'full'], ['failed: timeout', 'failed'], ['one-way door', 'oneWay'],
    ['not set up yet', 'notSetUp'], ['not set up.', 'notSetUp'], ['set up 2026-10-20', 'setUp'], ['waiting — Ali', 'waiting'], ['bug/regression', 'bug'],
  ]) {
    assert.equal(isValue(text, key), true, `${JSON.stringify(text)} is ${key}`);
  }
});

test('AC-49.3 isValue: an old Turkish value never matches its key, in any case or with a note after it', () => {
  const { isValue } = valuesApi();
  for (const [key, , tr] of VALUE_PAIRS) {
    for (const text of [tr, tr.toLocaleUpperCase('tr'), tr.toUpperCase(), tr.toLocaleLowerCase('tr'), `  ${tr}  `, `${tr} · note`, `${tr} (x)`]) {
      assert.equal(isValue(text, key), false, `${JSON.stringify(text)} is not ${key}`);
    }
  }
  for (const [text, key] of [['açık · kapalı konular: yok', 'on'], ['AÇIK', 'on'], ['KAPALI', 'off'], ['Başlangıç (uyum)', 'setup'],
    ['evet, 2026-10-01', 'yes'], ['kaldı: zaman aşımı', 'failed'], ['tek yönlü', 'oneWay'], ['hata/regresyon', 'bug'], ['reddedildi', 'rejected'],
    ['yeni', 'new'], ['planlandı', 'planned'], ['yapıldı', 'done'], ['birleşti', 'merged'], ['istek', 'request'], ['şikayet', 'complaint'],
    ['övgü', 'praise'], ['soru', 'question']]) {
    assert.equal(isValue(text, key), false, `${JSON.stringify(text)} is not ${key}`);
  }
});

test('Ö-48.13 isValue: an unknown key throws like label(); a non-string text is false', () => {
  const { isValue } = valuesApi();
  for (const bad of ['nope', '', 'On', 'açık', 'toString', '__proto__', 'constructor', 'hasOwnProperty']) {
    assert.throws(() => isValue('on', bad), undefined, `key ${JSON.stringify(bad)}`);
  }
  for (const text of [null, undefined, 42, true, {}, ['on'], { toString: () => 'on' }]) {
    assert.equal(isValue(text, 'on'), false, `${JSON.stringify(text)} is not on`);
  }
  for (const text of ['', '   ', '\t\n']) {
    for (const [key] of VALUE_PAIRS) assert.equal(isValue(text, key), false, `${JSON.stringify(text)} is not ${key}`);
  }
});

test('A-48.9 isValue: a value inside a longer word, the reverse prefix and the "not set up" / "set up" trap do not match', () => {
  const { isValue } = valuesApi();
  for (const [text, key] of [
    ['not set up', 'setUp'], ['Not set up yet', 'setUp'], ['set up', 'notSetUp'],
    ['one-way', 'on'], ['once', 'on'], ['online', 'on'], ['offline', 'off'],
    ['nonetheless', 'none'], ['none', 'no'], ['not run', 'no'], ['not set up', 'no'], ['nothing', 'no'],
    ['Fullstack', 'full'], ['Lightweight', 'light'], ['Standardize', 'standard'],
    ['waitinglist', 'waiting'], ['automatically', 'automatic'], ['auto', 'automatic'],
    ['users', 'user'], ['two-way', 'oneWay'], ['one-way', 'twoWay'],
    ['yesterday', 'yes'], ['rightly', 'right'], ['wrongly', 'wrong'],
    ['passedby', 'passed'], ['failed', 'passed'], ['failedover', 'failed'], ['passed', 'failed'],
    ['not running', 'notRun'], ['bugfix', 'bug'], ['features', 'feature'],
    ['Setups', 'setup'], ['- on', 'on'], ['(on)', 'on'], ['the value is on', 'on'],
  ]) {
    assert.equal(isValue(text, key), false, `${JSON.stringify(text)} is not ${key}`);
  }
});

// ---------- 2. readers ----------

const accountsDoc = (heading, no, yes) => lines('# Accounts and Deadlines', '', '> Dates use the YYYY-MM-DD format.', '', `## ${heading}`, '',
  '| Service | Purpose | Account owner | 2FA | Plan / monthly cost | Expiry / renewal | Key rotation | Note |', '|---|---|---|---|---|---|---|---|',
  '| [GitHub] | Code repository | [email] | [yes/no] | [Free] | - | - | |',
  `| Domain | site | me | ${no} | 300 TL/yr | 2026-11-07 | - | auto-renew? |`,
  `| GitHub | code | me | ${yes} | Free | - | 2026-10-25 | |`,
  `| OpenAI | ai | me | ${yes} | usage | 2026-12-31 | 2026-11-20 | Spend limit: 50 USD |`, '',
  '## Environments (dev / prod)', '', '| Environment | Service | Project ref / URL | Who connects |', '|---|---|---|---|', '| dev | Supabase | devref | local |', '');
const ACCOUNTS = accountsDoc('Accounts', 'no', 'yes');

test('Ö-48.14 accounts: "## Accounts" with no / yes reads 2FA, expiry and key rotation', () => {
  assert.deepEqual(accounts(ACCOUNTS, NOW).map((h) => [h.service, h.noTwoFactor, h.dates.map((d) => [d.date, d.left])]), [
    ['Domain', true, [['2026-11-07', 10]]], ['GitHub', false, [['2026-10-25', -3]]], ['OpenAI', false, [['2026-12-31', 64], ['2026-11-20', 23]]],
  ]);
  // A Turkish 2FA answer is not an answer: "hayır" does not mean "no 2FA", "evet" does not mean "has 2FA"
  assert.deepEqual(accounts(accountsDoc('Accounts', 'hayır', 'evet'), NOW).map((h) => h.noTwoFactor), [false, false, false]);
});

const FB_ROWS = [[1, 'bug', 'new', 'speed'], [2, 'request', 'planned', 'PDF'], [3, 'complaint', 'done', 'speed'], [4, 'praise', 'rejected', 'PDF'],
  [5, 'question', 'merged', 'PDF'], [6, 'bug', 'new', 'PDF']];
const FB_TR = { new: 'yeni' };
const feedbackDoc = (inbox, themes, rows) => lines('# User Feedback', '', '> The voice of the users.', '', `## ${inbox}`, '',
  'Types and statuses are listed in the template.', '',
  '| # | Date | Source | User | Summary | Type | Theme | Priority | Status | Task |', '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(([no, kind, state, theme]) => `| ${no} | 2026-10-0${no} | email | K-00${no} | summary ${no} | ${kind} | ${theme} | high | ${state} | |`), '',
  `## ${themes}`, '', 'Similar feedback is collected under one theme.', '',
  '| Theme | Feedback count | Affected feature | Decision |', '|---|---|---|---|', '| speed | 2 | list | |', '| PDF | 5 | invoice | G-030 |', '');
const FEEDBACK = feedbackDoc('Inbox', 'Themes', FB_ROWS);

test('Ö-48.15 feedback: "## Inbox" / "## Themes" with English kinds and statuses', () => {
  const en = feedback(FEEDBACK);
  assert.equal(en.records.length, 6);
  assert.equal(en.newCount, 2, 'new counts as new');
  assert.deepEqual(en.themes.map((x) => [x.theme, x.count]), [['PDF', 5], ['speed', 2]]);
  // The old Turkish status "yeni" is not new
  const tr = feedback(feedbackDoc('Inbox', 'Themes', FB_ROWS.map(([no, kind, state, theme]) => [no, kind, FB_TR[state] ?? state, theme])));
  assert.equal(tr.newCount, 0, 'yeni is not new');
});

const learningDoc = (h, right, wrong, skipped) => lines('# Learning', '', `## ${h}`, '', '| Date | Task | Concept | Result |', '|---|---|---|---|',
  `| 2026-10-25 | G-01 | validation | ${right} |`, `| 2026-10-25 | G-01 | API | ${wrong} |`,
  `| 2026-10-26 | G-02 | API | ${wrong[0].toUpperCase()}${wrong.slice(1)} |`, `| 2026-10-26 | G-02 | RLS | ${skipped} |`, '');
const LEARNING = learningDoc('Records', 'right', 'wrong', 'not now');

test('Ö-48.16 learning: right / wrong count; a skipped answer is neither; doğru / yanlış are neither', () => {
  const en = learning(LEARNING);
  assert.deepEqual([en.right, en.wrong], [1, 2]);
  assert.deepEqual(en.missed.map((m) => [m.concept, m.count]), [['API', 2]]);
  const tr = learning(learningDoc('Records', 'doğru', 'yanlış', 'Şimdi değil'));
  assert.equal(tr === null || (tr.right === 0 && tr.wrong === 0), true, `Turkish results are not counted: ${JSON.stringify(tr)}`);
});

const qaDoc = (r) => lines('# QA report 2026-10-20-090000', '', 'Result: see the table.', '', '| Criterion | Result | Evidence | Note |', '|---|---|---|---|',
  `| AC-01.1 Required field | ${r.passed} | .previews/qa-x/AC-01.1.png |  |`,
  `| AC-01.2 List shows the record | ${r.failed} | .previews/qa-x/AC-01.2.png | Error: not visible |`,
  `| AC-02.1 PDF downloads | ${r.notRun} |  |  |`,
  `| AC-02.2 Export | ${r.failed2 ?? r.failed} |  | Error: timeout |`, '');
const QA = qaDoc(V);
const qaView = (s) => s && { passed: s.passed, failed: s.failed, notRun: s.notRun, failures: s.failures.map((f) => [f.criterion, f.evidence, f.note]) };

test('Ö-48.17 qaSummary: passed / failed / not run give the counts and failures; geçti / kaldı / koşulmadı are not counted', () => {
  assert.deepEqual(qaView(qaSummary(QA)), { passed: 1, failed: 2, notRun: 1, failures: [
    ['AC-01.2 List shows the record', '.previews/qa-x/AC-01.2.png', 'Error: not visible'], ['AC-02.2 Export', '', 'Error: timeout']] });
  const tr = qaSummary(qaDoc({ passed: 'geçti', failed: 'kaldı', notRun: 'koşulmadı' }));
  assert.deepEqual([tr.passed, tr.failed, tr.notRun, tr.failures.length], [0, 0, 0, 0]);
});

const KINDS = {
  tr: { tech: 'Teknik', business: 'İş', security: 'Güvenlik', ux: 'UX', perf: 'Performans', legal: 'Hukuk' },
  en: { tech: 'Tech', business: 'Business', security: 'Security', ux: 'UX', perf: 'Performance', legal: 'Legal' },
  keys: { tech: 'tech', business: 'business', security: 'security', ux: 'ux', perf: 'perf', legal: 'legal' },
};
const findingsDoc = (h, k) => lines('# Findings', '', 'Reports that scan the project.', '', `## ${h}`, '',
  'The `/dashboard` dashboard reads this table; do not change the columns.', '',
  '| Date | Type | Health | Previous | Findings | Critical | Report |', '|---|---|---|---|---|---|---|',
  `| 2026-10-01 | ${k.tech} | 55 | - | 14 | 3 | [report](tech/2026-10-01.md) |`,
  `| 2026-10-11 | ${k.tech} | 61 | 55 | 9 | 2 | [report](tech/2026-10-11.md) |`,
  `| 2026-10-11 | ${k.business} | 58/100 | - | 12 | 0 | x |`,
  `| 2026-10-12 | ${k.security} | 70 | - | 5 | 0 | x |`,
  `| 2026-10-13 | ${k.ux} | 80 | - | 4 | 0 | x |`,
  `| 2026-10-14 | ${k.perf} | 90 | - | 2 | 0 | x |`,
  `| 2026-10-15 | ${k.legal} | 75 | - | 3 | 0 | x |`, '');
const FINDINGS = { en: findingsDoc('Reports', KINDS.en), keys: findingsDoc('Reports', KINDS.keys) };
const HEALTH = { tech: 61, business: 58, security: 70, ux: 80, perf: 90, legal: 75 };

test('Ö-48.18 findingReports: "## Reports" with Tech / Business / ... and with the keys read every area; Turkish area names map to none', () => {
  const en = findingReports(FINDINGS.en);
  assert.equal(en.rows.length, 7);
  assert.deepEqual(Object.keys(en.latest).sort(), Object.keys(FINDING_KINDS).sort(), 'every area name maps to its dashboard key');
  assert.deepEqual(Object.fromEntries(Object.entries(en.latest).map(([k, r]) => [k, r.health])), HEALTH);
  assert.equal(en.latest.tech.critical, 2);
  assert.deepEqual(findingReports(FINDINGS.keys), en, 'the key form (tech, business ...) reads the same');
  // Teknik, İş, Güvenlik, Performans, Hukuk are not area names; UX is the same word in both
  assert.deepEqual(Object.keys(findingReports(findingsDoc('Reports', KINDS.tr)).latest), ['ux']);
});

const alarmsDoc = (h) => lines('# Spend Alarms', '', '> The dashboard reads the table below.', '', `## ${h}`, '',
  'One row per paid service.', '', '| Service | Type | Amount | Alert thresholds | Set up at | Last check |', '|---|---|---|---|---|---|',
  '| Anthropic | cap | 50 USD | 50%, 80% | Console | 2026-10-10 |', '| Vercel | alert | - | | | 2026-08-01 |', '',
  '## Settings the providers offer', '', '| Service | What exists | Does it stop? |', '|---|---|---|', '| OpenAI | budget | no |', '');
const ALARMS = alarmsDoc('Alarms');

test('Ö-48.19 spendAlarms: "## Alarms" reads the rows', () => {
  assert.deepEqual(spendAlarms(ALARMS, NOW).map((a) => [a.service, a.unset, a.stale]), [['Anthropic', false, false], ['Vercel', true, true]]);
});

const flagsDoc = (h, state, answers) => lines('# Feature flags', '', `## ${h}`, '',
  '| Flag | Purpose | Status | Owner | Added | Removal date | Kill switch tested |', '|---|---|---|---|---|---|---|',
  ...answers.map((a, i) => `| flag_${i} | purpose | ${state} | me | 2026-09-01 | 2026-12-31 | ${a} |`), '');

test('Ö-48.20 flags: kill switch yes / ✅ is tested; no / none / evet / hayır / var / yok are not', () => {
  const answers = ['yes', '✅', 'Yes', 'YES', 'no', 'none', '-', 'evet', 'EVET', 'hayır', 'var', 'yok'];
  const want = [false, false, false, false, true, true, true, true, true, true, true, true];
  assert.deepEqual(flags(flagsDoc('Flags', 'on', answers), NOW).map((b) => b.untested), want);
});

const BUG_CLASS_PAIRS = [['boş-girdi', 'empty-input'], ['doğrulama', 'validation'], ['yetki', 'authorization'], ['tarih-saat', 'date-time'],
  ['yerel-dil', 'locale'], ['sıralama', 'sorting'], ['eşzamanlılık', 'concurrency'], ['yapılandırma', 'configuration'], ['dış-servis', 'external-service'],
  ['sözleşme', 'contract'], ['arayüz-durumu', 'ui-state']];
const bugSpec = (lang, type, cls) => (lang === 'tr'
  ? lines('# Spec', '', `**Tür:** ${type}`, `**Sınıf:** ${cls}`, '', '## Mevcut davranış', '', '- x', '')
  : lines('# Spec', '', `**Type:** ${type}`, `**Class:** ${cls}`, '', '## Current behavior', '', '- x', ''));
const specs = (list) => Object.fromEntries(list.map(([f, ...a]) => [`docs/product/specs/${f}`, bugSpec(...a)]));

test('Ö-48.21 repeatedBugClasses: all eleven English classes count; type bug in any case counts as a bug', () => {
  const onlyEn = BUG_CLASS_PAIRS.flatMap(([, en], i) => {
    const n = String(i + 1).padStart(2, '0');
    return [[`${n}-a.md`, 'en', 'bug', en], [`${n}-b.md`, 'en', 'Bug', en.toUpperCase()]];
  });
  assert.deepEqual(repeatedBugClasses(project(specs(onlyEn))),
    BUG_CLASS_PAIRS.map(([, en], i) => ({ cls: en, specs: [`${String(i + 1).padStart(2, '0')}-a.md`, `${String(i + 1).padStart(2, '0')}-b.md`] })));
});

test('AC-49.5 repeatedBugClasses: Turkish labels, type "hata" and Turkish class names are not read; they never join an English class', () => {
  const p = project(specs([
    ['a1.md', 'tr', 'hata', 'yetki'], // Turkish labels: not found
    ['a2.md', 'tr', 'bug', 'authorization'], // Turkish labels, English values: still not found
    ['a3.md', 'en', 'bug', 'authorization'],
    ['a4.md', 'en', 'hata', 'authorization'], // "hata" is not a bug
    ['a5.md', 'en', 'bug', 'yetki'], // "yetki" is not authorization
    ['a6.md', 'en', 'bug', 'YETKİ'],
    ['f1.md', 'en', 'feature', 'authorization'],
  ]));
  assert.deepEqual(repeatedBugClasses(p), [], 'only one real authorization bug: nothing repeats');
  const all = BUG_CLASS_PAIRS.flatMap(([tr], i) => [[`${String(i + 1).padStart(2, '0')}-a.md`, 'en', 'bug', tr], [`${String(i + 1).padStart(2, '0')}-b.md`, 'en', 'bug', tr]]);
  assert.deepEqual(repeatedBugClasses(project(specs(all))), [], 'Turkish class names are not classes');
});

test('AC-49.5 dashboard-data: a Turkish heading is not found; each reader returns what it returns for an empty file', () => {
  const readers = [
    ['accounts', (s) => accounts(s, NOW), accountsDoc('Hesaplar', 'no', 'yes'), ACCOUNTS],
    ['feedback', feedback, feedbackDoc('Gelen kutusu', 'Temalar', FB_ROWS), FEEDBACK],
    ['learning', learning, learningDoc('Kayıtlar', 'right', 'wrong', 'not now'), LEARNING],
    ['findingReports', findingReports, findingsDoc('Raporlar', KINDS.en), FINDINGS.en],
    ['spendAlarms', (s) => spendAlarms(s, NOW), alarmsDoc('Alarmlar'), ALARMS],
    ['flags', (s) => flags(s, NOW), flagsDoc('Bayraklar', 'on', ['yes', 'no']), flagsDoc('Flags', 'on', ['yes', 'no'])],
  ];
  for (const [name, read, tr, en] of readers) {
    assert.notDeepEqual(read(en), read(''), `${name}: the English file is read (control)`);
    assert.deepEqual(read(tr), read(''), `${name}: the Turkish heading is not found`);
  }
});

const KIT = { version: '3.49.0', type: 'web-saas', addons: [], tool: null, lang: 'en', created: '2026-10-01', updated: '2026-10-01', files: {} };
const CACHE = () => ({ time: Date.now(), data: { runs: [], prs: [], liveMonitoring: [] } });

test('Ö-48.22 readStatus: no board Status line or no board file is the not-set-up value; "set up" stays set up', () => {
  const { isValue } = valuesApi();
  const noStatus = lines('# Expert Board', '', '**Commit review:** on', '', '## Members', '');
  const s0 = readStatus(project({ '.kit.json': KIT, 'docs/workflow/board.md': noStatus })).board.state;
  assert.equal(isValue(s0, 'notSetUp'), true, `board without a Status line: "${s0}"`);
  const none = readStatus(project({ '.kit.json': KIT })).board.state;
  assert.equal(isValue(none, 'notSetUp'), true, `no board file: "${none}"`);
  const s = readStatus(project({ '.kit.json': KIT, 'docs/workflow/board.md': '**Status:** set up\n' })).board.state;
  assert.equal(isValue(s, 'setUp'), true, `set up: "${s}"`);
  assert.equal(isValue(s, 'notSetUp'), false, 'set up: not "not set up"');
});

test('AC-49.5 readStatus: a Turkish board Status line is not found (not set up); "**Status:** kuruldu" is not "set up"', () => {
  const { isValue } = valuesApi();
  for (const board of ['**Durum:** kuruldu\n**Commit denetimi:** açık\n', '**Durum:** set up\n']) {
    const s = readStatus(project({ '.kit.json': KIT, 'docs/workflow/board.md': board })).board.state;
    assert.equal(isValue(s, 'notSetUp'), true, `${JSON.stringify(board)}: "${s}"`);
  }
  const s = readStatus(project({ '.kit.json': KIT, 'docs/workflow/board.md': '**Status:** kuruldu\n' })).board.state;
  assert.equal(isValue(s, 'setUp'), false, `"kuruldu" is not set up: "${s}"`);
});

test('Ö-48.22 readStatus: handoff "**Status:** waiting" is pending; Turkish label or value is not', () => {
  const pending = (text) => readStatus(project({ '.kit.json': KIT, 'docs/workflow/handoff.md': text })).handoffPending;
  for (const text of ['# Handoff note\n\n**Status:** waiting\n', '# Handoff note\n\n**Status:** Waiting\n', '# Handoff note\r\n\r\n**Status:** waiting\r\n']) {
    assert.equal(pending(text), true, JSON.stringify(text));
  }
  for (const text of ['# Handoff note\n\n**Status:** taken over\n', '# Handoff note\n\nwaiting for Ali\n', '# Handoff note\n\n**Status:** waitinglist\n',
    '# Handoff note\n\n**Durum:** bekliyor\n', '# Handoff note\n\n**Status:** bekliyor\n', '# Handoff note\n\n**Durum:** waiting\n']) {
    assert.equal(pending(text), false, JSON.stringify(text));
  }
});

// ---------- the dashboard ----------

function dashboard(p) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'dashboard.mjs'), p], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8');
}
const plain = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const unMd = (s) => s.replace(/\*\*|`/g, '');
const after_ = (html, marker, end) => {
  const i = html.indexOf(marker);
  assert.notEqual(i, -1, `marker not found: ${marker}`);
  return html.slice(i, html.indexOf(end, i + marker.length));
};
// The alert list: one plain text per alert, in order
const alertsOf = (p, html) => [...after_(html, `${t(p, 'dashboard.attention')} <span`, '</section>').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => plain(m[1]));
const kpisOf = (html) => [...html.matchAll(/<div class="kpi-l">([\s\S]*?)<\/div><div class="kpi-v">([\s\S]*?)<\/div>[\s\S]*?<div class="kpi-s">([\s\S]*?)<\/div><\/div>/g)]
  .map((m) => [plain(m[1]), plain(m[2]), plain(m[3])]);
const filtersOf = (p, html) => after_(html, `aria-label="${t(p, 'dashboard.topicFilter')}"`, '</div>');
const chipsOf = (p, html) => [...filtersOf(p, html).matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)].map((m) => ({ attrs: m[1], text: m[2] }));
const count = (html, s) => html.split(s).length - 1;

const L = { lastUpdated: 'Last updated', activePhase: 'Active phase', activeTask: 'Active task', setupStep: 'Setup step', questionMode: 'Question mode',
  profile: 'Profile', currentState: 'Current state', nextStep: 'Next step', pending: 'Pending decisions', leftOff: 'Where we left off',
  issues: 'Open issues / blockers', status: 'Status', commitReview: 'Commit review', members: 'Members', meetingLog: 'Meeting log',
  decisionLog: 'Decision log', phase: 'Phase', flags: 'Flags', records: 'Records', maintenanceLog: 'Maintenance log', accounts: 'Accounts',
  inbox: 'Inbox', themes: 'Themes', reports: 'Reports', alarms: 'Alarms', direction: '1. Chosen direction',
  valueProp: '3. Value proposition', criticalFlows: '1. Critical flows (automatic test REQUIRED)',
  closedTopics: 'closed topics', topic: 'design', phaseValue: 'Phase 1 — Core', meetingResult: 'APPROVE' };

const progressDoc = (l, { phase, step = '9/9', mode, profile }) => lines('# Progress', '',
  `**${l.lastUpdated}:** 2026-10-27`, `**${l.activePhase}:** ${phase}`, `**${l.activeTask}:** G-011 data model`, `**${l.setupStep}:** ${step}`,
  ...(mode == null ? [] : [`**${l.questionMode}:** ${mode}`]), `**${l.profile}:** ${profile}`, '',
  `## ${l.currentState}`, '', 'Sign-in works.', '',
  `## ${l.nextStep}`, '', '1. `/build G-011` data model', '',
  `## ${l.pending}`, '', '- Postgres or SQLite?', '',
  `## ${l.leftOff} (if stopped because of a limit or midway)`, '', '- G-011 migration half written', '',
  `## ${l.issues}`, '', '- CI is slow', '');
const decisionsDoc = (l, rows) => lines('# Decisions', '', `## ${l.decisionLog}`, '',
  '| # | Date | Stage | Topic | Question | Chosen | Door | Decided by |', '|---|---|---|---|---|---|---|---|',
  ...rows.map(([no, topic, question, chosen, door, by]) => `| ${no} | 2026-10-2${no} | Phase 1 | ${topic} | ${question} | ${chosen} | ${door} | ${by} |`), '');
const boardDoc = (l, state, review, meetings = []) => lines('# Expert Board', '', ...(state == null ? [] : [`**${l.status}:** ${state}`]), `**${l.commitReview}:** ${review}`, '',
  `## ${l.members}`, '', '| Member | Agent | Model | Focus | Meetings |', '|---|---|---|---|---|', '',
  `## ${l.meetingLog}`, '', '| # | Date | Type | Scope | Attendees | Result | Critical | User decision |', '|---|---|---|---|---|---|---|---|', ...meetings, '');

// One English project: every file the dashboard reads
function twin(over = {}) {
  const l = L, x = V;
  const files = {
    '.kit.json': KIT,
    '.claude/state/github-cache.json': CACHE(),
    // Every light command name-only: the command list is "light", so a Full profile raises the light-list alert
    '.claude/settings.json': { skillOverrides: Object.fromEntries(LIGHT_COMMANDS.map((c) => [c, 'name-only'])) },
    'AGENTS.md': '# Twin Project\n',
    'docs/workflow/progress.md': progressDoc(l, { phase: l.phaseValue, mode: `${x.off} · ${l.closedTopics}: ${l.topic}`, profile: x.full }),
    'docs/product/roadmap.md': lines('# Roadmap', '', `## ${l.phase} 0 — Setup (skeleton)`, '', '- [x] G-001: Repo ready', '',
      `## ${l.phase} 1 — Core`, '', '- [x] G-010: Auth', '- [ ] G-011: Data model', ''),
    'docs/decisions/log.md': decisionsDoc(l, [[1, 'tech', 'Database?', 'Postgres', x.oneWay, x.user], [2, 'design', 'Font?', 'Inter', x.twoWay, x.automatic],
      [3, 'tech', 'Queue?', 'none yet', x.oneWay, x.automatic]]),
    'docs/workflow/board.md': boardDoc(l, x.notSetUp, x.on, [`| 1 | 2026-10-20 | task | G-001 | QA | ${l.meetingResult} | - | - |`]),
    'docs/workflow/handoff.md': lines('# Handoff note', '', `**${l.status}:** ${x.waiting}`, '**Date:** 2026-10-27', ''),
    'docs/operations/accounts.md': lines('# Accounts', '', `## ${l.accounts}`, '',
      '| Service | Purpose | Account owner | 2FA | Plan / monthly cost | Expiry / renewal | Key rotation | Note |', '|---|---|---|---|---|---|---|---|',
      `| Domain | site | me | ${x.no} | 300 TL/yr | ${day(10)} | - | |`, `| GitHub | code | me | ${x.yes} | Free | - | ${day(-3)} | |`, ''),
    'docs/operations/spend-alarms.md': alarmsDoc(l.alarms),
    'docs/operations/feature-flags.md': lines('# Feature flags', '', `## ${l.flags}`, '',
      '| Flag | Purpose | Status | Owner | Added | Removal date | Kill switch tested |', '|---|---|---|---|---|---|---|',
      `| new_pdf | pdf export | ${x.on} | me | 2026-09-01 | ${day(-10)} | ${x.yes} |`, `| beta_list | list | ${x.off} | me | 2026-10-01 | ${day(60)} | ${x.no} |`, ''),
    'docs/operations/maintenance.md': lines('# Maintenance', '', `## ${l.maintenanceLog}`, '', '| Date | Type | Findings | Done / task opened |', '|---|---|---|---|',
      '| 2026-10-25 | weekly | 2 outdated packages | updated |', ''),
    'docs/product/feedback.md': FEEDBACK,
    'docs/findings/README.md': FINDINGS.en,
    'docs/workflow/learning.md': LEARNING,
    'docs/quality/qa/2026-10-20-090000.md': QA,
    ...specs([['2026-10-01-a.md', 'en', x.bug, 'authorization'], ['2026-10-02-b.md', 'en', x.bug, 'authorization']]),
    'docs/quality/test-plan.md': lines('# Test plan', '', `## ${l.criticalFlows}`, '', 'Every change that touches one of these flows comes with a test.', '',
      '| # | Flow | Why critical | Test type | Test file | Status |', '|---|---|---|---|---|---|',
      '| K1 | Sign-up / sign-in / sign-out | Everyone uses it | e2e | tests/auth.spec.ts | ✅ |',
      '| K2 | Authorization: a user cannot see another user\'s data | Data leak | integration | | ⬜ |', '',
      '## 1a. Acceptance tests (living specification)', '', '- none', ''),
    'docs/design/design-guide.md': lines('# Design guide', '', `## ${l.direction}`, '', '| Area | Choice | Skill | Preview | Date |', '|---|---|---|---|---|',
      '| Style direction | Swiss grid | taste-skill | `.previews/01/b.html` | 2026-10-20 |', '| Font pair | Inter + IBM Plex Mono | ui-ux-pro-max | | |', '| Dark theme | | | | |', '',
      '## 2. Design decision log', '', '- none', ''),
    'docs/product/prd.md': lines('# PRD', '', '## 1. Problem', '', 'Invoices take too long.', '', '## 2. Users', '', 'Freelancers.', '',
      `## ${l.valueProp}`, '', 'With Fatura, freelancers send an invoice in one minute, because the data is already there.', '', '## 4. Success criteria (measurable)', '', '- [ ] 50 users', ''),
  };
  return { ...files, ...over };
}

const msgs = (p, keys) => keys.map(([k, vars]) => unMd(t(p, k, vars)));

test('Ö-48.26 dashboard: an English project raises the expected alerts and shows the expected counts', () => {
  const en = project(twin());
  const hen = dashboard(en);
  const want = msgs(en, [
    ['dashboard.alert.handoffPending'], ['dashboard.alert.boardNotSetUp'], ['dashboard.alert.cmdListLight'],
    ['dashboard.alert.closedTopics', { topics: 'design' }], ['dashboard.alert.newFeedback', { count: 2 }],
    ['dashboard.alert.noTwoFactor', { service: 'Domain' }], ['dashboard.alert.spendUnset', { service: 'Vercel' }],
    ['dashboard.alert.findingsCritical', { kind: t(en, 'dashboard.findingKind.tech'), critical: 2, health: 61 }],
    ['dashboard.alert.repeatedBug', { count: 2, cls: 'authorization', specs: '2026-10-01-a.md, 2026-10-02-b.md' }],
    ['dashboard.alert.flagsOverdue', { count: 1, names: 'new_pdf' }],
  ]);
  const aen = alertsOf(en, hen);
  for (const w of want) assert.equal(aen.some((a) => a.includes(w)), true, `English project alert: ${w}\n${aen.join('\n')}`);
  const heavy = unMd(t(en, 'dashboard.alert.cmdListHeavy', { mode: '' })).split(':')[0];
  assert.equal(aen.some((a) => a.includes(heavy)), false, 'a Full profile is not "heavy list"');

  const ken = kpisOf(hen);
  const kpi = (label) => ken.find(([l]) => l === t(en, label));
  assert.deepEqual(kpi('dashboard.kpiDecisions'), [t(en, 'dashboard.kpiDecisions'), '3', t(en, 'dashboard.usersAuto', { user: 1, auto: 2 })]);
  assert.equal(kpi('dashboard.kpiNew')[1], '2', 'new feedback');
  assert.equal(kpi('dashboard.kpiPlanned')[1], '1', 'planned feedback');
  assert.deepEqual([kpi('dashboard.kpiRight')[1], kpi('dashboard.kpiWrong')[1]], ['1', '2'], 'learning');
  assert.deepEqual([kpi('dashboard.passed')[1], kpi('dashboard.failed')[1], kpi('dashboard.notRun')[1]], ['1', '2', '1'], 'last QA');

  const chips = chipsOf(en, hen).map((c) => c.text);
  for (const c of [`${t(en, 'dashboard.all')} (3)`, `${t(en, 'dashboard.auto')} (2)`, `${t(en, 'dashboard.oneWay')} (2)`]) {
    assert.equal(chips.includes(c), true, `chip ${c}: ${chips.join(' | ')}`);
  }
  assert.equal(count(hen, `</span> ${t(en, 'dashboard.untested')}</span>`), 1, 'one flag without a tested kill switch');
});

test('Ö-48.27 dashboard: critical flows, design direction and value proposition read from the English headings', () => {
  const p = project(twin());
  const h = dashboard(p);
  const flows = after_(h, `${t(p, 'dashboard.criticalFlowTests')}</h3>`, '</section>');
  const design = after_(h, `<h3>${t(p, 'dashboard.design')}</h3>`, '</section>');
  const value = after_(h, `<h4>${t(p, 'dashboard.valueProp')}</h4>`, '</p>');
  assert.match(plain(flows), /K1 Sign-up \/ sign-in \/ sign-out e2e tests\/auth\.spec\.ts/, 'critical flow K1');
  assert.match(plain(flows), /K2 Authorization: a user cannot see another user's data integration/, 'critical flow K2');
  assert.equal(flows.includes(t(p, 'dashboard.noTestPlan')), false, 'not the empty state');
  assert.match(plain(design), /Style direction Swiss grid Font pair Inter \+ IBM Plex Mono/, 'design direction');
  assert.equal(design.includes(t(p, 'dashboard.noDesign')), false, 'design not empty');
  assert.match(plain(value), /With Fatura, freelancers send an invoice in one minute, because the data is already there\./, 'value proposition');
});

test('AC-49.5 dashboard: Turkish critical-flow, design-direction and value-proposition headings are not found (empty states)', () => {
  const p = project(twin({
    'docs/quality/test-plan.md': lines('# Test plan', '', '## 1. Kritik akışlar', '', '| # | Flow | Why critical | Test type | Test file | Status |',
      '|---|---|---|---|---|---|', '| K1 | Sign-up | Everyone uses it | e2e | tests/auth.spec.ts | ✅ |', ''),
    'docs/design/design-guide.md': lines('# Design guide', '', '## 1. Seçilen yön', '', '| Area | Choice | Skill | Preview | Date |', '|---|---|---|---|---|',
      '| Style direction | Swiss grid | taste-skill | | 2026-10-20 |', ''),
    'docs/product/prd.md': lines('# PRD', '', '## 3. Değer önerisi', '', 'With Fatura, freelancers send an invoice in one minute.', ''),
  }));
  const h = dashboard(p);
  assert.equal(after_(h, `${t(p, 'dashboard.criticalFlowTests')}</h3>`, '</section>').includes(t(p, 'dashboard.noTestPlan')), true, 'critical flows: empty state');
  assert.equal(after_(h, `<h3>${t(p, 'dashboard.design')}</h3>`, '</section>').includes(t(p, 'dashboard.noDesign')), true, 'design: empty state');
  assert.equal(h.includes('freelancers send an invoice in one minute'), false, 'the value proposition is not shown');
});

test('Ö-48.28 dashboard: board not set up alerts outside Setup only; the handoff alert action is /handoff take', () => {
  const x = V;
  const notSetUp = t(project({ '.kit.json': KIT }), 'dashboard.alert.boardNotSetUp');
  const html = (over) => { const p = project(twin(over)); return { p, h: dashboard(p) }; };
  // Not set up in phase 1: alert; the same in Setup: no alert, the setup step is shown; board file missing: alert; set up: no alert
  let { p, h } = html({});
  assert.equal(alertsOf(p, h).some((a) => a.includes(notSetUp)), true, 'not set up, phase 1');
  ({ p, h } = html({ 'docs/workflow/progress.md': progressDoc(L, { phase: x.setup, step: '4/9', mode: x.on, profile: x.full }) }));
  assert.equal(alertsOf(p, h).some((a) => a.includes(notSetUp)), false, `phase "${x.setup}" is setup, no board alert`);
  assert.equal(h.includes(`${t(p, 'dashboard.startStep')}</div><div class="num">4/9</div>`), true, `the setup step is shown in phase "${x.setup}"`);
  ({ p, h } = html({ 'docs/workflow/board.md': null }));
  assert.equal(alertsOf(p, h).some((a) => a.includes(notSetUp)), true, 'no board file');
  ({ p, h } = html({ 'docs/workflow/board.md': boardDoc(L, x.setUp, x.on) }));
  assert.equal(alertsOf(p, h).some((a) => a.includes(notSetUp)), false, 'set up');
  // The old Turkish phase value is not Setup: the board alert is raised
  ({ p, h } = html({ 'docs/workflow/progress.md': progressDoc(L, { phase: 'Başlangıç', step: '4/9', mode: x.on, profile: x.full }) }));
  assert.equal(alertsOf(p, h).some((a) => a.includes(notSetUp)), true, '"Başlangıç" is not the Setup phase');
  // The handoff alert
  ({ p, h } = html({}));
  const handoff = alertsOf(p, h).find((a) => a.includes(unMd(t(p, 'dashboard.alert.handoffPending'))));
  assert.match(handoff ?? '', /\/handoff take/, 'take-over action');
  assert.doesNotMatch(h, /\/handoff devral/, 'the old Turkish command is gone');
});

test('Ö-48.23 dashboard (Turkish UI): English "set up" / "not set up" and on / off are recognised', () => {
  const kit = { ...KIT, lang: 'tr' };
  for (const [state, review, wantState, wantReview] of [[V.setUp, V.off, 'dashboard.boardSetUp', 'dashboard.off'], [V.notSetUp, V.on, 'dashboard.notSetUp', 'dashboard.on']]) {
    const p = project({ '.kit.json': kit, '.claude/state/github-cache.json': CACHE(), 'AGENTS.md': '# P\n', 'docs/workflow/board.md': boardDoc(L, state, review) });
    const h = dashboard(p);
    assert.equal(h.includes(`<h3>${t(p, 'dashboard.members')} · ${t(p, wantState)}</h3>`), true, `${state}: board heading`);
    assert.equal(h.includes(t(p, 'dashboard.commitReview', { value: t(p, wantReview) })), true, `${review}: commit review`);
  }
});

// ---------- status line and session start ----------

function statusline(p) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'statusline.mjs')], { input: JSON.stringify({ workspace: { project_dir: p } }), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
const questionPart = (p, out) => out.split(' · ').find((s) => s.startsWith(t(p, 'statusline.question', { mode: '' }))) ?? `(no question part in: ${out})`;
const progressOnly = (opts) => project({ '.kit.json': KIT, 'AGENTS.md': '# P\n', 'docs/workflow/progress.md': progressDoc(L, { phase: 'Phase 1 — Core', profile: V.standard, ...opts }) });

test('Ö-48.24 statusline: "off · closed topics: design" renders the closed topics; "none" is hidden', () => {
  const en = progressOnly({ mode: 'off · closed topics: design' });
  const want = t(en, 'statusline.question', { mode: `${t(en, 'statusline.modeOff')} ${t(en, 'statusline.closed', { topics: 'design' })}` });
  assert.equal(questionPart(en, statusline(en)), want);
  const open = t(en, 'statusline.question', { mode: t(en, 'statusline.modeOpen') });
  for (const mode of ['on · closed topics: none', 'on', 'On · Closed topics: None', undefined]) {
    const p = progressOnly({ mode });
    assert.equal(questionPart(p, statusline(p)), open, String(mode));
  }
  for (const mode of ['off', 'off · closed topics: none']) {
    const p = progressOnly({ mode });
    assert.equal(questionPart(p, statusline(p)), t(p, 'statusline.question', { mode: t(p, 'statusline.modeOff') }), mode);
  }
});

test('AC-49.3 statusline: the Turkish values açık / kapalı are shown as written, never mapped to open / closed', () => {
  for (const mode of ['açık', 'kapalı', 'kapalı · kapalı konular: design']) {
    const p = progressOnly({ mode });
    const part = questionPart(p, statusline(p));
    assert.notEqual(part, t(p, 'statusline.question', { mode: t(p, 'statusline.modeOpen') }), `${mode}: not open`);
    assert.notEqual(part, t(p, 'statusline.question', { mode: t(p, 'statusline.modeOff') }), `${mode}: not off`);
    assert.equal(part.includes(mode.split(' ')[0]), true, `${mode}: shown as written: ${part}`);
  }
});

test('Ö-48.25 statusline: phase "Setup" shows the setup step; "Başlangıç" does not', () => {
  const p = progressOnly({ phase: V.setup, step: '3/9', mode: V.on });
  const out = statusline(p);
  assert.equal(out.includes(t(p, 'statusline.step', { step: '3/9' })), true, out);
  assert.equal(out.includes(t(p, 'statusline.task', { done: 0, total: 0 })), false, `no task count in setup: ${out}`);
  const q = progressOnly({ phase: 'Başlangıç', step: '3/9', mode: V.on });
  assert.equal(statusline(q).includes(t(q, 'statusline.step', { step: '3/9' })), false, '"Başlangıç" is not the Setup phase');
});

function sessionStart(p) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'session-start.mjs')], {
    input: '{}', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, HOME: p, USERPROFILE: p },
  });
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  return { context: o.hookSpecificOutput.additionalContext, screen: o.systemMessage ?? '' };
}

test('Ö-48.29 session-start: Setup (adopt) suggests /adopt, Setup suggests /start; the Turkish phase values suggest neither', () => {
  for (const [phase, command] of [['Setup (adopt)', '/adopt'], ['Setup', '/start']]) {
    const { context } = sessionStart(progressOnly({ phase, step: '3/9', mode: V.on }));
    assert.match(context, new RegExp(`${command} was left unfinished \\(step 3/9\\)`), phase);
    const other = command === '/adopt' ? '/start' : '/adopt';
    assert.doesNotMatch(context, new RegExp(`${other} was left unfinished`), `${phase}: not ${other}`);
  }
  for (const phase of ['Başlangıç (uyum)', 'Başlangıç', 'Setup (uyum)']) {
    const { context } = sessionStart(progressOnly({ phase, step: '3/9', mode: V.on }));
    if (phase === 'Setup (uyum)') assert.doesNotMatch(context, /\/adopt was left unfinished/, `${phase}: "uyum" is not adopt`);
    else assert.doesNotMatch(context, /was left unfinished/, `${phase}: not the Setup phase`);
  }
});

test('Ö-48.29 session-start: a missing Question mode line is shown as "on"', () => {
  const { context } = sessionStart(progressOnly({ mode: undefined }));
  assert.match(context, /Question mode: on · Board:/);
});

test('Ö-48.29 session-start: a waiting handoff note suggests /handoff take (English and Turkish UI)', () => {
  for (const lang of ['en', 'tr']) {
    const p = project({ ...twin(), '.kit.json': { ...KIT, lang } });
    const { context, screen } = sessionStart(p);
    assert.match(context, /\/handoff take/, `${lang} UI: context`);
    assert.doesNotMatch(`${context}\n${screen}`, /devral/, `${lang} UI: no Turkish command`);
  }
});

// ---------- 4. qa-report writes English values ----------

const suite = (cases) => `<testsuites><testsuite>${cases}</testsuite></testsuites>`;
// The Result cell of every criterion row (rows start with the criterion id)
const resultColumn = (text) => text.split(/\r?\n/).filter((l) => /^\| AC-\d\d\.\d+ /.test(l)).map((l) => l.split('|')[2].trim());
function qaRun(junit) {
  const p = project({
    'docs/product/prd.md': '# PRD\n\n- [ ] AC-01.1: Required field\n- [ ] AC-01.2: List shows the record\n- [ ] AC-02.1: PDF downloads\n',
    'test-results-qa/junit.xml': suite(junit),
  });
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'qa-report.mjs')], { cwd: p, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  const dir = path.join(p, 'docs/quality/qa');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
  assert.equal(files.length, 1, `one report written: ${r.stdout}${r.stderr}`);
  return { r, text: fs.readFileSync(path.join(dir, files[0]), 'utf8') };
}

test('Ö-48.30 qa-report: a new report writes passed / failed / not run, never geçti / kaldı / koşulmadı; a failure exits 1', () => {
  const { r, text } = qaRun('<testcase name="AC-01.1 required" classname="qa"/><testcase name="AC-01.2 list" classname="qa"><failure message="x">Error: not visible</failure></testcase>');
  assert.equal(r.status, 1, 'a failed criterion makes the exit code red');
  assert.match(text, /^\| AC-01\.1 Required field \| passed \| /m);
  assert.match(text, /^\| AC-01\.2 List shows the record \| failed \| [^|]* \| Error: not visible \|$/m);
  assert.match(text, /^\| AC-02\.1 PDF downloads \| not run \| /m);
  // The title, header and summary line are localized UI text; the Result column is the value the dashboard reads
  assert.deepEqual(resultColumn(text), ['passed', 'failed', 'not run']);
  const s = qaSummary(text);
  assert.deepEqual([s.passed, s.failed, s.notRun], [1, 1, 1], 'the dashboard reads the new report');
});

test('Ö-48.30 qa-report: all green writes only "passed" and exits 0', () => {
  const { r, text } = qaRun('<testcase name="AC-01.1 a"/><testcase name="AC-01.2 b"/><testcase name="AC-02.1 c"/>');
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(resultColumn(text), ['passed', 'passed', 'passed']);
});

// ---------- 5. dashboard internal ids in English ----------

const OLD_IDS = ['simdi', 'oto', 'kararlar', 'dikkat', 'tek', 'otomatik', 'hepsi', 'tablo-gor', 'kopyala', 'faz-bar', 'eylem', 'daha', 'kurul',
  'bulgular', 'kalite', 'aktivite', 'urun', 'operasyon', 'karar', 'bakım', 'bakim', 'kapi'];
// A name is Turkish if it is one of the old ids, or one of its dash-separated parts is ("t-karar", "p-kararlar")
const oldWord = (name) => OLD_IDS.includes(name) || name.split('-').some((part) => OLD_IDS.includes(part));
const markup = (html) => html.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');
const internalAttrs = (html) => [...markup(html).matchAll(/\s(id|class|data-[\w-]+|aria-controls|aria-labelledby)="([^"]*)"/g)]
  .filter(([, name]) => name !== 'data-cmd' && name !== 'data-tip') // content, not ids
  .map(([, name, value]) => ({ name, value }));

test('Ö-48.31 dashboard: id, class and data-* names and values carry no old Turkish id, and are ASCII', () => {
  const p = project(twin());
  const html = dashboard(p);
  const attrs = internalAttrs(html);
  assert.equal(attrs.some((a) => a.name === 'id'), true, 'ids found');
  const bad = [];
  for (const { name, value } of attrs) {
    if (name.startsWith('data-') && oldWord(name.slice(5))) bad.push(`attribute ${name}`);
    for (const word of value.trim().split(/\s+/).filter(Boolean)) if (oldWord(word)) bad.push(`${name}="${value}"`);
    const ok = name === 'class' ? /^([a-z0-9-]+( +[a-z0-9-]+)*)?$/.test(value.trim()) : /^[a-z0-9-]*$/.test(value);
    if (!ok) bad.push(`not ASCII [a-z0-9-]: ${name}="${value}"`);
  }
  // The page's own CSS and script use the same names
  const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  for (const [, name] of css.matchAll(/[.#]([a-zA-Z_][\w-]*)/g)) if (oldWord(name)) bad.push(`css .${name}`);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
  // Whole string only: the localStorage key is not an id (renaming it would reset the user's refresh choice)
  for (const [, s] of script.matchAll(/'([^'\\]*)'/g)) {
    if (OLD_IDS.includes(s)) bad.push(`script '${s}'`);
    for (const [, name] of s.matchAll(/[.#]([a-zA-Z_][\w-]*)/g)) if (oldWord(name)) bad.push(`script selector ${name}`);
  }
  for (const [, name] of script.matchAll(/dataset\.(\w+)/g)) if (oldWord(name)) bad.push(`script dataset.${name}`);
  assert.deepEqual([...new Set(bad)], []);
});

test('Ö-48.32 dashboard: the decision filters work (one row per decision, All shows the total)', () => {
  const p = project(twin());
  const html = dashboard(p);
  const chips = chipsOf(p, html);
  const keyOf = (c) => c.attrs.match(/\sdata-[\w-]+="([^"]*)"/)?.[1] ?? null;
  const all = chips[0];
  assert.equal(all?.text, `${t(p, 'dashboard.all')} (3)`, 'the first chip is All with the total');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
  // The table the script filters exists and holds one row per decision
  const tableId = script.match(/querySelectorAll\('#([\w-]+) tbody tr'\)/)?.[1];
  assert.equal(typeof tableId, 'string', 'the script filters a table by id');
  const table = after_(html, `<table id="${tableId}">`, '</table>');
  const rows = [...after_(table, '<tbody>', '</tbody>').matchAll(/<tr\b([^>]*)>/g)].map((m) => [...m[1].matchAll(/\sdata-[\w-]+="([^"]*)"/g)].map((d) => d[1]));
  assert.equal(rows.length, 3, 'one row per decision');
  assert.equal(script.includes(`'${keyOf(all)}'`), true, `the script knows the All key "${keyOf(all)}"`);
  for (const [label, n] of [['dashboard.auto', 2], ['dashboard.oneWay', 2]]) {
    const chip = chips.find((c) => c.text === `${t(p, label)} (${n})`);
    assert.equal(typeof chip?.attrs, 'string', `${label} chip`);
    const key = keyOf(chip);
    assert.equal(rows.filter((r) => r.includes(key)).length, n, `${label}: rows carrying "${key}"`);
    assert.equal(script.includes(`'${key}'`), true, `${label}: the script knows "${key}"`);
  }
});

// ---------- adversarial ----------

test('A-48.10 a value word in free text or another column does not change the result', () => {
  const x = V;
  // Decisions: only the Decided by column makes an auto decision, only the Door column a one-way door
  const p = project(twin({ 'docs/decisions/log.md': decisionsDoc(L, [
    [1, 'tech', 'automatic? one-way?', 'automatic', x.twoWay, x.user],
    [2, 'tech', 'Is the board on?', 'one-way', x.twoWay, x.user]]) }));
  const html = dashboard(p);
  const chips = chipsOf(p, html).map((c) => c.text);
  assert.equal(chips.includes(`${t(p, 'dashboard.auto')} (0)`), true, `no auto decision: ${chips.join(' | ')}`);
  assert.equal(chips.includes(`${t(p, 'dashboard.oneWay')} (0)`), true, `no one-way door: ${chips.join(' | ')}`);
  const k = kpisOf(html).find(([l]) => l === t(p, 'dashboard.kpiDecisions'));
  assert.deepEqual(k, [t(p, 'dashboard.kpiDecisions'), '2', t(p, 'dashboard.usersAuto', { user: 2, auto: 0 })]);
  // Old Turkish values in the Door / Decided by columns are not one-way / automatic
  const q = project(twin({ 'docs/decisions/log.md': decisionsDoc(L, [[1, 'tech', 'Database?', 'Postgres', 'tek', 'otomatik']]) }));
  const qChips = chipsOf(q, dashboard(q)).map((c) => c.text);
  assert.equal(qChips.includes(`${t(q, 'dashboard.auto')} (0)`), true, `"otomatik" is not automatic: ${qChips.join(' | ')}`);
  assert.equal(qChips.includes(`${t(q, 'dashboard.oneWay')} (0)`), true, `"tek" is not one-way: ${qChips.join(' | ')}`);
  // Feedback: "new" in the summary or theme is not a new item
  const fb = feedback(feedbackDoc('Inbox', 'Themes', [[1, 'bug', 'done', 'new']]).replace('summary 1', 'new planned'));
  assert.equal(fb.newCount, 0);
  // Learning: the concept column does not decide the result
  const l = learning(lines('## Records', '', '| Date | Task | Concept | Result |', '|---|---|---|---|', '| 2026-10-25 | G-01 | right | wrong |', '| 2026-10-25 | G-01 | wrong | wrong |'));
  assert.deepEqual([l.right, l.wrong], [0, 2]);
  // Flags: "yes" in the purpose does not test the kill switch
  assert.deepEqual(flags(flagsDoc('Flags', 'on', ['no', 'no']).replace(/\| purpose \|/g, '| yes ✅ |'), NOW).map((b) => b.untested), [true, true]);
  // Accounts: "no" in the purpose or note does not mean no 2FA
  const acc = accounts(lines('## Accounts', '', '| Service | Purpose | Owner | 2FA | Plan | Expiry | Key | Note |', '|---|---|---|---|---|---|---|---|',
    '| Domain | no | no | yes | no | - | - | no |'), NOW);
  assert.equal(acc[0]?.noTwoFactor, false);
});

test('A-48.11 an unknown value is shown as it is, never mapped to on / off', () => {
  const p = progressOnly({ mode: 'maybe' });
  assert.equal(questionPart(p, statusline(p)), t(p, 'statusline.question', { mode: 'maybe' }), 'status line');
  assert.match(sessionStart(p).context, /Question mode: maybe · Board:/, 'session start');
  const d = project(twin({ 'docs/workflow/progress.md': progressDoc(L, { phase: L.phaseValue, mode: 'maybe', profile: V.full }) }));
  const html = dashboard(d);
  assert.equal(html.includes(`${t(d, 'dashboard.questionMode')}</div><div>maybe</div>`), true, 'dashboard');
  assert.equal(alertsOf(d, html).some((a) => a.includes(unMd(t(d, 'dashboard.alert.closedTopics', { topics: '' })).split(':')[0])), false, 'no closed-topics alert');
  const s = qaSummary(qaDoc({ passed: 'maybe', failed: 'not passed', notRun: 'skipped' }));
  assert.deepEqual([s.passed, s.failed, s.notRun], [0, 0, 0], 'unknown QA results are not counted');
  assert.equal(feedback(feedbackDoc('Inbox', 'Themes', [[1, 'bug', 'maybe', 'x'], [2, 'bug', 'newish', 'x']])).newCount, 0);
});

test('A-48.12 CRLF and a BOM give the same reader result as LF', () => {
  assert.deepEqual(feedback(crlfBom(FEEDBACK)), feedback(FEEDBACK), 'feedback');
  assert.deepEqual(accounts(crlfBom(ACCOUNTS), NOW), accounts(ACCOUNTS, NOW), 'accounts');
  assert.deepEqual(learning(crlfBom(LEARNING)), learning(LEARNING), 'learning');
  assert.deepEqual(qaSummary(crlfBom(QA)), qaSummary(QA), 'qaSummary');
  assert.deepEqual(findingReports(crlfBom(FINDINGS.en)), findingReports(FINDINGS.en), 'findingReports');
  assert.deepEqual(spendAlarms(crlfBom(ALARMS), NOW), spendAlarms(ALARMS, NOW), 'spendAlarms');
  const status = readStatus(project({ '.kit.json': KIT, 'docs/workflow/handoff.md': crlfBom('# Handoff note\n\n**Status:** waiting\n') }));
  assert.equal(status.handoffPending, true, 'handoff with CRLF and BOM');
});
