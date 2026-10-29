// Run: node --test "kit/tests/*.test.mjs"
// Label dictionary: hooks read English labels from user project files. 3.49.0: Turkish reading is gone. labels.mjs holds
// English labels only, normalize() and labelIn() (they only translated Turkish) are removed, verdict() knows
// APPROVE / CONDITIONAL / REJECT only.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded per test so each test reports its own failure.
const load = () => import('../../.claude/hooks/labels.mjs');

const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;
// Turkish labels and values of the 3.48 dictionary that have no Turkish letter (the letter scan cannot see them)
const TR_WORDS = ['Aktif faz', 'Profil', 'Durum', 'Commit denetimi', 'Faz', 'Komutlar', 'tip kontrol', 'Bayraklar', 'Kural', 'Temalar',
  'Raporlar', 'Alarmlar', 'Hesaplar', 'Ortamlar (dev / prod)', 'Tam', 'Hafif', 'Standart', 'bekliyor', 'otomatik', 'tek', 'evet',
  'yeni', 'soru', 'hata', 'istek', 'kuruldu', 'yok', 'RET', 'ONAY'];

// Source of truth: the label each key stands for in a project file.
const REQUIRED = [
  ['lastUpdated', 'Last updated'], ['activePhase', 'Active phase'], ['activeTask', 'Active task'], ['setupStep', 'Setup step'],
  ['questionMode', 'Question mode'], ['profile', 'Profile'], ['currentState', 'Current state'], ['doneLastSession', 'Done last session'],
  ['nextStep', 'Next step'], ['pendingDecisions', 'Pending decisions'], ['whereWeLeftOff', 'Where we left off'],
  ['openIssues', 'Open issues / blockers'], ['status', 'Status'], ['commitReview', 'Commit review'], ['members', 'Members'],
  ['meetingLog', 'Meeting log'], ['decisionLog', 'Decision log'], ['phase', 'Phase'], ['commands', 'Commands'], ['dev', 'dev'],
  ['preview', 'preview'], ['typeCheck', 'type check'], ['type', 'Type'], ['class', 'Class'],
  ['mustNotChange', 'Behavior that must not change'], ['priority', 'Priority'], ['outOfScope', 'Out of scope'],
  ['chosenTech', 'Chosen technologies'], ['maintenanceLog', 'Maintenance log'], ['flags', 'Flags'], ['records', 'Records'],
  ['unreleased', 'Unreleased'],
  // unit-economics inputs
  ['currency', 'Currency'], ['price', 'Price (per user, monthly)'], ['paymentFee', 'Payment fee (%)'], ['fixedCost', 'Fixed monthly cost'],
  ['variableCost', 'Variable cost per user (monthly)'], ['targetUsers', 'Target active users'], ['freeShare', 'Free user share (%)'],
];

test('AC-48.1 label(): every required key gives its English label', async () => {
  const { label } = await load();
  for (const [key, en] of REQUIRED) assert.equal(label(key), en, key);
});

test('AC-48.1 label(): returns the EN string and throws on an unknown key', async () => {
  const { label } = await load();
  assert.equal(label('activePhase'), 'Active phase');
  assert.equal(label('whereWeLeftOff'), 'Where we left off');
  assert.equal(label('typeCheck'), 'type check');
  for (const bad of ['nope', '', 'Aktif faz', 'toString', '__proto__', 'constructor']) assert.throws(() => label(bad), undefined, bad);
});

test('AC-49.1 labels.mjs: no Turkish label, value or word is left in any exported dictionary', async () => {
  const mod = await load();
  const tables = Object.entries(mod).filter(([, v]) => v && typeof v === 'object');
  assert.notDeepEqual(tables, [], 'labels.mjs exports its dictionaries');
  for (const [name, table] of tables) {
    const json = JSON.stringify(table);
    assert.doesNotMatch(json, TR_LETTERS, `${name}: a Turkish letter`);
    for (const word of TR_WORDS) assert.equal(json.includes(JSON.stringify(word)), false, `${name}: the Turkish entry "${word}"`);
    assert.doesNotMatch(json, /"tr"\s*:/, `${name}: a tr field`);
  }
});

test('AC-49.1 labels.mjs: normalize() and labelIn() are gone (they only translated Turkish)', async () => {
  const mod = await load();
  assert.equal(Object.hasOwn(mod, 'normalize'), false, 'normalize is not exported');
  assert.equal(Object.hasOwn(mod, 'labelIn'), false, 'labelIn is not exported');
});

test('AC-48.1 verdict: APPROVE / CONDITIONAL / REJECT map to approve / conditional / reject', async () => {
  const { verdict } = await load();
  const cases = {
    approve: ['APPROVE', 'approve', 'Approve', '  APPROVE  ', '**Result:** APPROVE', '**Decision:** APPROVE'],
    conditional: ['CONDITIONAL', 'conditional', 'Conditional', '**Decision:** CONDITIONAL', 'CONDITIONAL (2 conditions)', 'CONDITIONAL — fix the test first'],
    reject: ['REJECT', 'reject', 'Reject', '**Result:** REJECT — reason', 'REJECT (missing test)'],
  };
  for (const [want, inputs] of Object.entries(cases)) {
    for (const input of inputs) assert.equal(verdict(input), want, JSON.stringify(input));
  }
});

test('AC-49.2 verdict: the old Turkish verdicts RET, ONAY, KOŞULLU ONAY, KOŞULLU are unknown in every spelling', async () => {
  const { verdict } = await load();
  for (const input of ['RET', 'ret', 'Ret', 'ONAY', 'onay', 'Onay', 'KOŞULLU ONAY', 'koşullu onay', 'Koşullu Onay', 'KOŞULLU', 'koşullu',
    '  ONAY  ', '**RET**', '**ONAY**', '**KOŞULLU ONAY**', '**Karar:** ONAY', '**Sonuç:** RET — eksik test', '**Result:** RET',
    'RET: güvenlik', 'RET — no test', 'ONAY.', 'KOŞULLU ONAY (2 conditions)', 'KOŞULLU ONAY; 2 fixes', 'KOSULLU ONAY']) {
    assert.equal(verdict(input), 'unknown', JSON.stringify(input));
  }
});

test('A-48.6 verdict: substrings, questions, negation and mixed verdicts are unknown', async () => {
  const { verdict } = await load();
  for (const input of ['RETRY', 'SECRET', 'interpret', 'RETURN', 'retained', 'APPROVED', 'APPROVED?', 'APPROVE?', 'CONDITIONAL?',
    'REJECT?', 'REJECTED', 'conditionally', 'NOT APPROVE', 'not approved', 'NOT REJECT', 'APPROVE / REJECT',
    'APPROVE | CONDITIONAL | REJECT', 'APPROVEREJECT']) {
    assert.equal(verdict(input), 'unknown', JSON.stringify(input));
  }
});

test('A-48.6 verdict: empty, null, non-string and label-only input fail closed to unknown', async () => {
  const { verdict } = await load();
  for (const input of ['', '   ', null, undefined, 42, 'ok', '✅', '**Result:**', 'Result:', {}, ['APPROVE'], { toString: () => 'APPROVE' }]) {
    assert.equal(verdict(input), 'unknown', JSON.stringify(input));
  }
});
