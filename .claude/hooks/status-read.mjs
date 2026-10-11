// Proje durumunu dokümanlardan okur. statusline, session-start ve durum-panosu kullanır.
// Okunan biçimler: docs/workflow/progress.md'deki **Etiket:** satırları ve ## bölümleri, docs/product/roadmap.md'deki
// "## Faz" başlıkları altındaki onay kutuları, docs/decisions/log.md "Karar günlüğü" ve docs/workflow/board.md tabloları.
// Hızlı kalmalı: durum çubuğu her yenilemede çağırır (git ve ağır okumalar dashboard.mjs'de).
import fs from 'node:fs';
import path from 'node:path';

export const oku = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');

export function bolumler(metin, seviye = '## ') {
  const sonuc = {};
  const re = new RegExp(`^${seviye}`, 'm');
  for (const parca of metin.split(re).slice(1)) {
    const [baslik, ...govde] = parca.split('\n');
    sonuc[baslik.trim()] = govde.join('\n');
  }
  return sonuc;
}

export const bolumBul = (b, onEk) => Object.entries(b).find(([k]) => k.startsWith(onEk))?.[1] ?? '';

export function sayac(metin) {
  const bitti = (metin.match(/^\s*- \[x\]/gim) ?? []).length;
  const kalan = (metin.match(/^\s*- \[ \]/gm) ?? []).length;
  return { bitti, toplam: bitti + kalan };
}

// Markdown tablosunun veri satırları (başlık ve ayırıcı hariç)
export const tabloSatirlari = (govde = '', enAz = 2) =>
  govde.split('\n')
    .filter((s) => s.trim().startsWith('|') && !/^\s*\|\s*:?-/.test(s))
    .map((s) => s.trim().split('|').slice(1, -1).map((c) => c.trim()))
    .filter((c) => c.length >= enAz)
    .slice(1)
    .filter((c) => c.some(Boolean));

export const etiketler = (metin) => {
  const a = {};
  for (const [, k, v] of metin.matchAll(/^\*\*(.+?):\*\*\s*(.*)$/gm)) a[k.trim()] = v.trim();
  return a;
};

const satirlar = (b) => (b ?? '').split('\n').map((s) => s.trim())
  .filter((s) => /^([-*]|\d+\.)\s+\S/.test(s)).map((s) => s.replace(/^([-*]|\d+\.)\s+/, '').replace(/^\[[ x]\]\s*/i, ''));

export function durumOku(kok) {
  const d = (f) => path.join(kok, f);
  const ilerleme = oku(d('docs/workflow/progress.md'));
  const alanlar = etiketler(ilerleme);
  const ib = bolumler(ilerleme);

  const yol = bolumler(oku(d('docs/product/roadmap.md')));
  const fazlar = Object.entries(yol)
    .filter(([b]) => /^Faz \d/.test(b))
    .map(([ad, govde]) => ({
      ad, ...sayac(govde),
      gorevler: govde.split('\n').map((s) => s.match(/^\s*- \[( |x)\]\s*(.+)$/i)).filter(Boolean)
        .map(([, x, metin]) => ({ bitti: x.toLowerCase() === 'x', metin })),
    }));
  const gorev = fazlar.reduce((a, f) => ({ bitti: a.bitti + f.bitti, toplam: a.toplam + f.toplam }), { bitti: 0, toplam: 0 });

  // 8 sütun (Kapı ile, kit 2.3+) veya eski 7 sütun
  const kararlar = tabloSatirlari(bolumler(oku(d('docs/decisions/log.md')))['Karar günlüğü'], 7)
    .map((c) => (c.length >= 8 ? c : [...c.slice(0, 6), '', c[6]]))
    .map(([no, tarih, asama, konu, soru, secilen, kapi, veren]) => ({ no, tarih, asama, konu, soru, secilen, kapi, veren }));

  const listeler = [
    ['Güvenlik', 'docs/security/checklist.md'], ['Canlıya alma', 'docs/operations/release-checklist.md'], ['Yasal / KVKK', 'docs/legal/privacy-kvkk.md'],
    ['AI', 'docs/ai/guide.md'], ['Lansman', 'docs/product/launch.md'],
  ].filter(([, f]) => fs.existsSync(d(f))).map(([ad, f]) => ({ ad, dosya: f, ...sayac(oku(d(f))) }));

  let kit = null;
  try { kit = JSON.parse(oku(d('.kit.json'))); } catch { /* kurulmamış */ }

  const kurulMetni = oku(d('docs/workflow/board.md'));
  const ka = etiketler(kurulMetni);
  const kb = bolumler(kurulMetni);
  const kurul = {
    durum: ka['Durum'] ?? 'kurulmadı',
    commitDenetimi: ka['Commit denetimi'] ?? 'açık',
    uyeler: tabloSatirlari(kb['Üyeler'], 5).map(([uye, ajan, model, odak, toplantilar]) => ({ uye, ajan, model, odak, toplantilar })),
    toplantilar: tabloSatirlari(kb['Toplantı günlüğü'], 8)
      .map(([no, tarih, tur, kapsam, katilan, sonuc, kritik, karar]) => ({ no, tarih, tur, kapsam, katilan, sonuc, kritik, karar })),
  };

  return {
    proje: (oku(d('CLAUDE.md')).match(/^# (.+)$/m)?.[1] ?? 'Proje').trim(),
    kurulu: !!kit,
    kitBekliyor: !kit && fs.existsSync(d('kit/kit.mjs')),
    kit,
    alanlar,
    durum: (ib['Şu anki durum'] ?? '').split('\n').filter((s) => s.trim() && !s.startsWith('>')).join(' ').trim(),
    sonOturum: satirlar(ib['Son oturumda yapılanlar']),
    siradaki: satirlar(ib['Sıradaki adım']),
    bekleyen: satirlar(ib['Bekleyen kararlar']),
    sorunlar: satirlar(ib['Açık sorunlar / bloklayıcılar']),
    kaldigiYer: satirlar(bolumBul(ib, 'Kaldığı yer')),
    fazlar,
    gorev,
    kararlar,
    listeler,
    kurul,
  };
}
