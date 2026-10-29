#!/usr/bin/env node
// Working points and safe rollback (/rollback). For a user who does not know git:
//   node .claude/hooks/checkpoint.mjs --save "G-012 done, tests green"   tag the current commit as a "working point"
//   node .claude/hooks/checkpoint.mjs --list [--json]                        working points + recent commits
//   node .claude/hooks/checkpoint.mjs --restore <tag|commit> --yes           go back to that state
// Rollback does not delete history: unsaved work is stashed first, files are set to the target state and
// a NEW commit is made. So a rollback can be undone too. reset --hard is not used.
import { execFileSync } from 'node:child_process';
import { findRoot, isMain } from './shared.mjs';

// Tag prefix in users' repos: changing it hides the existing working points from --list and /rollback
const TAG_PREFIX = 'checkpoint/';

export function git(root, ...arg) {
  return execFileSync('git', arg, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const timestamp = (d = new Date()) => d.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

export function saveCheckpoint(root, note = '') {
  if (git(root, 'status', '--porcelain')) throw new Error('There are uncommitted changes; a checkpoint is only placed on a committed state. Commit first.');
  const label = `${TAG_PREFIX}${timestamp()}`;
  git(root, 'tag', '-a', label, '-m', note || 'checkpoint');
  return label;
}

export function listCheckpoints(root, n = 10) {
  const points = git(root, 'for-each-ref', '--sort=-creatordate', `--count=${n}`, '--format=%(refname:short)%09%(creatordate:short)%09%(contents:subject)%09%(*objectname:short)', `refs/tags/${TAG_PREFIX}`)
    .split('\n').filter(Boolean).map((s) => { const [label, date, note, commit] = s.split('\t'); return { label, date, note, commit }; });
  const commits = git(root, 'log', `-${n}`, '--format=%h%x09%ad%x09%s', '--date=format:%Y-%m-%d %H:%M')
    .split('\n').filter(Boolean).map((s) => { const [commit, date, message] = s.split('\t'); return { commit, date, message }; });
  return { points, commits };
}

export function restore(root, target) {
  const sha = git(root, 'rev-parse', '--verify', `${target}^{commit}`);
  const short = sha.slice(0, 7);
  let stashed = null;
  if (git(root, 'status', '--porcelain')) {
    stashed = `before rollback ${new Date().toISOString().slice(0, 16)}`;
    git(root, 'stash', 'push', '--include-untracked', '-m', stashed);
  }
  // Tracked files take the target state; files not in the target are deleted. Files in .gitignore (.env) are not touched.
  git(root, 'restore', `--source=${sha}`, '--staged', '--worktree', '--', '.');
  if (!git(root, 'status', '--porcelain')) return { changed: false, stashed, target: short };
  git(root, 'commit', '-m', `revert: back to ${target} (${short})`);
  return { changed: true, stashed, target: short, newCommit: git(root, 'rev-parse', '--short', 'HEAD') };
}

if (isMain(import.meta.url)) {
  const root = findRoot();
  const arg = process.argv.slice(2);
  // ONLY the first argument sets the mode: the permission list matches by prefix ("--list:*", "--save:*"),
  // so a trailing "--restore ... --yes" must not lead to an unapproved rollback.
  const mode = arg[0];
  try {
    if (mode === '--save') {
      console.log(`Checkpoint saved: ${saveCheckpoint(root, arg[1] ?? '')}`);
    } else if (mode === '--restore') {
      const target = arg[1];
      if (!target || target.startsWith('--') || arg[2] !== '--yes') {
        console.error('Rollback needs approval: node .claude/hooks/checkpoint.mjs --restore <tag|commit> --yes');
        process.exit(1);
      }
      const r = restore(root, target);
      if (r.stashed) console.log(`Your unsaved work was stashed: "${r.stashed}" (to bring it back: git stash pop)`);
      console.log(r.changed ? `Went back to ${r.target}, new commit: ${r.newCommit}. To undo this too: pick the previous commit with /rollback.` : `Files already match ${r.target}; no change.`);
    } else {
      const { points, commits } = listCheckpoints(root);
      if (arg.includes('--json')) { console.log(JSON.stringify({ points, commits })); process.exit(0); }
      console.log('Checkpoints:');
      console.log(points.length ? points.map((p) => `  ${p.label}  ${p.date}  ${p.note}`).join('\n') : '  (none; /build and /wrap-up save one when the tests are green)');
      console.log('Recent commits:');
      console.log(commits.map((c) => `  ${c.commit}  ${c.date}  ${c.message}`).join('\n'));
    }
  } catch (h) {
    console.error((h.stderr || h.message).toString().trim().split('\n')[0]);
    process.exit(1);
  }
}
