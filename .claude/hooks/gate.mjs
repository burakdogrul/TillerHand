#!/usr/bin/env node
// Deterministic gate: lint, type check, tests and Semgrep run before the board meets; the output is input for the members.
// Why: the model should not search for what lint/type/test catch, and a red check should not be left to a model decision (F-03).
//   node .claude/hooks/gate.mjs --run      exit code: 0 green, 1 red
//   Commands are read from AGENTS.md → Komutlar (lint, tip kontrol, test); an empty one ([ ]) counts as "unset".
//   If Semgrep is installed it runs on changed code files (override with SEMGREP=<executable>); otherwise skipped, CI runs it.
//   The result goes to .claude/state/gate.json with the same change signature as the commit gate; the commit gate stops
//   the commit on a red or stale result. A green check's output is not written, the last 30 lines of a red one are.
//   If no check passed (commands empty, no Semgrep) the result is EMPTY: the commit gate stays closed.
//   "Mutlak yol": an added line with this machine's project or home path is red; a generic C:\Users\<name>, /home/<name> is a note.
//   node .claude/hooks/gate.mjs --approve   saves the commands with user approval. A new or changed command does not run unapproved:
//   an untrusted repo's AGENTS.md must not run code through the gate. The approval lives in the user folder (~/.vibe-kit/).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { changes } from './commit-gate.mjs';
import { isCodeFile } from './edit-rounds.mjs';
import { findRoot, isMain } from './shared.mjs';
import { specInvariants } from './dashboard-data.mjs';

// Keys of the AGENTS.md → Komutlar block (Turkish template text, matched as written)
const CHECKS = ['lint', 'tip kontrol', 'test'];
// The approval also covers the dev command and the preview address: preview.mjs runs the one and opens the other
const APPROVED = [...CHECKS, 'geliştirme', 'önizleme'];
const TIMEOUT = 10 * 60 * 1000;
const BUFFER = 64 * 1024 * 1024;
const tail = (s) => s.trimEnd().split(/\r?\n/).slice(-30).join('\n');

// Only the "## Komutlar" section is read: a "test:" line elsewhere must not count as a command
export function readCommands(md, names = CHECKS) {
  const section = md.match(/^## Komutlar[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';
  return names.map((name) => {
    const value = section.match(new RegExp(`^${name}:[ \\t]*(.*?)[ \\t\\r]*$`, 'm'))?.[1];
    return { name, command: value && !/^\[.*\]$/.test(value) ? value : null };
  });
}

// The approval record lives outside the project, in the user folder (keyed by a digest of the project's real path): no repo,
// archive or .git can carry an approval. The home folder comes from the OS (os.userInfo); HOME/USERPROFILE cannot redirect it.
export function approvalPath(root) {
  let realRoot = root;
  try { realRoot = fs.realpathSync.native(root); } catch { /* missing: the given path */ }
  const key = crypto.createHash('sha256').update(realRoot.toLowerCase()).digest('hex').slice(0, 32);
  return path.join(os.userInfo().homedir, '.vibe-kit', 'gate-approval', `${key}.json`);
}
const digest = (list) => crypto.createHash('sha256').update(JSON.stringify(list.map((k) => [k.name, k.command]))).digest('hex');
export const commandList = (list) => list.filter((k) => k.command).map((k) => `- ${k.name}: ${k.command}`).join('\n');
export const readAgents = (root) => { try { return fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'); } catch { return ''; } };
export const approvedCommands = (root) => readCommands(readAgents(root), APPROVED);

export function approve(root) {
  const list = approvedCommands(root);
  const file = approvalPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ digest: digest(list), commands: list, date: new Date().toISOString() }, null, 2));
  return `Kapı komutları onaylandı:\n${commandList(list) || '(tanımlı komut yok)'}`;
}

export function isApproved(root, list = approvedCommands(root)) {
  if (!list.some((k) => k.command)) return true; // nothing to run
  try { return JSON.parse(fs.readFileSync(approvalPath(root), 'utf8')).digest === digest(list); } catch { return false; }
}

function check(root, { name, command }) {
  if (!command) return { name, status: 'unset', note: 'AGENTS.md → Komutlar' };
  const start = Date.now();
  // The command comes from AGENTS.md (a rule file, writes need approval); pipes and && need a shell
  const r = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: BUFFER });
  const sec = Math.round((Date.now() - start) / 1000);
  if (r.status === 0) return { name, command, status: 'passed', sec };
  return { name, command, status: 'failed', sec, output: tail(`${r.error ? `${r.error.message}\n` : ''}${r.stdout ?? ''}${r.stderr ?? ''}`) };
}

function semgrep(root, files) {
  const name = 'Semgrep';
  const code = files.filter((f) => isCodeFile(f) && fs.existsSync(path.join(root, f)));
  if (!code.length) return { name, status: 'skipped', note: 'değişen kod dosyası yok' };
  const start = Date.now();
  const cmd = process.env.SEMGREP || 'semgrep';
  // --metrics=off: the code scan must not send usage data (docs.semgrep.dev/cli-reference, 2026-10-24)
  const r = spawnSync(cmd, ['scan', '--metrics=off', '--config', 'p/default', '--config', 'p/owasp-top-ten', '--severity', 'ERROR', '--error', '--quiet', '--', ...code],
    { cwd: root, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: BUFFER });
  if (['ENOENT', 'EINVAL'].includes(r.error?.code)) {
    // On Windows .cmd/.bat do not run without a shell; file names are not handed to a shell, the user gives the .exe path.
    // where looks in cwd first: a semgrep inside the project (which may have come with the repo) is not suggested.
    const outside = (y) => y && path.relative(root, y).startsWith('..');
    const found = r.error.code === 'EINVAL' ? cmd
      : process.platform === 'win32' ? (spawnSync('where', [cmd], { encoding: 'utf8' }).stdout ?? '').split(/\r?\n/).map((y) => y.trim()).find(outside) ?? '' : '';
    return { name, status: 'skipped', note: found ? `${found} bulundu ama çalıştırılamadı (.cmd/.bat); SEMGREP=<semgrep.exe yolu> ile ver`
      : 'kurulu değil; CI\'daki semgrep işi çalıştırır' };
  }
  const sec = Math.round((Date.now() - start) / 1000);
  if (r.status === 0) return { name, status: 'passed', sec };
  return { name, status: 'failed', sec, output: tail(`${r.error ? `${r.error.message}\n` : ''}${r.stdout ?? ''}${r.stderr ?? ''}`) };
}

// A path that only exists on this machine in a changed line breaks the code, tests and docs on every other machine.
//   Red: this project's folder or the home folder (at least two levels, so /app or /root alone is not matched; a path
//   boundary after it; any slash style, JSON-escaped too; case-insensitive only on Windows).
//   Note only: a generic C:\Users\<name>, /home/<name>/, /Users/<name>/ (a container path like /home/node/app or a route
//   is not a machine path, so it never blocks).
// "kit:yol-izinli" on the line or the line above allows a deliberate one (Dockerfile and JSON take no inline comment).
// Only added lines of tracked files are read (an old path elsewhere in the file is not this change's); a new file is
// read whole. Paths are read from the git top level, so a project in a monorepo subfolder is checked too.
const ESCAPE = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function absPathCheck(root, files) {
  const name = 'Mutlak yol';
  const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: BUFFER });
  const top = git('rev-parse', '--show-toplevel').stdout?.trim() || root;
  const variants = (p) => { const f = p.replace(/\\/g, '/').replace(/\/+$/, ''); return [f, f.replace(/\//g, '\\'), f.replace(/\//g, '\\\\')]; };
  const deep = (p) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').split('/').filter(Boolean).length >= 2;
  const own = [...new Set([root, top, os.homedir()].filter((p) => p && deep(p)).flatMap(variants))].map(ESCAPE);
  const mine = own.length ? new RegExp(`(?:${own.join('|')})(?=[\\\\/'"\`\\s,;:)\\]}]|$)`, process.platform === 'win32' ? 'i' : '') : null;
  const generic = /\b[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)[^\\/\s'"<>:]+|(?<![\w.-])\/(?:Users|home)\/[^/\s'"<>:]+\//;
  // Added line numbers per file from one diff against HEAD (staged and unstaged); a file not in it is new: read whole
  const added = new Map();
  let file = null;
  for (const l of (git('diff', 'HEAD', '-U0', '--no-color', '--no-renames', '--no-ext-diff').stdout ?? '').split('\n')) {
    const f = l.match(/^\+\+\+ b\/(.+)$/);
    if (f) { file = f[1]; added.set(file, new Set()); continue; }
    const h = file && l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (h) for (let n = +h[1]; n < +h[1] + +(h[2] ?? 1); n++) added.get(file).add(n);
  }
  const red = [], notes = [];
  for (const f of files) {
    if (/^\.claude\/state\/|(^|\/)\.kit\.local\.json$/.test(f)) continue;
    let lines;
    try {
      const b = fs.readFileSync(path.join(top, f));
      if (b.length > 2e6 || b.subarray(0, 8000).includes(0)) continue;
      lines = b.toString('utf8').split(/\r?\n/);
    } catch { continue; }
    lines.forEach((l, i) => {
      if (added.has(f) && !added.get(f).has(i + 1)) return;
      if (l.includes('kit:yol-izinli') || lines[i - 1]?.includes('kit:yol-izinli')) return;
      const at = `${f}:${i + 1}: ${l.trim().slice(0, 120)}`;
      if (mine?.test(l)) red.push(at); else if (generic.test(l)) notes.push(at);
    });
  }
  const list = (a) => [...a.slice(0, 15), a.length > 15 ? `… ve ${a.length - 15} satır daha` : ''].filter(Boolean).join('\n');
  if (red.length) return { name, status: 'failed', note: 'bu makineye özel yol; import.meta.url, __dirname, path.join(kök, …), os.tmpdir() kullan. Bilinçliyse satıra ya da üstüne kit:yol-izinli yaz',
    output: list(red) };
  return { name, status: 'passed', ...(notes.length && { note: `${notes.length} satırda kullanıcı klasörüne benzeyen yol var; makineye özelse düzelt (engellemez)`, output: list(notes) }) };
}

export const approvalNeeded = (list) => `komut onayı gerekli\nAGENTS.md → Komutlar yeni veya değişmiş; bu komutlar onaysız çalışmaz:\n${commandList(list)}\n` +
  'Komutları kullanıcıya göster ve sor. Onaylarsa: node .claude/hooks/gate.mjs --approve, sonra komutu tekrar çalıştır.';

// Spec drift (F-23): a "must not change" behavior whose test is missing or red stops the gate; no result is only a note
// Only reports written during this gate run count (since = gate start): an older report says nothing about the code now.
function specCheck(root, since) {
  const { invariants: list, unreadable } = specInvariants(root, since);
  if (!list.length && !unreadable.length) return null;
  const bad = list.filter((k) => !k.test || k.result === 'failed');
  const unknown = list.filter((k) => k.test && !k.result).length;
  const notes = [`${list.length} değişmemesi gereken davranış`,
    unknown && `${unknown} testin bu koşuda sonucu yok (test komutu JUnit raporu yazmıyor)`,
    unreadable.length && `${unreadable.length} satır okunamadı, "- Ö-01.1: ..." biçiminde yaz: ${unreadable.map((u) => `${u.spec}: ${u.line}`).join(' · ')}`];
  return { name: 'Spec', status: bad.length ? 'failed' : 'passed', note: notes.filter(Boolean).join('; '),
    output: bad.length ? bad.map((k) => `${k.id} (${k.spec}): ${k.test ? 'test kırmızı' : 'test yok'}`).join('\n') : undefined };
}

// Status label and mark shown to the user
export const STATUS_LABEL = { passed: 'geçti', failed: 'kaldı', unset: 'tanımsız', skipped: 'atlandı' };
const MARK = { passed: '✅', failed: '❌', unset: '⚪', skipped: '⚪' };
const line = (k) => `${MARK[k.status]} ${k.name}${k.sec != null ? ` (${k.sec} sn)` : ''}${k.status === 'passed' ? '' : `: ${STATUS_LABEL[k.status]}`}${k.note ? ` (${k.note})` : ''}` +
  (k.output ? `\n\`\`\`\n${k.output}\n\`\`\`` : '');

export function runGate(root) {
  const start = Date.now() - 1000; // 1 s slack for file systems with coarse modification times
  let signature = null, files = [];
  try { ({ signature, files } = changes()); } catch { /* not a git repo: the commands still run */ }
  const list = approvedCommands(root);
  if (!isApproved(root, list)) return { passed: false, text: `## Kapı · ${approvalNeeded(list)}` };
  const checks = [...list.filter((k) => CHECKS.includes(k.name)).map((k) => check(root, k)), semgrep(root, files)];
  const empty = !checks.some((k) => k.status === 'passed');
  const spec = specCheck(root, start); // after the test command, which may have refreshed the JUnit report; it does not fill an empty gate
  if (spec) checks.push(spec);
  checks.push(absPathCheck(root, files)); // after "empty": it does not fill a gate with no lint/test either
  const passed = !empty && checks.every((k) => k.status !== 'failed');
  const file = path.join(root, '.claude', 'state', 'gate.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ signature, date: new Date().toISOString(), passed, empty, checks }, null, 2));
  const result = checks.some((k) => k.status === 'failed') ? 'Sonuç: KIRMIZI. Commit kapısı açılmaz: düzelt ve kapıyı tekrar çalıştır.'
    : empty ? 'Sonuç: BOŞ, hiçbir kontrol çalışmadı. AGENTS.md → Komutlar\'ı doldur; commit kapısı açılmaz (kullanıcı isterse commit-gate.mjs --skip).'
    : 'Sonuç: YEŞİL.';
  return { passed, text: [`## Kapı · ${files.length} dosya değişti`, ...checks.map(line), result].join('\n') };
}

if (isMain(import.meta.url)) {
  const arg = process.argv[2];
  if (arg === '--approve') { console.log(approve(findRoot())); process.exit(0); }
  if (arg !== '--run') { console.error('Kullanım: node .claude/hooks/gate.mjs --run | --approve'); process.exit(1); }
  const { passed, text } = runGate(findRoot());
  console.log(text);
  process.exit(passed ? 0 : 1);
}
