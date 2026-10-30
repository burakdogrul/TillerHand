#!/usr/bin/env node
// Edit lock (/freeze): while the lock is on, the AI may write only to the chosen folder; keeps the work from spreading
// to other files while debugging or on a risky feature. State: .claude/state/freeze.json → { "dir": "src/features/auth" }
//   PreToolUse (Write|Edit|MultiEdit|NotebookEdit) hook: while locked, writes outside the folder are denied.
//   Shell writes (sed -i, mv, > …) are in destructive-guard: an existing file outside the lock or plan is asked.
//   On Codex and Antigravity it also applies the file side of the Claude Code permission list (PROTECTED): those tools
//   have no settings.json; without it the AI could change the lock, the hooks and the rules itself.
//   node .claude/hooks/freeze-guard.mjs --set <folder>   lock
//   node .claude/hooks/freeze-guard.mjs --off            remove the lock
//   node .claude/hooks/freeze-guard.mjs --status         print state (lock and plan)
// Scope shield (F-06): after /plan-task approval the plan's file list is saved; while a plan is active a write to an
// EXISTING file not on the list is asked. New files are the structure guard's job; docs/, CHANGELOG.md are free. No plan: silent.
// State: .claude/state/plan.json → { "task": "G-012", "paths": ["src/a.ts", "src/features/invoice/"] } (ending in /: folder)
//   node .claude/hooks/freeze-guard.mjs --plan-save <task> <path...>   save when no plan is active (asked: the user sees the list)
//   node .claude/hooks/freeze-guard.mjs --plan-add <path...>           widen the list (with user approval)
//   node .claude/hooks/freeze-guard.mjs --plan-end                     close when the task is done (asked)
import fs from 'node:fs';
import path from 'node:path';
import { readInput, decide, findRoot, isMain } from './shared.mjs';
import { t } from './lang.mjs';

// Project root even when called from a subfolder: lock and plan are written where the hook reads them; paths are root-relative
const root = findRoot();
const lockPath = (dir = root) => path.join(dir, '.claude', 'state', 'freeze.json');
const LOCK = lockPath();
// Kit files that must stay writable under a lock (progress note, hook states)
const FREE = ['docs/workflow/progress.md', '.claude/state/'];

// Counterpart of .claude/settings.json → permissions (deny: .env and secrets/, ask: rule and guard files)
const PROTECTED = [
  ['deny', /^(\.env(\.local|\.production|\.[^/]+\.local)?|secrets(\/.*)?)$/i, 'Environment and secret files are not read or written by the AI.'],
  ['ask', /^(CLAUDE\.md|AGENTS\.md|\.mcp\.json|\.claude\/.*|\.codex\/.*|\.agents\/hooks\.json|\.github\/workflows\/.*|\.git(\/.*)?)$/i, 'guard.freeze.protectedAsk'],
];
// Returns [decision, pattern, text]; the text of an ask rule is in the user's language (message key), a deny rule's is for the AI
export const protectedRule = (rel, r = root) => {
  const e = PROTECTED.find(([, re]) => re.test(rel));
  return e ? [e[0], e[1], e[0] === 'ask' ? t(r, e[2]) : e[2]] : null;
};

export const relPath = (file, rootDir) => path.relative(rootDir, path.resolve(rootDir, file)).split(path.sep).join('/');

// Symlinks and junctions are resolved: a link inside the lock or plan must not write to a file outside it.
// For a new file the nearest existing parent folder is resolved.
export function realPath(p) {
  try { return fs.realpathSync.native(p); } catch { /* missing: try the parent */ }
  const parent = path.dirname(p);
  return parent === p ? p : path.join(realPath(parent), path.basename(p));
}

export function allowedInLock(file, lock, rootDir = root) {
  const rel = relPath(file, rootDir);
  if (FREE.some((s) => rel === s || (s.endsWith('/') && rel.startsWith(s)))) return true;
  const k = lock.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  return rel === k || rel.startsWith(`${k}/`);
}

export function readLock(dir = root) {
  try { return JSON.parse(fs.readFileSync(lockPath(dir), 'utf8')).dir || null; } catch { return null; }
}

const planPath = (dir = root) => path.join(dir, '.claude', 'state', 'plan.json');
const PLAN_FREE = ['docs/', 'CHANGELOG.md', ...FREE];
export const inScope = (rel, paths) => [...PLAN_FREE, ...paths].some((y) => rel === y || (y.endsWith('/') && rel.startsWith(y)));

// Broken or hand-edited file: no plan.
export function readPlan(dir = root) {
  try {
    const p = JSON.parse(fs.readFileSync(planPath(dir), 'utf8'));
    const task = p?.task, paths = p?.paths;
    return typeof task === 'string' && Array.isArray(paths) ? { task, paths: paths.filter((y) => typeof y === 'string') } : null;
  } catch { return null; }
}
const writePlan = (p) => {
  fs.mkdirSync(path.dirname(planPath()), { recursive: true });
  fs.writeFileSync(planPath(), JSON.stringify({ ...p, date: new Date().toISOString() }, null, 2));
};
// Project-relative path; a trailing / means a folder. Outside the project or the root itself: null
function normalPlanPath(y) {
  const r = relPath(y, root);
  return !r || r.startsWith('..') || path.isAbsolute(r) ? null : r + (/[\\/]$/.test(y) ? '/' : '');
}

function setPlan(mode, args) {
  const current = readPlan();
  if (mode === '--plan-end') {
    fs.rmSync(planPath(), { force: true });
    return console.log(current ? `Scope shield closed (${current.task}).` : 'No active plan.');
  }
  const [task, ...paths] = mode === '--plan-save' ? args : [null, ...args];
  const fail = (m) => { console.error(m); process.exit(1); };
  if (mode === '--plan-save' && current) fail(`A plan is active (${current.task}). To widen the scope, use --plan-add with user approval; if the task is done, run --plan-end first.`);
  if (mode === '--plan-add' && !current) fail('No active plan; run --plan-save <task> <path...> first.');
  if ((mode === '--plan-save' && !task) || !paths.length) fail(`Usage: ${mode === '--plan-save' ? '--plan-save <task> <path...>' : '--plan-add <path...>'}`);
  const normal = paths.map(normalPlanPath);
  if (normal.includes(null)) fail(`A path outside the project is not added to the plan: ${paths[normal.indexOf(null)]}`);
  const plan = current ? { task: current.task, paths: [...new Set([...current.paths, ...normal])] } : { task, paths: [...new Set(normal)] };
  writePlan(plan);
  console.log(`Scope shield: ${plan.task} · ${plan.paths.length} paths. Writing to an existing file outside the list is asked.`);
}

const MODES = ['--set', '--off', '--status', '--plan-save', '--plan-add', '--plan-end'];

// ONLY the first argument sets the mode (the permission list matches by prefix: "--set:*" and "--status" without
// approval, "--off" with approval). The lock limits the agent: an active lock cannot be removed or widened without approval, only narrowed.
function configure(mode, value) {
  if (mode === '--off') {
    fs.rmSync(LOCK, { force: true });
    console.log('Edit lock removed.');
  } else if (mode === '--set' && value) {
    const dir = relPath(value, root).replace(/\/+$/, '');
    if (!dir || dir.startsWith('..')) { console.error('The folder must be inside the project.'); process.exit(1); }
    const current = readLock();
    if (current && !allowedInLock(`${dir}/x`, current)) {
      console.error(`A lock is on (${current}/). It can only be narrowed; to widen it, first run /freeze off with user approval.`);
      process.exit(1);
    }
    fs.mkdirSync(path.dirname(LOCK), { recursive: true });
    fs.writeFileSync(LOCK, JSON.stringify({ dir, date: new Date().toISOString() }, null, 2));
    console.log(`Edit lock: only ${dir}/ (to remove it: /freeze off)`);
  } else if (mode.startsWith('--plan-')) {
    setPlan(mode, process.argv.slice(3));
  } else {
    const k = readLock();
    const p = readPlan();
    console.log(k ? `Edit lock is on: ${k}/` : 'No edit lock.');
    console.log(p ? `Scope shield: ${p.task} · ${p.paths.length} paths (${p.paths.join(', ')})` : 'No active plan.');
  }
}

function hook() {
  const g = readInput();
  if (!g) process.exit(0);
  const groot = realPath(g.root);
  const paths = g.files.map(({ path: p }) => realPath(path.resolve(g.dir, p)));
  // Gate command approval record (gate.mjs, in the user folder ~/.vibe-kit/): the AI must not write it by hand
  const approval = paths.find((p) => /[\\/]\.vibe-kit([\\/]|$)/i.test(p));
  if (approval) decide(g.tool, 'ask', /preferences[.]md$/i.test(approval)
    ? t(g.root, 'guard.freeze.prefsFile', { path: approval })
    : t(g.root, 'guard.freeze.gateApproval', { path: approval }));
  if (g.tool !== 'claude') {
    for (const p of paths) {
      const k = protectedRule(relPath(p, groot), g.root);
      if (k) decide(g.tool, k[0], `${relPath(p, groot)}: ${k[2]}`);
    }
    // Reads (view_file etc.): only .env and secrets/ are denied (the counterpart of Read(./.env) in Claude)
    for (const p of g.reads) {
      const rel = relPath(realPath(path.resolve(g.dir, p)), groot);
      const k = protectedRule(rel, g.root);
      if (k?.[0] === 'deny') decide(g.tool, 'deny', `${rel}: ${k[2]}`);
    }
  }
  // "**Commit review:** off" in board.md turns the commit review off: changing that value is the user's call
  for (const [i, p] of paths.entries()) {
    if (relPath(p, groot) !== 'docs/workflow/board.md') continue;
    const review = (s) => s?.match(/\*\*Commit review:\*\*[ \t]*([^\r\n]*)/i)?.[1].trim().toLowerCase();
    let now; try { now = review(fs.readFileSync(p, 'utf8')); } catch { /* new file */ }
    const next = review(g.files[i].after);
    if (next !== undefined && next !== now) decide(g.tool, 'ask', t(g.root, 'guard.freeze.commitReview', { value: next }));
  }
  const lock = readLock(g.root);
  const outside =lock && paths.find((p) => !allowedInLock(p, lock, groot));
  if (outside) decide(g.tool, 'deny', `Edit lock: only ${lock}/ may be changed. If you need this file, ask the user; to remove the lock use /freeze off.`);
  const plan = readPlan(g.root);
  for (const [i, p] of (plan ? paths : []).entries()) {
    const rel = relPath(p, groot);
    // A new file is not asked (the structure guard looks at it); deleting and overwriting an existing one is
    if (inScope(rel, plan.paths) || !(g.files[i].deleted || fs.existsSync(p))) continue;
    decide(g.tool, 'ask', t(g.root, 'guard.freeze.scopeAsk', { rel: rel || t(g.root, 'guard.freeze.unknownPath'), task: plan.task }));
  }
  process.exit(0);
}

if (isMain(import.meta.url)) {
  const [mode, value] = process.argv.slice(2);
  // A mistyped or removed flag must fail loudly: run as the hook it would pass silently and the AI would think the plan is saved
  if (mode?.startsWith('--') && !MODES.includes(mode)) {
    console.error(`Unknown flag: ${mode}. Usage: freeze-guard.mjs ${MODES.join(' | ')}`);
    process.exit(1);
  }
  MODES.includes(mode) ? configure(mode, value) : hook();
}
