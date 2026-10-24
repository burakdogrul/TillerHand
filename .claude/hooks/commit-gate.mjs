#!/usr/bin/env node
// Commit gate: before every AI `git commit` it requires a light board review and a green deterministic gate (gate.mjs).
//   PreToolUse (Bash) hook: without review approval it stops the commit with exit code 2 and says what to do.
//   node .claude/hooks/commit-gate.mjs --approve "<members who took part, or a note>"   binds the approval to the current changes.
// Exempt: no board set up, "Commit denetimi: kapalı" in docs/workflow/board.md, or only docs changed.
// Commits the user makes from their own terminal are not affected (this is a Claude Code hook).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findRoot } from './shared.mjs';
import { unquote } from './destructive-guard.mjs';
import { readCommands, commandList, readAgents } from './gate.mjs'; // circular import: used at run time only

// Project root (the script's location) even when called from a subfolder: approval and gate must not be written elsewhere
const root = findRoot();
const approvalFile = path.join(root, '.claude', 'state', 'commit-approval.json');
const git = (c) => execSync(`git ${c}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });

// Changes that will go into the commit: staged, unstaged in tracked files (git commit -a) and untracked new
// files (git add -A && git commit). -z: Turkish or spaced paths are not quoted and escaped
export function changes() {
  // .claude/state/ (approval, gate result) is not part of the signature: writing an approval must not change it even if not in .gitignore
  const untracked = git('ls-files --others --exclude-standard -z').split('\0').filter((f) => f && !f.startsWith('.claude/state/'));
  const files = [...new Set([...git('diff --cached --name-only -z').split('\0'), ...git('diff --name-only -z').split('\0'), ...untracked].filter(Boolean))];
  const h = crypto.createHash('sha256').update(git('diff --cached') + '\0' + git('diff'));
  for (const f of untracked) {
    h.update(`\0${f}\0`);
    try { h.update(fs.readFileSync(path.join(root, f))); } catch { /* unreadable file: the name is enough */ }
  }
  return { files, signature: h.digest('hex') };
}

// git's global options may come before commit: git --no-pager commit, git -C x commit, git --git-dir=x commit
const COMMIT = /\bgit\b(?:\s+(?:-[cC]\s+\S+|--?[\w-]+(?:=\S+)?))*\s+commit\b/;

// The hook sees the command before it runs: anything that can change files before the commit defeats the review.
// Allowed: commit alone, with "git add" and "cd" before it. A heredoc and a $(cat <<'EOF' … EOF) message do not count as commands.
export function chainIssue(command) {
  const k = command.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, '<<HEREDOC')
    .replace(/\$\(\s*cat\s+<<HEREDOC\s*\)/g, 'MESAJ')
    .replace(/'[^']*'/g, "''")
    .replace(/"((?:[^"\\]|\\.)*)"/g, (m, inner) => (/\$\(|`/.test(inner) ? m : '""'))
    .replace(/\d*>&\d+/g, '');
  if (/\$\(|`/.test(k)) return 'komutta ikame var ($(...) veya `...`)';
  const parts = k.split(/&&|\|\||[;|&\n]/).map((s) => s.trim()).filter(Boolean);
  return parts.every((s) => COMMIT.test(s) || /^git\s+add\b/.test(s) || /^cd\b/.test(s)) ? null : 'commit başka komutlarla zincirli';
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

function approve(note) {
  const { signature, files } = changes();
  fs.mkdirSync(path.dirname(approvalFile), { recursive: true });
  fs.writeFileSync(approvalFile, JSON.stringify({ signature, note, files, date: new Date().toISOString() }));
  console.log(`Commit kapısı açıldı (${files.length} dosya). Not: ${note}`);
}

// State files before 3.15.0 used Turkish keys; read both (remove in 3.17.0)
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const OLD_STATUS = { 'geçti': 'passed', 'kaldı': 'failed', 'tanımsız': 'unset', 'atlandı': 'skipped' };
function readGate() {
  const g = readJson(path.join(root, '.claude', 'state', 'gate.json'));
  if (!g) return null;
  const raw = g.checks ?? g.kontroller;
  // A hand-broken file must not crash the hook (a crash exits 1, which does not block the commit)
  const checks = (Array.isArray(raw) ? raw : []).filter((k) => k && typeof k === 'object').map((k) => ({ name: k.name ?? k.ad, status: OLD_STATUS[k.status ?? k.durum] ?? k.status ?? k.durum }));
  return { signature: g.signature ?? g.imza, passed: g.passed ?? g.gecti, empty: g.empty ?? g.bos, checks };
}
function readApproval() {
  const a = readJson(approvalFile);
  return a && { signature: a.signature ?? a.imza, note: a.note ?? a.not };
}

function hook() {
  let command = '';
  try {
    command = JSON.parse(fs.readFileSync(0, 'utf8')).tool_input?.command ?? '';
  } catch {
    process.exit(0);
  }
  // A "atlandı" approval bypasses the gate and the board: the user is asked (the AI must not write it on its own)
  const open = unquote(command);
  if (/commit-gate\.mjs\b[^;&|\n]*--approve\s+atlandı/i.test(open)) {
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask',
      permissionDecisionReason: 'Commit kapısı: "atlandı" onayı kurul denetimini ve deterministik kapıyı aşar. Sadece kullanıcı açıkça isterse onayla.' } }));
    process.exit(0);
  }
  // The gate command approval gives the commands in AGENTS.md permission to run: the user is asked (also covers spellings the permission list misses).
  // (?<!commit-) keeps only commit-gate.mjs --approve out (a renamed copy like x-gate.mjs still matches); both the raw and
  // unquoted text are tested (unquote drops the backslashes of .claude\hooks\gate.mjs). --onayla: flag before 3.15.0 (remove in 3.17.0).
  if ([command, open].some((c) => /(?<!commit-)gate\.mjs\b[^;&|\n]*--(approve|onayla)\b/i.test(c))) {
    // The prompt reads AGENTS.md now: a chain, an env variable, a node flag or a redirect must not change it after the
    // prompt and get another list approved. Only the exact spelling is accepted.
    if (!/^\s*node\s+(\.\/)?\.claude[\\/]hooks[\\/]gate\.mjs\s+(['"]?)--(?:approve|onayla)\2\s*$/.test(command)) {
      console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
        permissionDecisionReason: 'Kapı komut onayı sadece tam bu yazımla, tek başına çalıştırılır (zincir, ortam değişkeni, bayrak, yönlendirme yok): node .claude/hooks/gate.mjs --approve' } }));
      process.exit(0);
    }
    const list = commandList(readCommands(readAgents(root))) || '(tanımlı komut yok)';
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask',
      permissionDecisionReason: `Kapı komut onayı: AGENTS.md → Komutlar'daki şu komutlar bundan sonra her kapıda çalışır:\n${list}\nGüvendiğin komutlarsa onayla.` } }));
    process.exit(0);
  }
  if (!COMMIT.test(command) && !COMMIT.test(open)) process.exit(0);
  if (!hasBoard() || reviewOff()) process.exit(0);
  const chain = chainIssue(command);
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
  const skipped = /^atlandı/i.test(String(approval?.note ?? ''));
  if (approval?.signature === d.signature && (skipped || (gate?.signature === d.signature && gate.passed === true))) process.exit(0);
  if (approval?.signature === d.signature) {
    const failed = gate?.signature === d.signature ? gate.checks.filter((k) => k.status === 'failed').map((k) => k.name) : null;
    process.stderr.write(failed && !failed.length && gate.empty
      ? 'Commit durduruldu: deterministik kapı boş (hiçbir kontrol çalışmadı). AGENTS.md → Komutlar\'ı doldur ve kapıyı tekrar çalıştır.\n' +
        'Kullanıcı bu commit için açıkça isterse --approve "atlandı: kullanıcı isteği" kullan.\n'
      : failed
      ? `Commit durduruldu: deterministik kapı kırmızı (${failed.join(', ') || 'kaldı'}). Düzelt, node .claude/hooks/gate.mjs --run ile tekrar çalıştır, sonra onayla.\n` +
        'Kullanıcı ara commit (WIP) için açıkça isterse --approve "atlandı: kullanıcı isteği" kullan.\n'
      : 'Commit durduruldu: bu değişiklikler için deterministik kapı çalışmadı (ya da sonrasında değişiklik oldu). ' +
        'node .claude/hooks/gate.mjs --run çalıştır; kırmızı yoksa kurul onayını yenile ve commit\'i tekrar dene.\n');
    process.exit(2);
  }

  process.stderr.write(
    `Commit durduruldu: Bu değişiklikler için kurul denetimi yapılmadı (${d.files.length} dosya).\n` +
      '0. node .claude/hooks/gate.mjs --run ile deterministik kapıyı (lint, tip, test, Semgrep) çalıştır; çıktısını üyelere ver.\n' +
      '1. .claude/board/rules.md §3\'e göre değişen dosyalara ilgili en fazla 2 kurul üyesini model "haiku" ile, sadece diff üzerinde çalıştır.\n' +
      '2. RET yoksa: node .claude/hooks/commit-gate.mjs --approve "<katılan üyeler>" ve commit\'i tekrar dene.\n' +
      '3. RET varsa commit atma; bulguyu ve seçenekleri kullanıcıya sor.\n' +
      'Kullanıcı bu commit için denetimi açıkça atlamak isterse --approve "atlandı: kullanıcı isteği" kullan.\n'
  );
  process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--approve');
  if (i > -1) approve(process.argv[i + 1] || 'belirtilmedi');
  else hook();
}
