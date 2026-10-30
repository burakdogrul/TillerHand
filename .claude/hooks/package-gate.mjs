#!/usr/bin/env node
// Package gate (PreToolUse, Bash): checks a package the AI wants to install, or download and run (npx, uvx …), before it reaches the machine.
// Why: AIs invent package names that do not exist; attackers register those names (slopsquatting).
//   Package missing                                                        -> denied (deny)
//   Very new / few downloads / very close to a popular package / unverified -> the user is asked (ask)
// The decision goes through Claude Code's permission UI; the AI cannot skip it.

import fs from 'node:fs';
import path from 'node:path';
import { readInput, decide, isMain, findRoot } from './shared.mjs';
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
  [/^uv\s+(add|pip\s+install|tool\s+install)\b/i, 'pypi'], [/^((python[\d.]*|py)(\s+-\d[\d.]*)?\s+-m\s+)?pip[\d.]*(\s+-\S+)*\s+install\b/i, 'pypi'],
  [/^(poetry|pdm)\s+add\b|^(pipenv|pipx)\s+install\b/i, 'pypi'],
];
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

const NOT_REGISTRY = /^(\.|\/|file:|link:|git\+|git:|https?:|github:|workspace:)/;
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
  // Every place a new command can start: chains, a newline, a background &, $( ), backticks, ( ) and { } groups.
  // A redirect's & (2>&1, &>) is not a separator.
  for (const part of command.split(/\n|&&|\|\||;|\||(?<![>&])&(?![>&])|\$\(|`|[(){}]/)) {
    const s = normalize(part);
    const match = COMMANDS.find(([re]) => re.test(s));
    const exec = match ? null : EXEC.find((e) => e.re.test(s));
    if (!match && !exec) continue;
    const re = match?.[0] ?? exec.re, eco = match?.[1] ?? exec.eco;
    // Redirects (2>&1, > log, 2>/dev/null, &> x) are not arguments; a quoted "pkg>=1" has no space before ">" and stays
    const args = s.replace(re, '').replace(/\s+(\d*|&)(>>?|<)(&\d+|\s*[^\s'"]+)/g, '').trim().split(/\s+/).map((x) => x.replace(/^['"(]+|['")]+$/g, '')).filter(Boolean);
    if (exec) {
      for (const { arg, fromFlag, unsure } of execArgs(args, eco, exec.positional)) {
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
        if (/^(-r|--requirement|-e|--editable|-c|--constraint|--index-url|-i|--extra-index-url|--filter|--prefix|--group)$/.test(a)) i++; // flag that takes a value
        continue;
      }
      const name = eco === 'npm' ? npmName(a) : pypiName(a);
      if (name) result.push({ eco, name });
    }
  }
  return result;
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
  if (!packages.length) return;
  if (packages.length > MAX_PACKAGES) decide(g.tool, 'ask', t(g.root, 'guard.package.tooMany', { count: packages.length, max: MAX_PACKAGES }));
  const results = await Promise.all(packages.map(async (p) => ({ ...p, ...(await check(p)) })));
  const missing = results.filter((s) => s.status === 'missing' && !s.unsure);
  if (missing.length) {
    decide(g.tool, 'deny', `Package gate: ${missing.map((s) => `${s.name} (${s.detail})`).join(', ')}. This name may be made up. Find the correct package name in the official docs; tell the user.`);
  }
  const suspect = results.filter((s) => s.status !== 'ok');
  if (suspect.length) {
    decide(g.tool, 'ask', t(g.root, 'guard.package.ask', { list: suspect.map((s) => `${s.eco}:${s.name} — ${s.detail}`).join('; ') }));
  }
  process.exit(0);
}

if (isMain(import.meta.url)) hook();
