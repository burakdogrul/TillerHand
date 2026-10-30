#!/usr/bin/env node
// Structure guard: keeps the project's folder layout in line with the .claude/structure.json map.
//   PreToolUse (Write) hook: asks the user (ask) when a NEW file goes somewhere off the map;
//     denies when it matches a clutter pattern (.bak, *-old.*, "kopya" etc.). sandbox/ is always free.
//   node .claude/hooks/structure-guard.mjs --check   checks every file in git (CI and /findings-tech).
// Without a map (before the kit is set up) it blocks nothing.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readInput, decide, findRoot, isMain } from './shared.mjs';
import { t } from './lang.mjs';

const root = findRoot();

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

// Returns: null (fine) | { decision: 'deny' | 'ask', reason }
export function check(rel, map) {
  if (!map) return null;
  // The globs are not linear in the path length: a very long path is asked, not matched
  if (rel.length > 1024) return { decision: 'ask', reason: t(root, 'guard.structure.longPath', { length: rel.length }) };
  rel = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (rel.startsWith('sandbox/')) return null;
  if (map.broken) return { decision: 'ask', reason: t(root, 'guard.structure.brokenMap', { rel }) };
  const denied = map.deny.find((re) => re.test(rel));
  if (denied) {
    return { decision: 'deny', reason: `"${rel}" matches a clutter pattern (backup, old version, copy or temp file). Git history is already the backup; use sandbox/ for experiments.` };
  }
  if (map.allow.some((re) => re.test(rel))) return null;
  const top = [...new Set((map.raw.allow ?? []).map((d) => d.split('/')[0]).filter((d) => !d.includes('.') || d.startsWith('.')))].slice(0, 12);
  return {
    decision: 'ask',
    reason: t(root, 'guard.structure.offMap', { rel, top: top.join(', ') }),
  };
}

// Shell side, clutter only: a file a command creates that does not exist yet (a redirect target, the destination of
// cp/mv/copy/ln, the arguments of tee, touch, New-Item, Out-File, Set-Content) is checked against the deny list.
// Asked, not denied: the shell text is read by heuristics. Off-map files are not asked here (the Write hook does that).
// No map or a broken map: silent.
// shortcut: text-based (quoted words, variables, globs and bash -c bodies are skipped; cd followed in order only).
const CREATORS = /^(cp|copy|mv|move|ln|copy-item|move-item|cpi|mi)$/;
const MAKERS = /^(tee|touch|new-item|ni|out-file|set-content|add-content)$/;
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
  let cwd = dir;
  for (const raw of text.split(/&&|\|\||[;|\n&]/)) {
    const part = raw.replace(/(^|\s)#.*$/, '').replace(/^[\s({!]+|[\s)}]+$/g, '');
    const redirects = [...part.matchAll(/\d?>{1,2}\s*([^\s;&|<>]+)/g)].map((m) => m[1]);
    const words = part.replace(/\d?>{1,2}\s*\S+/g, ' ').trim().split(/\s+/);
    while (words.length && PREFIX.test(words[0])) words.shift();
    const name = path.basename(words[0] ?? '').toLowerCase().replace(/\.(exe|cmd)$/, '');
    const dest = words.findIndex((w) => /^-destination$/i.test(w));
    const args = words.slice(1).filter((w) => w && !w.startsWith('-'));
    if (/^(cd|pushd|set-location)$/.test(name)) { cwd = path.resolve(cwd, args[0] ?? '.'); continue; }
    const made = CREATORS.test(name) ? (dest > -1 ? [words[dest + 1] ?? ''] : args.slice(-1)) : MAKERS.test(name) ? args : [];
    for (const w of [...redirects, ...made]) {
      if (!w || /[$`*?{]/.test(w)) continue;
      const x = w.replace(/[-]/g, (c) => HIDDEN[c.charCodeAt(0) - 0xe000]);
      const full = path.resolve(cwd, x), rel = path.relative(root, full);
      if (rel.startsWith('..') || path.isAbsolute(rel) || fs.existsSync(full)) continue;
      if (check(rel, map)?.decision === 'deny') return { decision: 'ask', reason: t(root, 'guard.structure.clutterShell', { rel: rel.replace(/\\/g, '/') }) };
    }
  }
  return null;
}

function hook() {
  const g = readInput();
  if (!g) process.exit(0);
  const map = readMap(g.root);
  for (const { path: file, isNew } of g.files) {
    const full = path.resolve(g.dir, file);
    if (isNew === false || (isNew === undefined && fs.existsSync(full))) continue; // new files only
    const rel = path.relative(g.root, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue; // outside the project
    const s = check(rel, map);
    if (s) decide(g.tool, s.decision, s.decision === 'ask' ? t(g.root, 'guard.structure.prefix', { reason: s.reason }) : `Structure: ${s.reason}`);
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
  for (const [f, s] of violations) console.error(`  ${s.decision === 'deny' ? 'FORBIDDEN' : 'OFF MAP'}  ${f}`);
  console.error('Move the file to the right place, put it under sandbox/, or update the map (as a technical decision).');
  process.exit(1);
}

if (isMain(import.meta.url)) {
  process.argv.includes('--check') ? checkAll() : hook();
}
