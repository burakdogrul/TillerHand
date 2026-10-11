// Proje durumunu dokümanlardan okur. statusline.mjs ve durum-panosu.mjs kullanır.
// Okunan biçimler: ILERLEME.md'deki **Etiket:** satırları ve ## bölümleri, YOL-HARITASI.md'deki
// "## Faz" başlıkları altındaki onay kutuları, KARARLAR.md'deki "Karar günlüğü" tablosu.
import fs from 'node:fs';
import path from 'node:path';

const oku = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');

function bolumler(metin) {
  const sonuc = {};
  for (const parca of metin.split(/^## /m).slice(1)) {
    const [baslik, ...govde] = parca.split('\n');
    sonuc[baslik.trim()] = govde.join('\n');
  }
  return sonuc;
}

function sayac(metin) {
  const bitti = (metin.match(/^\s*- \[x\]/gim) ?? []).length;
  const kalan = (metin.match(/^\s*- \[ \]/gm) ?? []).length;
  return { bitti, toplam: bitti + kalan };
}

export function durumOku(kok) {
  const d = (f) => path.join(kok, f);
  const ilerleme = oku(d('docs/ILERLEME.md'));
  const alanlar = {};
  for (const [, k, v] of ilerleme.matchAll(/^\*\*(.+?):\*\*\s*(.*)$/gm)) alanlar[k.trim()] = v.trim();
  const ib = bolumler(ilerleme);

  const yol = bolumler(oku(d('docs/YOL-HARITASI.md')));
  const fazlar = Object.entries(yol)
    .filter(([b]) => /^Faz \d/.test(b))
    .map(([ad, govde]) => ({ ad, ...sayac(govde) }));
  const gorev = fazlar.reduce((a, f) => ({ bitti: a.bitti + f.bitti, toplam: a.toplam + f.toplam }), { bitti: 0, toplam: 0 });

  const gunluk = bolumler(oku(d('docs/KARARLAR.md')))['Karar günlüğü'] ?? '';
  const kararlar = gunluk
    .split('\n')
    .filter((s) => s.startsWith('|') && !/^\|\s*-/.test(s) && !/^\|\s*#\s*\|/.test(s))
    .map((s) => s.split('|').slice(1, -1).map((c) => c.trim()))
    .filter((c) => c.length >= 7 && c.some(Boolean))
    .map(([no, tarih, asama, konu, soru, secilen, veren]) => ({ no, tarih, asama, konu, soru, secilen, veren }));

  const listeler = [
    ['Güvenlik', 'docs/GUVENLIK.md'],
    ['Canlıya alma', 'docs/CANLIYA-ALMA.md'],
    ['Yasal / KVKK', 'docs/YASAL-KVKK.md'],
    ['AI', 'docs/AI.md'],
    ['Lansman', 'docs/LANSMAN.md'],
  ]
    .filter(([, f]) => fs.existsSync(d(f)))
    .map(([ad, f]) => ({ ad, ...sayac(oku(d(f))) }));

  let kit = null;
  try { kit = JSON.parse(oku(d('.kit.json'))); } catch { /* kurulmamış */ }

  const satirlar = (b) => (b ?? '').split('\n').map((s) => s.trim()).filter((s) => /^([-*]|\d+\.)\s+\S/.test(s)).map((s) => s.replace(/^([-*]|\d+\.)\s+/, ''));

  // Kurul: docs/KURUL.md'deki etiketli satırlar, üye tablosu ve toplantı günlüğü
  const kurulMetni = oku(d('docs/KURUL.md'));
  const kurulAlan = {};
  for (const [, k, v] of kurulMetni.matchAll(/^\*\*(.+?):\*\*\s*(.*)$/gm)) kurulAlan[k.trim()] = v.trim();
  const tablo = (govde = '', enAz) => govde.split('\n')
    .filter((s) => s.startsWith('|') && !/^\|\s*-/.test(s))
    .map((s) => s.split('|').slice(1, -1).map((c) => c.trim()))
    .filter((c) => c.length >= enAz && c.some(Boolean)).slice(1); // ilk satır başlık
  const kb = bolumler(kurulMetni);
  const kurul = {
    durum: kurulAlan['Durum'] ?? 'kurulmadı',
    commitDenetimi: kurulAlan['Commit denetimi'] ?? 'açık',
    uyeler: tablo(kb['Üyeler'], 5).map(([uye, ajan, model]) => ({ uye, ajan, model })),
    toplantilar: tablo(kb['Toplantı günlüğü'], 8).map(([no, tarih, tur, kapsam, katilan, sonuc, kritik, karar]) => ({ no, tarih, tur, kapsam, katilan, sonuc, kritik, karar })),
  };

  return {
    proje: (oku(d('CLAUDE.md')).match(/^# (.+)$/m)?.[1] ?? 'Proje').trim(),
    kurulu: !!kit,
    kitBekliyor: !kit && fs.existsSync(d('kit/kit.mjs')),
    kit,
    alanlar,
    durum: (ib['Şu anki durum'] ?? '').split('\n').filter((s) => s.trim() && !s.startsWith('>')).join(' ').trim(),
    siradaki: satirlar(ib['Sıradaki adım']),
    bekleyen: satirlar(ib['Bekleyen kararlar']),
    sorunlar: satirlar(ib['Açık sorunlar / bloklayıcılar']).map((s) => s.replace(/^\[[ x]\]\s*/i, '')),
    kaldigiYer: satirlar(Object.entries(ib).find(([b]) => b.startsWith('Kaldığı yer'))?.[1]),
    kurul,
    fazlar,
    gorev,
    kararlar,
    listeler,
  };
}
