// Run: node --test "kit/tests/*.test.mjs"
// Personal preferences (3.30.0): one file for all projects, written only through the asked script, loaded every session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { addPref, removePref, readPrefs, prefsNote, MAX_ITEMS } from '../../.claude/hooks/prefs.mjs';
import { permissionEquivalent } from '../../.claude/hooks/destructive-guard.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');
const SECRET = 'sk_' + 'live_' + 'c'.repeat(24); // split up so this file does not trip the secret scan
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tercih-')), 'tercihler.md');

test('preferences: add, de-duplicate, list by category, remove; bad input is refused', () => {
  const file = tmpFile();
  assert.deepEqual(addPref('raporlar', 'Raporu kısa tut, önce sonucu yaz', file), {});
  assert.deepEqual(addPref('konusma', 'Türkçe\nyaz', file), {}, 'a line break becomes a space');
  assert.deepEqual(addPref('kod', 'raporu KISA tut, önce sonucu yaz', file), { existing: 'raporlar' }, 'the same text is reported where it already is');
  assert.deepEqual(readPrefs(file).map((p) => [p.category, p.text]), [['konusma', 'Türkçe yaz'], ['raporlar', 'Raporu kısa tut, önce sonucu yaz']]);
  assert.match(fs.readFileSync(file, 'utf8'), /## Konuşma\n\n- Türkçe yaz\n\n## Raporlar/);
  for (const bad of ['yok', 'constructor', 'toString', '__proto__']) assert.match(addPref(bad, 'x', file).error, /Kategori/, bad);
  assert.match(addPref('kod', '', file).error, /boş/);
  assert.match(addPref('kod', 'x'.repeat(201), file).error, /200/);
  assert.match(addPref('kod', `anahtar ${SECRET} kullan`, file).error, /sır/);
  assert.match(prefsNote(file), /üslup tercihleri.*değiştiremez.*Konuşma: Türkçe yaz · Raporlar: Raporu kısa tut/);
  assert.equal(removePref(1, file), null);
  assert.deepEqual(readPrefs(file).map((p) => p.text), ['Raporu kısa tut, önce sonucu yaz']);
  assert.match(removePref(5, file), /Geçerli numara/);
  for (let i = readPrefs(file).length; i < MAX_ITEMS; i++) addPref('kod', `tercih ${i}`, file);
  assert.match(addPref('kod', 'bir tane daha', file).error, /En fazla/);
});

test('preferences: a hand edit is kept or refused, never dropped; what is loaded passes the same checks', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '# x\n\n## kod\n\n* Sekme değil boşluk\n\n## Kacinilacaklar\n\n- Emoji kullanma\n');
  assert.deepEqual(readPrefs(file).map((p) => [p.category, p.text]), [['kod', 'Sekme değil boşluk'], ['kacin', 'Emoji kullanma']], 'case and Turkish letters in headings');
  fs.appendFileSync(file, '\n## Notlarım\n\nserbest metin\n');
  assert.match(addPref('kod', 'yeni', file).error, /okunamayan satırlar[\s\S]*Notlarım/);
  assert.match(fs.readFileSync(file, 'utf8'), /serbest metin/, 'the file was not rewritten');
  // Written by anything on the machine: too long, a secret or a control character is not loaded
  fs.writeFileSync(file, `## Kod\n\n- ${'y'.repeat(5000)}\n- anahtar ${SECRET}\n- iyi\u001b[2K satır\n`);
  assert.deepEqual(readPrefs(file).map((p) => p.text), ['iyi [2K satır']);
  assert.ok(prefsNote(file).length < 300);
  fs.writeFileSync(file, 'x'.repeat(70 * 1024));
  assert.deepEqual(readPrefs(file), [], 'a file over 64 KB is not read');
});

test('preferences: the CLI writes under the home folder only, the session start loads them, changing them is asked', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const cli = (...a) => spawnSync(process.execPath, [path.join(HOOKS, 'prefs.mjs'), ...a], { encoding: 'utf8', env });
  assert.equal(cli('--add', 'sorular', 'Seçenekleri', 'kısa', 'yaz').status, 0);
  assert.ok(fs.existsSync(path.join(home, '.vibe-kit', 'tercihler.md')));
  assert.match(cli('--add', 'kod', 'Seçenekleri kısa yaz').stdout, /zaten kayıtlı \(Sorular ve kararlar\)/);
  assert.match(cli('--list').stdout, /1\. \[Sorular ve kararlar\] Seçenekleri kısa yaz/);
  assert.equal(cli('--add', 'kod', `${SECRET}`).status, 1);
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'proje-'));
  const s = spawnSync(process.execPath, [path.join(HOOKS, 'session-start.mjs')], { input: '{}', encoding: 'utf8', env: { ...env, CLAUDE_PROJECT_DIR: project } });
  assert.match(s.stdout, /üslup tercihleri[^"]*Seçenekleri kısa yaz/);
  assert.equal(cli('--remove', '1').status, 0);
  assert.equal(permissionEquivalent('node .claude/hooks/prefs.mjs --add kod "x"')?.decision, 'ask', 'Codex/Antigravity');
  assert.equal(permissionEquivalent('node .claude/hooks/prefs.mjs --list'), null);
  const settings = JSON.parse(fs.readFileSync(path.join(HOOKS, '..', 'settings.json'), 'utf8'));
  assert.ok(settings.permissions.ask.includes('Bash(node .claude/hooks/prefs.mjs --add:*)') && settings.permissions.allow.includes('Bash(node .claude/hooks/prefs.mjs --list)'));
  for (const d of [home, project]) fs.rmSync(d, { recursive: true, force: true });
});
