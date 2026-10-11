#!/usr/bin/env node
// Claude Code alt durum çubuğu: aşama, görev ilerlemesi ve soru modu.
// Örnek: ▶ Faz 1 · G-012 · görev 7/23 · soru: açık (kapalı: tasarim)
import fs from 'node:fs';
import { durumOku } from './durum-oku.mjs';

let kok = process.cwd();
try {
  const girdi = JSON.parse(fs.readFileSync(0, 'utf8'));
  kok = girdi.workspace?.project_dir || girdi.workspace?.current_dir || kok;
} catch {
  // girdi yoksa çalışma klasörünü kullan
}

try {
  const d = durumOku(kok);
  if (d.kitBekliyor) {
    console.log('◆ Kit kurulmadı · başlamak için: /baslat [fikrin]');
  } else {
    const a = d.alanlar;
    const soru = (a['Soru modu'] ?? 'açık')
      .replace(/\s*·\s*kapalı konular:\s*yok/i, '')
      .replace(/\s*·\s*kapalı konular:\s*/i, ' (kapalı: ')
      .replace(/^(.*\(kapalı: .*)$/, '$1)');
    const parcalar = [`▶ ${a['Aktif faz'] ?? '-'}`];
    if (/başlangıç/i.test(a['Aktif faz'] ?? '')) parcalar.push(`adım ${a['Başlangıç adımı'] ?? '-'}`);
    else parcalar.push(a['Aktif görev'] ?? '-', `görev ${d.gorev.bitti}/${d.gorev.toplam}`);
    parcalar.push(`soru: ${soru}`);
    if (d.bekleyen.length) parcalar.push(`bekleyen karar: ${d.bekleyen.length}`);
    console.log(parcalar.join(' · '));
  }
} catch {
  console.log('▶ durum okunamadı');
}
