// Run: node --test "kit/tests/*.test.mjs"
// 3.48.0 step 4a: label VALUES move to English as well (açık → on, kurulmadı → not set up, geçti → passed ...).
// Hooks read both languages for the whole 3.x line: a Turkish file and its English twin (labels AND values translated)
// must give the same reader result. New headings join normalize(); labels.mjs gets VALUES and isValue();
// qa-report writes English values; the dashboard's internal ids lose their Turkish words.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Namespace import: VALUES / isValue do not exist yet, each test reports its own failure
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
const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;

const valuesApi = () => {
  assert.equal(typeof labels.isValue, 'function', 'labels.mjs exports isValue(text, key)');
  assert.equal(Object.prototype.toString.call(labels.VALUES), '[object Object]', 'labels.mjs exports VALUES');
  return labels;
};

// ---------- the approved value dictionary: key, Turkish, English ----------

const VALUE_PAIRS = [
  ['on', 'açık', 'on'], ['off', 'kapalı', 'off'], ['none', 'yok', 'none'], ['setup', 'Başlangıç', 'Setup'],
  ['notSetUp', 'kurulmadı', 'not set up'], ['setUp', 'kuruldu', 'set up'], ['full', 'Tam', 'Full'], ['light', 'Hafif', 'Light'],
  ['standard', 'Standart', 'Standard'], ['waiting', 'bekliyor', 'waiting'], ['automatic', 'otomatik', 'automatic'], ['user', 'kullanıcı', 'user'],
  ['oneWay', 'tek', 'one-way'], ['twoWay', 'çift', 'two-way'], ['yes', 'evet', 'yes'], ['no', 'hayır', 'no'], ['right', 'doğru', 'right'],
  ['wrong', 'yanlış', 'wrong'], ['passed', 'geçti', 'passed'], ['failed', 'kaldı', 'failed'], ['notRun', 'koşulmadı', 'not run'],
  ['bug', 'hata', 'bug'], ['feature', 'özellik', 'feature'],
];
const V = {
  tr: Object.fromEntries(VALUE_PAIRS.map(([k, tr]) => [k, tr])),
  en: Object.fromEntries(VALUE_PAIRS.map(([k, , en]) => [k, en])),
};

// ---------- 1. normalize: the new heading labels ----------

const HEADINGS = [
  ['## Hesaplar', '## Accounts'],
  ['## Gelen kutusu', '## Inbox'],
  ['## Temalar', '## Themes'],
  ['## Raporlar', '## Reports'],
  ['## Alarmlar', '## Alarms'],
  ['## 1. Seçilen yön', '## 1. Chosen direction'],
  ['## 3. Değer önerisi', '## 3. Value proposition'],
  ['## 1. Kritik akışlar', '## 1. Critical flows'],
  ['## Öğrenilen kurallar', '## Learned rules'],
];

test('Ö-48.10 normalize: the nine new headings become English, the template suffix after them is kept', () => {
  for (const [tr, en] of HEADINGS) assert.equal(labels.normalize(tr), en, tr);
  // The templates write a note after some of them
  assert.equal(labels.normalize('## 1. Seçilen yön (Chosen direction)'), '## 1. Chosen direction (Chosen direction)');
  assert.equal(labels.normalize('## 3. Değer önerisi (value proposition)'), '## 3. Value proposition (value proposition)');
  assert.equal(labels.normalize('## 1. Kritik akışlar (critical flows; automatic test REQUIRED)'), '## 1. Critical flows (critical flows; automatic test REQUIRED)');
  const doc = (h) => lines('# Feedback', '', '> The headings are read by the dashboard.', '', h[1], '', '| # | Summary |', '|---|---|', '| 1 | Hesaplar yok |', '', h[2], '', '- x', '');
  assert.equal(labels.normalize(doc(['', '## Gelen kutusu', '## Temalar'])), doc(['', '## Inbox', '## Themes']));
  assert.equal(labels.normalize(doc(['', '## Gelen kutusu', '## Temalar']).replace(/\n/g, '\r\n')), doc(['', '## Inbox', '## Themes']).replace(/\n/g, '\r\n'), 'CRLF kept');
  assert.equal(labels.normalize('\uFEFF# Accounts\n\n## Hesaplar\n'), '\uFEFF# Accounts\n\n## Accounts\n', 'BOM kept');
});

test('Ö-48.10 normalize: the new English headings are unchanged and the Turkish ones are idempotent', () => {
  for (const [tr, en] of HEADINGS) {
    assert.equal(labels.normalize(en), en, en);
    assert.equal(labels.normalize(labels.normalize(tr)), labels.normalize(tr), tr);
  }
});

test('A-48.8 normalize: prose, tables, code blocks, deeper headings and longer words with the new labels stay byte-identical', () => {
  const doc = [
    'Hesaplar, Gelen kutusu, Temalar, Raporlar ve Alarmlar bölümleri dashboard tarafından okunur.',
    'Öğrenilen kurallar burada değil; 1. Seçilen yön ve 3. Değer önerisi PRD\'de.',
    '| Hesaplar | Gelen kutusu |',
    '| ## Raporlar | ## 1. Kritik akışlar |',
    '```md',
    '## Hesaplar',
    '## Gelen kutusu',
    '## 1. Seçilen yön',
    '## Öğrenilen kurallar',
    '```',
    '~~~',
    '## Alarmlar',
    '~~~',
    '### Hesaplar',
    '# Raporlar',
    '- ## Temalar',
    '> ## Alarmlar',
    'See ## Raporlar in the README.',
    '## Hesaplarım',
    '## Raporlarda',
    '## Temalarımız',
    '## Alarmlara bak',
    '## Gelen kutusunda',
    '## 1. Seçilen yönler',
    '## 3. Değer önerisiz',
    '## 1. Kritik akışları',
    '## Öğrenilen kurallara',
    '## hesaplar',
    '## HESAPLAR',
    '##Hesaplar',
  ].join('\n');
  assert.equal(labels.normalize(doc), doc);
});

// ---------- 2. VALUES and isValue ----------

test('Ö-48.11 VALUES: every key maps the approved Turkish value to its English value', () => {
  const { VALUES } = valuesApi();
  for (const [key, tr, en] of VALUE_PAIRS) assert.deepEqual([key, VALUES[key]?.tr, VALUES[key]?.en], [key, tr, en]);
  for (const [key, entry] of Object.entries(VALUES)) {
    assert.equal(typeof entry.en, 'string', key);
    assert.equal(typeof entry.tr, 'string', key);
    assert.notEqual(entry.en.trim(), '', `${key}: empty en`);
    assert.doesNotMatch(entry.en, TR_LETTERS, `${key}: Turkish letter in en "${entry.en}"`);
  }
});

test('Ö-48.12 isValue: the English and the Turkish value match, case-insensitive (Turkish-aware), trimmed', () => {
  const { isValue } = valuesApi();
  for (const [key, tr, en] of VALUE_PAIRS) {
    for (const text of [tr, en, tr.toLocaleUpperCase('tr'), en.toUpperCase(), tr.toLocaleLowerCase('tr'), en.toLowerCase(),
      en[0].toUpperCase() + en.slice(1), `  ${tr}  `, `\t${en}\n`]) {
      assert.equal(isValue(text, key), true, `${JSON.stringify(text)} is ${key}`);
    }
  }
  // Spot checks: Turkish I/İ and English I both lower correctly
  for (const [text, key] of [['AÇIK', 'on'], ['Açık', 'on'], ['KAPALI', 'off'], ['KURULMADI', 'notSetUp'], ['BAŞLANGIÇ', 'setup'],
    ['ÖZELLİK', 'feature'], ['KULLANICI', 'user'], ['OTOMATİK', 'automatic'], ['GEÇTİ', 'passed'], ['HAYIR', 'no'],
    ['FAILED', 'failed'], ['WAITING', 'waiting'], ['LIGHT', 'light'], ['NOT SET UP', 'notSetUp'], ['Not Set Up', 'notSetUp'], ['NOT RUN', 'notRun'],
    ['ONE-WAY', 'oneWay'], ['FULL', 'full'], ['YES', 'yes']]) {
    assert.equal(isValue(text, key), true, `${text} is ${key}`);
  }
});

test('Ö-48.12 isValue: the value followed by a non-letter matches (the rest of the line is a note)', () => {
  const { isValue } = valuesApi();
  for (const [text, key] of [
    ['açık · kapalı konular: yok', 'on'], ['on · closed topics: none', 'on'], ['kapalı · kapalı konular: tasarim', 'off'], ['off · closed topics: design', 'off'],
    ['Setup (adopt)', 'setup'], ['Başlangıç (uyum)', 'setup'], ['yes (2026-10-01)', 'yes'], ['evet, 2026-10-01', 'yes'], ['Tam — every command', 'full'],
    ['Full (all commands)', 'full'], ['failed: timeout', 'failed'], ['kaldı: zaman aşımı', 'failed'], ['tek yönlü', 'oneWay'], ['one-way door', 'oneWay'],
    ['not set up yet', 'notSetUp'], ['kurulmadı.', 'notSetUp'], ['set up 2026-10-20', 'setUp'], ['bekliyor — Ali', 'waiting'], ['hata/regresyon', 'bug'],
  ]) {
    assert.equal(isValue(text, key), true, `${JSON.stringify(text)} is ${key}`);
  }
});

test('Ö-48.13 isValue: an unknown key throws like label(); a non-string text is false', () => {
  const { isValue } = valuesApi();
  for (const bad of ['nope', '', 'On', 'açık', 'toString', '__proto__', 'constructor', 'hasOwnProperty']) {
    assert.throws(() => isValue('açık', bad), undefined, `key ${JSON.stringify(bad)}`);
  }
  for (const text of [null, undefined, 42, true, {}, ['açık'], { toString: () => 'açık' }]) {
    assert.equal(isValue(text, 'on'), false, `${JSON.stringify(text)} is not on`);
  }
  for (const text of ['', '   ', '\t\n']) {
    for (const [key] of VALUE_PAIRS) assert.equal(isValue(text, key), false, `${JSON.stringify(text)} is not ${key}`);
  }
});

test('A-48.9 isValue: a value inside a longer word, the reverse prefix and the "not set up" / "set up" trap do not match', () => {
  const { isValue } = valuesApi();
  for (const [text, key] of [
    ['not set up', 'setUp'], ['Not set up yet', 'setUp'], ['kurulmadı', 'setUp'], ['kuruldu', 'notSetUp'], ['set up', 'notSetUp'],
    ['açıklama', 'on'], ['açıkça', 'on'], ['one-way', 'on'], ['once', 'on'], ['online', 'on'], ['kapalıydı', 'off'], ['offline', 'off'],
    ['yokluk', 'none'], ['nonetheless', 'none'], ['none', 'no'], ['not run', 'no'], ['not set up', 'no'], ['nothing', 'no'], ['hayırlı', 'no'],
    ['Tamam', 'full'], ['Fullstack', 'full'], ['Hafifçe', 'light'], ['Lightweight', 'light'], ['Standartlar', 'standard'], ['Standardize', 'standard'],
    ['bekliyordu', 'waiting'], ['waitinglist', 'waiting'], ['otomatikleştirildi', 'automatic'], ['automatically', 'automatic'], ['auto', 'automatic'],
    ['kullanıcılar', 'user'], ['users', 'user'], ['tekrar', 'oneWay'], ['tekil', 'oneWay'], ['two-way', 'oneWay'], ['çifte', 'twoWay'], ['one-way', 'twoWay'],
    ['evetler', 'yes'], ['yesterday', 'yes'], ['doğrulama', 'right'], ['rightly', 'right'], ['yanlışlık', 'wrong'], ['wrongly', 'wrong'],
    ['geçtik', 'passed'], ['passedby', 'passed'], ['failed', 'passed'], ['kaldırıldı', 'failed'], ['failedover', 'failed'], ['passed', 'failed'],
    ['not running', 'notRun'], ['koşulmadıkça', 'notRun'], ['hatalı', 'bug'], ['bugfix', 'bug'], ['özellikler', 'feature'], ['features', 'feature'],
    ['Setups', 'setup'], ['Başlangıçta', 'setup'], ['- açık', 'on'], ['(on)', 'on'], ['the value is on', 'on'],
  ]) {
    assert.equal(isValue(text, key), false, `${JSON.stringify(text)} is not ${key}`);
  }
});

// ---------- 3. readers: a Turkish file and its English twin read the same ----------

const accountsDoc = (heading, no, yes) => lines('# Accounts and Deadlines', '', '> Dates use the YYYY-AA-GG format.', '', `## ${heading}`, '',
  '| Service | Purpose | Account owner | 2FA | Plan / monthly cost | Expiry / renewal | Key rotation | Note |', '|---|---|---|---|---|---|---|---|',
  '| [GitHub] | Code repository | [email] | [yes/no] | [Free] | - | - | |',
  `| Domain | site | me | ${no} | 300 TL/yr | 2026-11-07 | - | auto-renew? |`,
  `| GitHub | code | me | ${yes} | Free | - | 2026-10-25 | |`,
  `| OpenAI | ai | me | ${yes} | usage | 2026-12-31 | 2026-11-20 | Spend limit: 50 USD |`, '',
  '## Ortamlar (dev / prod)', '', '| Environment | Service | Project ref / URL | Who connects |', '|---|---|---|---|', '| dev | Supabase | devref | local |', '');
const ACCOUNTS = { tr: accountsDoc('Hesaplar', 'hayır', 'evet'), en: accountsDoc('Accounts', 'no', 'yes'), mixed: accountsDoc('Accounts', 'hayır', 'evet') };
// The 2FA cell is shown as written; everything the dashboard decides on must be the same
const noRaw2fa = (rows) => rows.map(({ twoFactor, ...rest }) => rest);

test('Ö-48.14 accounts: "## Accounts" with no / yes reads like "## Hesaplar" with hayır / evet (2FA, expiry, key rotation)', () => {
  const tr = accounts(ACCOUNTS.tr, NOW);
  assert.deepEqual(tr.map((h) => [h.service, h.noTwoFactor, h.dates.map((d) => [d.date, d.left])]), [
    ['Domain', true, [['2026-11-07', 10]]], ['GitHub', false, [['2026-10-25', -3]]], ['OpenAI', false, [['2026-12-31', 64], ['2026-11-20', 23]]],
  ]);
  assert.deepEqual(noRaw2fa(accounts(ACCOUNTS.en, NOW)), noRaw2fa(tr), 'English twin');
  assert.deepEqual(noRaw2fa(accounts(ACCOUNTS.mixed, NOW)), noRaw2fa(tr), 'English heading, Turkish values');
});

const FB_ROWS = [[1, 'bug', 'new', 'speed'], [2, 'request', 'planned', 'PDF'], [3, 'complaint', 'done', 'speed'], [4, 'praise', 'rejected', 'PDF'],
  [5, 'question', 'merged', 'PDF'], [6, 'bug', 'new', 'PDF']];
const FB_TR = { bug: 'hata', request: 'istek', complaint: 'şikayet', praise: 'övgü', question: 'soru', new: 'yeni', planned: 'planlandı', done: 'yapıldı', rejected: 'reddedildi', merged: 'birleşti' };
const feedbackDoc = (inbox, themes, rows) => lines('# User Feedback', '', '> The voice of the users.', '', `## ${inbox}`, '',
  'Types and statuses are listed in the template.', '',
  '| # | Date | Source | User | Summary | Type | Theme | Priority | Status | Task |', '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(([no, kind, state, theme]) => `| ${no} | 2026-10-0${no} | email | K-00${no} | summary ${no} | ${kind} | ${theme} | high | ${state} | |`), '',
  `## ${themes}`, '', 'Similar feedback is collected under one theme.', '',
  '| Theme | Feedback count | Affected feature | Decision |', '|---|---|---|---|', '| speed | 2 | list | |', '| PDF | 5 | invoice | G-030 |', '');
const trRow = ([no, kind, state, theme]) => [no, FB_TR[kind], FB_TR[state], theme];
const FEEDBACK = {
  tr: feedbackDoc('Gelen kutusu', 'Temalar', FB_ROWS.map(trRow)),
  en: feedbackDoc('Inbox', 'Themes', FB_ROWS),
  mixed: feedbackDoc('Inbox', 'Themes', FB_ROWS.map((r, i) => (i % 2 ? r : trRow(r)))),
};

test('Ö-48.15 feedback: "## Inbox" / "## Themes" with English kinds and statuses read like the Turkish file', () => {
  const tr = feedback(FEEDBACK.tr);
  assert.equal(tr.records.length, 6);
  assert.equal(tr.newCount, 2, 'yeni counts as new');
  assert.deepEqual(tr.themes.map((x) => [x.theme, x.count]), [['PDF', 5], ['speed', 2]]);
  const en = feedback(FEEDBACK.en);
  assert.equal(en.newCount, 2, 'new counts as new');
  assert.deepEqual(en, tr, 'English twin: the whole reader output');
  assert.deepEqual(feedback(FEEDBACK.mixed), tr, 'Turkish and English rows in one file');
});

const learningDoc = (h, right, wrong, skipped) => lines('# Learning', '', `## ${h}`, '', '| Date | Task | Concept | Result |', '|---|---|---|---|',
  `| 2026-10-25 | G-01 | validation | ${right} |`, `| 2026-10-25 | G-01 | API | ${wrong} |`,
  `| 2026-10-26 | G-02 | API | ${wrong[0].toLocaleUpperCase('tr')}${wrong.slice(1)} |`, `| 2026-10-26 | G-02 | RLS | ${skipped} |`, '');
const LEARNING = { tr: learningDoc('Kayıtlar', 'doğru', 'yanlış', 'Şimdi değil'), en: learningDoc('Records', 'right', 'wrong', 'not now') };

test('Ö-48.16 learning: right / wrong count like doğru / yanlış; a skipped answer is neither', () => {
  const tr = learning(LEARNING.tr);
  assert.deepEqual([tr.right, tr.wrong], [1, 2]);
  assert.deepEqual(tr.missed.map((m) => [m.concept, m.count]), [['API', 2]]);
  assert.deepEqual(learning(LEARNING.en), tr);
});

const qaDoc = (r) => lines('# QA report 2026-10-20-090000', '', 'Result: see the table.', '', '| Criterion | Result | Evidence | Note |', '|---|---|---|---|',
  `| Ö-01.1 Required field | ${r.passed} | .previews/qa-x/Ö-01.1.png |  |`,
  `| Ö-01.2 List shows the record | ${r.failed} | .previews/qa-x/Ö-01.2.png | Error: not visible |`,
  `| Ö-02.1 PDF downloads | ${r.notRun} |  |  |`,
  `| Ö-02.2 Export | ${r.failed2 ?? r.failed} |  | Error: timeout |`, '');
const QA = { tr: qaDoc(V.tr), en: qaDoc(V.en), mixed: qaDoc({ ...V.en, failed2: V.tr.failed, notRun: V.tr.notRun }) };
const qaView = (s) => s && { passed: s.passed, failed: s.failed, notRun: s.notRun, failures: s.failures.map((f) => [f.criterion, f.evidence, f.note]) };

test('Ö-48.17 qaSummary: passed / failed / not run give the same counts and failures as geçti / kaldı / koşulmadı', () => {
  const tr = qaView(qaSummary(QA.tr));
  assert.deepEqual(tr, { passed: 1, failed: 2, notRun: 1, failures: [
    ['Ö-01.2 List shows the record', '.previews/qa-x/Ö-01.2.png', 'Error: not visible'], ['Ö-02.2 Export', '', 'Error: timeout']] });
  assert.deepEqual(qaView(qaSummary(QA.en)), tr, 'English twin');
  assert.deepEqual(qaView(qaSummary(QA.mixed)), tr, 'Turkish and English rows in one report');
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
const FINDINGS = { tr: findingsDoc('Raporlar', KINDS.tr), en: findingsDoc('Reports', KINDS.en), keys: findingsDoc('Reports', KINDS.keys) };
const HEALTH = { tech: 61, business: 58, security: 70, ux: 80, perf: 90, legal: 75 };

test('Ö-48.18 findingReports: "## Reports" with Tech / Business / ... reads like "## Raporlar" with Teknik / İş / ...', () => {
  const tr = findingReports(FINDINGS.tr);
  assert.equal(tr.rows.length, 7);
  assert.deepEqual(Object.keys(tr.latest).sort(), Object.keys(FINDING_KINDS).sort(), 'every area name maps to its dashboard key');
  assert.deepEqual(Object.fromEntries(Object.entries(tr.latest).map(([k, r]) => [k, r.health])), HEALTH);
  assert.equal(tr.latest.tech.critical, 2);
  assert.deepEqual(findingReports(FINDINGS.en), tr, 'English twin');
  assert.deepEqual(findingReports(FINDINGS.keys), tr, 'the key form (tech, business ...) still reads the same');
});

const alarmsDoc = (h) => lines('# Spend Alarms', '', '> The dashboard reads the table below.', '', `## ${h}`, '',
  'One row per paid service.', '', '| Service | Type | Amount | Alert thresholds | Set up at | Last check |', '|---|---|---|---|---|---|',
  '| Anthropic | cap | 50 USD | 50%, 80% | Console | 2026-10-10 |', '| Vercel | alert | - | | | 2026-08-01 |', '',
  '## Settings the providers offer', '', '| Service | What exists | Does it stop? |', '|---|---|---|', '| OpenAI | budget | no |', '');
const ALARMS = { tr: alarmsDoc('Alarmlar'), en: alarmsDoc('Alarms') };

test('Ö-48.19 spendAlarms: "## Alarms" reads the same rows as "## Alarmlar"', () => {
  const tr = spendAlarms(ALARMS.tr, NOW);
  assert.deepEqual(tr.map((a) => [a.service, a.unset, a.stale]), [['Anthropic', false, false], ['Vercel', true, true]]);
  assert.deepEqual(spendAlarms(ALARMS.en, NOW), tr);
});

const flagsDoc = (h, state, answers) => lines('# Feature flags', '', `## ${h}`, '',
  '| Flag | Purpose | Status | Owner | Added | Removal date | Kill switch tested |', '|---|---|---|---|---|---|---|',
  ...answers.map((a, i) => `| flag_${i} | purpose | ${state} | me | 2026-09-01 | 2026-12-31 | ${a} |`), '');

test('Ö-48.20 flags: kill switch evet / yes / ✅ / var is tested, hayır / no / yok is not, under either heading', () => {
  const answers = ['evet', 'yes', '✅', 'var', 'hayır', 'no', 'yok', 'Yes', 'EVET', 'HAYIR'];
  const want = [false, false, false, false, true, true, true, false, false, true];
  for (const [h, state] of [['Bayraklar', 'açık'], ['Flags', 'on'], ['Flags', 'açık'], ['Bayraklar', 'on']]) {
    assert.deepEqual(flags(flagsDoc(h, state, answers), NOW).map((b) => b.untested), want, `${h} / ${state}`);
  }
});

const BUG_CLASS_PAIRS = [['boş-girdi', 'empty-input'], ['doğrulama', 'validation'], ['yetki', 'authorization'], ['tarih-saat', 'date-time'],
  ['yerel-dil', 'locale'], ['sıralama', 'sorting'], ['eşzamanlılık', 'concurrency'], ['yapılandırma', 'configuration'], ['dış-servis', 'external-service'],
  ['sözleşme', 'contract'], ['arayüz-durumu', 'ui-state']];
const bugSpec = (lang, type, cls) => (lang === 'tr'
  ? lines('# Spec', '', `**Tür:** ${type}`, `**Sınıf:** ${cls}`, '', '## Mevcut davranış', '', '- x', '')
  : lines('# Spec', '', `**Type:** ${type}`, `**Class:** ${cls}`, '', '## Current behavior', '', '- x', ''));
const specs = (list) => Object.fromEntries(list.map(([f, ...a]) => [`docs/product/specs/${f}`, bugSpec(...a)]));

test('Ö-48.21 repeatedBugClasses: a Turkish class and its English name are ONE class, reported under the English name', () => {
  const p = project(specs([
    ['a1.md', 'tr', 'hata', 'yetki'],
    ['a2.md', 'tr', 'hata', 'YETKİ'],
    ['a3.md', 'en', 'bug', 'authorization'],
    ['a4.md', 'en', 'hata', 'yetki'], // English labels, Turkish values (a 3.48 step-2 file)
    ['f1.md', 'en', 'feature', 'authorization'],
    ['f2.md', 'tr', 'özellik', 'yetki'],
  ]));
  assert.deepEqual(repeatedBugClasses(p), [{ cls: 'authorization', specs: ['a1.md', 'a2.md', 'a3.md', 'a4.md'] }]);
});

test('Ö-48.21 repeatedBugClasses: all eleven classes pair up in order; type hata and bug both count as a bug', () => {
  const list = BUG_CLASS_PAIRS.flatMap(([tr, en], i) => {
    const n = String(i + 1).padStart(2, '0');
    return [[`${n}-a.md`, 'tr', 'hata', tr], [`${n}-b.md`, 'en', 'bug', en]];
  });
  assert.deepEqual(repeatedBugClasses(project(specs(list))),
    BUG_CLASS_PAIRS.map(([, en], i) => ({ cls: en, specs: [`${String(i + 1).padStart(2, '0')}-a.md`, `${String(i + 1).padStart(2, '0')}-b.md`] })));
  // Only English files: the same result
  const onlyEn = BUG_CLASS_PAIRS.flatMap(([, en], i) => {
    const n = String(i + 1).padStart(2, '0');
    return [[`${n}-a.md`, 'en', 'bug', en], [`${n}-b.md`, 'en', 'Bug', en.toUpperCase()]];
  });
  assert.deepEqual(repeatedBugClasses(project(specs(onlyEn))).map((r) => r.cls), BUG_CLASS_PAIRS.map(([, en]) => en));
});

const KIT = { version: '3.48.0', type: 'web-saas', addons: [], tool: null, lang: 'en', created: '2026-10-01', updated: '2026-10-01', files: {} };
const CACHE = () => ({ time: Date.now(), data: { runs: [], prs: [], liveMonitoring: [] } });

test('Ö-48.22 readStatus: no board Status line or no board file is the not-set-up value; set up / kuruldu stay set up', () => {
  const { isValue } = valuesApi();
  const noStatus = {
    tr: lines('# Expert Board', '', '**Commit denetimi:** açık', '', '## Üyeler', ''),
    en: lines('# Expert Board', '', '**Commit review:** on', '', '## Members', ''),
  };
  for (const v of ['tr', 'en']) {
    const s = readStatus(project({ '.kit.json': KIT, 'docs/workflow/board.md': noStatus[v] })).board.state;
    assert.equal(isValue(s, 'notSetUp'), true, `${v} board without a Status line: "${s}"`);
  }
  const none = readStatus(project({ '.kit.json': KIT })).board.state;
  assert.equal(isValue(none, 'notSetUp'), true, `no board file: "${none}"`);
  for (const board of ['**Status:** set up\n', '**Durum:** kuruldu\n', '**Status:** kuruldu\n']) {
    const s = readStatus(project({ '.kit.json': KIT, 'docs/workflow/board.md': board })).board.state;
    assert.equal(isValue(s, 'setUp'), true, `${board.trim()}: "${s}"`);
    assert.equal(isValue(s, 'notSetUp'), false, `${board.trim()}: not "not set up"`);
  }
});

test('Ö-48.22 readStatus: handoff "**Status:** waiting" is pending like "**Durum:** bekliyor"', () => {
  const pending = (text) => readStatus(project({ '.kit.json': KIT, 'docs/workflow/handoff.md': text })).handoffPending;
  for (const text of ['# Handoff note\n\n**Status:** waiting\n', '# Handoff note\n\n**Durum:** bekliyor\n', '# Handoff note\n\n**Status:** bekliyor\n',
    '# Handoff note\n\n**Status:** Waiting\n', '# Handoff note\r\n\r\n**Status:** waiting\r\n']) {
    assert.equal(pending(text), true, JSON.stringify(text));
  }
  for (const text of ['# Handoff note\n\n**Status:** taken over\n', '# Handoff note\n\n**Durum:** devralındı\n', '# Handoff note\n\nwaiting for Ali\n',
    '# Handoff note\n\n**Status:** waitinglist\n']) {
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

const LBL = {
  tr: { lastUpdated: 'Son güncelleme', activePhase: 'Aktif faz', activeTask: 'Aktif görev', setupStep: 'Başlangıç adımı', questionMode: 'Soru modu',
    profile: 'Profil', currentState: 'Şu anki durum', nextStep: 'Sıradaki adım', pending: 'Bekleyen kararlar', leftOff: 'Kaldığı yer',
    issues: 'Açık sorunlar / bloklayıcılar', status: 'Durum', commitReview: 'Commit denetimi', members: 'Üyeler', meetingLog: 'Toplantı günlüğü',
    decisionLog: 'Karar günlüğü', phase: 'Faz', flags: 'Bayraklar', records: 'Kayıtlar', maintenanceLog: 'Bakım kaydı', accounts: 'Hesaplar',
    inbox: 'Gelen kutusu', themes: 'Temalar', reports: 'Raporlar', alarms: 'Alarmlar', direction: '1. Seçilen yön (Chosen direction)',
    valueProp: '3. Değer önerisi (value proposition)', criticalFlows: '1. Kritik akışlar (critical flows; automatic test REQUIRED)',
    closedTopics: 'kapalı konular', topic: 'tasarim', phaseValue: 'Faz 1 — Core', meetingResult: 'ONAY' },
  en: { lastUpdated: 'Last updated', activePhase: 'Active phase', activeTask: 'Active task', setupStep: 'Setup step', questionMode: 'Question mode',
    profile: 'Profile', currentState: 'Current state', nextStep: 'Next step', pending: 'Pending decisions', leftOff: 'Where we left off',
    issues: 'Open issues / blockers', status: 'Status', commitReview: 'Commit review', members: 'Members', meetingLog: 'Meeting log',
    decisionLog: 'Decision log', phase: 'Phase', flags: 'Flags', records: 'Records', maintenanceLog: 'Maintenance log', accounts: 'Accounts',
    inbox: 'Inbox', themes: 'Themes', reports: 'Reports', alarms: 'Alarms', direction: '1. Chosen direction',
    valueProp: '3. Value proposition', criticalFlows: '1. Critical flows (automatic test REQUIRED)',
    // Topic words stay as written in this step (they move to English later): the same word in both twins
    closedTopics: 'closed topics', topic: 'tasarim', phaseValue: 'Phase 1 — Core', meetingResult: 'APPROVE' },
};

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

// One project per language: every file the dashboard reads, labels AND values in that language.
function twin(v, over = {}) {
  const l = LBL[v], x = V[v];
  const files = {
    '.kit.json': KIT,
    '.claude/state/github-cache.json': CACHE(),
    // Every light command name-only: the command list is "light", so a Full profile raises the light-list alert
    '.claude/settings.json': { skillOverrides: Object.fromEntries(LIGHT_COMMANDS.map((c) => [c, 'name-only'])) },
    'AGENTS.md': '# Twin Project\n',
    'docs/workflow/progress.md': progressDoc(l, { phase: l.phaseValue, mode: `${x.off} · ${l.closedTopics}: ${l.topic}`, profile: x.full }),
    'docs/product/roadmap.md': lines('# Roadmap', '', `## ${l.phase} 0 — Setup (skeleton)`, '', '- [x] G-001: Repo ready', '',
      `## ${l.phase} 1 — Core`, '', '- [x] G-010: Auth', '- [ ] G-011: Data model', ''),
    'docs/decisions/log.md': decisionsDoc(l, [[1, 'teknik', 'Database?', 'Postgres', x.oneWay, x.user], [2, 'tasarim', 'Font?', 'Inter', x.twoWay, x.automatic],
      [3, 'teknik', 'Queue?', 'none yet', x.oneWay, x.automatic]]),
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
    'docs/product/feedback.md': v === 'tr' ? FEEDBACK.tr : FEEDBACK.en,
    'docs/findings/README.md': v === 'tr' ? FINDINGS.tr : FINDINGS.en,
    'docs/workflow/learning.md': LEARNING[v],
    'docs/quality/qa/2026-10-20-090000.md': QA[v],
    ...specs([['2026-10-01-a.md', v, x.bug, v === 'tr' ? 'yetki' : 'authorization'], ['2026-10-02-b.md', v, x.bug, v === 'tr' ? 'yetki' : 'authorization']]),
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

test('Ö-48.26 dashboard: an English project and its Turkish twin raise the same alerts and show the same counts', () => {
  const tr = project(twin('tr'));
  const en = project(twin('en'));
  const [htr, hen] = [dashboard(tr), dashboard(en)];
  const want = msgs(en, [
    ['dashboard.alert.handoffPending'], ['dashboard.alert.boardNotSetUp'], ['dashboard.alert.cmdListLight'],
    ['dashboard.alert.closedTopics', { topics: 'tasarim' }], ['dashboard.alert.newFeedback', { count: 2 }],
    ['dashboard.alert.noTwoFactor', { service: 'Domain' }], ['dashboard.alert.spendUnset', { service: 'Vercel' }],
    ['dashboard.alert.findingsCritical', { kind: t(en, 'dashboard.findingKind.tech'), critical: 2, health: 61 }],
    ['dashboard.alert.repeatedBug', { count: 2, cls: 'authorization', specs: '2026-10-01-a.md, 2026-10-02-b.md' }],
    ['dashboard.alert.flagsOverdue', { count: 1, names: 'new_pdf' }],
  ]);
  const aen = alertsOf(en, hen);
  for (const w of want) assert.equal(aen.some((a) => a.includes(w)), true, `English project alert: ${w}\n${aen.join('\n')}`);
  const heavy = unMd(t(en, 'dashboard.alert.cmdListHeavy', { mode: '' })).split(':')[0];
  assert.equal(aen.some((a) => a.includes(heavy)), false, 'a Full profile is not "heavy list"');
  assert.deepEqual(aen, alertsOf(tr, htr), 'the same alerts, in the same order');

  const ken = kpisOf(hen);
  assert.deepEqual(ken, kpisOf(htr), 'every KPI label, value and note');
  const kpi = (label) => ken.find(([l]) => l === t(en, label));
  assert.deepEqual(kpi('dashboard.kpiDecisions'), [t(en, 'dashboard.kpiDecisions'), '3', t(en, 'dashboard.usersAuto', { user: 1, auto: 2 })]);
  assert.equal(kpi('dashboard.kpiNew')[1], '2', 'new feedback');
  assert.equal(kpi('dashboard.kpiPlanned')[1], '1', 'planned feedback');
  assert.deepEqual([kpi('dashboard.kpiRight')[1], kpi('dashboard.kpiWrong')[1]], ['1', '2'], 'learning');
  assert.deepEqual([kpi('dashboard.passed')[1], kpi('dashboard.failed')[1], kpi('dashboard.notRun')[1]], ['1', '2', '1'], 'last QA');

  const chips = (p, h) => chipsOf(p, h).map((c) => c.text);
  assert.deepEqual(chips(en, hen), chips(tr, htr), 'decision filter chips');
  for (const c of [`${t(en, 'dashboard.all')} (3)`, `${t(en, 'dashboard.auto')} (2)`, `${t(en, 'dashboard.oneWay')} (2)`]) {
    assert.equal(chips(en, hen).includes(c), true, `chip ${c}: ${chips(en, hen).join(' | ')}`);
  }
  for (const caption of [t(en, 'dashboard.tested'), t(en, 'dashboard.untested'), t(en, 'dashboard.none')]) {
    assert.equal(count(hen, `</span> ${caption}</span>`), count(htr, `</span> ${caption}</span>`), `badge "${caption}"`);
  }
  assert.equal(count(hen, `</span> ${t(en, 'dashboard.untested')}</span>`), 1, 'one flag without a tested kill switch');
});

test('Ö-48.27 dashboard: critical flows, design direction and value proposition read from the English headings', () => {
  const tr = project(twin('tr'));
  const en = project(twin('en'));
  const [htr, hen] = [dashboard(tr), dashboard(en)];
  const flows = (p, h) => after_(h, `${t(p, 'dashboard.criticalFlowTests')}</h3>`, '</section>');
  const design = (p, h) => after_(h, `<h3>${t(p, 'dashboard.design')}</h3>`, '</section>');
  const value = (p, h) => after_(h, `<h4>${t(p, 'dashboard.valueProp')}</h4>`, '</p>');
  for (const [p, h, v] of [[tr, htr, 'tr'], [en, hen, 'en']]) {
    assert.match(plain(flows(p, h)), /K1 Sign-up \/ sign-in \/ sign-out e2e tests\/auth\.spec\.ts/, `${v}: critical flow K1`);
    assert.match(plain(flows(p, h)), /K2 Authorization: a user cannot see another user's data integration/, `${v}: critical flow K2`);
    assert.equal(flows(p, h).includes(t(p, 'dashboard.noTestPlan')), false, `${v}: not the empty state`);
    assert.match(plain(design(p, h)), /Style direction Swiss grid Font pair Inter \+ IBM Plex Mono/, `${v}: design direction`);
    assert.equal(design(p, h).includes(t(p, 'dashboard.noDesign')), false, `${v}: design not empty`);
    assert.match(plain(value(p, h)), /With Fatura, freelancers send an invoice in one minute, because the data is already there\./, `${v}: value proposition`);
  }
  assert.equal(flows(en, hen), flows(tr, htr));
  assert.equal(design(en, hen), design(tr, htr));
  assert.equal(value(en, hen), value(tr, htr));
});

test('Ö-48.28 dashboard: board not set up alerts outside Setup only; the handoff alert action is /handoff take', () => {
  for (const v of ['tr', 'en']) {
    const x = V[v], l = LBL[v];
    const notSetUp = t(project({ '.kit.json': KIT }), 'dashboard.alert.boardNotSetUp');
    const html = (over) => { const p = project(twin(v, over)); return { p, h: dashboard(p) }; };
    // Not set up in phase 1: alert; the same in Setup: no alert, the setup step is shown; board file missing: alert; set up: no alert
    let { p, h } = html({});
    assert.equal(alertsOf(p, h).some((a) => a.includes(notSetUp)), true, `${v}: not set up, phase 1`);
    ({ p, h } = html({ 'docs/workflow/progress.md': progressDoc(l, { phase: x.setup, step: '4/9', mode: x.on, profile: x.full }) }));
    assert.equal(alertsOf(p, h).some((a) => a.includes(notSetUp)), false, `${v}: phase "${x.setup}" is setup, no board alert`);
    assert.equal(h.includes(`${t(p, 'dashboard.startStep')}</div><div class="num">4/9</div>`), true, `${v}: the setup step is shown in phase "${x.setup}"`);
    ({ p, h } = html({ 'docs/workflow/board.md': null }));
    assert.equal(alertsOf(p, h).some((a) => a.includes(notSetUp)), true, `${v}: no board file`);
    ({ p, h } = html({ 'docs/workflow/board.md': boardDoc(l, x.setUp, x.on) }));
    assert.equal(alertsOf(p, h).some((a) => a.includes(notSetUp)), false, `${v}: set up`);
    // The handoff alert
    ({ p, h } = html({}));
    const handoff = alertsOf(p, h).find((a) => a.includes(unMd(t(p, 'dashboard.alert.handoffPending'))));
    assert.match(handoff ?? '', /\/handoff take/, `${v}: take-over action`);
    assert.doesNotMatch(h, /\/handoff devral/, `${v}: the old Turkish command is gone`);
  }
});

test('Ö-48.23 dashboard (Turkish UI): "set up" / "not set up" and on / off are recognised like kuruldu / kurulmadı and açık / kapalı', () => {
  const kit = { ...KIT, lang: 'tr' };
  for (const [l, x] of [[LBL.tr, V.tr], [LBL.en, V.en]]) {
    for (const [state, review, wantState, wantReview] of [[x.setUp, x.off, 'dashboard.boardSetUp', 'dashboard.off'], [x.notSetUp, x.on, 'dashboard.notSetUp', 'dashboard.on']]) {
      const p = project({ '.kit.json': kit, '.claude/state/github-cache.json': CACHE(), 'AGENTS.md': '# P\n', 'docs/workflow/board.md': boardDoc(l, state, review) });
      const h = dashboard(p);
      assert.equal(h.includes(`<h3>${t(p, 'dashboard.members')} · ${t(p, wantState)}</h3>`), true, `${state}: board heading`);
      assert.equal(h.includes(t(p, 'dashboard.commitReview', { value: t(p, wantReview) })), true, `${review}: commit review`);
    }
  }
});

// ---------- status line and session start ----------

function statusline(p) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'statusline.mjs')], { input: JSON.stringify({ workspace: { project_dir: p } }), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
const questionPart = (p, out) => out.split(' · ').find((s) => s.startsWith(t(p, 'statusline.question', { mode: '' }))) ?? `(no question part in: ${out})`;
const progressOnly = (v, opts) => project({ '.kit.json': KIT, 'AGENTS.md': '# P\n', 'docs/workflow/progress.md': progressDoc(LBL[v], { phase: 'Phase 1 — Core', profile: V[v].standard, ...opts }) });

test('Ö-48.24 statusline: "off · closed topics: tasarim" renders like "kapalı · kapalı konular: tasarim"; "none" is hidden like "yok"', () => {
  // The topic word is shown exactly as written (topics move to English in a later step)
  const en = progressOnly('en', { mode: 'off · closed topics: tasarim' });
  const tr = progressOnly('tr', { mode: 'kapalı · kapalı konular: tasarim' });
  const want = t(en, 'statusline.question', { mode: `${t(en, 'statusline.modeOff')} ${t(en, 'statusline.closed', { topics: 'tasarim' })}` });
  assert.equal(questionPart(en, statusline(en)), want);
  assert.equal(questionPart(tr, statusline(tr)), want);
  const open = t(en, 'statusline.question', { mode: t(en, 'statusline.modeOpen') });
  for (const [v, mode] of [['en', 'on · closed topics: none'], ['tr', 'açık · kapalı konular: yok'], ['en', 'on'], ['tr', 'açık'], ['en', 'On · Closed topics: None'], ['en', undefined], ['tr', undefined]]) {
    const p = progressOnly(v, { mode });
    assert.equal(questionPart(p, statusline(p)), open, `${v}: ${mode}`);
  }
  for (const [v, mode] of [['en', 'off'], ['tr', 'kapalı'], ['en', 'off · closed topics: none']]) {
    const p = progressOnly(v, { mode });
    assert.equal(questionPart(p, statusline(p)), t(p, 'statusline.question', { mode: t(p, 'statusline.modeOff') }), `${v}: ${mode}`);
  }
});

test('Ö-48.25 statusline: phase "Setup" shows the setup step like "Başlangıç"', () => {
  for (const v of ['tr', 'en']) {
    const p = progressOnly(v, { phase: V[v].setup, step: '3/9', mode: V[v].on });
    const out = statusline(p);
    assert.equal(out.includes(t(p, 'statusline.step', { step: '3/9' })), true, `${v}: ${out}`);
    assert.equal(out.includes(t(p, 'statusline.task', { done: 0, total: 0 })), false, `${v}: no task count in setup: ${out}`);
  }
});

function sessionStart(p) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'session-start.mjs')], {
    input: '{}', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, HOME: p, USERPROFILE: p },
  });
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  return { context: o.hookSpecificOutput.additionalContext, screen: o.systemMessage ?? '' };
}

test('Ö-48.29 session-start: Setup (adopt) / Başlangıç (uyum) suggest /adopt, Setup / Başlangıç suggest /start', () => {
  for (const [v, phase, command] of [['en', 'Setup (adopt)', '/adopt'], ['tr', 'Başlangıç (uyum)', '/adopt'], ['en', 'Setup', '/start'], ['tr', 'Başlangıç', '/start']]) {
    const p = progressOnly(v, { phase, step: '3/9', mode: V[v].on });
    const { context } = sessionStart(p);
    assert.match(context, new RegExp(`${command} was left unfinished \\(step 3/9\\)`), `${v} "${phase}"`);
    const other = command === '/adopt' ? '/start' : '/adopt';
    assert.doesNotMatch(context, new RegExp(`${other} was left unfinished`), `${v} "${phase}": not ${other}`);
  }
});

test('Ö-48.29 session-start: a missing Question mode line is shown as "on"', () => {
  for (const v of ['tr', 'en']) {
    const { context } = sessionStart(progressOnly(v, { mode: undefined }));
    assert.match(context, /Question mode: on · Board:/, v);
  }
});

test('Ö-48.29 session-start: a waiting handoff note suggests /handoff take (English and Turkish UI)', () => {
  for (const lang of ['en', 'tr']) {
    for (const v of ['tr', 'en']) {
      const p = project({ ...twin(v), '.kit.json': { ...KIT, lang } });
      const { context, screen } = sessionStart(p);
      assert.match(context, /\/handoff take/, `${lang} UI, ${v} file: context`);
      assert.doesNotMatch(`${context}\n${screen}`, /devral/, `${lang} UI, ${v} file: no Turkish command`);
    }
  }
});

// ---------- 4. qa-report writes English values ----------

const suite = (cases) => `<testsuites><testsuite>${cases}</testsuite></testsuites>`;
// The Result cell of every criterion row (rows start with the criterion id)
const resultColumn = (text) => text.split(/\r?\n/).filter((l) => /^\| Ö-\d\d\.\d+ /.test(l)).map((l) => l.split('|')[2].trim());
function qaRun(junit) {
  const p = project({
    'docs/product/prd.md': '# PRD\n\n- [ ] Ö-01.1: Required field\n- [ ] Ö-01.2: List shows the record\n- [ ] Ö-02.1: PDF downloads\n',
    'test-results-qa/junit.xml': suite(junit),
  });
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'qa-report.mjs')], { cwd: p, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  const dir = path.join(p, 'docs/quality/qa');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
  assert.equal(files.length, 1, `one report written: ${r.stdout}${r.stderr}`);
  return { r, text: fs.readFileSync(path.join(dir, files[0]), 'utf8') };
}

test('Ö-48.30 qa-report: a new report writes passed / failed / not run, never geçti / kaldı / koşulmadı; a failure exits 1', () => {
  const { r, text } = qaRun('<testcase name="Ö-01.1 required" classname="qa"/><testcase name="Ö-01.2 list" classname="qa"><failure message="x">Error: not visible</failure></testcase>');
  assert.equal(r.status, 1, 'a failed criterion makes the exit code red');
  assert.match(text, /^\| Ö-01\.1 Required field \| passed \| /m);
  assert.match(text, /^\| Ö-01\.2 List shows the record \| failed \| [^|]* \| Error: not visible \|$/m);
  assert.match(text, /^\| Ö-02\.1 PDF downloads \| not run \| /m);
  // The title, header and summary line are localized UI text; the Result column is the value the dashboard reads
  assert.deepEqual(resultColumn(text), ['passed', 'failed', 'not run']);
  const s = qaSummary(text);
  assert.deepEqual([s.passed, s.failed, s.notRun], [1, 1, 1], 'the dashboard reads the new report');
});

test('Ö-48.30 qa-report: all green writes only "passed" and exits 0', () => {
  const { r, text } = qaRun('<testcase name="Ö-01.1 a"/><testcase name="Ö-01.2 b"/><testcase name="Ö-02.1 c"/>');
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
  const p = project(twin('en'));
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

test('Ö-48.32 dashboard: the decision filters still work after the rename (one row per decision, All shows the total)', () => {
  for (const v of ['tr', 'en']) filtersWork(project(twin(v)), v);
});

function filtersWork(p, v) {
  const html = dashboard(p);
  const chips = chipsOf(p, html);
  const keyOf = (c) => c.attrs.match(/\sdata-[\w-]+="([^"]*)"/)?.[1] ?? null;
  const all = chips[0];
  assert.equal(all?.text, `${t(p, 'dashboard.all')} (3)`, `${v}: the first chip is All with the total`);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
  // The table the script filters exists and holds one row per decision
  const tableId = script.match(/querySelectorAll\('#([\w-]+) tbody tr'\)/)?.[1];
  assert.equal(typeof tableId, 'string', `${v}: the script filters a table by id`);
  const table = after_(html, `<table id="${tableId}">`, '</table>');
  const rows = [...after_(table, '<tbody>', '</tbody>').matchAll(/<tr\b([^>]*)>/g)].map((m) => [...m[1].matchAll(/\sdata-[\w-]+="([^"]*)"/g)].map((d) => d[1]));
  assert.equal(rows.length, 3, `${v}: one row per decision`);
  assert.equal(script.includes(`'${keyOf(all)}'`), true, `${v}: the script knows the All key "${keyOf(all)}"`);
  for (const [label, n] of [['dashboard.auto', 2], ['dashboard.oneWay', 2]]) {
    const chip = chips.find((c) => c.text === `${t(p, label)} (${n})`);
    assert.equal(typeof chip?.attrs, 'string', `${v}: ${label} chip`);
    const key = keyOf(chip);
    assert.equal(rows.filter((r) => r.includes(key)).length, n, `${v} ${label}: rows carrying "${key}"`);
    assert.equal(script.includes(`'${key}'`), true, `${v} ${label}: the script knows "${key}"`);
  }
}

// ---------- adversarial ----------

test('A-48.10 a value word in free text or another column does not change the result', () => {
  for (const v of ['tr', 'en']) {
    const x = V[v];
    // Decisions: only the Decided by column makes an auto decision, only the Door column a one-way door
    const p = project(twin(v, { 'docs/decisions/log.md': decisionsDoc(LBL[v], [
      [1, 'teknik', 'otomatik mi? automatic? tek mi? one-way?', 'otomatik / automatic', x.twoWay, x.user],
      [2, 'teknik', 'Is the board on (açık)?', 'tek / one-way', x.twoWay, x.user]]) }));
    const html = dashboard(p);
    const chips = chipsOf(p, html).map((c) => c.text);
    assert.equal(chips.includes(`${t(p, 'dashboard.auto')} (0)`), true, `${v}: no auto decision: ${chips.join(' | ')}`);
    assert.equal(chips.includes(`${t(p, 'dashboard.oneWay')} (0)`), true, `${v}: no one-way door: ${chips.join(' | ')}`);
    const k = kpisOf(html).find(([l]) => l === t(p, 'dashboard.kpiDecisions'));
    assert.deepEqual(k, [t(p, 'dashboard.kpiDecisions'), '2', t(p, 'dashboard.usersAuto', { user: 2, auto: 0 })], v);
  }
  // Feedback: "new" / "yeni" in the summary or theme is not a new item
  const fb = feedback(feedbackDoc('Inbox', 'Themes', [[1, 'bug', 'done', 'new'], [2, 'hata', 'yapıldı', 'yeni']]).replace('summary 1', 'new yeni planned').replace('summary 2', 'yeni new planlandı'));
  assert.equal(fb.newCount, 0);
  // Learning: the concept column does not decide the result
  const l = learning(lines('## Records', '', '| Date | Task | Concept | Result |', '|---|---|---|---|', '| 2026-10-25 | G-01 | right | wrong |', '| 2026-10-25 | G-01 | doğru | yanlış |'));
  assert.deepEqual([l.right, l.wrong], [0, 2]);
  // Flags: "yes" in the purpose does not test the kill switch
  assert.deepEqual(flags(flagsDoc('Flags', 'on', ['no', 'hayır']).replace(/\| purpose \|/g, '| yes evet ✅ |'), NOW).map((b) => b.untested), [true, true]);
  // Accounts: "no" in the purpose or note does not mean no 2FA
  const acc = accounts(lines('## Accounts', '', '| Service | Purpose | Owner | 2FA | Plan | Expiry | Key | Note |', '|---|---|---|---|---|---|---|---|',
    '| Domain | no | hayır | yes | no | - | - | no |'), NOW);
  assert.equal(acc[0]?.noTwoFactor, false);
});

test('A-48.11 an unknown value is shown as it is, never mapped to on / off', () => {
  for (const v of ['tr', 'en']) {
    const p = progressOnly(v, { mode: 'maybe' });
    assert.equal(questionPart(p, statusline(p)), t(p, 'statusline.question', { mode: 'maybe' }), `${v}: status line`);
    assert.match(sessionStart(p).context, /Question mode: maybe · Board:/, `${v}: session start`);
    const d = project(twin(v, { 'docs/workflow/progress.md': progressDoc(LBL[v], { phase: LBL[v].phaseValue, mode: 'maybe', profile: V[v].full }) }));
    const html = dashboard(d);
    assert.equal(html.includes(`${t(d, 'dashboard.questionMode')}</div><div>maybe</div>`), true, `${v}: dashboard`);
    assert.equal(alertsOf(d, html).some((a) => a.includes(unMd(t(d, 'dashboard.alert.closedTopics', { topics: '' })).split(':')[0])), false, `${v}: no closed-topics alert`);
  }
  const s = qaSummary(qaDoc({ passed: 'maybe', failed: 'geçmedi', notRun: 'skipped' }));
  assert.deepEqual([s.passed, s.failed, s.notRun], [0, 0, 0], 'unknown QA results are not counted');
  assert.equal(feedback(feedbackDoc('Inbox', 'Themes', [[1, 'bug', 'maybe', 'x'], [2, 'bug', 'newish', 'x']])).newCount, 0);
});

test('A-48.12 CRLF and a BOM give the same reader result as LF, in both languages', () => {
  for (const v of ['tr', 'en']) {
    assert.deepEqual(feedback(crlfBom(FEEDBACK[v])), feedback(FEEDBACK[v]), `${v}: feedback`);
    assert.deepEqual(accounts(crlfBom(ACCOUNTS[v]), NOW), accounts(ACCOUNTS[v], NOW), `${v}: accounts`);
    assert.deepEqual(learning(crlfBom(LEARNING[v])), learning(LEARNING[v]), `${v}: learning`);
    assert.deepEqual(qaSummary(crlfBom(QA[v])), qaSummary(QA[v]), `${v}: qaSummary`);
    assert.deepEqual(findingReports(crlfBom(FINDINGS[v])), findingReports(FINDINGS[v]), `${v}: findingReports`);
    assert.deepEqual(spendAlarms(crlfBom(ALARMS[v]), NOW), spendAlarms(ALARMS[v], NOW), `${v}: spendAlarms`);
  }
  // And the English CRLF file still equals the Turkish LF file
  assert.deepEqual(feedback(crlfBom(FEEDBACK.en)), feedback(FEEDBACK.tr));
  assert.deepEqual(learning(crlfBom(LEARNING.en)), learning(LEARNING.tr));
  const status = readStatus(project({ '.kit.json': KIT, 'docs/workflow/handoff.md': crlfBom('# Handoff note\n\n**Status:** waiting\n') }));
  assert.equal(status.handoffPending, true, 'handoff with CRLF and BOM');
});
