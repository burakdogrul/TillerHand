#!/usr/bin/env node
// Commit gate: before every AI `git commit` it requires a light board review and a green deterministic gate (gate.mjs).
//   PreToolUse (Bash) hook: without review approval it stops the commit with exit code 2 and says what to do.
//   node .claude/hooks/commit-gate.mjs --approve "<members who took part, or a note>"   binds the approval to the current changes.
//   node .claude/hooks/commit-gate.mjs --skip "<reason>"   only when the user asks: skips the board and the gate (always asked).
// Exempt: no board set up, "Commit denetimi: kapalı" in docs/workflow/board.md, or only docs changed.
// Commits the user makes from their own terminal are not affected (this is a Claude Code hook).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { findRoot, isMain } from './shared.mjs';
import { t } from './lang.mjs';
import { unquote } from './destructive-guard.mjs';
import { isTestFile, isTestConfig, digest, readRecord } from './test-guard.mjs';
import { isCodeFile } from './edit-rounds.mjs';

// Project root (the script's location) even when called from a subfolder: approval and gate must not be written elsewhere
const root = findRoot();
const approvalFile = path.join(root, '.claude', 'state', 'commit-approval.json');
const git = (c) => execSync(`git ${c}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });

// Changes that will go into the commit: staged, unstaged in tracked files (git commit -a) and untracked new
// files (git add -A && git commit). -z: Turkish or spaced paths are not quoted and escaped
// The signature is each changed file's content on disk, so "git add" of the approved content keeps the approval and the gate.
// The commit takes the index: a file staged with other content than the disk (partial staging) also adds its index blob.
// --no-renames: a staged rename must list the same two paths as the unstaged delete + new file.
export function changes() {
  const list = (c) => git(c).split('\0').filter(Boolean);
  // .claude/state/ (approval, gate result) is not part of the signature: writing an approval must not change it even if not in .gitignore
  const untracked = list('ls-files --others --exclude-standard -z').filter((f) => !f.startsWith('.claude/state/'));
  const staged = new Set(list('diff --cached --no-renames --name-only -z')), unstaged = new Set(list('diff --no-renames --name-only -z'));
  const files = [...new Set([...staged, ...unstaged, ...untracked])].sort();
  // A file marked assume-unchanged or skip-worktree hides index-vs-disk changes from "git diff": its index blob always counts
  const hidden = list('ls-files -v -z').filter((l) => /^([a-z]|S) /.test(l)).map((l) => l.slice(2));
  const partial = [...new Set([...files.filter((f) => staged.has(f) && unstaged.has(f)), ...hidden])].sort();
  const blobs = new Map(partial.length ? list('ls-files -s -z').map((l) => [l.slice(l.indexOf('\t') + 1), l.split(' ')[1]]) : []);
  const h = crypto.createHash('sha256');
  // Per-file digest too: after an approval, only the files whose digest changed need review again
  const hashes = new Map();
  for (const f of files) {
    h.update(`\0${f}\0`);
    let body = null;
    try { body = fs.readFileSync(path.join(root, f)); } catch { /* deleted */ }
    h.update(body ?? '\0silindi');
    hashes.set(f, body ? digest(body) : 'silindi');
  }
  for (const f of partial) {
    h.update(`\0index:${f}:${blobs.get(f)}`);
    hashes.set(f, `${hashes.get(f)}:${blobs.get(f)}`);
  }
  return { files, signature: h.digest('hex'), hashes: Object.fromEntries(hashes) };
}

// Files changed since the approval (all of them for an approval written before 3.32.0, which has no digests)
export const sinceApproval = (approval, d) => d.files.filter((f) => !approval?.hashes || !Object.hasOwn(approval.hashes, f) || approval.hashes[f] !== d.hashes[f]);

// git's global options may come before commit: git --no-pager commit, git -C x commit, git --git-dir=x commit; git.exe on Windows
const commitRe = (verbs) => new RegExp(`\\bgit(?:\\.exe)?["']?(?:\\s+(?:-[cC]\\s+\\S+|--?[\\w-]+(?:=\\S+)?))*\\s+(?:${verbs.join('|')})(?=\\s|$|["';&|)])`);
const COMMIT = commitRe(['commit']);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// git aliases that run commit ([alias] ci = commit, cm = !git commit), from git config and from an inline -c alias.x=commit
export function commitPattern(command) {
  if (!/\bgit/.test(command)) return COMMIT; // this hook runs on every Bash call: git config only when git is named
  // An alias defined in the same command (git -c alias.x=…, git config alias.x …, GIT_CONFIG_* env) cannot be read beforehand:
  // every git subcommand then counts as a commit (inline), and the chain check, which only knows plain commit, stops the command.
  if (/GIT_CONFIG_|\balias\.[\w-]+=|\bconfig\b[^;&|\n]*\balias\./i.test(command)) return Object.assign(commitRe(['\\S+']), { inline: true });
  let config = '';
  try { config = git('config --get-regexp ^alias\\.'); } catch { /* no alias or no repo */ }
  // Aliases are case-insensitive; one whose value names commit anywhere (a !shell alias too) or calls such an alias is a commit
  const aliases = [...config.matchAll(/^alias\.(\S+)\s+(.*)$/gm)].map(([, name, value]) => [name.toLowerCase(), value]);
  const names = new Set();
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, value] of aliases) {
      const words = value.toLowerCase().split(/[^\w.-]+/);
      if (!names.has(name) && (words.includes('commit') || words.some((w) => names.has(w)))) { names.add(name); grew = true; }
    }
  }
  return names.size ? new RegExp(commitRe(['commit', ...[...names].map(escapeRe)]).source, 'i') : COMMIT;
}

// The hook sees the command before it runs: anything that can change files before the commit defeats the review.
// Allowed: commit alone, with "git add" and "cd" before it. A heredoc and a $(cat <<'EOF' … EOF) message do not count as commands.
export function chainIssue(command, commit = COMMIT) {
  const k = command.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, '<<HEREDOC')
    .replace(/\$\(\s*cat\s+<<HEREDOC\s*\)/g, 'MESAJ')
    .replace(/'[^']*'/g, "''")
    .replace(/"((?:[^"\\]|\\.)*)"/g, (m, inner) => (/\$\(|`/.test(inner) ? m : '""'))
    .replace(/\d*>&\d+/g, '');
  if (/\$\(|`/.test(k)) return 'the command has a substitution ($(...) or `...`)';
  const parts = k.split(/&&|\|\||[;|&\n]/).map((s) => s.trim()).filter(Boolean);
  return parts.every((s) => commit.test(s) || /^git\s+add\b/.test(s) || /^cd\b/.test(s)) ? null : 'the commit is chained with other commands';
}

export const docsOnly = (files) => files.every((f) => /\.(md|txt)$/i.test(f) || f.startsWith('docs/'));

function hasBoard() {
  const agents = path.join(root, '.claude', 'agents');
  // board-chair (council chair) ships with the template and is not a board member; member files are copied in the /start Kurul step
  return fs.existsSync(agents) && fs.readdirSync(agents).some((f) => /^board-.+\.md$/.test(f) && f !== 'board-chair.md');
}

function reviewOff() {
  try {
    return /^\*\*Commit denetimi:\*\*\s*kapalı/im.test(fs.readFileSync(path.join(root, 'docs', 'workflow', 'board.md'), 'utf8'));
  } catch {
    return false;
  }
}

// A note starting with "atlandı" skips the board and the gate. --approve refuses it whatever the spelling
// ($'atland\xc4\xb1', $(printf ...)); only --skip writes it, and --skip is always asked.
const SKIPPED = /^atlandı/i;

function approve(note) {
  if (SKIPPED.test(note)) {
    console.error('A note starting with "atlandı" is not written with --approve. If the user explicitly asks: node .claude/hooks/commit-gate.mjs --skip "<reason>"');
    process.exit(1);
  }
  save(note);
}

function save(note) {
  const { signature, files, hashes } = changes();
  fs.mkdirSync(path.dirname(approvalFile), { recursive: true });
  fs.writeFileSync(approvalFile, JSON.stringify({ signature, note, files, hashes, date: new Date().toISOString() }));
  console.log(`Commit gate opened (${files.length} files). Note: ${note}`);
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
function readGate() {
  const g = readJson(path.join(root, '.claude', 'state', 'gate.json'));
  if (!g) return null;
  // A hand-broken file must not crash the hook (a crash exits 1, which does not block the commit)
  const checks = (Array.isArray(g.checks) ? g.checks : []).filter((k) => k && typeof k === 'object').map((k) => ({ name: k.name, status: k.status }));
  return { signature: g.signature, passed: g.passed, empty: g.empty, checks };
}
function readApproval() {
  const a = readJson(approvalFile);
  return a && { signature: a.signature, note: a.note, date: a.date,
    hashes: a.hashes && typeof a.hashes === 'object' && !Array.isArray(a.hashes) ? a.hashes : null };
}

// --status: has this change already been reviewed? /review-changes and the commit board read this before convening
function status() {
  let d;
  try { d = changes(); } catch { console.log('Not a git repository.'); return; }
  if (!d.files.length) { console.log('No changes.'); return; }
  const approval = readApproval(), gate = readGate();
  // A skipped review covers no file: it is not "reviewed", and after a change the whole diff is still to be reviewed
  const skipped = SKIPPED.test(String(approval?.note ?? ''));
  const gateText = gate?.signature !== d.signature ? 'the gate has not run for these changes' : gate.passed ? 'gate green' : 'gate red';
  if (skipped && approval.signature === d.signature) console.log(`Review skipped (${approval.note}, ${approval.date ?? '-'}): these changes were not reviewed · ${gateText}.`);
  else if (!approval || skipped) console.log(`No approval: the board has not reviewed these changes (${d.files.length} files) · ${gateText}.`);
  else if (approval.signature === d.signature) console.log(`Approval valid (${approval.note}, ${approval.date ?? '-'}): these changes were reviewed, no new review needed · ${gateText}.`);
  else console.log(`Approval is stale (${approval.note}). Changed since the last approval: ${sinceApproval(approval, d).join(', ')}. Review only these · ${gateText}.`);
}

// This project's own commit-gate.mjs, resolved from the shell's folder ($CLAUDE_PROJECT_DIR, absolute, relative or ./ spelling),
// is masked so it is not read as the gate approval; any other *gate.mjs (sandbox/.claude/hooks/commit-gate.mjs, a renamed
// copy of gate.mjs) still is. Only a single plain "node <path> --approve <note>" is masked: a chain, subshell, cd, env -C or
// expansion can change the folder or the file the text names.
const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
const PLAIN_APPROVE = /^\s*node\s+("[^"\n]*"|'[^'\n]*'|[^\s"'`;&|<>(){}]+)\s+--approve(\s+("[^"\n$`]*"|'[^'\n]*'|[^\s"'`$;&|<>(){}]+))?\s*$/;
export function maskOwnHook(command, dir) {
  if (!PLAIN_APPROVE.test(command)) return command;
  const own = real(path.join(root, '.claude', 'hooks', 'commit-gate.mjs'));
  return command.replace(/"([^"\n]*commit-gate\.mjs)"|'([^'\n]*commit-gate\.mjs)'|([^\s"';&|]*commit-gate\.mjs)\b/gi, (m, a, b, c) => {
    const p = (a ?? b ?? c).replace(/\$\{?CLAUDE_PROJECT_DIR\}?|%CLAUDE_PROJECT_DIR%|\$env:CLAUDE_PROJECT_DIR/gi, process.env.CLAUDE_PROJECT_DIR || root);
    return samePath(real(path.resolve(dir, p)), own) ? 'KIT-COMMIT-HOOK' : m;
  });
}

async function hook() {
  let command = '', dir = root;
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    command = input.tool_input?.command ?? '';
    if (typeof input.cwd === 'string' && input.cwd) dir = input.cwd;
  } catch {
    process.exit(0);
  }
  // --skip bypasses the gate and the board: the user is asked in every spelling (the AI must not write it on its own)
  // A commit whose message names --skip goes on to the commit checks below (a real --skip chained to a commit is stopped there).
  const open = unquote(command);
  const commit = commitPattern(command);
  if (!commit.test(command) && [command, open].some((c) => /commit-gate\.mjs\b[^;&|\n]*--skip\b/i.test(c))) {
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask',
      permissionDecisionReason: t(root, 'guard.commit.skipAsk') } }));
    process.exit(0);
  }
  // The gate command approval gives the commands in AGENTS.md permission to run: the user is asked (also covers spellings the permission list misses).
  // Only this project's commit-gate.mjs --approve is left out (maskOwnHook); both the raw and unquoted text are tested.
  const masked = maskOwnHook(command, dir);
  if ([masked, unquote(masked)].some((c) => /gate\.mjs\b[^;&|\n]*--approve\b/i.test(c))) {
    // The prompt reads AGENTS.md now: a chain, an env variable, a node flag or a redirect must not change it after the
    // prompt and get another list approved. Only the exact spelling is accepted.
    if (!/^\s*node\s+(\.\/)?\.claude[\\/]hooks[\\/]gate\.mjs\s+(['"]?)--approve\2\s*$/.test(command)) {
      console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
        permissionDecisionReason: 'The gate command approval runs only with exactly this spelling, on its own (no chain, environment variable, flag or redirect): node .claude/hooks/gate.mjs --approve' } }));
      process.exit(0);
    }
    // Loaded only here: every Bash call runs this hook, and gate.mjs pulls in the dashboard and edit-round modules
    const { approvedCommands, commandList } = await import('./gate.mjs');
    const list = commandList(approvedCommands(root)) || t(root, 'guard.commit.noCommands');
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask',
      permissionDecisionReason: t(root, 'guard.commit.gateApprovalAsk', { list }) } }));
    process.exit(0);
  }
  if (!commit.test(command) && !commit.test(open)) process.exit(0);
  if (!hasBoard() || reviewOff()) process.exit(0);
  const chain = chainIssue(command, commit.inline ? COMMIT : commit);
  if (chain) {
    process.stderr.write(`Commit stopped: ${chain}. The gate reviews the changes as they were before the command runs; run the commit on its own ` +
      '(or only as "git add … && git commit"). Run push and other commands separately.\n');
    process.exit(2);
  }

  let d;
  try {
    d = changes();
  } catch {
    process.exit(0); // not a git repo
  }
  if (!d.files.length || docsOnly(d.files)) process.exit(0);

  const approval = readApproval();
  // The deterministic gate (gate.mjs) must be green for the same changes; not required if the user said "atlandı"
  const gate = readGate();
  const skipped = SKIPPED.test(String(approval?.note ?? ''));
  // Test files only test-writer writes (AGENTS.md rule 7): one changed past the PreToolUse guards stops the commit.
  // Deleted files are left to the guards that ask before a delete. Only code files: snapshots, images and fixtures are
  // written by the test runner, not by Write/Edit. A partially staged test (git apply --cached, skip-worktree) commits an
  // index blob the record does not describe, so it always stops.
  const written = readRecord(root);
  const foreign = d.files.filter((f) => isTestFile(f) && isCodeFile(f) && !isTestConfig(f) && d.hashes[f] !== 'silindi' && written[f] !== d.hashes[f]);
  if (foreign.length && !(skipped && approval.signature === d.signature)) {
    process.stderr.write(`Commit stopped: test-writer did not write these test files, or they changed after it wrote them, or they were partially staged: ${foreign.join(', ')}.\n` +
      'Only the test-writer agent writes test files with Write/Edit (AGENTS.md rule 7); a test written by patch, script, shell, git mv or Codex/Antigravity does not count.\n' +
      'If a change is needed, have test-writer review the file and rewrite it with Write/Edit. If the user made the change themselves ' +
      'and explicitly asks to skip the review for this commit, use --skip "user request".\n');
    process.exit(2);
  }
  if (approval?.signature === d.signature && (skipped || (gate?.signature === d.signature && gate.passed === true))) process.exit(0);
  if (approval?.signature === d.signature) {
    const failed = gate?.signature === d.signature ? gate.checks.filter((k) => k.status === 'failed').map((k) => k.name) : null;
    process.stderr.write(failed && !failed.length && gate.empty
      ? 'Commit stopped: the deterministic gate is empty (no check ran). Fill in AGENTS.md → Komutlar and run the gate again.\n' +
        'If the user explicitly asks for this commit, use --skip "user request".\n'
      : failed
      ? `Commit stopped: the deterministic gate is red (${failed.join(', ') || 'failed'}). Fix it, run node .claude/hooks/gate.mjs --run again, then approve.\n` +
        'If the user explicitly asks for an intermediate (WIP) commit, use --skip "user request".\n'
      : 'Commit stopped: the deterministic gate has not run for these changes (or the changes were modified after it ran). ' +
        'Run node .claude/hooks/gate.mjs --run; if nothing is red, renew the board approval and try the commit again.\n');
    process.exit(2);
  }

  const delta = approval && !skipped ? sinceApproval(approval, d) : [];
  process.stderr.write(
    (delta.length && delta.length < d.files.length
      ? `Commit stopped: files changed since the last approval (${approval.note}) were not reviewed: ${delta.join(', ')}.\n` +
        'The board looks only at the diff of these files; files approved earlier are not reviewed again.\n'
      : `Commit stopped: the board has not reviewed these changes (${d.files.length} files).\n`) +
      '0. Run the deterministic gate (lint, types, tests, Semgrep) with node .claude/hooks/gate.mjs --run; give its output to the members.\n' +
      '1. Following .claude/board/rules.md §3, run at most 2 relevant board members for the changed files with model "haiku", on the diff only.\n' +
      '2. If there is no RET: node .claude/hooks/commit-gate.mjs --approve "<members who took part>" and try the commit again.\n' +
      '3. If there is a RET, do not commit; ask the user about the finding and the options.\n' +
      'If the user explicitly wants to skip the review for this commit, use --skip "user request".\n'
  );
  process.exit(2);
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--approve'), j = process.argv.indexOf('--skip');
  if (i > -1) approve(process.argv[i + 1] || 'unspecified');
  else if (j > -1) save(`atlandı: ${process.argv[j + 1] || 'user request'}`);
  else if (process.argv.includes('--status')) status();
  else hook();
}
