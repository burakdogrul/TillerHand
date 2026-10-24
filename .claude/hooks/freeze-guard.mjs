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
// State: .claude/state/plan.json → { "task": "G-012", "paths": ["src/a.ts", "src/features/fatura/"] } (ending in /: folder)
//   node .claude/hooks/freeze-guard.mjs --plan-save <task> <path...>   save when no plan is active (no question)
//   node .claude/hooks/freeze-guard.mjs --plan-add <path...>           widen the list (with user approval)
//   node .claude/hooks/freeze-guard.mjs --plan-end                     close when the task is done
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readInput, decide, findRoot } from './shared.mjs';

// Project root even when called from a subfolder: lock and plan are written where the hook reads them; paths are root-relative
const root = findRoot();
const lockPath = (dir = root) => path.join(dir, '.claude', 'state', 'freeze.json');
const LOCK = lockPath();
// Kit files that must stay writable under a lock (progress note, hook states)
const FREE = ['docs/workflow/progress.md', '.claude/state/'];

// Counterpart of .claude/settings.json → permissions (deny: .env and secrets/, ask: rule and guard files)
const PROTECTED = [
  ['deny', /^(\.env(\.local|\.production|\.[^/]+\.local)?|secrets(\/.*)?)$/i, 'Ortam ve sır dosyaları AI tarafından okunmaz ve yazılmaz.'],
  ['ask', /^(CLAUDE\.md|AGENTS\.md|\.mcp\.json|\.claude\/.*|\.codex\/.*|\.agents\/hooks\.json|\.github\/workflows\/.*|\.git(\/.*)?)$/i, 'Kural, koruma ve iş akışı dosyaları kullanıcı onayıyla değişir.'],
];
export const protectedRule = (rel) => PROTECTED.find(([, re]) => re.test(rel)) ?? null;

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
// Keys before 3.15.0 (gorev, yollar) are still read; remove in 3.17.0.
export function readPlan(dir = root) {
  try {
    const p = JSON.parse(fs.readFileSync(planPath(dir), 'utf8'));
    const task = p?.task ?? p?.gorev, paths = p?.paths ?? p?.yollar;
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
    return console.log(current ? `Kapsam kalkanı kapandı (${current.task}).` : 'Aktif plan yok.');
  }
  const [task, ...paths] = mode === '--plan-save' ? args : [null, ...args];
  const fail = (m) => { console.error(m); process.exit(1); };
  if (mode === '--plan-save' && current) fail(`Plan aktif (${current.task}). Kapsamı genişletmek kullanıcı onayıyla --plan-add; görev bittiyse önce --plan-end.`);
  if (mode === '--plan-add' && !current) fail('Aktif plan yok; önce --plan-save <görev> <yol...>.');
  if ((mode === '--plan-save' && !task) || !paths.length) fail(`Kullanım: ${mode === '--plan-save' ? '--plan-save <görev> <yol...>' : '--plan-add <yol...>'}`);
  const normal = paths.map(normalPlanPath);
  if (normal.includes(null)) fail(`Proje dışındaki yol plana eklenmez: ${paths[normal.indexOf(null)]}`);
  const plan = current ? { task: current.task, paths: [...new Set([...current.paths, ...normal])] } : { task, paths: [...new Set(normal)] };
  writePlan(plan);
  console.log(`Kapsam kalkanı: ${plan.task} · ${plan.paths.length} yol. Liste dışı mevcut dosyaya yazım sorulur.`);
}

// Flags before 3.15.0; still accepted with a warning, remove in 3.17.0
const OLD_FLAGS = { '--plan-kaydet': '--plan-save', '--plan-ekle': '--plan-add', '--plan-bitir': '--plan-end' };
const MODES = ['--set', '--off', '--status', '--plan-save', '--plan-add', '--plan-end'];

// ONLY the first argument sets the mode (the permission list matches by prefix: "--set:*" and "--status" without
// approval, "--off" with approval). The lock limits the agent: an active lock cannot be removed or widened without approval, only narrowed.
function configure(mode, value) {
  if (mode === '--off') {
    fs.rmSync(LOCK, { force: true });
    console.log('Düzenleme kilidi kaldırıldı.');
  } else if (mode === '--set' && value) {
    const dir = relPath(value, root).replace(/\/+$/, '');
    if (!dir || dir.startsWith('..')) { console.error('Klasör proje içinde olmalı.'); process.exit(1); }
    const current = readLock();
    if (current && !allowedInLock(`${dir}/x`, current)) {
      console.error(`Kilit açık (${current}/). Sadece daraltılabilir; genişletmek için önce kullanıcı onayıyla /freeze off.`);
      process.exit(1);
    }
    fs.mkdirSync(path.dirname(LOCK), { recursive: true });
    fs.writeFileSync(LOCK, JSON.stringify({ dir, date: new Date().toISOString() }, null, 2));
    console.log(`Düzenleme kilidi: sadece ${dir}/ (kaldırmak için /freeze off)`);
  } else if (mode.startsWith('--plan-')) {
    setPlan(mode, process.argv.slice(3));
  } else {
    const k = readLock();
    const p = readPlan();
    console.log(k ? `Düzenleme kilidi açık: ${k}/` : 'Düzenleme kilidi yok.');
    console.log(p ? `Kapsam kalkanı: ${p.task} · ${p.paths.length} yol (${p.paths.join(', ')})` : 'Aktif plan yok.');
  }
}

function hook() {
  const g = readInput();
  if (!g) process.exit(0);
  const groot = realPath(g.root);
  const paths = g.files.map(({ path: p }) => realPath(path.resolve(g.dir, p)));
  // Gate command approval record (gate.mjs, in the user folder ~/.vibe-kit/): the AI must not write it by hand
  const approval = paths.find((p) => /[\\/]\.vibe-kit([\\/]|$)/i.test(p));
  if (approval) decide(g.tool, 'ask', `${approval}: kapı komut onayı kaydı; elle yazılmaz, node .claude/hooks/gate.mjs --approve kullanılır.`);
  if (g.tool !== 'claude') {
    for (const p of paths) {
      const k = protectedRule(relPath(p, groot));
      if (k) decide(g.tool, k[0], `${relPath(p, groot)}: ${k[2]}`);
    }
    // Reads (view_file etc.): only .env and secrets/ are denied (the counterpart of Read(./.env) in Claude)
    for (const p of g.reads) {
      const rel = relPath(realPath(path.resolve(g.dir, p)), groot);
      const k = protectedRule(rel);
      if (k?.[0] === 'deny') decide(g.tool, 'deny', `${rel}: ${k[2]}`);
    }
  }
  const lock = readLock(g.root);
  const outside = lock && paths.find((p) => !allowedInLock(p, lock, groot));
  if (outside) decide(g.tool, 'deny', `Düzenleme kilidi: sadece ${lock}/ değiştirilebilir. Bu dosya gerekiyorsa kullanıcıya sor; kilidi kaldırmak için /freeze off.`);
  const plan = readPlan(g.root);
  for (const [i, p] of (plan ? paths : []).entries()) {
    const rel = relPath(p, groot);
    // A new file is not asked (the structure guard looks at it); deleting and overwriting an existing one is
    if (inScope(rel, plan.paths) || !(g.files[i].deleted || fs.existsSync(p))) continue;
    decide(g.tool, 'ask', `Kapsam kalkanı: ${rel || '(yol bilinmiyor)'} onaylı planda yok (görev ${plan.task}). Gerekliyse kullanıcıya sor; ` +
      `onaylarsa node .claude/hooks/freeze-guard.mjs --plan-add <yol>. Görev bittiyse --plan-end.`);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [arg, value] = process.argv.slice(2);
  const mode = (Object.hasOwn(OLD_FLAGS, arg) ? OLD_FLAGS[arg] : arg);
  if (Object.hasOwn(OLD_FLAGS, arg)) console.error(`Uyarı: ${arg} eski bayrak; yenisi ${mode}. 3.17.0'da kalkacak.`);
  MODES.includes(mode) ? configure(mode, value) : hook();
}
