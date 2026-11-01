#!/usr/bin/env node
// Model and effort per role (docs/workflow/models.md). /build, /start, /adopt and /release ask the user, then save the answer here.
//   node .claude/hooks/models.mjs --show                    current choice (the recommended one if nothing is saved)
//   node .claude/hooks/models.mjs --set plan=opus:high code=sonnet:high test=opus:high review=sonnet:high docs=haiku:high
// A role left out of --set keeps its current value. File: .claude/state/models.json (git-ignored, this project only).
// Aliases, not model IDs: in Claude Code opus/sonnet/haiku/fable always point to the newest model of that family.
// External model for a role: code=openrouter/deepseek/deepseek-v4.1-flash-1017:high (runs through run-role.mjs). Run these in your own terminal:
//   node .claude/hooks/models.mjs --set-key <provider>      asks for the key, hidden       --remove-key <provider>      --set-limit <provider> <usd per day>
import fs from 'node:fs';
import path from 'node:path';
import { findRoot, isMain } from './shared.mjs';
import { t } from './lang.mjs';
import { PROVIDERS, EXTERNAL_ROLES, EFFORTS, parseExternal, isProvider, resolveKey, setKey, removeKey, setLimit } from './providers.mjs';

export { EFFORTS };

export const ROLES = { plan: 'Planning and architecture', code: 'Writing code', test: 'Writing tests', review: 'Review and audit', docs: 'Documents and research' };
// Role name in the project language, for text the user sees (the dashboard)
export const roleLabel = (root, role) => t(root, `models.role.${role}`);
// test differs from code on purpose: another model does not share the coder's blind spots (AGENTS.md rule 7)
export const RECOMMENDED = { plan: 'opus:high', code: 'sonnet:high', test: 'opus:high', review: 'sonnet:high', docs: 'haiku:high' };
export const MODELS = ['opus', 'sonnet', 'haiku', 'fable'];

export const modelsFile = (root = findRoot()) => path.join(root, '.claude', 'state', 'models.json');

function validExternal(role, value) {
  const choice = parseExternal(value);
  return Boolean(choice) && EXTERNAL_ROLES.includes(role) && resolveKey(choice.provider) !== null;
}

const valid = (role, value) => {
  const [model, effort, extra] = String(value).split(':');
  return Object.hasOwn(ROLES, role ?? '') && ((MODELS.includes(model) && EFFORTS.includes(effort) && extra === undefined) || validExternal(role, value));
};
const pretty = (value) => { const i = value.lastIndexOf(':'); return `${value.slice(0, i)} / ${value.slice(i + 1)}`; };

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
    const [rawRole, rawValue, extra] = pair.split('=');
    const role = rawRole.toLowerCase();
    // A model id keeps its case; an alias is lower case
    const value = rawValue?.includes('/') ? rawValue : rawValue?.toLowerCase();
    if (extra !== undefined || !valid(role, value)) return `Invalid: "${pair}". Role: ${Object.keys(ROLES).join(', ')} · model: ${MODELS.join(', ')} · effort: ${EFFORTS.join(', ')} (example code=sonnet:medium). External: ${EXTERNAL_ROLES.join(', ')} only, as provider/model:effort, and the provider needs a key.`;
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
  return Object.keys(ROLES).map((r) => `${r}: ${pretty(m[r])} (${ROLES[r]})${m[r] === RECOMMENDED[r] ? '' : ` · recommended ${pretty(RECOMMENDED[r])}`}`).join('\n')
    + (note ? `\n(${note})` : '')
    + (m.code.split(':')[0] === m.test.split(':')[0] ? '\nWarning: the code and test roles use the same model; a different model is recommended (the same model shares the same blind spots).' : '');
};

// Only a person at a terminal can enter a key: without a TTY (the AI's shell) nothing is read and nothing is saved
function readHidden(prompt) {
  return new Promise((resolve) => {
    let value = '';
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      for (const ch of chunk) {
        if (ch === '\u0003') { process.stdin.setRawMode(false); process.stdout.write('\n'); process.exit(1); }
        if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); resolve(value); return; }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    });
  });
}

async function setKeyFromTerminal(provider) {
  if (!process.stdin.isTTY) { console.error('Run this in your own terminal: it asks for the key. The AI cannot enter a key.'); process.exit(1); }
  if (!isProvider(provider)) { console.error(`Provider: ${Object.keys(PROVIDERS).join(', ')}`); process.exit(1); }
  const error = setKey(provider, (await readHidden(`${provider} key (hidden): `)).trim());
  if (error) { console.error(error); process.exit(1); }
  console.log(`${provider} key saved. Remove it with: node .claude/hooks/models.mjs --remove-key ${provider}`);
}

if (isMain(import.meta.url)) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === '--set') {
    const error = setModels(rest);
    if (error) { console.error(error); process.exit(1); }
    console.log(showModels());
  } else if (mode === '--show') {
    console.log(showModels());
  } else if (mode === '--set-key') {
    await setKeyFromTerminal(rest[0]);
  } else if (mode === '--remove-key') {
    if (!isProvider(rest[0])) { console.error(`Provider: ${Object.keys(PROVIDERS).join(', ')}`); process.exit(1); }
    removeKey(rest[0]);
    console.log(`${rest[0]} key removed. If you also set ${PROVIDERS[rest[0]].env} in your system, remove that too.`);
  } else if (mode === '--set-limit') {
    const error = setLimit(rest[0], Number(rest[1]));
    if (error) { console.error(error); process.exit(1); }
    console.log(`${rest[0]} daily limit: $${Number(rest[1])}`);
  } else {
    console.error('Usage: --show | --set plan=<model>:<effort> code=… test=… review=… docs=… | --set-key <provider> | --remove-key <provider> | --set-limit <provider> <usd per day>');
    process.exit(1);
  }
}
