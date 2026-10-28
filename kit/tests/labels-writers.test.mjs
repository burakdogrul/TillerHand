// Run: node --test "kit/tests/*.test.mjs"
// 3.48.0 step 3: writers keep the language a file already uses. labelIn() picks the label text to write per key,
// progress.mjs writes progress.md in that language and reports missing labels by their English names.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { updateProgress, missingLabels } from '../../.claude/hooks/progress.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');
const lines = (...a) => a.join('\n');
const today = () => new Date().toLocaleDateString('sv-SE');
const made = [];
after(() => { for (const p of made) fs.rmSync(p, { recursive: true, force: true }); });

// Loaded per test: labelIn is new in step 3, so each test reports its own failure while it is missing.
const loadLabelIn = async () => {
  const { labelIn } = await import('../../.claude/hooks/labels.mjs');
  assert.equal(typeof labelIn, 'function', 'labels.mjs exports labelIn(text, key)');
  return labelIn;
};

const ENGLISH_NAMES = ['Last updated', 'Active phase', 'Active task', 'Setup step', 'Question mode', 'Profile'];

// One progress.md, label words only differ between the two languages (values and prose untouched).
const progress = (L) => lines(
  '# Progress',
  '',
  '> Loaded into the AI every session. Aktif görev and Next step are mentioned here only as prose.',
  '',
  `**${L.lastUpdated}:** -`,
  `**${L.activePhase}:** Başlangıç`,
  `**${L.activeTask}:** /start`,
  `**${L.setupStep}:** 0/9`,
  `**${L.questionMode}:** açık · kapalı konular: yok`,
  `**${L.profile}:** -`,
  '',
  `## ${L.currentState}`,
  '',
  'Proje başlamadı. İ ı I i stay as they are.',
  '',
  '```md',
  '**Aktif görev:** an example inside a code block',
  '**Active task:** an example inside a code block',
  '```',
  '',
  `## ${L.doneLastSession}`,
  '',
  '- ',
  '',
  `## ${L.nextStep}`,
  '',
  '1. `/start [idea]`',
  '',
  `## ${L.pendingDecisions}`,
  '',
  '- ',
  '',
  `## ${L.whereWeLeftOff} (if stopped because of a limit or midway)`,
  '',
  '- ',
  '',
  `## ${L.openIssues}`,
  '',
  '- ',
  '',
);

const TR = {
  lastUpdated: 'Son güncelleme', activePhase: 'Aktif faz', activeTask: 'Aktif görev', setupStep: 'Başlangıç adımı',
  questionMode: 'Soru modu', profile: 'Profil', currentState: 'Şu anki durum', doneLastSession: 'Son oturumda yapılanlar',
  nextStep: 'Sıradaki adım', pendingDecisions: 'Bekleyen kararlar', whereWeLeftOff: 'Kaldığı yer', openIssues: 'Açık sorunlar / bloklayıcılar',
};
const EN = {
  lastUpdated: 'Last updated', activePhase: 'Active phase', activeTask: 'Active task', setupStep: 'Setup step',
  questionMode: 'Question mode', profile: 'Profile', currentState: 'Current state', doneLastSession: 'Done last session',
  nextStep: 'Next step', pendingDecisions: 'Pending decisions', whereWeLeftOff: 'Where we left off', openIssues: 'Open issues / blockers',
};

// What today's writer produces for the given labels: label values replaced, the two sections' bodies rewritten, nothing else.
// Function replacements: a value with $& or $' must stay literal here too.
const expected = (L, { date, task, done, next }) => progress(L)
  .replace(`**${L.lastUpdated}:** -`, () => `**${L.lastUpdated}:** ${date}`)
  .replace(`**${L.activeTask}:** /start`, () => `**${L.activeTask}:** ${task}`)
  .replace(`## ${L.doneLastSession}\n\n- \n\n`, () => `## ${L.doneLastSession}\n\n${done.map((d) => `- ${d}`).join('\n')}\n\n`)
  .replace(`## ${L.nextStep}\n\n1. \`/start [idea]\`\n\n`, () => `## ${L.nextStep}\n\n1. ${next}\n\n`);

// Lines outside ``` code blocks (the fixture's code block shows both labels as examples on purpose).
const outsideFences = (text) => {
  let fence = false;
  return text.split(/\r?\n/).filter((l) => (/^```/.test(l) ? (fence = !fence, false) : !fence));
};
const count = (text, prefix) => outsideFences(text).filter((l) => l.startsWith(prefix)).length;

// ---------- labelIn ----------

test('AC-48.3 labelIn: an empty or new file gets the English label', async () => {
  const labelIn = await loadLabelIn();
  assert.equal(labelIn('', 'activeTask'), 'Active task');
  assert.equal(labelIn('# Progress\n\nNothing here yet.\n', 'nextStep'), 'Next step');
  assert.equal(labelIn('', 'lastUpdated'), 'Last updated');
});

test('AC-48.3 labelIn: a bold label at line start decides the language of that label', async () => {
  const labelIn = await loadLabelIn();
  assert.equal(labelIn('**Aktif görev:** x\n', 'activeTask'), 'Aktif görev');
  assert.equal(labelIn('**Active task:** x\n', 'activeTask'), 'Active task');
  assert.equal(labelIn('# P\r\n\r\n**Son güncelleme:** -\r\n', 'lastUpdated'), 'Son güncelleme', 'CRLF file');
  assert.equal(labelIn('﻿**Profil:** -\n', 'profile'), 'Profil', 'BOM before the first label');
  assert.equal(labelIn('**Aktif görev:** x\n**Active task:** y\n', 'activeTask'), 'Active task', 'both present: English wins');
  assert.equal(labelIn('**Active task:** y\n**Aktif görev:** x\n', 'activeTask'), 'Active task', 'both present, either order');
});

test('AC-48.3 labelIn: a "## " heading decides the language of a section label (same position rules as normalize)', async () => {
  const labelIn = await loadLabelIn();
  assert.equal(labelIn('## Sıradaki adım\n\n1. x\n', 'nextStep'), 'Sıradaki adım');
  assert.equal(labelIn('## Next step\n\n1. x\n', 'nextStep'), 'Next step');
  assert.equal(labelIn('## Kaldığı yer (if stopped because of a limit or midway)\n', 'whereWeLeftOff'), 'Kaldığı yer', 'heading with a suffix');
  assert.equal(labelIn('## 6. Kapsam dışı\n', 'outOfScope'), 'Kapsam dışı', 'numbered PRD heading');
  assert.equal(labelIn('## [Yayınlanmamış]\n', 'unreleased'), 'Yayınlanmamış', 'bracketed CHANGELOG heading');
  assert.equal(labelIn('## Faz 1 — Temel\n', 'phase'), 'Faz');
});

test('AC-48.3 labelIn: Turkish words outside a label position do not switch the language', async () => {
  const labelIn = await loadLabelIn();
  assert.equal(labelIn('Aktif görev: x\n', 'activeTask'), 'Active task', 'not bold');
  assert.equal(labelIn('Note: **Aktif görev:** x\n', 'activeTask'), 'Active task', 'bold but mid-line');
  assert.equal(labelIn('- **Aktif görev:** x\n', 'activeTask'), 'Active task', 'inside a list item');
  assert.equal(labelIn('### Sıradaki adım\n', 'nextStep'), 'Next step', 'a level-3 heading is not a label position');
  assert.equal(labelIn('Write the Sıradaki adım section later.\n', 'nextStep'), 'Next step', 'prose');
  assert.equal(labelIn('## Fazla mesai\n', 'phase'), 'Phase', 'the label must end at a non-letter');
  assert.equal(labelIn('```md\n**Aktif görev:** x\n## Sıradaki adım\n```\n', 'activeTask'), 'Active task', 'inside a code block');
  assert.equal(labelIn('```md\n**Aktif görev:** x\n## Sıradaki adım\n```\n', 'nextStep'), 'Next step', 'heading inside a code block');
});

test('A-48.1 labelIn: an unknown key throws like label(), prototype names included', async () => {
  const labelIn = await loadLabelIn();
  for (const key of ['nope', 'constructor', 'toString', '__proto__', 'hasOwnProperty', '']) {
    assert.throws(() => labelIn('**Active task:** x\n', key), /unknown label/, key);
  }
});

// ---------- updateProgress ----------

test('AC-48.3 updateProgress: a Turkish progress.md stays fully Turkish; the rest is byte-identical', () => {
  const out = updateProgress(progress(TR), { task: 'G-003 lint', did: 'G-002 bitti', next: '/build G-003' });
  assert.equal(out, expected(TR, { date: today(), task: 'G-003 lint', done: ['G-002 bitti'], next: '/build G-003' }));
  for (const en of ['**Last updated:**', '**Active task:**', '## Done last session', '## Next step']) {
    assert.equal(count(out, en), 0, `no English copy: ${en}`);
  }
});

test('AC-48.3 updateProgress: an English progress.md stays fully English; the rest is byte-identical', () => {
  const out = updateProgress(progress(EN), { task: 'G-003 lint', did: 'G-002 done', next: '/build G-003' });
  assert.equal(out, expected(EN, { date: today(), task: 'G-003 lint', done: ['G-002 done'], next: '/build G-003' }));
  for (const tr of ['**Son güncelleme:**', '**Aktif görev:**', '## Son oturumda yapılanlar', '## Sıradaki adım']) {
    assert.equal(count(out, tr), 0, `no Turkish copy: ${tr}`);
  }
  // a second write appends to the done list, still in English
  const again = updateProgress(out, { did: 'G-003 done' });
  assert.equal(again, expected(EN, { date: today(), task: 'G-003 lint', done: ['G-002 done', 'G-003 done'], next: '/build G-003' }));
});

test('AC-48.3 updateProgress: each flag alone touches only its own label or section (and the date)', () => {
  const base = progress(EN);
  const dated = base.replace('**Last updated:** -', `**Last updated:** ${today()}`);
  assert.equal(updateProgress(base, {}), dated, 'no flag: only the date');
  assert.equal(updateProgress(base, { task: 'T' }), dated.replace('**Active task:** /start', '**Active task:** T'));
  assert.equal(updateProgress(base, { next: 'N' }), dated.replace('## Next step\n\n1. `/start [idea]`\n\n', '## Next step\n\n1. N\n\n'));
  assert.equal(updateProgress(base, { did: 'D' }), dated.replace('## Done last session\n\n- \n\n', '## Done last session\n\n- D\n\n'));
});

test('AC-48.3 updateProgress: a mixed file is written per label, in the language each label already has', () => {
  const mixed = lines(
    '# Progress', '',
    '**Last updated:** -',
    '**Aktif faz:** Başlangıç',
    '**Aktif görev:** /start',
    '**Setup step:** 0/9', '',
    '## Son oturumda yapılanlar', '', '- eski iş', '',
    '## Next step', '', '1. x', '',
    '## Bekleyen kararlar', '', '- ', '',
  );
  const out = updateProgress(mixed, { task: 'G-5', did: 'yeni iş', next: 'G-6' });
  assert.equal(out, lines(
    '# Progress', '',
    `**Last updated:** ${today()}`,
    '**Aktif faz:** Başlangıç',
    '**Aktif görev:** G-5',
    '**Setup step:** 0/9', '',
    '## Son oturumda yapılanlar', '', '- eski iş', '- yeni iş', '',
    '## Next step', '', '1. G-6', '',
    '## Bekleyen kararlar', '', '- ', '',
  ));
});

test('AC-48.3 updateProgress: CRLF label lines keep their line ending; a BOM stays', () => {
  for (const L of [TR, EN]) {
    const crlf = progress(L).replace(/\n/g, '\r\n');
    const want = crlf
      .replace(`**${L.lastUpdated}:** -\r\n`, `**${L.lastUpdated}:** ${today()}\r\n`)
      .replace(`**${L.activeTask}:** /start\r\n`, `**${L.activeTask}:** G-7\r\n`);
    assert.equal(updateProgress(crlf, { task: 'G-7' }), want, `${L.activeTask}: CRLF`);
    const bom = `﻿${progress(L)}`;
    assert.equal(updateProgress(bom, { task: 'G-7' }),
      `﻿${progress(L).replace(`**${L.lastUpdated}:** -`, `**${L.lastUpdated}:** ${today()}`).replace(`**${L.activeTask}:** /start`, `**${L.activeTask}:** G-7`)}`,
      `${L.activeTask}: BOM`);
  }
});

test('A-48.3 updateProgress: a value cannot add a label, a line or a second copy, and is written literally', () => {
  for (const L of [TR, EN]) {
    const out = updateProgress(progress(L), {
      task: `x\n**${TR.lastUpdated}:** 1999-01-01\n**${EN.lastUpdated}:** 1999-01-01`,
      did: `d\n## ${EN.nextStep}\n## ${TR.nextStep}`,
      next: 'n\r\n**Active task:** hijack',
    });
    for (const label of [TR.lastUpdated, EN.lastUpdated, TR.activeTask, EN.activeTask]) {
      assert.equal(count(out, `**${label}:**`), label === L.lastUpdated || label === L.activeTask ? 1 : 0, `${L.activeTask}: ${label}`);
    }
    assert.equal(count(out, `## ${EN.nextStep}`), L === EN ? 1 : 0, `${L.activeTask}: English next-step heading`);
    assert.equal(count(out, `## ${TR.nextStep}`), L === TR ? 1 : 0, `${L.activeTask}: Turkish next-step heading`);
    assert.equal(out.split('\n').length, progress(L).split('\n').length, `${L.activeTask}: no line added`);
    assert.match(out, new RegExp(`^\\*\\*${L.lastUpdated}:\\*\\* ${today()}$`, 'm'), `${L.activeTask}: the date is today, not the injected one`);
  }
  // String.replace patterns ($&, $', $1) in a value are text, not replacement commands
  const tricky = "cost $& and $' and $1 and $$";
  const out = updateProgress(progress(EN), { task: tricky, did: tricky, next: tricky });
  assert.equal(out, expected(EN, { date: today(), task: tricky, done: [tricky], next: tricky }));
});

// ---------- missingLabels ----------

test('AC-48.3 missingLabels: reads both languages and reports missing labels by their English names', () => {
  assert.deepEqual(missingLabels(progress(TR)), [], 'complete Turkish file');
  assert.deepEqual(missingLabels(progress(EN)), [], 'complete English file');
  assert.deepEqual(missingLabels(progress(TR).replace('**Aktif faz:**', 'Aktif faz:')), ['Active phase'], 'broken Turkish label');
  assert.deepEqual(missingLabels(progress(EN).replace('**Active task:**', 'Active task:')), ['Active task'], 'broken English label');
  assert.deepEqual(missingLabels(''), ENGLISH_NAMES, 'empty file: all six, in order');
  assert.deepEqual(missingLabels('**Aktif görev:** x\n**Profile:** -\n'), ['Last updated', 'Active phase', 'Setup step', 'Question mode'], 'mixed file');
  assert.deepEqual(missingLabels(progress(TR).replace(/\n/g, '\r\n')), [], 'CRLF Turkish file');
});

test('A-48.2 missingLabels: a label mentioned mid-line does not count as present, in either language', () => {
  assert.deepEqual(missingLabels(progress(EN).replace('**Profile:** -', 'Profile: see **Profile:** below')), ['Profile']);
  assert.deepEqual(missingLabels(progress(TR).replace('**Profil:** -', 'Profil: bkz. **Profil:** aşağıda')), ['Profile']);
});

// ---------- CLI ----------

test('AC-48.3 progress.mjs CLI: an English progress.md is written in English and --check reads it', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'labels-writers-'));
  made.push(p);
  const file = path.join(p, 'docs/workflow/progress.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, progress(EN));
  const run = (...a) => spawnSync(process.execPath, [path.join(HOOKS, 'progress.mjs'), ...a], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  const r = run('--task', 'G-003 lint', '--did', 'G-002 done', '--next', '/build G-003');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(file, 'utf8'), expected(EN, { date: today(), task: 'G-003 lint', done: ['G-002 done'], next: '/build G-003' }));
  const ok = run('--check');
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /labels are intact/);
  fs.writeFileSync(file, progress(EN).replace('**Question mode:**', 'Question mode:'));
  const bad = run('--check');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /broken bold labels: Question mode\./);
});
