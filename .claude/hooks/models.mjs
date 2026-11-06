#!/usr/bin/env node
// Model and effort per role and per job (docs/workflow/models.md). Commands read the value with --for before each subagent call; they do not ask.
//   node .claude/hooks/models.mjs --for code.critical       the value for one job: opus:high, main, or an external value with its command
//   node .claude/hooks/models.mjs --show                    current choice (the recommended one if nothing is saved)
//   node .claude/hooks/models.mjs --set code=sonnet:high code.ui=opus:xhigh     --reset code.ui      a job with no choice of its own follows its role
// File: .claude/state/models.json (git-ignored, this project only). main also goes to .claude/settings.local.json, which Claude Code reads.
// Aliases, not model IDs: in Claude Code opus/sonnet/haiku/fable always point to the newest model of that family.
// External model for a job: code=<provider>/<model>:high (runs through run-role.mjs; main through run-session.mjs). Run these in your own terminal:
//   node .claude/hooks/models.mjs --set-key <provider>      asks for the address and the key       --remove-key <provider>      --set-limit <provider> <usd per day>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { findRoot, isMain, renameWithRetry } from './shared.mjs';
import { t, tText } from './lang.mjs';
import { PRESETS } from './provider-presets.mjs';
import { EFFORTS, parseExternal, parseProviderUrl, isProvider, hasKey, setProvider, removeKey, setLimit, purgePlainKeys, unsafeEnv } from './providers.mjs';

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
// How much thought a job takes: the panel shows it so a model can be picked per job
const HARD = ['main', 'plan', 'plan.task', 'plan.architecture', 'code.critical', 'test.adversarial', 'test.critical', 'review.security', 'findings.security'];
const EASY = ['code.simple', 'test.simple', 'board.commit'];
export const levelOf = (job) => (HARD.includes(job) ? 'hard' : EASY.includes(job) || String(job).split('.')[0] === 'docs' ? 'easy' : 'medium');
export const recommendedFor = (job) => (job === 'board.commit' ? 'haiku:low' : RECOMMENDED[job === 'main' ? 'plan' : roleOf(job)]);

export const modelsFile = (root = findRoot()) => path.join(root, '.claude', 'state', 'models.json');

// Any job can use any model the user added; what is advised (Claude for main, planning and review) is advice, not a rule
function validExternal(value) {
  const choice = parseExternal(value);
  return Boolean(choice) && hasKey(choice.provider);
}

// max works in a subagent call but not in the effortLevel setting that main writes to
const validFor = (job, value) => {
  if (typeof value !== 'string') return false;
  if (value === MAIN_SENTINEL) return job === 'code.simple';
  const [model, effort, extra] = value.split(':');
  return (MODELS.includes(model) && extra === undefined && (EFFORTS.includes(effort) || (effort === 'max' && job !== 'main'))) || validExternal(value);
};
const pretty = (value) => { const i = value.lastIndexOf(':'); return i < 0 ? value : `${value.slice(0, i)} / ${value.slice(i + 1)}`; };
// The file can hold anything and the AI reads this output: one short line, no control characters
const clean = (x) => String(x).replace(/[\p{Cc}\u2028\u2029]/gu, ' ').slice(0, 40);
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);

export function readSaved(file) {
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

// A link with a bad value is skipped and the reason kept: job, its links, then the recommended value. source: the link that gave the value, or 'recommended'.
export function resolveJob(job, file = modelsFile()) {
  const store = readSaved(file);
  const notes = store.problem ? [store.problem] : [];
  let value = recommendedFor(job), source = 'recommended';
  for (const link of links(job)) {
    const candidate = savedAt(store, link);
    if (candidate === undefined) continue;
    if (validFor(job, candidate) && validFor(link, candidate)) { value = candidate; source = link; break; }
    const external = parseExternal(candidate);
    notes.push(`${link}: "${clean(candidate)}" skipped, ${external && !hasKey(external.provider) ? `no key for ${external.provider}` : `invalid for ${job}`}`);
  }
  if (job === 'code.simple' && value === resolveJob('main', file).value) value = MAIN_SENTINEL;
  return { value, notes, source };
}

// The first saved value on the chain, checked or not: run-role reports what is wrong with it (no key, no limit)
export function savedChoice(job, file = modelsFile()) {
  const store = readSaved(file);
  return links(job).map((link) => savedAt(store, link)).find((value) => value !== undefined);
}

// Jobs with a valid choice of their own
export const customJobs = (file = modelsFile()) => Object.entries(readSaved(file).tasks).filter(([job, value]) => Object.hasOwn(JOBS, job) && validFor(job, value));

const forLine = (job, value) => {
  if (!parseExternal(value)) return value;
  return job === 'main' ? `${value} · node .claude/hooks/run-session.mjs` : `${value} · node .claude/hooks/run-role.mjs ${job} <prompt file>`;
};

// A file is replaced whole: a write that fails halfway leaves the old one as it was
export function replaceFile(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, text);
    renameWithRetry(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// Runs before models.json is written, so a broken settings file stops the whole --set. value null removes the choice, only if it is still the one the kit wrote (previous).
function writeMainSession(file, value, previous) {
  // An external main session starts with run-session.mjs, so settings.local.json keeps the Claude model for every other session
  if (parseExternal(value)) return null;
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
    replaceFile(settingsFile, JSON.stringify(settings, null, 2) + '\n');
  } catch (e) {
    return `Could not write the file (${e.code ?? e.message}): ${settingsFile}`;
  }
  return null;
}

const serialize = (saved, tasks) => {
  const { tasks: _, ...rest } = saved;
  return JSON.stringify(Object.keys(tasks).length ? { ...rest, tasks } : rest, null, 2) + '\n';
};

function writeSaved(file, saved, tasks) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    replaceFile(file, serialize(saved, tasks));
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
    if (extra !== undefined || !isJob(job) || !validFor(job, value)) return `Invalid: "${pair}". Role: ${Object.keys(ROLES).join(', ')}, or a job such as code.ui (docs/workflow/models.md) · model: ${MODELS.join(', ')} · effort: ${EFFORTS.join(', ')}, max (not for main) (example code=sonnet:medium). External: provider/model:effort for any job, once the provider has a key (--set-key <provider>).`;
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

// A string that changes when the file does: the panel sends it back with a write, so a page that is out of date cannot overwrite a newer choice
export function modelsVersion(file = modelsFile()) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16); } catch { return 'none'; }
}

const refuse = (code, message) => ({ ok: false, code, message });

// The panel's write: all or nothing. changes is { job or role: value | null }, null resets it. The file is replaced whole (temp file, then rename),
// and a main change writes settings.local.json too, before the rename, so a broken settings file stops the whole call.
export function applyChanges({ changes, ifVersion, clearJobsUnder, overwriteBroken } = {}, file = modelsFile()) {
  if (!isObject(changes)) return refuse('invalid', 'changes must be an object of job: value pairs.');
  if (clearJobsUnder !== undefined && !Object.hasOwn(ROLES, clearJobsUnder)) return refuse('invalid', `Unknown role: ${clean(clearJobsUnder)}`);
  const picked = new Map();
  for (const [name, raw] of Object.entries(changes)) {
    if (!isJob(name)) return refuse('invalid', `Unknown job: ${clean(name)}`);
    // A model id keeps its case; an alias is lower case
    const value = typeof raw === 'string' && !raw.includes('/') ? raw.toLowerCase() : raw;
    if (value !== null && !validFor(name, value)) return refuse('invalid', `${name}: ${clean(JSON.stringify(raw))} is not a valid choice here.`);
    picked.set(name, value);
  }
  if (ifVersion !== undefined && ifVersion !== modelsVersion(file)) return refuse('conflict', 'The choice was changed somewhere else since this page loaded. Reload it, then try again.');
  const { saved, tasks, problem } = readSaved(file);
  if (problem && overwriteBroken !== true) return refuse('broken', problem);
  const next = { ...saved }, nextTasks = { ...tasks };
  if (clearJobsUnder) for (const job of Object.keys(nextTasks)) if (Object.hasOwn(JOBS, job) && job !== 'board.commit' && roleOf(job) === clearJobsUnder) delete nextTasks[job];
  for (const [name, value] of picked) {
    const target = Object.hasOwn(ROLES, name) ? next : nextTasks;
    if (value === null) delete target[name]; else target[name] = value;
  }
  let tmp = null;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, serialize(next, nextTasks));
    if (picked.has('main')) {
      const error = writeMainSession(file, picked.get('main'), tasks.main);
      if (error) return refuse('invalid', error);
    }
    renameWithRetry(tmp, file);
    tmp = null;
  } catch (e) {
    return refuse('failed', `Could not write the file (${e.code ?? 'error'}): ${file}`);
  } finally {
    if (tmp) fs.rmSync(tmp, { force: true });
  }
  return { ok: true, version: modelsVersion(file) };
}

// The global default: what this user prefers for new projects (/start offers it)
const defaultsFile = () => path.join(os.homedir(), '.vibe-kit', 'models-default.json');
export function readDefaults() {
  try { const d = JSON.parse(fs.readFileSync(defaultsFile(), 'utf8')); return isObject(d) ? d : null; } catch { return null; }
}
export function setDefaults(file = modelsFile()) {
  const { saved, tasks, problem } = readSaved(file);
  if (problem) return problem;
  const roles = Object.fromEntries(Object.keys(ROLES).filter((r) => saved[r] !== undefined).map((r) => [r, saved[r]]));
  const jobs = Object.fromEntries(Object.entries(tasks).filter(([job]) => Object.hasOwn(JOBS, job)));
  try {
    fs.mkdirSync(path.dirname(defaultsFile()), { recursive: true, mode: 0o700 });
    const tmp = `${defaultsFile()}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, serialize(roles, jobs), { mode: 0o600 });
    renameWithRetry(tmp, defaultsFile());
  } catch (e) {
    return `Could not write the default (${e.code ?? 'error'}).`;
  }
  return null;
}
// This command runs without approval, and an external model spends money and sends the project out: external values stay out, the user picks them in the panel
export function useDefaults(file = modelsFile()) {
  const d = readDefaults();
  if (!d) return 'There is no saved default yet. Save one in the panel first.';
  const changes = {};
  for (const [name, value] of [...Object.entries(d).filter(([k]) => Object.hasOwn(ROLES, k)), ...Object.entries(isObject(d.tasks) ? d.tasks : {})]) if (isJob(name) && validFor(name, value) && !parseExternal(value)) changes[name] = value;
  const r = applyChanges({ changes }, file);
  return r.ok ? null : r.message;
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

// A ready-made provider takes its address from an empty answer
export const addressFor = (provider, answer) => answer.trim() || (Object.hasOwn(PRESETS, provider) ? PRESETS[provider].url : '');

// The address is sealed with the key, so it is asked every time: there is no way to change one and keep the other
async function setKeyFromTerminal(provider, extra) {
  // Whatever else is on the line may be the key, and it is already in the shell history: it is never printed
  const root = findRoot();
  if (extra.length) { console.error(t(root, 'models.key.onCommandLine')); process.exit(1); }
  if (!isProvider(provider)) { console.error(t(root, 'models.key.nameHelp')); process.exit(1); }
  const unsafe = unsafeEnv();
  if (unsafe.length) { console.error(t(root, 'models.key.unsafe', { names: unsafe.join(', ') })); process.exit(1); }
  if (!process.stdin.isTTY) { console.error(t(root, 'models.key.noTerminal')); process.exit(1); }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ready = addressFor(provider, '');
  const parsed = parseProviderUrl(addressFor(provider, await rl.question(ready ? t(root, 'panel.cli.addressPreset', { provider, url: ready }) : t(root, 'panel.cli.addressAsk', { provider }))));
  if (!parsed) { rl.close(); console.error(t(root, 'models.key.badAddress')); process.exit(1); }
  const answer = await rl.question(t(root, 'panel.cli.confirm', { host: parsed.host }));
  rl.close();
  if (!/^(?:y|yes|e|evet)$/i.test(answer.trim())) { console.log(t(root, 'models.key.notSaved')); return; }
  const error = setProvider(provider, parsed.url, (await readHidden(t(root, 'panel.cli.hidden', { provider }))).trim());
  if (error) { console.error(tText(root, error)); process.exit(1); }
  console.log(t(root, 'models.key.saved', { provider }));
}

if (isMain(import.meta.url)) {
  try { purgePlainKeys(); } catch { /* the store is not writable; a plain key in it is never read */ }
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
  } else if (mode === '--show-default') {
    const d = readDefaults();
    if (!d) { console.error('There is no saved default.'); process.exit(1); }
    console.log(Object.entries({ ...Object.fromEntries(Object.entries(d).filter(([k]) => Object.hasOwn(ROLES, k))), ...(isObject(d.tasks) ? d.tasks : {}) }).map(([name, value]) => `${clean(name)}: ${pretty(clean(value))}`).join('\n') || '(empty)');
  } else if (mode === '--save-default' || mode === '--use-default') {
    const error = mode === '--save-default' ? setDefaults() : useDefaults();
    if (error) { console.error(error); process.exit(1); }
    console.log(showModels());
  } else if (mode === '--set-key') {
    await setKeyFromTerminal(rest[0], rest.slice(1));
  } else if (mode === '--remove-key') {
    if (!isProvider(rest[0])) { console.error(t(findRoot(), 'models.key.nameHelp')); process.exit(1); }
    const error = removeKey(rest[0]);
    if (error) { console.error(error); process.exit(1); }
    console.log(`${rest[0]} key removed.`);
  } else if (mode === '--set-limit') {
    const error = setLimit(rest[0], Number(rest[1]));
    if (error) { console.error(error); process.exit(1); }
    console.log(`${rest[0]} daily limit: $${Number(rest[1])}`);
  } else {
    console.error('Usage: --for <job> | --show | --set <role or job>=<model>:<effort> … | --reset <role or job> … | --show-default | --save-default | --use-default | --set-key <provider> | --remove-key <provider> | --set-limit <provider> <usd per day>');
    process.exit(1);
  }
}
