#!/usr/bin/env node
// Konsey sayımı (Karpathy llm-council'in 2. aşama toplamı): tutanaktaki anonim sıralamaları ve bulgu oylarını sayar,
// "## 3. Toplu sıralama" bölümünü tutanağa yazar. Protokol: .claude/board/council.md
//   node .claude/hooks/council.mjs docs/workflow/council/<tutanak>.md
// Sayım kodla yapılır; model sıralamayı yanlış toplayamaz, başkan sayıyı değiştiremez.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { bolumler, bolumBul } from './status-read.mjs';

const OY = /^\s*[-*]?\s*([A-Z]\d+)\s*[:=]\s*(DOĞRU|YANLIŞ|ABARTILI)(?!\p{L})/gimu; // \b Türkçe harfte (Ş) çalışmaz

// "SIRALAMA:" sonrasındaki numaralı "Görüş X" satırları. Başlık veya numaralı satır yoksa boş döner:
// düzyazıdan sıra çıkarmak sessizce yanlış sayım üretir, o inceleme geçersiz sayılır.
export function siralamaAyikla(metin) {
  const parca = metin.split(/SIRALAMA:/i)[1] ?? '';
  return [...new Set([...parca.matchAll(/^\s*\d+\.\s*\**\s*Görüş\s+([A-Z])\b/gmu)].map((m) => m[1]))];
}

export function oylariAyikla(metin) {
  const parca = metin.split(/OYLAR:/i)[1]?.split(/SIRALAMA:/i)[0] ?? '';
  return Object.fromEntries([...parca.matchAll(OY)].map((m) => [m[1].toUpperCase(), m[2].toLocaleUpperCase('tr')]));
}

// İlk görüşlerden bulgu kimlikleri, önem ve (karar konseyinde) önerilen seçenek
export function gorusleriAyikla(ilkGorusler) {
  const gorusler = {};
  for (const [baslik, govde] of Object.entries(bolumler(ilkGorusler, '### '))) {
    const etiket = baslik.match(/Görüş\s+([A-Z])/u)?.[1];
    if (!etiket) continue;
    const bulgular = [...govde.matchAll(/^\s*[-*]?\s*([A-Z]\d+)\s*\[(KRİTİK|ÖNEMLİ|ÖNERİ)\]/gmu)].map((m) => ({ id: m[1], onem: m[2] }));
    const oneri = govde.match(/^\s*ÖNERİ:\s*(.+)$/mu)?.[1].trim() ?? null;
    gorusler[etiket] = { bulgular, oneri };
  }
  return gorusler;
}

export function say(tutanak) {
  const b = bolumler(tutanak);
  const gorusler = gorusleriAyikla(bolumBul(b, '1.'));
  const incelemeler = Object.entries(bolumler(bolumBul(b, '2.'), '### '))
    .map(([baslik, govde]) => ({ inceleyen: baslik.match(/İnceleyen:\s*([A-Z])/u)?.[1] ?? '?', siralama: siralamaAyikla(govde), oylar: oylariAyikla(govde) }));

  const konumlar = {};
  for (const i of incelemeler) i.siralama.forEach((g, n) => (konumlar[g] ??= []).push(n + 1));
  const siralama = Object.entries(konumlar)
    .map(([gorus, k]) => ({ gorus, ortalama: Math.round((k.reduce((a, x) => a + x, 0) / k.length) * 100) / 100, oy: k.length }))
    .sort((x, y) => x.ortalama - y.ortalama || x.gorus.localeCompare(y.gorus));

  const bulgular = Object.values(gorusler).flatMap((g) => g.bulgular).map((f) => {
    const s = { DOĞRU: 0, YANLIŞ: 0, ABARTILI: 0 };
    for (const i of incelemeler) if (i.oylar[f.id]) s[i.oylar[f.id]]++;
    const itiraz = s.YANLIŞ + s.ABARTILI;
    return { ...f, ...s, tartismali: itiraz > 0 && itiraz >= s.DOĞRU };
  });

  const oneriler = Object.values(gorusler).map((g) => g.oneri).filter(Boolean);
  const oySayisi = {};
  for (const o of oneriler) oySayisi[o] = (oySayisi[o] ?? 0) + 1;
  const secenekler = Object.entries(oySayisi).map(([secenek, oy]) => ({ secenek, oy })).sort((x, y) => y.oy - x.oy);

  // Uzlaşma: karar konseyinde en çok oy alan seçeneğin payı, toplantıda bulgu oylarındaki "doğru" payı
  const toplamOy = bulgular.reduce((t, f) => t + f.DOĞRU + f.YANLIŞ + f.ABARTILI, 0);
  const uzlasma = secenekler.length
    ? Math.round((secenekler[0].oy / oneriler.length) * 100)
    : toplamOy ? Math.round((bulgular.reduce((t, f) => t + f.DOĞRU, 0) / toplamOy) * 100) : null;
  const gecersiz = incelemeler.filter((i) => !i.siralama.length).map((i) => i.inceleyen);
  return { siralama, bulgular, secenekler, uzlasma, inceleyenSayisi: incelemeler.length, gecersiz };
}

export function bolumYaz(s) {
  const satir = [];
  satir.push(`**Uzlaşma:** ${s.uzlasma == null ? '-' : `%${s.uzlasma}`}`);
  satir.push(`**Tartışmalı:** ${s.bulgular.filter((f) => f.tartismali).length}`, '');
  if (s.gecersiz?.length) satir.push(`> Uyarı: ${s.gecersiz.join(', ')} incelemesinde biçimli SIRALAMA yok; sıralamaya katılmadı (oyları sayıldı). İnceleyenden SIRALAMA'yı yeniden iste.`, '');
  if (s.siralama.length) {
    satir.push('| Görüş | Ortalama sıra | Sıralayan |', '|---|---|---|');
    for (const r of s.siralama) satir.push(`| ${r.gorus} | ${r.ortalama} | ${r.oy} |`);
    satir.push('');
  }
  if (s.secenekler.length) {
    satir.push('| Seçenek | İlk görüşte öneren |', '|---|---|');
    for (const o of s.secenekler) satir.push(`| ${o.secenek} | ${o.oy} |`);
    satir.push('');
  }
  if (s.bulgular.length) {
    satir.push('| Bulgu | Önem | Doğru | Yanlış | Abartılı | Durum |', '|---|---|---|---|---|---|');
    for (const f of s.bulgular) satir.push(`| ${f.id} | ${f.onem} | ${f.DOĞRU} | ${f.YANLIŞ} | ${f.ABARTILI} | ${f.tartismali ? (f.onem === 'KRİTİK' ? 'tartışmalı · kullanıcıya sor' : 'tartışmalı') : 'kabul'} |`);
    satir.push('');
  }
  return satir.join('\n');
}

// Tutanaktaki "## 3. ..." bölümünü (varsa) yenisiyle değiştirir, yoksa "## 4." öncesine veya sona ekler
export function tutanagaYaz(tutanak, s) {
  const yeni = `## 3. Toplu sıralama\n\n${bolumYaz(s).trimEnd()}\n\n`;
  // Fonksiyonla değiştir: seçenek adındaki "$&", "$$" gibi diziler özel anlamla yorumlanmasın
  if (/^## 3\./m.test(tutanak)) return tutanak.replace(/^## 3\.[^\n]*\n[\s\S]*?(?=^## |(?![\s\S]))/m, () => yeni);
  if (/^## 4\./m.test(tutanak)) return tutanak.replace(/^## 4\./m, () => `${yeni}## 4.`);
  return `${tutanak.trimEnd()}\n\n${yeni}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dosya = process.argv[2];
  if (!dosya || !fs.existsSync(dosya)) { console.error('Kullanım: node .claude/hooks/council.mjs <tutanak.md>'); process.exit(1); }
  const metin = fs.readFileSync(dosya, 'utf8');
  const s = say(metin);
  if (!s.inceleyenSayisi) { console.error('Tutanakta "## 2. Çapraz inceleme" altında "### İnceleyen: X" bölümü yok.'); process.exit(1); }
  fs.writeFileSync(dosya, tutanagaYaz(metin, s));
  console.log(bolumYaz(s));
}
