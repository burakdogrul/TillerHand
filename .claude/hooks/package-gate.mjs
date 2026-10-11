#!/usr/bin/env node
// Paket kapısı (PreToolUse, Bash): AI'nın kurmak istediği paketi kurulumdan önce doğrular.
// Neden: AI'lar var olmayan paket adları uydurur; saldırganlar bu adları kaydeder (slopsquatting).
//   Paket yok                          -> engellenir (deny)
//   Çok yeni / az indirilmiş / popüler bir pakete çok benzeyen / doğrulanamadı -> kullanıcıya sorulur (ask)
// Karar Claude Code'un izin arayüzünden geçer; AI kendisi atlayamaz.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ESIK = { yeniGun: 30, npmHaftalikIndirme: 500 };

// Benzer ad (typosquat) kontrolü için en çok kullanılan paketlerden küçük bir liste
const POPULER = {
  npm: ['react', 'react-dom', 'next', 'vue', 'express', 'axios', 'lodash', 'zod', 'prisma', 'drizzle-orm', 'tailwindcss', 'typescript',
    'eslint', 'prettier', 'vitest', 'jest', 'dotenv', 'stripe', 'openai', '@anthropic-ai/sdk', 'date-fns', 'dayjs', 'uuid', 'nanoid',
    'chalk', 'commander', 'mongoose', 'pg', 'mysql2', 'redis', 'jsonwebtoken', 'bcrypt', 'bcryptjs', 'cors', 'helmet', 'zustand',
    'expo', 'react-native', 'sharp', 'resend', 'nodemailer', 'framer-motion', 'clsx', 'classnames', 'yup', 'formik', 'swr'],
  pypi: ['requests', 'numpy', 'pandas', 'fastapi', 'pydantic', 'sqlalchemy', 'alembic', 'django', 'flask', 'httpx', 'uvicorn', 'pytest',
    'boto3', 'openai', 'anthropic', 'python-dotenv', 'celery', 'redis', 'psycopg', 'psycopg2', 'psycopg2-binary', 'pillow', 'scipy',
    'matplotlib', 'beautifulsoup4', 'selenium', 'click', 'typer', 'rich', 'jinja2', 'pyyaml', 'cryptography', 'pyjwt', 'passlib',
    'langchain', 'transformers', 'torch', 'scikit-learn', 'aiohttp', 'tenacity', 'ruff', 'black', 'mypy'],
};

const KOMUTLAR = [
  [/^(npm|pnpm|bun)\s+(i|install|add)\b/, 'npm'], [/^yarn\s+(global\s+)?add\b/, 'npm'], [/^npx\s+expo\s+install\b/, 'npm'],
  [/^uv\s+(add|pip\s+install)\b/, 'pypi'], [/^(python3?\s+-m\s+)?pip3?\s+install\b/, 'pypi'], [/^poetry\s+add\b/, 'pypi'],
];

function npmAdi(arg) {
  if (/^(\.|\/|file:|link:|git\+|git:|https?:|github:|workspace:)/.test(arg)) return null;
  if (arg.startsWith('@')) { const i = arg.indexOf('@', 1); return i > 0 ? arg.slice(0, i) : arg; }
  return arg.split('@')[0] || null;
}

function pypiAdi(arg) {
  if (/^(\.|\/|git\+|https?:|file:)/.test(arg) || /\.(whl|tar\.gz|zip)$/.test(arg)) return null;
  return arg.split(/[\[<>=!~;@\s]/)[0].toLowerCase() || null;
}

export function paketleriBul(komut) {
  const sonuc = [];
  for (const parca of komut.split(/&&|\|\||;|\|/)) {
    const s = parca.trim().replace(/^(sudo|env\s+\S+=\S+)\s+/, '');
    const eslesme = KOMUTLAR.find(([re]) => re.test(s));
    if (!eslesme) continue;
    const [re, eko] = eslesme;
    const argumanlar = s.replace(re, '').trim().split(/\s+/).map((x) => x.replace(/^['"]|['"]$/g, '')).filter(Boolean);
    for (let i = 0; i < argumanlar.length; i++) {
      const a = argumanlar[i];
      if (a.startsWith('-')) {
        if (/^(-r|--requirement|-e|--editable|-c|--constraint|--index-url|-i|--extra-index-url|--filter|--prefix|--group)$/.test(a)) i++; // değer alan bayrak
        continue;
      }
      const ad = eko === 'npm' ? npmAdi(a) : pypiAdi(a);
      if (ad) sonuc.push({ eko, ad });
    }
  }
  return sonuc;
}

function mesafe(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

export function benzerPopuler(eko, ad) {
  const norm = (x) => x.toLowerCase().replace(/[-_.]/g, '');
  if (POPULER[eko].includes(ad)) return null;
  return POPULER[eko].find((p) => mesafe(norm(p), norm(ad)) <= 1 && p.length > 3) ?? null;
}

const gunOnce = (tarih, simdi) => Math.floor((simdi - new Date(tarih).getTime()) / 864e5);

// al: fetch benzeri fonksiyon (testte taklit edilir)
export async function denetle({ eko, ad }, al = fetch, simdi = Date.now()) {
  const benzer = benzerPopuler(eko, ad);
  try {
    if (eko === 'npm') {
      const r = await al(`https://registry.npmjs.org/${ad.replace('/', '%2f')}`, { signal: AbortSignal.timeout(6000) });
      if (r.status === 404) return { durum: 'yok', detay: 'npm kayıt defterinde böyle bir paket yok' };
      if (!r.ok) return { durum: 'bilinmiyor', detay: `npm yanıtı ${r.status}` };
      const j = await r.json();
      const yas = j.time?.created ? gunOnce(j.time.created, simdi) : null;
      let indirme = null;
      try {
        const dr = await al(`https://api.npmjs.org/downloads/point/last-week/${ad}`, { signal: AbortSignal.timeout(6000) });
        if (dr.ok) indirme = (await dr.json()).downloads ?? null;
      } catch { /* indirme sayısı opsiyonel */ }
      if (benzer) return { durum: 'benzer', detay: `popüler "${benzer}" paketine çok benziyor (yazım hatası tuzağı olabilir)` };
      if (yas != null && yas < ESIK.yeniGun) return { durum: 'yeni', detay: `${yas} gün önce yayımlanmış` };
      if (indirme != null && indirme < ESIK.npmHaftalikIndirme) return { durum: 'az', detay: `haftalık indirme ${indirme}` };
      return { durum: 'tamam', detay: `${yas ?? '?'} gün, haftalık ${indirme ?? '?'} indirme` };
    }
    const r = await al(`https://pypi.org/pypi/${encodeURIComponent(ad)}/json`, { signal: AbortSignal.timeout(6000) });
    if (r.status === 404) return { durum: 'yok', detay: 'PyPI\'da böyle bir paket yok' };
    if (!r.ok) return { durum: 'bilinmiyor', detay: `PyPI yanıtı ${r.status}` };
    const j = await r.json();
    const tarihler = Object.values(j.releases ?? {}).flat().map((f) => f.upload_time_iso_8601).filter(Boolean).sort();
    const yas = tarihler.length ? gunOnce(tarihler[0], simdi) : null;
    if (benzer) return { durum: 'benzer', detay: `popüler "${benzer}" paketine çok benziyor (yazım hatası tuzağı olabilir)` };
    if (yas != null && yas < ESIK.yeniGun) return { durum: 'yeni', detay: `ilk sürümü ${yas} gün önce yayımlanmış` };
    return { durum: 'tamam', detay: `${yas ?? '?'} gün` };
  } catch (e) {
    return { durum: 'bilinmiyor', detay: `doğrulanamadı (${e.name === 'TimeoutError' ? 'zaman aşımı' : 'ağ hatası'})` };
  }
}

const karar = (decision, reason) => {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } }));
  process.exit(0);
};

async function hook() {
  let komut = '';
  try { komut = JSON.parse(readFileSync(0, 'utf8')).tool_input?.command ?? ''; } catch { process.exit(0); }
  const paketler = paketleriBul(komut);
  if (!paketler.length) process.exit(0);
  const sonuclar = await Promise.all(paketler.map(async (p) => ({ ...p, ...(await denetle(p)) })));
  const yok = sonuclar.filter((s) => s.durum === 'yok');
  if (yok.length) {
    karar('deny', `Paket kapısı: ${yok.map((s) => `${s.ad} (${s.detay})`).join(', ')}. Bu ad uydurulmuş olabilir. Doğru paket adını resmi dokümandan bul; kullanıcıya bildir.`);
  }
  const supheli = sonuclar.filter((s) => s.durum !== 'tamam');
  if (supheli.length) {
    karar('ask', `Paket kapısı uyarısı: ${supheli.map((s) => `${s.eko}:${s.ad} — ${s.detay}`).join('; ')}. Kurmadan önce paketin gerçekten istenen paket olduğundan emin ol.`);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) hook();
