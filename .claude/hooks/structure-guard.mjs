#!/usr/bin/env node
// Yapı koruyucu: projenin klasör yapısını .claude/structure.json haritasına göre korur.
//   PreToolUse (Write) hook'u: YENİ bir dosya haritada olmayan bir yere yazılacaksa kullanıcıya sorar (ask);
//     dağınıklık kalıplarına (.bak, *-old.*, "kopya" vb.) uyuyorsa engeller (deny). sandbox/ her zaman serbesttir.
//   node .claude/hooks/structure-guard.mjs --check   git'teki tüm dosyaları denetler (CI ve /findings-tech).
// Harita yoksa (kit kurulmadan önce) hiçbir şeyi engellemez.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const kok = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// "**" herhangi bir derinlik, "*" tek klasör içinde herhangi bir ad, "?" tek karakter
export function globRegex(desen) {
  let r = '';
  for (let i = 0; i < desen.length; i++) {
    const c = desen[i];
    if (c === '*' && desen[i + 1] === '*') {
      if (desen[i + 2] === '/') { r += '(?:.*/)?'; i += 2; } else { r += '.*'; i++; }
    } else if (c === '*') r += '[^/]*';
    else if (c === '?') r += '[^/]';
    else r += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${r}$`, 'i');
}

export function haritaOku(dizin = kok) {
  try {
    const h = JSON.parse(fs.readFileSync(path.join(dizin, '.claude', 'structure.json'), 'utf8'));
    return { allow: (h.allow ?? []).map(globRegex), deny: (h.deny ?? []).map(globRegex), ham: h };
  } catch {
    return null;
  }
}

// Döndürür: null (uygun) | { karar: 'deny' | 'ask', neden }
export function denetle(rel, harita) {
  if (!harita) return null;
  rel = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (rel.startsWith('sandbox/')) return null;
  const yasak = harita.deny.find((re) => re.test(rel));
  if (yasak) {
    return { karar: 'deny', neden: `"${rel}" dağınıklık kalıbına uyuyor (yedek, eski sürüm, kopya veya geçici dosya). Git geçmişi zaten yedektir; deneme için sandbox/ kullan.` };
  }
  if (harita.allow.some((re) => re.test(rel))) return null;
  const ust = [...new Set((harita.ham.allow ?? []).map((d) => d.split('/')[0]).filter((d) => !d.includes('.') || d.startsWith('.')))].slice(0, 12);
  return {
    karar: 'ask',
    neden: `"${rel}" yapı haritasında yok (.claude/structure.json). Doğru yer muhtemelen şunlardan biri: ${ust.join(', ')}. ` +
      'Geçici veya deneme ise sandbox/ altına yaz. Kalıcı yeni bir yer gerekiyorsa bunu teknik karar olarak sor ve haritayı güncelle (docs/architecture/structure.md).',
  };
}

function hook() {
  let girdi = {};
  try { girdi = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
  const yol = girdi.tool_input?.file_path;
  if (!yol || fs.existsSync(yol)) process.exit(0); // sadece yeni dosyalar
  const rel = path.relative(kok, path.resolve(kok, yol));
  if (rel.startsWith('..') || path.isAbsolute(rel)) process.exit(0); // proje dışı
  const s = denetle(rel, haritaOku());
  if (s) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: s.karar, permissionDecisionReason: `Yapı: ${s.neden}` } }));
  process.exit(0);
}

function kontrol() {
  const harita = haritaOku();
  if (!harita) { console.log('Yapı haritası yok (.claude/structure.json); kontrol atlandı.'); return; }
  const dosyalar = execFileSync('git', ['ls-files'], { cwd: kok, encoding: 'utf8' }).split('\n').filter(Boolean);
  const ihlaller = dosyalar.map((f) => [f, denetle(f, harita)]).filter(([, s]) => s);
  if (!ihlaller.length) { console.log(`Yapı uyumlu: ${dosyalar.length} dosya.`); return; }
  console.error(`Yapı ihlali (${ihlaller.length}):`);
  for (const [f, s] of ihlaller) console.error(`  ${s.karar === 'deny' ? 'YASAK' : 'HARİTA DIŞI'}  ${f}`);
  console.error('Dosyayı doğru yere taşı, sandbox/ altına al veya haritayı (teknik kararla) güncelle.');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.argv.includes('--check') ? kontrol() : hook();
}
