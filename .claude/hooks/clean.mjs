#!/usr/bin/env node
// Clears dependency and build output folders that a command recreates. `rm -rf` stays blocked for the AI.
//   node .claude/hooks/clean.mjs <folder>...
// Only exact names from the project root. A folder must be git-ignored, hold no tracked file and not be a link.
// Every name is checked before anything is deleted.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLEANABLE = new Set(['node_modules', '.next', '.turbo', '.expo', 'dist', 'coverage', '.venv', '.pytest_cache']);
// The script's own project, never CLAUDE_PROJECT_DIR or the shell's folder: a delete must not follow an environment value
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// GIT_DIR, GIT_INDEX_FILE and the like would answer for another repository
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));
const git = (...args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

function refusal(name) {
  if (!CLEANABLE.has(name)) return `not on the list (${[...CLEANABLE].join(', ')})`;
  let stat;
  try { stat = fs.lstatSync(path.join(root, name)); } catch { return null; } // nothing to delete
  if (!stat.isDirectory()) return 'not a folder';
  try { git('check-ignore', '-q', '--', name); } catch { return 'not ignored by git, or not a git repository'; }
  try { if (git('ls-files', '--', name).trim()) return 'it holds files tracked by git'; } catch { return 'git could not list it'; }
  return null;
}

const names = process.argv.slice(2);
if (!names.length) {
  console.error('Usage: node .claude/hooks/clean.mjs <folder>...');
  process.exit(1);
}
const refused = names.map((n) => [n, refusal(n)]).filter(([, why]) => why);
if (refused.length) {
  for (const [n, why] of refused) console.error(`Refused "${n}": ${why}.`);
  console.error('Nothing was deleted.');
  process.exit(1);
}
for (const n of names) {
  try {
    fs.rmSync(path.join(root, n), { recursive: true, force: true });
  } catch (e) {
    console.error(`Could not delete "${n}": ${e.code ?? e.message}. A running program may hold it open.`);
    process.exit(1);
  }
}
console.log(`Cleared: ${names.join(', ')}`);
