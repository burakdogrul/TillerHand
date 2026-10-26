#!/usr/bin/env node
// Destructive command and prod shield (PreToolUse, Bash).
// Why: an AI agent deleted a live database despite being told to stop (Replit, 2025). Bans given in the prompt
// are not enough; the guard must sit outside the agent. This hook leaves the decision to Claude Code's permission layer:
//   deny : commands that destroy data, commands with a prod database address. If needed, the user runs them.
//   ask  : prod deploys, store submissions, hard-to-undo git operations. The user is asked.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readInput, decide, isMain } from './shared.mjs';
import { isTestFile, isTestConfig } from './test-guard.mjs';
import { readLock, readPlan, allowedInLock, inScope, realPath, relPath, protectedRule } from './freeze-guard.mjs';

const DESTRUCTIVE = [
  [/\bdrop\s+(table|database|schema|index|view|collection)\b/i, 'DROP ile veri yapısı siliniyor'],
  [/\btruncate\s+(table\s+)?\w/i, 'TRUNCATE ile tablo boşaltılıyor'],
  [/\bdelete\s+from\s+[\w."]+\s*(;|"|'|$)/im, 'WHERE koşulu olmayan DELETE: tablodaki tüm satırlar silinir'],
  [/\balter\s+table\b[^;]*\bdrop\s+column\b/i, 'ALTER TABLE ... DROP COLUMN ile sütun ve verisi siliniyor'],
  [/\b(supabase\s+db\s+reset|prisma\s+migrate\s+reset|prisma\s+db\s+push\b[^;]*--force-reset|drizzle-kit\s+drop)\b/i, 'Veritabanı sıfırlanıyor'],
  [/\b(alembic\s+downgrade\s+base|dropdb\b|rails\s+db:(drop|reset)|django-admin\s+flush|manage\.py\s+flush)\b/i, 'Veritabanı veya şema siliniyor'],
  [/\bdocker\s+(compose\s+down\b[^;]*\s-v\b|volume\s+(rm|prune)\b|system\s+prune\b[^;]*--volumes)/i, 'Docker volume (kalıcı veri) siliniyor'],
  [/\bgit\s+clean\b(?=[^;]*\s--?[a-z]*f)(?=[^;]*\s-[a-z]*d)/i, 'git clean ile takip edilmeyen dosyalar kalıcı siliniyor'],
  [/\bredis-cli\b[^;]*\b(flushall|flushdb)\b/i, 'Redis verisi siliniyor'],
  [/\bfirebase\s+firestore:delete\b/i, 'Firestore verisi siliniyor'],
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
  [/\b(vercel|vc)\b[^;&|]*(--prod\b|--target(=|\s+)prod(uction)?\b)/i, 'Prod ortamına deploy'],
  // The subcommand can also come after flags: vercel --scope team promote <url>
  [/\b(vercel|vc)(@[\w.-]+)?\b[^;&|]*\s(promote|rollback)\b/i, 'Prod ortamı değişiyor (promote/rollback)'],
  [UNCLEAR_ENV, 'Ortam değişkenleri çekiliyor ama ortam düz development/preview değil (değişken veya özel ortam: prod olabilir)'],
  [/\b(fly|flyctl)\s+deploy\b|\brailway\s+up\b|\bnetlify\s+deploy\b[^;]*--prod/i, 'Sunucuya deploy'],
  [/\beas(-cli(@[\w.-]+)?)?\s+(submit\b|update:(rollback|republish)\b|update\b(?=[^;\n]*--(branch|channel|environment)(=|\s+)['"]?prod(uction)?\b)|deploy\b(?=[^;\n]*--prod\b))/i, 'Mağazaya gönderim, prod OTA güncellemesi veya geri alma'],
  [/\bgit\s+push\b[^;]*\b(main|master|production)\b/i, 'Ana dala doğrudan push'],
  [/\bgit\s+(rebase|filter-branch|filter-repo)\b/i, 'Git geçmişi yeniden yazılıyor'],
  [/\b(alembic\s+upgrade|prisma\s+migrate\s+deploy|supabase\s+db\s+push)\b/i, 'Migration uygulanıyor (hedef ortamı kontrol et)'],
];

// The test guard runs on file tools; changing a test or test config file from the shell (sed -i, rm, >, mv, git checkout) is asked.
// Each part of a command chain is checked alone: "rm -r node_modules && npx vitest run a.test.ts" does not change a test.
const WRITER = /\b(rm|del|erase|rmdir|rd|unlink|mv|move|cp|copy|tee|truncate|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|Clear-Content)\b|\bsed\b[^;&|]*\s(-[a-zA-Z]*i\S*|--in-place\b)|\bperl\b[^;&|]*\s-[a-zA-Z]*i|\bgit\s+(checkout|restore|rm|mv)\b/i;
const isTestPath = (t) => isTestFile(t) || isTestConfig(t) || /(^|[/\\])(tests?|__tests__|e2e|spec)[/\\]?$/i.test(t);
function writesTest(command) {
  return command.split(/&&|\|\||[;|\n]/).some((part) => {
    const p = part.replace(/\b2>&1|\b2>\s*(\/dev\/null|nul)\b/gi, '');
    const targets = [...p.matchAll(/>{1,2}\s*([^\s;&|<>]+)/g)].map((m) => m[1]);
    return targets.some(isTestPath) || (WRITER.test(p) && p.split(/\s+/).some(isTestPath));
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
    if (/^(\\\\|\/\/)/.test(h)) return markUnclear(`hedef ağ yolu (${t})`), null;
    h = h.replace(/\$\{?PWD\}?/g, d).replace(/^~(?=\/|\\|$)/, os.homedir());
    if (/[$`]/.test(h)) return markUnclear(`hedef değişken veya komut içeriyor (${t})`), null;
    if (/\{[^}]*(,|\.\.)[^}]*\}/.test(h)) return markUnclear(`hedef süslü parantez açılımı içeriyor (${t})`), null;
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
      else markUnclear(`${name} hedefi doğrulanamadı (${a.join(' ') || 'ev dizini'}); sonraki komutların klasörü bilinmiyor`);
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
      if (writerKind(path.basename(inner[0] ?? '').toLowerCase(), inner.slice(1))) markUnclear(`xargs ${inner[0]} hedef dosyayı göstermiyor`);
      close();
      continue;
    }
    const kind = writerKind(name, a);
    if (kind === 'unclear') markUnclear(`${name} ${a.find((x) => !x.startsWith('-')) ?? ''}`.trim() + ' hedef dosyayı göstermiyor');
    if (kind === 'target') {
      for (const x of fileArgs(name, a)) {
        const p = resolve(x);
        if (!p) continue;
        targets.push(p);
        // git checkout <branch>: if it is not a path it is a branch switch, the whole working tree may change
        if (name === 'git' && !fs.existsSync(p) && !a.slice(0, a.indexOf(x)).includes('--')) markUnclear(`git ${a[0]} ${x}: yol değil (dal olabilir)`);
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
    if (touchesApproval(h) || touchesApproval(realPath(h))) return { decision: 'ask', reason: /tercihler\.md$/i.test(h)
      ? `${h}: kişisel tercih dosyası (kullanıcı klasörü); kabukla değiştirilmez, node .claude/hooks/prefs.mjs --add / --remove kullanılır. Kullanıcı onayı gerekli.`
      : `${h}: kapı komut onayı kaydı (kullanıcı klasörü); kabukla değiştirilmez, node .claude/hooks/gate.mjs --approve kullanılır. Kullanıcı onayı gerekli.` };
    const rel = relPath(realPath(h), groot);
    const k = protectedRule(rel) ?? protectedRule(`${rel}/`);
    if (k) return { decision: k[0], reason: k[0] === 'deny' ? `${rel}: ${k[2]}`
      : `${rel}: ${k[2]} Kabuk komutuyla değiştiriliyor; kilit, plan ve onay durumları için ilgili kit komutunu kullan. Kullanıcı onayı gerekli.` };
  }
  // The target could not be resolved but the command names a rule/guard file ($D/AGENTS.md, {AGENTS,X}.md): asked even without a lock/plan
  if (unclear && /AGENTS|CLAUDE|\.(claude|git|github|codex|agents|env|mcp)\b|secrets|vibe-kit/i.test(command)) {
    return { decision: 'ask', reason: `${unclear}; komut kural veya koruma dosyası adını içeriyor (.claude, .git, AGENTS.md…), hedef doğrulanamadı. Kullanıcı onayı gerekli.` };
  }
  const lock = readLock(root), plan = readPlan(root);
  if (!lock && !plan) return null;
  const label = lock ? `Düzenleme kilidi (${lock}/)` : `Kapsam kalkanı (görev ${plan.task})`;
  if (unclear) return { decision: 'ask', reason: `${label}: ${unclear}; hangi dosyaların değişeceği bilinemiyor. Gerekliyse kullanıcıya sor.` };
  for (const h of targets) {
    if (!fs.existsSync(h)) continue;
    const p = realPath(h), up = path.relative(p, groot), rel = relPath(p, groot);
    if (!up.startsWith('..') && !path.isAbsolute(up)) {
      return { decision: 'ask', reason: `${label}: komut proje kökünü veya üst klasörünü hedefliyor (${rel || '.'}); kilit/plan dışındaki dosyalar da değişebilir. Gerekliyse kullanıcıya sor.` };
    }
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    if (lock && !allowedInLock(p, lock, groot)) {
      return { decision: 'ask', reason: `Düzenleme kilidi: ${rel} kilit (${lock}/) dışında ve komut onu değiştirebilir. Gerekliyse kullanıcıya sor.` };
    }
    if (plan && !inScope(fs.statSync(p).isDirectory() ? `${rel}/` : rel, plan.paths)) {
      return { decision: 'ask', reason: `Kapsam kalkanı: ${rel} onaylı planda yok (görev ${plan.task}) ve komut onu değiştirebilir. Gerekliyse kullanıcıya sor; ` +
        'onaylarsa node .claude/hooks/freeze-guard.mjs --plan-add <yol>.' };
    }
  }
  return null;
}

// Commands denied/asked in Claude Code via .claude/settings.json → permissions. Codex and Antigravity have no such
// list; this is its counterpart (applied only on those tools, Claude's behavior does not change).
// Only the real .claude/hooks/commit-gate.mjs --approve is kept out of the gate rule (separators optional: unquote drops backslashes;
// anchored at the start of the path, so sandbox/.claude/hooks/commit-gate.mjs, a renamed gate.mjs, is not exempt).
const PERMISSION_EQUIVALENT = [
  ['deny', /\brm\b(?=[^;&|]*\s--?[a-z]*r)(?=[^;&|]*\s--?[a-z]*f)/i, 'rm -rf ile toplu silme'],
  ['deny', /\b(Remove-Item|rm|ri|del|erase)\b[^;&|]*\s-Recurse\b|\b(rmdir|rd|del)\s+[^;&|]*\/s\b/i, 'Klasör toplu siliniyor'],
  ['deny', /\bgit\s+reset\s+[^;&|]*--hard\b/i, 'git reset --hard ile commit edilmemiş iş siliniyor'],
  ['deny', /\bgit\s+push\b[^;&|]*\s(--force\S*|-\w*f\w*|\+\S+)(?=\s|$)/i, 'git push --force ile uzak geçmiş eziliyor'],
  ['deny', /(^|[\s'"=<>/\\])\.env(?!\.example\b)(\.[\w.-]+|\*)?(?=$|[\s'";|&)<>])|(^|[\s'"/\\])secrets[/\\]/i, '.env veya secrets/ dosyasına erişiliyor (AI okumaz, yazmaz)'],
  ['ask', /freeze-guard\.mjs['"]?\s+['"]?--off\b/i, 'Düzenleme kilidi kaldırılıyor'],
  ['ask', /tools\.mjs['"]?\s+['"]?--commands\b/i, 'Paylaşılan .claude/settings.json → skillOverrides değişiyor (komut listesi)'],
  ['ask', /freeze-guard\.mjs['"]?\s+['"]?--plan-add\b/i, 'Onaylı planın dosya listesi genişliyor (kapsam kalkanı)'],
  ['ask', /freeze-guard\.mjs['"]?\s+['"]?--plan-save\b/i, 'Kapsam kalkanının dosya listesi yazılıyor'],
  ['ask', /freeze-guard\.mjs['"]?\s+['"]?--plan-end\b/i, 'Kapsam kalkanı kapatılıyor'],
  ['ask', /commit-gate\.mjs['"]?\s+['"]?--skip\b/i, 'Commit kapısı ve kurul denetimi atlanıyor'],
  ['ask', /prefs\.mjs['"]?\s+['"]?--(add|remove)\b/i, 'Kişisel tercih dosyası (~/.vibe-kit/tercihler.md) değişiyor'],
  ['ask', /(?<!(?:^|[\s'"=])(?:\.[\\/]|\$\{?CLAUDE_PROJECT_DIR\}?[\\/]?)?\.claude[\\/]?hooks[\\/]?commit-)gate\.mjs['"]?\s+['"]?--approve\b/i, 'Deterministik kapının çalıştıracağı komutlar onaylanıyor'],
  // Shell counterpart of the PROTECTED rule on file tools: a command that names a rule or guard file and writes/deletes is asked
  // (.git: the gate command approval and git hooks live there)
  ['ask', /(?=.*((^|[\s'"/\\])\.(claude|codex|agents|git)(?=$|[\s/\\'"])|\bAGENTS\.md|\bCLAUDE\.md))(?=.*(\b(rm|del|erase|rmdir|rd|mv|move|cp|copy|tee|truncate|checkout|restore|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item)\b|\bsed\s+-i|>|\bnode\s+-e|\bpython\d?\s+-c))/i, 'Kural veya koruma dosyası kabuk komutuyla değiştiriliyor'],
];

// What the shell will see: $'..' is opened, quotes, \ escapes and PowerShell ` escapes drop. For matching only.
// Why: --pro""d, pr\omote, $'--prod' become --prod and promote in the shell; writing each rule per quoting style can be bypassed.
export const unquote = (s) => s.replace(/\$'((?:[^'\\]|\\.)*)'/g, '$1').replace(/\\(.)/g, '$1').replace(/[`'"]/g, '');

// Of the raw and unquoted text, the stricter decision wins (deny > ask)
const RANK = { deny: 2, ask: 1 };
const strictest = (...s) => s.filter(Boolean).sort((a, b) => RANK[b.decision] - RANK[a.decision])[0] ?? null;

export function permissionEquivalent(command) {
  return strictest(permissionOne(command), permissionOne(unquote(command)), permissionOne(blankQuoted(command)));
}
function permissionOne(command) {
  const k = command.replace(/\s+/g, ' ').replace(/\b2>&1|\b2>\s*(\/dev\/null|nul)\b/gi, ''); // an error redirect is not a write
  const e = PERMISSION_EQUIVALENT.find(([, re]) => re.test(k));
  return e ? { decision: e[0], reason: `${e[2]}. ${e[0] === 'deny' ? 'AI bu komutu çalıştıramaz; gerekliyse kullanıcı kendisi çalıştırır.' : 'Kullanıcı onayı gerekli.'}` } : null;
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
    ? { decision: 'ask', reason: 'Komut gizlenmiş görünüyor (satır sonu \\, $\'..\', $(...), `...` veya ${...}) ve korunan bir işlem içeriyor. Kullanıcı onayı gerekli.' } : null;
}

// A kit guard script (.claude/hooks) run with an indirect spelling: $VAR, $(..), `..`, ${..}, $'..', a glob * ?, xargs, a pipe or < (commit-gate.mjs $S,
// --sk$()ip, commit-*.mjs). The text rules for --skip, --approve and --plan-* cannot see through them: asked (user decision 2026-10-25).
// Heredocs and single-quoted text are not expanded; $CLAUDE_PROJECT_DIR is the documented way to name the folder.
export function hookScriptIssue(command) {
  const k = command.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, '').replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, (q) => q.replace(/[*?]/g, '')).replace(/\$\{?CLAUDE_PROJECT_DIR\}?|\$env:CLAUDE_PROJECT_DIR/gi, '');
  if (!/\bnode\b/i.test(k) || !/\.claude|hooks|commit-|gate|freeze/i.test(command)) return null;
  // Arguments from elsewhere count too: xargs, a pipe into node, an input redirect or <(...)
  return /\$\(|`|\$\{|\$'|\$[A-Za-z_]|[*?]|\bxargs\b|\|[^|;&]*\bnode\b|<(?!<)/.test(k)
    ? { decision: 'ask', reason: 'Kitin koruma betiği dolaylı yazımla çalıştırılıyor ($DEĞİŞKEN, $(...), `...`, ${...} veya * ?); kural metni bunun içini göremez. Kullanıcı onayı gerekli.' } : null;
}

// Separators inside quotes turned into spaces: a quoted & or | ("a & b") must not split a command so its later flags escape the rules
const blankQuoted = (s) => s.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (q) => q.replace(/[;&|\n]/g, ' '));
export function evaluate(command) {
  return strictest(evaluateOne(command), evaluateOne(unquote(command)), evaluateOne(blankQuoted(command)), obfuscationOne(command), hookScriptIssue(command));
}
function evaluateOne(command) {
  const k = command.replace(/\s+/g, ' ');
  const prodDb = PROD_DB.test(k) || PROD_MARK.test(k);
  if (PROD_SECRET.test(k)) {
    return { decision: 'deny', reason: 'Prod ortam değişkenleri (sırlar) bu makineye çekiliyor. Yerel ortam ve AI sadece dev projesine bağlanır; prod değerleri barındırma panelinde kalır. Gerekliyse kullanıcı kendisi çalıştırır.' };
  }
  for (const [re, reason] of DESTRUCTIVE) {
    if (re.test(k)) {
      return { decision: 'deny', reason: `${reason}${prodDb ? ' — PROD/uzak veritabanı hedefleniyor' : ''}. AI bu komutu çalıştıramaz. Gerekliyse kullanıcı, önce yedek alıp kendisi çalıştırır (Claude Code'da "! komut" veya kendi terminali).` };
    }
  }
  for (const [re, reason] of NEEDS_APPROVAL) {
    if (re.test(k)) return { decision: prodDb ? 'deny' : 'ask', reason: `${reason}. Kullanıcı onayı gerekli.${prodDb ? ' Komut prod veritabanı adresi içeriyor; AI çalıştıramaz.' : ''}` };
  }
  if (prodDb && /\b(psql|mysql|mongosh|redis-cli|prisma|drizzle-kit|alembic|supabase)\b/i.test(k)) {
    return { decision: 'ask', reason: 'Komut localhost dışındaki bir veritabanına bağlanıyor (prod olabilir). Kullanıcı onayı gerekli; AI prod erişim bilgisi kullanmamalı.' };
  }
  if (writesTest(k)) {
    return { decision: 'ask', reason: 'Test dosyası kabuk komutuyla değiştiriliyor, taşınıyor veya siliniyor. Testi geçirmek için testi zayıflatmak yasak (AGENTS.md kural 7); test düzenlemesini dosya aracıyla yap. Kullanıcı onayı gerekli.' };
  }
  return null;
}

if (isMain(import.meta.url)) {
  const g = readInput();
  // Of the lists, the stricter wins (deny > ask)
  const results = g ? [evaluate(g.command), g.tool !== 'claude' ? permissionEquivalent(g.command) : null, scopeIssue(g.command, g.dir, g.root)].filter(Boolean) : [];
  const s = results.find((x) => x.decision === 'deny') ?? results[0];
  if (s) decide(g.tool, s.decision, `Kalkan: ${s.reason}`);
  process.exit(0);
}
