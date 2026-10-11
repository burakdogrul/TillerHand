#!/usr/bin/env node
// 5 saatlik ve haftalık kullanım limitleri.
// Durum çubuğu (statusline.mjs) Claude Code'un verdiği rate_limits bilgisini .claude/.limitler.json'a yazar;
// bu script onu okur ve seviyeyi (yeşil/sarı/kırmızı) söyler. Eşikler docs/LIMIT-PLANI.md ile aynıdır.
//   node .claude/hooks/limit.mjs          insan okunur özet
//   node .claude/hooks/limit.mjs --json   makine okunur
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ESIKLER = { five_hour: { sari: 60, kirmizi: 85 }, seven_day: { sari: 70, kirmizi: 90 } };
const PENCERELER = { five_hour: '5 saatlik', seven_day: 'haftalık' };
const dosya = (kok) => path.join(kok, '.claude', '.limitler.json');

export function limitYaz(kok, rateLimits, simdi = Date.now()) {
  if (!rateLimits) return;
  const veri = { okundu: simdi };
  for (const k of Object.keys(PENCERELER)) {
    const p = rateLimits[k];
    if (p && typeof p.used_percentage === 'number') veri[k] = { yuzde: p.used_percentage, sifirlanma: p.resets_at };
  }
  if (!veri.five_hour && !veri.seven_day) return;
  try {
    fs.writeFileSync(dosya(kok), JSON.stringify(veri));
  } catch {
    // .claude klasörü yoksa veya yazılamıyorsa sessiz geç
  }
}

export function limitOku(kok, simdi = Date.now()) {
  let veri;
  try {
    veri = JSON.parse(fs.readFileSync(dosya(kok), 'utf8'));
  } catch {
    return null;
  }
  for (const k of Object.keys(PENCERELER)) {
    // Sıfırlanma zamanı geçtiyse pencere yenilenmiştir; eski yüzde artık geçersiz
    if (veri[k]?.sifirlanma && veri[k].sifirlanma * 1000 <= simdi) veri[k] = { yuzde: 0, sifirlanma: null, yenilendi: true };
  }
  veri.yasDk = Math.round((simdi - veri.okundu) / 60000);
  return veri;
}

export function seviye(veri) {
  if (!veri) return 'bilinmiyor';
  let s = 'yeşil';
  for (const [k, e] of Object.entries(ESIKLER)) {
    const y = veri[k]?.yuzde;
    if (y == null) continue;
    if (y >= e.kirmizi) return 'kırmızı';
    if (y >= e.sari) s = 'sarı';
  }
  return s;
}

function kalanSure(sifirlanma, simdi) {
  if (!sifirlanma) return '';
  const dk = Math.max(0, Math.round((sifirlanma * 1000 - simdi) / 60000));
  const saat = new Date(sifirlanma * 1000).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const kalan = dk >= 1440 ? `${Math.floor(dk / 1440)} gün ${Math.floor((dk % 1440) / 60)} sa` : `${Math.floor(dk / 60)} sa ${dk % 60} dk`;
  return `sıfırlanma ${saat}, ${kalan} sonra`;
}

export function ozet(veri, simdi = Date.now()) {
  if (!veri) {
    return 'Limit bilgisi yok. Masaüstü uygulamasındaysan get_usage aracını kullan. Terminal/IDE\'de durum çubuğu ilk API yanıtından sonra yazar. İkisi de yoksa kullanıcıdan /usage sonucunu iste.';
  }
  const parcalar = Object.entries(PENCERELER)
    .filter(([k]) => veri[k])
    .map(([k, ad]) => `${ad}: %${Math.round(veri[k].yuzde)}${veri[k].yenilendi ? ' (yenilendi)' : ` (${kalanSure(veri[k].sifirlanma, simdi)})`}`);
  const eski = veri.yasDk > 30 ? ' — eski olabilir, get_usage veya /usage ile doğrula' : '';
  return `${parcalar.join(' · ')} · seviye: ${seviye(veri)} · ${veri.yasDk} dk önce okundu${eski}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const kok = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const veri = limitOku(kok);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ...veri, seviye: seviye(veri), esikler: ESIKLER }));
  else console.log(ozet(veri));
}
