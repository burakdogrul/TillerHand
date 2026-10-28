// Run: node --test "kit/tests/*.test.mjs"
// Label dictionary (3.48.0): hooks read TR or EN labels from user project files. labels.mjs holds the approved
// TR→EN pairs, normalize() rewrites TR labels to EN only in label positions, verdict() reads board results in both.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded per test so each test reports its own failure while the module does not exist yet.
const load = () => import('../../.claude/hooks/labels.mjs');

const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;

// Source of truth: the approved 3.48.0 label dictionary.
const REQUIRED = [
  ['lastUpdated', 'Son güncelleme', 'Last updated'],
  ['activePhase', 'Aktif faz', 'Active phase'],
  ['activeTask', 'Aktif görev', 'Active task'],
  ['setupStep', 'Başlangıç adımı', 'Setup step'],
  ['questionMode', 'Soru modu', 'Question mode'],
  ['profile', 'Profil', 'Profile'],
  ['currentState', 'Şu anki durum', 'Current state'],
  ['doneLastSession', 'Son oturumda yapılanlar', 'Done last session'],
  ['nextStep', 'Sıradaki adım', 'Next step'],
  ['pendingDecisions', 'Bekleyen kararlar', 'Pending decisions'],
  ['whereWeLeftOff', 'Kaldığı yer', 'Where we left off'],
  ['openIssues', 'Açık sorunlar / bloklayıcılar', 'Open issues / blockers'],
  ['status', 'Durum', 'Status'],
  ['commitReview', 'Commit denetimi', 'Commit review'],
  ['members', 'Üyeler', 'Members'],
  ['meetingLog', 'Toplantı günlüğü', 'Meeting log'],
  ['decisionLog', 'Karar günlüğü', 'Decision log'],
  ['phase', 'Faz', 'Phase'],
  ['commands', 'Komutlar', 'Commands'],
  ['dev', 'geliştirme', 'dev'],
  ['preview', 'önizleme', 'preview'],
  ['typeCheck', 'tip kontrol', 'type check'],
  ['type', 'Tür', 'Type'],
  ['class', 'Sınıf', 'Class'],
  ['mustNotChange', 'Değişmemesi gereken davranış', 'Behavior that must not change'],
  ['priority', 'Öncelik', 'Priority'],
  ['outOfScope', 'Kapsam dışı', 'Out of scope'],
  ['chosenTech', 'Seçilen teknolojiler', 'Chosen technologies'],
  ['maintenanceLog', 'Bakım kaydı', 'Maintenance log'],
  ['flags', 'Bayraklar', 'Flags'],
  ['records', 'Kayıtlar', 'Records'],
  ['unreleased', 'Yayınlanmamış', 'Unreleased'],
];

const UNIT_ECONOMICS = [
  ['Para birimi', 'Currency'],
  ['Fiyat (kullanıcı başı aylık)', 'Price (per user, monthly)'],
  ['Ödeme komisyonu (%)', 'Payment fee (%)'],
  ['Sabit aylık maliyet', 'Fixed monthly cost'],
  ['Kullanıcı başı değişken maliyet (aylık)', 'Variable cost per user (monthly)'],
  ['Hedef aktif kullanıcı', 'Target active users'],
  ['Ücretsiz kullanıcı oranı (%)', 'Free user share (%)'],
];

const PROGRESS_TR = [
  '# Progress',
  '',
  '**Son güncelleme:** 2026-10-28',
  '**Aktif faz:** Başlangıç',
  '**Aktif görev:** /start',
  '**Başlangıç adımı:** 0/9',
  '**Soru modu:** açık · kapalı konular: yok',
  '**Profil:** -',
  '',
  '## Şu anki durum',
  '',
  'Proje başlamadı. Aktif faz henüz yok.',
  '',
  '## Son oturumda yapılanlar',
  '',
  '## Sıradaki adım',
  '',
  '## Bekleyen kararlar',
  '',
  '## Kaldığı yer (if stopped because of a limit or midway)',
  '',
  '## Açık sorunlar / bloklayıcılar',
  '',
  '## Watch out (notes for the AI)',
  '',
];

const PROGRESS_EN = [
  '# Progress',
  '',
  '**Last updated:** 2026-10-28',
  '**Active phase:** Başlangıç',
  '**Active task:** /start',
  '**Setup step:** 0/9',
  '**Question mode:** açık · kapalı konular: yok',
  '**Profile:** -',
  '',
  '## Current state',
  '',
  'Proje başlamadı. Aktif faz henüz yok.',
  '',
  '## Done last session',
  '',
  '## Next step',
  '',
  '## Pending decisions',
  '',
  '## Where we left off (if stopped because of a limit or midway)',
  '',
  '## Open issues / blockers',
  '',
  '## Watch out (notes for the AI)',
  '',
];

const AGENTS_TR = [
  '## Komutlar',
  '',
  '```bash',
  '# /start fills these in for the chosen stack',
  'geliştirme:  [ ]',
  'önizleme:    [ ]',
  'test:        [ ]',
  'lint:        [ ]',
  'tip kontrol: [ ]',
  'build:       [ ]',
  '```',
  '',
  '## Definition of "done"',
  '',
  '```bash',
  'geliştirme: npm run dev',
  '```',
  'geliştirme: outside the Commands block',
  '',
];

const AGENTS_EN = [
  '## Commands',
  '',
  '```bash',
  '# /start fills these in for the chosen stack',
  'dev:  [ ]',
  'preview:    [ ]',
  'test:        [ ]',
  'lint:        [ ]',
  'type check: [ ]',
  'build:       [ ]',
  '```',
  '',
  '## Definition of "done"',
  '',
  '```bash',
  'geliştirme: npm run dev',
  '```',
  'geliştirme: outside the Commands block',
  '',
];

test('AC-48.1 LABELS: every required key maps the approved TR label to its EN label', async () => {
  const { LABELS } = await load();
  for (const [key, tr, en] of REQUIRED) assert.deepEqual([key, LABELS[key]?.tr, LABELS[key]?.en], [key, tr, en]);
  const pairs = Object.values(LABELS).map(({ en, tr }) => `${tr} => ${en}`);
  for (const [tr, en] of UNIT_ECONOMICS) assert.ok(pairs.includes(`${tr} => ${en}`), `unit-economics input missing: ${tr}`);
});

test('AC-48.1 LABELS: every entry has non-empty en and tr, and en has no Turkish letters', async () => {
  const { LABELS } = await load();
  for (const [key, entry] of Object.entries(LABELS)) {
    assert.equal(typeof entry.en, 'string', key);
    assert.equal(typeof entry.tr, 'string', key);
    assert.notEqual(entry.en.trim(), '', `${key}: empty en`);
    assert.notEqual(entry.tr.trim(), '', `${key}: empty tr`);
    assert.doesNotMatch(entry.en, TR_LETTERS, `${key}: Turkish letter in en "${entry.en}"`);
  }
});

test('AC-48.1 label(): returns the EN string and throws on an unknown key', async () => {
  const { label } = await load();
  assert.equal(label('activePhase'), 'Active phase');
  assert.equal(label('whereWeLeftOff'), 'Where we left off');
  assert.equal(label('typeCheck'), 'type check');
  for (const bad of ['nope', '', 'Aktif faz', 'toString', '__proto__', 'constructor']) assert.throws(() => label(bad), undefined, bad);
});

test('AC-48.1 normalize: progress.md bold labels and section headings become English, values untouched', async () => {
  const { normalize } = await load();
  assert.equal(normalize(PROGRESS_TR.join('\n')), PROGRESS_EN.join('\n'));
});

test('AC-48.1 normalize: board, decision log, roadmap phase, spec, unit-economics and ops labels', async () => {
  const { normalize } = await load();
  const tr = [
    '**Durum:** kurulmadı',
    '**Commit denetimi:** açık',
    '## Üyeler',
    '## Toplantı günlüğü',
    '## Karar günlüğü',
    '## Faz 0 — Setup (skeleton)',
    '## Faz 1 — Temel',
    '**Tür:** özellik',
    '**Sınıf:** doğrulama',
    '## Değişmemesi gereken davranış',
    '**Para birimi:** TL',
    '**Fiyat (kullanıcı başı aylık):** 0',
    '**Ödeme komisyonu (%):** 2.5',
    '## Bayraklar',
    '## Kayıtlar',
    '## Bakım kaydı',
    '## Seçilen teknolojiler',
  ].join('\n');
  const en = [
    '**Status:** kurulmadı',
    '**Commit review:** açık',
    '## Members',
    '## Meeting log',
    '## Decision log',
    '## Phase 0 — Setup (skeleton)',
    '## Phase 1 — Temel',
    '**Type:** özellik',
    '**Class:** doğrulama',
    '## Behavior that must not change',
    '**Currency:** TL',
    '**Price (per user, monthly):** 0',
    '**Payment fee (%):** 2.5',
    '## Flags',
    '## Records',
    '## Maintenance log',
    '## Chosen technologies',
  ].join('\n');
  assert.equal(normalize(tr), en);
});

test('AC-48.1 normalize: AGENTS.md Commands block keys become English, only inside the block', async () => {
  const { normalize } = await load();
  assert.equal(normalize(AGENTS_TR.join('\n')), AGENTS_EN.join('\n'));
});

test('AC-48.1 normalize: English text is unchanged and normalize is idempotent', async () => {
  const { normalize } = await load();
  for (const doc of [PROGRESS_EN.join('\n'), AGENTS_EN.join('\n')]) assert.equal(normalize(doc), doc);
  for (const doc of [PROGRESS_TR.join('\n'), AGENTS_TR.join('\n'), PROGRESS_TR.join('\r\n')]) {
    assert.equal(normalize(normalize(doc)), normalize(doc));
  }
  assert.equal(normalize(''), '');
});

test('AC-48.1 verdict: both dictionaries map to approve / conditional / reject', async () => {
  const { verdict } = await load();
  const cases = {
    approve: ['APPROVE', 'approve', 'Approve', 'ONAY', 'onay', 'Onay', '  ONAY  ', '**Result:** APPROVE', '**Karar:** ONAY'],
    conditional: ['CONDITIONAL', 'conditional', 'Conditional', 'KOŞULLU ONAY', 'koşullu onay', 'Koşullu Onay', 'KOŞULLU', 'koşullu',
      '**Karar:** KOŞULLU ONAY', 'KOŞULLU ONAY (2 conditions)', 'CONDITIONAL — fix the test first'],
    reject: ['REJECT', 'reject', 'Reject', 'RET', 'ret', 'Ret', '**Result:** REJECT — reason', '**Sonuç:** RET — eksik test'],
  };
  for (const [want, inputs] of Object.entries(cases)) {
    for (const input of inputs) assert.equal(verdict(input), want, JSON.stringify(input));
  }
});

test('A-48.1 normalize: free prose, code fences, table cells and mid-line labels stay byte-identical', async () => {
  const { normalize } = await load();
  const doc = [
    'Aktif faz ve Kaldığı yer bölümleri burada anlatılır; Faz 1 bitti, Komutlar sonra.',
    '```md',
    '**Aktif faz:** Faz 1',
    '## Kaldığı yer',
    '## Komutlar',
    'geliştirme: npm run dev',
    '```',
    '| **Aktif faz:** | Faz 1 |',
    '| Kaldığı yer | - |',
    'See **Aktif faz:** in progress.md.',
    '- **Aktif faz:** in a list item',
    '> **Soru modu:** quoted',
    '## Fazla mesai',
    '## Komutlarım',
    'geliştirme: no Commands heading above',
  ].join('\n');
  assert.equal(normalize(doc), doc);
});

test('A-48.1 normalize: a prose paragraph full of label words stays byte-identical (fuzz)', async () => {
  const { normalize } = await load();
  const words = ['Aktif faz', '**Aktif faz:**', 'Kaldığı yer', '## Kaldığı yer', '## Faz 1', 'Faz', 'Komutlar', '## Komutlar',
    'geliştirme:', 'önizleme:', 'tip kontrol:', '**Durum:**', 'Üyeler', 'Tür:', '**Sınıf:**', 'RET', 'KOŞULLU ONAY', 've', 'bu',
    'İ', 'ı', '—', '|', '`', '**', '(%)'];
  let seed = 48;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const lines = [];
  for (let i = 0; i < 60; i++) {
    const n = 3 + Math.floor(rand() * 8);
    lines.push(['Not', ...Array.from({ length: n }, () => words[Math.floor(rand() * words.length)])].join(' '));
  }
  const paragraph = lines.join(rand() < 0.5 ? '\n' : '\r\n');
  assert.equal(normalize(paragraph), paragraph);
});

test('A-48.2 normalize: CRLF, BOM, extra spaces and tabs are preserved', async () => {
  const { normalize } = await load();
  assert.equal(normalize(PROGRESS_TR.join('\r\n')), PROGRESS_EN.join('\r\n'));
  assert.equal(normalize(AGENTS_TR.join('\r\n')), AGENTS_EN.join('\r\n'));
  assert.equal(
    normalize('﻿**Son güncelleme:** 2026-10-28\r\n**Aktif faz:** Faz 1\r\n'),
    '﻿**Last updated:** 2026-10-28\r\n**Active phase:** Faz 1\r\n',
  );
  assert.equal(normalize('**Aktif faz:**   Faz 1  \n**Aktif görev:**\tG-002\n## Sıradaki adım  \n'),
    '**Active phase:**   Faz 1  \n**Active task:**\tG-002\n## Next step  \n');
});

test('A-48.2 normalize: off-case or misspaced labels (lowercase, İ/ı uppercase) are left unchanged, never corrupted', async () => {
  const { normalize } = await load();
  const doc = [
    '**aktif faz:** Faz 1',
    '**AKTİF FAZ:** Faz 1',
    '**başlangıç adımı:** 0/9',
    '**BAŞLANGIÇ ADIMI:** 0/9',
    '**Aktif  faz:** Faz 1',
    '## kaldığı yer',
    '## KALDIĞI YER',
    '## faz 1 — Temel',
  ].join('\n');
  assert.equal(normalize(doc), doc);
});

test('A-48.6 verdict: substrings, questions, negation and mixed verdicts are unknown', async () => {
  const { verdict } = await load();
  for (const input of ['RETRY', 'SECRET', 'interpret', 'RETURN', 'retained', 'APPROVED', 'APPROVED?', 'APPROVE?', 'ONAY?',
    'onaylandı', 'ONAYLA', 'REJECTED', 'conditionally', 'KOŞULLUCA', 'NOT APPROVE', 'not approved', 'ONAY değil', 'RET değil',
    'APPROVE / REJECT', 'ONAY | KOŞULLU ONAY | RET']) {
    assert.equal(verdict(input), 'unknown', JSON.stringify(input));
  }
});

test('A-48.6 verdict: empty, null, non-string and label-only input fail closed to unknown', async () => {
  const { verdict } = await load();
  for (const input of ['', '   ', null, undefined, 42, 'ok', '✅', '**Result:**', 'Result:']) {
    assert.equal(verdict(input), 'unknown', JSON.stringify(input));
  }
});
