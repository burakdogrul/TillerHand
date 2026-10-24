#!/usr/bin/env node
// Düzenleme turu sayacı: aynı kod dosyası bir oturumda tekrar tekrar düzenlendikçe AI'nın eklediği güvenlik açıkları
// birikir. 5., 10., ... düzenlemede AI'ya Semgrep ve güvenlik kontrolü hatırlatılır; iş engellenmez.
//   PostToolUse (Write|Edit|MultiEdit, Codex apply_patch) hook'u: notu additionalContext ile verir.
//   Antigravity'de PostToolUse çıktı taşımaz: not bekletilir, PreInvocation hook'u (--inject) injectSteps ile verir.
// Durum: .claude/state/edit-rounds.json → { oturum, sayac: { dosya: n }, bekleyen: [not] }; oturum değişince sıfırlanır.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { girdiOku, kokBul } from './arac.mjs';

export const TUR = 5;
const KOD = /\.(m?[jt]sx?|cjs|py|go|rb|php|java|kt|swift|rs|sql|vue|svelte)$/i;
export const kodDosyasi = (rel) => KOD.test(rel);

const durumYolu = (kok) => path.join(kok, '.claude', 'state', 'edit-rounds.json');
// Dosya elle veya başka araçla bozulmuş olabilir: sadece beklenen biçimdeki alanlar alınır
function durumOku(kok) {
  let d;
  try { d = JSON.parse(fs.readFileSync(durumYolu(kok), 'utf8')); } catch { return {}; }
  if (!d || typeof d !== 'object') return {};
  const sayac = d.sayac && typeof d.sayac === 'object' && !Array.isArray(d.sayac)
    ? Object.fromEntries(Object.entries(d.sayac).filter(([, n]) => Number.isInteger(n) && n > 0)) : {};
  const bekleyen = Array.isArray(d.bekleyen) ? d.bekleyen.filter((x) => typeof x === 'string') : [];
  return { oturum: d.oturum, sayac, bekleyen };
}
function durumYaz(kok, d) {
  fs.mkdirSync(path.dirname(durumYolu(kok)), { recursive: true });
  fs.writeFileSync(durumYolu(kok), JSON.stringify(d, null, 2));
}

// AI nottaki komutu çalıştırır: dosya adındaki $( ) veya ` komuta girmesin, ad sadece güvenli karakterlerdeyse yazılır
const GUVENLI = /^[\p{L}\p{N}_@./+-]+$/u;
const notMetni = (rel, n) => `${GUVENLI.test(rel) ? rel : 'Adı özel karakter içeren bir dosya'} bu oturumda ${n}. kez düzenlendi. Tekrarlanan AI düzenlemeleri güvenlik açığı biriktirebilir: ` +
  `devam etmeden bu dosyada Semgrep çalıştır (\`semgrep scan --config p/default --config p/owasp-top-ten -- "${GUVENLI.test(rel) ? rel : '<dosya yolu>'}"\`; kurulu değilse CI'daki semgrep işine bak) ` +
  've değişikliği security-auditor ile gözden geçir. Aynı hatayı 2 denemede çözemediysen dur ve kullanıcıdan yön iste.';

function hook() {
  const g = girdiOku();
  if (!g) process.exit(0);
  const d = durumOku(g.kok);
  const durum = d.oturum === g.oturum ? { sayac: {}, bekleyen: [], ...d } : { oturum: g.oturum, sayac: {}, bekleyen: [] };
  const notlar = [];
  for (const x of g.dosyalar) {
    if (!x.yol || x.sil) continue;
    const rel = path.relative(g.kok, path.resolve(g.dizin, x.yol)).split(path.sep).join('/');
    if (rel.startsWith('..') || !kodDosyasi(rel)) continue;
    const n = (durum.sayac[rel] ?? 0) + 1;
    durum.sayac[rel] = n;
    if (n % TUR === 0) notlar.push(notMetni(rel, n));
  }
  if (g.arac === 'antigravity') durum.bekleyen.push(...notlar);
  durumYaz(g.kok, durum);
  if (g.arac === 'antigravity') console.log('{}');
  else if (notlar.length) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: notlar.join('\n') } }));
  process.exit(0);
}

// Antigravity PreInvocation: bekleyen notları bir kez ver; sadece notu üreten oturuma (başkasının yazdığı dosya not sokamaz)
function enjekte() {
  const kok = kokBul();
  const d = durumOku(kok);
  if (!d.bekleyen?.length || d.oturum !== girdiOku()?.oturum) process.exit(0);
  console.log(JSON.stringify({ injectSteps: d.bekleyen.map((metin) => ({ systemMessage: { systemMessage: metin } })) }));
  durumYaz(kok, { ...d, bekleyen: [] });
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.argv.includes('--inject') ? enjekte() : hook();
}
