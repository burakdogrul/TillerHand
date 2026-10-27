#!/usr/bin/env node
// Model and effort per role (docs/workflow/models.md). /build, /start, /adopt and /release ask the user, then save the answer here.
//   node .claude/hooks/models.mjs --show                    current choice (the recommended one if nothing is saved)
//   node .claude/hooks/models.mjs --set plan=opus:high code=sonnet:high test=opus:high review=sonnet:high docs=haiku:high
// A role left out of --set keeps its current value. File: .claude/state/models.json (git-ignored, this project only).
// Aliases, not model IDs: in Claude Code opus/sonnet/haiku/fable always point to the newest model of that family.
import fs from 'node:fs';
import path from 'node:path';
import { findRoot, isMain } from './shared.mjs';
import { t } from './lang.mjs';

export const ROLES = { plan: 'Planning and architecture', code: 'Writing code', test: 'Writing tests', review: 'Review and audit', docs: 'Documents and research' };
// Role name in the project language, for text the user sees (the dashboard)
export const roleLabel = (root, role) => t(root, `models.role.${role}`);
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
  if (!pairs.length) return `Usage: --set ${Object.entries(RECOMMENDED).map(([r, v]) => `${r}=${v}`).join(' ')}`;
  const next = readModels(file);
  for (const pair of pairs) {
    const [role, value, extra] = pair.toLowerCase().split('=');
    if (extra !== undefined || !valid(role, value)) return `Invalid: "${pair}". Role: ${Object.keys(ROLES).join(', ')} · model: ${MODELS.join(', ')} · effort: ${EFFORTS.join(', ')} (example code=sonnet:medium)`;
    next[role] = value;
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  } catch (e) {
    return `Could not write the file (${e.code ?? e.message}): ${file}`;
  }
  return null;
}

// '' when a saved choice is in use; otherwise why the recommended values are shown (the dashboard shows it, so project language)
export function modelsNote(file = modelsFile(), root = findRoot()) {
  if (!fs.existsSync(file)) return t(root, 'models.noRecord');
  try { JSON.parse(fs.readFileSync(file, 'utf8')); return ''; } catch { return t(root, 'models.unreadable'); }
}

export const showModels = (file = modelsFile()) => {
  const m = readModels(file);
  const note = modelsNote(file);
  return Object.keys(ROLES).map((r) => `${r}: ${m[r].replace(':', ' / ')} (${ROLES[r]})${m[r] === RECOMMENDED[r] ? '' : ` · recommended ${RECOMMENDED[r].replace(':', ' / ')}`}`).join('\n')
    + (note ? `\n(${note})` : '')
    + (m.code.split(':')[0] === m.test.split(':')[0] ? '\nWarning: the code and test roles use the same model; a different model is recommended (the same model shares the same blind spots).' : '');
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
    console.error('Usage: --show | --set plan=<model>:<effort> code=… test=… review=… docs=…');
    process.exit(1);
  }
}
