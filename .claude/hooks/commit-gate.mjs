#!/usr/bin/env node
// Commit gate: before every AI `git commit` it requires a light board review and a green deterministic gate (gate.mjs).
//   PreToolUse (Bash) hook: without review approval it stops the commit with exit code 2 and says what to do.
//   node .claude/hooks/commit-gate.mjs --approve "<members who took part, or a note>"   binds the approval to the current changes.
//   node .claude/hooks/commit-gate.mjs --skip "<reason>"   only when the user asks: skips the board and the gate (always asked).
//   node .claude/hooks/commit-gate.mjs --accept-tests "<reason>" <file>...   the user changed these test files by hand: accepts their content; the board and the gate still run (always asked).
// Commands that make commits with no working-tree change to review (git merge, git revert…) and git calls the text cannot
// read ($g commit, git $(echo commit)) have nothing to bind an approval to: the user is asked.
// Exempt: no board set up, "Commit review: off" in docs/workflow/board.md, or only docs changed.
// On a try/* branch the board and the gate are not required: /lock squashes the branch into main, and that commit needs both.
// A change inside the fast lane (fastLaneIssues) with a green gate needs no board, for up to 3 commits in a row (/tweak).
// Commits the user makes from their own terminal are not affected (this is a Claude Code hook).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { findRoot, isMain, reviewOff, parseInput, decisionText, SENSITIVE, projectBase } from './shared.mjs';
import { t } from './lang.mjs';
import { unquote, MAX_COMMAND } from './destructive-guard.mjs';
import { isTestFile, isTestConfig, digest, readRecord, saveRecord } from './test-guard.mjs';
import { isCodeFile } from './edit-rounds.mjs';

// Project root (the script's location) even when called from a subfolder: approval and gate must not be written elsewhere
// shortcut: root comes from the process cwd, which Claude Code sets to the session cwd (the input cwd); read it from the input if they ever differ
const root = findRoot();
const approvalFile = path.join(root, '.claude', 'state', 'commit-approval.json');
const git = (c) => execSync(`git ${c}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024, timeout: 20000 });

// Changes that will go into the commit: staged, unstaged in tracked files (git commit -a) and untracked new
// files (git add -A && git commit). -z: non-ASCII or spaced paths are not quoted and escaped
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
    h.update(body ?? '\0deleted');
    hashes.set(f, body ? digest(body) : 'deleted');
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
// Every option has one reading: with two, "-c -c -c …" or "--a --a --a …" backtracks exponentially, and a hook that times out lets the command run.
const VALUE_OPTIONS = '(?:-[cC]|--(?:git-dir|work-tree|namespace|exec-path|super-prefix|config-env|attr-source))';
// One shell word: git -C "my dir" commit, git -c user.name='A B' commit, git -C my\ dir commit
const WORD = `(?:"[^"]*"|'[^']*'|\\\\.|[^\\s"'\\\\])+`;
const GLOBALS = `(?:\\s+(?:${VALUE_OPTIONS}\\s+${WORD}|(?!${VALUE_OPTIONS}\\s)-[\\w-]+(?:=${WORD})?))*`;
const VERB_END = '(?=\\s|$|["\';&|)])';
// i: Windows runs GIT.exe as git. $GIT is a variable, not git by name.
const commitRe = (verbs) => new RegExp(`(?<!\\$)\\bgit(?:\\.exe)?["']?${GLOBALS}\\s+["']?(?:${verbs.join('|')})${VERB_END}`, 'i');
const COMMIT = commitRe(['commit']);
// shortcut: these rules read text, so a quoted mention (grep "git merge") also asks; a script file, xargs git, base64 | sh or a mixed-quote spelling (git -C "a b" c"ommit") is not seen; a git hook would close that.
const MAKES_COMMITS = ['merge', 'cherry-pick', 'revert', 'am', 'rebase', 'commit-tree', 'fast-import'];
const OTHER_COMMIT = [
  // git merge, git $(echo commit), git "$@"
  commitRe([...MAKES_COMMITS, '[$`%@]\\S*']),
  // $g commit, $(which git) merge, %g% commit
  new RegExp(`(?:\\$\\{?\\w+\\}?|\\$\\([^)\\n]{0,200}\\)|\`[^\`\\n]{0,200}\`|%\\w+%)["']?${GLOBALS}\\s+["']?(?:commit|${MAKES_COMMITS.join('|')})${VERB_END}`, 'i'),
];
// Backing out makes no commit, but only as a whole command: git merge x # --abort still merges
const BACK_OUT = new RegExp(`\\bgit(?:\\.exe)?${GLOBALS}\\s+(?:merge|cherry-pick|revert|am|rebase)\\s+--(?:abort|quit)(?=\\s*(?:$|[;&|\\n]))`, 'gi');
const makesOtherCommit = (command) => OTHER_COMMIT.some((re) => re.test(command.replace(BACK_OUT, '')));
// These rules are not linear in the length, and a hook that times out lets the command run: a long command that names any of this is asked unread
const GATE_WORDS = new RegExp(`git|commit|${MAKES_COMMITS.join('|')}|gate\\.mjs`, 'i');
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
    .replace(/\$\(\s*cat\s+<<HEREDOC\s*\)/g, 'MESSAGE')
    .replace(/'[^']*'/g, "''")
    .replace(/"((?:[^"\\]|\\.)*)"/g, (m, inner) => (/\$\(|`/.test(inner) ? m : '""'))
    .replace(/\d*>&\d+/g, '');
  if (/\$\(|`/.test(k)) return 'the command has a substitution ($(...) or `...`)';
  const parts = k.split(/&&|\|\||[;|&\n]/).map((s) => s.trim()).filter(Boolean);
  return parts.every((s) => commit.test(s) || /^git\s+add\b(?!.*\s(-\w*f\w*|--force)(\s|$))/.test(s) || /^cd\b/.test(s)) ? null : 'the commit is chained with other commands';
}

export const docsOnly = (files) => files.every((f) => /\.(md|txt)$/i.test(f) || f.startsWith('docs/'));

function hasBoard() {
  const agents = path.join(root, '.claude', 'agents');
  // board-chair (council chair) ships with the template and is not a board member; member files are copied in the /start board step
  return fs.existsSync(agents) && fs.readdirSync(agents).some((f) => /^board-.+\.md$/.test(f) && f !== 'board-chair.md');
}

function boardReviewOff() {
  try {
    return reviewOff(fs.readFileSync(path.join(root, 'docs', 'workflow', 'board.md'), 'utf8'));
  } catch {
    return false;
  }
}

// A note starting with "skipped" skips the board and the gate. --approve refuses it in any case;
// only --skip writes it, and --skip is always asked.
const SKIPPED = /^skipped/i;

function approve(note) {
  if (SKIPPED.test(note)) {
    console.error('A note starting with "skipped" is not written with --approve. If the user explicitly asks: node .claude/hooks/commit-gate.mjs --skip "<reason>"');
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

// A partially staged test keeps its index blob in the hash: the commit would take content the record does not describe
// The files are arguments so the approval prompt shows exactly what is being accepted
function acceptTests(reason, names) {
  const d = changes();
  const accepted = names.map((f) => path.relative(root, path.resolve(root, f)).split(path.sep).join('/'));
  const bad = accepted.filter((f) => !d.files.includes(f) || !isTestFile(f) || !isCodeFile(f) || isTestConfig(f) || d.hashes[f] === 'deleted' || d.hashes[f].includes(':'));
  if (!names.length || bad.length) {
    console.error(`Nothing accepted. ${bad.length ? `Not a changed test file: ${bad.join(', ')}.` : 'Name the files: --accept-tests "<reason>" <file>...'}`);
    process.exit(1);
  }
  const files = readRecord(root);
  for (const f of accepted) files[f] = d.hashes[f];
  if (!saveRecord(root, files)) {
    console.error('Nothing accepted: the record could not be written.');
    process.exit(1);
  }
  console.log(`Test files accepted (${reason}): ${accepted.join(', ')}. The board review and the gate still run.`);
}

const onTrialBranch = () => { try { return git('symbolic-ref --short -q HEAD').trim().startsWith('try/'); } catch { return false; } };

// Fast lane: measured from the diff, never from what the AI says
const FAST_FILES = 2, FAST_LINES = 30, FAST_COMMITS = 3;
const RISKY = /(^|\/)migrations?\/|(^|\/)schema\.(prisma|sql)$|^(prisma|drizzle|supabase|alembic)\/|(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|requirements[^/]*\.txt|pyproject\.toml|uv\.lock|poetry\.lock|Gemfile(\.lock)?|go\.(mod|sum)|Cargo\.(toml|lock))$|^\.(github|claude|codex|agents)\/|^(AGENTS|CLAUDE)\.md$|(^|\/)Dockerfile|(^|\/)(docker-)?compose\.ya?ml$|(^|\/)(api|routes?|controllers?|handlers?)\/|(^|\/)(route|router|middleware|proxy)\.\w+$|\.(sql|rules)$|^\.(husky|githooks|vscode)\/|^(\.pre-commit-config|lefthook|\.mcp\.json$|\.npmrc$|\.yarnrc|\.gitmodules$|vercel\.json$|firebase\.json$|tsconfig|\.semgrep|(next|eslint|vitest|playwright|jest)\.config\.)/i;

// Added + deleted lines, new files included; null for a binary or unreadable file
function changedLines(d) {
  try {
    const stat = git('diff HEAD --numstat --no-renames -z').split('\0').filter(Boolean).map((l) => l.split('\t'));
    if (stat.some(([added]) => added === '-')) return null;
    const tracked = new Set(stat.map(([, , f]) => f));
    let lines = stat.reduce((n, [added, deleted]) => n + Number(added) + Number(deleted), 0);
    for (const f of d.files.filter((x) => !tracked.has(x))) {
      const body = fs.readFileSync(path.join(root, f));
      if (body.includes(0)) return null;
      lines += body.toString('utf8').split('\n').filter((l, i, all) => i < all.length - 1 || l).length;
    }
    return lines;
  } catch { return null; }
}

// numstat shows a mode change as 0 lines and a submodule pointer as 2
function modeChanged() {
  try {
    return git('diff HEAD --raw --no-renames -z').split(' ').some((l) => {
      const [a, b] = l.slice(1).split(' ');
      return l.startsWith(':') && (a === '160000' || b === '160000' || (a !== b && a !== '000000' && b !== '000000'));
    });
  } catch { return true; }
}

// Reasons this change is outside the fast lane; empty when it fits
export function fastLaneIssues(d) {
  const issues = [];
  if (d.files.length > FAST_FILES) issues.push(`${d.files.length} files (limit ${FAST_FILES})`);
  const lines = changedLines(d);
  if (lines === null) issues.push('a binary or unreadable file');
  else if (lines > FAST_LINES) issues.push(`${lines} lines (limit ${FAST_LINES})`);
  const risky = d.files.filter((f) => RISKY.test(f) || SENSITIVE.test(f) || isTestFile(f) || isTestConfig(f));
  if (risky.length) issues.push(`risky path: ${risky.join(', ')}`);
  if (Object.values(d.hashes).some((h) => h.includes(':'))) issues.push('a partially staged file');
  if (modeChanged()) issues.push('a file mode or submodule change');
  // /lock squashes a whole trial here: its size says nothing, that commit always needs the board
  try {
    const dir = path.resolve(root, git('rev-parse --git-dir').trim());
    if (['MERGE_HEAD', 'SQUASH_MSG'].some((f) => fs.existsSync(path.join(dir, f)))) issues.push('a merge in progress');
  } catch { issues.push('git could not read the merge state'); }
  return issues;
}

const counterFile = path.join(root, '.claude', 'state', 'fast-commits.json');
// A broken file reads as full: it asks for the board, never for a fresh start
function fastCount() {
  let raw;
  try { raw = fs.readFileSync(counterFile, 'utf8'); } catch { return 0; }
  const n = readJson(counterFile)?.count;
  return raw && Number.isInteger(n) && n >= 0 ? n : FAST_COMMITS;
}
// Counted before the commit runs, so a failed commit counts too: the safe direction
function takeFastCommit() {
  const count = fastCount();
  if (count >= FAST_COMMITS) return false;
  try {
    fs.mkdirSync(path.dirname(counterFile), { recursive: true });
    fs.writeFileSync(counterFile, JSON.stringify({ count: count + 1 }));
    return true;
  } catch { return false; }
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
  // The kit's own hook is the one Claude Code runs (the main checkout), never a worktree's copy that a branch can change
  const own = real(path.join(projectBase(), '.claude', 'hooks', 'commit-gate.mjs'));
  return command.replace(/"([^"\n]*commit-gate\.mjs)"|'([^'\n]*commit-gate\.mjs)'|([^\s"';&|]*commit-gate\.mjs)\b/gi, (m, a, b, c) => {
    const p = (a ?? b ?? c).replace(/\$\{?CLAUDE_PROJECT_DIR\}?|%CLAUDE_PROJECT_DIR%|\$env:CLAUDE_PROJECT_DIR/gi, projectBase());
    return samePath(real(path.resolve(dir, p)), own) ? 'KIT-COMMIT-HOOK' : m;
  });
}

// Claude Code stops a tool call with exit code 2 and the reason on stderr; Codex and Antigravity get their JSON decision
// (shared.decisionText; Codex has no ask, so an ask is a deny there and the user runs the command themselves).
let tool = 'claude';
const decideOut = (decision, reason) => { console.log(decisionText(tool, decision, reason)); process.exit(0); };
function stop(reason) {
  if (tool !== 'claude') decideOut('deny', reason.trim());
  process.stderr.write(reason);
  process.exit(2);
}

const internalError = (e) => t(root, 'guard.commit.internalError', { error: String(e?.message ?? e).slice(0, 200) });

async function hook() {
  let raw = '', dir = root;
  try {
    const g = parseInput(JSON.parse(fs.readFileSync(0, 'utf8')) ?? {});
    tool = g.tool;
    raw = String(g.command ?? '');
    if (g.dir) dir = g.dir;
  } catch {
    process.exit(0);
  }
  if (raw.length > MAX_COMMAND) {
    if ([raw, unquote(raw)].some((c) => GATE_WORDS.test(c))) decideOut('ask', t(root, 'guard.commit.tooLong'));
    process.exit(0);
  }
  // A backslash-newline is a line continuation: bash joins the words ("git comm\<newline>it" is git commit), the
  // text rules may also need it as a space ("git commit\<newline>-m x"). Whichever spelling is a commit is checked.
  const joined = raw.replace(/\\\r?\n/g, '');
  const command = [joined, unquote(joined)].some((c) => commitPattern(joined).test(c)) ? joined : raw.replace(/\\\r?\n/g, ' ');
  // --skip bypasses the gate and the board: the user is asked in every spelling (the AI must not write it on its own)
  // A commit whose message names --skip goes on to the commit checks below (a real --skip chained to a commit is stopped there).
  const open = unquote(command);
  const commit = commitPattern(command);
  if (!commit.test(command) && [command, open].some((c) => /commit-gate\.mjs\b[^;&|\n]*--skip\b/i.test(c))) decideOut('ask', t(root, 'guard.commit.skipAsk'));
  if (!commit.test(command) && [command, open].some((c) => /commit-gate\.mjs\b[^;&|\n]*--accept-tests\b/i.test(c))) decideOut('ask', t(root, 'guard.commit.acceptTestsAsk'));
  // The gate command approval gives the commands in AGENTS.md permission to run: the user is asked (also covers spellings the permission list misses).
  // Only this project's commit-gate.mjs --approve is left out (maskOwnHook); both the raw and unquoted text are tested.
  const masked = maskOwnHook(command, dir);
  if ([masked, unquote(masked)].some((c) => /gate\.mjs\b[^;&|\n]*--approve\b/i.test(c))) {
    // The prompt reads AGENTS.md now: a chain, an env variable, a node flag or a redirect must not change it after the
    // prompt and get another list approved. Only the exact spelling is accepted.
    if (!/^\s*node\s+(\.\/)?\.claude[\\/]hooks[\\/]gate\.mjs\s+(['"]?)--approve\2\s*$/.test(command)) {
      decideOut('deny', 'The gate command approval runs only with exactly this spelling, on its own (no chain, environment variable, flag or redirect): node .claude/hooks/gate.mjs --approve');
    }
    // Loaded only here: every Bash call runs this hook, and gate.mjs pulls in the dashboard and edit-round modules
    const { approvedCommands, commandList, readAgents, unknownCommandKeys } = await import('./gate.mjs');
    const list = commandList(approvedCommands(root)) || t(root, 'guard.commit.noCommands');
    const unknown = unknownCommandKeys(readAgents(root));
    const note = unknown.length ? `\n${t(root, 'guard.commit.gateUnknownKeys', { keys: unknown.join(', ') })}` : '';
    decideOut('ask', t(root, 'guard.commit.gateApprovalAsk', { list }) + note);
  }
  // A plain commit stays with the commit checks below: what its message names is text
  if (!commit.test(command) && [command, open].some(makesOtherCommit) && hasBoard() && !boardReviewOff()) decideOut('ask', t(root, 'guard.commit.otherCommitAsk'));
  if (!commit.test(command) && !commit.test(open)) process.exit(0);
  if (!hasBoard() || boardReviewOff()) process.exit(0);
  const chain = chainIssue(command, commit.inline ? COMMIT : commit);
  if (chain) {
    stop(`Commit stopped: ${chain}. The gate reviews the changes as they were before the command runs; run the commit on its own ` +
      '(or only as "git add … && git commit"). Run push and other commands separately.\n');
  }

  let d;
  try {
    d = changes();
  } catch (e) {
    decideOut('ask', internalError(e)); // git failed or there is no repo: unread changes must not pass as reviewed
  }
  if (!d.files.length || docsOnly(d.files)) process.exit(0);

  const approval = readApproval();
  // The deterministic gate (gate.mjs) must be green for the same changes; not required if the user said "skipped"
  const gate = readGate();
  const skipped = SKIPPED.test(String(approval?.note ?? ''));
  // Test files only test-writer writes (AGENTS.md rule 7): one changed past the PreToolUse guards stops the commit.
  // Deleted files are left to the guards that ask before a delete. Only code files: snapshots, images and fixtures are
  // written by the test runner, not by Write/Edit. A partially staged test (git apply --cached, skip-worktree) commits an
  // index blob the record does not describe, so it always stops.
  // Only Claude Code records what test-writer wrote; on Codex and Antigravity test separation is a written rule (AGENTS.md)
  const written = readRecord(root);
  const foreign = tool !== 'claude' ? [] : d.files.filter((f) => isTestFile(f) && isCodeFile(f) && !isTestConfig(f) && d.hashes[f] !== 'deleted' && written[f] !== d.hashes[f]);
  if (foreign.length && !(skipped && approval.signature === d.signature)) {
    stop(`Commit stopped: test-writer did not write these test files, or they changed after it wrote them, or they were partially staged: ${foreign.join(', ')}.\n` +
      'Only the test-writer agent writes test files with Write/Edit (AGENTS.md rule 7); a test written by patch, script, shell, git mv or Codex/Antigravity does not count.\n' +
      'If a change is needed, have test-writer review the file and rewrite it with Write/Edit. If the user made the change themselves, ' +
      'use --accept-tests "user changed it" <files>: the board and the gate still run. To skip the whole review, the user must ask: --skip "user request".\n');
  }
  if (onTrialBranch()) process.exit(0);
  const gateGreen = gate?.signature === d.signature && gate.passed === true;
  if (approval?.signature !== d.signature && gateGreen && !fastLaneIssues(d).length && takeFastCommit()) process.exit(0);
  if (approval?.signature === d.signature && (skipped || gateGreen)) {
    if (!skipped) fs.rmSync(counterFile, { force: true }); // a reviewed commit starts the fast lane over
    process.exit(0);
  }
  if (approval?.signature === d.signature) {
    const failed = gate?.signature === d.signature ? gate.checks.filter((k) => k.status === 'failed').map((k) => k.name) : null;
    stop(failed && !failed.length && gate.empty
      ? 'Commit stopped: the deterministic gate is empty (no check ran). Fill in AGENTS.md → Commands and run the gate again.\n' +
        'If the user explicitly asks for this commit, use --skip "user request".\n'
      : failed
      ? `Commit stopped: the deterministic gate is red (${failed.join(', ') || 'failed'}). Fix it, run node .claude/hooks/gate.mjs --run again, then approve.\n` +
        'If the user explicitly asks for an intermediate (WIP) commit, use --skip "user request".\n'
      : 'Commit stopped: the deterministic gate has not run for these changes (or the changes were modified after it ran). ' +
        'Run node .claude/hooks/gate.mjs --run; if nothing is red, renew the board approval and try the commit again.\n');
  }

  const delta = approval && !skipped ? sinceApproval(approval, d) : [];
  stop(
    (delta.length && delta.length < d.files.length
      ? `Commit stopped: files changed since the last approval (${approval.note}) were not reviewed: ${delta.join(', ')}.\n` +
        'The board looks only at the diff of these files; files approved earlier are not reviewed again.\n'
      : `Commit stopped: the board has not reviewed these changes (${d.files.length} files).\n`) +
      '0. Run the deterministic gate (lint, types, tests, Semgrep) with node .claude/hooks/gate.mjs --run; give its output to the members.\n' +
      (tool === 'claude'
        ? '1. Following .claude/board/rules.md §3, run at most 2 relevant board members for the changed files with the model and effort from node .claude/hooks/models.mjs --for board.commit, on the diff only.\n'
        : '1. Following .claude/board/rules.md §3, read the definitions of at most 2 relevant board members (.claude/agents/board-*.md) and review the diff as those roles yourself (single model).\n') +
      '2. If there is no REJECT: node .claude/hooks/commit-gate.mjs --approve "<members who took part>" and try the commit again.\n' +
      '3. If there is a REJECT, do not commit; ask the user about the finding and the options.\n' +
      'If the user explicitly wants to skip the review for this commit, use --skip "user request".\n'
  );
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--approve'), j = process.argv.indexOf('--skip'), k = process.argv.indexOf('--accept-tests');
  if (i > -1) approve(process.argv[i + 1] || 'unspecified');
  else if (j > -1) save(`skipped: ${process.argv[j + 1] || 'user request'}`);
  else if (k > -1) acceptTests(process.argv[k + 1] || 'user request', process.argv.slice(k + 2));
  else if (process.argv.includes('--status')) status();
  else hook().catch((e) => decideOut('ask', internalError(e))); // a crash exits 1, which does not block the commit
}
