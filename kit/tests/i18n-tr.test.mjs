// Run: node --test "kit/tests/*.test.mjs"
// 3.49.0 step 3: the Turkish hook UI texts leave the code. messages.mjs keeps English only; Turkish lives in the shipped
// data file .claude/i18n/tr.json and works like any other language (t, missingKeys, --check, --write). The kit owns
// tr.json (init copies it, update replaces it); a user's own .claude/i18n/<lang>.json is never touched.
// Modules are imported inside each test so a missing or changed module fails every test on its own.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(REPO, '.claude', 'hooks');
const KIT_MJS = path.join(REPO, 'kit', 'kit.mjs');
const TR_FILE = path.join(REPO, '.claude', 'i18n', 'tr.json');
const TR_REL = '.claude/i18n/tr.json';
const TURKISH_LETTER = /[çğıöşüÇĞİÖŞÜ]/u;
const load = () => import('../../.claude/hooks/lang.mjs');
const messages = async () => (await import('../../.claude/hooks/messages.mjs')).MESSAGES;
const shippedRaw = () => fs.readFileSync(TR_FILE, 'utf8');
const shipped = () => JSON.parse(shippedRaw());

const dirs = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

// Temp project; object values are written as JSON, strings as they are
function project(files = {}, prefix = 'i18n-tr-') {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(p);
  for (const [f, s] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    fs.writeFileSync(path.join(p, f), typeof s === 'string' ? s : JSON.stringify(s, null, 2));
  }
  return p;
}
const kitJson = (extra = {}) => ({ version: '3.49.0', type: 'web-saas', addons: [], tool: null, files: {}, ...extra });
const trProject = (file, extra = {}) => project({ '.kit.json': kitJson({ lang: 'tr' }), ...(file === undefined ? {} : { [TR_REL]: file }), ...extra });
const withShipped = (extra = {}) => project({ '.kit.json': kitJson({ lang: 'tr' }), [TR_REL]: shippedRaw(), ...extra });
const readFile = (p, f) => fs.readFileSync(path.join(p, f), 'utf8');
const exists = (p, f) => fs.existsSync(path.join(p, f));
const placeholderSet = (s) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, n) => (n in vars ? String(vars[n]) : m));
const cli = (p, args, input) => spawnSync(process.execPath, [path.join(HOOKS, 'lang.mjs'), ...args], { input, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
async function keys() {
  const M = await messages();
  const all = Object.keys(M);
  // plain: keys whose English text has no placeholder, so a free text is a valid translation for them
  return { M, all, withVar: all.find((k) => placeholderSet(M[k].en).length > 0), plain: all.filter((k) => placeholderSet(M[k].en).length === 0) };
}

// ---------- messages.mjs: English only ----------

test('AC-49.15 messages.mjs: every entry has a non-empty English text and no tr field', async () => {
  const M = await messages();
  assert.equal(Object.keys(M).length > 100, true, 'the table still holds every UI text');
  for (const [k, v] of Object.entries(M)) {
    assert.equal(typeof v.en, 'string', `${k}.en`);
    assert.notEqual(v.en.trim(), '', `${k}.en is not empty`);
    assert.equal(Object.hasOwn(v, 'tr'), false, `${k}: no tr field`);
  }
});

test('AC-49.15 messages.mjs: the source has no Turkish letter', () => {
  const src = fs.readFileSync(path.join(HOOKS, 'messages.mjs'), 'utf8');
  const bad = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => TURKISH_LETTER.test(l));
  assert.deepEqual(bad.map(([n, l]) => `${n}: ${l.slice(0, 120)}`), []);
});

// ---------- the shipped .claude/i18n/tr.json ----------

test('AC-49.16 tr.json: shipped as a plain { key: text } object with exactly the keys of MESSAGES (no missing, no extra)', async () => {
  const M = await messages();
  const tr = shipped();
  assert.equal(Object.getPrototypeOf(tr), Object.prototype, 'a JSON object, not an array or a value');
  const want = Object.keys(M).sort();
  const have = Object.keys(tr).sort();
  assert.deepEqual(want.filter((k) => !have.includes(k)), [], 'missing in tr.json');
  assert.deepEqual(have.filter((k) => !want.includes(k)), [], 'extra in tr.json');
});

test('AC-49.16 tr.json: every value is a non-empty string with the same {placeholder} set as the English text', async () => {
  const M = await messages();
  const tr = shipped();
  for (const k of Object.keys(M)) {
    assert.equal(typeof tr[k], 'string', `${k}: a string`);
    assert.notEqual(tr[k].trim(), '', `${k}: not empty`);
    assert.deepEqual(placeholderSet(tr[k]), placeholderSet(M[k].en), `${k}: {placeholders}`);
  }
});

test('AC-49.16 tr.json: holds the Turkish texts that left messages.mjs, not an English copy', async () => {
  const M = await messages();
  const tr = shipped();
  // Moved as they were in 3.48
  assert.equal(tr['session.begin'], 'Başlamak için: /start [proje fikrin] · var olan projede: /adopt');
  assert.equal(tr['dashboard.title'], 'Kontrol paneli');
  assert.equal(tr['statusline.notSetUp'], '◆ Kit kurulmadı · başlamak için: /start [fikrin] · var olan kod: /adopt');
  assert.equal(tr['notify.waiting'], 'Claude cevabını bekliyor.');
  assert.equal(tr['guard.destructive.rewriteHistory'], 'Git geçmişi yeniden yazılıyor');
  const same = Object.keys(M).filter((k) => tr[k] === M[k].en);
  assert.equal(same.length <= Object.keys(M).length * 0.05, true, `at most 5% of the texts equal the English one (${same.length}): ${same.slice(0, 20).join(', ')}`);
});

test('AC-49.16 tr.json: the format lang.mjs --write produces (2-space JSON, trailing newline)', () => {
  const raw = shippedRaw().replace(/\r\n/g, '\n');
  assert.equal(raw, JSON.stringify(JSON.parse(raw), null, 2) + '\n');
});

// ---------- t(): tr reads .claude/i18n/tr.json ----------

test('AC-49.17 t: a tr project reads the text from its .claude/i18n/tr.json', async () => {
  const { t } = await load();
  const { all } = await keys();
  const k = all[0];
  assert.equal(t(trProject({ [k]: 'ÇEVİRİ ığüşöç' }), k), 'ÇEVİRİ ığüşöç');
  const p = withShipped();
  const tr = shipped();
  for (const key of all) assert.equal(t(p, key), tr[key], key);
});

test('AC-49.17 t: tr fills placeholders from the tr.json text', async () => {
  const { t } = await load();
  const { M, withVar } = await keys();
  assert.equal(typeof withVar, 'string', 'the table has a message with a placeholder');
  const names = placeholderSet(M[withVar].en);
  const vars = Object.fromEntries(names.map((n, i) => [n, `V${i}İı`]));
  const text = `TR ${names.map((n) => `{${n}}`).join(' / ')} son`;
  assert.equal(t(trProject({ [withVar]: text }), withVar, vars), fill(text, vars));
  assert.equal(t(trProject({ [withVar]: text }), withVar), text, 'no vars: placeholders stay');
});

test('AC-49.17 t: a tr key missing from tr.json falls back to English', async () => {
  const { t } = await load();
  const { M, all } = await keys();
  const p = trProject({ [all[0]]: 'birinci' });
  assert.equal(t(p, all[0]), 'birinci');
  for (const k of all.slice(1, 6)) assert.equal(t(p, k), M[k].en, k);
  assert.equal(t(trProject({ [all[0]]: 42 }), all[0]), M[all[0]].en, 'a non-string value: English');
  assert.equal(t(trProject({ [all[0]]: { tr: 'x' } }), all[0]), M[all[0]].en, 'an object value: English');
});

test('AC-49.17 t: tr.json missing, broken, empty or not an object gives English and never throws', async () => {
  const { t } = await load();
  const { M, all } = await keys();
  const k = all[0];
  for (const [name, file] of [['missing', undefined], ['broken', '{"broken": '], ['empty file', ''], ['array', '[]'], ['null', 'null'], ['string', '"metin"'], ['number', '5'], ['BOM + broken', '﻿{']]) {
    const p = trProject(file);
    let out;
    assert.doesNotThrow(() => { out = t(p, k); }, name);
    assert.equal(out, M[k].en, `${name}: English`);
  }
  // A folder where the file should be
  const dir = project({ '.kit.json': kitJson({ lang: 'tr' }), [`${TR_REL}/x`]: 'y' });
  assert.doesNotThrow(() => t(dir, k), 'tr.json is a folder');
  assert.equal(t(dir, k), M[k].en, 'tr.json is a folder: English');
});

test('AC-49.17 t: en still ignores .claude/i18n/en.json; an unknown key is returned as it is in tr', async () => {
  const { t } = await load();
  const { M, all } = await keys();
  const k = all[0];
  assert.equal(t(project({ '.kit.json': kitJson({ lang: 'en' }), '.claude/i18n/en.json': { [k]: 'OVERRIDE' } }), k), M[k].en);
  const p = withShipped();
  for (const u of ['no.such.key', '__proto__', 'constructor', 'toString', 'hasOwnProperty']) assert.equal(t(p, u), u, u);
});

test('A-49.6 t attacker: prototype keys inside tr.json do not change the text or pollute Object.prototype', async () => {
  const { t } = await load();
  const { M, all } = await keys();
  const k = all[0];
  const p = trProject(`{"__proto__": {"${k}": "PWNED", "polluted": "x"}, "constructor": "x"}`);
  assert.equal(t(p, k), M[k].en, 'a key under __proto__ is not an own translation');
  assert.equal({}.polluted, undefined, 'Object.prototype not polluted');
});

test('A-49.6 t attacker: a traversal language never reaches a tr.json outside .claude/i18n/', async () => {
  const { t, readLang } = await load();
  const { M, all } = await keys();
  const k = all[0];
  const bait = { [k]: 'PWNED' };
  for (const evil of ['../i18n/tr', 'tr/../tr', '..\\i18n\\tr', 'tr/', 'tr.json', 'TR', ' tr']) {
    const p = project({ '.kit.json': kitJson({ lang: evil }), 'tr.json': bait, '.claude/tr.json': bait, [TR_REL]: bait });
    assert.equal(readLang(p), 'en', `${JSON.stringify(evil)}: an invalid code is absent`);
    assert.equal(t(p, k), M[k].en, `${JSON.stringify(evil)}: English`);
  }
});

// ---------- missingKeys / --check ----------

test('AC-49.18 missingKeys: tr lists the keys tr.json lacks, nothing once the shipped file is there', async () => {
  const { missingKeys } = await load();
  const { all } = await keys();
  assert.deepEqual([...missingKeys(trProject())].sort(), [...all].sort(), 'no tr.json: every key');
  assert.deepEqual([...missingKeys(trProject('{"broken": '))].sort(), [...all].sort(), 'broken tr.json: every key');
  assert.deepEqual([...missingKeys(trProject({ [all[0]]: 'x', [all[1]]: 7 }))].sort(), all.slice(1).sort(), 'translated key is not missing, a number is');
  assert.deepEqual(missingKeys(withShipped()), [], 'the shipped tr.json is complete');
  assert.deepEqual(missingKeys(project({ '.kit.json': kitJson({ lang: 'en' }) })), [], 'en: nothing to translate');
});

test('AC-49.18 lang CLI --check: tr exits 1 and lists the missing keys; exits 0 with the shipped tr.json', async () => {
  const { all } = await keys();
  const c1 = cli(trProject({ [all[0]]: 'x' }), ['--check']);
  assert.equal(c1.status, 1, c1.stderr);
  const lines = c1.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(lines.sort(), all.slice(1).sort(), 'every missing key on its own line, the translated one not listed');
  const c2 = cli(withShipped(), ['--check']);
  assert.equal(c2.status, 0, c2.stdout + c2.stderr);
  assert.equal(c2.stdout.trim(), 'ok');
  const m = cli(trProject({ [all[0]]: 'x' }), ['--export', '--missing']);
  assert.equal(m.status, 0, m.stderr);
  assert.deepEqual(Object.keys(JSON.parse(m.stdout)).sort(), all.slice(1).sort(), '--export --missing for tr');
});

// ---------- writeTranslation / --write ----------

test('AC-49.19 writeTranslation: tr is allowed, creates .claude/i18n/tr.json and merges into it', async () => {
  const { writeTranslation, t } = await load();
  const { plain } = await keys();
  assert.equal(plain.length >= 2, true, 'two messages without a placeholder');
  const p = trProject();
  const file = writeTranslation(p, { [plain[0]]: 'bir' });
  assert.equal(path.resolve(file), path.resolve(p, TR_REL), 'returns the tr.json path');
  assert.deepEqual(JSON.parse(readFile(p, TR_REL)), { [plain[0]]: 'bir' });
  writeTranslation(p, { [plain[1]]: 'iki' });
  assert.deepEqual(JSON.parse(readFile(p, TR_REL)), { [plain[0]]: 'bir', [plain[1]]: 'iki' }, 'earlier key kept');
  assert.equal(t(p, plain[1]), 'iki');
});

test('AC-49.19 writeTranslation: a merge overwrites an existing tr key and keeps every other key (as for other languages)', async () => {
  const { writeTranslation, t } = await load();
  const { plain } = await keys();
  const p = withShipped();
  const before = shipped();
  writeTranslation(p, { [plain[0]]: 'YENİ metin' });
  const after = JSON.parse(readFile(p, TR_REL));
  assert.deepEqual(after, { ...before, [plain[0]]: 'YENİ metin' }, 'only that key changed');
  assert.equal(t(p, plain[0]), 'YENİ metin');
  assert.equal(readFile(p, TR_REL), JSON.stringify(after, null, 2) + '\n', '2-space JSON and a trailing newline');
});

test('A-49.7 writeTranslation attacker: tr input is validated like other languages, the file is unchanged', async () => {
  const { writeTranslation } = await load();
  const { M, all, withVar } = await keys();
  const k = all[0];
  const p = withShipped();
  const before = readFile(p, TR_REL);
  const first = placeholderSet(M[withVar].en)[0];
  const bad = [
    ['array', [M[k].en]], ['null', null], ['string', 'x'], ['unknown key', { 'no.such.key': 'x' }],
    ['__proto__ key', JSON.parse('{"__proto__": {"polluted": "x"}}')], ['constructor key', { constructor: 'x' }],
    ['non-string value', { [k]: 42 }], ['added placeholder', { [k]: `${M[k].en} {zzzExtra}` }],
    ['dropped placeholder', { [withVar]: M[withVar].en.split(`{${first}}`).join('') }],
    ['renamed placeholder', { [withVar]: M[withVar].en.split(`{${first}}`).join('{zzzOther}') }],
    ['valid plus unknown', { [k]: 'iyi', 'no.such.key': 'x' }],
  ];
  for (const [name, obj] of bad) {
    assert.throws(() => writeTranslation(p, obj), undefined, name);
    assert.equal(readFile(p, TR_REL), before, `${name}: file unchanged`);
  }
  assert.equal({}.polluted, undefined, 'Object.prototype not polluted');
});

test('AC-49.19 lang CLI --write: tr reads stdin and merges; en is still refused', async () => {
  const { plain } = await keys();
  const p = trProject({ [plain[0]]: 'eski' });
  const w = cli(p, ['--write'], JSON.stringify({ [plain[1]]: 'iki' }));
  assert.equal(w.status, 0, w.stderr);
  assert.deepEqual(JSON.parse(readFile(p, TR_REL)), { [plain[0]]: 'eski', [plain[1]]: 'iki' });
  const en = project({ '.kit.json': kitJson({ lang: 'en' }) });
  assert.notEqual(cli(en, ['--write'], JSON.stringify({ [plain[0]]: 'x' })).status, 0, 'en has no translation file');
  assert.equal(exists(en, '.claude/i18n'), false, 'nothing written for en');
});

// ---------- Turkish UI end to end, through tr.json ----------

const CACHE = () => ({ time: Date.now(), data: { runs: [], prs: [], liveMonitoring: [] } });
function dashboardHtml(p) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'dashboard.mjs'), p, '--quiet'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8');
}
function statusline(p) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'statusline.mjs')], { input: JSON.stringify({ workspace: { project_dir: p } }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
function guardReason(p, command) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'destructive-guard.mjs')], {
    input: JSON.stringify({ tool_name: 'Bash', cwd: p, tool_input: { command } }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p },
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout).hookSpecificOutput?.permissionDecisionReason ?? '';
}

test('AC-49.20 dashboard: a lang tr project shows the tr.json texts; without tr.json it is English', async () => {
  const M = await messages();
  const tr = shipped();
  const withFile = dashboardHtml(withShipped({ '.claude/state/github-cache.json': CACHE() }));
  assert.ok(withFile.includes(` · ${tr['dashboard.title']}</title>`), 'Turkish title from tr.json');
  assert.ok(withFile.includes(tr['dashboard.summary']), 'Turkish summary heading from tr.json');
  assert.equal(withFile.includes(` · ${M['dashboard.title'].en}</title>`), false, 'not the English title');
  const without = dashboardHtml(trProject(undefined, { '.claude/state/github-cache.json': CACHE() }));
  assert.ok(without.includes('<html lang="tr">'), 'still a Turkish-language page');
  assert.ok(without.includes(` · ${M['dashboard.title'].en}</title>`), 'no tr.json: the English title');
  assert.equal(without.includes(tr['dashboard.title']), false, 'no Turkish text from the code');
});

test('AC-49.20 statusline: a lang tr project before setup shows the tr.json text; without tr.json it is English', async () => {
  const M = await messages();
  const tr = shipped();
  const base = { 'kit/kit.mjs': '// kit clone, not set up\n', '.claude/state/lang.json': { lang: 'tr' } };
  const withFile = statusline(project({ ...base, [TR_REL]: shippedRaw() }));
  assert.ok(withFile.includes(tr['statusline.notSetUp']), withFile);
  const without = statusline(project(base));
  assert.ok(without.includes(M['statusline.notSetUp'].en), without);
  assert.equal(without.includes(tr['statusline.notSetUp']), false, 'no Turkish text from the code');
});

test('AC-49.20 destructive guard: a lang tr project gets the tr.json reason; without tr.json it is English', async () => {
  const M = await messages();
  const tr = shipped();
  const withFile = guardReason(withShipped(), 'git rebase main');
  assert.ok(withFile.includes(tr['guard.destructive.rewriteHistory']), withFile);
  assert.equal(withFile.includes(M['guard.destructive.rewriteHistory'].en), false, withFile);
  const without = guardReason(trProject(), 'git rebase main');
  assert.ok(without.includes(M['guard.destructive.rewriteHistory'].en), without);
  assert.equal(without.includes(tr['guard.destructive.rewriteHistory']), false, 'no Turkish text from the code');
});

// ---------- kit.mjs: tr.json is kit-owned and shipped ----------

const node = (...args) => spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const lf = (s) => s.replace(/\r\n/g, '\n');
const TYPES = fs.readdirSync(path.join(REPO, 'kit', 'templates')).filter((d) => d !== 'addons');
function installed(type = 'backend') {
  const p = project({}, `i18n-kit-${type}-`);
  for (const args of [['init', '--project', p], ['install', '--type', type, '--project', p]]) {
    const r = node(KIT_MJS, ...args);
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
  }
  return p;
}
const record = (p) => JSON.parse(readFile(p, '.kit.json'));
const writeTr = (p, s) => { fs.mkdirSync(path.join(p, '.claude/i18n'), { recursive: true }); fs.writeFileSync(path.join(p, TR_REL), s); };

test('AC-49.21 init: every project type gets the shipped .claude/i18n/tr.json and the record lists it', () => {
  assert.deepEqual([...TYPES].sort(), ['backend', 'mobile', 'web-saas']);
  for (const type of TYPES) {
    const p = installed(type);
    assert.equal(exists(p, TR_REL), true, `${type}: tr.json copied`);
    assert.equal(lf(readFile(p, TR_REL)), lf(shippedRaw()), `${type}: same content`);
    assert.equal(Object.hasOwn(record(p).files, TR_REL), true, `${type}: in .kit.json files`);
  }
});

test('AC-49.21 update: an untouched old .claude/i18n/tr.json is replaced by the kit version (kit-owned)', () => {
  const p = installed();
  const k = record(p);
  writeTr(p, '{"old": "kit"}\n');
  k.files[TR_REL] = sha('{"old": "kit"}\n');
  fs.writeFileSync(path.join(p, '.kit.json'), JSON.stringify(k));
  const r = node(KIT_MJS, 'update', '--project', p);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(lf(readFile(p, TR_REL)), lf(shippedRaw()), 'replaced with the kit version');
  assert.match(r.stdout, /Updated[\s\S]*\.claude\/i18n\/tr\.json/, 'listed as updated');
});

test('AC-49.21 update: a tr.json the user changed is kept and the kit version waits beside it as .kit-new', () => {
  const p = installed();
  writeTr(p, '{"mine": "x"}\n'); // the record still holds an older kit hash
  const k = record(p);
  k.files[TR_REL] = sha('{"older": "kit"}\n');
  fs.writeFileSync(path.join(p, '.kit.json'), JSON.stringify(k));
  const r = node(KIT_MJS, 'update', '--project', p);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFile(p, TR_REL), '{"mine": "x"}\n', 'the user change is kept');
  assert.equal(lf(readFile(p, `${TR_REL}.kit-new`)), lf(shippedRaw()), 'the kit version is beside it');
});

test('A-49.8 update: a user translation .claude/i18n/de.json is not kit-owned and survives an update untouched', () => {
  const p = installed();
  const de = '{\n  "dashboard.title": "Übersicht"\n}\n';
  fs.mkdirSync(path.join(p, '.claude/i18n'), { recursive: true });
  fs.writeFileSync(path.join(p, '.claude/i18n/de.json'), de);
  const r = node(KIT_MJS, 'update', '--project', p);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFile(p, '.claude/i18n/de.json'), de, 'content unchanged');
  assert.equal(exists(p, '.claude/i18n/de.json.kit-new'), false, 'no .kit-new');
  assert.equal(Object.hasOwn(record(p).files, '.claude/i18n/de.json'), false, 'not recorded as a kit file');
  assert.doesNotMatch(r.stdout, /de\.json/, 'not named in the update report');
  assert.equal(exists(p, TR_REL), true, 'tr.json is there next to it');
});
