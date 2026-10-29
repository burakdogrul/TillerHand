// Run: node --test "kit/tests/*.test.mjs"
// The shipped templates, board, council, agent and command text are English. 3.49.0: hooks read English only
// (the "not understood" cases live in labels*.test.mjs, council-lang.test.mjs, args-lang.test.mjs).
//   1. every label a hook reads from a shipped template is an English LABELS entry; no Turkish label is left at a label position
//   2. no Turkish left in shipped kit text, outside the "3.48" notes and a small allow-list
//   3. the council minutes example is English and council.mjs counts it
//   4. board member format: VERDICT: APPROVE | CONDITIONAL | REJECT, findings [CRITICAL|IMPORTANT|SUGGESTION]
//   5. cost-log sizes S / M / L / BOARD / DESIGN / FINDINGS; the old K / O / B are refused
//   6. the output style is narrator.md; the old anlatici name is gone from the kit
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LABELS, label, verdict } from '../../.claude/hooks/labels.mjs';

// The Turkish labels of the 3.48 dictionary next to their English labels (the hooks no longer know the Turkish ones)
const OLD_PAIRS = [['Son güncelleme', 'Last updated'], ['Aktif faz', 'Active phase'], ['Aktif görev', 'Active task'], ['Başlangıç adımı', 'Setup step'],
  ['Soru modu', 'Question mode'], ['Profil', 'Profile'], ['Şu anki durum', 'Current state'], ['Son oturumda yapılanlar', 'Done last session'],
  ['Sıradaki adım', 'Next step'], ['Bekleyen kararlar', 'Pending decisions'], ['Kaldığı yer', 'Where we left off'],
  ['Açık sorunlar / bloklayıcılar', 'Open issues / blockers'], ['Durum', 'Status'], ['Commit denetimi', 'Commit review'], ['Üyeler', 'Members'],
  ['Toplantı günlüğü', 'Meeting log'], ['Karar günlüğü', 'Decision log'], ['Faz', 'Phase'], ['Komutlar', 'Commands'], ['Tür', 'Type'], ['Sınıf', 'Class'],
  ['Değişmemesi gereken davranış', 'Behavior that must not change'], ['Öncelik', 'Priority'], ['Kapsam dışı', 'Out of scope'],
  ['Seçilen teknolojiler', 'Chosen technologies'], ['Bakım kaydı', 'Maintenance log'], ['Bayraklar', 'Flags'], ['Kayıtlar', 'Records'],
  ['Yayınlanmamış', 'Unreleased'], ['Para birimi', 'Currency'], ['Fiyat (kullanıcı başı aylık)', 'Price (per user, monthly)'],
  ['Ödeme komisyonu (%)', 'Payment fee (%)'], ['Sabit aylık maliyet', 'Fixed monthly cost'], ['Kullanıcı başı değişken maliyet (aylık)', 'Variable cost per user (monthly)'],
  ['Hedef aktif kullanıcı', 'Target active users'], ['Ücretsiz kullanıcı oranı (%)', 'Free user share (%)'], ['Hesaplar', 'Accounts'], ['Gelen kutusu', 'Inbox'],
  ['Temalar', 'Themes'], ['Raporlar', 'Reports'], ['Alarmlar', 'Alarms'], ['Seçilen yön', 'Chosen direction'], ['Değer önerisi', 'Value proposition'],
  ['Kritik akışlar', 'Critical flows'], ['Öğrenilen kurallar', 'Learned rules'], ['Kural', 'Rule'], ['Ortamlar (dev / prod)', 'Environments (dev / prod)']];
import { countVotes, writeMinutes } from '../../.claude/hooks/council.mjs';
import { envWarnings } from '../../.claude/hooks/dashboard-data.mjs';
import { readStatus } from '../../.claude/hooks/status-read.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(REPO, '.claude', 'hooks');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8').replace(/\r\n/g, '\n');
const exists = (rel) => fs.existsSync(path.join(REPO, rel));
const made = [];
after(() => { for (const p of made) fs.rmSync(p, { recursive: true, force: true }); });

function project(files = {}, prefix = 'tpl-lang-') {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(p);
  for (const [f, s] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    fs.writeFileSync(path.join(p, f), typeof s === 'string' ? s : JSON.stringify(s));
  }
  return p;
}

// Every file under rel (posix paths relative to the repo)
function walk(rel) {
  const out = [];
  const dir = path.join(REPO, rel);
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(r));
    else out.push(r);
  }
  return out;
}
const typeDirs = fs.readdirSync(path.join(REPO, 'kit', 'templates')).filter((d) => d !== 'addons');
const perType = (rel) => typeDirs.map((t) => `kit/templates/${t}/${rel}`).filter(exists);

// ---------- 1. labels hooks read from the shipped templates ----------

// Which LABELS keys each template must carry in English (from the readers: status-read.mjs, dashboard.mjs,
// dashboard-data.mjs, progress.mjs, gate.mjs). EXACT: read as sections(text)[label], so the heading is the label alone.
const READ = {
  'docs/workflow/progress.md': ['lastUpdated', 'activePhase', 'activeTask', 'setupStep', 'questionMode', 'profile',
    'currentState', 'doneLastSession', 'nextStep', 'pendingDecisions', 'whereWeLeftOff', 'openIssues'],
  'docs/workflow/board.md': ['status', 'commitReview', 'members', 'meetingLog'],
  'docs/decisions/log.md': ['decisionLog'],
  'docs/product/prd.md': ['valueProposition', 'priority', 'outOfScope'],
  'docs/product/roadmap.md': ['phase'],
  'docs/product/specs/_template.md': ['type', 'class', 'rule', 'mustNotChange'],
  'docs/product/unit-economics.md': ['currency', 'price', 'paymentFee', 'fixedCost', 'variableCost', 'targetUsers', 'freeShare'],
  'docs/product/feedback.md': ['inbox', 'themes'],
  'docs/quality/test-plan.md': ['criticalFlows'],
  'docs/quality/metrics.md': ['records'],
  'docs/workflow/learning.md': ['records'],
  'docs/operations/accounts.md': ['accounts'],
  'docs/operations/feature-flags.md': ['flags'],
  'docs/operations/maintenance.md': ['maintenanceLog'],
  'docs/operations/spend-alarms.md': ['alarms'],
  'docs/findings/README.md': ['reports'],
  'AGENTS.md': ['commands', 'learnedRules'],
  ...Object.fromEntries(perType('docs/architecture/stack.md').map((f) => [f, ['chosenTech']])),
  ...Object.fromEntries(perType('docs/design/design-guide.md').map((f) => [f, ['chosenDirection']])),
};
const EXACT = new Set(['currentState', 'doneLastSession', 'nextStep', 'pendingDecisions', 'openIssues', 'members', 'meetingLog',
  'decisionLog', 'mustNotChange', 'inbox', 'themes', 'records', 'accounts', 'flags', 'maintenanceLog', 'alarms', 'reports', 'chosenTech']);
// Headings read by a fixed numbered prefix (dashboard.mjs findSection)
const PREFIXES = {
  'docs/product/prd.md': ['1. Problem', '3. Value proposition', '5. MVP', '6. Out of scope'],
  'docs/quality/test-plan.md': ['1. Critical flows'],
  ...Object.fromEntries(perType('docs/design/design-guide.md').map((f) => [f, ['1. Chosen direction']])),
};

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
// Line-start **Label:** names and "## " heading titles outside code blocks
function labelPositions(text) {
  const bold = new Set();
  const headings = [];
  let fence = false;
  for (const line of text.split('\n')) {
    if (FENCE.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const b = line.match(/^\*\*([^*]+):\*\*/);
    if (b) bold.add(b[1]);
    if (line.startsWith('## ')) headings.push(line.slice(3).trim());
  }
  return { bold, headings };
}
const unnumbered = (h) => h.replace(/^\d+[a-z]?\.\s+/, '');
const startsWithWord = (s, word) => s.startsWith(word) && !/^[\p{L}\p{N}]/u.test(s.slice(word.length));
function hasLabel(text, key) {
  const en = label(key);
  const { bold, headings } = labelPositions(text);
  if (bold.has(en)) return true;
  return headings.map(unnumbered).some((h) => (EXACT.has(key) ? h === en : startsWithWord(h, en)));
}

test('Ö-48.67 every label a hook reads from a shipped template is there as its English LABELS entry', () => {
  assert.equal(Object.keys(READ).length >= 19, true, 'all templates listed, including the type stack and design guides');
  for (const [file, keys] of Object.entries(READ)) {
    assert.equal(exists(file), true, `${file} exists`);
    const text = read(file);
    for (const key of keys) assert.equal(hasLabel(text, key), true, `${file}: **${label(key)}:** or "## ${label(key)}" at a label position`);
  }
  for (const [file, prefixes] of Object.entries(PREFIXES)) {
    const { headings } = labelPositions(read(file));
    for (const prefix of prefixes) assert.equal(headings.some((h) => startsWithWord(h, prefix)), true, `${file}: "## ${prefix}"`);
  }
  // The roadmap reader takes "## Phase N" headings
  assert.match(read('docs/product/roadmap.md'), /^## Phase \d/m);
  // AGENTS.md → Commands block keys (gate.mjs, preview.mjs)
  const commands = read('AGENTS.md').match(/^## Commands[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';
  for (const k of ['dev', 'preview', 'test', 'lint', 'type check', 'build']) assert.match(commands, new RegExp(`^${k}:`, 'm'), `AGENTS.md Commands: ${k}:`);
});

test('Ö-48.68 no old Turkish label is left at a label position in the shipped templates', () => {
  for (const file of Object.keys(READ)) {
    const { bold, headings } = labelPositions(read(file));
    for (const [tr] of OLD_PAIRS) {
      assert.equal(bold.has(tr), false, `${file}: **${tr}:**`);
      assert.equal(headings.map(unnumbered).some((h) => startsWithWord(h, tr) || startsWithWord(h, `[${tr}]`)), false, `${file}: ## ${tr}`);
    }
  }
});

test('Ö-48.69 accounts.md: the environments heading the prod-ref check reads is an English LABELS entry and works as shipped', () => {
  const text = read('docs/operations/accounts.md');
  const sections = text.split(/^## /m).slice(1).map((s) => [s.split('\n')[0].trim(), s]);
  const env = sections.find(([, body]) => /^\|\s*Environment\s*\|/m.test(body));
  assert.equal(Array.isArray(env), true, 'accounts.md has the "| Environment |" table');
  const heading = env[0];
  const en = Object.keys(LABELS).map(label).find((l) => startsWithWord(heading, l));
  assert.equal(typeof en, 'string', `"## ${heading}" starts with an English LABELS entry`);
  const entry = { en };
  // The shipped template, filled in: a prod ref in .mcp.json is critical
  const filled = text.replace('[dev ref]', 'devref111aaaabbbbcccc').replace('[prod ref]', 'prodref999aaaabbbbcccc');
  assert.notEqual(filled, text, 'the template has [dev ref] / [prod ref] placeholders');
  const p = project({ 'docs/operations/accounts.md': filled, '.mcp.json': '{"url":"https://mcp.supabase.com/mcp?project_ref=prodref999aaaabbbbcccc"}' });
  assert.deepEqual(envWarnings(p).map((u) => u.sev), ['critical']);
  // /release points at the same heading
  assert.match(read('.claude/commands/release.md'), new RegExp(`accounts\\.md\` → "${entry.en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('Ö-48.80 the project name placeholder is [PROJECT NAME] and counts as unnamed', () => {
  assert.match(read('AGENTS.md'), /^# \[PROJECT NAME\]$/m);
  assert.match(read('kit/project/README.md'), /^# \[PROJECT NAME\]$/m);
  const name = (agents, claude) => readStatus(project({ 'AGENTS.md': agents, ...(claude ? { 'CLAUDE.md': claude } : {}) }, 'tpl-name-')).project;
  // Projects before 3.9.0 keep the name in CLAUDE.md: a placeholder in AGENTS.md falls through to it
  assert.equal(name('# [PROJECT NAME]\n', '# Billfast App\n'), 'Billfast App');
  assert.equal(name('# Billfast App\n', '# Other\n'), 'Billfast App', 'a real name in AGENTS.md wins');
});

// ---------- 2. no Turkish in shipped kit text ----------

const SHIPPED = [
  ...['.claude/board', '.claude/agents', '.claude/commands', '.claude/output-styles'].flatMap((d) =>
    fs.readdirSync(path.join(REPO, d)).filter((f) => f.endsWith('.md')).map((f) => `${d}/${f}`)),
  ...walk('.claude/findings'), ...walk('docs'), ...walk('kit/templates'), 'AGENTS.md', 'CLAUDE.md',
].filter((f) => f.endsWith('.md'));
// Turkish on purpose: test data the rules name, official Turkish names (registries, authorities, document types) and a
// fixed legal sentence. 3.49.0: the Turkey add-on and the KVKK doc are English and scanned too; the font check names
// "the characters of the project language" instead of Turkish letters.
const ALLOWED = ['İ/ı', 'İYS', 'GİB', 'e-Arşiv', 'VERBİS', 'BTK', 'ETBİS', '"Bu satış internet üzerinden yapılmıştır."',
  'ısparta', 'İSTANBUL', 'Çağla', 'Ömer', 'İstanbul'];
// turkiye.md §4 is about the Turkish letters: it names them, and §3 names the currency subunit (kuruş)
const FILE_ALLOWED = { 'kit/templates/addons/tr/docs/legal/turkiye.md': ['"ı"', '"İ"', 'ç, ğ, ı, ö, ş, ü', 'kuruş'] };
const TURKISH_LETTER = /[çğıöşüÇĞİÖŞÜ]/u;
const VERDICT_WORDS = /(?<![\p{L}\p{N}_])(KRİTİK|ÖNEMLİ|KOŞULLU|ONAY|RET)(?![\p{L}\p{N}_])/u;
const offending = (test) => SHIPPED.flatMap((f) => read(f).split('\n').map((line, i) => ({ f, n: i + 1, line })))
  .filter(({ line }) => !line.includes('3.48') && test(line));
const show = (list) => list.slice(0, 15).map(({ f, n, line }) => `${f}:${n}: ${line.slice(0, 140)}`).join('\n');

test('Ö-48.70 no line with a Turkish letter in shipped kit text, outside 3.48 notes and the allow-list', () => {
  assert.equal(SHIPPED.length > 60, true, `the scan covers the shipped text (${SHIPPED.length} files)`);
  for (const f of ['.claude/board/council.md', '.claude/commands/build.md', '.claude/output-styles/narrator.md', 'docs/workflow/progress.md', 'AGENTS.md']) {
    assert.equal(SHIPPED.includes(f), true, `scanned: ${f}`);
  }
  for (const f of ['kit/templates/addons/tr/docs/legal/turkiye.md', 'docs/legal/privacy-kvkk.md']) {
    assert.equal(SHIPPED.includes(f), true, `AC-49.23 scanned since 3.49.0: ${f}`);
  }
  const strip = (f, line) => [...ALLOWED, ...(FILE_ALLOWED[f] ?? [])].reduce((s, a) => s.split(a).join(''), line);
  const left = SHIPPED.flatMap((f) => read(f).split('\n').map((line, i) => ({ f, n: i + 1, line })))
    .filter(({ f, line }) => !line.includes('3.48') && TURKISH_LETTER.test(strip(f, line)));
  assert.deepEqual(left.map(({ f, n }) => `${f}:${n}`), [], show(left));
});

test('AC-49.23 turkiye.md and privacy-kvkk.md are English: no Turkish letter outside the allow-list, English headings', () => {
  for (const f of ['kit/templates/addons/tr/docs/legal/turkiye.md', 'docs/legal/privacy-kvkk.md']) {
    const allowed = [...ALLOWED, ...(FILE_ALLOWED[f] ?? [])];
    const left = read(f).split('\n').map((line, i) => ({ f, n: i + 1, line }))
      .filter(({ line }) => TURKISH_LETTER.test(allowed.reduce((s, a) => s.split(a).join(''), line)));
    assert.deepEqual(left.map(({ f: x, n }) => `${x}:${n}`), [], show(left));
  }
  // Turkish words without a Turkish letter, from the old texts
  const plain = /\b(Kaynak|Kontrol|Projede|odendi|bekliyor|durum|ORNEK|ornek|Hukuki|Ticari|veya|icin)\b/;
  for (const f of ['kit/templates/addons/tr/docs/legal/turkiye.md', 'docs/legal/privacy-kvkk.md']) {
    const words = read(f).split('\n').map((line, i) => ({ f, n: i + 1, line }))
      .filter(({ line }) => plain.test(ALLOWED.reduce((s, a) => s.split(a).join(''), line)));
    assert.deepEqual(words.map(({ n, line }) => `${f}:${n}: ${line.match(plain)[0]}`), [], show(words));
  }
});

// ---------- 3.49.0 step 4: skill descriptions and /design name no Turkish ----------

const frontmatter = (text) => text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
const SKILL_TURKISH = /[çğıöşüÇĞİÖŞÜ]|\b(marka|kimligi|tanitim|videosu|urun|animasyonu|arastir|daha|canli|akici|yap|olustur)\b/i;

test('AC-49.25 skill descriptions (.claude/skills/*/SKILL.md) contain no Turkish word', () => {
  const skills = fs.readdirSync(path.join(REPO, '.claude/skills'), { withFileTypes: true }).filter((e) => e.isDirectory() && exists(`.claude/skills/${e.name}/SKILL.md`)).map((e) => e.name);
  assert.equal(skills.length >= 4, true, `skills found: ${skills.join(', ')}`);
  for (const name of skills) {
    const fm = frontmatter(read(`.claude/skills/${name}/SKILL.md`));
    const desc = fm.match(/^description:\s*(.+)$/m)?.[1] ?? '';
    assert.notEqual(desc.trim(), '', `${name}: has a description`);
    assert.doesNotMatch(desc, SKILL_TURKISH, `${name}: ${desc.match(SKILL_TURKISH)?.[0]}`);
  }
  // The K5 examples by name
  const all = skills.map((n) => frontmatter(read(`.claude/skills/${n}/SKILL.md`))).join('\n');
  for (const w of ['tanıtım videosu', 'marka kimliği', 'araştır', 'ürün animasyonu', 'daha canlı']) assert.equal(all.includes(w), false, w);
});

test('AC-49.26 /design names "the characters of the project language", not Turkish letters', () => {
  const md = read('.claude/commands/design.md');
  assert.match(md, /the characters of the project language/);
  assert.doesNotMatch(md, /ğ, ş, ı, İ/);
  const left = md.split('\n').map((line, i) => [i + 1, line]).filter(([, line]) => TURKISH_LETTER.test(line));
  assert.deepEqual(left.map(([n, l]) => `${n}: ${l.slice(0, 120)}`), []);
});

test('Ö-48.71 no Turkish verdict or severity word (KRİTİK, ÖNEMLİ, KOŞULLU, ONAY, RET) in shipped kit text outside 3.48 notes', () => {
  const left = offending((line) => VERDICT_WORDS.test(line));
  assert.deepEqual(left.map(({ f, n }) => `${f}:${n}`), [], show(left));
});

test('Ö-48.72 a 3.48 note names a Turkish label only next to its English one; no Turkish heading or date placeholder without Turkish letters', () => {
  const lines = SHIPPED.flatMap((f) => read(f).split('\n').map((line, i) => ({ f, n: i + 1, line })));
  // "**Sınıf:** (before 3.48)" is fine next to **Class:**; a Turkish label alone tells the reader to write Turkish
  const alone = lines.filter(({ line }) => line.includes('3.48') && OLD_PAIRS.some(([tr, en]) =>
    (line.includes(`**${tr}:**`) || line.includes(`"${tr}"`)) && !line.includes(en)));
  assert.deepEqual(alone.map(({ f, n }) => `${f}:${n}`), [], show(alone));
  // Turkish words the letter scan cannot see
  const plain = offending((line) => /Ortamlar|YYYY-AA-GG/.test(line));
  assert.deepEqual(plain.map(({ f, n }) => `${f}:${n}`), [], show(plain));
});

// ---------- 3. council protocol ↔ council.mjs ----------

const councilExample = () => read('.claude/board/council.md').match(/^## Minutes\n[\s\S]*?^```markdown\n([\s\S]*?)^```$/m)?.[1] ?? '';

test('Ö-48.73 council.md: the minutes example is English', () => {
  const ex = councilExample();
  assert.notEqual(ex, '', 'council.md → Minutes has a ```markdown example');
  for (const re of [/^# Council: /m, /^## 1\. First opinions$/m, /^### Opinion A$/m, /^RECOMMENDATION: /m, /^## 2\. Cross review$/m,
    /^### Reviewer: A$/m, /^VOTES:$/m, /^RANKING:$/m, /^1\. Opinion [A-Z]$/m, /^## 3\. Overall ranking$/m, /^## IDs$/m]) assert.match(ex, re);
  assert.match(ex, /\[CRITICAL\]/);
  assert.match(ex, /AGREE \| DISAGREE \| OVERSTATED/);
  assert.doesNotMatch(ex, /Konsey|Görüş|İnceleyen|OYLAR|SIRALAMA|ÖNERİ|DOĞRU|YANLIŞ|ABARTILI|Kimlikler|Toplu sıralama|KRİTİK|ÖNEMLİ/u);
});

test('Ö-48.74 council.mjs counts the protocol example (filled minimally) and writes the English section', () => {
  const ex = councilExample();
  // The example leaves Opinion B as "..." and ranks an Opinion C it does not show: give both one finding
  const filled = ex.replace(/^### Opinion B\n\.\.\.\n/m, '### Opinion B\n- B1 [IMPORTANT] b.mjs:1 — problem — suggestion\n### Opinion C\n- C1 [SUGGESTION] c.mjs:1 — problem — suggestion\n');
  assert.notEqual(filled, ex, 'the example has "### Opinion B" followed by "..."');
  const s = countVotes(filled);
  assert.equal(s.reviewerCount, 1, 'the "### Reviewer: A" section is found');
  assert.deepEqual(s.invalid, [], 'its RANKING is complete');
  assert.deepEqual(s.ranking, [{ opinion: 'C', average: 1, votes: 1 }, { opinion: 'B', average: 2, votes: 1 }]);
  // Per finding: severity and the Agree | Disagree | Overstated counts, read from the written findings table
  const out = writeMinutes(filled, s);
  const rows = out.split('\n').map((l) => l.match(/^\|\s*([A-Z]\d+)\s*\|\s*([A-Z]+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/)).filter(Boolean)
    .map((m) => [m[1], m[2], Number(m[3]), Number(m[4]), Number(m[5])]);
  assert.deepEqual(rows, [['A1', 'CRITICAL', 0, 0, 0], ['A2', 'IMPORTANT', 0, 0, 0], ['B1', 'IMPORTANT', 1, 0, 0], ['C1', 'SUGGESTION', 0, 0, 0]]);
  assert.match(out, /^## 3\. Overall ranking\n\n\*\*Consensus:\*\* /m);
  assert.doesNotMatch(out, /<written by council\.mjs>/, 'the placeholder section is replaced');
  assert.match(out, /^## 4\. Chair decision$/m, 'the next section stays');
});

// ---------- 4. board member format ----------

test('Ö-48.75 every board member and security-auditor gives VERDICT: APPROVE | CONDITIONAL | REJECT with [CRITICAL|IMPORTANT|SUGGESTION]; verdict() reads the three', () => {
  const members = fs.readdirSync(path.join(REPO, '.claude/board')).filter((f) => /^board-.*\.md$/.test(f)).map((f) => `.claude/board/${f}`);
  assert.equal(members.length >= 10, true, `board members found: ${members.length}`);
  for (const f of [...members, '.claude/agents/security-auditor.md']) {
    const text = read(f);
    assert.match(text, /^MEMBER: .+ · VERDICT: APPROVE \| CONDITIONAL \| REJECT$/m, f);
    assert.match(text, /^\[CRITICAL\|IMPORTANT\|SUGGESTION\] /m, f);
  }
  assert.equal(verdict('APPROVE'), 'approve');
  assert.equal(verdict('CONDITIONAL'), 'conditional');
  assert.equal(verdict('REJECT'), 'reject');
});

// ---------- 5. cost-log sizes ----------

const today = () => new Date().toLocaleDateString('sv-SE');
function costProject() {
  const p = project({ 'docs/workflow/cost-log.md': read('docs/workflow/cost-log.md') }, 'tpl-cost-');
  const run = (...a) => spawnSync(process.execPath, [path.join(HOOKS, 'progress.mjs'), ...a], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  const log = () => fs.readFileSync(path.join(p, 'docs/workflow/cost-log.md'), 'utf8');
  return { p, run, log };
}

test('Ö-48.76 progress.mjs --cost: S / M / L / BOARD / DESIGN / FINDINGS are written as given', () => {
  const { run, log } = costProject();
  for (const given of ['S', 'M', 'L', 'BOARD', 'DESIGN', 'FINDINGS']) {
    const r = run('--cost', `job ${given}`, given, '10', '13', '7');
    assert.equal(r.status, 0, `${given}: ${r.stderr}`);
    assert.ok(log().trimEnd().endsWith(`| ${today()} | job ${given} | ${given} | 10 | 13 | 3 | 7 |  |`), `${given} is written as given`);
  }
  // Only job and size: start from --start
  assert.equal(run('--start', '--limit', '20').status, 0);
  assert.equal(run('--cost', 'auto', 'L', '--limit', '25').status, 0);
  assert.match(log().trimEnd().split('\n').pop(), new RegExp(`^\\| ${today()} \\| auto \\| L \\| 20 \\| 25 \\| 5 \\| \\d+ \\|  \\|$`));
  // What the user reads names the new sizes only
  const usage = run('--cost', 'x', 'Q', '1', '2', '3').stderr;
  assert.match(usage, /<S\|M\|L\|BOARD\|DESIGN\|FINDINGS>/);
  assert.doesNotMatch(usage, /K\|O\|B/);
  assert.doesNotMatch(read('docs/workflow/cost-log.md'), /\bK \(|\bO \(|\bB \(/, 'the cost log template lists S / M / L');
  assert.match(read('docs/workflow/cost-log.md'), /S \(small\) \/ M \(medium\) \/ L \(large\)/);
  assert.match(read('.claude/commands/build.md'), /--cost "[^"]*" <S\|M\|L>/);
});

test('A-48.21 progress.mjs --cost: an unknown size is refused with a non-zero exit and nothing is written', () => {
  const { run, log } = costProject();
  const before = log();
  for (const size of ['Q', 'XL', 'SM', 'Küçük', 'BÜYÜK', 'KO', 'K', 'O', 'B', 'k', 'o', 'b']) {
    const r = run('--cost', 'job', size, '10', '13', '7');
    assert.notEqual(r.status, 0, `${size}: refused`);
    assert.match(r.stderr, /Usage/, size);
    assert.equal(log(), before, `${size}: the cost log is unchanged`);
  }
  assert.equal(run('--start', '--limit', '20').status, 0);
  for (const size of ['Q', 'B']) {
    const auto = run('--cost', 'job', size, '--limit', '25');
    assert.notEqual(auto.status, 0, `${size}: refused in the --start form too`);
  }
  assert.equal(log(), before, 'nothing written');
});

test('Ö-48.77 dashboard cost card: S / M / L / BOARD rows average per size', () => {
  const header = read('docs/workflow/cost-log.md').trimEnd();
  const row = (size, diff) => `| 2026-10-0${diff % 9 + 1} | job | ${size} | 10 | ${10 + diff} | ${diff} | 5 |  |`;
  const kit = { version: '3.48.0', type: 'web-saas', addons: [], tool: null, lang: 'en', created: '2026-10-01', updated: '2026-10-01', files: {} };
  const p = project({
    '.kit.json': kit, '.claude/state/github-cache.json': { time: Date.now(), data: { runs: [], prs: [], liveMonitoring: [] } }, 'AGENTS.md': '# Cost\n',
    'docs/workflow/cost-log.md': [header, row('S', 2), row('S', 4), row('M', 6), row('M', 8), row('L', 10), row('L', 20), row('BOARD', 3), ''].join('\n'),
  }, 'tpl-cost-dash-');
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'dashboard.mjs'), p, '--quiet'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const html = fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8');
  const card = (size, avg, n) => new RegExp(`<div class="kpi-l">Average · ${size}</div><div class="kpi-v">%${avg}</div><div class="kpi-s">${n} records</div>`);
  assert.match(html, card('S', '3\\.0', 2));
  assert.match(html, card('M', '7\\.0', 2));
  assert.match(html, card('L', '15\\.0', 2));
  assert.match(html, card('BOARD', '3\\.0', 1));
});

// ---------- 6. output style narrator ----------

test('AC-49.13 the output style is .claude/output-styles/narrator.md; the old name "anlatici" is gone from the kit (no rename map left)', () => {
  assert.equal(exists('.claude/output-styles/narrator.md'), true);
  assert.equal(exists('.claude/output-styles/anlatici.md'), false);
  assert.match(read('.claude/output-styles/narrator.md'), /^---\nname: narrator\n/, 'the style name field');
  assert.match(read('.claude/commands/start.md'), /"outputStyle": "narrator"/);
  const files = [...walk('.claude'), ...walk('docs'), ...walk('kit')].filter((f) => /\.(md|mjs|js|json|html)$/.test(f)
    && !f.startsWith('kit/tests/') && !/(^|\/)CHANGELOG[^/]*$/.test(f) && !f.startsWith('.claude/state/') && f !== '.claude/settings.local.json');
  assert.equal(files.includes('kit/kit.mjs') && files.includes('kit/guide.html'), true, 'kit code and guide are scanned');
  // The file / style name "anlatici" (ASCII) appears nowhere, not even as a rename map entry.
  // The Turkish word "anlatıcı" in the Turkish guide's prose is not a reference.
  const left = files.flatMap((f) => read(f).split('\n').map((line, i) => ({ f, n: i + 1, line })))
    .filter(({ line }) => /anlatici/i.test(line));
  assert.deepEqual(left.map(({ f, n }) => `${f}:${n}`), [], show(left));
});

// An installed project made to look like one set up before 3.48: anlatici.md recorded by the kit, no narrator.md
const KIT_MJS = path.join(REPO, 'kit', 'kit.mjs');
const sha = (s) => crypto.createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');
const OLD_STYLE = read('.claude/output-styles/narrator.md').replace(/^name: narrator$/m, 'name: anlatici');
function oldProject(name, { styleText = OLD_STYLE, recordedText = OLD_STYLE } = {}) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-style-')), name);
  made.push(path.dirname(p));
  fs.cpSync(REPO, p, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules|\.calisma)$/.test(src) && !src.endsWith('.kit.json') && !src.endsWith('settings.local.json') });
  const r = spawnSync(process.execPath, [path.join(p, 'kit', 'kit.mjs'), 'install', '--type', 'backend'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const rec = JSON.parse(fs.readFileSync(path.join(p, '.kit.json'), 'utf8'));
  fs.rmSync(path.join(p, '.claude/output-styles/narrator.md'), { force: true });
  delete rec.files['.claude/output-styles/narrator.md'];
  fs.writeFileSync(path.join(p, '.claude/output-styles/anlatici.md'), styleText);
  rec.files['.claude/output-styles/anlatici.md'] = sha(recordedText);
  fs.writeFileSync(path.join(p, '.kit.json'), JSON.stringify(rec));
  return p;
}
const update = (p) => spawnSync(process.execPath, [KIT_MJS, 'update', '--project', p], { encoding: 'utf8' });
const json = (p, rel) => JSON.parse(fs.readFileSync(path.join(p, rel), 'utf8'));

test('A-48.22 kit update: a user-changed anlatici.md is not lost; another output style setting is left alone', () => {
  const mine = `${OLD_STYLE}\nMy own rule: explain every step twice.\n`;
  const p = oldProject('changed', { styleText: mine });
  fs.writeFileSync(path.join(p, '.claude/settings.local.json'), JSON.stringify({ outputStyle: 'Explanatory' }, null, 2));
  const shared = json(p, '.claude/settings.json');
  fs.writeFileSync(path.join(p, '.claude/settings.json'), JSON.stringify({ ...shared, outputStyle: 'Learning' }, null, 2));
  const r = update(p);
  assert.equal(r.status, 0, r.stderr);
  const kept = ['anlatici.md', 'narrator.md'].map((f) => path.join(p, '.claude/output-styles', f))
    .filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8'));
  assert.equal(kept.some((t) => t.includes('My own rule: explain every step twice.')), true, 'the user\'s text is still in anlatici.md or narrator.md');
  assert.equal(json(p, '.claude/settings.local.json').outputStyle, 'Explanatory');
  assert.equal(json(p, '.claude/settings.json').outputStyle, 'Learning');
});
