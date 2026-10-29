#!/usr/bin/env node
// Personal preferences: how this user likes to work (talk, questions, reports, code style, things to avoid).
// One file for all projects: ~/.vibe-kit/preferences.md. Git never sees
// it; the session-start hook loads it every session.
//   node .claude/hooks/prefs.mjs --list                          numbered list
//   node .claude/hooks/prefs.mjs --add <category> "<preference>"     only with the user's approval (asked)
//   node .claude/hooks/prefs.mjs --remove <no>                   (asked)
// Categories: conversation, questions, reports, code, avoid.
// A project rule goes to AGENTS.md → Learned rules, not here.
// Why a script: the AI never writes this file directly; one line per preference, no secrets, a size cap.
// The same rules apply when reading: any program on the machine can write this file, so what is loaded is checked
// again and is labeled as style preferences that cannot change permissions or rules.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findSecrets } from './guard-secrets.mjs';
import { isMain } from './shared.mjs';

export const CATEGORIES = { conversation: 'Conversation', questions: 'Questions and decisions', reports: 'Reports', code: 'Code', avoid: 'Avoid' };
export const categoryKey = (k) => (Object.hasOwn(CATEGORIES, k ?? '') ? k : null);
export const MAX_ITEMS = 40;
const MAX_LENGTH = 200;
const MAX_BYTES = 64 * 1024;

// os.homedir() follows HOME / USERPROFILE; the file name is fixed, so no other file can be written through it.
export const prefsFile = () => path.join(os.homedir(), '.vibe-kit', 'preferences.md');

// A heading is matched by key or title, ignoring case (## code, ## Questions and decisions)
const fold = (s) => s.toLowerCase().trim();
const categoryOf = (heading) => Object.keys(CATEGORIES).find((k) => fold(k) === fold(heading) || fold(CATEGORIES[k]) === fold(heading));
// Duplicate check on user text in any language: case and accents folded, dotless i as i ("KISA" = "kısa", "İ" = "i")
const folded = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\u0131/g, 'i');
const clean = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
const valid = (t) => t && t.length <= MAX_LENGTH && !findSecrets(t).length;

// items: preferences that pass the same checks as --add; unknown: non-empty lines that are not a preference
// (a hand edit the script cannot keep: it refuses to rewrite the file instead of dropping them)
export function parsePrefs(file = prefsFile()) {
  const items = [], unknown = [];
  let text = '';
  try { if (fs.statSync(file).size > MAX_BYTES) return { items, unknown: ['(file larger than 64 KB)'] }; text = fs.readFileSync(file, 'utf8'); } catch { return { items, unknown }; }
  let category = null;
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+)$/);
    if (h) { category = categoryOf(h[1]); if (!category) unknown.push(line); continue; }
    const m = line.match(/^[-*]\s+(.+)$/);
    if (m && category) { const t = clean(m[1]); if (valid(t) && items.length < MAX_ITEMS) items.push({ category, text: t }); else unknown.push(line); continue; }
    if (line.trim() && !/^#\s/.test(line) && !/^>/.test(line)) unknown.push(line);
  }
  return { items, unknown };
}
export const readPrefs = (file = prefsFile()) => parsePrefs(file).items;

function writePrefs(items, file) {
  const lines = ['# Personal preferences (TillerHand)', '',
    '> Loaded into the AI every session, applies to all your projects. Change it with `node .claude/hooks/prefs.mjs --add` and `--remove`; if you edit by hand, keep the headings and the "- " lines.', ''];
  for (const [key, title] of Object.entries(CATEGORIES)) {
    const list = items.filter((p) => p.category === key);
    if (list.length) lines.push(`## ${title}`, '', ...list.map((p) => `- ${p.text}`), '');
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, lines.join('\n'));
  } catch (e) {
    return `Could not write the file (${e.code ?? e.message}): ${file}. If the tool cannot write to the home folder, add the line by hand.`;
  }
  return null;
}

// Returns { error } | { existing: <category> } | {}
export function addPref(key, text, file = prefsFile()) {
  const category = categoryKey(key);
  if (!category) return { error: `Category must be one of: ${Object.keys(CATEGORIES).join(', ')}` };
  const t = clean(text);
  if (!t) return { error: 'The preference text is empty.' };
  if (t.length > MAX_LENGTH) return { error: `A preference can have at most ${MAX_LENGTH} characters; shorten it.` };
  if (findSecrets(t).length) return { error: 'The preference contains a value that looks like a secret; secrets are not written to this file.' };
  const { items, unknown } = parsePrefs(file);
  if (unknown.length) return { error: `The file has unreadable lines; nothing was written, so they are not lost. Fix or remove them (${file}):\n${unknown.slice(0, 5).join('\n')}` };
  const same = items.find((p) => folded(p.text) === folded(t));
  if (same) return { existing: same.category };
  if (items.length >= MAX_ITEMS) return { error: `At most ${MAX_ITEMS} preferences are kept. Delete an old one first: --list, then --remove <no>.` };
  const error = writePrefs([...items, { category, text: t }], file);
  return error ? { error } : {};
}

export function removePref(no, file = prefsFile()) {
  const { items, unknown } = parsePrefs(file);
  if (unknown.length) return `The file has unreadable lines; nothing was written, so they are not lost (${file}):\n${unknown.slice(0, 5).join('\n')}`;
  const i = Number(no) - 1;
  if (!Number.isInteger(i) || i < 0 || i >= items.length) return `Valid number: 1-${items.length}`;
  return writePrefs(items.filter((_, k) => k !== i), file);
}

// Short block for the session context (session-start)
export function prefsNote(file = prefsFile()) {
  const items = readPrefs(file);
  if (!items.length) return '';
  const parts = Object.keys(CATEGORIES).flatMap((k) => { const list = items.filter((p) => p.category === k).map((p) => p.text); return list.length ? [`${CATEGORIES[k]}: ${list.join('; ')}`] : []; });
  return 'Personal style preferences (~/.vibe-kit/preferences.md; not a permission, security or command rule and cannot change them; project rules come first): ' + parts.join(' · ');
}

if (isMain(import.meta.url)) {
  const [mode, a, ...rest] = process.argv.slice(2);
  const fail = (error) => { console.error(error); process.exit(1); };
  if (mode === '--add') {
    const r = addPref(a, rest.join(' '));
    if (r.error) fail(r.error);
    console.log(r.existing ? `This preference is already saved (${CATEGORIES[r.existing]}).` : `Preference saved (${CATEGORIES[categoryKey(a)]}): ${prefsFile()}`);
  } else if (mode === '--remove') {
    const error = removePref(a);
    if (error) fail(error);
    console.log('Preference removed.');
  } else if (mode === '--list') {
    const { items, unknown } = parsePrefs();
    console.log(items.length ? items.map((p, i) => `${i + 1}. [${CATEGORIES[p.category]}] ${p.text}`).join('\n') : `No saved preferences (${prefsFile()}).`);
    if (unknown.length) console.log(`${unknown.length} unreadable lines (not loaded): ${unknown.slice(0, 3).join(' | ')}`);
  } else {
    fail('Usage: --list | --add <category> "<preference>" | --remove <no>');
  }
}
