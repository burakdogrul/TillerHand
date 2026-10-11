#!/usr/bin/env node
// Proje sahibinin kontrol paneli: dashboard.html (git'e girmez).
//   node .claude/hooks/dashboard.mjs [kök] [--sessiz]
// Stop hook'u her Claude cevabından sonra çalıştırır; sayfa açıkken 30 sn'de bir kendini yeniler.
// Kaynaklar: docs/*.md, git geçmişi, .kit.json, .claude/state/usage.json, .previews/. Token harcamaz.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { durumOku, oku, bolumler, bolumBul, sayac, tabloSatirlari } from './status-read.mjs';
import { limitOku, ozet, seviye, ESIKLER } from './usage.mjs';
import { kabulDurumu, hesaplar, bayraklar, birimEkonomisi, geriBildirim, metrikler, ghDurumu, baglamOku, bulguRaporlari, BULGU_TURLERI } from './dashboard-data.mjs';

const argumanlar = process.argv.slice(2);
const sessiz = argumanlar.includes('--sessiz');
// Hook olarak çalışırken (--sessiz) hata Claude'un akışını bozmasın
if (sessiz) process.on('uncaughtException', () => process.exit(0));
const kok = path.resolve(argumanlar.find((a) => !a.startsWith('--')) ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const dosya = (f) => path.join(kok, f);

// ---------- veri ----------
const d = durumOku(kok);
const limit = limitOku(kok);
const a = d.alanlar;

function gitBilgi() {
  const g = (...arg) => execFileSync('git', arg, { cwd: kok, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    g('rev-parse', '--is-inside-work-tree');
  } catch {
    return null;
  }
  const bilgi = { dal: '', degisen: [], commitler: [], ilerlemeEski: 0 };
  try { bilgi.dal = g('branch', '--show-current'); } catch { /* */ }
  try { bilgi.degisen = g('status', '--porcelain').split('\n').filter(Boolean); } catch { /* */ }
  try {
    bilgi.commitler = g('log', '-300', '--since=60.days', '--date=iso-strict', '--pretty=format:%h%x1f%ad%x1f%s')
      .split('\n').filter(Boolean).map((s) => {
        const [hash, tarih, mesaj] = s.split('\x1f');
        return { hash, tarih, mesaj, tur: (mesaj.match(/^(\w+)(\(.+?\))?!?:/)?.[1] ?? 'diğer').toLowerCase() };
      });
    const son = g('log', '-1', '--format=%H', '--', 'docs/workflow/progress.md');
    if (son) bilgi.ilerlemeEski = Number(g('rev-list', '--count', `${son}..HEAD`));
  } catch { /* ilk commit öncesi */ }
  return bilgi;
}
const git = gitBilgi();

// PRD: problem, değer önerisi, MVP özellikleri
const prd = bolumler(oku(dosya('docs/product/prd.md')));
const ilkCumle = (b) => (b ?? '').split('\n').map((s) => s.trim()).find((s) => s && !s.startsWith('>') && !s.startsWith('[')) ?? '';
const mvp = bolumBul(prd, '5. MVP').split(/^### /m).slice(1).map((p) => {
  const [baslik, ...govde] = p.split('\n');
  const metin = govde.join('\n');
  return { baslik: baslik.trim(), oncelik: metin.match(/\*\*Öncelik:\*\*\s*(.+)/)?.[1]?.trim() ?? '', ...sayac(metin) };
}).filter((o) => !o.baslik.includes('[') && o.baslik !== '...');
const kapsamDisi = bolumBul(prd, '6. Kapsam dışı').split('\n').map((s) => s.trim()).filter((s) => /^- \S/.test(s) && !s.includes('[')).map((s) => s.slice(2));

const stack = tabloSatirlari(bolumler(oku(dosya('docs/architecture/stack.md')))['Seçilen teknolojiler'], 2).map(([katman, secim]) => ({ katman, secim }));
const kritikAkislar = tabloSatirlari(bolumBul(bolumler(oku(dosya('docs/quality/test-plan.md'))), '1. Kritik'), 6)
  .map(([no, akis, , tur, dosyaAdi, durum]) => ({ no, akis, tur, dosyaAdi, durum }));
const maliyet = tabloSatirlari(oku(dosya('docs/workflow/cost-log.md')), 6)
  .map(([tarih, is, boyut, bas, bit, fark]) => ({ tarih, is, boyut, fark: parseFloat(String(fark).replace('%', '').replace(',', '.')) }));
const bakim = tabloSatirlari(bolumler(oku(dosya('docs/operations/maintenance.md')))['Bakım kaydı'], 4)
  .map(([tarih, tur, bulgu, yapilan]) => ({ tarih, tur, bulgu, yapilan }));
const yayinlanmamis = bolumBul(bolumler(oku(dosya('CHANGELOG.md'))), '[Yayınlanmamış]')
  .split('\n').map((s) => s.trim()).filter((s) => /^- \S/.test(s)).map((s) => s.slice(2));
const sonRetro = Object.keys(bolumler(oku(dosya('docs/quality/retros.md')))).filter((b) => /^\d{4}-/.test(b)).pop() ?? '';
const tasarimYonu = tabloSatirlari(bolumBul(bolumler(oku(dosya('docs/design/design-guide.md'))), '1. Seçilen'), 2)
  .filter(([, secim]) => secim && !secim.startsWith('[')).map(([alan, secim]) => ({ alan, secim }));

let onizlemeler = [];
try {
  onizlemeler = fs.readdirSync(dosya('.previews'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => {
    const html = fs.readdirSync(dosya(`.previews/${e.name}`)).filter((f) => f.endsWith('.html'));
    return { ad: e.name, dosyalar: html };
  }).sort((x, y) => x.ad.localeCompare(y.ad));
} catch { /* önizleme yok */ }

const kabul = kabulDurumu(kok);
const hesapListesi = hesaplar(oku(dosya('docs/operations/accounts.md')));
const bayrakListesi = bayraklar(oku(dosya('docs/operations/feature-flags.md')));
const ekonomi = birimEkonomisi(oku(dosya('docs/product/unit-economics.md')));
const gb = geriBildirim(oku(dosya('docs/product/feedback.md')));
const metrikKayitlari = metrikler(oku(dosya('docs/quality/metrics.md')));
const github = d.kurulu ? ghDurumu(kok) : null;
const baglam = baglamOku(kok);
const bulgu = bulguRaporlari(oku(dosya('docs/findings/README.md')));

// Dikkat gerektirenler
const dikkat = [];
const ekle = (sev, metin, eylem = '') => dikkat.push({ sev, metin, eylem });
if (d.kitBekliyor) ekle('bilgi', 'Proje henüz kurulmadı.', '/start [fikrin]');
const sonRet = [...d.kurul.toplantilar].reverse().find((t) => /RET/i.test(t.sonuc) && !/KOŞULLU/i.test(t.sonuc));
if (sonRet && !sonRet.karar) ekle('kritik', `Kurul RET verdi (${sonRet.tur}, ${sonRet.kapsam}): ${sonRet.kritik || 'kritik bulgu'}`, 'Claude\'a sor: düzelt / riski kabul et');
const lsev = seviye(limit);
const limitKisa = limit ? [['5 saatlik', limit.five_hour], ['haftalık', limit.seven_day]].filter(([, p]) => p)
  .map(([ad, p]) => `${ad} %${Math.round(p.yuzde)}${p.sifirlanma ? ` (yenilenme ${new Date(p.sifirlanma * 1000).toLocaleString('tr-TR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })})` : ''}`).join(', ') : '';
if (lsev === 'kırmızı') ekle('kritik', `Kullanım limiti kırmızı: ${limitKisa}`, 'Yeni işten önce seçenekleri değerlendir (Limit sekmesi)');
else if (lsev === 'sarı') ekle('uyari', `Kullanım limiti sarı: ${limitKisa}`, 'Büyük işleri limite göre planla');
for (const b of d.bekleyen) ekle('uyari', `Bekleyen karar: ${b}`, 'Claude seni bekliyor');
for (const k of d.kaldigiYer) ekle('uyari', `Yarıda kalan iş: ${k}`, '/build ile devam');
for (const s of d.sorunlar.slice(0, 5)) ekle('uyari', `Açık sorun: ${s}`);
if (git?.degisen.length > 15) ekle('bilgi', `${git.degisen.length} dosya commit edilmemiş.`, 'Commit veya /wrap-up');
if (git?.ilerlemeEski >= 3) ekle('bilgi', `docs/workflow/progress.md ${git.ilerlemeEski} commit'tir güncellenmedi.`, '/wrap-up');
const kapali = (a['Soru modu'] ?? '').match(/kapalı konular:\s*(.+)$/i)?.[1];
if (kapali && !/^yok$/i.test(kapali)) ekle('bilgi', `Soru modu kapalı konular: ${kapali}. Bu konulardaki kararlar otomatik veriliyor.`, '/ask-mode ac <konu>');
if (d.kurulu && d.kurul.durum === 'kurulmadı' && !/başlangıç/i.test(a['Aktif faz'] ?? '')) ekle('bilgi', 'Uzman kurulu kurulmadı.', '/board setup');
if (github?.canliIzleme?.length) ekle('kritik', `Canlı izleme: ${github.canliIzleme[0].title}`, 'Operasyon sekmesi → issue');
const sonMain = github?.calismalar?.find((c) => /^(main|master)$/.test(c.headBranch) && c.workflowName === 'CI');
if (sonMain?.conclusion === 'failure') ekle('uyari', 'main dalında son CI çalışması başarısız.', 'Operasyon sekmesi');
for (const h of hesapListesi) for (const t of h.tarihler) {
  if (t.kalan < 0) ekle('kritik', `${h.servis}: ${t.tur} tarihi geçti (${t.tarih}).`, 'docs/operations/accounts.md');
  else if (t.kalan <= 30) ekle('uyari', `${h.servis}: ${t.tur} ${t.kalan} gün sonra (${t.tarih}).`, 'Yenile veya otomatik yenilemeyi aç');
}
for (const h of hesapListesi.filter((x) => x.ikiFaYok)) ekle('uyari', `${h.servis} hesabında 2FA yok.`, 'docs/operations/accounts.md');
if (ekonomi && ekonomi.katki < 0) ekle('kritik', `Birim ekonomisi negatif: her ödeyen kullanıcı ${Math.abs(ekonomi.katki).toFixed(1)} ${ekonomi.paraBirimi} zarar ettiriyor.`, 'Fiyat veya maliyet kararı (/plan-task)');
for (const k of kabul.uyumsuz.slice(0, 3)) ekle('uyari', `${k.id} PRD'de tamam işaretli ama kabul testi ${k.sonuc === 'kaldi' ? 'kırmızı' : k.test ? 'sonuçsuz' : 'yok'}.`, 'Testi çalıştır veya işareti kaldır');
const geciken = bayrakListesi.filter((b) => b.gecikti);
if (geciken.length) ekle('bilgi', `Kaldırma tarihi geçen ${geciken.length} bayrak: ${geciken.map((b) => b.ad).join(', ')}.`, 'Bayrağı ve eski kod yolunu kaldır');
if (gb.yeni) ekle('bilgi', `${gb.yeni} işlenmemiş kullanıcı geri bildirimi var.`, '/user-feedback');
if (baglam?.yuzde >= 70 && Date.now() - baglam.okundu < 3600e3) ekle('uyari', `Bağlam %${baglam.yuzde} dolu; yanıt kalitesi düşebilir.`, '/wrap-up ve /clear');
for (const r of Object.values(bulgu.son)) if (r.kritik > 0) ekle('uyari', `${BULGU_TURLERI[r.tur] ?? r.tur} bulgu raporunda ${r.kritik} kritik bulgu var (sağlık ${r.saglik}/100).`, `docs/findings/${r.tur}/latest.md`);
// Önem sırası: kritik > uyarı > bilgi (aynı önemde eklenme sırası korunur)
const ONEM = { kritik: 0, uyari: 1, bilgi: 2 };
dikkat.sort((x, y) => ONEM[x.sev] - ONEM[y.sev]);
const saglik = dikkat.some((x) => x.sev === 'kritik') ? 'kritik' : dikkat.some((x) => x.sev === 'uyari') ? 'uyari' : 'iyi';

// Aktivite: son 14 gün commit sayısı ve birleşik akış
const gunAnahtar = (t) => { const z = new Date(t); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`; };
const gunler = [...Array(14)].map((_, i) => { const z = new Date(); z.setDate(z.getDate() - (13 - i)); return gunAnahtar(z); });
const gunSayim = Object.fromEntries(gunler.map((g) => [g, 0]));
for (const c of git?.commitler ?? []) { const g = gunAnahtar(c.tarih); if (g in gunSayim) gunSayim[g]++; }
const son7 = gunler.slice(7).reduce((t, g) => t + gunSayim[g], 0);
const son30 = (git?.commitler ?? []).filter((c) => Date.now() - new Date(c.tarih) < 30 * 864e5);
const turSayim = son30.reduce((m, c) => ((m[c.tur] = (m[c.tur] ?? 0) + 1), m), {});
const duzeltmeOrani = (turSayim.feat ?? 0) + (turSayim.fix ?? 0) ? Math.round(((turSayim.fix ?? 0) / ((turSayim.feat ?? 0) + (turSayim.fix ?? 0))) * 100) : null;

const akis = [
  ...(git?.commitler ?? []).slice(0, 60).map((c) => ({ zaman: c.tarih, tur: 'commit', baslik: c.mesaj, ek: c.hash })),
  ...d.kararlar.map((k) => ({ zaman: k.tarih, tur: 'karar', baslik: `${k.soru} → ${k.secilen}`, ek: `${k.konu} · ${k.veren}` })),
  ...d.kurul.toplantilar.map((t) => ({ zaman: t.tarih, tur: 'kurul', baslik: `${t.tur}: ${t.kapsam} → ${t.sonuc}`, ek: t.katilan })),
  ...bakim.map((b) => ({ zaman: b.tarih, tur: 'bakım', baslik: `${b.tur}: ${b.bulgu}`, ek: b.yapilan })),
].filter((x) => x.zaman && !Number.isNaN(new Date(x.zaman).getTime()))
  .sort((x, y) => new Date(y.zaman) - new Date(x.zaman)).slice(0, 50);

const otomatikKarar = d.kararlar.filter((k) => /otomatik/i.test(k.veren)).length;
const retSayisi = d.kurul.toplantilar.filter((t) => /RET/.test(t.sonuc) && !/KOŞULLU/.test(t.sonuc)).length;
const mvpKriter = mvp.reduce((t, o) => ({ bitti: t.bitti + o.bitti, toplam: t.toplam + o.toplam }), { bitti: 0, toplam: 0 });
const ortalamaMaliyet = Object.entries(maliyet.reduce((m, r) => {
  if (!Number.isNaN(r.fark)) (m[r.boyut] ??= []).push(r.fark);
  return m;
}, {})).map(([boyut, l]) => ({ boyut, ort: l.reduce((t, x) => t + x, 0) / l.length, n: l.length }));

// ---------- yardımcılar ----------
const e = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const md = (s) => e(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const yuzde = (b, t) => (t ? Math.round((b / t) * 100) : 0);
const cubuk = (b, t, sinif = '') => `<div class="bar ${sinif}" role="img" aria-label="${b}/${t}"><span style="width:${yuzde(b, t)}%"></span></div>`;
const bos = (metin, eylem = '') => `<p class="empty">${md(metin)}${eylem ? ` <code>${e(eylem)}</code>` : ''}</p>`;
const SEV = { kritik: ['⛔', 'Kritik'], uyari: ['⚠', 'Dikkat'], bilgi: ['ℹ', 'Bilgi'], iyi: ['✓', 'Yolunda'] };
const rozet = (sev, yazi) => `<span class="badge ${sev}"><span class="ic" aria-hidden="true">${SEV[sev][0]}</span> ${e(yazi ?? SEV[sev][1])}</span>`;
const tarihYaz = (t) => { const z = new Date(t); return Number.isNaN(z.getTime()) ? e(t) : z.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: t.length > 10 ? '2-digit' : undefined, minute: t.length > 10 ? '2-digit' : undefined }); };
const limitSev = (p, k) => (p == null ? 'bilgi' : p >= ESIKLER[k].kirmizi ? 'kritik' : p >= ESIKLER[k].sari ? 'uyari' : 'iyi');
const KONULAR = ['urun', 'teknik', 'tasarim', 'icerik', 'veri', 'guvenlik', 'maliyet'];

const dikkatSatiri = (x) => `<li class="${x.sev}"><span class="ic" aria-hidden="true">${SEV[x.sev][0]}</span><span><span class="sr-only">${SEV[x.sev][1]}: </span>${md(x.metin)}</span>${x.eylem ? `<span class="eylem">→ ${md(x.eylem)}</span>` : ''}</li>`;
const kutu = (etiket, deger, alt = '', bar = '') => `<div class="kpi"><div class="kpi-l">${e(etiket)}</div><div class="kpi-v">${deger}</div>${bar}<div class="kpi-s">${alt}</div></div>`;

// ---------- bölümler ----------
const aktifIndex = Math.max(0, [{ ad: 'Başlangıç' }, ...d.fazlar].findIndex((f) => (a['Aktif faz'] ?? '').toLowerCase().startsWith(f.ad.toLowerCase().split(' ').slice(0, 2).join(' '))));
const baslangic = (a['Başlangıç adımı'] ?? '0/9').split('/').map(Number);
const asamaSeridi = `<ol class="steps">${[{ ad: 'Başlangıç', bitti: baslangic[0] || 0, toplam: baslangic[1] || 9 }, ...d.fazlar].map((f, i) =>
  `<li class="step${i === aktifIndex ? ' now' : ''}${f.toplam && f.bitti === f.toplam ? ' done' : ''}"><span class="step-n">${i === 0 ? 'B' : i - 1}</span><div class="step-b"><b>${e(f.ad.replace(/\s*\(.*\)$/, ''))}</b>${cubuk(f.bitti, f.toplam)}<span class="muted num">${f.bitti}/${f.toplam}</span></div></li>`).join('')}</ol>`;

const genel = `
<div class="grid2">
  <section class="card"><h3>Durum özeti</h3>${d.durum ? `<p>${md(d.durum)}</p>` : bos('Henüz özet yok.')}
    <h4>Son oturumda</h4>${d.sonOturum.length ? `<ul>${d.sonOturum.map((s) => `<li>${md(s)}</li>`).join('')}</ul>` : bos('Kayıt yok.')}</section>
  <section class="card"><h3>Son hareketler</h3>${akis.length ? `<ul class="feed compact">${akis.slice(0, 7).map(akisSatiri).join('')}</ul>` : bos('Henüz hareket yok.')}</section>
</div>
<section class="card"><h3>Aşamalar</h3>${asamaSeridi}</section>`;

function akisSatiri(x) {
  return `<li class="feed-i t-${x.tur.replace('ı', 'i')}"><span class="ft">${e(x.tur)}</span><div><div>${md(x.baslik)}</div><div class="muted small">${tarihYaz(x.zaman)}${x.ek ? ' · ' + e(x.ek) : ''}</div></div></li>`;
}

const yolHaritasi = d.fazlar.length ? d.fazlar.map((f) => `
<details class="card faz" ${f.ad.toLowerCase().startsWith((a['Aktif faz'] ?? '#').toLowerCase().split(' ').slice(0, 2).join(' ')) ? 'open' : ''}>
  <summary><b>${e(f.ad)}</b><span class="faz-bar">${cubuk(f.bitti, f.toplam)}<span class="num muted">${f.bitti}/${f.toplam}</span></span></summary>
  <ul class="tasks">${f.gorevler.map((g) => `<li class="${g.bitti ? 'ok' : ''}${(a['Aktif görev'] && g.metin.startsWith(a['Aktif görev'])) ? ' active' : ''}"><span class="chk" aria-hidden="true">${g.bitti ? '✓' : ''}</span><span>${md(g.metin)}</span></li>`).join('')}</ul>
</details>`).join('') : bos('Yol haritası henüz yok. `/start` Adım 8\'de oluşur.');

const kararTablosu = d.kararlar.length ? `
<div class="filters" role="group" aria-label="Konu filtresi"><button class="chip on" data-k="hepsi">Hepsi (${d.kararlar.length})</button>${KONULAR.filter((k) => d.kararlar.some((x) => x.konu === k)).map((k) => `<button class="chip" data-k="${k}">${k} (${d.kararlar.filter((x) => x.konu === k).length})</button>`).join('')}<button class="chip" data-k="otomatik">otomatik (${otomatikKarar})</button><button class="chip" data-k="tek">tek yönlü (${d.kararlar.filter((k) => /^tek/i.test(k.kapi)).length})</button></div>
<div class="tw"><table id="kararlar"><thead><tr><th>#</th><th>Tarih</th><th>Aşama</th><th>Konu</th><th>Soru</th><th>Seçilen</th><th>Kapı</th><th>Veren</th></tr></thead><tbody>
${[...d.kararlar].reverse().map((k) => `<tr data-k="${e(k.konu)}" data-v="${/otomatik/i.test(k.veren) ? 'otomatik' : ''}" data-kapi="${/^tek/i.test(k.kapi) ? 'tek' : ''}"><td class="num">${e(k.no)}</td><td class="num nw">${e(k.tarih)}</td><td>${e(k.asama)}</td><td><span class="tag">${e(k.konu)}</span></td><td>${md(k.soru)}</td><td><b>${md(k.secilen)}</b></td><td>${/^tek/i.test(k.kapi) ? rozet('uyari', 'tek yönlü') : k.kapi ? `<span class="muted small">${e(k.kapi)}</span>` : ''}</td><td>${/otomatik/i.test(k.veren) ? rozet('uyari', 'otomatik') : rozet('iyi', 'kullanıcı')}</td></tr>`).join('')}
</tbody></table></div>` : bos('Henüz karar verilmedi. Kararlar `/start` ile başlar.');

const kurulBolumu = `
<div class="grid2">
  <section class="card"><h3>Üyeler · ${e(d.kurul.durum)}</h3>${d.kurul.uyeler.length ? `<ul class="members">${d.kurul.uyeler.map((u) => `<li><b>${e(u.uye)}</b><span class="muted small">${e(u.model)} · ${e(u.odak)}</span></li>`).join('')}</ul>` : bos('Kurul kurulmadı.', '/board setup')}
    <p class="muted small">Commit denetimi: ${e(d.kurul.commitDenetimi)}</p></section>
  <section class="card"><h3>Özet</h3><div class="kpis mini">${kutu('Toplantı', d.kurul.toplantilar.length)}${kutu('RET', retSayisi, retSayisi ? rozet('kritik', 'kritik bulgu') : '')}${kutu('Onay oranı', d.kurul.toplantilar.length ? `%${yuzde(d.kurul.toplantilar.filter((t) => /^ONAY/i.test(t.sonuc)).length, d.kurul.toplantilar.length)}` : '-')}</div></section>
</div>
<section class="card"><h3>Toplantı günlüğü</h3>${d.kurul.toplantilar.length ? `<div class="tw"><table><thead><tr><th>#</th><th>Tarih</th><th>Tür</th><th>Kapsam</th><th>Katılan</th><th>Sonuç</th><th>Kritik</th><th>Kullanıcı kararı</th></tr></thead><tbody>
${[...d.kurul.toplantilar].reverse().map((t) => `<tr><td class="num">${e(t.no)}</td><td class="num nw">${e(t.tarih)}</td><td>${e(t.tur)}</td><td>${md(t.kapsam)}</td><td>${e(t.katilan)}</td><td>${/KOŞULLU/i.test(t.sonuc) ? rozet('uyari', t.sonuc) : /RET/i.test(t.sonuc) ? rozet('kritik', t.sonuc) : rozet('iyi', t.sonuc)}</td><td>${md(t.kritik)}</td><td>${md(t.karar)}</td></tr>`).join('')}
</tbody></table></div>` : bos('Henüz toplantı yapılmadı.')}</section>`;

const kalite = `
<div class="grid2">
  <section class="card"><h3>Kontrol listeleri</h3><div class="rows">${d.listeler.map((l) => `<div class="row"><span>${e(l.ad)}</span>${cubuk(l.bitti, l.toplam)}<span class="num muted">${l.bitti}/${l.toplam}</span></div>`).join('')}</div></section>
  <section class="card"><h3>Kod sağlığı · son 30 gün</h3>
    <div class="kpis mini">${kutu('Commit', son30.length)}${kutu('Düzeltme oranı', duzeltmeOrani == null ? '-' : `%${duzeltmeOrani}`, 'fix / (feat + fix)')}${kutu('Commit edilmemiş', git ? git.degisen.length : '-')}</div>
    ${Object.keys(turSayim).length ? `<div class="rows">${Object.entries(turSayim).sort((x, y) => y[1] - x[1]).map(([t, n]) => `<div class="row"><span><code>${e(t)}</code></span>${cubuk(n, son30.length)}<span class="num muted">${n}</span></div>`).join('')}</div>` : ''}
    <p class="muted small">Yüksek düzeltme oranı, yeni özelliklerin sık bozulduğunu gösterebilir; retroda konuşulmalı.</p></section>
</div>
<section class="card"><h3>Kabul testleri</h3>${kabul.toplam ? `<div class="kpis mini">${kutu('Kriter', kabul.toplam)}${kutu('Testi olan', `${kabul.testli}/${kabul.toplam}`, '', cubuk(kabul.testli, kabul.toplam))}${kutu('Geçen', `${kabul.gecen}/${kabul.toplam}`, kabul.raporZamani ? `rapor: ${new Date(kabul.raporZamani).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'JUnit raporu yok', cubuk(kabul.gecen, kabul.toplam, 'iyi'))}</div>` : bos('PRD\'de kimlikli kabul kriteri yok (`Ö-01.1` biçimi).')}</section>
<section class="card"><h3>Metrikler · aylık</h3>${metrikKayitlari.length ? `<div class="tw"><table><thead><tr><th>Dönem</th><th>Görev</th><th>Ort. süre (dk)</th><th>Ort. limit</th><th>Düzeltme</th><th>Geri alma</th><th>Kopya kod</th><th>Açık kritik</th><th>Kabul</th></tr></thead><tbody>${[...metrikKayitlari].reverse().slice(0, 8).map((m) => `<tr><td class="nw">${e(m.donem)}</td><td class="num">${e(m.gorev)}</td><td class="num">${e(m.sure)}</td><td class="num">${e(m.limit)}</td><td class="num">${e(m.duzeltme)}</td><td class="num">${e(m.geriAlma)}</td><td class="num">${e(m.kopya)}</td><td class="num">${e(m.kritik)}</td><td class="num">${e(m.kabul)}</td></tr>`).join('')}</tbody></table></div>` : bos('Henüz metrik kaydı yok. `/maintain monthly` ve `/retro` ekler.')}</section>
<section class="card"><h3>Kritik akış testleri</h3>${kritikAkislar.length ? `<div class="tw"><table><thead><tr><th>#</th><th>Akış</th><th>Test türü</th><th>Dosya</th><th>Durum</th></tr></thead><tbody>${kritikAkislar.map((k) => `<tr><td class="num">${e(k.no)}</td><td>${md(k.akis)}</td><td>${e(k.tur)}</td><td>${md(k.dosyaAdi)}</td><td>${/✅|yeşil|var/i.test(k.durum) ? rozet('iyi', 'var') : rozet('uyari', 'yok')}</td></tr>`).join('')}</tbody></table></div>` : bos('Test planı yok.')}</section>
<section class="card"><h3>Bakım kaydı</h3>${bakim.length ? `<ul class="feed compact">${[...bakim].reverse().slice(0, 8).map((b) => akisSatiri({ zaman: b.tarih, tur: 'bakım', baslik: `${b.tur}: ${b.bulgu}`, ek: b.yapilan })).join('')}</ul>` : bos('Henüz bakım yapılmadı.', '/maintain weekly')}
${sonRetro ? `<p class="muted small">Son retro: ${e(sonRetro)}</p>` : ''}</section>`;

const maxGun = Math.max(1, ...Object.values(gunSayim));
const aktivite = `
<section class="card"><h3>Commit · son 14 gün <span class="muted small">(toplam ${gunler.reduce((t, g) => t + gunSayim[g], 0)})</span></h3>
  <div class="spark" role="img" aria-label="Son 14 günde günlük commit sayısı">${gunler.map((g) => `<div class="sb" data-tip="${new Date(g).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' })}: ${gunSayim[g]} commit"><span style="height:${gunSayim[g] ? Math.max(6, (gunSayim[g] / maxGun) * 100) : 0}%"></span></div>`).join('')}</div>
  <div class="spark-x muted small"><span>${new Date(gunler[0]).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span><span>bugün</span></div>
  <details class="tablo-gor"><summary class="muted small">Tablo olarak göster</summary><div class="tw"><table><thead><tr><th>Gün</th><th>Commit</th></tr></thead><tbody>${gunler.map((g) => `<tr><td class="num">${g}</td><td class="num">${gunSayim[g]}</td></tr>`).join('')}</tbody></table></div></details>
</section>
<section class="card"><h3>Akış</h3>${akis.length ? `<ul class="feed">${akis.map(akisSatiri).join('')}</ul>` : bos('Henüz hareket yok.')}</section>`;

const urun = `
<div class="grid2">
  <section class="card"><h3>Ürün</h3>
    <h4>Problem</h4>${ilkCumle(bolumBul(prd, '1. Problem')) ? `<p>${md(ilkCumle(bolumBul(prd, '1. Problem')))}</p>` : bos('PRD henüz yazılmadı.', '/start')}
    <h4>Değer önerisi</h4>${ilkCumle(bolumBul(prd, '3. Değer')) ? `<p>${md(ilkCumle(bolumBul(prd, '3. Değer')))}</p>` : bos('-')}
    ${kapsamDisi.length ? `<h4>Kapsam dışı</h4><ul>${kapsamDisi.map((k) => `<li>${md(k)}</li>`).join('')}</ul>` : ''}</section>
  <section class="card"><h3>MVP özellikleri</h3>${mvp.length ? `<div class="rows">${mvp.map((o) => `<div class="row"><span>${md(o.baslik)} ${o.oncelik ? `<span class="tag">${e(o.oncelik)}</span>` : ''}</span>${cubuk(o.bitti, o.toplam)}<span class="num muted">${o.bitti}/${o.toplam}</span></div>`).join('')}</div>` : bos('MVP henüz tanımlanmadı.')}
  ${kabul.toplam ? `<h4>Kabul kriterleri · test sonucu</h4><div class="tw"><table><thead><tr><th>Kriter</th><th>PRD</th><th>Test</th></tr></thead><tbody>${kabul.liste.map((k) => `<tr><td><code>${e(k.id)}</code> ${md(k.metin)}</td><td>${k.isaretli ? '✓' : ''}</td><td>${k.sonuc === 'gecti' ? rozet('iyi', 'geçti') : k.sonuc === 'kaldi' ? rozet('kritik', 'kaldı') : k.test ? rozet('bilgi', 'sonuç yok') : rozet('uyari', 'test yok')}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>
</div>
<div class="grid2">
  <section class="card"><h3>Teknoloji</h3>${stack.length && !stack.every((s) => !s.secim) ? `<dl class="dl">${stack.map((s) => `<dt>${e(s.katman)}</dt><dd>${md(s.secim || '-')}</dd>`).join('')}</dl>` : bos('Stack seçilmedi.')}</section>
  <section class="card"><h3>Tasarım</h3>${tasarimYonu.length ? `<dl class="dl">${tasarimYonu.map((t) => `<dt>${e(t.alan)}</dt><dd>${md(t.secim)}</dd>`).join('')}</dl>` : bos('Tasarım yönü seçilmedi.', '/design genel')}
    ${onizlemeler.length ? `<h4>Önizlemeler</h4><ul class="links">${onizlemeler.map((o) => `<li><b>${e(o.ad)}</b> ${o.dosyalar.map((f) => `<a href=".previews/${encodeURIComponent(o.ad)}/${encodeURIComponent(f)}" target="_blank" rel="noopener">${e(f.replace('.html', ''))}</a>`).join(' ')}</li>`).join('')}</ul>` : ''}</section>
</div>
<div class="grid2">
  <section class="card"><h3>Birim ekonomisi</h3>${ekonomi ? `<div class="kpis mini">${kutu('Katkı payı', `${ekonomi.katki.toFixed(1)} ${e(ekonomi.paraBirimi)}`, 'ödeyen kullanıcı başı / ay')}${kutu('Başa baş', ekonomi.basaBas ?? '—', ekonomi.basaBas ? 'ödeyen kullanıcı' : 'katkı negatif')}${kutu(`Hedefte (${ekonomi.hedef} kullanıcı)`, `${ekonomi.kar >= 0 ? '+' : ''}${Math.round(ekonomi.kar)} ${e(ekonomi.paraBirimi)}`, 'aylık kâr / zarar')}${ekonomi.degiskenOrani != null ? kutu('Değişken / fiyat', `%${Math.round(ekonomi.degiskenOrani)}`, ekonomi.degiskenOrani > 30 ? rozet('uyari', '%30 üstü') : '') : ''}</div>` : bos('Girdiler boş.', 'docs/product/unit-economics.md')}</section>
  <section class="card"><h3>Kullanıcı geri bildirimi</h3>${gb.kayitlar.length ? `<div class="kpis mini">${kutu('Toplam', gb.kayitlar.length)}${kutu('Yeni', gb.yeni)}${kutu('Planlandı', gb.kayitlar.filter((k) => /planland/i.test(k.durum)).length)}</div>${gb.temalar.length ? `<h4>Öne çıkan temalar</h4><div class="rows">${gb.temalar.slice(0, 5).map((t) => `<div class="row"><span>${md(t.tema)}</span>${cubuk(t.sayi, gb.temalar[0].sayi)}<span class="num muted">${t.sayi}</span></div>`).join('')}</div>` : ''}` : bos('Henüz geri bildirim yok.', '/user-feedback')}</section>
</div>
<section class="card"><h3>Yayınlanmamış değişiklikler (CHANGELOG)</h3>${yayinlanmamis.length ? `<ul>${yayinlanmamis.map((s) => `<li>${md(s)}</li>`).join('')}</ul>` : bos('Yayınlanmamış değişiklik yok.')}</section>`;

const limitKart = (ad, k) => {
  const p = limit?.[k];
  const sev = limitSev(p?.yuzde, k);
  return `<div class="lim"><div class="lim-h"><b>${ad}</b>${rozet(sev, p ? `%${Math.round(p.yuzde)}` : 'bilinmiyor')}</div>
  <div class="bar big ${sev}"><span style="width:${p ? Math.min(100, p.yuzde) : 0}%"></span><i style="left:${ESIKLER[k].sari}%" title="sarı eşik"></i><i style="left:${ESIKLER[k].kirmizi}%" title="kırmızı eşik"></i></div>
  <div class="muted small">${p?.sifirlanma ? `Sıfırlanma: ${new Date(p.sifirlanma * 1000).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : p?.yenilendi ? 'Yenilendi' : '-'} · eşikler %${ESIKLER[k].sari} / %${ESIKLER[k].kirmizi}</div></div>`;
};
const limitBolumu = `
<section class="card"><h3>Kullanım limiti</h3><div class="grid2 tight">${limitKart('5 saatlik', 'five_hour')}${limitKart('Haftalık', 'seven_day')}</div>
<p class="muted small">${e(ozet(limit))}</p>
<h4>Bağlam penceresi</h4>${baglam ? `<div class="lim"><div class="lim-h"><b>Son oturum</b>${rozet(baglam.yuzde >= 70 ? 'kritik' : baglam.yuzde >= 50 ? 'uyari' : 'iyi', `%${baglam.yuzde}`)}</div><div class="bar big ${baglam.yuzde >= 70 ? 'kritik' : baglam.yuzde >= 50 ? 'uyari' : 'iyi'}"><span style="width:${Math.min(100, baglam.yuzde)}%"></span><i style="left:50%"></i><i style="left:70%"></i></div><div class="muted small">%50'de /wrap-up + /clear önerilir · ${new Date(baglam.okundu).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit' })} itibarıyla</div></div>` : bos('Bağlam bilgisi yok (durum çubuğu yazar).')}</section>
<section class="card"><h3>Maliyet günlüğü</h3>${ortalamaMaliyet.length ? `<div class="kpis mini">${ortalamaMaliyet.map((m) => kutu(`Ortalama · ${m.boyut}`, `%${m.ort.toFixed(1)}`, `${m.n} kayıt`)).join('')}</div>
<div class="tw"><table><thead><tr><th>Tarih</th><th>İş</th><th>Boyut</th><th>5s kullanım</th></tr></thead><tbody>${[...maliyet].reverse().slice(0, 15).map((m) => `<tr><td class="num nw">${e(m.tarih)}</td><td>${md(m.is)}</td><td>${e(m.boyut)}</td><td class="num">${Number.isNaN(m.fark) ? '-' : `%${m.fark}`}</td></tr>`).join('')}</tbody></table></div>` : bos('Henüz kayıt yok. `/build` her görevin limit maliyetini buraya yazar.')}</section>`;

const gunRozet = (t) => (t.kalan < 0 ? rozet('kritik', `${-t.kalan} gün geçti`) : t.kalan <= 30 ? rozet('uyari', `${t.kalan} gün`) : rozet('iyi', `${t.kalan} gün`));
const operasyon = `
<section class="card"><h3>Hesaplar ve son tarihler</h3>${hesapListesi.length ? `<div class="tw"><table><thead><tr><th>Servis</th><th>Amaç</th><th>Sahip</th><th>2FA</th><th>Plan</th><th>Tarihler</th></tr></thead><tbody>${hesapListesi.map((h) => `<tr><td><b>${e(h.servis)}</b></td><td>${e(h.amac)}</td><td>${e(h.sahip)}</td><td>${h.ikiFaYok ? rozet('uyari', 'yok') : e(h.ikiFa)}</td><td>${e(h.plan)}</td><td>${h.tarihler.map((t) => `<div class="nw">${e(t.tur)}: ${e(t.tarih)} ${gunRozet(t)}</div>`).join('') || '<span class="muted">-</span>'}</td></tr>`).join('')}</tbody></table></div>` : bos('Hesap envanteri boş.', 'docs/operations/accounts.md')}</section>
<section class="card"><h3>Özellik bayrakları</h3>${bayrakListesi.length ? `<div class="tw"><table><thead><tr><th>Bayrak</th><th>Amaç</th><th>Durum</th><th>Kaldırma</th><th>Acil kapatma</th></tr></thead><tbody>${bayrakListesi.map((b) => `<tr><td><code>${e(b.ad)}</code></td><td>${md(b.amac)}</td><td>${e(b.durum)}</td><td class="nw">${e(b.kaldirma)} ${b.gecikti ? rozet('uyari', 'gecikti') : ''}</td><td>${b.testsiz ? rozet('uyari', 'denenmedi') : rozet('iyi', 'denendi')}</td></tr>`).join('')}</tbody></table></div>` : bos('Bayrak yok.', 'docs/operations/feature-flags.md')}</section>
<section class="card"><h3>GitHub</h3>${github ? `
  ${github.canliIzleme?.length ? `<p>${rozet('kritik', 'Canlı izleme bozuk')} ${github.canliIzleme.map((i) => `<a href="${e(i.url)}" target="_blank" rel="noopener">#${e(i.number)} ${e(i.title)}</a>`).join(', ')}</p>` : ''}
  <h4>Son iş akışları</h4>${github.calismalar?.length ? `<div class="tw"><table><thead><tr><th>İş akışı</th><th>Dal</th><th>Sonuç</th><th>Zaman</th></tr></thead><tbody>${github.calismalar.map((c) => `<tr><td><a href="${e(c.url)}" target="_blank" rel="noopener">${e(c.workflowName)}</a></td><td><code>${e(c.headBranch)}</code></td><td>${c.conclusion === 'success' ? rozet('iyi', 'başarılı') : c.conclusion === 'failure' ? rozet('kritik', 'başarısız') : rozet('bilgi', c.conclusion || c.status)}</td><td class="num nw">${tarihYaz(c.createdAt)}</td></tr>`).join('')}</tbody></table></div>` : bos('Henüz çalışma yok.')}
  <h4>Açık PR'lar</h4>${github.prlar?.length ? `<ul>${github.prlar.map((r) => `<li><a href="${e(r.url)}" target="_blank" rel="noopener">#${e(r.number)} ${e(r.title)}</a>${r.isDraft ? ' <span class="tag">taslak</span>' : ''}</li>`).join('')}</ul>` : bos('Açık PR yok.')}
  <p class="muted small">gh CLI ile okunur, 5 dakikada bir yenilenir.</p>` : bos('GitHub bilgisi yok: gh CLI kurulu ve giriş yapılmış olmalı, depo GitHub\'a bağlı olmalı.')}</section>`;

const saglikSev = (p) => (p >= 85 ? 'iyi' : p >= 70 ? 'bilgi' : p >= 50 ? 'uyari' : 'kritik');
const saglikAd = (p) => (p >= 85 ? 'Sağlıklı' : p >= 70 ? 'İyi' : p >= 50 ? 'Dikkat' : 'Riskli');
const bulgularBolumu = `
<section class="card"><h3>Alan sağlık puanları</h3>${Object.keys(bulgu.son).length ? `<div class="kpis mini">${Object.keys(BULGU_TURLERI).filter((t) => bulgu.son[t]).map((t) => {
  const r = bulgu.son[t];
  const fark = r.onceki != null ? r.saglik - r.onceki : null;
  return kutu(BULGU_TURLERI[t], `${r.saglik}/100`, `${rozet(saglikSev(r.saglik), saglikAd(r.saglik))} ${fark != null ? `<span class="num">${fark >= 0 ? '+' : ''}${fark}</span>` : ''}<br><a href="docs/findings/${e(t)}/latest.md" target="_blank" rel="noopener">${e(r.tarih)} · ${r.bulgu ?? '-'} bulgu${r.kritik ? ` · ${r.kritik} kritik` : ''}</a>`, cubuk(r.saglik, 100, saglikSev(r.saglik)));
}).join('')}</div>${Object.keys(BULGU_TURLERI).filter((t) => !bulgu.son[t]).length ? `<p class="muted small">Henüz raporu olmayanlar: ${Object.keys(BULGU_TURLERI).filter((t) => !bulgu.son[t]).map((t) => `<code>/findings-${t}</code>`).join(' ')}</p>` : ''}` : bos('Henüz bulgu raporu yok. Başlamak için:', '/findings-tech')}</section>
<section class="card"><h3>Rapor geçmişi</h3>${bulgu.satirlar.length ? `<div class="tw"><table><thead><tr><th>Tarih</th><th>Tür</th><th>Sağlık</th><th>Değişim</th><th>Bulgu</th><th>Kritik</th><th>Rapor</th></tr></thead><tbody>${[...bulgu.satirlar].reverse().slice(0, 30).map((r) => `<tr><td class="num nw">${e(r.tarih)}</td><td>${e(BULGU_TURLERI[r.tur] ?? r.tur)}</td><td>${rozet(saglikSev(r.saglik), `${r.saglik}`)}</td><td class="num">${r.onceki != null ? `${r.saglik - r.onceki >= 0 ? '+' : ''}${r.saglik - r.onceki}` : '-'}</td><td class="num">${r.bulgu ?? '-'}</td><td class="num">${r.kritik || '-'}</td><td>${md(r.rapor)}</td></tr>`).join('')}</tbody></table></div>` : bos('Rapor yok.')}
<p class="muted small">Puanlama: bulgu önemi = etki (40) + olasılık (25) + yayılım (20) + aciliyet (15); sağlık = 100 − ceza (kritik 15, yüksek 8, orta 4, düşük 1). Yöntem: <code>.claude/findings/protocol.md</code></p></section>`;

const SEKMELER = [
  ['genel', 'Genel', genel], ['yol', 'Yol haritası', yolHaritasi], ['kararlar', `Kararlar`, kararTablosu],
  ['kurul', 'Kurul', kurulBolumu], ['bulgular', 'Bulgular', bulgularBolumu], ['kalite', 'Kalite', kalite], ['aktivite', 'Aktivite', aktivite],
  ['urun', 'Ürün ve teknik', urun], ['operasyon', 'Operasyon', operasyon], ['limit', 'Limit ve maliyet', limitBolumu],
];

const siradaki = d.siradaki[0] ?? (d.kitBekliyor ? '`/start [fikrin]`' : '-');
const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(d.proje)} · Kontrol paneli</title>
<style>
:root{--bg:#f4f6f9;--surface:#fff;--sunk:#eef1f5;--fg:#141b27;--muted:#5b6577;--line:#dde3eb;--accent:#2a78d6;--accent-soft:#e3eefb;
--good:#0ca30c;--warn:#fab219;--serious:#ec835a;--crit:#d03b3b;--good-bg:#e5f5e5;--warn-bg:#fdf3dc;--crit-bg:#fbe7e7;--info-bg:#e9eef6;
--sans:"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Helvetica Neue",sans-serif;--mono:"Cascadia Code",Consolas,"SF Mono",ui-monospace,monospace;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#101318;--surface:#171b22;--sunk:#1e232c;--fg:#e6eaf0;--muted:#98a2b3;--line:#2a313c;--accent:#5598e7;--accent-soft:#1b2a40;
--good-bg:#132a17;--warn-bg:#2d2512;--crit-bg:#331618;--info-bg:#1b2230;color-scheme:dark}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:14.5px/1.55 var(--sans);padding:0 16px 64px}
.wrap{max-width:1180px;margin:0 auto;display:grid;gap:18px}
h1{font-size:1.55rem;margin:0;letter-spacing:-.01em;line-height:1.2}h3{font-size:.95rem;margin:0 0 12px}h4{font-size:.78rem;margin:14px 0 6px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
p{margin:0 0 6px}ul{margin:0;padding-left:1.1em;display:grid;gap:4px}a{color:var(--accent)}
code{font:.86em var(--mono);background:var(--sunk);padding:.08em .38em;border-radius:4px;overflow-wrap:anywhere}
.muted{color:var(--muted)}.small{font-size:.82rem}.num{font-variant-numeric:tabular-nums}.nw{white-space:nowrap}
.top{position:sticky;top:0;z-index:5;background:var(--bg);padding:14px 0 10px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between}
.top .meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.pill{font:600 .75rem/1 var(--mono);padding:6px 9px;border-radius:999px;background:var(--surface);border:1px solid var(--line);white-space:nowrap}
.refresh{display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--muted)}
.hero{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:18px}
@media (max-width:860px){.hero{grid-template-columns:1fr}}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;min-width:0}
.now-l{font:600 .72rem/1 var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.now-v{font-size:1.25rem;font-weight:650;margin:4px 0 10px;line-height:1.3}
.now-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 16px}
.next{margin-top:12px;padding:10px 12px;border-radius:8px;background:var(--accent-soft)}
.next .now-l{color:var(--accent)}
.att{list-style:none;padding:0;gap:8px}.att li{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:start;padding:8px 10px;border-radius:8px;background:var(--sunk)}
.att li.kritik{background:var(--crit-bg)}.att li.uyari{background:var(--warn-bg)}.att .eylem{grid-column:2;font-size:.8rem;color:var(--muted)}
.badge{display:inline-flex;gap:4px;align-items:center;font:600 .74rem/1 var(--sans);padding:4px 8px;border-radius:999px;white-space:nowrap}
.badge.iyi{background:var(--good-bg);color:var(--fg)}.badge.uyari{background:var(--warn-bg);color:var(--fg)}.badge.kritik{background:var(--crit-bg);color:var(--fg)}.badge.bilgi{background:var(--info-bg);color:var(--fg)}
.ic{font-weight:700}.iyi .ic{color:var(--good)}.uyari .ic{color:#b07800}.kritik .ic{color:var(--crit)}.bilgi .ic{color:var(--muted)}
@media (prefers-color-scheme:dark){.uyari .ic{color:var(--warn)}}
.health{font-size:.85rem;padding:6px 12px}
.daha{margin-top:8px}.daha summary{cursor:pointer;font-size:.84rem;color:var(--accent);font-weight:600;padding:4px 0}.daha .att{margin-top:8px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.kpis.mini{grid-template-columns:repeat(auto-fit,minmax(110px,1fr));margin-bottom:12px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:grid;gap:4px;align-content:start;min-width:0}
.kpis.mini .kpi{background:var(--sunk);border:0}
.kpi-l{font:600 .72rem/1.2 var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.kpi-v{font-size:1.45rem;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.15}.kpi-s{font-size:.8rem;color:var(--muted)}
.bar{position:relative;height:6px;background:var(--sunk);border-radius:99px;overflow:hidden;min-width:60px}.bar span{display:block;height:100%;background:var(--accent);border-radius:99px}
.bar.big{height:12px;overflow:visible}.bar.big span{border-radius:99px}.bar i{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--line);border-radius:1px}
.bar.iyi span{background:var(--good)}.bar.uyari span{background:var(--warn)}.bar.kritik span{background:var(--crit)}
.tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--line)}
.tab{font:600 .86rem/1 var(--sans);color:var(--muted);background:none;border:0;border-bottom:2px solid transparent;padding:10px 12px;cursor:pointer;margin-bottom:-1px}
.tab[aria-selected=true]{color:var(--fg);border-bottom-color:var(--accent)}.tab:focus-visible,.chip:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
.panel{display:grid;gap:18px}.panel[hidden]{display:none}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px}.grid2.tight{gap:14px}
@media (max-width:420px){.grid2{grid-template-columns:1fr}}
.steps{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.step{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--sunk)}
.step.now{border-color:var(--accent);background:var(--accent-soft)}.step-n{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font:700 .78rem/1 var(--mono);background:var(--surface);border:1px solid var(--line)}
.step.now .step-n{background:var(--accent);color:var(--surface);border-color:var(--accent)}.step.done .step-n{background:var(--good);color:#fff;border-color:var(--good)}
.step-b{display:grid;gap:5px;min-width:0}.step-b b{font-size:.86rem}
.rows{display:grid;gap:10px}.row{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(60px,1fr) auto;gap:10px;align-items:center}
details.faz summary{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;cursor:pointer;list-style:none}
details.faz summary::-webkit-details-marker{display:none}.faz-bar{display:flex;gap:8px;align-items:center;min-width:200px}.faz-bar .bar{flex:1}
.tasks{list-style:none;padding:0;margin-top:12px;gap:2px}.tasks li{display:grid;grid-template-columns:20px 1fr;gap:8px;padding:6px 8px;border-radius:6px}
.tasks li.ok{color:var(--muted)}.tasks li.active{background:var(--accent-soft)}
.chk{width:16px;height:16px;border:1.5px solid var(--line);border-radius:4px;display:grid;place-items:center;font-size:.7rem;margin-top:2px}
.tasks li.ok .chk{background:var(--good);border-color:var(--good);color:#fff}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.86rem}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:0}
th{font:600 .7rem/1.2 var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap}
.tag{font:600 .72rem/1 var(--mono);padding:3px 6px;border-radius:5px;background:var(--sunk);white-space:nowrap}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.chip{font:600 .78rem/1 var(--sans);padding:7px 10px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--fg);cursor:pointer}
.chip.on{background:var(--accent);border-color:var(--accent);color:var(--surface)}
.feed{list-style:none;padding:0;gap:0}.feed-i{display:grid;grid-template-columns:64px 1fr;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)}.feed-i:last-child{border-bottom:0}
.ft{font:600 .68rem/1 var(--mono);text-transform:uppercase;letter-spacing:.05em;padding:4px 6px;border-radius:5px;background:var(--sunk);text-align:center;align-self:start}
.t-karar .ft{background:var(--accent-soft);color:var(--accent)}.t-kurul .ft{background:var(--warn-bg)}.t-bakim .ft{background:var(--good-bg)}
.members{list-style:none;padding:0;gap:8px}.members li{display:grid;gap:2px;padding:8px 10px;border-radius:8px;background:var(--sunk)}
.dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0}.dl dt{color:var(--muted);font-size:.84rem}.dl dd{margin:0}
.links a{margin-right:8px}
.spark{display:grid;grid-template-columns:repeat(14,1fr);gap:4px;height:90px;align-items:end;padding-top:8px;border-bottom:1px solid var(--line)}
.sb{height:100%;display:flex;align-items:flex-end;cursor:default;position:relative}.sb span{display:block;width:100%;background:var(--accent);border-radius:4px 4px 0 0}
.sb:hover span{filter:brightness(1.15)}.spark-x{display:flex;justify-content:space-between;margin-top:4px}
#tip{position:fixed;pointer-events:none;background:var(--fg);color:var(--bg);font-size:.78rem;padding:5px 8px;border-radius:6px;opacity:0;transition:opacity .1s;z-index:10}
.tablo-gor{margin-top:10px}.empty{color:var(--muted);font-size:.88rem}
.lim{display:grid;gap:8px;padding:12px;border-radius:10px;background:var(--sunk)}.lim-h{display:flex;justify-content:space-between;align-items:center}
footer{color:var(--muted);font-size:.78rem;padding-top:8px}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
</style></head><body><div class="wrap">

<header class="top">
  <div><h1>${e(d.proje)}</h1></div>
  <div class="meta">
    ${rozet(saglik, saglik === 'iyi' ? 'Yolunda' : saglik === 'uyari' ? 'Dikkat gerekiyor' : 'Engel var').replace('class="badge', 'class="badge health')}
    ${d.kit ? `<span class="pill">${e(d.kit.type)}${d.kit.addons?.length ? ' + ' + e(d.kit.addons.join(', ')) : ''}</span><span class="pill">kit ${e(d.kit.version)}</span>` : '<span class="pill">kit kurulmadı</span>'}
    ${git?.dal ? `<span class="pill">⎇ ${e(git.dal)}</span>` : ''}
    <label class="refresh"><input type="checkbox" id="oto" checked> 30 sn'de yenile</label>
  </div>
</header>

<div class="hero">
  <section class="card" aria-labelledby="simdi">
    <div class="now-l" id="simdi">Şimdi</div>
    <div class="now-v">${e(a['Aktif faz'] ?? '-')} · ${md(a['Aktif görev'] ?? '-')}</div>
    <div class="now-grid">
      <div><div class="now-l">Soru modu</div><div>${e(a['Soru modu'] ?? '-')}</div></div>
      <div><div class="now-l">Son güncelleme</div><div class="num">${e(a['Son güncelleme'] ?? '-')}</div></div>
      ${/başlangıç/i.test(a['Aktif faz'] ?? '') ? `<div><div class="now-l">Başlangıç adımı</div><div class="num">${e(a['Başlangıç adımı'] ?? '-')}</div></div>` : ''}
    </div>
    <div class="next"><div class="now-l">Sıradaki adım</div><div>${md(siradaki)}</div></div>
    ${d.durum ? `<div class="now-l" style="margin-top:14px">Durum</div><p style="margin-top:4px">${md(d.durum)}</p>` : ''}
    ${d.sonOturum.length ? `<div class="now-l" style="margin-top:10px">Son oturumda</div><ul style="margin-top:4px">${d.sonOturum.slice(0, 4).map((x) => `<li>${md(x)}</li>`).join('')}</ul>` : ''}
  </section>
  <section class="card" aria-labelledby="dikkat">
    <h3 id="dikkat">Dikkat gerektirenler <span class="muted small">(${dikkat.length})</span></h3>
    ${dikkat.length ? `<ul class="att">${dikkat.slice(0, 6).map(dikkatSatiri).join('')}</ul>${dikkat.length > 6 ? `<details class="daha"><summary>${dikkat.length - 6} madde daha</summary><ul class="att">${dikkat.slice(6).map(dikkatSatiri).join('')}</ul></details>` : ''}` : `<p>${rozet('iyi', 'Her şey yolunda')} Bekleyen karar, kritik bulgu veya açık sorun yok.</p>`}
  </section>
</div>

<div class="kpis">
  ${kutu('Görevler', `${d.gorev.bitti}/${d.gorev.toplam}`, `%${yuzde(d.gorev.bitti, d.gorev.toplam)} tamam`, cubuk(d.gorev.bitti, d.gorev.toplam))}
  ${kabul.toplam ? kutu('Kabul testleri', `${kabul.gecen}/${kabul.toplam}`, `${kabul.testli} kriterin testi var`, cubuk(kabul.gecen, kabul.toplam, 'iyi')) : kutu('MVP kriterleri', `${mvpKriter.bitti}/${mvpKriter.toplam}`, `${mvp.length} özellik`, cubuk(mvpKriter.bitti, mvpKriter.toplam))}
  ${kutu('Kararlar', d.kararlar.length, `${d.kararlar.length - otomatikKarar} kullanıcı · ${otomatikKarar} otomatik`)}
  ${kutu('Kurul', d.kurul.toplantilar.length, retSayisi ? `${retSayisi} RET` : `${d.kurul.uyeler.length} üye`)}
  ${kutu('Commit · 7 gün', git ? son7 : '-', git ? `${git.degisen.length} dosya bekliyor` : 'git yok')}
  ${kutu('Limit', limit?.five_hour ? `%${Math.round(limit.five_hour.yuzde)}` : '-', limit?.seven_day ? `haftalık %${Math.round(limit.seven_day.yuzde)} · ${lsev}` : 'bilinmiyor', limit?.five_hour ? cubuk(Math.round(limit.five_hour.yuzde), 100, limitSev(limit.five_hour.yuzde, 'five_hour')) : '')}
</div>

<nav class="tabs" role="tablist" aria-label="Bölümler">
${SEKMELER.map(([id, ad], i) => `<button class="tab" role="tab" id="t-${id}" aria-controls="p-${id}" aria-selected="${i === 0}" data-id="${id}">${ad}</button>`).join('')}
</nav>
${SEKMELER.map(([id, , icerik], i) => `<div class="panel" role="tabpanel" id="p-${id}" aria-labelledby="t-${id}" ${i ? 'hidden' : ''}>${icerik}</div>`).join('\n')}

<footer>Üretildi: ${new Date().toLocaleString('tr-TR')} · Kaynak: docs/*.md, git, .claude/state/usage.json · Her Claude cevabından sonra otomatik güncellenir (<code>node .claude/hooks/dashboard.mjs</code>)</footer>
</div>
<div id="tip" role="tooltip"></div>
<style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}</style>
<script>
(function () {
  var tabs = document.querySelectorAll('.tab');
  function goster(id) {
    tabs.forEach(function (t) {
      var on = t.dataset.id === id;
      t.setAttribute('aria-selected', on);
      document.getElementById('p-' + t.dataset.id).hidden = !on;
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { goster(t.dataset.id); history.replaceState(null, '', '#' + t.dataset.id); });
    t.addEventListener('keydown', function (ev) {
      var j = ev.key === 'ArrowRight' ? i + 1 : ev.key === 'ArrowLeft' ? i - 1 : -1;
      if (j < 0) return;
      var n = tabs[(j + tabs.length) % tabs.length]; n.focus(); n.click();
    });
  });
  function hashten() { var h = location.hash.slice(1); if (h && document.getElementById('p-' + h)) goster(h); }
  hashten();
  window.addEventListener('hashchange', hashten);

  document.querySelectorAll('.filters .chip').forEach(function (c) {
    c.addEventListener('click', function () {
      document.querySelectorAll('.filters .chip').forEach(function (x) { x.classList.toggle('on', x === c); });
      var k = c.dataset.k;
      document.querySelectorAll('#kararlar tbody tr').forEach(function (r) {
        r.hidden = !(k === 'hepsi' || r.dataset.k === k || (k === 'otomatik' && r.dataset.v === 'otomatik') || (k === 'tek' && r.dataset.kapi === 'tek'));
      });
    });
  });

  var tip = document.getElementById('tip');
  document.querySelectorAll('[data-tip]').forEach(function (el) {
    el.addEventListener('mousemove', function (ev) { tip.textContent = el.dataset.tip; tip.style.opacity = 1; tip.style.left = ev.clientX + 12 + 'px'; tip.style.top = ev.clientY - 30 + 'px'; });
    el.addEventListener('mouseleave', function () { tip.style.opacity = 0; });
  });

  var oto = document.getElementById('oto'), zaman;
  try { oto.checked = localStorage.getItem('durum-oto') !== '0'; } catch (er) {}
  function kur() { clearTimeout(zaman); if (oto.checked) zaman = setTimeout(function () { location.reload(); }, 30000); }
  oto.addEventListener('change', function () { try { localStorage.setItem('durum-oto', oto.checked ? '1' : '0'); } catch (er) {} kur(); });
  kur();
})();
</script>
</body></html>
`;

fs.writeFileSync(dosya('dashboard.html'), html);
if (!sessiz) console.log(`dashboard.html güncellendi · ${d.gorev.bitti}/${d.gorev.toplam} görev · ${d.kararlar.length} karar · ${dikkat.length} dikkat`);
