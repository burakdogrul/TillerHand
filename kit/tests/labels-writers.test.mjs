// Run: node --test "kit/tests/*.test.mjs"
// progress.mjs writes progress.md with English labels and reports missing labels by their English names.
// 3.49.0: the per-file language (labelIn) is gone; a Turkish label is not a label any more: it is never written to and
// counts as missing.
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

const ENGLISH_NAMES = ['Last updated', 'Active phase', 'Active task', 'Setup step', 'Question mode', 'Profile'];

// One progress.md; the Turkish twin differs in the label words only (values and prose untouched).
const progress = (L) => lines(
  '# Progress',
  '',
  '> Loaded into the AI every session. Active task and Next step are mentioned here only as prose.',
  '',
  `**${L.lastUpdated}:** -`,
  `**${L.activePhase}:** Setup`,
  `**${L.activeTask}:** /start`,
  `**${L.setupStep}:** 0/9`,
  `**${L.questionMode}:** on · closed topics: none`,
  `**${L.profile}:** -`,
  '',
  `## ${L.currentState}`,
  '',
  'The project has not started. İ ı I i stay as they are.',
  '',
  '```md',
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

// What the writer produces: label values replaced, the two sections' bodies rewritten, nothing else.
// Function replacements: a value with $& or $' must stay literal here too.
const expected = (L, { date, task, done, next }) => progress(L)
  .replace(`**${L.lastUpdated}:** -`, () => `**${L.lastUpdated}:** ${date}`)
  .replace(`**${L.activeTask}:** /start`, () => `**${L.activeTask}:** ${task}`)
  .replace(`## ${L.doneLastSession}\n\n- \n\n`, () => `## ${L.doneLastSession}\n\n${done.map((d) => `- ${d}`).join('\n')}\n\n`)
  .replace(`## ${L.nextStep}\n\n1. \`/start [idea]\`\n\n`, () => `## ${L.nextStep}\n\n1. ${next}\n\n`);

// Lines outside ``` code blocks (the fixture's code block shows a label as an example on purpose).
const outsideFences = (text) => {
  let fence = false;
  return text.split(/\r?\n/).filter((l) => (/^```/.test(l) ? (fence = !fence, false) : !fence));
};
const count = (text, prefix) => outsideFences(text).filter((l) => l.startsWith(prefix)).length;

// ---------- updateProgress ----------

test('AC-48.3 updateProgress: an English progress.md is written in English; the rest is byte-identical', () => {
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

test('AC-49.5 updateProgress: Turkish label lines and sections are never written to; their old values stay byte-identical', () => {
  const tr = progress(TR);
  const out = updateProgress(tr, { task: 'G-003 lint', did: 'G-002 done', next: '/build G-003' });
  for (const line of [`**${TR.lastUpdated}:** -`, `**${TR.activeTask}:** /start`, `**${TR.activePhase}:** Setup`]) {
    assert.equal(outsideFences(out).includes(line), true, `kept as it was: ${line}`);
  }
  assert.equal(count(out, `**${TR.activeTask}:** G-003`), 0, 'the task is not written under the Turkish label');
  assert.equal(count(out, `**${TR.lastUpdated}:** ${today()}`), 0, 'the date is not written under the Turkish label');
  assert.equal(out.includes(`## ${TR.doneLastSession}\n\n- \n\n`), true, 'the Turkish done section keeps its empty item');
  assert.equal(out.includes(`## ${TR.nextStep}\n\n1. \`/start [idea]\`\n\n`), true, 'the Turkish next-step section is unchanged');
  assert.equal(out.includes(`## ${TR.doneLastSession}\n\n- G-002 done`), false, 'nothing is appended to the Turkish section');
});

test('AC-49.5 updateProgress: in a mixed file only the English labels are written', () => {
  const mixed = lines(
    '# Progress', '',
    '**Last updated:** -',
    '**Aktif faz:** Setup',
    '**Aktif görev:** /start',
    '**Setup step:** 0/9', '',
    '## Son oturumda yapılanlar', '', '- old work', '',
    '## Next step', '', '1. x', '',
    '## Bekleyen kararlar', '', '- ', '',
  );
  const out = updateProgress(mixed, { task: 'G-5', did: 'new work', next: 'G-6' });
  const kept = outsideFences(out);
  assert.equal(kept.includes(`**Last updated:** ${today()}`), true, 'English date label written');
  assert.equal(kept.includes('**Aktif görev:** /start'), true, 'Turkish task label left alone');
  assert.equal(kept.includes('**Aktif faz:** Setup'), true);
  assert.equal(out.includes('## Next step\n\n1. G-6\n\n'), true, 'English next-step section written');
  assert.equal(out.includes('## Son oturumda yapılanlar\n\n- old work\n\n'), true, 'Turkish done section left alone');
  assert.equal(count(out, '**Aktif görev:** G-5'), 0);
});

test('AC-48.3 updateProgress: CRLF label lines keep their line ending; a BOM stays', () => {
  const crlf = progress(EN).replace(/\n/g, '\r\n');
  const want = crlf
    .replace(`**${EN.lastUpdated}:** -\r\n`, `**${EN.lastUpdated}:** ${today()}\r\n`)
    .replace(`**${EN.activeTask}:** /start\r\n`, `**${EN.activeTask}:** G-7\r\n`);
  assert.equal(updateProgress(crlf, { task: 'G-7' }), want, 'CRLF');
  const bom = `﻿${progress(EN)}`;
  assert.equal(updateProgress(bom, { task: 'G-7' }),
    `﻿${progress(EN).replace(`**${EN.lastUpdated}:** -`, `**${EN.lastUpdated}:** ${today()}`).replace(`**${EN.activeTask}:** /start`, `**${EN.activeTask}:** G-7`)}`,
    'BOM');
});

test('A-48.3 updateProgress: a value cannot add a label, a line or a second copy, and is written literally', () => {
  const out = updateProgress(progress(EN), {
    task: `x\n**${TR.lastUpdated}:** 1999-01-01\n**${EN.lastUpdated}:** 1999-01-01`,
    did: `d\n## ${EN.nextStep}\n## ${TR.nextStep}`,
    next: 'n\r\n**Active task:** hijack',
  });
  for (const label of [EN.lastUpdated, EN.activeTask]) assert.equal(count(out, `**${label}:**`), 1, label);
  for (const label of [TR.lastUpdated, TR.activeTask]) assert.equal(count(out, `**${label}:**`), 0, label);
  assert.equal(count(out, `## ${EN.nextStep}`), 1, 'English next-step heading');
  assert.equal(count(out, `## ${TR.nextStep}`), 0, 'no Turkish next-step heading');
  assert.equal(out.split('\n').length, progress(EN).split('\n').length, 'no line added');
  assert.match(out, new RegExp(`^\\*\\*${EN.lastUpdated}:\\*\\* ${today()}$`, 'm'), 'the date is today, not the injected one');
  // String.replace patterns ($&, $', $1) in a value are text, not replacement commands
  const tricky = "cost $& and $' and $1 and $$";
  const out2 = updateProgress(progress(EN), { task: tricky, did: tricky, next: tricky });
  assert.equal(out2, expected(EN, { date: today(), task: tricky, done: [tricky], next: tricky }));
});

// ---------- missingLabels ----------

test('AC-48.3 missingLabels: reports missing labels by their English names', () => {
  assert.deepEqual(missingLabels(progress(EN)), [], 'complete English file');
  assert.deepEqual(missingLabels(progress(EN).replace('**Active task:**', 'Active task:')), ['Active task'], 'broken English label');
  assert.deepEqual(missingLabels(''), ENGLISH_NAMES, 'empty file: all six, in order');
  assert.deepEqual(missingLabels(progress(EN).replace(/\n/g, '\r\n')), [], 'CRLF English file');
});

test('AC-49.5 missingLabels: a Turkish label is not found; a fully Turkish file misses all six', () => {
  assert.deepEqual(missingLabels(progress(TR)), ENGLISH_NAMES, 'fully Turkish file');
  assert.deepEqual(missingLabels(progress(TR).replace(/\n/g, '\r\n')), ENGLISH_NAMES, 'CRLF Turkish file');
  assert.deepEqual(missingLabels('**Aktif görev:** x\n**Profile:** -\n'), ['Last updated', 'Active phase', 'Active task', 'Setup step', 'Question mode'], 'mixed file');
});

test('A-48.2 missingLabels: a label mentioned mid-line does not count as present', () => {
  assert.deepEqual(missingLabels(progress(EN).replace('**Profile:** -', 'Profile: see **Profile:** below')), ['Profile']);
});

// ---------- CLI ----------

function cliProject(text) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'labels-writers-'));
  made.push(p);
  const file = path.join(p, 'docs/workflow/progress.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  const run = (...a) => spawnSync(process.execPath, [path.join(HOOKS, 'progress.mjs'), ...a], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  return { file, run };
}

test('AC-48.3 progress.mjs CLI: an English progress.md is written in English and --check reads it', () => {
  const { file, run } = cliProject(progress(EN));
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

test('AC-49.5 progress.mjs --check: a Turkish progress.md fails and names the six English labels', () => {
  const { run } = cliProject(progress(TR));
  const r = run('--check');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /broken bold labels: Last updated, Active phase, Active task, Setup step, Question mode, Profile\./);
});
