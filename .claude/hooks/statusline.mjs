#!/usr/bin/env node
// Claude Code alt durum çubuğu: aşama, görev ilerlemesi, soru modu ve kullanım limitleri.
// Örnek: ▶ Faz 1 · G-012 · görev 7/23 · soru: açık (kapalı: tasarim) · 5s %34 · hf %5
// Claude Code'un gönderdiği rate_limits bilgisini .claude/.limitler.json'a da yazar (limit.mjs okur).
import fs from 'node:fs';
import { durumOku } from './durum-oku.mjs';
import { limitYaz, limitOku, seviye } from './limit.mjs';

let kok = process.cwd();
let girdi = {};
try {
  girdi = JSON.parse(fs.readFileSync(0, 'utf8'));
  kok = girdi.workspace?.project_dir || girdi.workspace?.current_dir || kok;
} catch {
  // girdi yoksa çalışma klasörünü kullan
}
limitYaz(kok, girdi.rate_limits);

// Bağlam doluluğu: Claude Code'un hazır yüzdesi, yoksa son isteğin token toplamından hesap
export function baglamYuzde(cw) {
  if (!cw) return null;
  if (typeof cw.used_percentage === 'number') return Math.round(cw.used_percentage);
  const u = cw.current_usage;
  if (!u || !cw.context_window_size) return null;
  const toplam = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  return Math.round((toplam / cw.context_window_size) * 100);
}
const baglam = baglamYuzde(girdi.context_window);
if (baglam != null) {
  try { fs.writeFileSync(`${kok}/.claude/.baglam.json`, JSON.stringify({ yuzde: baglam, okundu: Date.now() })); } catch { /* sessiz */ }
}

function limitParcasi() {
  const l = limitOku(kok);
  if (!l) return null;
  const p = [];
  if (l.five_hour) p.push(`5s %${Math.round(l.five_hour.yuzde)}`);
  if (l.seven_day) p.push(`hf %${Math.round(l.seven_day.yuzde)}`);
  const s = seviye(l);
  return p.join(' · ') + (s === 'sarı' ? ' ⚠' : s === 'kırmızı' ? ' ⛔' : '');
}

try {
  const d = durumOku(kok);
  const parcalar = [];
  if (d.kitBekliyor) {
    parcalar.push('◆ Kit kurulmadı · başlamak için: /baslat [fikrin]');
  } else {
    const a = d.alanlar;
    const soru = (a['Soru modu'] ?? 'açık')
      .replace(/\s*·\s*kapalı konular:\s*yok/i, '')
      .replace(/\s*·\s*kapalı konular:\s*(.*)$/i, ' (kapalı: $1)');
    parcalar.push(`▶ ${a['Aktif faz'] ?? '-'}`);
    if (/başlangıç/i.test(a['Aktif faz'] ?? '')) parcalar.push(`adım ${a['Başlangıç adımı'] ?? '-'}`);
    else parcalar.push(a['Aktif görev'] ?? '-', `görev ${d.gorev.bitti}/${d.gorev.toplam}`);
    parcalar.push(`soru: ${soru}`);
    if (d.bekleyen.length) parcalar.push(`bekleyen karar: ${d.bekleyen.length}`);
  }
  const limit = limitParcasi();
  if (limit) parcalar.push(limit);
  if (baglam != null) parcalar.push(`bağlam %${baglam}${baglam >= 70 ? ' ⛔' : baglam >= 50 ? ' ⚠' : ''}`);
  console.log(parcalar.join(' · '));
} catch {
  console.log('▶ durum okunamadı');
}
