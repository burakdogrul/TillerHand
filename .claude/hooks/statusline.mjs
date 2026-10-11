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
  console.log(parcalar.join(' · '));
} catch {
  console.log('▶ durum okunamadı');
}
