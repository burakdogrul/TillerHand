// Run: node --test kit/tests/memory-dashboard.test.mjs
// Project memory on the dashboard (3.74.0, AC-74.170 and up). Decision H5: the dashboard shows numbers only, never note text.
// memoryStats(root) -> { notes, shared, people, receipts, last }, and a "Memory" KPI in the top KPI row of dashboard.html.
// Readings the contract leaves open:
//  - a broken memory.dir setting gives zeros for ALL five numbers (shared included), as the contract says "give zeros".
//  - the KPI shows when any of notes, shared, people, receipts is above zero; with all four at zero it is left out.
//  - what the sub line prints for last when there are no receipts (null) is not pinned.
//  - a receipt line made only of spaces is not used in any count here (doctor counts it, the contract does not say).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(REPO, '.claude', 'hooks');
const MODULE_URL = pathToFileURL(path.join(HOOKS, 'memory.mjs')).href;
const TR_JSON = path.join(REPO, '.claude', 'i18n', 'tr.json');

// Dynamic import so a missing export fails each test on its own, not the whole file at load time.
async function api(...names) {
  const m = await import(MODULE_URL);
  for (const n of names) assert.equal(typeof m[n], 'function', `memory.mjs exports ${n}`);
  return m;
}

// ---------- helpers ----------

const gitIn = (cwd, ...a) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8' });
const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function mkRoot(t, { lang } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-dash-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(gitIn(root, 'init', '-q').status, 0);
  fs.writeFileSync(path.join(root, '.gitignore'), '.claude/state/\ndashboard.html\n');
  if (lang) {
    fs.writeFileSync(path.join(root, '.kit.json'), JSON.stringify({ version: '3.74.0', type: 'web-saas', addons: [], tool: null, files: {}, lang }, null, 2));
    if (lang === 'tr') {
      fs.mkdirSync(path.join(root, '.claude', 'i18n'), { recursive: true });
      fs.copyFileSync(TR_JSON, path.join(root, '.claude', 'i18n', 'tr.json'));
    }
  }
  return root;
}

const memDir = (root) => path.join(root, '.claude', 'state', 'memory');
const put = (root, rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const receiptLine = (n) => JSON.stringify({ at: '2026-01-01T00:00:00.000Z', session: `s${n}`, summary: `did thing ${n}`, refs: [] });
const ZERO = { notes: 0, shared: 0, people: 0, receipts: 0, last: null };

// ---------- memoryStats ----------

test('AC-74.170 memoryStats: an empty project gives all zeros and last null, and writes nothing', async (t) => {
  const root = mkRoot(t);
  const { memoryStats } = await api('memoryStats');
  assert.deepEqual(memoryStats(root), ZERO);
  assert.equal(fs.existsSync(path.join(root, '.claude')), false, 'reading the numbers creates no folder');
  assert.equal(fs.existsSync(path.join(root, 'docs')), false, 'reading the numbers creates no docs folder');
});

test('AC-74.171 memoryStats: notes count .md files recursively, other files are not counted', async (t) => {
  const root = mkRoot(t);
  const { memoryStats } = await api('memoryStats');
  put(root, '.claude/state/memory/notes/a.md', '# a\n');
  put(root, '.claude/state/memory/notes/b.md', '# b\n');
  put(root, '.claude/state/memory/notes/deep/er/c.md', '# c\n');
  put(root, '.claude/state/memory/notes/readme.txt', 'not a note');
  put(root, '.claude/state/memory/notes/data.json', '{}');
  const s = memoryStats(root);
  assert.equal(s.notes, 3);
  assert.deepEqual({ ...s, notes: 0 }, ZERO, 'nothing else is counted');
});

test('AC-74.172 memoryStats: shared counts the .md files under docs/memory, people the .md files under people/', async (t) => {
  const root = mkRoot(t);
  const { memoryStats } = await api('memoryStats');
  put(root, 'docs/memory/one.md', '# one\n');
  put(root, 'docs/memory/sub/two.md', '# two\n');
  put(root, 'docs/memory/skip.txt', 'x');
  put(root, '.claude/state/memory/people/ali.md', '# Ali\n');
  put(root, '.claude/state/memory/people/ayse.md', '# Ayse\n');
  put(root, '.claude/state/memory/people/ayse.bak', 'x');
  // files outside the three folders are not memory
  put(root, 'docs/other.md', '# other\n');
  put(root, '.claude/state/memory/core.md', '# Core\n');
  assert.deepEqual(memoryStats(root), { notes: 0, shared: 2, people: 2, receipts: 0, last: null });
});

test('AC-74.173 memoryStats: receipts count the non-empty lines of every receipts/*.jsonl, last is the newest file-name date', async (t) => {
  const root = mkRoot(t);
  const { memoryStats } = await api('memoryStats');
  put(root, '.claude/state/memory/receipts/2026-03-05.jsonl', `${receiptLine(1)}\n${receiptLine(2)}\n`);
  put(root, '.claude/state/memory/receipts/2026-11-01.jsonl', `${receiptLine(3)}\n\n${receiptLine(4)}\n\n\n${receiptLine(5)}`);
  put(root, '.claude/state/memory/receipts/2025-12-31.jsonl', `${receiptLine(6)}\n`);
  put(root, '.claude/state/memory/receipts/notes.txt', `${receiptLine(7)}\n${receiptLine(8)}\n`);
  assert.deepEqual(memoryStats(root), { notes: 0, shared: 0, people: 0, receipts: 6, last: '2026-11-01' });
});

test('AC-74.174 memoryStats: last comes from the receipt file name, not from the file time', async (t) => {
  const root = mkRoot(t);
  const { memoryStats } = await api('memoryStats');
  const newer = put(root, '.claude/state/memory/receipts/2026-02-02.jsonl', `${receiptLine(1)}\n`);
  const older = put(root, '.claude/state/memory/receipts/2024-08-09.jsonl', `${receiptLine(2)}\n`);
  fs.utimesSync(newer, new Date('2020-01-01T00:00:00Z'), new Date('2020-01-01T00:00:00Z'));
  fs.utimesSync(older, new Date('2026-06-01T00:00:00Z'), new Date('2026-06-01T00:00:00Z'));
  assert.equal(memoryStats(root).last, '2026-02-02');
});

test('AC-74.175 memoryStats: the numbers agree with what addNote, addPerson and addReceipt wrote and with the doctor line', async (t) => {
  const root = mkRoot(t);
  const m = await api('memoryStats', 'addNote', 'addPerson', 'addReceipt', 'doctor');
  m.addNote(root, { text: 'First personal note about tea.', meta: { title: 'tea one' } });
  m.addNote(root, { text: 'Second personal note about coffee.', meta: { title: 'coffee two' } });
  m.addNote(root, { text: 'A shared team note about releases.', meta: { title: 'releases', visibility: 'project' } });
  m.addPerson(root, { name: 'Mehmet Demir', facts: ['rol: muhasebe'] });
  m.addReceipt(root, { session: 'sess-1', summary: 'first thing' });
  m.addReceipt(root, { session: 'sess-1', summary: 'second thing' });
  m.addReceipt(root, { session: 'sess-2', summary: 'third thing' });
  const s = m.memoryStats(root);
  assert.deepEqual(s, { notes: 2, shared: 1, people: 1, receipts: 3, last: ymd() });
  const line = m.doctor(root).find((l) => l.startsWith('Notes:'));
  assert.equal(line, `Notes: ${s.notes} personal, ${s.shared} shared (docs/memory) · people: ${s.people} · receipts: ${s.receipts}`);
});

test('AC-74.176 memoryStats: a broken memory.dir setting gives zeros and never throws', async (t) => {
  const { memoryStats } = await api('memoryStats');
  for (const dir of ['../escape', '/abs/elsewhere', 'C:foo', 42, '\0bad']) {
    const root = mkRoot(t);
    put(root, '.claude/state/memory/notes/a.md', '# a\n');
    put(root, '.claude/state/memory/people/p.md', '# p\n');
    put(root, '.claude/state/memory/receipts/2026-01-01.jsonl', `${receiptLine(1)}\n`);
    put(root, 'docs/memory/s.md', '# s\n');
    put(root, '.kit.local.json', JSON.stringify({ memory: { dir } }));
    assert.deepEqual(memoryStats(root), ZERO, `memory.dir ${JSON.stringify(dir)}`);
  }
  const broken = mkRoot(t);
  put(broken, '.kit.local.json', '{ this is not json');
  assert.doesNotThrow(() => memoryStats(broken), 'a broken settings file');
});

test('AC-74.177 memoryStats: unreadable or odd entries give zeros for that part, never an exception', async (t) => {
  const { memoryStats } = await api('memoryStats');
  // the folders are files
  const a = mkRoot(t);
  put(a, '.claude/state/memory/notes', 'i am a file');
  put(a, '.claude/state/memory/people', 'i am a file');
  put(a, '.claude/state/memory/receipts', 'i am a file');
  put(a, 'docs/memory', 'i am a file');
  assert.deepEqual(memoryStats(a), ZERO);
  // a folder that looks like a receipt file, next to a real one
  const b = mkRoot(t);
  fs.mkdirSync(path.join(memDir(b), 'receipts', '2026-09-09.jsonl'), { recursive: true });
  put(b, '.claude/state/memory/receipts/2026-04-04.jsonl', `${receiptLine(1)}\n${receiptLine(2)}\n`);
  let s;
  assert.doesNotThrow(() => { s = memoryStats(b); });
  assert.equal(s.receipts, 2);
  // a root that does not exist
  assert.deepEqual(memoryStats(path.join(a, 'no', 'such', 'root')), ZERO);
});

// ---------- dashboard ----------

function dashboard(root) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'dashboard.mjs'), root, '--quiet'], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  return fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
}
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// The KPIs of the top row (between the first non-mini kpis block and the tab bar): [{ label, value, sub }]
function topKpis(html) {
  const start = html.indexOf('<div class="kpis">');
  const end = html.indexOf('<nav class="tabs"');
  assert.ok(start >= 0 && end > start, 'the top KPI row is on the page');
  return [...html.slice(start, end).matchAll(/<div class="kpi"><div class="kpi-l">([\s\S]*?)<\/div><div class="kpi-v">([\s\S]*?)<\/div>[\s\S]*?<div class="kpi-s">([\s\S]*?)<\/div><\/div>/g)]
    .map((m) => ({ label: decode(m[1]).trim(), value: decode(m[2]).replace(/<[^>]*>/g, '').trim(), sub: decode(m[3]).replace(/<[^>]*>/g, '').trim() }));
}

async function seedFull(root) {
  const m = await api('addNote', 'addPerson');
  m.addNote(root, { text: 'Note one body.', meta: { title: 'note one' } });
  m.addNote(root, { text: 'Note two body.', meta: { title: 'note two' } });
  m.addNote(root, { text: 'Shared body.', meta: { title: 'shared one', visibility: 'project' } });
  m.addPerson(root, { name: 'Ali Veli' });
  m.addPerson(root, { name: 'Ayse Fatma' });
  m.addPerson(root, { name: 'Can Yildiz' });
  put(root, '.claude/state/memory/receipts/2026-03-05.jsonl', `${receiptLine(1)}\n${receiptLine(2)}\n`);
  put(root, '.claude/state/memory/receipts/2026-11-01.jsonl', `${receiptLine(3)}\n${receiptLine(4)}\n`);
}

test('AC-74.178 dashboard: the top KPI row shows a Memory KPI with notes + shared as value and people, receipts and last in the sub line', async (t) => {
  const root = mkRoot(t, { lang: 'en' });
  await seedFull(root);
  const kpi = topKpis(dashboard(root)).filter((k) => k.label === 'Memory');
  assert.equal(kpi.length, 1, 'exactly one Memory KPI in the top row');
  assert.equal(kpi[0].value, '3', 'notes (2) + shared (1)');
  assert.equal(kpi[0].sub, '3 people · 4 receipts · last 2026-11-01');
});

test('AC-74.179 dashboard: only people in memory still shows the KPI (value 0, people filled)', async (t) => {
  const root = mkRoot(t, { lang: 'en' });
  const { addPerson } = await api('addPerson');
  addPerson(root, { name: 'Sole Person' });
  const kpi = topKpis(dashboard(root)).filter((k) => k.label === 'Memory');
  assert.equal(kpi.length, 1);
  assert.equal(kpi[0].value, '0');
  assert.match(kpi[0].sub, /^1 people · 0 receipts · last /);
});

test('AC-74.180 dashboard: with no memory data at all there is no Memory KPI anywhere on the page', (t) => {
  const root = mkRoot(t, { lang: 'en' });
  const html = dashboard(root);
  assert.deepEqual(topKpis(html).filter((k) => /memory/i.test(k.label)), []);
  assert.doesNotMatch(html, /<div class="kpi-l">Memory<\/div>/);
  assert.doesNotMatch(html, / people · \d+ receipts · last /);
});

test('AC-74.181 dashboard ATTACK: note text, note title, person name and alias, receipt summary never appear on the page', async (t) => {
  const root = mkRoot(t, { lang: 'en' });
  const m = await api('addNote', 'addPerson', 'addReceipt');
  m.addNote(root, { text: 'NOTETEXTLEAK-7731 the body of a personal note.', meta: { title: 'NOTETITLELEAK-7731' } });
  m.addNote(root, { text: 'SHAREDTEXTLEAK-7731 the body of a shared note.', meta: { title: 'SHAREDTITLELEAK-7731', visibility: 'project' } });
  m.addPerson(root, { name: 'Zxqv PERSONLEAK-7731', aliases: ['ALIASLEAK-7731'], facts: ['rol: FACTLEAK-7731'], text: 'PERSONTEXTLEAK-7731' });
  m.addReceipt(root, { session: 'SESSIONLEAK-7731', summary: 'RECEIPTLEAK-7731 changed the billing page', refs: ['src/REFLEAK-7731.ts'] });
  const html = dashboard(root);
  assert.ok(topKpis(html).some((k) => k.label === 'Memory'), 'the data is there: the KPI shows, so the leak check is meaningful');
  const low = decode(html).toLowerCase();
  for (const marker of ['NOTETEXTLEAK', 'NOTETITLELEAK', 'SHAREDTEXTLEAK', 'SHAREDTITLELEAK', 'PERSONLEAK', 'ALIASLEAK', 'FACTLEAK', 'PERSONTEXTLEAK', 'RECEIPTLEAK', 'SESSIONLEAK', 'REFLEAK', '7731']) {
    assert.equal(low.includes(marker.toLowerCase()), false, `${marker} must not be on the dashboard`);
  }
});

test('AC-74.182 dashboard (tr): the Turkish page shows Hafıza with the Turkish sub line and no English label', async (t) => {
  const root = mkRoot(t, { lang: 'tr' });
  await seedFull(root);
  const kpis = topKpis(dashboard(root));
  const kpi = kpis.filter((k) => k.label === 'Hafıza');
  assert.equal(kpi.length, 1);
  assert.equal(kpi[0].value, '3');
  assert.equal(kpi[0].sub, '3 kişi · 4 kayıt · son 2026-11-01');
  assert.equal(kpis.some((k) => k.label === 'Memory'), false);
});

// ---------- message keys ----------

test('AC-74.183 messages: dashboard.kpiMemory and dashboard.memorySub exist in MESSAGES (en) and in tr.json', async () => {
  const { MESSAGES } = await import(pathToFileURL(path.join(HOOKS, 'messages.mjs')).href);
  const tr = JSON.parse(fs.readFileSync(TR_JSON, 'utf8'));
  assert.equal(MESSAGES['dashboard.kpiMemory']?.en, 'Memory');
  assert.equal(MESSAGES['dashboard.memorySub']?.en, '{people} people · {receipts} receipts · last {last}');
  assert.equal(tr['dashboard.kpiMemory'], 'Hafıza');
  assert.equal(tr['dashboard.memorySub'], '{people} kişi · {receipts} kayıt · son {last}');
});
