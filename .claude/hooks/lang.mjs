#!/usr/bin/env node
// Conversation language of the project. /start and /adopt ask it first, /language changes it, /kit-update asks old projects once.
//   node .claude/hooks/lang.mjs --show                 current code (none: not chosen yet)
//   node .claude/hooks/lang.mjs --set <code>           BCP-47 code (tr, en, de, pt-BR); .kit.json → lang, before install .claude/state/lang.json
//   node .claude/hooks/lang.mjs --export [--missing]   English texts as JSON, to translate for a language other than tr/en
//   node .claude/hooks/lang.mjs --write < x.json        saves the translation to .claude/i18n/<code>.json (merged)
//   node .claude/hooks/lang.mjs --check                exit 1 and lists the keys still missing a translation
import fs from 'node:fs';
import path from 'node:path';
import { findRoot, isMain } from './shared.mjs';
import { MESSAGES } from './messages.mjs';

// The code becomes a file name: nothing that can leave .claude/i18n/
export const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const PLACEHOLDER = /\{(\w+)\}/g;

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
// Windows device names (nul.json is not a file) and over-long names cannot become a file either
const DEVICE = /^(con|prn|aux|nul|com\d|lpt\d)$/;
const validCode = (code) => typeof code === 'string' && code.length <= 35 && LANG_RE.test(code) && !DEVICE.test(code) ? code : null;
const kitFile = (root) => path.join(root, '.kit.json');
const stateFile = (root) => path.join(root, '.claude', 'state', 'lang.json');
const i18nFile = (root, lang) => path.join(root, '.claude', 'i18n', `${lang}.json`);
const placeholders = (s) => [...new Set([...s.matchAll(PLACEHOLDER)].map((m) => m[1]))].sort().join(',');

// null: not set up and not chosen yet (/start asks). Projects set up before languages existed were Turkish.
export function readLang(root = findRoot()) {
  const kit = readJson(kitFile(root));
  const chosen = validCode(kit?.lang) ?? validCode(readJson(stateFile(root))?.lang);
  if (chosen) return chosen;
  // same rule as status-read kitPending: a broken .kit.json counts as missing
  const notSetUp = kit ? kit.type === null : fs.existsSync(path.join(root, 'kit', 'kit.mjs'));
  return notSetUp ? null : 'tr';
}

export function setLang(root, code) {
  if (!validCode(code)) throw new Error(`Invalid language code: ${code}. Use a BCP-47 code such as tr, en, de, pt-BR.`);
  if (fs.existsSync(kitFile(root))) {
    const kit = readJson(kitFile(root));
    if (!kit || typeof kit !== 'object' || Array.isArray(kit)) throw new Error('.kit.json is not a valid JSON object: repair it first, then set the language.');
    fs.writeFileSync(kitFile(root), JSON.stringify({ ...kit, lang: code }, null, 2) + '\n');
    return kitFile(root);
  }
  fs.mkdirSync(path.dirname(stateFile(root)), { recursive: true });
  fs.writeFileSync(stateFile(root), JSON.stringify({ lang: code }) + '\n');
  return stateFile(root);
}

const translation = (root, lang) => {
  const j = readJson(i18nFile(root, lang));
  return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
};

export function t(root, key, vars = {}) {
  if (!Object.hasOwn(MESSAGES, key)) return key;
  const lang = readLang(root) ?? 'en';
  let text = MESSAGES[key][lang];
  if (text === undefined) {
    const own = translation(root, lang);
    text = Object.hasOwn(own, key) && typeof own[key] === 'string' ? own[key] : MESSAGES[key].en;
  }
  return text.replace(PLACEHOLDER, (m, name) => Object.hasOwn(vars, name) ? String(vars[name]) : m);
}

const needsTranslation = (lang) => lang !== null && lang !== 'tr' && lang !== 'en';

export function missingKeys(root = findRoot()) {
  const lang = readLang(root);
  if (!needsTranslation(lang)) return [];
  const own = translation(root, lang);
  return Object.keys(MESSAGES).filter((k) => !(Object.hasOwn(own, k) && typeof own[k] === 'string'));
}

export function writeTranslation(root, obj) {
  const lang = readLang(root);
  if (!needsTranslation(lang)) throw new Error(`No translation file for language ${lang ?? 'none'}: tr and en are built in.`);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.getPrototypeOf(obj) !== Object.prototype) throw new Error('Translation must be a JSON object { key: text }.');
  for (const [k, v] of Object.entries(obj)) {
    if (!Object.hasOwn(MESSAGES, k)) throw new Error(`Unknown key: ${k}`);
    if (typeof v !== 'string') throw new Error(`Not a text: ${k}`);
    if (placeholders(v) !== placeholders(MESSAGES[k].en)) throw new Error(`${k}: keep the placeholders exactly ({${placeholders(MESSAGES[k].en).split(',').join('}, {')}}).`);
  }
  const file = i18nFile(root, lang);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...translation(root, lang), ...obj }, null, 2) + '\n');
  return file;
}

if (isMain(import.meta.url)) {
  const root = findRoot();
  const [cmd, arg] = process.argv.slice(2);
  try {
    if (cmd === '--show') console.log(readLang(root) ?? 'none');
    else if (cmd === '--set') console.log(`Language: ${arg} → ${path.relative(root, setLang(root, arg))}`);
    else if (cmd === '--export') {
      const keys = arg === '--missing' ? missingKeys(root) : Object.keys(MESSAGES);
      console.log(JSON.stringify(Object.fromEntries(keys.map((k) => [k, MESSAGES[k].en])), null, 2));
    } else if (cmd === '--write') {
      let obj;
      try { obj = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { throw new Error('stdin is not valid JSON.'); }
      console.log(`Written: ${path.relative(root, writeTranslation(root, obj))}`);
    } else if (cmd === '--check') {
      const missing = missingKeys(root);
      if (missing.length) { console.log(missing.join('\n')); process.exit(1); }
      console.log('ok');
    } else {
      console.error('Usage: --show | --set <code> | --export [--missing] | --write < file.json | --check');
      process.exit(1);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
