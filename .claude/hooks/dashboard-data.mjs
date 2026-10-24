// dashboard.html için ek veri kaynakları (test edilebilir saf fonksiyonlar + küçük okuyucular).
// Kabul testleri, hesap son tarihleri, bayraklar, birim ekonomisi, geri bildirim, metrikler, GitHub durumu.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { oku, bolumler, tabloSatirlari, etiketler } from './status-read.mjs';

const GUN = 864e5;
const tarihMi = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim());
export const kalanGun = (tarih, simdi = Date.now()) => Math.ceil((Date.parse(`${tarih}T00:00:00`) - simdi) / GUN);

// ---------- kabul testleri ----------
// Kriter kimliği PRD'de "Ö-01.1", testlerde "Ö-01.1" veya "O_01_1" olabilir; hepsi "O_01_1" anahtarına normalize edilir.
const KIMLIK = /[ÖO][-_](\d{2})[._](\d+)/g;
const anahtar = (m1, m2) => `O_${m1}_${m2}`;

export function prdKriterleri(prdMetni) {
  return [...prdMetni.matchAll(/^\s*- \[( |x)\]\s*(Ö-(\d{2})\.(\d+))\s*:?\s*(.*)$/gim)]
    .filter((m) => !m[5].startsWith('['))
    .map((m) => ({ id: m[2], anahtar: anahtar(m[3], m[4]), metin: m[5].trim(), isaretli: m[1].toLowerCase() === 'x' }));
}

const ATLA = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.venv', 'venv', 'coverage', '.expo', 'kit', '.previews', '__pycache__', '.claude']);
const TEST_DOSYASI = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^test_.*\.py$)|(_test\.py$)|(\.maestro[\\/].*\.ya?ml$)/;

export function testteGecenKimlikler(kok) {
  const bulunan = new Set();
  let sayac = 0;
  (function gez(dir, derinlik) {
    if (derinlik > 6 || sayac > 3000) return;
    let girdiler = [];
    try { girdiler = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of girdiler) {
      if (ATLA.has(e.name)) continue;
      const tam = path.join(dir, e.name);
      if (e.isDirectory()) gez(tam, derinlik + 1);
      else if (TEST_DOSYASI.test(path.relative(kok, tam)) || TEST_DOSYASI.test(e.name)) {
        sayac++;
        for (const m of oku(tam).matchAll(KIMLIK)) bulunan.add(anahtar(m[1], m[2]));
      }
    }
  })(kok, 0);
  return bulunan;
}

export function junitSonuclari(xmlMetinleri) {
  const sonuc = new Map();
  for (const xml of xmlMetinleri) {
    for (const m of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const ad = (m[1].match(/\bname="([^"]*)"/)?.[1] ?? '') + ' ' + (m[1].match(/\bclassname="([^"]*)"/)?.[1] ?? '');
      const govde = m[2] ?? '';
      if (/<skipped/.test(govde)) continue;
      const kaldi = /<(failure|error)\b/.test(govde);
      for (const k of ad.matchAll(KIMLIK)) {
        const a = anahtar(k[1], k[2]);
        sonuc.set(a, kaldi || sonuc.get(a) === 'kaldi' ? 'kaldi' : 'gecti');
      }
    }
  }
  return sonuc;
}

function junitDosyalari(kok) {
  const adaylar = [];
  for (const dir of ['test-results', 'reports', '.']) {
    try {
      for (const f of fs.readdirSync(path.join(kok, dir))) if (/junit.*\.xml$|\.junit\.xml$|^TEST-.*\.xml$/i.test(f)) adaylar.push(path.join(kok, dir, f));
    } catch { /* klasör yok */ }
  }
  return adaylar.map((f) => ({ metin: oku(f), zaman: fs.statSync(f).mtimeMs }));
}

export function kabulDurumu(kok) {
  const kriterler = prdKriterleri(oku(path.join(kok, 'docs/product/prd.md')));
  const testli = testteGecenKimlikler(kok);
  const raporlar = junitDosyalari(kok);
  const sonuclar = junitSonuclari(raporlar.map((r) => r.metin));
  const liste = kriterler.map((k) => ({ ...k, test: testli.has(k.anahtar) || sonuclar.has(k.anahtar), sonuc: sonuclar.get(k.anahtar) ?? null }));
  return {
    liste,
    raporZamani: raporlar.length ? Math.max(...raporlar.map((r) => r.zaman)) : null,
    toplam: liste.length,
    testli: liste.filter((k) => k.test).length,
    gecen: liste.filter((k) => k.sonuc === 'gecti').length,
    uyumsuz: liste.filter((k) => k.isaretli && k.sonuc !== 'gecti'),
  };
}

// ---------- hesaplar ve bayraklar ----------
export function hesaplar(metin, simdi = Date.now()) {
  return tabloSatirlari(bolumler(metin)['Hesaplar'], 8)
    .filter(([servis]) => servis && !servis.startsWith('['))
    .map(([servis, amac, sahip, ikiFa, plan, bitis, anahtarYenileme]) => {
      const tarihler = [['bitiş', bitis], ['anahtar yenileme', anahtarYenileme]].filter(([, t]) => tarihMi(t))
        .map(([tur, t]) => ({ tur, tarih: t, kalan: kalanGun(t, simdi) }));
      return { servis, amac, sahip, ikiFa, plan, tarihler, ikiFaYok: /^(hayır|yok|no)$/i.test(ikiFa) };
    });
}

// Dev/prod ayrımı ve RLS saldırgan testi: prod ref'i AI'nın MCP ayarında olmamalı; Supabase varsa RLS testi olmalı
export function ortamUyarilari(kok) {
  const u = [];
  const prodRef = tabloSatirlari(bolumler(oku(path.join(kok, 'docs/operations/accounts.md')))['Ortamlar (dev / prod)'], 4)
    .find(([ortam, , ref]) => ortam === 'prod' && ref && !ref.startsWith('['))?.[2];
  if (prodRef && oku(path.join(kok, '.mcp.json')).includes(prodRef)) {
    u.push({ sev: 'kritik', metin: `Prod projesinin ref'i (${prodRef}) .mcp.json'da: AI prod'a bağlanabiliyor.`, eylem: '.mcp.json → dev ref (docs/operations/accounts.md → Ortamlar)' });
  }
  if (fs.existsSync(path.join(kok, 'supabase/config.toml')) && !fs.existsSync(path.join(kok, 'tests/security/rls.mjs'))) {
    u.push({ sev: 'uyari', metin: 'Supabase kullanılıyor ama RLS saldırgan testi yok (tests/security/rls.mjs).', eylem: '/kit-update ile şablonu al, tabloları TABLOLAR\'a ekle' });
  }
  return u;
}

export function bayraklar(metin, simdi = Date.now()) {
  return tabloSatirlari(bolumler(metin)['Bayraklar'], 7).filter(([ad]) => ad)
    .map(([ad, amac, durum, sahip, eklendi, kaldirma, kapatmaTest]) => ({
      ad, amac, durum, sahip, eklendi, kaldirma, kapatmaTest,
      gecikti: tarihMi(kaldirma) && kalanGun(kaldirma, simdi) < 0,
      testsiz: !/^(evet|✅|var)/i.test(kapatmaTest ?? ''),
    }));
}

// ---------- birim ekonomisi ----------
export function birimEkonomisi(metin) {
  const e = etiketler(metin);
  const s = (k) => { const v = parseFloat(String(e[k] ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
  const fiyat = s('Fiyat (kullanıcı başı aylık)');
  const komisyon = s('Ödeme komisyonu (%)');
  const sabit = s('Sabit aylık maliyet');
  const degisken = s('Kullanıcı başı değişken maliyet (aylık)');
  const hedef = s('Hedef aktif kullanıcı');
  const ucretsiz = Math.min(99, s('Ücretsiz kullanıcı oranı (%)'));
  if (!fiyat && !sabit && !degisken) return null;
  const katki = fiyat * (1 - komisyon / 100) - degisken;
  // Her ödeyen kullanıcı, ücretsiz kullanıcıların değişken maliyetini de taşır
  const ucretsizPayi = (ucretsiz / (100 - ucretsiz)) * degisken;
  const etkinKatki = katki - ucretsizPayi;
  const odeyen = hedef * (1 - ucretsiz / 100);
  const gelir = odeyen * fiyat * (1 - komisyon / 100);
  const maliyet = sabit + hedef * degisken;
  return {
    paraBirimi: e['Para birimi'] || '',
    fiyat, katki, etkinKatki,
    basaBas: etkinKatki > 0 ? Math.ceil(sabit / etkinKatki) : null,
    hedef, gelir, maliyet, kar: gelir - maliyet,
    degiskenOrani: fiyat ? (degisken / fiyat) * 100 : null,
  };
}

// ---------- geri bildirim ve metrikler ----------
export function geriBildirim(metin) {
  const b = bolumler(metin);
  const kayitlar = tabloSatirlari(b['Gelen kutusu'], 9).map(([no, tarih, kaynak, kullanici, ozet, tur, tema, oncelik, durum]) => ({ no, tarih, ozet, tur, tema, oncelik, durum }));
  const temalar = tabloSatirlari(b['Temalar'], 3).map(([tema, sayi, ozellik, karar]) => ({ tema, sayi: parseInt(sayi, 10) || 0, ozellik, karar }))
    .sort((x, y) => y.sayi - x.sayi);
  return { kayitlar, temalar, yeni: kayitlar.filter((k) => /yeni/i.test(k.durum)).length };
}

export function metrikler(metin) {
  return tabloSatirlari(bolumler(metin)['Kayıtlar'], 9)
    .map(([donem, gorev, sure, limit, duzeltme, geriAlma, kopya, kritik, kabul]) => ({ donem, gorev, sure, limit, duzeltme, geriAlma, kopya, kritik, kabul }));
}

// ---------- bulgu raporları ----------
export const BULGU_TURLERI = { tech: 'Teknik', business: 'İş', security: 'Güvenlik', ux: 'UX', perf: 'Performans', legal: 'Hukuk' };
export function bulguRaporlari(metin) {
  const sayi = (x) => { const n = parseInt(String(x ?? '').trim().replace(/^[^\d-]+/, ''), 10); return Number.isFinite(n) ? n : null; };
  const satirlar = tabloSatirlari(bolumler(metin)['Raporlar'], 7)
    .map(([tarih, tur, saglik, onceki, bulgu, kritik, rapor]) => ({
      tarih, tur: tur.toLowerCase(), saglik: sayi(saglik), onceki: sayi(onceki), bulgu: sayi(bulgu), kritik: sayi(kritik) ?? 0, rapor,
    }))
    .filter((r) => r.tarih && r.saglik != null);
  const son = {};
  for (const r of satirlar) if (!son[r.tur] || r.tarih >= son[r.tur].tarih) son[r.tur] = r;
  return { satirlar, son };
}

// ---------- Üretilen varlıklar: marka paketi (logo-design), tanıtım videoları (motion-video), araştırma notları (source-research) ----------
export function uretimVarliklari(kok) {
  const liste = (k) => { try { return fs.readdirSync(path.join(kok, k), { withFileTypes: true }); } catch { return []; } };
  const markaKlasor = ['public/brand', 'assets/brand'].find((k) => liste(k).length) ?? null;
  const marka = markaKlasor ? liste(markaKlasor).filter((f) => f.isFile()).map((f) => f.name).sort() : [];
  const videolar = liste('marketing/motion').filter((f) => f.isDirectory()).map((f) => {
    const k = `marketing/motion/${f.name}`;
    const mp4 = [`${k}/out`, k].flatMap((d) => liste(d).filter((x) => x.isFile() && x.name.endsWith('.mp4')).map((x) => `${d}/${x.name}`))[0] ?? null;
    return { ad: f.name, mp4 };
  });
  const arastirma = liste('docs/research')
    .filter((f) => f.isFile() && f.name.endsWith('.md') && f.name !== 'README.md')
    .map((f) => {
      const dosya = `docs/research/${f.name}`;
      const baslik = oku(path.join(kok, dosya)).match(/^#\s+(.+)$/m)?.[1] ?? f.name.replace(/\.md$/, '');
      return { dosya, baslik };
    })
    .sort((x, y) => y.dosya.localeCompare(x.dosya));
  let kodHaritasiGun = null;
  try { kodHaritasiGun = Math.floor((Date.now() - fs.statSync(path.join(kok, '.ua/knowledge-graph.json')).mtimeMs) / 864e5); } catch {}
  return { markaKlasor, marka, markaRehberi: fs.existsSync(path.join(kok, 'docs/design/brand.md')), videolar, arastirma, kodHaritasiGun };
}

// ---------- Harcama alarmları (docs/operations/spend-alarms.md) ----------
export function harcamaAlarmlari(metin, simdi = Date.now()) {
  return tabloSatirlari(bolumler(metin)['Alarmlar'], 6).filter(([servis]) => servis)
    .map(([servis, tur, tutar, esikler, nereden, kontrol]) => ({
      servis, tur, tutar, esikler, nereden, kontrol,
      ayarsiz: !/\d/.test(tutar ?? ''),
      eski: tarihMi(kontrol) ? kalanGun(kontrol, simdi) < -35 : true,
    }));
}

// ---------- Konsey tutanakları (docs/workflow/council/*.md; council.mjs ve board-chair yazar) ----------
export function konseyTutanaklari(kok) {
  const klasor = path.join(kok, 'docs', 'workflow', 'council');
  let dosyalar = [];
  try { dosyalar = fs.readdirSync(klasor).filter((f) => f.endsWith('.md') && f !== 'README.md'); } catch { return []; }
  return dosyalar.map((f) => {
    const metin = oku(path.join(klasor, f));
    const a = {};
    for (const [, k, v] of metin.matchAll(/\*\*([^*:]+):\*\*\s*([^·\n]*)/g)) a[k.trim()] ??= v.trim();
    const siralama = tabloSatirlari(bolumler(metin)['3. Toplu sıralama'], 3).filter(([g]) => /^[A-Z]$/.test(g));
    const kimlik = Object.fromEntries([...(bolumler(metin)['Kimlikler'] ?? '').matchAll(/([A-Z])\s*=\s*([^·\n]+)/g)].map((m) => [m[1], m[2].trim()]));
    return {
      dosya: `docs/workflow/council/${f}`,
      konu: metin.match(/^#\s+Konsey:\s*(.+)$/m)?.[1] ?? f.replace(/\.md$/, ''),
      tarih: a['Tarih'] ?? f.slice(0, 10),
      tur: a['Tür'] ?? '-',
      karar: a['Karar'] || a['Öneri'] || null,
      uzlasma: a['Uzlaşma']?.match(/\d+/) ? Number(a['Uzlaşma'].match(/\d+/)[0]) : null,
      tartismali: Number(a['Tartışmalı'] ?? 0) || 0,
      elenen: Number(a['Elenen'] ?? 0) || 0,
      siralama: siralama.map(([g, ort]) => ({ gorus: g, kim: kimlik[g] ?? null, ortalama: ort })),
    };
  }).sort((x, y) => y.tarih.localeCompare(x.tarih) || y.dosya.localeCompare(x.dosya));
}

// ---------- Token ve maliyet (ccusage; cost.mjs yazar) ----------
// Claude Code transcript klasör adı: proje yolundaki harf/rakam dışı her karakter "-" olur
export const ccusageProjeAdi = (kok) => path.resolve(kok).replace(/[^a-zA-Z0-9]/g, '-');
export function maliyetOzeti(veri) {
  const gunler = Object.values(veri?.projects ?? {}).flat().concat(veri?.daily ?? [])
    .map((g) => ({ tarih: g.date ?? g.period, token: g.totalTokens ?? 0, maliyet: g.totalCost ?? 0, cikti: g.outputTokens ?? 0 }))
    .filter((g) => g.tarih)
    .sort((a, b) => a.tarih.localeCompare(b.tarih));
  const toplam = gunler.reduce((t, g) => ({ token: t.token + g.token, maliyet: t.maliyet + g.maliyet }), { token: 0, maliyet: 0 });
  return { gunler, toplam };
}

// ---------- GitHub (gh varsa, 5 dk önbellek) ----------
export function ghDurumu(kok, simdi = Date.now()) {
  const dosya = path.join(kok, '.claude', 'state', 'github-cache.json');
  try {
    const o = JSON.parse(fs.readFileSync(dosya, 'utf8'));
    if (simdi - o.zaman < 5 * 60e3) return o.veri;
  } catch { /* önbellek yok */ }
  const gh = (...a) => JSON.parse(execFileSync('gh', a, { cwd: kok, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }));
  let veri = null;
  try {
    veri = {
      calismalar: gh('run', 'list', '--limit', '8', '--json', 'workflowName,conclusion,status,headBranch,createdAt,url'),
      prlar: gh('pr', 'list', '--limit', '10', '--json', 'number,title,isDraft,url,headRefName'),
      canliIzleme: gh('issue', 'list', '--label', 'live-monitoring', '--state', 'open', '--json', 'number,title,url'),
    };
  } catch {
    veri = null; // gh yok, giriş yapılmamış veya uzak depo yok
  }
  try { fs.mkdirSync(path.dirname(dosya), { recursive: true }); fs.writeFileSync(dosya, JSON.stringify({ zaman: simdi, veri })); } catch { /* sessiz */ }
  return veri;
}

export function baglamOku(kok) {
  try { return JSON.parse(fs.readFileSync(path.join(kok, '.claude', 'state', 'context.json'), 'utf8')); } catch { return null; }
}
