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
import { unquote } from './destructive-guard.mjs';

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
    hashes.set(f, body ? crypto.createHash('sha256').update(body).digest('hex').slice(0, 16) : 'silindi');
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
  if (/\$\(|`/.test(k)) return 'komutta ikame var ($(...) veya `...`)';
  const parts = k.split(/&&|\|\||[;|&\n]/).map((s) => s.trim()).filter(Boolean);
  return parts.every((s) => commit.test(s) || /^git\s+add\b/.test(s) || /^cd\b/.test(s)) ? null : 'commit başka komutlarla zincirli';
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
    console.error('"atlandı" notu --approve ile yazılmaz. Kullanıcı açıkça isterse: node .claude/hooks/commit-gate.mjs --skip "<neden>"');
    process.exit(1);
  }
  save(note);
}

function save(note) {
  const { signature, files, hashes } = changes();
  fs.mkdirSync(path.dirname(approvalFile), { recursive: true });
  fs.writeFileSync(approvalFile, JSON.stringify({ signature, note, files, hashes, date: new Date().toISOString() }));
  console.log(`Commit kapısı açıldı (${files.length} dosya). Not: ${note}`);
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
  try { d = changes(); } catch { console.log('Git deposu değil.'); return; }
  if (!d.files.length) { console.log('Değişiklik yok.'); return; }
  const approval = readApproval(), gate = readGate();
  const gateText = gate?.signature !== d.signature ? 'kapı bu değişiklikler için çalışmadı' : gate.passed ? 'kapı yeşil' : 'kapı kırmızı';
  if (!approval) console.log(`Onay yok: bu değişiklikler için kurul denetimi yapılmadı (${d.files.length} dosya) · ${gateText}.`);
  else if (approval.signature === d.signature) console.log(`Onay geçerli (${approval.note}, ${approval.date ?? '-'}): bu değişiklikler denetlendi, yeniden inceleme gerekmez · ${gateText}.`);
  else console.log(`Onay eski (${approval.note}). Son onaydan sonra değişen: ${sinceApproval(approval, d).join(', ')}. Yalnız bunları incele · ${gateText}.`);
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
      permissionDecisionReason: 'Commit kapısı: --skip kurul denetimini ve deterministik kapıyı aşar. Sadece kullanıcı açıkça isterse onayla.' } }));
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
        permissionDecisionReason: 'Kapı komut onayı sadece tam bu yazımla, tek başına çalıştırılır (zincir, ortam değişkeni, bayrak, yönlendirme yok): node .claude/hooks/gate.mjs --approve' } }));
      process.exit(0);
    }
    // Loaded only here: every Bash call runs this hook, and gate.mjs pulls in the dashboard and edit-round modules
    const { approvedCommands, commandList } = await import('./gate.mjs');
    const list = commandList(approvedCommands(root)) || '(tanımlı komut yok)';
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask',
      permissionDecisionReason: `Kapı komut onayı: AGENTS.md → Komutlar'daki şu komutlar bundan sonra her kapıda çalışır:\n${list}\nGüvendiğin komutlarsa onayla.` } }));
    process.exit(0);
  }
  if (!commit.test(command) && !commit.test(open)) process.exit(0);
  if (!hasBoard() || reviewOff()) process.exit(0);
  const chain = chainIssue(command, commit.inline ? COMMIT : commit);
  if (chain) {
    process.stderr.write(`Commit durduruldu: ${chain}. Kapı komut çalışmadan önceki değişiklikleri denetler; commit'i tek başına ` +
      '(veya yalnızca "git add … && git commit" ile) çalıştır. Push ve diğer komutları ayrı çalıştır.\n');
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
  if (approval?.signature === d.signature && (skipped || (gate?.signature === d.signature && gate.passed === true))) process.exit(0);
  if (approval?.signature === d.signature) {
    const failed = gate?.signature === d.signature ? gate.checks.filter((k) => k.status === 'failed').map((k) => k.name) : null;
    process.stderr.write(failed && !failed.length && gate.empty
      ? 'Commit durduruldu: deterministik kapı boş (hiçbir kontrol çalışmadı). AGENTS.md → Komutlar\'ı doldur ve kapıyı tekrar çalıştır.\n' +
        'Kullanıcı bu commit için açıkça isterse --skip "kullanıcı isteği" kullan.\n'
      : failed
      ? `Commit durduruldu: deterministik kapı kırmızı (${failed.join(', ') || 'kaldı'}). Düzelt, node .claude/hooks/gate.mjs --run ile tekrar çalıştır, sonra onayla.\n` +
        'Kullanıcı ara commit (WIP) için açıkça isterse --skip "kullanıcı isteği" kullan.\n'
      : 'Commit durduruldu: bu değişiklikler için deterministik kapı çalışmadı (ya da sonrasında değişiklik oldu). ' +
        'node .claude/hooks/gate.mjs --run çalıştır; kırmızı yoksa kurul onayını yenile ve commit\'i tekrar dene.\n');
    process.exit(2);
  }

  const delta = approval ? sinceApproval(approval, d) : [];
  process.stderr.write(
    (delta.length && delta.length < d.files.length
      ? `Commit durduruldu: son onaydan (${approval.note}) sonra değişen dosyalar denetlenmedi: ${delta.join(', ')}.\n` +
        'Kurul yalnız bu dosyaların farkına bakar; önceki onaylı dosyalar yeniden incelenmez.\n'
      : `Commit durduruldu: Bu değişiklikler için kurul denetimi yapılmadı (${d.files.length} dosya).\n`) +
      '0. node .claude/hooks/gate.mjs --run ile deterministik kapıyı (lint, tip, test, Semgrep) çalıştır; çıktısını üyelere ver.\n' +
      '1. .claude/board/rules.md §3\'e göre değişen dosyalara ilgili en fazla 2 kurul üyesini model "haiku" ile, sadece diff üzerinde çalıştır.\n' +
      '2. RET yoksa: node .claude/hooks/commit-gate.mjs --approve "<katılan üyeler>" ve commit\'i tekrar dene.\n' +
      '3. RET varsa commit atma; bulguyu ve seçenekleri kullanıcıya sor.\n' +
      'Kullanıcı bu commit için denetimi açıkça atlamak isterse --skip "kullanıcı isteği" kullan.\n'
  );
  process.exit(2);
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--approve'), j = process.argv.indexOf('--skip');
  if (i > -1) approve(process.argv[i + 1] || 'belirtilmedi');
  else if (j > -1) save(`atlandı: ${process.argv[j + 1] || 'kullanıcı isteği'}`);
  else if (process.argv.includes('--status')) status();
  else hook();
}
