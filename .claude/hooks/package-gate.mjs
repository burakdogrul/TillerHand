#!/usr/bin/env node
// Package gate (PreToolUse, Bash): checks a package the AI wants to install before it is installed.
// Why: AIs invent package names that do not exist; attackers register those names (slopsquatting).
//   Package missing                                                        -> denied (deny)
//   Very new / few downloads / very close to a popular package / unverified -> the user is asked (ask)
// The decision goes through Claude Code's permission UI; the AI cannot skip it.
import { pathToFileURL } from 'node:url';
import { readInput, decide } from './shared.mjs';

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

const COMMANDS = [
  [/^(npm|pnpm|bun)\s+(i|install|add)\b/, 'npm'], [/^yarn\s+(global\s+)?add\b/, 'npm'], [/^npx\s+expo\s+install\b/, 'npm'],
  [/^uv\s+(add|pip\s+install)\b/, 'pypi'], [/^(python3?\s+-m\s+)?pip3?\s+install\b/, 'pypi'], [/^poetry\s+add\b/, 'pypi'],
];

function npmName(arg) {
  if (/^(\.|\/|file:|link:|git\+|git:|https?:|github:|workspace:)/.test(arg)) return null;
  if (arg.startsWith('@')) { const i = arg.indexOf('@', 1); return i > 0 ? arg.slice(0, i) : arg; }
  return arg.split('@')[0] || null;
}

function pypiName(arg) {
  if (/^(\.|\/|git\+|https?:|file:)/.test(arg) || /\.(whl|tar\.gz|zip)$/.test(arg)) return null;
  return arg.split(/[\[<>=!~;@\s]/)[0].toLowerCase() || null;
}

export function findPackages(command) {
  const result = [];
  for (const part of command.split(/&&|\|\||;|\|/)) {
    const s = part.trim().replace(/^(sudo|env\s+\S+=\S+)\s+/, '');
    const match = COMMANDS.find(([re]) => re.test(s));
    if (!match) continue;
    const [re, eco] = match;
    const args = s.replace(re, '').trim().split(/\s+/).map((x) => x.replace(/^['"]|['"]$/g, '')).filter(Boolean);
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
  const similar = similarPopular(eco, name);
  try {
    if (eco === 'npm') {
      const r = await get(`https://registry.npmjs.org/${name.replace('/', '%2f')}`, { signal: AbortSignal.timeout(6000) });
      if (r.status === 404) return { status: 'missing', detail: 'npm kayıt defterinde böyle bir paket yok' };
      if (!r.ok) return { status: 'unknown', detail: `npm yanıtı ${r.status}` };
      const j = await r.json();
      const age = j.time?.created ? daysAgo(j.time.created, now) : null;
      let downloads = null;
      try {
        const dr = await get(`https://api.npmjs.org/downloads/point/last-week/${name}`, { signal: AbortSignal.timeout(6000) });
        if (dr.ok) downloads = (await dr.json()).downloads ?? null;
      } catch { /* download count is optional */ }
      if (similar) return { status: 'similar', detail: `popüler "${similar}" paketine çok benziyor (yazım hatası tuzağı olabilir)` };
      if (age != null && age < THRESHOLD.newDays) return { status: 'new', detail: `${age} gün önce yayımlanmış` };
      if (downloads != null && downloads < THRESHOLD.npmWeeklyDownloads) return { status: 'low', detail: `haftalık indirme ${downloads}` };
      return { status: 'ok', detail: `${age ?? '?'} gün, haftalık ${downloads ?? '?'} indirme` };
    }
    const r = await get(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, { signal: AbortSignal.timeout(6000) });
    if (r.status === 404) return { status: 'missing', detail: 'PyPI\'da böyle bir paket yok' };
    if (!r.ok) return { status: 'unknown', detail: `PyPI yanıtı ${r.status}` };
    const j = await r.json();
    const dates = Object.values(j.releases ?? {}).flat().map((f) => f.upload_time_iso_8601).filter(Boolean).sort();
    const age = dates.length ? daysAgo(dates[0], now) : null;
    if (similar) return { status: 'similar', detail: `popüler "${similar}" paketine çok benziyor (yazım hatası tuzağı olabilir)` };
    if (age != null && age < THRESHOLD.newDays) return { status: 'new', detail: `ilk sürümü ${age} gün önce yayımlanmış` };
    return { status: 'ok', detail: `${age ?? '?'} gün` };
  } catch (e) {
    return { status: 'unknown', detail: `doğrulanamadı (${e.name === 'TimeoutError' ? 'zaman aşımı' : 'ağ hatası'})` };
  }
}

async function hook() {
  const g = readInput();
  if (!g) process.exit(0);
  const packages = findPackages(g.command);
  if (!packages.length) process.exit(0);
  const results = await Promise.all(packages.map(async (p) => ({ ...p, ...(await check(p)) })));
  const missing = results.filter((s) => s.status === 'missing');
  if (missing.length) {
    decide(g.tool, 'deny', `Paket kapısı: ${missing.map((s) => `${s.name} (${s.detail})`).join(', ')}. Bu ad uydurulmuş olabilir. Doğru paket adını resmi dokümandan bul; kullanıcıya bildir.`);
  }
  const suspect = results.filter((s) => s.status !== 'ok');
  if (suspect.length) {
    decide(g.tool, 'ask', `Paket kapısı uyarısı: ${suspect.map((s) => `${s.eco}:${s.name} — ${s.detail}`).join('; ')}. Kurmadan önce paketin gerçekten istenen paket olduğundan emin ol.`);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) hook();
