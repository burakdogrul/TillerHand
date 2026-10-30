#!/usr/bin/env node
// Package gate (PreToolUse, Bash): checks a package the AI wants to install, or download and run (npx, uvx …), before it reaches the machine.
// Why: AIs invent package names that do not exist; attackers register those names (slopsquatting).
//   Package missing                                                        -> denied (deny)
//   Very new / few downloads / very close to a popular package / unverified -> the user is asked (ask)
// The decision goes through Claude Code's permission UI; the AI cannot skip it.

import fs from 'node:fs';
import path from 'node:path';
import { readInput, decide, isMain, findRoot } from './shared.mjs';
import { boardAfter } from './freeze-guard.mjs';
import { t } from './lang.mjs';

export const THRESHOLD = { newDays: 30, npmWeeklyDownloads: 500 };

// A short list of the most used packages, for the look-alike name (typosquat) check
const POPULAR = {
  npm: ['react', 'react-dom', 'next', 'vue', 'express', 'axios', 'lodash', 'zod', 'prisma', 'drizzle-orm', 'tailwindcss', 'typescript',
    'eslint', 'prettier', 'vitest', 'jest', 'dotenv', 'stripe', 'openai', '@anthropic-ai/sdk', 'date-fns', 'dayjs', 'uuid', 'nanoid',
    'chalk', 'commander', 'mongoose', 'pg', 'mysql2', 'redis', 'jsonwebtoken', 'bcrypt', 'bcryptjs', 'cors', 'helmet', 'zustand',
    'expo', 'react-native', 'sharp', 'resend', 'nodemailer', 'framer-motion', 'clsx', 'classnames', 'yup', 'formik', 'swr'],
  pypi: ['requests', 'numpy', 'pandas', 'fastapi', 'pydantic', 'sqlalchemy', 'alembic', 'django', 'flask', 'httpx', 'uvicorn', 'pytest',
    'boto3', 'openai', 'anthropic', 'python-dotenv', 'celery', 'redis', 'psycopg', 'psycopg2', 'psycopg2-binary', 'pillow', 'scipy',
    'matplotlib', 'beautifulsoup4', 'selenium', 'click', 'typer', 'rich', 'jinja2', 'pyyaml', 'cryptography', 'pyjwt', 'passlib',
    'langchain', 'transformers', 'torch', 'scikit-learn', 'aiohttp', 'tenacity', 'ruff', 'black', 'mypy'],
};

// Case-insensitive (the Windows shell is); npm's install aliases (in, ins, isntall, it…) count as install
const COMMANDS = [
  [/^(npm|pnpm|bun)\s+(i|in|ins|inst|insta|instal|install|isnt|isnta|isntal|isntall|it|add)\b/i, 'npm'], [/^yarn\s+(global\s+)?add\b/i, 'npm'], [/^(npx\s+)?expo\s+install\b/i, 'npm'],
  // create/init <name> downloads and runs create-<name>; deno takes npm:<name> specifiers
  [/^(npm|pnpm|yarn|bun)\s+(create|init)\b/i, 'npm', 'create'], [/^deno\s+(add|install|run|x)\b/i, 'npm', 'deno'],
  // pip's own options can come before install, with a value (pip --index-url URL install x, pip --proxy P install x)
  [/^uv\s+(add|pip\s+install|tool\s+install)\b/i, 'pypi'], [/^((python[\d.]*|py)(\s+-\d[\d.]*)?\s+-m\s+)?pip[\d.]*(\s+-\S+(\s+(?!install\b)[^\s-]\S*)?)*\s+install\b/i, 'pypi'],
  [/^(poetry|pdm)\s+add\b|^(pipenv|pipx)\s+install\b/i, 'pypi'],
  // Registries the gate does not query: every package named there is asked (user decision 2026-10-30)
  [/^cargo(\s+-\S+)*\s+(\+\S+\s+)?(add|install)\b/i, 'cargo'], [/^go\s+(get|install)\b/i, 'go'], [/^(gem\s+install|bundle\s+add)\b/i, 'gem'],
  [/^composer\s+(global\s+)?require\b/i, 'composer'],
];
const OTHER_VALUE = /^(--path|--version|--vers|--features|-F|--rename|--package|-p|--branch|--tag|--rev|--registry|--index|--root|--target|--profile|-C|--manifest-path|-v|-i|--install-dir|-n|--bindir|--source|-s|--git|-j|--jobs)$/;

// Where an install argument comes from: 'local' (a path or file: link, already on this machine), 'remote' (git, a URL, a
// GitHub shorthand user/repo: not the registry the gate checks, user decision 2026-10-30), or null (a registry name).
// ~ is a path only as ~/ or ~\ (~1.2.3 is a semver range)
const LOCAL = /^(\.{1,2}([\\/]|$)|[\\/]|~([\\/]|$)|[A-Za-z]:[\\/]|file:|link:|workspace:|portal:)/i;
const REMOTE = /^(git\+|git:|ssh:|https?:|github:|gitlab:|bitbucket:|gist:)/i;
function npmSource(arg) {
  for (;;) {
    if (LOCAL.test(arg)) return 'local';
    if (REMOTE.test(arg)) return 'remote';
    const at = arg.indexOf('@', 1), spec = at > 0 ? arg.slice(at + 1) : '';
    if (spec.startsWith('npm:')) { arg = spec.slice(4); continue; }
    if (LOCAL.test(spec)) return 'local';
    if (/[:/]/.test(spec)) return 'remote';
    return !arg.startsWith('@') && arg.includes('/') ? 'remote' : null;
  }
}
function pypiSource(arg) {
  if (LOCAL.test(arg)) return 'local';
  if (REMOTE.test(arg)) return 'remote';
  const ref = arg.match(/^[^@;]*@\s*(\S+)/)?.[1];
  if (ref) return LOCAL.test(ref) ? 'local' : 'remote';
  return /\.(whl|tar\.gz|zip)$/i.test(arg) ? 'local' : null;
}
// A registry other than the public one: what gets installed cannot be checked. Read on the whole command, so a variable
// exported in an earlier statement (export PIP_INDEX_URL=…; pip install x) or a bare npm ci --registry … counts too.
// FLAG counts when the command runs a package manager; CONFIG (config set, a write to a registry config file) always.
// npm accepts an unambiguous prefix of a flag (--regist=…). Gaps are bounded: the text is linear to scan.
const MANAGER = /\b(npm|pnpm|yarn|bun|npx|bunx|pnpx|pip[\d.]*|uv|uvx|poetry|pdm|pipenv|pipx)\b/i;
// Registry config files: writing one points installs elsewhere (the file tools ask too, see gate())
export const REGISTRY_CONFIG = /(^|[\\/])(\.npmrc|\.yarnrc(\.yml)?|\.pnpmrc|bunfig\.toml|pip\.conf|pip\.ini|uv\.toml|poetry\.toml|\.pypirc)$/i;
const CONFIG_WRITE = /(>{1,2}|\b(tee|cp|copy|mv|move|ln|Set-Content|Add-Content|Out-File|Copy-Item|Move-Item|New-Item)\b[^;&|\n]{0,1000}?)\s*(-\w+\s+)?['"]?[^\s'";&|<>]*(\.npmrc|\.yarnrc(\.yml)?|\.pnpmrc|bunfig\.toml|pip\.conf|pip\.ini|uv\.toml|poetry\.toml|\.pypirc)(?![\w.-])/i;
const OTHER_REGISTRY = {
  npm: {
    FLAG: /(^|[\s'"])--((@[\w.-]+:)?reg[a-z]*|userconfig)(?:(?:=|\s+)\S*|$)|\b(npm_config_(@[\w.-]+:)?registry|npm_config_userconfig|YARN_NPM_REGISTRY_SERVER|YARN_REGISTRY)\s*=\S*/i,
    CONFIG: new RegExp(`\\b(npm|pnpm|yarn|bun)\\b[^;&|\\n]{0,200}\\bset\\b[^;&|\\n]{0,200}(registry|RegistryServer)\\S*(\\s+\\S+)?|${CONFIG_WRITE.source}`, 'i'),
  },
  pypi: {
    FLAG: /(^|[\s'"])(--(extra-)?index-url|--index|--default-index|--find-links)(?:(?:=|\s+)\S*|$)|\b(PIP_(EXTRA_)?INDEX_URL|PIP_FIND_LINKS|PIP_CONFIG_FILE|UV_(EXTRA_)?INDEX(_URL)?|UV_DEFAULT_INDEX|UV_FIND_LINKS|UV_CONFIG_FILE)\s*=\S*/i,
    CONFIG: /\bpip[\d.]*\b[^;&|\n]{0,200}\bconfig\b[^;&|\n]{0,200}\bset\b[^;&|\n]{0,200}(index-url|find-links|trusted-host)\S*(\s+\S+)?|\bpoetry\s+(source\s+add|config\s+(repositories|http-basic|certificates)\.)\S*(\s+\S+)?/i,
  },
};
const remote = (eco, spec) => ({ eco, name: '', spec, unverifiable: true });
// create-vite for vite, @scope/create for @scope, @scope/create-x for @scope/x (npm's own mapping)
function createName(arg) {
  const n = npmName(arg);
  if (!n) return null;
  if (!n.startsWith('@')) return `create-${n}`;
  const [scope, rest] = n.split('/');
  return rest ? `${scope}/create-${rest}` : `${scope}/create`;
}

// Download-and-run: the first positional is the package (the rest are its arguments), or the values of the package flags.
// local: the runner uses a bin the project already has before downloading (npx, npm exec, bunx); pnpm/yarn dlx always download.
// positional: false for uv run (its positional is a script; only --with names packages).
const EXEC = [
  { re: /^(npx|npm\s+(exec|x)|bunx|bun\s+x)\b/i, eco: 'npm', local: true, positional: true },
  { re: /^(pnpx|pnpm\s+dlx|yarn\s+dlx)\b/i, eco: 'npm', local: false, positional: true },
  { re: /^(uvx|uv\s+tool\s+run|pipx\s+run)\b/i, eco: 'pypi', local: false, positional: true },
  { re: /^uv\s+run\b/i, eco: 'pypi', local: false, positional: false },
];
const FLAGS = {
  npm: { pkg: /^(-p|--package)$/, value: /^(-p|--package|-c|--call|--registry|--prefix|--cache|--userconfig|--globalconfig|-w|--workspace|--node-options|--script-shell|--shell|--loglevel|-C|--dir|--filter)$/ },
  pypi: { pkg: /^(--from|--spec)$/, value: /^(--from|--spec|--with|--with-requirements|--with-editable|-p|--python|-i|--index|--index-url|--extra-index-url|--default-index|--pip-args|-c|--constraints|--overrides)$/ },
};

// Returns [{ arg, fromFlag, unsure }]. After an unknown flag its value may be the next word: that word and the one after are
// both checked, unsure (a missing one is asked, not denied: it may be a file name).
function execArgs(args, eco, positional) {
  const named = [], extra = [], out = [];
  let unknown = false;
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].split(/=(.*)/s);
    if (args[i] === '--') { if (positional && args[i + 1]) out.push({ arg: args[i + 1] }); break; }
    if (FLAGS[eco].value.test(flag)) {
      const v = inline ?? args[++i] ?? '';
      if (FLAGS[eco].pkg.test(flag)) named.push({ arg: v, fromFlag: true });
      else if (flag === '--with') extra.push(...v.split(',').map((arg) => ({ arg, fromFlag: true })));
      continue;
    }
    if (args[i].startsWith('-')) { unknown ||= inline === undefined && /^--?\w/.test(flag) && !/^(-y|--yes|--no|-q|--quiet|-s|--silent|--no-install|--ignore-existing|--offline|-v|--verbose)$/.test(flag); continue; }
    if (!positional || named.length) break;
    out.push({ arg: args[i], unsure: unknown });
    if (unknown && args[i + 1] && !args[i + 1].startsWith('-')) out.push({ arg: args[i + 1], unsure: true });
    break;
  }
  return [...(named.length ? named : out), ...extra];
}

// What runs a segment: wrappers, VAR=x, a path or .cmd/.exe on the tool, and the manager's own flags before its subcommand are
// dropped (FOO=1 npx x, cmd /c npx x, bash -c "npx x", /usr/bin/npx x, npx.cmd x, pnpm -C . dlx x, npm --silent exec x).
// Also timeout/nice/stdbuf, shell keywords (then, do, else, !) and combined shell flags (bash -lc).
const WRAPPER = /^(?:\(|\{|!\s*|[A-Za-z_]\w*=\S*\s+|(?:sudo|env|time|nohup|exec|command|xargs|corepack|call|start|then|do|else|ionice|stdbuf)\s+|timeout\s+(?:-\S+\s+)*\S+\s+|nice\s+(?:-n\s*\S+\s+|-\d+\s+)?|(?:bash|sh|zsh|dash|cmd|pwsh|powershell)(?:\.exe)?\s+(?:-\w*c|\/c|\/k|-Command)\s+["']?)/i;
const SUBCOMMAND = /^(install|i|add|exec|x|dlx|tool|pip|run|global)$/;
const VALUE_FLAG = /^(--prefix|-C|--dir|--cwd|--workspace|--filter|--registry|--cache|--userconfig)$/i;
export function normalize(part) {
  let s = part.trim(), prev;
  do { prev = s; s = s.replace(WRAPPER, '').trim(); } while (s !== prev);
  // A path (Windows \ too, quoted with spaces) and .cmd/.exe on the tool: "C:\Program Files\nodejs\npm.cmd" i x → npm i x
  s = s.replace(/^"(?:[^"]*[\\/])?([\w.-]+?)(?:\.cmd|\.exe|\.ps1)?"(?=\s|$)/i, '$1')
    .replace(/^["']?(?:[^\s"']*[\\/])?([\w.-]+?)(?:\.cmd|\.exe|\.ps1)?["']?(?=\s|$)/i, '$1');
  const t = s.split(/\s+/);
  if (/^(npm|pnpm|yarn|bun|uv)$/i.test(t[0])) {
    let i = 1;
    // A flag known to take a value always skips it (npm --prefix x i: x is a folder, not the exec subcommand)
    while (i < t.length && t[i].startsWith('-')) i += VALUE_FLAG.test(t[i]) || (!t[i].includes('=') && t[i + 1] && !t[i + 1].startsWith('-') && !SUBCOMMAND.test(t[i + 1])) ? 2 : 1;
    // yarn workspace <name> add x: the workspace name is not the subcommand
    if (/^yarn$/i.test(t[0]) && /^workspace$/i.test(t[i] ?? '')) i += 2;
    s = [t[0], ...t.slice(i)].join(' ');
  }
  return s;
}

const NOT_REGISTRY = /^(\.|\/|~[\\/]|file:|link:|git\+|git:|https?:|github:|workspace:)/;
function npmName(arg) {
  // name@npm:other installs "other": the alias target is checked (a loop: a deep a@npm:a@npm:… chain must not overflow
  // the stack). name@github:x/y, @https:… are not from the registry (like a bare URL, not checked here).
  for (;;) {
    if (NOT_REGISTRY.test(arg)) return null;
    const at = arg.indexOf('@', 1), spec = at > 0 ? arg.slice(at + 1) : '';
    if (spec.startsWith('npm:')) { arg = spec.slice(4); continue; }
    if (/[:/]/.test(spec)) return null;
    return (at > 0 ? arg.slice(0, at) : arg) || null;
  }
}

function pypiName(arg) {
  if (/^(\.|\/|git\+|https?:|file:)/.test(arg) || /\.(whl|tar\.gz|zip)$/.test(arg)) return null;
  return arg.split(/[\[<>=!~;@\s]/)[0].toLowerCase() || null;
}

export function findPackages(command) {
  const result = [];
  for (const [eco, { FLAG, CONFIG }] of Object.entries(OTHER_REGISTRY)) {
    const m = command.match(CONFIG) ?? (MANAGER.test(command) ? command.match(FLAG) : null);
    if (m) result.push(remote(eco, m[0].trim().replace(/^['"]+|['";]+$/g, '')));
  }
  // Every place a new command can start: chains, a newline, a background &, $( ), backticks, ( ) and { } groups.
  // A redirect's & (2>&1, &>) is not a separator. A # comment is not an argument.
  for (const raw of command.split(/\n|&&|\|\||;|\||(?<![>&])&(?![>&])|\$\(|`|[(){}]/)) {
    // A # comment ends the part only outside quotes and after an unescaped blank (--prefix "a #b", a\ #b are values)
    const cut = raw.replace(/"(?:[^"\\]|\\.)*"?|'[^']*'?|\\[\s\S]/g, (q) => '_'.repeat(q.length)).search(/(^|\s)#/);
    const part = cut < 0 ? raw : raw.slice(0, cut);
    const s = normalize(part);
    const match = COMMANDS.find(([re]) => re.test(s));
    const exec = match ? null : EXEC.find((e) => e.re.test(s));
    if (!match && !exec) continue;
    const re = match?.[0] ?? exec.re, eco = match?.[1] ?? exec.eco;
    // Redirects (2>&1, > log, 2>/dev/null, &> x) are not arguments; a quoted "pkg>=1" has no space before ">" and stays.
    // Words are split like the shell does: a quoted value with spaces ("a #b") is one word
    const args = (s.replace(re, '').replace(/\s+(\d*|&)(>>?|<)(&\d+|\s*[^\s'"]+)/g, '').trim().match(/(?:[^\s"']+|"[^"]*"?|'[^']*'?)+/g) ?? [])
      .map((x) => x.replace(/["']/g, '').replace(/^\(+|\)+$/g, '')).filter(Boolean);
    if (!POPULAR[eco]) {
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a.startsWith('-')) { if (OTHER_VALUE.test(a) && args[++i] && a === '--git') result.push(remote(eco, args[i])); continue; }
        if (!LOCAL.test(a)) result.push({ eco, name: a, unverifiable: true });
      }
      continue;
    }
    const source = eco === 'npm' ? npmSource : pypiSource;
    if (exec) {
      for (const { arg, fromFlag, unsure } of execArgs(args, eco, exec.positional)) {
        if (source(arg) === 'remote') { result.push(remote(eco, arg)); continue; }
        const name = eco === 'npm' ? npmName(arg) : pypiName(arg);
        if (name) result.push({ eco, name, exec: true, spec: arg, ...(exec.local && !fromFlag && { local: true }), ...(unsure && { unsure: true }) });
      }
      continue;
    }
    if (match[2] === 'create') {
      const name = createName(args.find((a) => !a.startsWith('-')) ?? '');
      if (name) result.push({ eco, name });
      continue;
    }
    if (match[2] === 'deno') {
      for (const a of args) if (/^npm:/i.test(a)) { const name = npmName(a.slice(4)); if (name) result.push({ eco, name }); }
      continue;
    }
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.startsWith('-')) {
        if (eco === 'pypi') {
          // pip short options take their value attached too: -ihttps://…, -fhttps://…, -egit+https://…, --editable=git+…
          if (/^-[if]./.test(a)) result.push(remote(eco, a));
          const v = a.match(/^(?:-[erc]|--(?:editable|requirement|constraint)=)(.+)$/)?.[1];
          if (v && pypiSource(v) === 'remote') result.push(remote(eco, v));
        }
        // npm's -f is --force (no value): the pip-only flags count only for pip
        if (/^(-r|--requirement|-e|--editable|-c|--constraint|--index-url|-i|--extra-index-url|--filter|--prefix|--group)$/.test(a)
          || (eco === 'pypi' ? /^(-f|--find-links|--index|--default-index|--trusted-host|--source|-t|--target|--root|--platform|--python-version)$/ : /^--registry$/).test(a)) {
          const v = args[i + 1];
          // -e git+https://…, -r https://… install from a source the gate cannot check; so do -i/-f
          if (eco === 'pypi' && v && (/^(-[if])$/.test(a) || (/^(-e|--editable|-r|--requirement|-c|--constraint)$/.test(a) && pypiSource(v) === 'remote'))) result.push(remote(eco, `${a} ${v}`));
          i++; // flag that takes a value
        }
        continue;
      }
      if (source(a) === 'remote') { result.push(remote(eco, a)); continue; }
      const name = eco === 'npm' ? npmName(a) : pypiName(a);
      if (name) result.push({ eco, name });
    }
  }
  return result;
}

// Dependency files written with a file tool: the names the write ADDS are checked like an install (user decision
// 2026-10-30), so "edit package.json, then a bare npm ci" cannot skip the gate. null: the result does not parse (asked).
const DEP_FILE = /(^|\/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|requirements\/[^/]+\.txt)$/i;
const NPM_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
// A package name without its version (foo@1.2 → foo, @s/x@1 → @s/x)
const bare = (n) => n.replace(/(?<=.)@.*$/, '');
// Override keys: npm overrides nest ({ foo: { ".": "1", bar: "2" } }), yarn resolutions are paths (**/bar, @s/a/b),
// pnpm.overrides chain names (foo@<2>bar, foo>bar)
function overrideDeps(o, out) {
  for (const [k, v] of Object.entries(obj(o))) {
    if (k === '.') continue;
    out.push([bare(k), typeof v === 'string' ? v : typeof obj(v)['.'] === 'string' ? v['.'] : '']);
    if (v && typeof v === 'object') overrideDeps(v, out);
  }
}
function resolutionName(k) {
  const parts = k.split('/').filter((p) => p && p !== '**');
  let last = parts.pop() ?? '';
  if (parts.at(-1)?.startsWith('@')) last = `${parts.pop()}/${last}`;
  return bare(last);
}
// Every npm dependency the file declares, as { name, spec, remote }: an npm: alias names its target ("x": "npm:evil@1" adds evil);
// a local spec (file:, link:, workspace:) is left out; a git, URL or user/repo spec is remote
function npmDeps(j) {
  const pairs = NPM_SECTIONS.flatMap((k) => Object.entries(obj(j?.[k])));
  overrideDeps(j?.overrides, pairs);
  for (const [k, v] of Object.entries(obj(j?.resolutions))) pairs.push([resolutionName(k), v]);
  for (const [k, v] of Object.entries(obj(j?.pnpm?.overrides))) for (const n of k.split('>')) pairs.push([bare(n), n === k.split('>').at(-1) ? v : '']);
  const out = [];
  for (const [n, v] of pairs) {
    const spec = typeof v === 'string' ? v : '';
    // pnpm catalog: and yarn patch: resolve to the registry package of the same name
    const arg = /^npm:/i.test(spec) ? spec.slice(4) : spec && !/^(catalog|patch):/i.test(spec) ? `${n}@${spec}` : n;
    const source = npmSource(arg);
    if (source === 'remote') out.push({ name: n, spec, remote: true });
    else if (!source && !/^\$/.test(spec)) { const name = npmName(arg); if (name) out.push({ name, spec }); }
  }
  return out;
}
// requirements lines: a name, a git/URL line or an index/find-links option (remote), local paths and -r/-c are left out
function requirementDeps(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const s = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!s) continue;
    // Short options may carry their value attached (-ihttps://…, -egit+https://…)
    const opt = s.match(/^(--editable|--index-url|--extra-index-url|--find-links|--requirement|--constraint|-[eifrc])(?:=|\s+)?(.*)$/);
    if (opt) {
      if (/^(-[if]|--index-url|--extra-index-url|--find-links)$/.test(opt[1]) || pypiSource(opt[2]) === 'remote') out.push({ name: '', spec: s, remote: true });
      continue;
    }
    if (s.startsWith('-')) continue;
    out.push(...pep508(s));
  }
  return out;
}
const pep508 = (s) => {
  const source = pypiSource(s);
  if (source === 'remote') return [{ name: pypiName(s.replace(REMOTE, '')) ?? '', spec: s, remote: true }];
  if (source === 'local') return [];
  const name = pypiName(s);
  return name ? [{ name, spec: s }] : [];
};
// pyproject.toml, by full dotted key (section + key, so [project] optional-dependencies.dev = […], a top-level
// project.dependencies = […] and a quoted ["project"] header read the same):
//   arrays of requirements: PY_ARRAY; one table entry per package (Poetry dependencies, uv sources): PY_TABLE, also as a
//   sub-table header [tool.poetry.dependencies.x]; a custom index URL ([[tool.uv.index]], [[tool.poetry.source]]): PY_INDEX.
// Array items are read token by token: a quoted "]" does not end the array, an { include-group = "x" } table is not a
// name, a # comment ends the line.
const PY_ARRAY = /^(project\.dependencies|project\.optional-dependencies\.[^.]+|dependency-groups\.[^.]+|tool\.uv\.(dev|constraint|override)-dependencies|build-system\.requires|tool\.pdm\.dev-dependencies\.[^.]+|tool\.hatch\.envs\.[^.]+\.(extra-)?dependencies)$/;
const PY_TABLE = /^(tool\.poetry(\.group\.[^.]+)?\.(dev-)?dependencies|tool\.uv\.sources)\.([^.]+)$/;
const PY_INDEX = /^(tool\.uv\.index|tool\.poetry\.source|tool\.pdm\.source)\.url$/;
// A uv source only redirects a declared package: it adds no name, only a remote spec
const tableEntry = (full, value) => {
  const t = full.match(PY_TABLE), name = t?.[4].toLowerCase();
  if (!t || name === 'python') return [];
  if (/\b(git|url)\s*=/.test(value)) return [{ name, spec: value, remote: true }];
  return /\bpath\s*=/.test(value) || t[1] === 'tool.uv.sources' ? [] : [{ name, spec: '' }];
};
function pyprojectDeps(text) {
  const out = [];
  let section = '', inArray = false, table = null;
  // [tool.poetry.dependencies.x] declares x with its keys on the next lines: decided when the section ends
  const flush = () => { if (table !== null) out.push(...tableEntry(section, table)); table = null; };
  for (const raw of [...text.split(/\r?\n/), '[]']) {
    const line = raw.trim();
    const head = inArray ? null : line.match(/^\[\[?([^\]]*)\]\]?$/);
    if (head) {
      flush();
      section = head[1].replace(/["'\s]/g, '');
      if (PY_TABLE.test(section)) table = '';
      continue;
    }
    let rest = line;
    if (!inArray) {
      const key = line.match(/^((?:"[^"]*"|'[^']*'|[\w.-]+)(?:\s*\.\s*(?:"[^"]*"|'[^']*'|[\w.-]+))*)\s*=\s*(.*)$/);
      if (!key) continue;
      const k = key[1].replace(/["'\s]/g, ''), full = section ? `${section}.${k}` : k, value = key[2];
      if (PY_ARRAY.test(full) && value.startsWith('[')) { inArray = true; rest = value.slice(1); }
      else {
        if (PY_TABLE.test(full)) out.push(...tableEntry(full, value));
        else if (table !== null && /^(git|url|path)$/.test(k)) table += ` ${k} = ${value}`;
        else if (PY_INDEX.test(full)) out.push({ name: '', spec: value, remote: true });
        continue;
      }
    }
    for (const [tok] of rest.matchAll(/"(?:[^"\\]|\\.)*"|'[^']*'|\{[^}]*\}?|\]|#.*$/g)) {
      if (tok === ']') { inArray = false; break; }
      if (tok.startsWith('#')) break;
      if (tok.startsWith('{')) continue;
      out.push(...pep508(tok.slice(1, -1)));
    }
  }
  return out;
}
// What the write adds: a registry name not declared before (a version change is not checked), or a remote spec not there
// before (asked, never checked). Returns [{ eco, name, spec?, unverifiable? }] or null when the result does not parse.
export function addedDependencies(file, before, after) {
  const rel = file.replace(/\\/g, '/');
  const added = (eco, a, b) => {
    const names = new Set(b.filter((d) => !d.remote).map((d) => d.name)), specs = new Set(b.map((d) => `${d.name}\0${d.spec}`));
    const seen = new Set();
    return a.filter((d) => (d.remote ? !specs.has(`${d.name}\0${d.spec}`) : !names.has(d.name)))
      .filter((d) => { const k = `${d.remote}\0${d.name}\0${d.remote ? d.spec : ''}`; return !seen.has(k) && seen.add(k); })
      .map((d) => (d.remote ? { eco, name: d.name, spec: d.spec, unverifiable: true } : { eco, name: d.name }));
  };
  if (/(^|\/)package\.json$/i.test(rel)) {
    let a, b = {};
    try { a = JSON.parse(after); } catch { return null; }
    try { b = JSON.parse(before || '{}'); } catch { /* a broken file before: every name counts as added */ }
    return added('npm', npmDeps(a), npmDeps(b));
  }
  if (/(^|\/)requirements[^/]*\.txt$|(^|\/)requirements\/[^/]+\.txt$/i.test(rel)) return added('pypi', requirementDeps(after), requirementDeps(before));
  if (/(^|\/)pyproject\.toml$/i.test(rel)) return added('pypi', pyprojectDeps(after), pyprojectDeps(before));
  return [];
}

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

export function similarPopular(eco, name) {
  const norm = (x) => x.toLowerCase().replace(/[-_.]/g, '');
  if (POPULAR[eco].includes(name)) return null;
  return POPULAR[eco].find((p) => distance(norm(p), norm(name)) <= 1 && p.length > 3) ?? null;
}

const daysAgo = (date, now) => Math.floor((now - new Date(date).getTime()) / 864e5);

// get: a fetch-like function (mocked in tests)
// status: missing | unknown | similar | new | low | ok
export async function check({ eco, name }, get = fetch, now = Date.now()) {
  const tr = (k, vars) => t(findRoot(), k, vars);
  const similar = similarPopular(eco, name);
  try {
    if (eco === 'npm') {
      const r = await get(`https://registry.npmjs.org/${name.replace('/', '%2f')}`, { signal: AbortSignal.timeout(6000) });
      if (r.status === 404) return { status: 'missing', detail: tr('guard.package.npmMissing') };
      if (!r.ok) return { status: 'unknown', detail: tr('guard.package.npmStatus', { status: r.status }) };
      const j = await r.json();
      const age = j.time?.created ? daysAgo(j.time.created, now) : null;
      let downloads = null;
      try {
        const dr = await get(`https://api.npmjs.org/downloads/point/last-week/${name}`, { signal: AbortSignal.timeout(6000) });
        if (dr.ok) downloads = (await dr.json()).downloads ?? null;
      } catch { /* download count is optional */ }
      if (similar) return { status: 'similar', detail: tr('guard.package.similar', { similar }) };
      if (age != null && age < THRESHOLD.newDays) return { status: 'new', detail: tr('guard.package.newNpm', { age }) };
      if (downloads != null && downloads < THRESHOLD.npmWeeklyDownloads) return { status: 'low', detail: tr('guard.package.lowDownloads', { downloads }) };
      return { status: 'ok', detail: `${age ?? '?'} days, ${downloads ?? '?'} weekly downloads` };
    }
    const r = await get(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, { signal: AbortSignal.timeout(6000) });
    if (r.status === 404) return { status: 'missing', detail: tr('guard.package.pypiMissing') };
    if (!r.ok) return { status: 'unknown', detail: tr('guard.package.pypiStatus', { status: r.status }) };
    const j = await r.json();
    const dates = Object.values(j.releases ?? {}).flat().map((f) => f.upload_time_iso_8601).filter(Boolean).sort();
    const age = dates.length ? daysAgo(dates[0], now) : null;
    if (similar) return { status: 'similar', detail: tr('guard.package.similar', { similar }) };
    if (age != null && age < THRESHOLD.newDays) return { status: 'new', detail: tr('guard.package.newPypi', { age }) };
    return { status: 'ok', detail: `${age ?? '?'} days` };
  } catch (e) {
    return { status: 'unknown', detail: tr(e.name === 'TimeoutError' ? 'guard.package.timeout' : 'guard.package.network') };
  }
}

// More names than this in one command are asked without checking each one (unbounded fetches would hit the hook timeout)
const MAX_PACKAGES = 50;
async function hook() {
  const g = readInput();
  if (!g) process.exit(0);
  // A gate that throws or times out lets the command run: any error asks instead
  try { await gate(g); } catch (e) { decide(g.tool, 'ask', t(g.root, 'guard.package.error', { error: String(e?.message ?? e).slice(0, 200) })); }
  process.exit(0);
}
async function gate(g) {
  // npx/bunx run a bin the project already installed without downloading: a local bin (tsc, eas) is not a package name
  const bin = (name) => /^\w[\w.-]*$/.test(name) && [g.dir, g.root].some((d) => fs.existsSync(path.join(d, 'node_modules', '.bin', name)));
  // The kit's own package (/start and /adopt run npx -y tillerhand@<version> install): the kit already trusts itself
  // Both only for the plain spelling: name@1.2 or name@npm:other downloads, it does not run the local bin or the kit's release
  const packages = findPackages(g.command).filter((p) => !(p.local && p.spec === p.name && bin(p.name)) && !(p.eco === 'npm' && /^tillerhand(@\d+\.\d+\.\d+)?$/.test(p.spec ?? '')));
  for (const f of g.files) {
    if (REGISTRY_CONFIG.test(String(f.path))) decide(g.tool, 'ask', t(g.root, 'guard.package.configFile', { path: f.path }));
    if (!DEP_FILE.test(String(f.path).replace(/\\/g, '/'))) continue;
    const full = path.resolve(g.dir, f.path);
    let disk = ''; try { disk = fs.readFileSync(full, 'utf8'); } catch { /* new file */ }
    const after = boardAfter(disk, f);
    const added = after === null ? null : addedDependencies(f.path, disk, after);
    if (added === null) decide(g.tool, 'ask', t(g.root, 'guard.package.depFileUnclear', { path: f.path }));
    packages.push(...added);
  }
  if (!packages.length) return;
  if (packages.length > MAX_PACKAGES) decide(g.tool, 'ask', t(g.root, 'guard.package.tooMany', { count: packages.length, max: MAX_PACKAGES }));
  // A remote source or a registry the gate does not query is asked as is, without a fetch
  const results = await Promise.all(packages.map(async (p) => ({ ...p, ...(p.unverifiable
    ? { status: 'unverifiable', detail: POPULAR[p.eco] ? t(g.root, 'guard.package.notRegistry', { source: p.spec || p.name }) : t(g.root, 'guard.package.otherEco', { eco: p.eco }) }
    : await check(p)) })));
  const missing = results.filter((s) => s.status === 'missing' && !s.unsure);
  if (missing.length) {
    decide(g.tool, 'deny', `Package gate: ${missing.map((s) => `${s.name} (${s.detail})`).join(', ')}. This name may be made up. Find the correct package name in the official docs; tell the user.`);
  }
  const suspect = results.filter((s) => s.status !== 'ok');
  if (suspect.length) {
    decide(g.tool, 'ask', t(g.root, 'guard.package.ask', { list: suspect.map((s) => `${s.eco}:${s.name || s.spec} — ${s.detail}`).join('; ') }));
  }
  process.exit(0);
}

if (isMain(import.meta.url)) hook();
