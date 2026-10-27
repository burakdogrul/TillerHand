#!/usr/bin/env node
// Model and effort per role (docs/workflow/models.md). /build, /start, /adopt and /release ask the user, then save the answer here.
//   node .claude/hooks/models.mjs --show                    current choice (the recommended one if nothing is saved)
//   node .claude/hooks/models.mjs --set plan=opus:high code=sonnet:high test=opus:high review=sonnet:high docs=haiku:high
// A role left out of --set keeps its current value. File: .claude/state/models.json (git-ignored, this project only).
// Aliases, not model IDs: in Claude Code opus/sonnet/haiku/fable always point to the newest model of that family.
import fs from 'node:fs';
import path from 'node:path';
import { findRoot, isMain } from './shared.mjs';

export const ROLES = { plan: 'Planlama ve mimari', code: 'Kod yazma', test: 'Test yazma', review: 'İnceleme ve denetim', docs: 'Doküman ve araştırma' };
// test differs from code on purpose: another model does not share the coder's blind spots (AGENTS.md rule 7)
export const RECOMMENDED = { plan: 'opus:high', code: 'sonnet:high', test: 'opus:high', review: 'sonnet:high', docs: 'haiku:high' };
export const MODELS = ['opus', 'sonnet', 'haiku', 'fable'];
export const EFFORTS = ['low', 'medium', 'high', 'xhigh'];

export const modelsFile = (root = findRoot()) => path.join(root, '.claude', 'state', 'models.json');

const valid = (role, value) => {
  const [model, effort, extra] = String(value).split(':');
  return Object.hasOwn(ROLES, role ?? '') && MODELS.includes(model) && EFFORTS.includes(effort) && extra === undefined;
};

// Saved choice over the recommended one; a value that does not pass the check (hand edit) falls back to the recommended
export function readModels(file = modelsFile()) {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none yet */ }
  return Object.fromEntries(Object.keys(ROLES).map((r) => [r, valid(r, saved?.[r]) ? saved[r] : RECOMMENDED[r]]));
}

// pairs: ['code=sonnet:medium', ...]. Returns an error text or null.
export function setModels(pairs, file = modelsFile()) {
  if (!pairs.length) return `Kullanım: --set ${Object.entries(RECOMMENDED).map(([r, v]) => `${r}=${v}`).join(' ')}`;
  const next = readModels(file);
  for (const pair of pairs) {
    const [role, value, extra] = pair.toLowerCase().split('=');
    if (extra !== undefined || !valid(role, value)) return `Geçersiz: "${pair}". Rol: ${Object.keys(ROLES).join(', ')} · model: ${MODELS.join(', ')} · effort: ${EFFORTS.join(', ')} (örnek code=sonnet:medium)`;
    next[role] = value;
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  } catch (e) {
    return `Dosya yazılamadı (${e.code ?? e.message}): ${file}`;
  }
  return null;
}

// '' when a saved choice is in use; otherwise why the recommended values are shown
export function modelsNote(file = modelsFile()) {
  if (!fs.existsSync(file)) return 'kayıt yok: önerilenler';
  try { JSON.parse(fs.readFileSync(file, 'utf8')); return ''; } catch { return 'kayıt okunamadı: önerilenler; --set ile yeniden yaz'; }
}

export const showModels = (file = modelsFile()) => {
  const m = readModels(file);
  const note = modelsNote(file);
  return Object.keys(ROLES).map((r) => `${r}: ${m[r].replace(':', ' / ')} (${ROLES[r]})${m[r] === RECOMMENDED[r] ? '' : ` · önerilen ${RECOMMENDED[r].replace(':', ' / ')}`}`).join('\n')
    + (note ? `\n(${note})` : '')
    + (m.code.split(':')[0] === m.test.split(':')[0] ? '\nUyarı: kod ve test rolü aynı model; farklı model önerilir (aynı model aynı kör noktayı paylaşır).' : '');
};

if (isMain(import.meta.url)) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === '--set') {
    const error = setModels(rest);
    if (error) { console.error(error); process.exit(1); }
    console.log(showModels());
  } else if (mode === '--show') {
    console.log(showModels());
  } else {
    console.error('Kullanım: --show | --set plan=<model>:<effort> code=… test=… review=… docs=…');
    process.exit(1);
  }
}
