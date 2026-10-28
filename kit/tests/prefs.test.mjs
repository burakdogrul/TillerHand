// Run: node --test "kit/tests/*.test.mjs"
// Personal preferences (3.30.0): one file for all projects, written only through the asked script, loaded every session.
// 3.48.0: the file is ~/.vibe-kit/preferences.md (the old tercihler.md is renamed once), categories are English;
// old Turkish keys and headings are still read.
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
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tercih-')), 'tercihler.md');
const headings = (file) => fs.readFileSync(file, 'utf8').match(/^## .*$/gm) ?? [];
const ENGLISH_HEADINGS = ['## Conversation', '## Questions and decisions', '## Reports', '## Code', '## Avoid'];
const KEYS = ['conversation', 'questions', 'reports', 'code', 'avoid'];
const OLD_KEYS = { konusma: 'conversation', sorular: 'questions', raporlar: 'reports', kod: 'code', kacin: 'avoid' };

// Every home-folder test runs in a child process with HOME/USERPROFILE on a temporary folder: never the developer's ~/.vibe-kit.
const newHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
const homeEnv = (home) => ({ ...process.env, HOME: home, USERPROFILE: home });
const inHome = (home, code) => spawnSync(process.execPath, ['--input-type=module', '-e',
  `import * as m from ${JSON.stringify(pathToFileURL(path.join(HOOKS, 'prefs.mjs')).href)};\n${code}`], { encoding: 'utf8', env: homeEnv(home) });
const cliIn = (home) => (...a) => spawnSync(process.execPath, [path.join(HOOKS, 'prefs.mjs'), ...a], { encoding: 'utf8', env: homeEnv(home) });

test('preferences: add, de-duplicate, list by category, remove; bad input is refused', () => {
  const file = tmpFile();
  assert.deepEqual(addPref('raporlar', 'Raporu kısa tut, önce sonucu yaz', file), {});
  assert.deepEqual(addPref('konusma', 'Türkçe\nyaz', file), {}, 'a line break becomes a space');
  assert.deepEqual(addPref('kod', 'raporu KISA tut, önce sonucu yaz', file), { existing: 'reports' }, 'the same text is reported where it already is');
  assert.deepEqual(readPrefs(file).map((p) => [p.category, p.text]), [['conversation', 'Türkçe yaz'], ['reports', 'Raporu kısa tut, önce sonucu yaz']]);
  assert.match(fs.readFileSync(file, 'utf8'), /## Conversation\n\n- Türkçe yaz\n\n## Reports/);
  for (const bad of ['yok', 'constructor', 'toString', '__proto__']) assert.match(addPref(bad, 'x', file).error, /Category must be one of/, bad);
  assert.match(addPref('kod', '', file).error, /empty/);
  assert.match(addPref('kod', 'x'.repeat(201), file).error, /200/);
  assert.match(addPref('kod', `anahtar ${SECRET} kullan`, file).error, /looks like a secret/);
  assert.match(prefsNote(file), /style preferences.*cannot change them.*Conversation: Türkçe yaz · Reports: Raporu kısa tut/);
  assert.equal(removePref(1, file), null);
  assert.deepEqual(readPrefs(file).map((p) => p.text), ['Raporu kısa tut, önce sonucu yaz']);
  assert.match(removePref(5, file), /Valid number/);
  for (let i = readPrefs(file).length; i < MAX_ITEMS; i++) addPref('kod', `tercih ${i}`, file);
  assert.match(addPref('kod', 'bir tane daha', file).error, /At most/);
});

test('preferences: a hand edit is kept or refused, never dropped; what is loaded passes the same checks', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '# x\n\n## kod\n\n* Sekme değil boşluk\n\n## Kacinilacaklar\n\n- Emoji kullanma\n');
  assert.deepEqual(readPrefs(file).map((p) => [p.category, p.text]), [['code', 'Sekme değil boşluk'], ['avoid', 'Emoji kullanma']], 'case and Turkish letters in headings');
  fs.appendFileSync(file, '\n## Notlarım\n\nserbest metin\n');
  assert.match(addPref('kod', 'yeni', file).error, /unreadable lines[\s\S]*Notlarım/);
  assert.match(fs.readFileSync(file, 'utf8'), /serbest metin/, 'the file was not rewritten');
  // Written by anything on the machine: too long, a secret or a control character is not loaded
  fs.writeFileSync(file, `## Kod\n\n- ${'y'.repeat(5000)}\n- anahtar ${SECRET}\n- iyi\u001b[2K satır\n`);
  assert.deepEqual(readPrefs(file).map((p) => p.text), ['iyi [2K satır']);
  assert.ok(prefsNote(file).length < 300);
  fs.writeFileSync(file, 'x'.repeat(70 * 1024));
  assert.deepEqual(readPrefs(file), [], 'a file over 64 KB is not read');
});

test('preferences: the CLI writes under the home folder only, the session start loads them, changing them is asked', () => {
  const home = newHome();
  const cli = cliIn(home);
  assert.equal(cli('--add', 'sorular', 'Seçenekleri', 'kısa', 'yaz').status, 0);
  assert.ok(fs.existsSync(path.join(home, '.vibe-kit', 'preferences.md')));
  assert.equal(fs.existsSync(path.join(home, '.vibe-kit', 'tercihler.md')), false, 'the old name is not written');
  assert.match(cli('--add', 'kod', 'Seçenekleri kısa yaz').stdout, /already saved \(Questions and decisions\)/);
  assert.match(cli('--list').stdout, /1\. \[Questions and decisions\] Seçenekleri kısa yaz/);
  assert.equal(cli('--add', 'kod', `${SECRET}`).status, 1);
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'proje-'));
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

test('AC-48.8 preferences: the old Turkish keys are still accepted and stored under the English category', () => {
  const file = tmpFile();
  for (const [old, key] of Object.entries(OLD_KEYS)) assert.deepEqual(addPref(old, `eski ${old}`, file), {}, `${old} → ${key}`);
  assert.deepEqual(readPrefs(file).map((p) => [p.category, p.text]), Object.entries(OLD_KEYS).map(([old, key]) => [key, `eski ${old}`]));
  assert.deepEqual(headings(file), ENGLISH_HEADINGS);
  assert.deepEqual(addPref('code', 'ESKİ KOD'.toLocaleLowerCase('tr'), file), { existing: 'code' }, 'a duplicate across old and new keys is found');
});

test('AC-48.8 preferences: a file with the old Turkish headings is read; a rewrite turns them into English headings', () => {
  const file = tmpFile();
  fs.writeFileSync(file, [
    '# Kişisel tercihler', '',
    '## Konuşma', '', '- a', '',
    '## Sorular ve kararlar', '', '- b', '',
    '## Raporlar', '', '- c', '',
    '## Kod', '', '- d', '',
    '## Kaçınılacaklar', '', '- e', '',
    '## kod', '', '- f', '',
    '## Kacinilacaklar', '', '- g', '',
  ].join('\n'));
  const want = [['conversation', 'a'], ['questions', 'b'], ['reports', 'c'], ['code', 'd'], ['avoid', 'e'], ['code', 'f'], ['avoid', 'g']];
  assert.deepEqual(readPrefs(file).map((p) => [p.category, p.text]), want);
  assert.equal(removePref(1, file), null);
  assert.deepEqual(readPrefs(file).map((p) => p.category).sort(), want.slice(1).map(([c]) => c).sort(), 'nothing lost on rewrite');
  assert.deepEqual(headings(file), ['## Questions and decisions', '## Reports', '## Code', '## Avoid']);
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /Konuşma|Sorular ve kararlar|Raporlar|## Kod|Kaçınılacaklar|Kacinilacaklar/);
  // add rewrites the same way
  const file2 = tmpFile();
  fs.writeFileSync(file2, '## Kaçınılacaklar\n\n- Emoji kullanma\n');
  assert.deepEqual(addPref('conversation', 'Kısa yaz', file2), {});
  assert.match(fs.readFileSync(file2, 'utf8'), /## Conversation\n\n- Kısa yaz\n\n## Avoid\n\n- Emoji kullanma\n/);
});

test('AC-48.8 preferences: English headings are read whatever their case (Turkish I/ı folding)', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '## QUESTIONS AND DECISIONS\n\n- q\n\n## code\n\n- c\n\n## Avoid\n\n- a\n');
  assert.deepEqual(readPrefs(file).map((p) => [p.category, p.text]), [['questions', 'q'], ['code', 'c'], ['avoid', 'a']]);
});

test('A-48.4 preferences: an unknown category is an error listing the English keys; nothing is written', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pref-')), 'preferences.md');
  for (const bad of ['yok', 'constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', '', undefined, null]) {
    const r = addPref(bad, 'x', file);
    assert.match(r.error ?? '', /^Category must be one of: conversation, questions, reports, code, avoid$/, String(bad));
  }
  assert.equal(fs.existsSync(file), false, 'nothing was written');
});

test('AC-48.8 preferences: prefsNote names ~/.vibe-kit/preferences.md', () => {
  const file = tmpFile();
  addPref('kacin', 'Emoji kullanma', file);
  const note = prefsNote(file);
  assert.match(note, /~\/\.vibe-kit\/preferences\.md/);
  assert.doesNotMatch(note, /tercihler/);
  assert.match(note, /Avoid: Emoji kullanma/);
});

test('AC-48.8 preferences: prefsFile() is ~/.vibe-kit/preferences.md; an old tercihler.md is renamed byte-for-byte on first use', () => {
  const home = newHome();
  const vk = path.join(home, '.vibe-kit');
  fs.mkdirSync(path.join(vk, 'gate-approval'), { recursive: true });
  fs.writeFileSync(path.join(vk, 'gate-approval', 'x.json'), '{"a":1}');
  const old = Buffer.from('﻿# Kişisel tercihler\r\n\r\n## Konuşma\r\n\r\n- Türkçe yaz; İ, ı, I, i aynen kalır\r\n', 'utf8');
  fs.writeFileSync(path.join(vk, 'tercihler.md'), old);
  const r = inHome(home, 'console.log(m.prefsFile());');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), path.join(vk, 'preferences.md'));
  assert.deepEqual(fs.readFileSync(path.join(vk, 'preferences.md')), old, 'content byte-identical');
  assert.equal(fs.existsSync(path.join(vk, 'tercihler.md')), false, 'the old name is gone');
  assert.equal(fs.readFileSync(path.join(vk, 'gate-approval', 'x.json'), 'utf8'), '{"a":1}', 'other files in ~/.vibe-kit untouched');
  // a second use changes nothing
  assert.equal(inHome(home, 'console.log(m.prefsFile());').stdout.trim(), path.join(vk, 'preferences.md'));
  assert.deepEqual(fs.readFileSync(path.join(vk, 'preferences.md')), old);
  fs.rmSync(home, { recursive: true, force: true });
});

test('AC-48.8 preferences: an old tercihler.md is read through the default path (readPrefs, --list, session start)', () => {
  const content = '## Konuşma\n\n- Türkçe yaz\n\n## Kaçınılacaklar\n\n- Emoji kullanma\n';
  // readPrefs() with no argument
  let home = newHome();
  fs.mkdirSync(path.join(home, '.vibe-kit'));
  fs.writeFileSync(path.join(home, '.vibe-kit', 'tercihler.md'), content);
  const r = inHome(home, 'console.log(JSON.stringify(m.readPrefs().map((p) => [p.category, p.text])));');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [['conversation', 'Türkçe yaz'], ['avoid', 'Emoji kullanma']]);
  assert.equal(fs.readFileSync(path.join(home, '.vibe-kit', 'preferences.md'), 'utf8'), content);
  fs.rmSync(home, { recursive: true, force: true });
  // --list
  home = newHome();
  fs.mkdirSync(path.join(home, '.vibe-kit'));
  fs.writeFileSync(path.join(home, '.vibe-kit', 'tercihler.md'), content);
  const list = cliIn(home)('--list');
  assert.equal(list.status, 0, list.stderr);
  assert.equal(list.stdout.trim(), '1. [Conversation] Türkçe yaz\n2. [Avoid] Emoji kullanma');
  assert.equal(fs.existsSync(path.join(home, '.vibe-kit', 'tercihler.md')), false);
  fs.rmSync(home, { recursive: true, force: true });
  // session start (the upgrade path a 3.47 user hits first)
  home = newHome();
  fs.mkdirSync(path.join(home, '.vibe-kit'));
  fs.writeFileSync(path.join(home, '.vibe-kit', 'tercihler.md'), content);
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'proje-'));
  const s = spawnSync(process.execPath, [path.join(HOOKS, 'session-start.mjs')], { input: '{}', encoding: 'utf8', env: { ...homeEnv(home), CLAUDE_PROJECT_DIR: project } });
  assert.match(s.stdout, /~\/\.vibe-kit\/preferences\.md[^"]*Conversation: Türkçe yaz · Avoid: Emoji kullanma/);
  assert.ok(fs.existsSync(path.join(home, '.vibe-kit', 'preferences.md')));
  assert.equal(fs.existsSync(path.join(home, '.vibe-kit', 'tercihler.md')), false);
  for (const d of [home, project]) fs.rmSync(d, { recursive: true, force: true });
});

test('AC-48.8 preferences: --add on an old tercihler.md keeps its items and writes preferences.md with English headings', () => {
  const home = newHome();
  const vk = path.join(home, '.vibe-kit');
  fs.mkdirSync(vk);
  fs.writeFileSync(path.join(vk, 'tercihler.md'), '## Kaçınılacaklar\n\n- Emoji kullanma\n');
  const r = cliIn(home)('--add', 'conversation', 'Kısa yaz');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Preference saved \(Conversation\)/);
  assert.match(r.stdout, /preferences\.md/);
  assert.match(fs.readFileSync(path.join(vk, 'preferences.md'), 'utf8'), /## Conversation\n\n- Kısa yaz\n\n## Avoid\n\n- Emoji kullanma\n/);
  assert.equal(fs.existsSync(path.join(vk, 'tercihler.md')), false);
  // an old key on the CLI names the English category
  assert.match(cliIn(home)('--add', 'sorular', 'Seçenek ver').stdout, /Preference saved \(Questions and decisions\)/);
  fs.rmSync(home, { recursive: true, force: true });
});

test('A-48.5 preferences: when both files exist preferences.md wins and tercihler.md is left untouched', () => {
  const home = newHome();
  const vk = path.join(home, '.vibe-kit');
  fs.mkdirSync(vk);
  const oldBytes = Buffer.from('## Konuşma\n\n- eski tercih\n', 'utf8');
  const newBytes = Buffer.from('## Code\n\n- yeni tercih\n', 'utf8');
  fs.writeFileSync(path.join(vk, 'tercihler.md'), oldBytes);
  fs.writeFileSync(path.join(vk, 'preferences.md'), newBytes);
  const r = inHome(home, 'console.log(m.prefsFile()); console.log(JSON.stringify(m.readPrefs().map((p) => [p.category, p.text])));');
  assert.equal(r.status, 0, r.stderr);
  const [file, items] = r.stdout.trim().split('\n');
  assert.equal(file, path.join(vk, 'preferences.md'));
  assert.deepEqual(JSON.parse(items), [['code', 'yeni tercih']]);
  assert.deepEqual(fs.readFileSync(path.join(vk, 'tercihler.md')), oldBytes, 'tercihler.md not changed');
  assert.deepEqual(fs.readFileSync(path.join(vk, 'preferences.md')), newBytes, 'preferences.md not changed by reading');
  // a write goes to preferences.md only
  assert.equal(cliIn(home)('--add', 'avoid', 'Emoji kullanma').status, 0);
  assert.deepEqual(fs.readFileSync(path.join(vk, 'tercihler.md')), oldBytes, 'tercihler.md still not changed');
  assert.match(fs.readFileSync(path.join(vk, 'preferences.md'), 'utf8'), /## Code\n\n- yeni tercih\n\n## Avoid\n\n- Emoji kullanma\n/);
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
