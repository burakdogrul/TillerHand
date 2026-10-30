#!/usr/bin/env node
// Destructive command and prod shield (PreToolUse, Bash).
// Why: an AI agent deleted a live database despite being told to stop (Replit, 2025). Bans given in the prompt
// are not enough; the guard must sit outside the agent. This hook leaves the decision to Claude Code's permission layer:
//   deny : commands that destroy data, commands with a prod database address. If needed, the user runs them.
//   ask  : prod deploys, store submissions, hard-to-undo git operations. The user is asked.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readInput, decide, isMain, findRoot } from './shared.mjs';
import { t } from './lang.mjs';
import { isTestFile, isTestConfig } from './test-guard.mjs';
import { readLock, readPlan, allowedInLock, inScope, realPath, relPath, protectedRule } from './freeze-guard.mjs';

// Texts of ask decisions go to the user (message keys); texts of deny decisions are plain English for the AI.
// Helpers here have no root argument: the project root comes from findRoot().
const tr = (k, vars) => t(findRoot(), k, vars);

const DESTRUCTIVE = [
  [/\bdrop\s+(table|database|schema|index|view|collection)\b/i, 'DROP deletes a data structure'],
  [/\btruncate\s+(table\s+)?\w/i, 'TRUNCATE empties a table'],
  [/\bdelete\s+from\s+[\w."]+\s*(;|"|'|$)/im, 'DELETE without WHERE: every row in the table is deleted'],
  [/\balter\s+table\b[^;]*\bdrop\s+column\b/i, 'ALTER TABLE ... DROP COLUMN deletes the column and its data'],
  [/\b(supabase\s+db\s+reset|prisma\s+migrate\s+reset|prisma\s+db\s+push\b[^;]*--force-reset|drizzle-kit\s+drop)\b/i, 'Database is being reset'],
  [/\b(alembic\s+downgrade\s+base|dropdb\b|rails\s+db:(drop|reset)|django-admin\s+flush|manage\.py\s+flush)\b/i, 'Database or schema is being deleted'],
  [/\bdocker\s+(compose\s+down\b[^;]*\s-v\b|volume\s+(rm|prune)\b|system\s+prune\b[^;]*--volumes)/i, 'Docker volume (persistent data) is being deleted'],
  [/\bgit\s+clean\b(?=[^;]*\s--?[a-z]*f)(?=[^;]*\s-[a-z]*d)/i, 'git clean permanently deletes untracked files'],
  [/\bredis-cli\b[^;]*\b(flushall|flushdb)\b/i, 'Redis data is being deleted'],
  [/\bfirebase\s+firestore:delete\b/i, 'Firestore data is being deleted'],
  [/\bheroku\s+pg:reset\b|\bdrop(Database|Collection)\s*\(|\bdeleteMany\s*\(\s*\{\s*\}\s*\)|\bartisan\s+migrate:(fresh|refresh|reset)\b|\btypeorm\b[^;]*\bschema:drop\b|\bknex\b[^;]*\bmigrate:rollback\b[^;]*--all\b|\bprisma\s+db\s+push\b[^;]*--accept-data-loss\b/i, 'Database data is being deleted or reset'],
  [/\b(terraform|tofu|pulumi)\s+destroy\b/i, 'Cloud infrastructure is being destroyed'],
];

// Database addresses other than localhost count as prod (or a shared environment)
const PROD_DB = /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|rediss):\/\/[^\s'"]*@(?!localhost|127\.0\.0\.1|0\.0\.0\.0|db[:/]|postgres[:/]|host\.docker\.internal)[^\s'"/:]+/i;
const PROD_MARK = /\b(--prod(uction)?\b|NODE_ENV=production|ENV=production|DATABASE_URL_PROD|PROD_DATABASE_URL)\b/;

// Pulling prod secrets onto the agent's machine: the local environment and the AI connect to the dev project only (dev/prod split)
// vc: short name of the Vercel CLI
const PROD_SECRET = /\b(vercel|vc)(@[\w.-]+)?\b(?=[^;&|]*\s(env\s+pull|pull)\b)(?=[^;&|]*\s--environment(=|\s+)prod(uction)?\b)/i;
// If the environment is not plain development/preview (a variable, $(...), a custom env), which secrets get pulled is unknown: ask
const UNCLEAR_ENV = /\b(vercel|vc)(@[\w.-]+)?\b(?=[^;&|]*\s(env\s+pull|pull)\b)(?=[^;&|]*\s--environment(=|\s+)(?!['"]?(development|preview)['"]?(\s|$))\S)/i;

const NEEDS_APPROVAL = [
  // unquote() opens quoted spellings; here only what the shell sees
  [/\b(vercel|vc)\b[^;&|]*(--prod\b|--target(=|\s+)prod(uction)?\b)/i, 'guard.destructive.prodDeploy'],
  // The subcommand can also come after flags: vercel --scope team promote <url>
  [/\b(vercel|vc)(@[\w.-]+)?\b[^;&|]*\s(promote|rollback)\b/i, 'guard.destructive.promoteRollback'],
  [UNCLEAR_ENV, 'guard.destructive.unclearEnv'],
  // A package spelling (npx netlify-cli, firebase-tools, wrangler@3) deploys the same way
  [/\b(fly|flyctl)\s+deploy\b|\brailway\s+up\b|\bnetlify(-cli)?(@[\w.-]+)?\s+deploy\b[^;]*--prod|\bfirebase(-tools)?(@[\w.-]+)?\s+deploy\b|\bwrangler(@[\w.-]+)?\s+(deploy|publish|pages\s+deploy)\b|\bgcloud\s+app\s+deploy\b|\b(serverless|sls)\s+deploy\b|\bcdk\s+deploy\b|\bpulumi\s+up\b|\bamplify\s+(push|publish)\b|\b(terraform|tofu)\s+apply\b|\bexpo\s+publish\b/i, 'guard.destructive.serverDeploy'],
  [/\beas(-cli(@[\w.-]+)?)?\s+(submit\b|build\b(?=[^;\n]*--auto-submit\b)|update:(rollback|republish)\b|update\b(?=[^;\n]*--(branch|channel|environment)(=|\s+)['"]?prod(uction)?\b)|deploy\b(?=[^;\n]*--prod\b))/i, 'guard.destructive.storeSubmit'],
  [/\bgit\s+push\b[^;]*\b(main|master|production)\b/i, 'guard.destructive.pushMain'],
  [/\bgit\s+(rebase|filter-branch|filter-repo)\b/i, 'guard.destructive.rewriteHistory'],
  [/\b(alembic\s+upgrade|prisma\s+migrate\s+deploy|supabase\s+db\s+push)\b/i, 'guard.destructive.migration'],
];

// The test guard runs on file tools; changing a test or test config file from the shell (sed -i, rm, >, mv, git checkout) is asked.
// Each part of a command chain is checked alone: "rm -r node_modules && npx vitest run a.test.ts" does not change a test.
// A flag is not a command name: grep -ln, ls -rd, tar -rm are not writers
const WRITER = /(?<![\w-])(rm|del|erase|rmdir|rd|unlink|mv|move|cp|copy|tee|truncate|touch|ln|dd|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|Clear-Content)\b|\bcurl\b[^;&|]*\s(-o|--output)\b|\bwget\b[^;&|]*\s(-O|--output-document)\b|\bsed\b[^;&|]*\s(-[a-zA-Z]*i\S*|--in-place\b)|\bperl\b[^;&|]*\s-[a-zA-Z]*i|\bgit\s+(checkout|restore|rm|mv)\b/i;
// Dependency and git internals are not the project's tests; a URL (curl … https://x/tests/a) or a dd input is not a target
// Normalized first: node_modules/../tests/a.test.ts is a test path; only a path that stays under them is skipped
const isTestCode = (t) => {
  if (/:\/\/|^if=/i.test(t)) return false;
  const n = path.posix.normalize(t.replace(/\\/g, '/'));
  return !/(^|\/)(node_modules|\.git)(\/|$)/i.test(n) && (isTestFile(n) || /(^|\/)(tests?|__tests__|e2e|spec)\/?$/i.test(n));
};
const isTestPath = (t) => isTestCode(t) || isTestConfig(t);
function writesTest(command, isPath = isTestPath) {
  return command.split(/&&|\|\||[;|\n]/).some((part) => {
    const p = part.replace(/\b2>&1|\b2>\s*(\/dev\/null|nul)\b/gi, '');
    const bare = (s) => s.replace(/^["']+|["']+$/g, '');
    const targets = [...p.matchAll(/>{1,2}\s*([^\s;&|<>]+)/g)].map((m) => bare(m[1]));
    return targets.some(isPath) || (WRITER.test(p) && p.split(/\s+/).map(bare).some(isPath));
  });
}

// For the lock and the scope shield, a writing command is found by the command NAME ("copy" in a path, "tee" in an argument do not count).
const WRITER_NAME = /^(rm|del|erase|rmdir|rd|unlink|mv|move|cp|copy|tee|truncate|ln|install|dd|black|set-content|add-content|out-file|new-item|remove-item|move-item|copy-item|clear-content)$/;
const PREFIX = /^(sudo|npx|bunx|pnpx|command|exec|env|nohup|time)$|^\w+=/;
// 'target': the arguments are target files; 'unclear': the command changes files without showing them in its arguments
function writerKind(name, a) {
  if (WRITER_NAME.test(name)) return 'target';
  if (name === 'sed') return a.some((x) => /^(-[a-zA-Z]*i|--in-place)/.test(x)) ? 'target' : null;
  if (name === 'perl') return a.some((x) => /^-[a-zA-Z]*i/.test(x)) ? 'target' : null;
  if (/^(curl|wget)$/.test(name)) return a.some((x) => /^(-[a-zA-Z]*[oO]|--output)/.test(x)) ? 'target' : null;
  if (/^(prettier|eslint|biome|ruff)$/.test(name)) return a.some((x) => /^(--write|--fix|-w|format)$/.test(x)) ? 'target' : null;
  if (/^(rsync|unzip)$/.test(name)) return 'target';
  if (name === 'tar') return a.some((x, i) => /^-[a-zA-Z]*x[a-zA-Z]*$|^--extract$/.test(x) || (i === 0 && /^[a-zA-Z]*x[a-zA-Z]*$/.test(x))) ? 'target' : null;
  if (name === 'find') return a.some((x) => /^-(delete|exec|execdir|ok|okdir|fprint\w*)$/.test(x)) ? 'target' : null;
  if (name === 'patch') return 'unclear';
  if (name === 'git') {
    const [sub, second] = a.filter((x) => !x.startsWith('-'));
    if (/^(checkout|restore|rm|mv)$/.test(sub)) return 'target';
    if (/^(apply|am|cherry-pick|revert|clean|switch)$/.test(sub) || (sub === 'stash' && !/^(list|show)$/.test(second ?? ''))) return 'unclear';
  }
  return null;
}

const SHELL = /^(bash|sh|zsh|dash|ksh|cmd|powershell|pwsh)$/;
const CD = /^(cd|pushd|chdir|set-location|sl)$/;

// Files a shell command may change (lock and scope shield): redirect targets and the writing command's arguments.
// cd/pushd/popd in the chain and subshells are tracked; bash -c / sh -c bodies are scanned too; Git Bash paths (/c/...) and ~ are converted;
// a glob target counts as its folder. A target with a variable, backtick or brace expansion, an unverifiable cd and a command
// that does not show its target (git apply, git switch, patch, xargs rm) return "unclear": asked while a lock or plan is active.
// shortcut: heuristic; the source of cp/copy also counts as a target (an extra question), writes inside node -e / python -c are not seen.
export function shellTargets(command, dir) {
  const targets = [];
  let unclear = null;
  const markUnclear = (m) => { unclear ??= m; };
  const resolve = (t, d = dir) => {
    // Local UNC (\\?\C:\x, \\.\C:\x, \\localhost\c$\x) becomes a drive path; other UNC counts as unclear, the hook does not touch network paths
    // \\?\ and \\.\ drop only before a drive letter; \\?\UNC\ turns back into plain UNC; GLOBALROOT, pipe etc. stay unclear
    let h = t.replace(/^(\\\\|\/\/)[?.][\\/](?=[a-zA-Z]:)/, '').replace(/^(\\\\|\/\/)[?.][\\/]UNC[\\/]/i, '\\\\')
      .replace(/^(\\\\|\/\/)(localhost|127\.0\.0\.1)[\\/]([a-zA-Z])\$(?=[\\/]|$)/i, '$3:');
    if (/^(\\\\|\/\/)/.test(h)) return markUnclear(tr('guard.destructive.unclearNetPath', { path: t })), null;
    h = h.replace(/\$\{?PWD\}?/g, d).replace(/^~(?=\/|\\|$)/, os.homedir());
    if (/[$`]/.test(h)) return markUnclear(tr('guard.destructive.unclearVar', { path: t })), null;
    if (/\{[^}]*(,|\.\.)[^}]*\}/.test(h)) return markUnclear(tr('guard.destructive.unclearBrace', { path: t })), null;
    if (process.platform === 'win32') h = h.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:');
    let p = path.resolve(d, h);
    // Glob: if missing on disk, the folder before the first wildcard is the target (src/*.ts → src, * → current folder)
    if (/[*?[]/.test(h) && !fs.existsSync(p)) {
      const head = h.slice(0, h.search(/[*?[]/));
      p = path.resolve(d, head.endsWith('/') || head.endsWith('\\') || !head ? head || '.' : path.dirname(head));
    }
    return p;
  };
  const add = (t) => { const p = resolve(t); if (p) targets.push(p); };
  const subshells = [], stack = [];
  for (const part of command.replace(/>\|/g, '>').split(/&&|\|\||[;|\n]/)) {
    let p = part.replace(/\b2>&1|\b2>\s*(\/dev\/null|nul)\b/gi, '').trim();
    // Subshell ( … ) and group { …; }: brace expansion ({a,b}) is not a group
    const opens = /^(\(|\{\s)/.test(p), closes = /(\)|(^|\s)\})$/.test(p);
    if (opens) subshells.push(dir);
    p = p.replace(/^(\(|\{\s)\s*/, '').replace(/\s*(\)|(^|\s)\})$/, '');
    for (const m of p.matchAll(/>{1,2}\s*((?:[^\s;&|<>"']+|"[^"]*"|'[^']*')+)/g)) add(m[1].replace(/["']/g, ''));
    // Shell word: a quote inside a word is part of it (o'ther' → other)
    const raw = [...p.replace(/>{1,2}\s*((?:[^\s;&|<>"']+|"[^"]*"|'[^']*')+)/g, '').matchAll(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)].map((m) => m[0]);
    const k = raw.map((x) => x.replace(/["']/g, ''));
    while (k.length && PREFIX.test(k[0])) { k.shift(); raw.shift(); while (k[0]?.startsWith('-')) { k.shift(); raw.shift(); } }
    const name = path.basename((k[0] ?? '').replace(/^\\/, '')).toLowerCase().replace(/\.(exe|cmd)$/, '');
    const a = k.slice(1);
    const close = () => { if (closes && subshells.length) dir = subshells.pop(); };
    if (CD.test(name) || name === 'popd') {
      const target = name === 'popd' ? stack.pop() : resolve(a.filter((x) => !/^-/.test(x) && !/^\/d$/i.test(x)).pop() ?? '$HOME');
      if (name === 'pushd') stack.push(dir);
      if (target && fs.existsSync(target)) dir = target;
      else markUnclear(tr('guard.destructive.unclearCd', { name, target: a.join(' ') || tr('guard.destructive.homeDir') }));
      close();
      continue;
    }
    // bash -c "…", cmd /c …, powershell -Command …: the inner command is scanned with the same rules
    if (SHELL.test(name)) {
      const i = a.findIndex((x) => /^(-c|\/c|-command)$/i.test(x));
      if (i > -1) {
        const inner = shellTargets(raw.slice(i + 2).map((x) => x.replace(/^(["'])([\s\S]*)\1$/, '$2')).join(' '), dir);
        targets.push(...inner.targets);
        if (inner.unclear) markUnclear(inner.unclear);
      }
      close();
      continue;
    }
    if (name === 'xargs') {
      const inner = a.filter((x) => !x.startsWith('-'));
      if (writerKind(path.basename(inner[0] ?? '').toLowerCase(), inner.slice(1))) markUnclear(tr('guard.destructive.unclearXargs', { command: inner[0] }));
      close();
      continue;
    }
    const kind = writerKind(name, a);
    if (kind === 'unclear') markUnclear(tr('guard.destructive.unclearNoTarget', { command: `${name} ${a.find((x) => !x.startsWith('-')) ?? ''}`.trim() }));
    if (kind === 'target') {
      for (const x of fileArgs(name, a)) {
        const p = resolve(x);
        if (!p) continue;
        targets.push(p);
        // git checkout <branch>: if it is not a path it is a branch switch, the whole working tree may change
        if (name === 'git' && !fs.existsSync(p) && !a.slice(0, a.indexOf(x)).includes('--')) markUnclear(tr('guard.destructive.unclearBranch', { sub: a[0], arg: x }));
      }
    }
    close();
  }
  return { targets, unclear };
}

// The writing command's target arguments. The sed script (first argument when there is no -e) and -e/-f values are not files; dd only of=,
// tar -C (else the current folder), unzip -d (else the current folder), rsync the last argument, find the start folders.
function fileArgs(name, a) {
  const valueOf = (flag) => { const i = a.findIndex((x) => flag.test(x)); return i > -1 ? a[i + 1] : null; };
  if (name === 'dd') return a.filter((x) => x.startsWith('of=')).map((x) => x.slice(3));
  if (name === 'tar') return [valueOf(/^(-C|--directory)$/) ?? '.'];
  if (name === 'unzip') return [valueOf(/^-d$/) ?? '.'];
  if (name === 'rsync') return a.filter((x) => !x.startsWith('-')).slice(-1);
  if (name === 'find') { const i = a.findIndex((x) => /^[-(!]/.test(x)); const k = a.slice(0, i < 0 ? a.length : i); return k.length ? k : ['.']; }
  if (name === 'git') return a.slice(a.findIndex((x) => !x.startsWith('-')) + 1).filter((x) => !x.startsWith('-'));
  const result = [];
  let skipScript = name === 'sed' && !a.some((x) => /^(-e|--expression|-f|--file)/.test(x));
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (name === 'sed' && /^(-e|-f)$/.test(x)) { i++; continue; }
    if (x.startsWith('-')) {
      if (/^--output(-document)?=/.test(x)) result.push(x.split('=')[1]);
      else if (/^(curl|wget)$/.test(name) && /^-[a-zA-Z]*?[oO].+$/.test(x)) result.push(x.replace(/^-[a-zA-Z]*?[oO]/, '')); // -osrc/a.ts
      continue;
    }
    if (skipScript) { skipScript = false; continue; }
    result.push(x);
  }
  return result;
}

// While a lock or an approved plan is active, changing an existing file inside the project from the shell is asked (the shell
// counterpart of freeze-guard on file tools). New files and files outside the project (temporary) are free; targeting the root or a parent folder is asked.
// Rule and guard files (.claude/, .git/, AGENTS.md…; lock, plan and approval states included) are asked even without a lock/plan, .env is denied.
export const VIBE_KIT = /[\\/]\.vibe-kit([\\/]|$)/i;
export function scopeIssue(command, dir, root) {
  const { targets, unclear } = shellTargets(command, dir);
  const groot = realPath(root);
  // The approval folder, a folder containing it (glob ~/.v* → ~) or its real path through a link: all asked
  const vk = path.join(os.userInfo().homedir, '.vibe-kit');
  const touchesApproval = (y) => VIBE_KIT.test(y) || !/^\.\.|^$/.test(path.relative(y, vk)) && !path.isAbsolute(path.relative(y, vk));
  for (const h of targets) {
    if (touchesApproval(h) || touchesApproval(realPath(h))) return { decision: 'ask', reason: /preferences[.]md$/i.test(h)
      ? t(root, 'guard.destructive.prefsFile', { path: h })
      : t(root, 'guard.destructive.gateApproval', { path: h }) };
    const rel = relPath(realPath(h), groot);
    // board.md holds the commit review switch; the file tools ask only when that line changes (freeze-guard).
    // A glob target counts as its folder: docs/workflow/b*.md or *.md from a folder above reaches board.md too
    const board = 'docs/workflow/board.md';
    if (rel.toLowerCase() === board || /[*?[]/.test(command) && (rel === '' || board.startsWith(`${rel.toLowerCase()}/`))) return { decision: 'ask', reason: t(root, 'guard.destructive.boardShell') };
    const k = protectedRule(rel, root) ?? protectedRule(`${rel}/`, root);
    if (k) return { decision: k[0], reason: k[0] === 'deny' ? `${rel}: ${k[2]}` : t(root, 'guard.destructive.protectedShell', { rel, text: k[2] }) };
  }
  // The target could not be resolved but the command names a rule/guard file ($D/AGENTS.md, {AGENTS,X}.md): asked even without a lock/plan
  if (unclear && /AGENTS|CLAUDE|\.(claude|git|github|codex|agents|env|mcp)\b|secrets|vibe-kit/i.test(command)) {
    return { decision: 'ask', reason: t(root, 'guard.destructive.unclearRule', { unclear }) };
  }
  const lock = readLock(root), plan = readPlan(root);
  if (!lock && !plan) return null;
  const label = lock ? t(root, 'guard.destructive.labelLock', { lock }) : t(root, 'guard.destructive.labelPlan', { task: plan.task });
  if (unclear) return { decision: 'ask', reason: t(root, 'guard.destructive.scopeUnclear', { label, unclear }) };
  for (const h of targets) {
    if (!fs.existsSync(h)) continue;
    const p = realPath(h), up = path.relative(p, groot), rel = relPath(p, groot);
    if (!up.startsWith('..') && !path.isAbsolute(up)) {
      return { decision: 'ask', reason: t(root, 'guard.destructive.scopeRoot', { label, rel: rel || '.' }) };
    }
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    if (lock && !allowedInLock(p, lock, groot)) {
      return { decision: 'ask', reason: t(root, 'guard.destructive.lockOutside', { rel, lock }) };
    }
    if (plan && !inScope(fs.statSync(p).isDirectory() ? `${rel}/` : rel, plan.paths)) {
      return { decision: 'ask', reason: t(root, 'guard.destructive.planOutside', { rel, task: plan.task }) };
    }
  }
  return null;
}

// Commands denied/asked in Claude Code via .claude/settings.json → permissions. Codex and Antigravity have no such
// list; this is its counterpart (applied only on those tools, Claude's behavior does not change).
// Only the real .claude/hooks/commit-gate.mjs --approve is kept out of the gate rule (separators optional: unquote drops backslashes;
// anchored at the start of the path, so sandbox/.claude/hooks/commit-gate.mjs, a renamed gate.mjs, is not exempt).
// .env in a shell command (git show :.env, curl -d @.env, cat apps/web/.env.local); .env.example, .env.sample (any middle part) are free
const ENV_ACCESS = /(?<![\w.-])\.env(?![\w.-]*\.(example|sample)(?![\w.-]))(\.[\w.-]+|\*)?(?=$|[\s'";|&)<>])|(^|[\s'"/\\])secrets[/\\]/i;
// A glob that can match .env (.e*, .en?, .e[n]v): the shell expands it to the file
const ENV_NAMES = ['.env', '.env.local', '.env.production', '.env.development', '.env.staging', '.env.test', '.env.preview'];
// Glob match (* ? [..] [!..]) by dynamic programming, not a regex: no throw on an unclosed [ (bash reads it as a
// plain [) and no backtracking blow-up on ********. Case-insensitive, like the Windows file system.
export function globMatch(glob, name) {
  // Only plain bracket sets ([nm], [!x]) are parsed. A range, class, equivalence class, collating symbol, escape,
  // nested or empty set ([a-z], [[:alpha:]], [[=n=]], [[.n.]], []n]) counts as a match: asked, never guessed
  for (let i = glob.indexOf('['); i > -1; i = glob.indexOf('[', i + 1)) {
    const end = glob.indexOf(']', i + 1);
    if (end > -1 && !/^[!^]?[\w.]+$/.test(glob.slice(i + 1, end))) return true;
  }
  const tokens = [];
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i], end = c === '[' ? glob.indexOf(']', i + 1) : -1;
    if (c === '*') { if (tokens.at(-1) !== '*') tokens.push('*'); }
    else if (c === '?') tokens.push((x) => true);
    else if (end > -1) {
      const body = glob.slice(i + 1, end).toLowerCase(), neg = /^[!^]/.test(body), set = neg ? body.slice(1) : body;
      tokens.push((x) => set.includes(x) !== neg);
      i = end;
    } else tokens.push((x) => x === c.toLowerCase());
  }
  const s = name.toLowerCase();
  let row = [true, ...Array(s.length).fill(false)];
  for (const k of tokens) {
    const next = [k === '*' && row[0], ...Array(s.length).fill(false)];
    for (let j = 1; j <= s.length; j++) next[j] = k === '*' ? row[j] || next[j - 1] : row[j - 1] && k(s[j - 1]);
    row = next;
  }
  return row[s.length];
}
const envGlob = (s) => [...s.matchAll(/(?<![\w.-])\.[^\s'";|&)<>/\\]*[*?[][^\s'";|&)<>/\\]*/g)]
  .some(([g]) => ENV_NAMES.some((n) => globMatch(g, n)));
// vercel env pull writes the dev values into .env.local without showing them (a prod pull is denied above). Only the
// pull's own part of the chain is free; a comment (#) after it is not.
const envIssue = (k) => k.split(/;|&&|\|\||[|&\n]/).some((s) =>
  (ENV_ACCESS.test(s) || envGlob(s)) && !/^\s*((npx|bunx|pnpx)\s+)?(vercel|vc)(@[\w.-]+)?\s[^#]*\bpull\b[^#]*$/i.test(s));
const PERMISSION_EQUIVALENT = [
  ['deny', /\brm\b(?=[^;&|]*\s--?[a-z]*r)(?=[^;&|]*\s--?[a-z]*f)/i, 'Bulk deletion with rm -rf'],
  ['deny', /\b(Remove-Item|rm|ri|del|erase)\b[^;&|]*\s-Recurse\b|\b(rmdir|rd|del)\s+[^;&|]*\/s\b/i, 'A folder is being bulk deleted'],
  ['deny', /\bgit\s+reset\s+[^;&|]*--hard\b/i, 'git reset --hard deletes uncommitted work'],
  ['deny', /\bgit\s+push\b[^;&|]*\s(--force\S*|-\w*f\w*|\+\S+)(?=\s|$)/i, 'git push --force overwrites the remote history'],
  ['deny', ENV_ACCESS, 'Access to .env or secrets/ (the AI does not read or write them)'],
  // Claude asks every push through settings.json (Bash(git push:*)); a push to any branch can deploy (Vercel's prod branch)
  ['ask', /\bgit\s+push\b/i, 'guard.destructive.perm.push'],
  ['ask', /freeze-guard\.mjs['"]?\s+['"]?--off\b/i, 'guard.destructive.perm.freezeOff'],
  ['ask', /tools\.mjs['"]?\s+['"]?--commands\b/i, 'guard.destructive.perm.toolsCommands'],
  ['ask', /freeze-guard\.mjs['"]?\s+['"]?--plan-add\b/i, 'guard.destructive.perm.planAdd'],
  ['ask', /freeze-guard\.mjs['"]?\s+['"]?--plan-save\b/i, 'guard.destructive.perm.planSave'],
  ['ask', /freeze-guard\.mjs['"]?\s+['"]?--plan-end\b/i, 'guard.destructive.perm.planEnd'],
  ['ask', /commit-gate\.mjs\b[^;&|\n]*--skip\b/i, 'guard.destructive.perm.commitSkip'],
  ['ask', /prefs\.mjs['"]?\s+['"]?--(add|remove)\b/i, 'guard.destructive.perm.prefsEdit'],
  ['ask', /(?<!(?:^|[\s'"=])(?:\.[\\/]|\$\{?CLAUDE_PROJECT_DIR\}?[\\/]?)?\.claude[\\/]?hooks[\\/]?commit-)gate\.mjs['"]?\s+['"]?--approve\b/i, 'guard.destructive.perm.gateApprove'],
  // Shell counterpart of the PROTECTED rule on file tools: a command that names a rule or guard file and writes/deletes is asked
  // (.git: the gate command approval and git hooks live there)
  ['ask', /(?=.*((^|[\s'"/\\])\.(claude|codex|agents|git)(?=$|[\s/\\'"])|\bAGENTS\.md|\bCLAUDE\.md))(?=.*(\b(rm|del|erase|rmdir|rd|mv|move|cp|copy|tee|truncate|checkout|restore|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item)\b|\bsed\s+-i|>|\bnode\s+-e|\bpython\d?\s+-c))/i, 'guard.destructive.perm.protectedShell'],
];

// What the shell will see: $'..' is opened, quotes, \ escapes and PowerShell ` escapes drop. For matching only.
// Why: --pro""d, pr\omote, $'--prod' become --prod and promote in the shell; writing each rule per quoting style can be bypassed.
export const unquote = (s) => s.replace(/\$'((?:[^'\\]|\\.)*)'/g, '$1').replace(/\\(.)/g, '$1').replace(/[`'"]/g, '');

// Of the raw and unquoted text, the stricter decision wins (deny > ask)
const RANK = { deny: 2, ask: 1 };
const strictest = (...s) => s.filter(Boolean).sort((a, b) => RANK[b.decision] - RANK[a.decision])[0] ?? null;

// A commit message that only names a command (git commit -m "commit-gate.mjs --skip explained") is text, not a call.
// Emptied only when the WHOLE command is one plain commit (optionally after "git add … &&") and the message is its last
// word: then nothing else can hide in it. No quote, $, `, (, #, <, > before the message: a quote opened earlier
// would make a real command look like the message. The message must be safe in bash, PowerShell and cmd alike: no
// $ ` (code), no \ (PowerShell and cmd do not escape with it, "a\" ends the string), no typographic quotes U+2018-U+201F
// (PowerShell ends strings at them), no newline and no ; & | < > ^ % !. Anything else keeps its text and is checked.
const PLAIN_COMMIT = /^(\s*(?:git(?:\.exe)?\s+add\s[^;&|\n$`()"'\\#<>\u2018-\u201f]*&&\s*)?git(?:\.exe)?\s[^;&|\n$`()"'\\#<>\u2018-\u201f]*?\bcommit(?![\w.-])[^;&|\n$`()"'\\#<>\u2018-\u201f]*?\s(?:-[a-zA-Z]*m|--message)(?:\s+|=))("[^"\\$`\u2018-\u201f\r\n;&|<>^%!]*"|'[^'\u2018-\u201f\r\n;&|<>^%!]*')\s*$/;
export function permissionEquivalent(command) {
  const c = command.replace(PLAIN_COMMIT, '$1""');
  return strictest(permissionOne(c), permissionOne(unquote(c)), permissionOne(blankQuoted(c)));
}
function permissionOne(command) {
  const k = command.replace(/\s+/g, ' ').replace(/\b2>&1|\b2>\s*(\/dev\/null|nul)\b/gi, ''); // an error redirect is not a write
  const e = PERMISSION_EQUIVALENT.find(([, re]) => re.test(k));
  if (!e) return null;
  return e[0] === 'deny'
    ? { decision: 'deny', reason: `${e[2]}. The AI cannot run this command; if needed, the user runs it themselves.` }
    : { decision: 'ask', reason: tr('guard.destructive.approvalSuffix', { reason: tr(e[2]) }) };
}

// When in doubt, ask: instead of emulating the shell, if a protected word shows up while an obfuscation mark is present, the decision is "ask".
// Why: spellings like a trailing \, $'\x2d..', pro$()d, ha${X}rd, `..` cannot be fully resolved from text (user decision 2026-10-23).
const OBFUSCATION = /\\\r?\n|\$'|\$\(|`|\$\{|\$[@*]/;
const GUARDED = [
  /\b(vercel|vc)\b.*\b(prod|production|promote|rollback)\b/, /\b(vercel|vc)\b.*\bpull\b/, /\b(drop|truncate)\b/, /\breset\b.*\bhard\b/,
  /\bpush\b.*(\s-f\b|force)/, /\brm\b.*\s-[a-z]*(rf|fr)/, /\b(db|migrate)\s+reset\b/,
];
const unescape = (m, e) => /^x/.test(e) ? String.fromCharCode(parseInt(e.slice(1), 16)) : /^u/.test(e) ? String.fromCharCode(parseInt(e.slice(1), 16))
  : /^[0-7]/.test(e) ? String.fromCharCode(parseInt(e, 8)) : e;
const loosen = (s) => s.toLowerCase().replace(/\\\r?\n/g, '').replace(/`[^`]*`|\$\([^)]*\)|\$\{[^}]*\}|\$[@*]/g, '')
  .replace(/\\(x[0-9a-f]{1,2}|u[0-9a-f]{1,4}|[0-7]{1,3}|.)/g, unescape).replace(/[$'"]/g, '').replace(/\s+/g, ' ');
function obfuscationOne(command) {
  if (!OBFUSCATION.test(command)) return null;
  const g = loosen(command);
  return GUARDED.some((re) => re.test(g))
    ? { decision: 'ask', reason: tr('guard.destructive.obfuscated') } : null;
}

// A kit guard script (.claude/hooks) run with an indirect spelling: $VAR, $(..), `..`, ${..}, $'..', a glob * ?, xargs, a pipe or < (commit-gate.mjs $S,
// --sk$()ip, commit-*.mjs). The text rules for --skip, --approve and --plan-* cannot see through them: asked (user decision 2026-10-25).
// Heredocs and single-quoted text are not expanded; $CLAUDE_PROJECT_DIR is the documented way to name the folder.
// Only the parts of a chain (; && || newline) that run node are checked: "progress.mjs --check; wc -l < f" is not indirect.
// A heredoc body is data, but feeding it (or <<<, <, a pipe) to a guard script is asked; a line continuation is asked.
// cmd.exe %VAR% and !VAR! expand too.
// An escaped character (\;) is masked first so it does not split the chain; a part whose command word is an expansion ($n) counts as node.
const INDIRECT = /\$\(|`|\$\{|\$'|\$[A-Za-z_0-9@#?!$*-]|%\w+%|![A-Za-z_]\w*!|[*?]|\bxargs\b|\|[^|;]*\bnode\b|</;
export function hookScriptIssue(command) {
  const k = command.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, '<<HEREDOC').replace(/\\[^\r\n]/g, '\\_')
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, (q) => q.replace(/[*?]/g, '').replace(/[;&|\n]/g, ' ')).replace(/\$\{?CLAUDE_PROJECT_DIR\}?|\$env:CLAUDE_PROJECT_DIR/gi, '');
  if (!/\bnode\b/i.test(k) || !/\.claude|hooks|commit-|gate|freeze/i.test(command)) return null;
  const parts = k.split(/;|&&|\|\||\n/).filter((s) => /\bnode\b/i.test(s) || /^\s*(\w+=\S*\s+)*[$`%!]/.test(s));
  return /\\\r?\n/.test(command) || parts.some((s) => INDIRECT.test(s))
    ? { decision: 'ask', reason: tr('guard.destructive.indirectHook') } : null;
}

// Separators inside quotes turned into spaces: a quoted & or | ("a & b") must not split a command so its later flags escape the rules
const blankQuoted = (s) => s.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (q) => q.replace(/[;&|\n]/g, ' '));
// Quoted text with spaces is an argument (grep "<td>Test", node -e "… rm …"), not a command: blanked. A one-word quoted
// path ("src/a.test.ts") is kept. Such commands are still asked through evaluateOne.
const quotedTextOff = (s) => s.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (q) => (/\s/.test(q) ? ' ' : q.slice(1, -1)));
const INLINE = /\b(node|deno|bun)\s+(-e|--eval|-p|--print)\b|\bpython[\d.]*\s+-c\b|\b(ruby|perl)\s+-e\b|\b(ba|z|da)?sh\s+-c\b|\b(pwsh|powershell)(\.exe)?\s+(-c|-Command)\b|\bcmd(\.exe)?\s+\/c\b/i;
const TEST_WRITER_ONLY = 'Only the test-writer agent writes to test files: whoever writes the code cannot change tests (AGENTS.md rule 7). If a test must be added or changed, call the test-writer agent (continue it with SendMessage if it exists).';
// ctx: { tool, agent } of the call; only Claude Code tells which subagent runs it. Test files are written by the
// test-writer agent only; test config files stay a question (evaluateOne).
export function evaluate(command, ctx = {}) {
  const testWrite = ctx.tool === 'claude' && ctx.agent !== 'test-writer' && writesTest(quotedTextOff(command).replace(/\s+/g, ' '), isTestCode)
    ? { decision: 'deny', reason: TEST_WRITER_ONLY } : null;
  // An inline script (node -e, python -c, bash -c) that names a test path may write it; the shell rules cannot see inside
  const inline = INLINE.test(command) && command.split(/[\s'"`(),;=<>]+/).some(isTestCode)
    ? { decision: 'ask', reason: tr('guard.destructive.inlineTest') } : null;
  // A plain commit's message is text, not a command (same rule as permissionEquivalent)
  const c = command.replace(PLAIN_COMMIT, '$1""');
  return strictest(testWrite, inline, evaluateOne(c), evaluateOne(unquote(c)), evaluateOne(blankQuoted(c)), obfuscationOne(command), hookScriptIssue(command));
}
function evaluateOne(command) {
  const k = command.replace(/\s+/g, ' ');
  const prodDb = PROD_DB.test(k) || PROD_MARK.test(k);
  if (PROD_SECRET.test(k)) {
    return { decision: 'deny', reason: 'Prod environment variables (secrets) are being pulled onto this machine. The local environment and the AI connect to the dev project only; prod values stay in the hosting dashboard. If needed, the user runs it themselves.' };
  }
  for (const [re, reason] of DESTRUCTIVE) {
    if (re.test(k)) {
      return { decision: 'deny', reason: `${reason}${prodDb ? ' — a PROD/remote database is targeted' : ''}. The AI cannot run this command. If needed, the user takes a backup first and runs it themselves (in Claude Code with "! command" or in their own terminal).` };
    }
  }
  for (const [re, key] of NEEDS_APPROVAL) {
    if (re.test(k)) {
      return prodDb
        ? { decision: 'deny', reason: `${tr(key)}. User approval required. The command contains a prod database address; the AI cannot run it.` }
        : { decision: 'ask', reason: tr('guard.destructive.approvalSuffix', { reason: tr(key) }) };
    }
  }
  // Claude Code's Read(./.env) deny does not cover the shell (Codex and Antigravity deny it in permissionEquivalent)
  if (envIssue(k)) return { decision: 'ask', reason: tr('guard.destructive.envShell') };
  // git diff/log/show --output, format-patch -o, archive -o and bundle create write a file of the AI's choosing (a hook, a test,
  // settings); an expansion in those commands can spell --output
  if (/\bgit\b[^;&|]*\s--output(-directory)?(?=[=\s]|$)|\bgit\b[^;&|]*\b(format-patch|archive)\b[^;&|]*\s-o|\bgit\b[^;&|]*\bbundle\s+create\b|\bgit\b[^;&|]*\b(log|diff|show|format-patch|archive)\b[^;&|]*(\$[\w({'@*]|`)/i.test(k)) return { decision: 'ask', reason: tr('guard.destructive.gitOutput') };
  if (prodDb && /\b(psql|mysql|mongosh|redis-cli|prisma|drizzle-kit|alembic|supabase)\b/i.test(k)) {
    return { decision: 'ask', reason: tr('guard.destructive.remoteDb') };
  }
  if (writesTest(k)) {
    return { decision: 'ask', reason: tr('guard.destructive.testShell') };
  }
  return null;
}

if (isMain(import.meta.url)) {
  const g = readInput();
  // Of the lists, the stricter wins (deny > ask). A guard that throws would let the command run: asked instead
  let results;
  try {
    results = g ? [evaluate(g.command, g), g.tool !== 'claude' ? permissionEquivalent(g.command) : null, scopeIssue(g.command, g.dir, g.root)].filter(Boolean) : [];
  } catch (e) {
    results = [{ decision: 'ask', reason: tr('guard.destructive.internalError', { error: String(e?.message ?? e).slice(0, 200) }) }];
  }
  const s = results.find((x) => x.decision === 'deny') ?? results[0];
  if (s) decide(g.tool, s.decision, s.decision === 'ask' ? tr('guard.destructive.prefix', { reason: s.reason }) : `Shield: ${s.reason}`);
  process.exit(0);
}
