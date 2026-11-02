#!/usr/bin/env node
// Model and effort per role and per job (docs/workflow/models.md). Commands read the value with --for before each subagent call; they do not ask.
//   node .claude/hooks/models.mjs --for code.critical       the value for one job: opus:high, main, or an external value with its run-role command
//   node .claude/hooks/models.mjs --show                    current choice (the recommended one if nothing is saved)
//   node .claude/hooks/models.mjs --set code=sonnet:high code.ui=opus:xhigh     --reset code.ui      a job with no choice of its own follows its role
// File: .claude/state/models.json (git-ignored, this project only). main also goes to .claude/settings.local.json, which Claude Code reads.
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
// test is a separate agent that never sees the code first (AGENTS.md rule 7). Opus costs far more; the note below points to it for critical work.
export const RECOMMENDED = { plan: 'opus:high', code: 'sonnet:high', test: 'sonnet:high', review: 'sonnet:high', docs: 'haiku:high' };
export const MODELS = ['opus', 'sonnet', 'haiku', 'fable'];
const MAIN_SENTINEL = 'main'; // code.simple only: write it in the main session, no subagent

const under = (prefix, names, parents) => Object.fromEntries(names.map((name) => [`${prefix}.${name}`, parents]));
// Job → the links it follows after its own choice; the recommended value comes last
export const JOBS = {
  main: ['plan'],
  ...under('plan', ['task', 'architecture', 'text'], ['plan']),
  ...under('code', ['simple', 'feature', 'critical', 'bugfix', 'refactor', 'ui'], ['code']),
  ...under('test', ['simple', 'feature', 'adversarial', 'critical'], ['test']),
  ...under('review', ['code', 'security'], ['review']),
  'findings.default': ['review'],
  ...under('findings', ['security', 'tech', 'perf', 'ux', 'business', 'legal'], ['findings.default', 'review']),
  'board.default': ['review'],
  'board.commit': [], // runs on every commit, so the review role and the member choices do not reach it
  ...under('board', ['product', 'architect', 'ux', 'performance', 'privacy', 'api', 'qa', 'devops', 'mobile', 'ai'], ['board.default', 'review']),
  ...under('docs', ['changelog', 'report', 'scan', 'research'], ['docs']),
};
export const isJob = (job) => Object.hasOwn(ROLES, String(job)) || Object.hasOwn(JOBS, String(job));
export const roleOf = (job) => { const head = job.split('.')[0]; return head === 'findings' || head === 'board' ? 'review' : head; };
const recommendedFor = (job) => (job === 'board.commit' ? 'haiku:low' : RECOMMENDED[job === 'main' ? 'plan' : roleOf(job)]);

export const modelsFile = (root = findRoot()) => path.join(root, '.claude', 'state', 'models.json');

function validExternal(role, value) {
  const choice = parseExternal(value);
  return Boolean(choice) && EXTERNAL_ROLES.includes(role) && resolveKey(choice.provider) !== null;
}

// max works in a subagent call but not in the effortLevel setting that main writes to
const validFor = (job, value) => {
  if (typeof value !== 'string') return false;
  if (value === MAIN_SENTINEL) return job === 'code.simple';
  const [model, effort, extra] = value.split(':');
  return (MODELS.includes(model) && extra === undefined && (EFFORTS.includes(effort) || (effort === 'max' && job !== 'main'))) || validExternal(roleOf(job), value);
};
const pretty = (value) => { const i = value.lastIndexOf(':'); return i < 0 ? value : `${value.slice(0, i)} / ${value.slice(i + 1)}`; };
// The file can hold anything and the AI reads this output: one short line, no control characters
const clean = (x) => String(x).replace(/[\p{Cc}\u2028\u2029]/gu, ' ').slice(0, 40);
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);

function readSaved(file) {
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    return { saved: {}, tasks: {}, problem: e.code === 'ENOENT' ? null : `${file} is unreadable` };
  }
  if (!isObject(parsed)) return { saved: {}, tasks: {}, problem: `${file} is unreadable` };
  return { saved: parsed, tasks: isObject(parsed.tasks) ? parsed.tasks : {}, problem: null };
}

// Saved choice over the recommended one; a value that does not pass the check (hand edit) falls back to the recommended
export function readModels(file = modelsFile()) {
  const { saved } = readSaved(file);
  return Object.fromEntries(Object.keys(ROLES).map((r) => [r, validFor(r, saved[r]) ? saved[r] : RECOMMENDED[r]]));
}

const links = (job) => [job, ...(JOBS[job] ?? [])];
const savedAt = ({ saved, tasks }, link) => (Object.hasOwn(ROLES, link) ? saved[link] : tasks[link]);

// A link with a bad value is skipped and the reason kept: job, its links, then the recommended value
export function resolveJob(job, file = modelsFile()) {
  const store = readSaved(file);
  const notes = store.problem ? [store.problem] : [];
  let value = recommendedFor(job);
  for (const link of links(job)) {
    const candidate = savedAt(store, link);
    if (candidate === undefined) continue;
    if (validFor(job, candidate) && validFor(link, candidate)) { value = candidate; break; }
    const external = parseExternal(candidate);
    notes.push(`${link}: "${clean(candidate)}" skipped, ${external && EXTERNAL_ROLES.includes(roleOf(job)) && resolveKey(external.provider) === null ? `no key for ${external.provider}` : `invalid for ${job}`}`);
  }
  if (job === 'code.simple' && value === resolveJob('main', file).value) value = MAIN_SENTINEL;
  return { value, notes };
}

// The first saved value on the chain, checked or not: run-role reports what is wrong with it (no key, no limit)
export function savedChoice(job, file = modelsFile()) {
  const store = readSaved(file);
  return links(job).map((link) => savedAt(store, link)).find((value) => value !== undefined);
}

// Jobs with a valid choice of their own
export const customJobs = (file = modelsFile()) => Object.entries(readSaved(file).tasks).filter(([job, value]) => Object.hasOwn(JOBS, job) && validFor(job, value));

const forLine = (job, value) => (parseExternal(value) ? `${value} · node .claude/hooks/run-role.mjs ${job} <prompt file>` : value);

// Runs before models.json is written, so a broken settings file stops the whole --set. value null removes the choice, only if it is still the one the kit wrote (previous).
function writeMainSession(file, value, previous) {
  const settingsFile = path.join(path.dirname(file), '..', 'settings.local.json');
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    if (!isObject(settings)) throw new Error('not an object');
  } catch (e) {
    if (e.code !== 'ENOENT') return `${settingsFile} is unreadable, nothing was changed. Fix it, then try again.`;
    settings = {};
  }
  if (value) [settings.model, settings.effortLevel] = value.split(':');
  else if (`${settings.model}:${settings.effortLevel}` === previous) { delete settings.model; delete settings.effortLevel; }
  else return null;
  try {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
  } catch (e) {
    return `Could not write the file (${e.code ?? e.message}): ${settingsFile}`;
  }
  return null;
}

function writeSaved(file, saved, tasks) {
  const { tasks: _, ...rest } = saved;
  const next = Object.keys(tasks).length ? { ...rest, tasks } : rest;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  } catch (e) {
    return `Could not write the file (${e.code ?? e.message}): ${file}`;
  }
  return null;
}

// pairs: ['code=sonnet:medium', 'code.ui=opus:xhigh', ...]. Returns an error text or null. Only what is named gets written; the rest keeps following its chain.
export function setModels(pairs, file = modelsFile()) {
  if (!pairs.length) return `Usage: --set ${Object.entries(RECOMMENDED).map(([r, v]) => `${r}=${v}`).join(' ')}`;
  const { saved, tasks } = readSaved(file);
  const next = { ...saved }, nextTasks = { ...tasks };
  for (const pair of pairs) {
    const [rawJob, rawValue, extra] = pair.split('=');
    const job = rawJob.toLowerCase();
    // A model id keeps its case; an alias is lower case
    const value = rawValue?.includes('/') ? rawValue : rawValue?.toLowerCase();
    if (extra !== undefined || !isJob(job) || !validFor(job, value)) return `Invalid: "${pair}". Role: ${Object.keys(ROLES).join(', ')}, or a job such as code.ui (docs/workflow/models.md) · model: ${MODELS.join(', ')} · effort: ${EFFORTS.join(', ')}, max (not for main) (example code=sonnet:medium). External: ${EXTERNAL_ROLES.join(', ')} only, as provider/model:effort, and the provider needs a key.`;
    if (Object.hasOwn(ROLES, job)) next[job] = value;
    else nextTasks[job] = value;
  }
  if (pairs.some((pair) => pair.split('=')[0].toLowerCase() === 'main')) {
    const error = writeMainSession(file, nextTasks.main);
    if (error) return error;
  }
  return writeSaved(file, next, nextTasks);
}

// A job or role goes back to following its chain
export function resetModels(names, file = modelsFile()) {
  if (!names.length) return 'Usage: --reset code.ui [more jobs or roles]';
  const { saved, tasks } = readSaved(file);
  const next = { ...saved }, nextTasks = { ...tasks };
  for (const name of names) {
    const job = name.toLowerCase();
    if (!isJob(job)) return `Invalid: "${name}". Role: ${Object.keys(ROLES).join(', ')}, or a job such as code.ui (docs/workflow/models.md).`;
    delete next[job];
    delete nextTasks[job];
  }
  if (names.some((name) => name.toLowerCase() === 'main')) {
    const error = writeMainSession(file, null, tasks.main);
    if (error) return error;
  }
  return writeSaved(file, next, nextTasks);
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
    + Object.entries(readSaved(file).tasks).map(([job, value]) => `\n${clean(job)}: ${pretty(clean(value))} (${!Object.hasOwn(JOBS, job) ? 'unknown job, ignored' : validFor(job, value) ? 'custom' : 'invalid, ignored'})`).join('')
    + (note ? `\n(${note})` : '')
    + (m.code.split(':')[0] === m.test.split(':')[0] ? '\nNote: the code and test roles use the same model. For security, payment or data-deleting work, pick Opus for the test role: another model does not share the same blind spots.' : '');
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
  } else if (mode === '--reset') {
    const error = resetModels(rest);
    if (error) { console.error(error); process.exit(1); }
    console.log(showModels());
  } else if (mode === '--for') {
    if (!isJob(rest[0])) { console.error(`Unknown job: ${rest[0]}. Jobs: ${[...Object.keys(ROLES), ...Object.keys(JOBS)].join(', ')}`); process.exit(1); }
    const { value, notes } = resolveJob(rest[0]);
    for (const note of notes) console.error(note);
    console.log(forLine(rest[0], value));
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
    console.error('Usage: --for <job> | --show | --set <role or job>=<model>:<effort> … | --reset <role or job> … | --set-key <provider> | --remove-key <provider> | --set-limit <provider> <usd per day>');
    process.exit(1);
  }
}
