#!/usr/bin/env node
// Structure guard: keeps the project's folder layout in line with the .claude/structure.json map.
//   PreToolUse (Write, Edit) hook: denies a NEW file off the map with a pointer (the right place, sandbox/, or
//     AskUserQuestion then --add) and one that matches a clutter pattern (.bak, *-old.*, "kopya" etc.). sandbox/ is always free.
//   node .claude/hooks/structure-guard.mjs --check         checks every file in git (CI and /findings-tech).
//   node .claude/hooks/structure-guard.mjs --add <folder>  adds <folder>/** to the map's allow list, after the user
//     accepts the new place in AskUserQuestion (3.75.0: off-map is denied, not asked, so it opens no permission prompt)
// Without a map (before the kit is set up) it blocks nothing.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { readInput, decide, findRoot, inLinkedWorktree, isMain, rootFor, renameWithRetry } from './shared.mjs';
import { t } from './lang.mjs';
import { realPath } from './freeze-guard.mjs';

const root = findRoot();
// Shared docs: a worktree writes its task note; /parallel merge updates these on main (parallel edits would conflict)
const SHARED_DOCS = ['docs/workflow/progress.md', 'docs/product/roadmap.md', 'docs/decisions/log.md', 'changelog.md', 'docs/workflow/cost-log.md', 'docs/product/prd.md'];

// "**" any depth, "*" any name inside one folder, "?" one character
export function globRegex(pattern) {
  let r = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') { r += '(?:.*/)?'; i += 2; } else { r += '.*'; i++; }
    } else if (c === '*') r += '[^/]*';
    else if (c === '?') r += '[^/]';
    else r += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${r}$`, 'i');
}

export function readMap(dir = root) {
  let text;
  try { text = fs.readFileSync(path.join(dir, '.claude', 'structure.json'), 'utf8'); } catch { return null; }
  // A map that exists but does not parse must not switch the guard off: every new file is asked
  try {
    const m = JSON.parse(text);
    return { allow: (m.allow ?? []).map(globRegex), deny: (m.deny ?? []).map(globRegex), raw: m };
  } catch {
    return { broken: true };
  }
}

// Returns: null (fine) | { decision: 'deny' | 'ask', reason, kind? } (kind on a deny: 'clutter' or 'offmap')
export function check(rel, map) {
  if (!map) return null;
  // The globs are not linear in the path length: a very long path is asked, not matched
  if (rel.length > 1024) return { decision: 'ask', reason: t(root, 'guard.structure.longPath', { length: rel.length }) };
  rel = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (rel.startsWith('sandbox/')) return null;
  if (map.broken) return { decision: 'ask', reason: t(root, 'guard.structure.brokenMap', { rel }) };
  const denied = map.deny.find((re) => re.test(rel));
  if (denied) {
    return { decision: 'deny', kind: 'clutter', reason: `"${rel}" matches a clutter pattern (backup, old version, copy or temp file). Git history is already the backup; use sandbox/ for experiments.` };
  }
  if (map.allow.some((re) => re.test(rel))) return null;
  const top = [...new Set((map.raw.allow ?? []).map((d) => d.split('/')[0]).filter((d) => !d.includes('.') || d.startsWith('.')))].slice(0, 12);
  return {
    decision: 'deny',
    kind: 'offmap',
    // A root file cannot be added with --add (it adds folders): the root list is edited in the map after the user accepts
    reason: t(root, rel.includes('/') ? 'guard.structure.offMap' : 'guard.structure.offMapRoot', { rel, top: top.join(', ') }),
  };
}

// A path git ignores (build output, test logs, coverage) never reaches the repository, so the map does not cover it.
// Outside a git repository nothing counts as ignored. Only a match from a .gitignore inside the project that is committed
// and unchanged counts: otherwise the AI could add "lib/" to .gitignore and write anywhere (.git/info/exclude, the global
// excludes file, an untracked, staged, edited or self-ignoring .gitignore: not trusted)
export function gitIgnored(rel, dir) {
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8', windowsHide: true });
  const r = git('check-ignore', '-v', '--', rel.replace(/\\/g, '/'));
  const source = r.status === 0 && r.stdout.match(/^(.*?):\d+:/)?.[1];
  if (!source || path.isAbsolute(source) || path.basename(source) !== '.gitignore') return false;
  const s = git('status', '--porcelain', '--ignored', '--', source);
  return s.status === 0 && s.stdout.trim() === '';
}

// Shell side: a file a command creates that does not exist yet (a redirect target, the destination of cp/mv/copy/ln,
// the arguments of tee, touch, New-Item, Out-File, Set-Content) is checked against the map. A clutter name is asked, not
// denied (the shell text is read by heuristics); an off-map file is denied with the same pointer as the Write hook, so a
// refused Write is not retried through cp or a redirect (3.75.0). nul, con and /dev/ are devices, not files.
// No map or a broken map: silent.
// shortcut: text-based (quoted words, variables, globs and bash -c bodies are skipped; cd followed in order only).
const CREATORS = /^(cp|copy|mv|move|ln|copy-item|move-item|cpi|mi)$/;
const MAKERS = /^(tee|touch|new-item|ni|out-file|set-content|add-content)$/;
const PS_MAKERS = /^(new-item|ni|out-file|set-content|add-content)$/;
// PowerShell parameters that take a value, by what they mean here. PowerShell accepts any prefix of a name (-Va for
// -Value) and the -Name:value form; a prefix is read as the first name it starts (-P is -Path: the stricter reading).
// Any other flag is a switch (-Force).
const PS_TAKES = { path: 'path', filepath: 'path', literalpath: 'path', name: 'name', itemtype: 'type', type: 'type', value: 'value', encoding: 'value', inputobject: 'value', width: 'value' };
const psParse = (words) => {
  const out = { positional: [] };
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (!w.startsWith('-')) { out.positional.push(w); continue; }
    const [flag, inline] = w.slice(1).toLowerCase().split(/:(.*)/s);
    const key = PS_TAKES[flag] ? flag : Object.keys(PS_TAKES).find((k) => flag && k.startsWith(flag));
    if (key) out[PS_TAKES[key]] ??= inline ?? words[++i] ?? '';
  }
  return out;
};
const PREFIX = /^(\w+=\S*|sudo|env|time|nohup|command|exec|do|then|else)$/i;
const HIDDEN = ' <>;&|#=()\n';
export function clutterIssue(command, dir, root) {
  const map = readMap(root);
  if (!map || map.broken) return null;
  // Text is not a target: a heredoc body goes (its first line, with its redirects, stays); a quoted string becomes one
  // word, its blanks and shell characters hidden in private-use characters (U+E000…) until it is used as a path, so
  // "a > b.bak" is no redirect but "a (1).ts" is still a name; arrows (=>, ->) go; >| >& &> are plain redirects
  const text = command.replace(/(<<-?\s*(['"]?)(\w+)\2[^\n]*)\n[\s\S]*?\n[ \t]*\3[ \t]*(?=\n|$)/g, '$1')
    .replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (q) => q.slice(1, -1).replace(/[\s<>;&|#=()]/g, (c) => String.fromCharCode(0xe000 + HIDDEN.indexOf(c === '\t' ? ' ' : c))))
    .replace(/[=-]>/g, ' ').replace(/\d*>&\d+/g, ' ').replace(/>\||>&|&>/g, '>');
  let cwd = dir, clutter = null;
  for (const raw of text.split(/&&|\|\||[;|\n&]/)) {
    const part = raw.replace(/(^|\s)#.*$/, '').replace(/^[\s({!]+|[\s)}]+$/g, '');
    const redirects = [...part.matchAll(/\d?>{1,2}\s*([^\s;&|<>]+)/g)].map((m) => m[1]);
    const words = part.replace(/\d?>{1,2}\s*\S+/g, ' ').trim().split(/\s+/);
    while (words.length && PREFIX.test(words[0])) words.shift();
    const name = path.basename(words[0] ?? '').toLowerCase().replace(/\.(exe|cmd)$/, '');
    const dest = words.findIndex((w) => /^-destination$/i.test(w));
    const args = words.slice(1).filter((w) => w && !w.startsWith('-'));
    if (/^(cd|pushd|set-location)$/.test(name)) { cwd = path.resolve(cwd, args[0] ?? '.'); continue; }
    // A PowerShell maker writes its -Path (-FilePath, -LiteralPath) or its first positional word, a comma list being
    // several files, each joined with -Name when given; -Value and -ItemType values are not files, and a folder
    // (-ItemType/-Type Directory) is not checked (the Write hook checks files only)
    const ps = PS_MAKERS.test(name) ? psParse(words) : null;
    const psPaths = ps ? (ps.path ?? ps.positional[0] ?? '').split(',').filter(Boolean) : [];
    const psFile = !ps || /^d/i.test(ps.type ?? '') ? []
      : ps.name !== undefined ? (psPaths.length ? psPaths.map((p) => `${p}/${ps.name}`) : [ps.name]) : psPaths;
    const made = CREATORS.test(name) ? (dest > -1 ? [words[dest + 1] ?? ''] : args.slice(-1))
      : PS_MAKERS.test(name) ? psFile : MAKERS.test(name) ? args : [];
    for (const w of [...redirects, ...made]) {
      // %VAR% and $VAR are environment paths (often outside the project); NUL:, CON, COM1 … are devices
      if (!w || /[$`*?{]|%\w+%/.test(w) || /^(nul|con|prn|aux|com\d|lpt\d):?$|^\/dev\//i.test(w)) continue;
      const x = w.replace(/[-]/g, (c) => HIDDEN[c.charCodeAt(0) - 0xe000]);
      const full = path.resolve(cwd, x), rel = path.relative(root, full);
      if (rel.startsWith('..') || path.isAbsolute(rel) || fs.existsSync(full)) continue;
      const s = check(rel, map);
      if (s?.kind === 'offmap' && !gitIgnored(rel, root)) return { decision: 'deny', reason: t(root, 'guard.structure.prefix', { reason: s.reason }) };
      if (s?.kind === 'clutter') clutter ??= { decision: 'ask', reason: t(root, 'guard.structure.clutterShell', { rel: rel.replace(/\\/g, '/') }) };
    }
  }
  return clutter;
}

function hook() {
  const g = readInput();
  if (!g) process.exit(0);
  // A file a worktree session writes into the main checkout is checked against the main checkout's map
  const files = g.files.map(({ path: file, isNew }) => {
    const full = path.resolve(g.dir, file), owner = rootFor(full, g.root);
    // Both sides resolved, as rootFor does: a junction in the worktree pointing into main is main's path
    return { full, isNew, owner, rel: owner && path.relative(realPath(owner), realPath(full)).split(path.sep).join('/') };
  });
  const doc = files.find((f) => f.owner && SHARED_DOCS.includes(f.rel.toLowerCase()));
  if (doc && inLinkedWorktree(g.root)) decide(g.tool, 'ask', t(g.root, 'guard.structure.sharedDoc', { rel: doc.rel }));
  for (const { full, isNew, owner, rel } of files) {
    if (isNew === false || (isNew === undefined && fs.existsSync(full))) continue; // new files only
    if (!owner) continue; // outside the project
    const s = check(rel, readMap(owner));
    if (s?.kind === 'offmap' && gitIgnored(rel, owner)) continue;
    if (s) decide(g.tool, s.decision, t(g.root, 'guard.structure.prefix', { reason: s.reason }));
  }
  process.exit(0);
}

function checkAll() {
  const map = readMap();
  if (!map) { console.log('No structure map (.claude/structure.json); check skipped.'); return; }
  if (map.broken) { console.error('.claude/structure.json does not parse (it must be JSON); the structure cannot be checked.'); process.exit(1); }
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const violations = files.map((f) => [f, check(f, map)]).filter(([, s]) => s);
  if (!violations.length) { console.log(`Structure OK: ${files.length} files.`); return; }
  console.error(`Structure violations (${violations.length}):`);
  for (const [f, s] of violations) console.error(`  ${s.kind === 'clutter' ? 'FORBIDDEN' : 'OFF MAP'}  ${f}`);
  console.error('Move the file to the right place, put it under sandbox/, or update the map (as a technical decision).');
  process.exit(1);
}

// --add <folder>: the script builds the pattern (<folder>/**), so the caller cannot pass a glob. Refused: anything but one
// project-relative folder, a protected first folder (rule, guard, git, secrets), a path through a link out of the project,
// a file, a place the map already allows or denies, and a broken map. Atomic write; the map is committed, so git shows it.
const PROTECTED_TOP = /^(\.git|\.claude|\.codex|\.agents|\.github|\.vibe-kit|node_modules|secrets|\.env.*)$/i;
export function addFolder(args, dir = root) {
  if (args.length !== 1) return 'Usage: --add <folder> (one project-relative folder; the map gets <folder>/**)';
  const raw = args[0];
  if (!raw || raw.length > 200 || /[\0-\x1f\x7f]/.test(raw)) return 'The folder is empty, over 200 characters or has a control character.';
  if (/[*?[\]{}!,:]/.test(raw)) return `Glob, drive and special characters are not accepted: ${raw}`;
  if (/^[\\/~]/.test(raw)) return `Only a project-relative folder is accepted: ${raw}`;
  const d = raw.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  const parts = d.split('/');
  if (!d || parts.some((p) => !p || p === '.' || p === '..' || /[. ]$/.test(p))) return `Not a clean project-relative folder: ${raw}`;
  if (parts.some((p) => /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p))) return `A Windows device name is not a folder: ${raw}`;
  if (PROTECTED_TOP.test(parts[0])) return `${parts[0]} is a protected folder; it is not added to the map.`;
  const map = readMap(dir);
  if (!map) return 'No structure map (.claude/structure.json).';
  if (map.broken) return '.claude/structure.json does not parse (it must be JSON); fix it first.';
  const full = path.join(dir, ...parts);
  if (fs.existsSync(full) && !fs.statSync(full).isDirectory()) return `${d} is a file, not a folder.`;
  const inside = path.relative(realPath(dir), realPath(full));
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return `${d} leads out of the project (a link).`;
  const probe = `${d}/x.ts`;
  if (map.deny.some((re) => re.test(probe))) return `${d} matches a clutter pattern of the map.`;
  if (map.allow.some((re) => re.test(probe))) return `${d} is already allowed by the map.`;
  // A folder that holds an allow rule (src over src/lib/**) or sits in a folder a rule shapes (src/features/billing under
  // src/features/*/components/**) would override the map's layout: that is a map change for the user, not a new place
  // (each segment of the folder matches the rule's folder segment there; a deeper folder is outside the rule's layout)
  const overlap = (map.raw.allow ?? []).find((r) => {
    const folders = String(r).split('/').slice(0, -1);
    for (const [i, p] of parts.entries()) {
      if (i >= folders.length) return false;
      if (folders[i] === '**') return true;
      if (!globRegex(folders[i]).test(p)) return false;
    }
    return true;
  });
  if (overlap) return `${d} overlaps the map rule ${overlap}; changing that layout is a map change (edit .claude/structure.json after the user accepts).`;
  const pattern = `${d}/**`;
  const file = path.join(dir, '.claude', 'structure.json'), tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ ...map.raw, allow: [...(map.raw.allow ?? []), pattern] }, null, 2)}\n`);
  try { renameWithRetry(tmp, file); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
  console.log(`Structure map: added ${pattern} (.claude/structure.json). New files there are no longer refused.`);
  return null;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--add') {
    const error = addFolder(args.slice(1));
    if (error) { console.error(error); process.exit(1); }
  } else args.includes('--check') ? checkAll() : hook();
}
