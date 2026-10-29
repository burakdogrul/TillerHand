// Run: node --test "kit/tests/*.test.mjs"
// Language selection (3.44.0): messages table, lang.mjs (readLang, setLang, t, missingKeys, writeTranslation, CLI),
// the language line in session-start and reminder, the /language command and its permission.
// Modules are imported inside each test so a missing module fails every test on its own.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(ROOT, '.claude', 'hooks');
const LANG = path.join(HOOKS, 'lang.mjs');
const load = () => import('../../.claude/hooks/lang.mjs');
const messages = async () => (await import('../../.claude/hooks/messages.mjs')).MESSAGES;

const dirs = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

// Temp project; object values are written as JSON, strings as they are
function project(files = {}) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-'));
  dirs.push(p);
  for (const [f, s] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    fs.writeFileSync(path.join(p, f), typeof s === 'string' ? s : JSON.stringify(s, null, 2));
  }
  return p;
}
const kitJson = (extra = {}) => ({ version: '3.43.0', type: 'web-saas', addons: [], tool: null, files: { 'a.md': 'abc' }, ...extra });
const PENDING = { 'kit/kit.mjs': '// kit clone, not set up\n' }; // no .kit.json + kit/kit.mjs = not set up
const readFile = (p, f) => fs.readFileSync(path.join(p, f), 'utf8');
const exists = (p, f) => fs.existsSync(path.join(p, f));
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, n) => (n in vars ? String(vars[n]) : m));
const cli = (p, args, input) => spawnSync(process.execPath, [LANG, ...args], { input, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
// Keys picked from the table, never by name
async function keys() {
  const M = await messages();
  const all = Object.keys(M);
  return { M, all, withVar: all.find((k) => placeholders(M[k].en).length > 0), plain: all.find((k) => placeholders(M[k].en).length === 0) };
}

// ---------- messages.mjs ----------

test('messages: the table is non-empty, every entry has tr and en text', async () => {
  const M = await messages();
  assert.equal(typeof M, 'object');
  assert.ok(Object.keys(M).length > 0, 'at least one message');
  for (const [k, v] of Object.entries(M)) {
    assert.equal(typeof v.tr, 'string', `${k}.tr`);
    assert.equal(typeof v.en, 'string', `${k}.en`);
    assert.ok(v.tr.trim().length > 0, `${k}.tr is not empty`);
    assert.ok(v.en.trim().length > 0, `${k}.en is not empty`);
  }
});

test('messages: tr and en carry the same placeholder set', async () => {
  const M = await messages();
  for (const [k, v] of Object.entries(M)) {
    assert.deepEqual([...new Set(placeholders(v.tr))], [...new Set(placeholders(v.en))], `${k}: {name} placeholders`);
  }
});

// ---------- LANG_RE ----------

test('lang: LANG_RE accepts language codes and rejects paths, case and empty values', async () => {
  const { LANG_RE } = await load();
  for (const ok of ['tr', 'en', 'de', 'pt-BR', 'zh-Hant', 'fil', 'sr-Latn-RS']) assert.equal(LANG_RE.test(ok), true, ok);
  for (const bad of ['', 'TR', 'En', '../x', 'de/../x', '..\\x', 'e', 'english', 'de-', 'de-x', 'tü', 'İt', 'en\n', ' en', 'en ', 'de_DE', '__proto__']) {
    assert.equal(LANG_RE.test(bad), false, JSON.stringify(bad));
  }
});

// ---------- readLang ----------

test('lang: readLang reads .kit.json lang first', async () => {
  const { readLang } = await load();
  assert.equal(readLang(project({ '.kit.json': kitJson({ lang: 'de' }), '.claude/state/lang.json': { lang: 'en' } })), 'de');
  assert.equal(readLang(project({ '.kit.json': kitJson({ type: null, lang: 'pt-BR' }) })), 'pt-BR', 'lang wins even when the type is not chosen');
});

test('lang: readLang falls back to the state file when .kit.json has no valid lang', async () => {
  const { readLang } = await load();
  assert.equal(readLang(project({ '.kit.json': kitJson(), '.claude/state/lang.json': { lang: 'zh-Hant' } })), 'zh-Hant');
  assert.equal(readLang(project({ ...PENDING, '.claude/state/lang.json': { lang: 'en' } })), 'en', 'template path before install');
  for (const bad of ['../../x', 'TR', '', 5, null, ['en']]) {
    assert.equal(readLang(project({ '.kit.json': kitJson({ lang: bad }), '.claude/state/lang.json': { lang: 'en' } })), 'en', `invalid .kit.json lang ${JSON.stringify(bad)}`);
  }
});

test('lang: readLang is null in a project that is not set up and has no language', async () => {
  const { readLang } = await load();
  assert.equal(readLang(project(PENDING)), null, 'kit clone without .kit.json');
  assert.equal(readLang(project({ '.kit.json': kitJson({ type: null }) })), null, 'init done, type not chosen');
  assert.equal(readLang(project({ ...PENDING, '.claude/state/lang.json': { lang: '../x' } })), null, 'invalid state lang is absent');
  assert.equal(readLang(project({ ...PENDING, '.claude/state/lang.json': '{"lang": ' })), null, 'broken state file is absent');
});

test('AC-49.11 lang: readLang defaults to en in set-up projects without lang and in plain folders (was tr)', async () => {
  const { readLang } = await load();
  assert.equal(readLang(project({ '.kit.json': kitJson() })), 'en', 'installed, no language chosen');
  assert.equal(readLang(project()), 'en', 'plain folder');
  assert.equal(readLang(project({ '.claude/state/lang.json': { lang: 'EN' } })), 'en', 'invalid state lang is ignored');
  assert.equal(readLang(project({ '.kit.json': kitJson({ lang: 'tr' }) })), 'tr', 'a chosen tr stays tr');
});

test('AC-49.11 lang: readLang never throws on broken JSON', async () => {
  const { readLang } = await load();
  assert.equal(readLang(project({ '.kit.json': '{"type": ', '.claude/state/lang.json': 'not json' })), 'en', 'broken files, no kit clone');
  // A broken .kit.json is absent: same rule as status-read kitPending
  assert.equal(readLang(project({ ...PENDING, '.kit.json': '{', '.claude/state/lang.json': '[]' })), null, 'broken .kit.json in a kit clone counts as not set up');
  assert.equal(readLang(project({ '.kit.json': '{' })), 'en', 'broken .kit.json without a kit clone: en');
  assert.equal(readLang(project({ '.kit.json': 'null', '.claude/state/lang.json': 'null' })), 'en');
});

// ---------- setLang ----------

test('lang: setLang writes lang into .kit.json and keeps every other field', async () => {
  const { setLang, readLang } = await load();
  const orig = kitJson({ addons: ['ai'], tool: ['claude'], files: { 'x/y.md': 'h1', 'z.md': 'h2' }, created: '2026-01-01' });
  const p = project({ '.kit.json': orig });
  setLang(p, 'de');
  const raw = readFile(p, '.kit.json');
  assert.deepEqual(JSON.parse(raw), { ...orig, lang: 'de' });
  assert.equal(raw, JSON.stringify(JSON.parse(raw), null, 2) + '\n', '2-space indent and a trailing newline');
  assert.equal(exists(p, '.claude/state/lang.json'), false, 'no state file when .kit.json exists');
  assert.equal(readLang(p), 'de');
  setLang(p, 'pt-BR');
  assert.deepEqual(JSON.parse(readFile(p, '.kit.json')), { ...orig, lang: 'pt-BR' }, 'changing the language again');
});

test('lang: setLang without .kit.json writes the state file and creates its folder', async () => {
  const { setLang, readLang } = await load();
  const p = project(PENDING);
  setLang(p, 'en');
  assert.deepEqual(JSON.parse(readFile(p, '.claude/state/lang.json')), { lang: 'en' });
  assert.equal(exists(p, '.kit.json'), false, 'does not create .kit.json');
  assert.equal(readLang(p), 'en');
});

test('lang attacker: setLang rejects path traversal and malformed codes, nothing is written', async () => {
  const { setLang } = await load();
  const p = project({ '.kit.json': kitJson() });
  const before = readFile(p, '.kit.json');
  const q = project(PENDING);
  for (const bad of ['../x', 'de/../x', '..\\x', '../../.claude/settings', '', 'TR', 'english', 'en\n', 'tü', 5, null, undefined, { lang: 'en' }]) {
    assert.throws(() => setLang(p, bad), undefined, `.kit.json: ${String(bad)}`);
    assert.throws(() => setLang(q, bad), undefined, `state: ${String(bad)}`);
  }
  assert.equal(readFile(p, '.kit.json'), before, '.kit.json unchanged');
  assert.equal(exists(q, '.claude/state/lang.json'), false, 'no state file');
  assert.equal(exists(q, 'x'), false);
});

// ---------- t ----------

test('lang: t returns tr and en text from the table', async () => {
  const { t } = await load();
  const { M, all } = await keys();
  const tr = project({ '.kit.json': kitJson({ lang: 'tr' }) });
  const en = project({ '.kit.json': kitJson({ lang: 'en' }) });
  for (const k of all) {
    assert.equal(t(tr, k), M[k].tr, `tr: ${k}`);
    assert.equal(t(en, k), M[k].en, `en: ${k}`);
  }
  assert.equal(t(project(), all[0]), M[all[0]].en, 'a plain folder defaults to en');
  assert.equal(t(project(PENDING), all[0]), M[all[0]].en, 'no language chosen: en');
});

test('lang: t fills placeholders, keeps the ones without a value', async () => {
  const { t } = await load();
  const { M, withVar } = await keys();
  if (!withVar) return; // the table has no placeholder message yet: nothing to fill
  const names = [...new Set(placeholders(M[withVar].en))];
  const vars = Object.fromEntries(names.map((n, i) => [n, `V${i}çİı`]));
  const en = project({ '.kit.json': kitJson({ lang: 'en' }) });
  const tr = project({ '.kit.json': kitJson({ lang: 'tr' }) });
  assert.equal(t(en, withVar, vars), fill(M[withVar].en, vars));
  assert.equal(t(tr, withVar, vars), fill(M[withVar].tr, vars));
  assert.equal(t(en, withVar, { [names[0]]: 7 }), fill(M[withVar].en, { [names[0]]: '7' }), 'a number becomes a string');
  assert.equal(t(en, withVar), M[withVar].en, 'no vars: placeholders stay');
  assert.equal(t(en, withVar, {}), M[withVar].en);
  assert.equal(t(en, withVar, { [names[0]]: '{x}$&' }), fill(M[withVar].en, { [names[0]]: '{x}$&' }), 'a value with $& or braces is inserted literally');
});

test('lang: t returns an unknown key as it is, including prototype names', async () => {
  const { t } = await load();
  for (const lang of ['tr', 'en', 'de']) {
    const p = project({ '.kit.json': kitJson({ lang }), '.claude/i18n/de.json': {} });
    for (const k of ['no.such.key', '__proto__', 'constructor', 'toString', 'hasOwnProperty']) assert.equal(t(p, k), k, `${lang}: ${k}`);
  }
});

test('lang: t reads other languages from .claude/i18n/<lang>.json, falls back to en', async () => {
  const { t } = await load();
  const { M, all, withVar } = await keys();
  const k = all[0];
  const de = (file) => project({ '.kit.json': kitJson({ lang: 'de' }), ...(file === undefined ? {} : { '.claude/i18n/de.json': file }) });
  assert.equal(t(de({ [k]: 'Übersetzt' }), k), 'Übersetzt', 'translated text');
  assert.equal(t(de({}), k), M[k].en, 'missing key: en');
  assert.equal(t(de({ [k]: 42 }), k), M[k].en, 'non-string value: en');
  assert.equal(t(de({ [k]: { de: 'x' } }), k), M[k].en, 'object value: en');
  assert.equal(t(de('{"broken": '), k), M[k].en, 'broken file: en');
  assert.equal(t(de('[]'), k), M[k].en, 'array file: en');
  assert.equal(t(de(undefined), k), M[k].en, 'missing file: en');
  if (withVar) {
    const names = [...new Set(placeholders(M[withVar].en))];
    const vars = Object.fromEntries(names.map((n) => [n, `<${n}>`]));
    assert.equal(t(de({ [withVar]: `DE ${M[withVar].en}` }), withVar, vars), fill(`DE ${M[withVar].en}`, vars), 'placeholders filled in a translation');
  }
});

test('lang: t ignores i18n files for tr and en', async () => {
  const { t } = await load();
  const { M, all } = await keys();
  const k = all[0];
  assert.equal(t(project({ '.kit.json': kitJson({ lang: 'en' }), '.claude/i18n/en.json': { [k]: 'OVERRIDE' } }), k), M[k].en);
  assert.equal(t(project({ '.kit.json': kitJson({ lang: 'tr' }), '.claude/i18n/tr.json': { [k]: 'OVERRIDE' } }), k), M[k].tr);
});

test('lang attacker: a traversal lang in .kit.json or the state file does not make t read outside .claude/i18n/', async () => {
  const { t, readLang } = await load();
  const { M, all } = await keys();
  const k = all[0];
  const bait = { [k]: 'PWNED' };
  const baitFiles = { 'x.json': bait, '.claude/x.json': bait, '.claude/i18n/x.json': bait };
  for (const evil of ['../../x', '../x', '..\\..\\x', 'x/../../x']) {
    const p = project({ '.kit.json': kitJson({ lang: evil }), ...baitFiles });
    assert.equal(readLang(p), 'en', `${evil}: invalid lang is absent`);
    assert.equal(t(p, k), M[k].en, `${evil}: .kit.json`);
    const q = project({ ...PENDING, '.claude/state/lang.json': { lang: evil }, ...baitFiles });
    assert.equal(readLang(q), null, `${evil}: invalid state lang is absent`);
    assert.equal(t(q, k), M[k].en, `${evil}: state file`);
  }
});

// ---------- missingKeys ----------

test('lang: missingKeys is empty for tr, en and no language; lists untranslated keys otherwise', async () => {
  const { missingKeys } = await load();
  const { all } = await keys();
  assert.deepEqual(missingKeys(project({ '.kit.json': kitJson({ lang: 'tr' }) })), []);
  assert.deepEqual(missingKeys(project({ '.kit.json': kitJson({ lang: 'en' }) })), []);
  assert.deepEqual(missingKeys(project(PENDING)), []);
  assert.deepEqual([...missingKeys(project({ '.kit.json': kitJson({ lang: 'de' }) }))].sort(), [...all].sort(), 'no file: every key');
  const one = project({ '.kit.json': kitJson({ lang: 'de' }), '.claude/i18n/de.json': { [all[0]]: 'x' } });
  assert.deepEqual([...missingKeys(one)].sort(), all.slice(1).sort(), 'translated key is not missing');
  const full = project({ '.kit.json': kitJson({ lang: 'de' }), '.claude/i18n/de.json': Object.fromEntries(all.map((k) => [k, 'x'])) });
  assert.deepEqual(missingKeys(full), []);
});

// ---------- writeTranslation ----------

test('lang: writeTranslation merges into .claude/i18n/<lang>.json, keeps earlier keys', async () => {
  const { writeTranslation, t } = await load();
  const { M, all } = await keys();
  const p = project({ '.kit.json': kitJson({ lang: 'pt-BR' }) });
  const tr1 = { [all[0]]: `PT ${M[all[0]].en}` };
  writeTranslation(p, tr1);
  assert.deepEqual(JSON.parse(readFile(p, '.claude/i18n/pt-BR.json')), tr1, 'creates the folder and the file');
  if (all.length > 1) {
    writeTranslation(p, { [all[1]]: `PT2 ${M[all[1]].en}` });
    assert.deepEqual(JSON.parse(readFile(p, '.claude/i18n/pt-BR.json')), { ...tr1, [all[1]]: `PT2 ${M[all[1]].en}` }, 'earlier key kept');
  }
  writeTranslation(p, { [all[0]]: `NEW ${M[all[0]].en}` });
  assert.equal(JSON.parse(readFile(p, '.claude/i18n/pt-BR.json'))[all[0]], `NEW ${M[all[0]].en}`, 'overwritten');
  assert.equal(t(p, all[0]), `NEW ${M[all[0]].en}`);
});

test('lang: writeTranslation refuses when the language is tr, en or not chosen', async () => {
  const { writeTranslation } = await load();
  const { M, all } = await keys();
  const obj = { [all[0]]: M[all[0]].en };
  for (const p of [project({ '.kit.json': kitJson({ lang: 'tr' }) }), project({ '.kit.json': kitJson({ lang: 'en' }) }), project(PENDING), project()]) {
    assert.throws(() => writeTranslation(p, obj));
    assert.equal(exists(p, '.claude/i18n'), false, 'nothing written');
  }
});

test('lang attacker: writeTranslation rejects bad input and writes nothing', async () => {
  const { writeTranslation } = await load();
  const { M, all, withVar } = await keys();
  const k = all[0];
  const p = project({ '.kit.json': kitJson({ lang: 'de' }), '.claude/i18n/de.json': { [k]: 'alt' } });
  const before = readFile(p, '.claude/i18n/de.json');
  const bad = [
    ['array', [M[k].en]],
    ['null', null],
    ['string', 'x'],
    ['number', 5],
    ['unknown key', { 'no.such.key': 'x' }],
    ['__proto__ key', JSON.parse('{"__proto__": {"polluted": "x"}}')],
    ['__proto__ string', JSON.parse('{"__proto__": "x"}')],
    ['constructor key', { constructor: 'x' }],
    ['toString key', { toString: 'x' }],
    ['non-string value', { [k]: 42 }],
    ['object value', { [k]: { text: 'x' } }],
    ['added placeholder', { [k]: `${M[k].en} {zzzExtra}` }],
    ['valid plus unknown', { [k]: `DE ${M[k].en}`, 'no.such.key': 'x' }],
  ];
  if (withVar) {
    const first = placeholders(M[withVar].en)[0];
    bad.push(['dropped placeholder', { [withVar]: M[withVar].en.split(`{${first}}`).join('') }]);
    bad.push(['renamed placeholder', { [withVar]: M[withVar].en.split(`{${first}}`).join('{zzzOther}') }]);
  }
  for (const [name, obj] of bad) {
    assert.throws(() => writeTranslation(p, obj), undefined, name);
    assert.equal(readFile(p, '.claude/i18n/de.json'), before, `${name}: file unchanged`);
  }
  assert.equal({}.polluted, undefined, 'Object.prototype not polluted');
});

// ---------- CLI ----------

test('lang CLI: --set writes the language, --show prints it', async () => {
  const orig = kitJson();
  const p = project({ '.kit.json': orig });
  const r = cli(p, ['--set', 'de']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(readFile(p, '.kit.json')), { ...orig, lang: 'de' });
  assert.equal(cli(p, ['--show']).stdout.trim(), 'de');
  const q = project(PENDING);
  const s = cli(q, ['--show']);
  assert.equal(s.status, 0, s.stderr);
  assert.equal(s.stdout.trim(), 'none', 'no language');
  assert.equal(cli(q, ['--set', 'en']).status, 0);
  assert.deepEqual(JSON.parse(readFile(q, '.claude/state/lang.json')), { lang: 'en' });
  assert.equal(cli(project(), ['--show']).stdout.trim(), 'en', 'plain folder');
});

test('lang CLI attacker: --set with a traversal or malformed code exits non-zero, nothing written', async () => {
  const p = project({ '.kit.json': kitJson() });
  assert.equal(cli(p, ['--set', 'en']).status, 0, 'a valid code works');
  const before = readFile(p, '.kit.json');
  const q = project(PENDING);
  for (const bad of [['--set', '../x'], ['--set', 'de/../x'], ['--set', '..\\x'], ['--set', 'TR'], ['--set', ''], ['--set']]) {
    assert.notEqual(cli(p, bad).status, 0, bad.join(' '));
    assert.notEqual(cli(q, bad).status, 0, `state: ${bad.join(' ')}`);
  }
  assert.equal(readFile(p, '.kit.json'), before);
  assert.equal(exists(q, '.claude/state/lang.json'), false);
});

test('lang CLI: --export prints every en text, --export --missing only untranslated keys', async () => {
  const { M, all } = await keys();
  const p = project({ '.kit.json': kitJson({ lang: 'de' }), '.claude/i18n/de.json': { [all[0]]: 'x' } });
  const r = cli(p, ['--export']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), Object.fromEntries(all.map((k) => [k, M[k].en])));
  const m = cli(p, ['--export', '--missing']);
  assert.equal(m.status, 0, m.stderr);
  assert.deepEqual(JSON.parse(m.stdout), Object.fromEntries(all.slice(1).map((k) => [k, M[k].en])));
  assert.deepEqual(JSON.parse(cli(project({ '.kit.json': kitJson({ lang: 'en' }) }), ['--export', '--missing']).stdout), {}, 'en: nothing missing');
});

test('lang CLI: --write reads stdin, --check passes once every key is translated', async () => {
  const { all } = await keys();
  const p = project({ '.kit.json': kitJson({ lang: 'de' }) });
  const c1 = cli(p, ['--check']);
  assert.equal(c1.status, 1, 'keys missing');
  const lines = c1.stdout.split(/\r?\n/).map((s) => s.trim());
  for (const k of all) assert.ok(lines.includes(k), `missing key listed on its own line: ${k}`);
  const exported = cli(p, ['--export', '--missing']).stdout;
  const w = cli(p, ['--write'], exported);
  assert.equal(w.status, 0, w.stderr);
  assert.deepEqual(Object.keys(JSON.parse(readFile(p, '.claude/i18n/de.json'))).sort(), [...all].sort());
  const c2 = cli(p, ['--check']);
  assert.equal(c2.status, 0, c2.stdout);
  assert.equal(cli(project({ '.kit.json': kitJson({ lang: 'tr' }) }), ['--check']).status, 0, 'tr: nothing to check');
});

test('lang CLI attacker: --write rejects broken JSON, prototype keys and dropped placeholders, file unchanged', async () => {
  const { M, all, withVar } = await keys();
  const k = all[0];
  const p = project({ '.kit.json': kitJson({ lang: 'de' }) });
  assert.equal(cli(p, ['--write'], JSON.stringify({ [k]: `DE ${M[k].en}` })).status, 0, 'a valid write works');
  const before = readFile(p, '.claude/i18n/de.json');
  const bad = ['{"broken": ', '', '[]', 'null', '"x"', '{"__proto__": {"x": "y"}}', '{"__proto__": "x"}', '{"constructor": "x"}',
    JSON.stringify({ 'no.such.key': 'x' }), JSON.stringify({ [k]: 1 }), JSON.stringify({ [k]: `${M[k].en} {zzzExtra}` })];
  if (withVar) bad.push(JSON.stringify({ [withVar]: M[withVar].en.replace(/\{\w+\}/g, '') }));
  for (const input of bad) {
    assert.notEqual(cli(p, ['--write'], input).status, 0, input);
    assert.equal(readFile(p, '.claude/i18n/de.json'), before, `${input}: file unchanged`);
  }
  const tr = project({ '.kit.json': kitJson({ lang: 'tr' }) });
  assert.notEqual(cli(tr, ['--write'], JSON.stringify({ [k]: M[k].en })).status, 0, 'tr has no translation file');
  assert.equal(exists(tr, '.claude/i18n'), false);
});

// ---------- session-start ----------

const session = (p) => {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'session-start.mjs')], {
    input: '{}', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, HOME: p, USERPROFILE: p }, // not the developer's preferences
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
};

test('session-start: a chosen language gives the conversation language line', () => {
  assert.ok(session(project({ '.kit.json': kitJson({ lang: 'de' }) })).includes('Conversation language: de.'), '.kit.json lang');
  assert.ok(session(project({ ...PENDING, '.claude/state/lang.json': { lang: 'en' } })).includes('Conversation language: en.'), 'state lang before install');
  assert.ok(session(project({ '.kit.json': kitJson() })).includes('Conversation language: en.'), 'installed, no language chosen: en');
});

test('AC-49.13 usage.mjs: the reset time format does not hard-code the tr-TR locale', () => {
  const src = fs.readFileSync(path.join(HOOKS, 'usage.mjs'), 'utf8');
  assert.doesNotMatch(src, /tr-TR/);
});

// The language note of the session context: the "Conversation language:" line and, if the rule is a note of its own, the next line
const languageNote = (context) => {
  const lines = context.split('\n');
  const i = lines.findIndex((l) => l.includes('Conversation language:'));
  return i < 0 ? '' : lines.slice(i, i + 2).join('\n');
};

test('AC-49.12 session-start: the language note says labels, headings, keys and verdict words stay English in every language', () => {
  for (const lang of ['tr', 'de', 'en']) {
    const note = languageNote(session(project({ '.kit.json': kitJson({ lang }) })));
    assert.ok(note.includes(`Conversation language: ${lang}.`), `${lang}: ${note}`);
    for (const word of [/\blabels?\b/i, /\bheadings?\b/i, /\bkeys?\b/i, /\bverdict/i, /\bEnglish\b/]) {
      assert.match(note, word, `${lang}: the note names ${word}`);
    }
  }
});

test('session-start: no language chosen says so and gives no language line', () => {
  for (const p of [project(PENDING), project({ '.kit.json': kitJson({ type: null }) })]) {
    const c = session(p);
    assert.ok(c.includes('Language not chosen yet'), c);
    assert.ok(!c.includes('Conversation language:'), c);
  }
});

// ---------- reminder ----------

const remind = (p) => {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'reminder.mjs')], { input: '{"session_id":"s1"}', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};

test('reminder: a chosen language is repeated on every message, none without a language', () => {
  const p = project({ '.kit.json': kitJson({ lang: 'pt-BR' }) });
  for (let i = 1; i <= 3; i++) assert.ok(remind(p).includes('Reply in pt-BR.'), `call ${i}`);
  const old = project({ '.kit.json': kitJson() });
  assert.ok(remind(old).includes('Reply in en.'), 'set up without a language: en');
  const q = project(PENDING);
  for (let i = 1; i <= 2; i++) assert.ok(!remind(q).includes('Reply in'), `no language, call ${i}`);
});

// ---------- /language command, other commands, permission ----------

test('language command: /language exists, sets the language and is a light command', async () => {
  const md = path.join(ROOT, '.claude/commands/language.md');
  assert.ok(fs.existsSync(md), '.claude/commands/language.md');
  assert.ok(fs.readFileSync(md, 'utf8').includes('lang.mjs --set'), 'uses lang.mjs --set');
  const { LIGHT_COMMANDS } = await import('../../.claude/hooks/tools.mjs');
  assert.ok(LIGHT_COMMANDS.includes('language'), 'listed in LIGHT_COMMANDS');
});

test('language command: /start and /adopt ask the language first, /kit-update checks translations', () => {
  const cmd = (n) => fs.readFileSync(path.join(ROOT, `.claude/commands/${n}.md`), 'utf8');
  for (const n of ['start', 'adopt']) {
    assert.ok(cmd(n).includes('Turkish / English / Other'), `${n}: language options`);
    assert.ok(cmd(n).includes('lang.mjs --set'), `${n}: sets the language`);
  }
  assert.ok(cmd('kit-update').includes('lang.mjs --check'), 'kit-update: checks missing translations');
});

test('language command: lang.mjs is allowed in the project settings', () => {
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'));
  assert.ok(s.permissions.allow.includes('Bash(node .claude/hooks/lang.mjs:*)'));
});
