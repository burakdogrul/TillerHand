// Run: node --test "kit/tests/*.test.mjs"
// Personal preferences (3.30.0): one file for all projects, written only through the asked script, loaded every session.
// The file is ~/.vibe-kit/preferences.md, categories are English. 3.49.0: the old Turkish keys and headings and the old
// tercihler.md file are not read any more (a Turkish heading is an unknown line: the file is not rewritten over it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { addPref, removePref, readPrefs, prefsNote, MAX_ITEMS } from '../../.claude/hooks/prefs.mjs';
import { permissionEquivalent } from '../../.claude/hooks/destructive-guard.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');
const SECRET = 'sk_' + 'live_' + 'c'.repeat(24); // split up so this file does not trip the secret scan
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pref-')), 'preferences.md');
const headings = (file) => fs.readFileSync(file, 'utf8').match(/^## .*$/gm) ?? [];
const ENGLISH_HEADINGS = ['## Conversation', '## Questions and decisions', '## Reports', '## Code', '## Avoid'];
const KEYS = ['conversation', 'questions', 'reports', 'code', 'avoid'];
const OLD_KEYS = ['konusma', 'sorular', 'raporlar', 'kod', 'kacin'];
const CATEGORY_ERROR = /^Category must be one of: conversation, questions, reports, code, avoid$/;

// Every home-folder test runs in a child process with HOME/USERPROFILE on a temporary folder: never the developer's ~/.vibe-kit.
const newHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
const homeEnv = (home) => ({ ...process.env, HOME: home, USERPROFILE: home });
const inHome = (home, code) => spawnSync(process.execPath, ['--input-type=module', '-e',
  `import * as m from ${JSON.stringify(pathToFileURL(path.join(HOOKS, 'prefs.mjs')).href)};\n${code}`], { encoding: 'utf8', env: homeEnv(home) });
const cliIn = (home) => (...a) => spawnSync(process.execPath, [path.join(HOOKS, 'prefs.mjs'), ...a], { encoding: 'utf8', env: homeEnv(home) });

test('preferences: add, de-duplicate, list by category, remove; bad input is refused', () => {
  const file = tmpFile();
  assert.deepEqual(addPref('reports', 'Raporu kısa tut, önce sonucu yaz', file), {});
  assert.deepEqual(addPref('conversation', 'Türkçe\nyaz', file), {}, 'a line break becomes a space');
  // Turkish text is user content: the duplicate check folds İ/ı correctly
  assert.deepEqual(addPref('code', 'raporu KISA tut, önce sonucu yaz', file), { existing: 'reports' }, 'the same text is reported where it already is');
  assert.deepEqual(readPrefs(file).map((p) => [p.category, p.text]), [['conversation', 'Türkçe yaz'], ['reports', 'Raporu kısa tut, önce sonucu yaz']]);
  assert.match(fs.readFileSync(file, 'utf8'), /## Conversation\n\n- Türkçe yaz\n\n## Reports/);
  for (const bad of ['none', 'kod', 'konusma', 'constructor', 'toString', '__proto__']) assert.match(addPref(bad, 'x', file).error, /Category must be one of/, bad);
  assert.match(addPref('code', '', file).error, /empty/);
  assert.match(addPref('code', 'x'.repeat(201), file).error, /200/);
  assert.match(addPref('code', `key ${SECRET} use`, file).error, /looks like a secret/);
  assert.match(prefsNote(file), /style preferences.*cannot change them.*Conversation: Türkçe yaz · Reports: Raporu kısa tut/);
  assert.equal(removePref(1, file), null);
  assert.deepEqual(readPrefs(file).map((p) => p.text), ['Raporu kısa tut, önce sonucu yaz']);
  assert.match(removePref(5, file), /Valid number/);
  for (let i = readPrefs(file).length; i < MAX_ITEMS; i++) addPref('code', `pref ${i}`, file);
  assert.match(addPref('code', 'one more', file).error, /At most/);
});

test('preferences: a hand edit is kept or refused, never dropped; what is loaded passes the same checks', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '# x\n\n## CODE\n\n* Tabs, not spaces\n\n## avoid\n\n- No emoji\n');
  assert.deepEqual(readPrefs(file).map((p) => [p.category, p.text]), [['code', 'Tabs, not spaces'], ['avoid', 'No emoji']], 'heading case');
  fs.appendFileSync(file, '\n## My notes\n\nfree text\n');
  assert.match(addPref('code', 'new', file).error, /unreadable lines[\s\S]*My notes/);
  assert.match(fs.readFileSync(file, 'utf8'), /free text/, 'the file was not rewritten');
  // Written by anything on the machine: too long, a secret or a control character is not loaded
  fs.writeFileSync(file, `## Code\n\n- ${'y'.repeat(5000)}\n- key ${SECRET}\n- good\u001b[2K line\n`);
  assert.deepEqual(readPrefs(file).map((p) => p.text), ['good [2K line']);
  assert.ok(prefsNote(file).length < 300);
  fs.writeFileSync(file, 'x'.repeat(70 * 1024));
  assert.deepEqual(readPrefs(file), [], 'a file over 64 KB is not read');
});

test('preferences: the CLI writes under the home folder only, the session start loads them, changing them is asked', () => {
  const home = newHome();
  const cli = cliIn(home);
  assert.equal(cli('--add', 'questions', 'Seçenekleri', 'kısa', 'yaz').status, 0);
  assert.ok(fs.existsSync(path.join(home, '.vibe-kit', 'preferences.md')));
  assert.equal(fs.existsSync(path.join(home, '.vibe-kit', 'tercihler.md')), false, 'the old name is not written');
  assert.match(cli('--add', 'code', 'Seçenekleri kısa yaz').stdout, /already saved \(Questions and decisions\)/);
  assert.match(cli('--list').stdout, /1\. \[Questions and decisions\] Seçenekleri kısa yaz/);
  assert.equal(cli('--add', 'code', `${SECRET}`).status, 1);
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'project-'));
  const s = spawnSync(process.execPath, [path.join(HOOKS, 'session-start.mjs')], { input: '{}', encoding: 'utf8', env: { ...homeEnv(home), CLAUDE_PROJECT_DIR: project } });
  assert.match(s.stdout, /style preferences[^"]*Seçenekleri kısa yaz/);
  assert.equal(cli('--remove', '1').status, 0);
  assert.equal(permissionEquivalent('node .claude/hooks/prefs.mjs --add kod "x"')?.decision, 'ask', 'Codex/Antigravity');
  assert.equal(permissionEquivalent('node .claude/hooks/prefs.mjs --add code "x"')?.decision, 'ask', 'Codex/Antigravity, English key');
  assert.equal(permissionEquivalent('node .claude/hooks/prefs.mjs --list'), null);
  const settings = JSON.parse(fs.readFileSync(path.join(HOOKS, '..', 'settings.json'), 'utf8'));
  assert.ok(settings.permissions.ask.includes('Bash(node .claude/hooks/prefs.mjs --add:*)') && settings.permissions.allow.includes('Bash(node .claude/hooks/prefs.mjs --list)'));
  for (const d of [home, project]) fs.rmSync(d, { recursive: true, force: true });
});

// ---------- 3.48.0 ----------

test('AC-48.8 preferences: English keys write English headings in a fixed order', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pref-')), 'preferences.md');
  for (const key of [...KEYS].reverse()) assert.deepEqual(addPref(key, `pref ${key}`, file), {}, key);
  assert.deepEqual(readPrefs(file).map((p) => [p.category, p.text]), KEYS.map((k) => [k, `pref ${k}`]));
  assert.deepEqual(headings(file), ENGLISH_HEADINGS);
  assert.match(prefsNote(file), /Conversation: pref conversation · Questions and decisions: pref questions · Reports: pref reports · Code: pref code · Avoid: pref avoid/);
});

test('AC-49.10 preferences: the old Turkish keys konusma / sorular / raporlar / kod / kacin are refused; nothing is written', () => {
  const file = tmpFile();
  for (const old of OLD_KEYS) assert.match(addPref(old, `old ${old}`, file).error ?? '', CATEGORY_ERROR, old);
  assert.equal(fs.existsSync(file), false, 'nothing was written');
  const home = newHome();
  const r = cliIn(home)('--add', 'sorular', 'Give options');
  assert.notEqual(r.status, 0, 'the CLI refuses an old key');
  assert.equal(fs.existsSync(path.join(home, '.vibe-kit', 'preferences.md')), false, 'the CLI wrote nothing');
  fs.rmSync(home, { recursive: true, force: true });
});

test('AC-49.5 preferences: the old Turkish headings are not read; the file is never rewritten over them (no item is lost)', () => {
  const file = tmpFile();
  const text = ['# Kişisel tercihler', '',
    '## Konuşma', '', '- a', '',
    '## Sorular ve kararlar', '', '- b', '',
    '## Raporlar', '', '- c', '',
    '## Kod', '', '- d', '',
    '## Kaçınılacaklar', '', '- e', '',
    '## kod', '', '- f', '',
    '## Kacinilacaklar', '', '- g', '',
    '## Code', '', '- h', ''].join('\n');
  fs.writeFileSync(file, text);
  assert.deepEqual(readPrefs(file).map((p) => [p.category, p.text]), [['code', 'h']], 'only the English heading is read');
  assert.match(prefsNote(file), /Code: h/);
  assert.doesNotMatch(prefsNote(file), /Conversation: a|Avoid: e/, 'Turkish-heading items are not loaded');
  // Writing would drop the Turkish-heading items: add and remove refuse instead
  assert.match(addPref('conversation', 'Kısa yaz', file).error ?? '', /unreadable lines[\s\S]*Konuşma/);
  assert.match(String(removePref(1, file)), /unreadable lines/);
  assert.equal(fs.readFileSync(file, 'utf8'), text, 'the file is byte-identical');
});

test('AC-48.8 preferences: English headings are read whatever their case (Turkish I/ı folding)', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '## QUESTIONS AND DECISIONS\n\n- q\n\n## code\n\n- c\n\n## Avoid\n\n- a\n');
  assert.deepEqual(readPrefs(file).map((p) => [p.category, p.text]), [['questions', 'q'], ['code', 'c'], ['avoid', 'a']]);
});

test('A-48.4 preferences: an unknown category is an error listing the English keys; nothing is written', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pref-')), 'preferences.md');
  for (const bad of ['none', ...OLD_KEYS, 'Kod', 'KONUSMA', 'constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', '', undefined, null]) {
    const r = addPref(bad, 'x', file);
    assert.match(r.error ?? '', CATEGORY_ERROR, String(bad));
  }
  assert.equal(fs.existsSync(file), false, 'nothing was written');
});

test('AC-48.8 preferences: prefsNote names ~/.vibe-kit/preferences.md', () => {
  const file = tmpFile();
  addPref('avoid', 'No emoji', file);
  const note = prefsNote(file);
  assert.match(note, /~\/\.vibe-kit\/preferences\.md/);
  assert.doesNotMatch(note, /tercihler/);
  assert.match(note, /Avoid: No emoji/);
});

// An old file name with English headings: only the name decides whether it is read
const OLD_FILE_CONTENT = '## Conversation\n\n- Short answers\n\n## Avoid\n\n- No emoji\n';

test('AC-49.10 preferences: an old ~/.vibe-kit/tercihler.md alone is not read, not renamed and not changed', () => {
  const home = newHome();
  const vk = path.join(home, '.vibe-kit');
  fs.mkdirSync(vk);
  const old = Buffer.from(`﻿${OLD_FILE_CONTENT.replace(/\n/g, '\r\n')}`, 'utf8');
  fs.writeFileSync(path.join(vk, 'tercihler.md'), old);
  const r = inHome(home, 'console.log(m.prefsFile()); console.log(JSON.stringify(m.readPrefs())); console.log(JSON.stringify(m.prefsNote()));');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n'), [path.join(vk, 'preferences.md'), '[]', '""']);
  assert.deepEqual(fs.readFileSync(path.join(vk, 'tercihler.md')), old, 'tercihler.md is byte-identical');
  assert.equal(fs.existsSync(path.join(vk, 'preferences.md')), false, 'it is not renamed to preferences.md');
  const list = cliIn(home)('--list');
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /No saved preferences \(.*preferences\.md\)/);
  fs.rmSync(home, { recursive: true, force: true });
});

test('AC-49.10 preferences: the session start does not load an old tercihler.md', () => {
  const home = newHome();
  fs.mkdirSync(path.join(home, '.vibe-kit'));
  fs.writeFileSync(path.join(home, '.vibe-kit', 'tercihler.md'), OLD_FILE_CONTENT);
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'pref-project-'));
  const s = spawnSync(process.execPath, [path.join(HOOKS, 'session-start.mjs')], { input: '{}', encoding: 'utf8', env: { ...homeEnv(home), CLAUDE_PROJECT_DIR: project } });
  assert.equal(s.status, 0, s.stderr);
  assert.doesNotMatch(s.stdout, /Short answers|No emoji|style preferences/);
  assert.equal(fs.existsSync(path.join(home, '.vibe-kit', 'tercihler.md')), true, 'left where it is');
  for (const d of [home, project]) fs.rmSync(d, { recursive: true, force: true });
});

test('AC-49.10 preferences: --add next to an old tercihler.md writes preferences.md with the new item only; tercihler.md is untouched', () => {
  const home = newHome();
  const vk = path.join(home, '.vibe-kit');
  fs.mkdirSync(vk);
  fs.writeFileSync(path.join(vk, 'tercihler.md'), OLD_FILE_CONTENT);
  const r = cliIn(home)('--add', 'code', 'Tabs, not spaces');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Preference saved \(Code\)/);
  const written = fs.readFileSync(path.join(vk, 'preferences.md'), 'utf8');
  assert.match(written, /## Code\n\n- Tabs, not spaces\n/);
  assert.doesNotMatch(written, /Short answers|No emoji/, 'the old file\'s items are not carried over');
  assert.equal(fs.readFileSync(path.join(vk, 'tercihler.md'), 'utf8'), OLD_FILE_CONTENT);
  fs.rmSync(home, { recursive: true, force: true });
});

test('A-48.5 preferences: when both files exist preferences.md wins and tercihler.md is left untouched', () => {
  const home = newHome();
  const vk = path.join(home, '.vibe-kit');
  fs.mkdirSync(vk);
  const oldBytes = Buffer.from('## Konuşma\n\n- eski tercih\n', 'utf8');
  const newBytes = Buffer.from('## Code\n\n- new preference\n', 'utf8');
  fs.writeFileSync(path.join(vk, 'tercihler.md'), oldBytes);
  fs.writeFileSync(path.join(vk, 'preferences.md'), newBytes);
  const r = inHome(home, 'console.log(m.prefsFile()); console.log(JSON.stringify(m.readPrefs().map((p) => [p.category, p.text])));');
  assert.equal(r.status, 0, r.stderr);
  const [file, items] = r.stdout.trim().split('\n');
  assert.equal(file, path.join(vk, 'preferences.md'));
  assert.deepEqual(JSON.parse(items), [['code', 'new preference']]);
  assert.deepEqual(fs.readFileSync(path.join(vk, 'tercihler.md')), oldBytes, 'tercihler.md not changed');
  assert.deepEqual(fs.readFileSync(path.join(vk, 'preferences.md')), newBytes, 'preferences.md not changed by reading');
  // a write goes to preferences.md only
  assert.equal(cliIn(home)('--add', 'avoid', 'No emoji').status, 0);
  assert.deepEqual(fs.readFileSync(path.join(vk, 'tercihler.md')), oldBytes, 'tercihler.md still not changed');
  assert.match(fs.readFileSync(path.join(vk, 'preferences.md'), 'utf8'), /## Code\n\n- new preference\n\n## Avoid\n\n- No emoji\n/);
  fs.rmSync(home, { recursive: true, force: true });
});

test('A-48.6 preferences: with neither file, reading creates nothing', () => {
  const home = newHome();
  const r = inHome(home, 'console.log(m.prefsFile()); console.log(JSON.stringify(m.readPrefs())); console.log(JSON.stringify(m.prefsNote()));');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n'), [path.join(home, '.vibe-kit', 'preferences.md'), '[]', '""']);
  const list = cliIn(home)('--list');
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /No saved preferences \(.*preferences\.md\)/);
  assert.equal(fs.existsSync(path.join(home, '.vibe-kit')), false, 'no folder, no file');
  fs.rmSync(home, { recursive: true, force: true });
});
