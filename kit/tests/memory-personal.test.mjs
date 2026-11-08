// Run: node --test kit/tests/memory-personal.test.mjs
// Project memory, personal layer (3.74.0, AC-74.110 and up): core.md / soul.md / journal.md, person cards, forget, export, compact,
// and the kit-remove / kit-update promise that this folder is the user's data.
// The core of the module (stem, search basics, addNote, fence, hooks, stagedLeaks, paths) is tested in memory.test.mjs, not here.
// Spec: personal folder is .claude/state/memory/ (git-ignored); every write refuses unless git ignores it and does not track it.
// Assumptions the spec leaves open (see the test bodies): addPerson returns { status: 'written' } like addNote and either throws or
// returns another status when the card exists; forget(nameOrId) matches the title/name; compact() decides the limit itself, so
// the journal used here is far over any sane limit (~190 KB).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODULE_URL = pathToFileURL(path.join(REPO, '.claude', 'hooks', 'memory.mjs')).href;
const KIT_MJS = path.join(REPO, 'kit', 'kit.mjs');

// Dynamic import so a missing module fails each test on its own, not the whole file at load time.
async function api(...names) {
  const m = await import(MODULE_URL);
  for (const n of names) assert.equal(typeof m[n], 'function', `memory.mjs exports ${n}`);
  return m;
}

// ---------- helpers ----------

const gitIn = (cwd, ...a) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8' });

// outer/ holds the project in outer/proj, so anything that escapes the project shows up as a file in outer/ outside proj/.
function mkRoot(t, { git = true, ignore = true } = {}) {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-personal-'));
  t.after(() => fs.rmSync(outer, { recursive: true, force: true }));
  const root = path.join(outer, 'proj');
  fs.mkdirSync(root);
  if (git) assert.equal(gitIn(root, 'init', '-q').status, 0);
  if (ignore) fs.writeFileSync(path.join(root, '.gitignore'), '.claude/state/\n');
  return { outer, root };
}

const memDir = (root) => path.join(root, '.claude', 'state', 'memory');
const posix = (p) => p.split(path.sep).join('/');
const read = (p) => fs.readFileSync(p, 'utf8');

function listAll(dir) {
  const out = [];
  (function walk(d, rel) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.name === '.git' && !rel) continue;
      if (e.isDirectory()) walk(path.join(d, e.name), r); else out.push(r);
    }
  })(dir, '');
  return out.sort();
}
const filesIn = (dir) => listAll(dir);
const snapshot = (dir) => Object.fromEntries(listAll(dir).map((r) => [r, fs.readFileSync(path.join(dir, r)).toString('base64')]));
const peopleFiles = (root) => filesIn(path.join(memDir(root), 'people'));

// Everything under the memory folder as one string (lower-cased), to prove a name is gone.
const memoryText = (root) => listAll(memDir(root)).map((r) => read(path.join(memDir(root), r))).join('\n').toLowerCase();

const secret = () => 'sk_' + 'live_' + 'c'.repeat(24); // split so this file does not trip the secret scan
const jwt = () => ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'abcdefghijklmnopqrstuvwxyz012345'].join('.');
const connString = () => 'postgres://app:' + 'hunter2xyz' + '@db.example.com:5432/prod';

const ZEYNEP = { name: 'Zeynep Kara', aliases: ['Ayşe hoca'], facts: ['rol: danışman', 'ilişki: komşu'], text: 'ZK-MARK Mahalle derneğinde çalışır.' };

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;
const SAFE_NAME = /^[a-z0-9-]{1,60}\.md$/;

// ---------- initPersonal ----------

test('AC-74.110 initPersonal creates core.md, soul.md and journal.md under .claude/state/memory when they are missing', async (t) => {
  const { root } = mkRoot(t);
  const m = await api('initPersonal');
  const res = await m.initPersonal(root);
  assert.equal(res.created.length, 3);
  for (const n of ['core.md', 'soul.md', 'journal.md']) {
    assert.ok(res.created.some((c) => new RegExp(`(^|[\\\\/])${n.replace('.', '\\.')}$`).test(String(c))), `created lists ${n}`);
    assert.ok(fs.statSync(path.join(memDir(root), n)).isFile(), `${n} exists`);
  }
});

test('AC-74.111 initPersonal: a second call creates nothing and changes nothing', async (t) => {
  const { root } = mkRoot(t);
  const m = await api('initPersonal');
  await m.initPersonal(root);
  const before = snapshot(memDir(root));
  const res = await m.initPersonal(root);
  assert.deepEqual(res.created, []);
  assert.deepEqual(snapshot(memDir(root)), before);
});

test('AC-74.112 initPersonal: an existing core.md with user text stays byte-identical, only the missing files are created', async (t) => {
  const { root } = mkRoot(t);
  const m = await api('initPersonal');
  fs.mkdirSync(memDir(root), { recursive: true });
  const mine = Buffer.from('Çekirdek notum: İstanbul, ışık, ÇEKİRDEK-9\r\nikinci satır\n', 'utf8');
  fs.writeFileSync(path.join(memDir(root), 'core.md'), mine);
  const res = await m.initPersonal(root);
  assert.equal(res.created.length, 2);
  assert.ok(!res.created.some((c) => /core\.md$/.test(String(c))), 'core.md is not reported as created');
  assert.ok(fs.readFileSync(path.join(memDir(root), 'core.md')).equals(mine), 'core.md is byte-identical');
  assert.ok(fs.existsSync(path.join(memDir(root), 'soul.md')) && fs.existsSync(path.join(memDir(root), 'journal.md')));
});

test('AC-74.113 ATTACK: initPersonal refuses (throws, writes nothing) when .claude/state/ is not git-ignored', async (t) => {
  const { root } = mkRoot(t, { ignore: false });
  const m = await api('initPersonal');
  await assert.rejects(async () => m.initPersonal(root));
  assert.deepEqual(filesIn(memDir(root)), [], 'nothing was written');
});

test('AC-74.114 ATTACK: initPersonal refuses when the folder is ignored but a file in it is already tracked by git', async (t) => {
  const { root } = mkRoot(t);
  const m = await api('initPersonal');
  fs.mkdirSync(memDir(root), { recursive: true });
  fs.writeFileSync(path.join(memDir(root), 'seed.md'), 'x\n');
  assert.equal(gitIn(root, 'add', '-f', '.claude/state/memory/seed.md').status, 0);
  await assert.rejects(async () => m.initPersonal(root));
  assert.deepEqual(filesIn(memDir(root)), ['seed.md']);
});

test('AC-74.115 ATTACK: initPersonal fails closed without git and without a .gitignore line; with the line it works', async (t) => {
  const bare = mkRoot(t, { git: false, ignore: false });
  const m = await api('initPersonal');
  await assert.rejects(async () => m.initPersonal(bare.root));
  assert.deepEqual(filesIn(memDir(bare.root)), []);
  const listed = mkRoot(t, { git: false, ignore: true });
  const res = await m.initPersonal(listed.root);
  assert.equal(res.created.length, 3);
});

// ---------- addPerson ----------

test('AC-74.116 addPerson writes people/<slug>.md with format: 1, title, aliases and the four sections', async (t) => {
  const { root } = mkRoot(t);
  const m = await api('addPerson');
  const res = await m.addPerson(root, ZEYNEP);
  assert.equal(res.status, 'written');
  const files = peopleFiles(root);
  assert.equal(files.length, 1);
  assert.match(files[0], SAFE_NAME);
  const text = read(path.join(memDir(root), 'people', files[0]));
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(fm, 'frontmatter present');
  assert.match(fm[1], /^format: 1\s*$/m);
  assert.match(fm[1], /^title:\s*"?Zeynep Kara"?\s*$/m);
  assert.match(fm[1], /^aliases:[\s\S]*Ayşe hoca/m);
  for (const h of ['Beyan', 'Çıkarım', 'Temaslar', 'Kaynaklar']) assert.match(text, new RegExp(`^#{1,6}\\s*${h}\\s*$`, 'm'), `section ${h}`);
  const beyan = text.split(/^#{1,6}\s*Beyan\s*$/m)[1].split(/^#{1,6}\s/m)[0];
  assert.match(beyan, /rol: danışman/);
  assert.match(beyan, /ilişki: komşu/);
  assert.match(text, /ZK-MARK Mahalle derneğinde çalışır\./);
});

test('AC-74.117 addPerson enforces 2 KB (bytes, not characters); a card that fits stays within 2048 bytes; nothing is written on refusal', async (t) => {
  const ok = mkRoot(t);
  const m = await api('addPerson');
  await m.addPerson(ok.root, { name: 'Küçük Kart', aliases: [], facts: ['rol: komşu'], text: 'komşu '.repeat(150) });
  const f = peopleFiles(ok.root);
  assert.equal(f.length, 1);
  assert.ok(fs.statSync(path.join(memDir(ok.root), 'people', f[0])).size <= 2048);

  for (const [label, text] of [['ascii', 'komşu '.repeat(500)], ['multibyte, 1100 chars = 2200 bytes', 'ş'.repeat(1100)]]) {
    const big = mkRoot(t);
    await assert.rejects(async () => m.addPerson(big.root, { name: 'Büyük Kart', aliases: [], facts: [], text }), Error, label);
    assert.deepEqual(peopleFiles(big.root), [], `${label}: nothing written`);
  }
  const manyFacts = mkRoot(t);
  await assert.rejects(async () => m.addPerson(manyFacts.root, { name: 'Çok Beyan', aliases: [], facts: Array.from({ length: 200 }, (_, i) => `beyan numarası ${i} komşu`), text: 'x' }));
  assert.deepEqual(peopleFiles(manyFacts.root), []);
});

test('AC-74.118 addPerson never overwrites an existing card', async (t) => {
  const { root } = mkRoot(t);
  const m = await api('addPerson');
  await m.addPerson(root, ZEYNEP);
  const file = path.join(memDir(root), 'people', peopleFiles(root)[0]);
  const before = fs.readFileSync(file);
  let second;
  try { second = await m.addPerson(root, { ...ZEYNEP, facts: ['rol: değişti'], text: 'YENI-METIN ezmeye çalışıyor' }); } catch { second = null; }
  if (second) assert.notEqual(second.status, 'written');
  assert.ok(fs.readFileSync(file).equals(before), 'bytes unchanged');
  assert.deepEqual(peopleFiles(root), [path.basename(file)]);
});

test('AC-74.119 ATTACK: two parallel addPerson calls for the same name (in one process and in two processes) create exactly one card', async (t) => {
  const m = await api('addPerson');
  const A = { ...ZEYNEP, text: 'PARALEL-A ' + 'bir '.repeat(40) };
  const B = { ...ZEYNEP, text: 'PARALEL-B ' + 'iki '.repeat(40) };

  const inProc = mkRoot(t);
  const settled = await Promise.allSettled([A, B].map(async (p) => m.addPerson(inProc.root, p)));
  assert.equal(settled.filter((r) => r.status === 'fulfilled' && r.value?.status === 'written').length, 1, 'one winner (in process)');
  assert.equal(peopleFiles(inProc.root).length, 1);
  const winner = read(path.join(memDir(inProc.root), 'people', peopleFiles(inProc.root)[0]));
  assert.equal(Number(winner.includes('PARALEL-A')) + Number(winner.includes('PARALEL-B')), 1, 'the card is one writer\'s, not a mix');

  const procs = mkRoot(t);
  const code = 'const [, url, root, payload] = process.argv; try { const m = await import(url); const r = await m.addPerson(root, JSON.parse(payload)); console.log(JSON.stringify({ ok: true, r })); } catch (e) { console.log(JSON.stringify({ ok: false, msg: String(e && e.message) })); }';
  const run = (p) => new Promise((resolve) => {
    const c = spawn(process.execPath, ['--input-type=module', '-e', code, MODULE_URL, procs.root, JSON.stringify(p)]);
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.on('close', () => resolve(out.trim().split('\n').pop()));
  });
  const results = (await Promise.all([run(A), run(B)])).map((l) => JSON.parse(l));
  assert.equal(results.filter((r) => r.ok && r.r?.status === 'written').length, 1, `one winner (two processes): ${JSON.stringify(results)}`);
  assert.equal(peopleFiles(procs.root).length, 1, 'no temp or lock leftovers in people/');
  const w2 = read(path.join(memDir(procs.root), 'people', peopleFiles(procs.root)[0]));
  assert.equal(Number(w2.includes('PARALEL-A')) + Number(w2.includes('PARALEL-B')), 1);
});

// ---------- slugs ----------

const SLUG_ATTACKS = [
  // [label, name, must succeed with one safe file]. The others may be refused with an Error, but then nothing may be written.
  ['backslash traversal', '..\\..\\x', true],
  ['slash traversal', '../x', true],
  ['CON', 'CON', true],
  ['nul', 'nul', true],
  ['COM1', 'COM1', true],
  ['200 characters', 'Ab'.repeat(100), true],
  ['alternate data stream a:b', 'a:b', false],
  ['trailing dot', 'ayse.', false],
  ['trailing space', 'ayse ', false],
  ['absolute posix path', '/etc/passwd', false],
  ['drive path', 'C:\\Windows\\evil', false],
  ['NUL byte', 'a\0b', false],
  ['empty', '', false],
  ['blank', '   ', false],
];
for (const [label, name, mustWork] of SLUG_ATTACKS) {
  test(`AC-74.120 ATTACK: person name ${label} gives one safe file inside people/ or a refusal, never a file elsewhere`, async (t) => {
    const { outer, root } = mkRoot(t);
    const m = await api('addPerson');
    let threw = false;
    try { await m.addPerson(root, { name, aliases: [], facts: ['rol: deneme'], text: 'slug denemesi' }); } catch { threw = true; }
    if (mustWork) assert.equal(threw, false, 'a hostile name is made safe, not refused');
    const outside = listAll(outer).filter((f) => !f.startsWith('proj/.claude/state/memory/') && !f.startsWith('proj/.git/') && f !== 'proj/.gitignore');
    assert.deepEqual(outside, [], 'nothing outside the memory folder');
    const people = peopleFiles(root);
    if (mustWork) assert.equal(people.length, 1); else assert.ok(people.length <= 1);
    if (threw) assert.equal(people.length, 0, 'a refusal writes nothing');
    for (const f of people) {
      assert.match(f, SAFE_NAME);
      assert.ok(!RESERVED.test(f.split('.')[0]), `${f} is not a Windows device name`);
    }
    const stray = listAll(memDir(root)).filter((f) => !f.startsWith('people/') && !/^(index|delivered)\.json$/.test(f) && !/lock/i.test(f));
    assert.deepEqual(stray, []);
  });
}

test('AC-74.121 ATTACK: İrem, irem and IREM are the same person: one file irem.md, the first card is not overwritten', async (t) => {
  const m = await api('addPerson');
  for (const order of [['İrem', 'irem', 'IREM'], ['IREM', 'irem', 'İrem']]) {
    const { root } = mkRoot(t);
    for (const [i, name] of order.entries()) {
      try { await m.addPerson(root, { name, aliases: [], facts: ['rol: arkadaş'], text: `GIRIS-${i}` }); } catch { /* a refusal is fine, an overwrite is not */ }
    }
    assert.deepEqual(peopleFiles(root), ['irem.md'], order.join(' / '));
    const text = read(path.join(memDir(root), 'people', 'irem.md'));
    assert.match(text, /GIRIS-0/, 'the first card won');
    assert.doesNotMatch(text, /GIRIS-[12]/);
  }
});

test('AC-74.122 ATTACK: Çağrı in NFC and in NFD is one file', async (t) => {
  const m = await api('addPerson');
  const nfc = 'Çağrı Öz'.normalize('NFC');
  const nfd = nfc.normalize('NFD');
  assert.notEqual(nfc, nfd, 'precondition: the two spellings differ in code points');
  for (const order of [[nfc, nfd], [nfd, nfc]]) {
    const { root } = mkRoot(t);
    for (const [i, name] of order.entries()) {
      try { await m.addPerson(root, { name, aliases: [], facts: ['rol: iş arkadaşı'], text: `CAGRI-${i}` }); } catch { /* refusal fine */ }
    }
    const people = peopleFiles(root);
    assert.equal(people.length, 1, `one file, got ${people.join(', ')}`);
    assert.match(people[0], SAFE_NAME);
    assert.match(read(path.join(memDir(root), 'people', people[0])), /CAGRI-0/);
  }
});

// ---------- search over person cards ----------

const hit = (res, base) => res.records.some((r) => posix(String(r.source)).endsWith(`people/${base}`));

test('AC-74.123 search finds a person card by its title, in any case of İ/ı', async (t) => {
  const { root } = mkRoot(t);
  const m = await api('addPerson', 'search');
  await m.addPerson(root, ZEYNEP);
  await m.addPerson(root, { name: 'İrem Yıldız', aliases: [], facts: ['rol: eş dost'], text: 'Voleybol oynar.' });
  const irem = peopleFiles(root).find((f) => f.startsWith('irem'));
  assert.ok(irem, 'precondition: irem card exists');
  const z = peopleFiles(root).find((f) => f !== irem);
  assert.ok(hit(await m.search(root, 'Zeynep Kara'), z), 'title query');
  for (const q of ['irem', 'IREM', 'İREM', 'İrem Yıldız']) assert.ok(hit(await m.search(root, q), irem), `query ${q}`);
  assert.deepEqual((await m.search(root, 'ejderha')).records, [], 'unrelated query returns nothing');
});

test('AC-74.124 search finds a person card by an alias, with a Turkish suffix on the query ("ayşe hocam")', async (t) => {
  const { root } = mkRoot(t);
  const m = await api('addPerson', 'search');
  await m.addPerson(root, ZEYNEP); // the alias words appear nowhere else in the card
  const card = peopleFiles(root)[0];
  const res = await m.search(root, 'ayşe hocam');
  assert.ok(hit(res, card), `alias match, got ${JSON.stringify(res.records.map((r) => r.source))}`);
  assert.ok(res.records.every((r) => typeof r.text === 'string' && r.text.length > 0));
});

test('AC-74.125 ATTACK: a person card with visibility: private never appears in search, promptContext or sessionContext', async (t) => {
  const m = await api('addPerson', 'search', 'promptContext', 'sessionContext');
  const card = { ...ZEYNEP, text: 'PRIVATE-MARK-ZK Mahalle derneğinde çalışır.' };

  // control: the same card, not private, is found, so the negative checks below are not vacuous
  const control = mkRoot(t);
  await m.addPerson(control.root, card);
  assert.ok(hit(await m.search(control.root, 'ayşe hocam'), peopleFiles(control.root)[0]), 'control: found by alias');
  assert.match(await m.promptContext(control.root, 'Zeynep Kara ile görüşme var', { session: 's-control' }), /Zeynep/, 'control: promptContext brings the card');

  const { root } = mkRoot(t);
  await m.addPerson(root, card);
  const file = path.join(memDir(root), 'people', peopleFiles(root)[0]);
  fs.writeFileSync(file, read(file).replace(/^---\r?\n/, '---\nvisibility: private\n')); // the user hand-edits the card
  for (const q of ['Zeynep Kara', 'ayşe hocam', 'zeynep', 'PRIVATE-MARK-ZK', 'danışman']) {
    assert.deepEqual((await m.search(root, q)).records, [], `search "${q}"`);
  }
  for (const out of [
    await m.promptContext(root, 'Zeynep Kara ve ayşe hocam hakkında ne biliyoruz', { session: 's1' }),
    await m.sessionContext(root, { session: 's2' }),
  ]) {
    assert.doesNotMatch(out, /Zeynep|PRIVATE-MARK-ZK|Ayşe hoca/);
  }
});

// ---------- secrets and personal identifiers (G3, G4) ----------

test('AC-74.126 ATTACK: addPerson rejects a secret in facts, text, name or aliases and writes nothing', async (t) => {
  const m = await api('addPerson');
  const cases = {
    'api key in facts': { facts: [`anahtar: ${secret()}`], text: 'x' },
    'api key in text': { facts: ['rol: x'], text: `not ${secret()} sonu` },
    'api key in alias': { aliases: [secret()], facts: ['rol: x'], text: 'x' },
    'connection string': { facts: ['rol: x'], text: `veritabanı ${connString()}` },
    'jwt': { facts: [`oturum: ${jwt()}`], text: 'x' },
  };
  for (const [label, extra] of Object.entries(cases)) {
    const { root } = mkRoot(t);
    await assert.rejects(async () => m.addPerson(root, { name: 'Sırlı Kişi', aliases: [], facts: [], text: '', ...extra }), Error, label);
    assert.deepEqual(peopleFiles(root), [], `${label}: nothing written`);
    assert.doesNotMatch(memoryText(root), /sk_live_|hunter2xyz|eyjhbgcio/, `${label}: the secret is nowhere on disk`);
  }
});

test('AC-74.127 ATTACK: addPerson rejects an 11-digit national id (TCKN) and an IBAN in facts or text', async (t) => {
  const m = await api('addPerson');
  const cases = {
    'TCKN in facts': { facts: ['tckn: 10000000146'], text: 'x' },
    'TCKN in text': { facts: ['rol: x'], text: 'kimlik numarası 10000000146 yazılı' },
    'IBAN compact in facts': { facts: ['iban: TR330006100519786457841326'], text: 'x' },
    'IBAN spaced in facts': { facts: ['iban: TR33 0006 1005 1978 6457 8413 26'], text: 'x' },
    'IBAN in text': { facts: ['rol: x'], text: 'hesap TR330006100519786457841326 üzerinden' },
  };
  for (const [label, extra] of Object.entries(cases)) {
    const { root } = mkRoot(t);
    await assert.rejects(async () => m.addPerson(root, { name: 'Kimlikli Kişi', aliases: [], facts: [], text: '', ...extra }), Error, label);
    assert.deepEqual(peopleFiles(root), [], `${label}: nothing written`);
  }
});

test('AC-74.128 addPerson accepts contact details the user wrote (an e-mail address) and short numbers that are not ids', async (t) => {
  const { root } = mkRoot(t);
  const m = await api('addPerson');
  const res = await m.addPerson(root, { name: 'İletişim Kişisi', aliases: [], facts: ['e-posta: zeynep@example.com', 'doğum yılı: 1984', 'oda: 4021'], text: 'Toplantıdan sonra aranacak.' });
  assert.equal(res.status, 'written');
  assert.match(read(path.join(memDir(root), 'people', peopleFiles(root)[0])), /zeynep@example\.com/);
});

test('AC-74.129 ATTACK: addPerson writes nothing when .claude/state/ is not git-ignored', async (t) => {
  const { root } = mkRoot(t, { ignore: false });
  const m = await api('addPerson');
  await assert.rejects(async () => m.addPerson(root, ZEYNEP));
  assert.deepEqual(filesIn(memDir(root)), []);
});

// ---------- forget ----------

async function seedForget(t) {
  const { outer, root } = mkRoot(t);
  const m = await api('addPerson', 'addNote', 'addReceipt', 'search', 'promptContext', 'forget');
  await m.addPerson(root, ZEYNEP);
  await m.addPerson(root, { name: 'Can Demir', aliases: ['Can abi'], facts: ['rol: eski iş arkadaşı'], text: 'CAN-SURVIVES Ankara.' });
  const zeynepFile = peopleFiles(root).find((f) => /zeynep|ayse|zk/.test(f)) ?? peopleFiles(root).find((f) => !/^can/.test(f));
  const note = await m.addNote(root, { text: 'Toplantı notu SURVIVOR-MARK', meta: { title: 'Toplantı kaydı' } });
  await m.addReceipt(root, { session: 's1', summary: 'toplantı notu eklendi', refs: [`people/${zeynepFile}`] });
  await m.addReceipt(root, { session: 's1', summary: 'Zeynep Kara ile görüştük', refs: ['docs/notlar.md'] });
  await m.addReceipt(root, { session: 's1', summary: 'Başka iş SURVIVE-RECEIPT', refs: ['docs/baska.md'] });
  fs.mkdirSync(path.join(memDir(root), 'archive'), { recursive: true });
  fs.writeFileSync(path.join(memDir(root), 'archive', '2026-01.md'), read(path.join(memDir(root), 'people', zeynepFile)));
  await m.search(root, 'Zeynep Kara'); // builds the index
  await m.promptContext(root, 'Zeynep Kara ile görüşme var', { session: 's1' }); // writes the delivered state
  assert.match(memoryText(root), /zeynep/, 'precondition: the name is on disk');
  return { outer, root, m, zeynepFile, note };
}

test('AC-74.130 forget(name) removes the card, its index entries, receipt lines and archive copies; search and a text scan find nothing', async (t) => {
  const { root, m, zeynepFile } = await seedForget(t);
  const res = await m.forget(root, 'Zeynep Kara');
  assert.ok(res.removed.length >= 1);
  assert.ok(res.removed.some((p) => String(p).includes(zeynepFile)), `removed lists the card, got ${JSON.stringify(res.removed)}`);
  assert.ok(!fs.existsSync(path.join(memDir(root), 'people', zeynepFile)));
  assert.deepEqual((await m.search(root, 'Zeynep Kara')).records, []);
  assert.deepEqual((await m.search(root, 'ayşe hocam')).records, []);
  assert.doesNotMatch(memoryText(root), /zeynep|ayşe hoca|zk-mark/, 'no occurrence anywhere under .claude/state/memory');
});

test('AC-74.131 forget keeps what is not about the person: other cards, other notes, unrelated receipt lines', async (t) => {
  const { root, m } = await seedForget(t);
  await m.forget(root, 'Zeynep Kara');
  const text = memoryText(root);
  assert.match(text, /can-survives/);
  assert.match(text, /survivor-mark/);
  assert.match(text, /survive-receipt/);
  assert.equal(peopleFiles(root).length, 1);
  assert.ok((await m.search(root, 'Can Demir')).records.length >= 1, 'the other person is still found');
});

test('AC-74.132 forget(title) removes a note and its text from the memory folder', async (t) => {
  const { root } = mkRoot(t);
  const m = await api('addNote', 'search', 'forget');
  const r = await m.addNote(root, { text: 'KUZEY-MARK proje ayrıntısı', meta: { title: 'Gizli proje Kuzey' } });
  await m.addNote(root, { text: 'Kalan not KALAN-MARK', meta: { title: 'Başka not' } });
  assert.ok(fs.existsSync(path.resolve(root, r.path)), 'precondition: the note file exists');
  const res = await m.forget(root, 'Gizli proje Kuzey');
  assert.ok(res.removed.length >= 1);
  assert.ok(!fs.existsSync(path.resolve(root, r.path)));
  assert.deepEqual((await m.search(root, 'Kuzey')).records, []);
  assert.doesNotMatch(memoryText(root), /kuzey/);
  assert.match(memoryText(root), /kalan-mark/);
});

test('AC-74.133 forget with an unknown name returns { removed: [] }, does not throw and changes nothing', async (t) => {
  const { root, m } = await seedForget(t);
  const before = snapshot(memDir(root));
  const res = await m.forget(root, 'Hiç Kimse');
  assert.deepEqual(res, { removed: [] });
  assert.deepEqual(snapshot(memDir(root)), before);
});

test('AC-74.134 ATTACK: forget with empty, wildcard, dot or traversal names deletes nothing it should not (inside or outside the project)', async (t) => {
  const { outer, root, m } = await seedForget(t);
  fs.writeFileSync(path.join(outer, 'outside.md'), 'canary\n');
  fs.writeFileSync(path.join(outer, 'outside'), 'canary\n');
  const before = snapshot(outer);
  for (const name of ['', ' ', '.', '..', '*', '**', '?', '../outside', '..\\outside', '../../outside.md', 'people', 'memory', '/', 'C:\\', 'a\0b', '.claude']) {
    try { await m.forget(root, name); } catch { /* a refusal is fine */ }
    assert.deepEqual(snapshot(outer), before, `forget(${JSON.stringify(name)}) left every file as it was`);
  }
});

// ---------- exportAll ----------

test('AC-74.135 exportAll returns personal and project notes with paths and text, private ones included, no index or delivered state', async (t) => {
  const { root } = mkRoot(t);
  const m = await api('initPersonal', 'addPerson', 'addNote', 'exportAll', 'search', 'promptContext');
  await m.initPersonal(root);
  fs.writeFileSync(path.join(memDir(root), 'core.md'), 'Çekirdek ÇEKIRDEK-EXPORT ışık\n');
  const project = await m.addNote(root, { text: 'Proje kararı PROJE-EXPORT ışık', meta: { title: 'Proje kararı', visibility: 'project' } });
  const priv = await m.addNote(root, { text: 'Gizli not GIZLI-EXPORT', meta: { title: 'Gizli not', visibility: 'private' } });
  const mine = await m.addNote(root, { text: 'Kişisel not KISISEL-EXPORT', meta: { title: 'Kişisel not' } });
  await m.addPerson(root, ZEYNEP);
  await m.search(root, 'kişisel');
  await m.promptContext(root, 'Zeynep Kara', { session: 's-exp' });
  assert.ok(fs.existsSync(path.join(memDir(root), 'index.json')) || fs.existsSync(path.join(memDir(root), 'delivered.json')), 'precondition: some derived state exists');

  const flat = JSON.stringify(await m.exportAll(root));
  for (const mark of ['PROJE-EXPORT', 'GIZLI-EXPORT', 'KISISEL-EXPORT', 'ZK-MARK', 'ÇEKIRDEK-EXPORT']) assert.ok(flat.includes(mark), `${mark} is in the export`);
  for (const r of [project, priv, mine]) assert.ok(flat.includes(path.basename(r.path)), `${path.basename(r.path)} path is in the export`);
  assert.ok(flat.includes(peopleFiles(root)[0]), 'the card path is in the export');
  assert.doesNotMatch(flat, /index\.json|delivered\.json/);
});

// ---------- compact ----------

const pad2 = (n) => String(n).padStart(2, '0');
function journalEntries(n = 120) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 1 + i * 2));
    const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    return { date, mark: `ENTRY-MARK-${String(i).padStart(3, '0')}`, text: `## ${date}\nGiriş ${i} ENTRY-MARK-${String(i).padStart(3, '0')} ` + 'şğüöçı İstanbul lorem ipsum dolor sit amet '.repeat(36) + '\n' };
  });
}
async function seedJournal(t, entries, extraBlocks = []) {
  const { outer, root } = mkRoot(t);
  const m = await api('initPersonal', 'compact');
  await m.initPersonal(root);
  const blocks = entries.map((e) => e.text);
  extraBlocks.forEach((b, i) => blocks.splice(10 + i * 7, 0, b));
  const journal = '# Journal\n\n' + blocks.join('\n');
  fs.writeFileSync(path.join(memDir(root), 'journal.md'), journal);
  assert.ok(Buffer.byteLength(journal) > 150 * 1024, 'precondition: the journal is far over any limit');
  return { outer, root, m, journal };
}
const unionText = (root) => [path.join(memDir(root), 'journal.md'), ...filesIn(path.join(memDir(root), 'archive')).map((f) => path.join(memDir(root), 'archive', f))].map(read).join('\n');
const count = (hay, needle) => hay.split(needle).length - 1;

test('AC-74.136 compact moves the oldest dated entries verbatim to archive/<YYYY-MM>.md; nothing is lost, nothing is doubled, the newest stays', async (t) => {
  const entries = journalEntries();
  const { root, m, journal } = await seedJournal(t, entries);
  await m.compact(root, {});
  const after = read(path.join(memDir(root), 'journal.md'));
  assert.ok(Buffer.byteLength(after) < Buffer.byteLength(journal), 'journal.md got smaller');
  assert.match(after, /^# Journal/, 'the journal title stays');
  assert.ok(after.includes(entries.at(-1).text.trim()), 'the newest entry stays in journal.md');
  assert.ok(!after.includes(entries[0].mark), 'the oldest entry left journal.md');
  const archive = path.join(memDir(root), 'archive', '2026-01.md');
  assert.ok(fs.existsSync(archive), 'archive/2026-01.md exists');
  assert.ok(read(archive).includes(entries[0].text.trim()), 'the oldest entry is in the archive word for word');
  const all = unionText(root);
  for (const e of entries) assert.equal(count(all, e.mark), 1, `${e.mark} appears exactly once in archive + journal`);
  for (const f of filesIn(path.join(memDir(root), 'archive'))) assert.match(f, /^\d{4}-\d{2}\.md$/);
  // a second run must not copy anything twice
  await m.compact(root, {});
  const again = unionText(root);
  for (const e of entries) assert.equal(count(again, e.mark), 1, `${e.mark} still once after a second compact`);
});

test('AC-74.137 compact with dryRun writes nothing', async (t) => {
  const { root, m } = await seedJournal(t, journalEntries());
  const before = snapshot(memDir(root));
  await m.compact(root, { dryRun: true });
  assert.deepEqual(snapshot(memDir(root)), before);
  assert.deepEqual(filesIn(path.join(memDir(root), 'archive')), []);
});

test('AC-74.138 compact leaves a journal under its limit untouched and creates no archive', async (t) => {
  const { root } = mkRoot(t);
  const m = await api('initPersonal', 'compact');
  await m.initPersonal(root);
  fs.writeFileSync(path.join(memDir(root), 'journal.md'), '# Journal\n\n## 2026-01-02\nküçük giriş\n\n## 2026-11-05\nikinci giriş\n');
  const before = snapshot(memDir(root));
  await m.compact(root, {});
  assert.deepEqual(snapshot(memDir(root)), before);
});

test('AC-74.139 ATTACK: compact with odd entry headings (traversal, invalid date) loses nothing and writes nowhere but under .claude/state/memory', async (t) => {
  const weird = [
    '## ../../../../escape-2026-01-01\nMARK-TRAVERSAL gövde\n',
    '## ..\\..\\2026-01-02\nMARK-BACKSLASH gövde\n',
    '## 2026-13-45\nMARK-BADDATE gövde\n',
    '## 2026-01-01/../../evil\nMARK-SUFFIX gövde\n',
  ];
  const { outer, root, m } = await seedJournal(t, journalEntries(), weird);
  const outsideBefore = snapshot(outer);
  for (const k of Object.keys(outsideBefore)) if (k.startsWith('proj/.claude/state/memory/')) delete outsideBefore[k];
  await m.compact(root, {});
  const outsideAfter = snapshot(outer);
  for (const k of Object.keys(outsideAfter)) if (k.startsWith('proj/.claude/state/memory/')) delete outsideAfter[k];
  assert.deepEqual(outsideAfter, outsideBefore, 'no file outside the memory folder appeared or changed');
  const all = unionText(root);
  for (const mark of ['MARK-TRAVERSAL', 'MARK-BACKSLASH', 'MARK-BADDATE', 'MARK-SUFFIX']) assert.equal(count(all, mark), 1, `${mark} is kept exactly once`);
  for (const f of filesIn(path.join(memDir(root), 'archive'))) assert.match(f, /^\d{4}-\d{2}\.md$/);
});

// ---------- kit remove / update keep the user's memory ----------

function mkProject(t, name) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-kit-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const p = path.join(tmp, name);
  const node = (...a) => spawnSync(process.execPath, a, { encoding: 'utf8' });
  let r = node(KIT_MJS, 'init', '--project', p, '--tool', 'claude');
  assert.equal(r.status, 0, r.stderr);
  r = node(KIT_MJS, 'install', '--type', 'web-saas', '--project', p);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(p, '.claude', 'hooks', 'memory.mjs')), 'the kit installs the memory module');
  const dir = memDir(p);
  fs.mkdirSync(path.join(dir, 'people'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'core.md'), 'Benim çekirdek notum İ ı ş\n');
  fs.writeFileSync(path.join(dir, 'people', 'zeynep-kara.md'), '---\nformat: 1\ntitle: Zeynep Kara\n---\nkart\n');
  assert.equal(gitIn(p, 'check-ignore', '-q', '.claude/state/memory/core.md').status, 0, 'precondition: the installed .gitignore ignores the memory folder');
  assert.equal(gitIn(p, 'add', '-A').status, 0);
  r = gitIn(p, 'commit', '-qm', 'snapshot');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  return { p, node };
}

test('AC-74.140 kit remove --yes leaves .claude/state/memory untouched and prints its path', (t) => {
  const { p, node } = mkProject(t, 'rm');
  const before = snapshot(memDir(p));
  const r = node(KIT_MJS, 'remove', '--project', p, '--yes');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(snapshot(memDir(p)), before, 'every memory file is still there, byte for byte');
  assert.match(r.stdout, /\.claude[\\/]state[\\/]memory/, 'the output names the folder it kept');
});

test('AC-74.141 kit update never writes into .claude/state/memory (no file changed, none added, no .kit-new)', (t) => {
  const { p, node } = mkProject(t, 'up');
  const before = snapshot(memDir(p));
  const r = node(KIT_MJS, 'update', '--project', p);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(snapshot(memDir(p)), before);
  assert.deepEqual(listAll(memDir(p)).filter((f) => f.endsWith('.kit-new')), []);
});
// Limitation: the check that the kit source never ships a developer's own memory folder (COMMON_EXCLUDE / PERSONAL in kit.mjs) is not
// run here: that needs a populated kit clone. The commit-gate "memory-leak" check is in memory.test.mjs (stagedLeaks).

// ---------- Codex / Antigravity input with missing fields ----------

test('AC-74.142 sessionContext, promptContext and stopReminder with missing or odd fields never throw', async (t) => {
  const { root } = mkRoot(t);
  const m = await api('sessionContext', 'promptContext', 'stopReminder');
  const sessions = [undefined, null, {}, { session: undefined }, { session: null }, { session: 12 }, { budget: 'x' }, { session: '' }, 'text'];
  for (const s of sessions) assert.equal(typeof (await m.sessionContext(root, s)), 'string', `sessionContext(${JSON.stringify(s)})`);
  const prompts = [undefined, null, '', 123, {}, [], { prompt: 'x' }, '[kaydetme]', 'x'.repeat(1000)];
  for (const p of prompts) {
    for (const o of [undefined, null, {}, { session: undefined }, { session: null }]) {
      assert.equal(typeof (await m.promptContext(root, p, o)), 'string', `promptContext(${JSON.stringify(p)?.slice(0, 20)}, ${JSON.stringify(o)})`);
    }
  }
  for (const i of [undefined, null, {}, { session_id: undefined }, { stop_hook_active: 'yes' }, 'text', 5]) {
    assert.equal(await m.stopReminder(root, i), null, `stopReminder(${JSON.stringify(i)})`);
  }
});

test('AC-74.143 sessionContext and promptContext on a project root that does not exist return strings and do not create it', async (t) => {
  const { outer } = mkRoot(t);
  const gone = path.join(outer, 'does-not-exist');
  const m = await api('sessionContext', 'promptContext');
  assert.equal(typeof (await m.sessionContext(gone, { session: 's' })), 'string');
  assert.equal(typeof (await m.promptContext(gone, 'merhaba', { session: 's' })), 'string');
  assert.equal(fs.existsSync(gone), false);
});
