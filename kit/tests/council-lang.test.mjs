// Run: node --test "kit/tests/*.test.mjs"
// 3.48.0 step 4b: council minutes in English. Hooks read both languages for the whole 3.x line: an English minutes
// file and its Turkish twin (same opinions, votes, rankings) give the same count and the same dashboard reading.
// council.mjs writes the "## 3." section in the language of the minutes the count came from.
// The dashboard gives English verdicts (APPROVE / CONDITIONAL / REJECT) the same badge as the Turkish ones.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseRanking, parseBallots, countVotes, writeMinutes } from '../../.claude/hooks/council.mjs';
import { councilMinutes } from '../../.claude/hooks/dashboard-data.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');
const made = [];
after(() => { for (const p of made) fs.rmSync(p, { recursive: true, force: true }); });

function project(files) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'council-lang-'));
  made.push(p);
  for (const [f, s] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    fs.writeFileSync(path.join(p, f), typeof s === 'string' ? s : JSON.stringify(s));
  }
  return p;
}

// ---------- fixtures: a meeting council and a decision council, English and their Turkish twins ----------

const EN_MEETING = `# Council: plan · G-012 sign-up form
**Date:** 2026-10-12 · **Type:** plan

## 1. First opinions

### Opinion A
- A1 [CRITICAL] api/signup.ts:12 — account is active before the email check — add verification
- A2 [SUGGESTION] form text is long
- A3 [SUGGESTION] button label is unclear

### Opinion B
- B1 [IMPORTANT] no RLS policy — add a policy
- B2 [CRITICAL] password stored in plain text — hash it
- B3 [IMPORTANT] no rate limit — add one

### Opinion C
No findings.

## 2. Cross review

### Reviewer: A
B is more concrete than C.
VOTES:
B1: AGREE
B3: DISAGREE
RANKING:
1. Opinion B
2. Opinion C

### Reviewer: B
VOTES:
A1: OVERSTATED
A2: agree
RANKING:
1. Opinion A
2. Opinion C

### Reviewer: C
VOTES:
- A1: disagree
- A2: AGREE
- B1: Agree
- B3: Overstated
RANKING:
1. **Opinion B**
2. Opinion A

## 4. Chair decision
**Decision:** CONDITIONAL
`;

const TR_MEETING = `# Konsey: plan · G-012 sign-up form
**Tarih:** 2026-10-12 · **Tür:** plan

## 1. İlk görüşler

### Görüş A
- A1 [KRİTİK] api/signup.ts:12 — account is active before the email check — add verification
- A2 [ÖNERİ] form text is long
- A3 [ÖNERİ] button label is unclear

### Görüş B
- B1 [ÖNEMLİ] no RLS policy — add a policy
- B2 [KRİTİK] password stored in plain text — hash it
- B3 [ÖNEMLİ] no rate limit — add one

### Görüş C
Bulgu yok.

## 2. Çapraz inceleme

### İnceleyen: A
B, C'den daha somut.
OYLAR:
B1: DOĞRU
B3: YANLIŞ
SIRALAMA:
1. Görüş B
2. Görüş C

### İnceleyen: B
OYLAR:
A1: ABARTILI
A2: doğru
SIRALAMA:
1. Görüş A
2. Görüş C

### İnceleyen: C
OYLAR:
- A1: YANLIŞ
- A2: DOĞRU
- B1: Doğru
- B3: ABARTILI
SIRALAMA:
1. **Görüş B**
2. Görüş A

## 4. Başkan kararı
**Karar:** KOŞULLU ONAY
`;

const EN_DECISION = `# Council: decision · Database choice
**Date:** 2026-10-14 · **Type:** decision

## Question
Which database for the MVP?

## 1. First opinions
### Opinion A
RECOMMENDATION: Supabase
### Opinion B
RECOMMENDATION: Supabase
### Opinion C
- C1 [IMPORTANT] Neon is cheaper at low volume
RECOMMENDATION: Neon

## 2. Cross review
### Reviewer: A
VOTES:
C1: AGREE
RANKING:
1. Opinion B
2. Opinion C
### Reviewer: B
VOTES:
C1: OVERSTATED
RANKING:
1. Opinion A
2. Opinion C
### Reviewer: C
RANKING:
1. Opinion A
2. Opinion B
`;

const TR_DECISION = `# Konsey: decision · Database choice
**Tarih:** 2026-10-14 · **Tür:** decision

## Question
Which database for the MVP?

## 1. İlk görüşler
### Görüş A
ÖNERİ: Supabase
### Görüş B
ÖNERİ: Supabase
### Görüş C
- C1 [ÖNEMLİ] Neon is cheaper at low volume
ÖNERİ: Neon

## 2. Çapraz inceleme
### İnceleyen: A
OYLAR:
C1: DOĞRU
SIRALAMA:
1. Görüş B
2. Görüş C
### İnceleyen: B
OYLAR:
C1: ABARTILI
SIRALAMA:
1. Görüş A
2. Görüş C
### İnceleyen: C
SIRALAMA:
1. Görüş A
2. Görüş B
`;

// The written "## 3." section of a minutes text (up to the next "## " heading or the end)
const section3 = (text) => text.match(/^## 3\.[\s\S]*?(?=^## |(?![\s\S]))/m)?.[0] ?? '';

// Per finding [agree, disagree, overstated], read from the written findings table. The column order is fixed in both
// languages (Doğru|Yanlış|Abartılı = Agree|Disagree|Overstated), so this does not depend on how the count names its keys.
const findingCounts = (s) => Object.fromEntries(section3(writeMinutes('', s)).split('\n')
  .map((line) => line.match(/^\|\s*([A-Z]\d+)\s*\|[^|]*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/))
  .filter(Boolean).map((m) => [m[1], [Number(m[2]), Number(m[3]), Number(m[4])]]));

// Everything in the count that is not a language word
const neutral = (s) => ({
  ranking: s.ranking.map((r) => [r.opinion, r.average, r.votes]),
  findings: s.findings.map((f) => [f.id, f.disputed, f.unvoted]),
  counts: findingCounts(s),
  options: s.options.map((o) => [o.option, o.votes]),
  consensus: s.consensus,
  reviewerCount: s.reviewerCount,
  invalid: [...s.invalid].sort(),
});

const TURKISH_WORDS = ['Toplu', 'Uzlaşma', 'Tartışmalı', 'Görüş', 'Ortalama', 'Sıralayan', 'Seçenek', 'Bulgu', 'Önem',
  'Doğru', 'Yanlış', 'Abartılı', 'Durum', 'kabul', 'kullanıcıya', 'oy yok', 'SIRALAMA'];
const turkishIn = (text) => TURKISH_WORDS.filter((w) => text.toLocaleLowerCase('tr').includes(w.toLocaleLowerCase('tr')));

// ---------- 1. same count in both languages ----------

test('Ö-48.33 council-lang: an English meeting council and its Turkish twin give the same count', () => {
  const en = countVotes(EN_MEETING);
  const tr = countVotes(TR_MEETING);
  assert.deepEqual(neutral(en), neutral(tr));
  assert.deepEqual(neutral(en), {
    ranking: [['B', 1, 2], ['A', 1.5, 2], ['C', 2, 2]],
    findings: [['A1', true, false], ['A2', false, false], ['A3', false, true], ['B1', false, false], ['B2', false, true], ['B3', true, false]],
    counts: { A1: [0, 1, 1], A2: [2, 0, 0], A3: [0, 0, 0], B1: [2, 0, 0], B2: [0, 0, 0], B3: [0, 1, 1] },
    options: [],
    consensus: 50,
    reviewerCount: 3,
    invalid: [],
  }, '4 of 8 finding votes agree');
});

test('Ö-48.34 council-lang: an English decision council and its Turkish twin give the same option split and consensus', () => {
  const en = countVotes(EN_DECISION);
  const tr = countVotes(TR_DECISION);
  assert.deepEqual(neutral(en), neutral(tr));
  assert.deepEqual(neutral(en), {
    ranking: [['A', 1, 2], ['B', 1.5, 2], ['C', 2, 2]],
    findings: [['C1', true, false]],
    counts: { C1: [1, 0, 1] },
    options: [['Supabase', 2], ['Neon', 1]],
    consensus: 67,
    reviewerCount: 3,
    invalid: [],
  });
});

// ---------- 2. parsing in English ----------

test('Ö-48.35 council-lang: parseRanking reads RANKING: with numbered "Opinion X" lines (bold allowed), nothing without the heading', () => {
  assert.deepEqual(parseRanking('Opinion A is good.\nRANKING:\n1. Opinion C\n2. Opinion A\n'), ['C', 'A']);
  assert.deepEqual(parseRanking('RANKING:\n1. **Opinion B**\n2. Opinion A'), ['B', 'A'], 'bold text');
  assert.deepEqual(parseRanking('Opinion B is better than Opinion A.\n1. Opinion B\n2. Opinion A'), [], 'without RANKING: no order is guessed');
});

test('Ö-48.36 council-lang: parseBallots reads VOTES: up to RANKING:, English words in any case, both languages in one ballot', () => {
  const ids = (text) => Object.keys(parseBallots(text)).sort();
  assert.deepEqual(ids('VOTES:\nA1: agree\n- B2 = Overstated\nC1: DISAGREE\nC2: disagree\nRANKING:\n1. Opinion A\nD1: AGREE\n'), ['A1', 'B2', 'C1', 'C2'],
    'votes after RANKING: do not count');
  assert.deepEqual(ids('VOTES:\nA1: AGREE\nB1: DOĞRU\nC1: YANLIŞ\nD1: overstated\nE1: ABARTILI\nF1: Disagree\n'), ['A1', 'B1', 'C1', 'D1', 'E1', 'F1'],
    'a mixed ballot: every vote counts');
});

test('Ö-48.37 council-lang: an AGREE and a DOĞRU on the same finding land on the same outcome; lowercase "disagree" is a disagree vote', () => {
  const mixed = EN_MEETING.replace('A2: agree', 'A2: DOĞRU').replace('B1: Agree', 'B1: doğru').replace('- B3: Overstated', '- B3: ABARTILI');
  assert.deepEqual(neutral(countVotes(mixed)), neutral(countVotes(EN_MEETING)));
  // "disagree".toLocaleUpperCase('tr') is "DİSAGREE": a Turkish-locale upper-casing must not lose the vote
  const lower = EN_MEETING.replace('B3: DISAGREE', 'B3: disagree');
  assert.deepEqual(findingCounts(countVotes(lower)).B3, [0, 1, 1]);
});

// ---------- 3. the section is written in the minutes' language ----------

test('Ö-48.38 council-lang: writeMinutes writes the English section into English minutes, no Turkish word, idempotent', () => {
  const s = countVotes(EN_MEETING);
  const written = writeMinutes(EN_MEETING, s);
  const part = section3(written);
  for (const line of [
    '## 3. Overall ranking',
    '**Consensus:** 50%',
    '**Disputed:** 2',
    '| Opinion | Average rank | Rankers |',
    '| B | 1 | 2 |',
    '| A | 1.5 | 2 |',
    '| C | 2 | 2 |',
    '| Finding | Severity | Agree | Disagree | Overstated | Status |',
    '| A1 | CRITICAL | 0 | 1 | 1 | disputed · ask the user |',
    '| A2 | SUGGESTION | 2 | 0 | 0 | accepted |',
    '| A3 | SUGGESTION | 0 | 0 | 0 | no votes |',
    '| B1 | IMPORTANT | 2 | 0 | 0 | accepted |',
    '| B2 | CRITICAL | 0 | 0 | 0 | no votes · ask the user |',
    '| B3 | IMPORTANT | 0 | 1 | 1 | disputed |',
  ]) assert.ok(part.split('\n').includes(line), `section has the line: ${line}\n---\n${part}`);
  assert.deepEqual(turkishIn(part), [], 'no Turkish word in the English section');
  assert.match(written, /## 3\. Overall ranking[\s\S]*## 4\. Chair decision/, 'the section goes before the chair decision');
  assert.equal(writeMinutes(written, s), written, 'writing again does not change the file');
  assert.equal(writeMinutes(written, countVotes(written)), written, 'counting the written file again gives the same file');
});

test('Ö-48.39 council-lang: a decision council in English gets the English option table', () => {
  const part = section3(writeMinutes(EN_DECISION, countVotes(EN_DECISION)));
  for (const line of ['## 3. Overall ranking', '**Consensus:** 67%', '**Disputed:** 1', '| Option | Proposed in first opinions |', '| Supabase | 2 |', '| Neon | 1 |',
    '| C1 | IMPORTANT | 1 | 0 | 1 | disputed |']) assert.ok(part.split('\n').includes(line), `section has the line: ${line}\n---\n${part}`);
  assert.deepEqual(turkishIn(part), []);
});

test('Ö-48.40 council-lang: a Turkish minutes file still gets the Turkish section', () => {
  const part = section3(writeMinutes(TR_MEETING, countVotes(TR_MEETING)));
  for (const line of ['## 3. Toplu sıralama', '**Uzlaşma:** %50', '**Tartışmalı:** 2', '| Görüş | Ortalama sıra | Sıralayan |',
    '| Bulgu | Önem | Doğru | Yanlış | Abartılı | Durum |', '| A1 | KRİTİK | 0 | 1 | 1 | tartışmalı · kullanıcıya sor |',
    '| B2 | KRİTİK | 0 | 0 | 0 | oy yok · kullanıcıya sor |']) assert.ok(part.split('\n').includes(line), `section has the line: ${line}\n---\n${part}`);
});

test('Ö-48.41 council-lang: the section language comes from the minutes the count was made from', () => {
  const en = writeMinutes('', countVotes(EN_MEETING));
  const tr = writeMinutes('', countVotes(TR_MEETING));
  assert.match(en, /^## 3\. Overall ranking$/m);
  assert.doesNotMatch(en, /Toplu sıralama/);
  assert.match(tr, /^## 3\. Toplu sıralama$/m);
  assert.doesNotMatch(tr, /Overall ranking/);
});

test('Ö-48.42 council-lang: the incomplete-ranking warning in an English file names RANKING and Opinion', () => {
  const minutes = EN_MEETING.replace('RANKING:\n1. Opinion A\n2. Opinion C\n', 'RANKING:\n1. Opinion A\n');
  const s = countVotes(minutes);
  assert.deepEqual(s.invalid, ['B']);
  const part = section3(writeMinutes(minutes, s));
  const warning = part.split('\n').find((l) => l.startsWith('> '));
  assert.equal(typeof warning, 'string', `a warning line in the section\n---\n${part}`);
  assert.ok(warning.includes('RANKING') && warning.includes('Opinion') && warning.includes('B'), warning);
  assert.deepEqual(turkishIn(part), [], 'no SIRALAMA / Görüş in the English warning');
});

// ---------- 4. CLI ----------

test('Ö-48.43 council-lang: the CLI writes the English section into an English file and exits 0; running it again changes nothing', () => {
  const p = project({ 'docs/workflow/council/2026-10-12-plan-signup.md': EN_MEETING });
  const file = path.join(p, 'docs/workflow/council/2026-10-12-plan-signup.md');
  const run = () => spawnSync(process.execPath, [path.join(HOOKS, 'council.mjs'), file], { encoding: 'utf8' });
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  const once = fs.readFileSync(file, 'utf8');
  assert.match(once, /^## 3\. Overall ranking$/m);
  assert.ok(once.split('\n').includes('| A1 | CRITICAL | 0 | 1 | 1 | disputed · ask the user |'), once);
  assert.deepEqual(turkishIn(section3(once)), []);
  assert.equal(run().status, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), once, 'a second run gives the same file');
});

test('Ö-48.44 council-lang: the CLI exits 1 with a message on stderr for an English file without a "### Reviewer:" section', () => {
  const text = EN_MEETING.replace(/## 2\. Cross review[\s\S]*?(?=## 4\.)/, '## 2. Cross review\nNot run yet.\n\n');
  const p = project({ 'm.md': text });
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'council.mjs'), path.join(p, 'm.md')], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.notEqual(r.stderr.trim(), '');
  assert.equal(fs.readFileSync(path.join(p, 'm.md'), 'utf8'), text, 'the file is not changed');
});

// ---------- 5. the dashboard reads English minutes ----------

const EN_DECISION_FULL = `${EN_DECISION}
## 3. Overall ranking

**Consensus:** 67%
**Disputed:** 1

| Opinion | Average rank | Rankers |
|---|---|---|
| A | 1 | 2 |
| B | 1.5 | 2 |
| C | 2 | 2 |

## 4. Chair decision
**Recommendation:** Supabase
**Eliminated:** 1

## IDs
A = council-advisor (haiku) · B = council-advisor (sonnet) · C = council-advisor (opus)
`;

const TR_DECISION_FULL = `${TR_DECISION}
## 3. Toplu sıralama

**Uzlaşma:** %67
**Tartışmalı:** 1

| Görüş | Ortalama sıra | Sıralayan |
|---|---|---|
| A | 1 | 2 |
| B | 1.5 | 2 |
| C | 2 | 2 |

## 4. Başkan kararı
**Öneri:** Supabase
**Elenen:** 1

## Kimlikler
A = council-advisor (haiku) · B = council-advisor (sonnet) · C = council-advisor (opus)
`;

const readCouncil = (text) => {
  const [k, ...rest] = councilMinutes(project({ 'docs/workflow/council/2026-10-14-decision-db.md': text }));
  assert.equal(rest.length, 0);
  const { file, ...fields } = k;
  return fields;
};

test('Ö-48.45 council-lang: councilMinutes reads an English decision council like its Turkish twin', () => {
  const en = readCouncil(EN_DECISION_FULL);
  assert.deepEqual(en, readCouncil(TR_DECISION_FULL));
  assert.deepEqual(en, {
    topic: 'decision · Database choice',
    date: '2026-10-14',
    kind: 'decision',
    decision: 'Supabase',
    consensus: 67,
    disputed: 1,
    eliminated: 1,
    ranking: [
      { opinion: 'A', who: 'council-advisor (haiku)', average: '1' },
      { opinion: 'B', who: 'council-advisor (sonnet)', average: '1.5' },
      { opinion: 'C', who: 'council-advisor (opus)', average: '2' },
    ],
  });
});

test('Ö-48.46 council-lang: councilMinutes reads the English meeting decision, topic from "# Council:"', () => {
  const en = readCouncil(writeMinutesFixed(EN_MEETING, '## 3. Overall ranking\n\n**Consensus:** 50%\n**Disputed:** 2\n\n| Opinion | Average rank | Rankers |\n|---|---|---|\n| B | 1 | 2 |\n', '\n## IDs\nB = security-auditor (sonnet)\n'));
  const tr = readCouncil(writeMinutesFixed(TR_MEETING, '## 3. Toplu sıralama\n\n**Uzlaşma:** %50\n**Tartışmalı:** 2\n\n| Görüş | Ortalama sıra | Sıralayan |\n|---|---|---|\n| B | 1 | 2 |\n', '\n## Kimlikler\nB = security-auditor (sonnet)\n'));
  assert.equal(en.topic, 'plan · G-012 sign-up form');
  assert.equal(en.decision, 'CONDITIONAL');
  assert.equal(tr.decision, 'KOŞULLU ONAY');
  const { decision: _en, ...enRest } = en;
  const { decision: _tr, ...trRest } = tr;
  assert.deepEqual(enRest, trRest);
  assert.deepEqual(en.ranking, [{ opinion: 'B', who: 'security-auditor (sonnet)', average: '1' }]);
});

// A hand-written "## 3." section before "## 4." and a tail at the end (the dashboard test does not depend on council.mjs writing English)
function writeMinutesFixed(minutes, section, tail) {
  return `${minutes.replace(/^## 4\./m, `${section}\n## 4.`)}${tail}`;
}

// ---------- 6. verdict badges on the dashboard ----------

const kitRecord = { version: '3.48.0', type: 'web-saas', addons: [], tool: null, lang: 'en', created: '2026-10-01', updated: '2026-10-01', files: {} };

// councils: { marker: [language, decision line] }, meetings: { marker: result }. Returns { marker: badge class }.
function badges({ councils = {}, meetings = {} }) {
  const files = {
    '.kit.json': kitRecord,
    // A fresh GitHub cache: an installed project would otherwise call gh
    '.claude/state/github-cache.json': { time: Date.now(), data: { runs: [], prs: [], liveMonitoring: [] } },
  };
  let day = 10;
  for (const [marker, [lang, line]] of Object.entries(councils)) {
    const head = lang === 'en' ? `# Council: plan · ${marker}\n**Date:** 2026-10-${day} · **Type:** plan\n\n## 4. Chair decision\n`
      : `# Konsey: plan · ${marker}\n**Tarih:** 2026-10-${day} · **Tür:** plan\n\n## 4. Başkan kararı\n`;
    files[`docs/workflow/council/2026-10-${day}-plan-${marker}.md`] = `${head}${line}\n`;
    day++;
  }
  const rows = Object.entries(meetings).map(([marker, result], i) => `| ${i + 1} | 2026-10-20 | plan | ${marker} | board-architect | ${result} | - | noted |`);
  if (rows.length) files['docs/workflow/board.md'] = `## Meeting log\n\n| # | Date | Kind | Scope | Attendees | Result | Critical | Decision |\n|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
  const p = project(files);
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'dashboard.mjs'), p, '--quiet'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const html = fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8');
  const out = {};
  for (const marker of [...Object.keys(councils), ...Object.keys(meetings)]) {
    // The table row (<tr>…</tr>) that holds the marker, and the badge inside it
    const row = html.match(new RegExp(`<tr>(?:(?!</tr>)[\\s\\S])*?${marker}(?:(?!</tr>)[\\s\\S])*?</tr>`))?.[0];
    assert.equal(typeof row, 'string', `a table row for ${marker}`);
    out[marker] = row.match(/class="badge (\w+)"/)?.[1] ?? null;
  }
  return out;
}

test('Ö-48.47 council-lang: on the dashboard an English council decision gets the same badge as the Turkish one', () => {
  const b = badges({ councils: {
    zqkosullu: ['tr', '**Karar:** KOŞULLU ONAY'], zqconditional: ['en', '**Decision:** CONDITIONAL'],
    zqret: ['tr', '**Karar:** RET'], zqreject: ['en', '**Decision:** REJECT'],
    zqonay: ['tr', '**Karar:** ONAY'], zqapprove: ['en', '**Decision:** APPROVE'],
  } });
  assert.deepEqual([b.zqkosullu, b.zqret, b.zqonay], ['warn', 'critical', 'good'], 'Turkish verdicts keep their badges');
  assert.deepEqual([b.zqconditional, b.zqreject, b.zqapprove], [b.zqkosullu, b.zqret, b.zqonay]);
});

test('Ö-48.48 council-lang: on the dashboard an English board meeting result gets the same badge as the Turkish one', () => {
  const b = badges({ meetings: {
    zqmkosullu: 'KOŞULLU ONAY', zqmconditional: 'CONDITIONAL', zqmret: 'RET', zqmreject: 'REJECT', zqmonay: 'ONAY', zqmapprove: 'APPROVE',
  } });
  assert.deepEqual([b.zqmkosullu, b.zqmret, b.zqmonay], ['warn', 'critical', 'good'], 'Turkish results keep their badges');
  assert.deepEqual([b.zqmconditional, b.zqmreject, b.zqmapprove], [b.zqmkosullu, b.zqmret, b.zqmonay]);
});

// ---------- adversarial ----------

test('A-48.13 council-lang: AGREED, AGREEMENT, DISAGREES, OVERSTATEDLY and DOĞRULANDI are not votes (the word must end)', () => {
  const ballot = 'VOTES:\nA1: AGREED\nA2: AGREEMENT\nA3: DISAGREES\nA4: OVERSTATEDLY\nA5: DOĞRULANDI\nB1: AGREE\nRANKING:\n1. Opinion A\n';
  assert.deepEqual(Object.keys(parseBallots(ballot)), ['B1']);
  const minutes = EN_MEETING.replace('A2: agree', 'A2: AGREED').replace('- A1: disagree', '- A1: DISAGREEMENT');
  const counts = findingCounts(countVotes(minutes));
  assert.deepEqual(counts.A2, [1, 0, 0], 'only reviewer C\'s AGREE counts for A2');
  assert.deepEqual(counts.A1, [0, 0, 1], 'only reviewer B\'s OVERSTATED counts for A1');
});

test('A-48.14 council-lang: a decision text with RET only inside a word is not a reject badge', () => {
  // Markers must not be substrings of each other: the row lookup matches the marker text
  const b = badges({
    councils: {
      zqcontrol: ['tr', '**Öneri:** Supabase'],
      zqinterp: ['en', '**Recommendation:** INTERPRETATION B'],
      zqtrinterp: ['tr', '**Öneri:** INTERPRETATION B'],
      zqsecret: ['en', '**Decision:** Secret store'],
    },
    meetings: { zqmonay: 'ONAY', zqmsecret: 'ONAY — Secret store rotated', zqminterp: 'APPROVE — INTERPRETATION B noted' },
  });
  assert.equal(b.zqcontrol, 'info');
  assert.deepEqual([b.zqinterp, b.zqtrinterp, b.zqsecret], [b.zqcontrol, b.zqcontrol, b.zqcontrol], 'an option name is not a verdict');
  assert.deepEqual([b.zqmsecret, b.zqminterp], [b.zqmonay, b.zqmonay], 'an approval that mentions a "secret" stays an approval');
});

test('A-48.15 council-lang: vote words outside VOTES: (opinion prose, review prose, after RANKING:) do not count', () => {
  const minutes = EN_MEETING
    .replace('### Opinion C\nNo findings.', '### Opinion C\nNo findings.\nA1: AGREE with the idea of a check.\nB3: DISAGREE is what I expect others to say.')
    .replace('### Reviewer: B\nVOTES:', '### Reviewer: B\nA1: DISAGREE was my first take.\nB1: OVERSTATED maybe.\nVOTES:')
    .replace('RANKING:\n1. Opinion A\n2. Opinion C\n', 'RANKING:\n1. Opinion A\n2. Opinion C\nA3: AGREE\n');
  assert.deepEqual(neutral(countVotes(minutes)), neutral(countVotes(EN_MEETING)));
  // A reviewer without a VOTES: heading has no ballot at all
  const noHeading = EN_MEETING.replace('### Reviewer: A\nB is more concrete than C.\nVOTES:\n', '### Reviewer: A\nB is more concrete than C.\n');
  const counts = findingCounts(countVotes(noHeading));
  assert.deepEqual([counts.B1, counts.B3], [[1, 0, 0], [0, 0, 1]], 'reviewer A\'s lines without VOTES: are not counted');
});

test('A-48.16 council-lang: English minutes with CRLF line ends count the same as with LF', () => {
  const crlf = (s) => s.replace(/\n/g, '\r\n');
  assert.deepEqual(neutral(countVotes(crlf(EN_MEETING))), neutral(countVotes(EN_MEETING)));
  assert.deepEqual(neutral(countVotes(crlf(EN_DECISION))), neutral(countVotes(EN_DECISION)));
  assert.deepEqual(neutral(countVotes(crlf(EN_MEETING))).counts.A2, [2, 0, 0]);
  assert.deepEqual(readCouncil(crlf(EN_DECISION_FULL)), readCouncil(EN_DECISION_FULL));
});
