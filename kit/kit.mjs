#!/usr/bin/env node
// Vibe Coding Kit: kurulum ve güncelleme.
//   node kit/kit.mjs kur --tip web-saas [--ekler ai] [--kit-tut]
//       Template'ten açılmış projede tipi ve ekleri yerleştirir, sonra kit/ klasörünü siler. /baslat çalıştırır.
//   node <kit-klonu>/kit/kit.mjs guncelle --proje <yol> [--ekler ai]
//       Projeyi kitin bu sürümüne çeker. /kit-guncelle çalıştırır.
//
// Katmanlar: repo kökü (ortak) -> kit/sablon/<tip> -> kit/sablon/ekler/<ek>; sonraki öncekini ezer.
// Özel dosyalar: "x.ekle" -> projedeki x'in sonuna eklenir; "x.birlestir.json" -> x JSON'u ile birleştirilir.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const KIT = path.dirname(fileURLToPath(import.meta.url));
const KOK = path.dirname(KIT);
const SABLON = path.join(KIT, 'sablon');
const SURUM = fs.readFileSync(path.join(KIT, 'SURUM'), 'utf8').trim();
const KAYNAK = fs.readFileSync(path.join(KIT, 'KAYNAK'), 'utf8').trim();
const TIPLER = fs.readdirSync(SABLON).filter((d) => d !== 'ekler');
const EKLER = fs.readdirSync(path.join(SABLON, 'ekler'));
// Ortak katmana dahil olmayan kök girdileri
const ORTAK_HARIC = new Set(['.git', 'kit', 'node_modules', '.kit.json', 'README.md', 'DURUM.html', '.onizleme']);

// Kitin sahiplendiği dosyalar: güncellemede kullanıcı değiştirmediyse yenisiyle değişir.
// Diğerleri projeye aittir (CLAUDE.md, PRD, STACK, settings.json...); güncelleme sadece eksikse ekler.
const KIT_DOSYASI = [
  /^\.claude\/(commands|agents|hooks)\//,
  /^docs\/(GUVENLIK|CANLIYA-ALMA|BAKIM|YASAL-KVKK|KARAR-PROTOKOLU|SKILLER)\.md$/,
];
const kitDosyasi = (rel) => KIT_DOSYASI.some((re) => re.test(rel));

const oku = (p) => fs.readFileSync(p, 'utf8');
// Satır sonu farkı (CRLF/LF) değişiklik sayılmasın
const hash = (p) => crypto.createHash('sha256').update(oku(p).replace(/\r\n/g, '\n')).digest('hex');

function dosyalar(kok, haric = new Set()) {
  const sonuc = [];
  (function gez(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!rel && haric.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) gez(path.join(dir, e.name), r);
      else sonuc.push(r);
    }
  })(kok, '');
  return sonuc;
}

// kopyalar: hedef göreli yol -> kaynak dosya. parcalar: ekle/birlestir işlemleri (sırayla uygulanır).
function katmanlar(ortakKok, adlar) {
  const kopyalar = new Map();
  const parcalar = [];
  if (ortakKok) for (const rel of dosyalar(ortakKok, ORTAK_HARIC)) kopyalar.set(rel, path.join(ortakKok, rel));
  for (const ad of adlar) {
    const kok = path.join(SABLON, ad);
    if (!fs.existsSync(kok)) throw new Error(`Şablon katmanı yok: ${ad}`);
    for (const rel of dosyalar(kok)) {
      const kaynak = path.join(kok, rel);
      if (rel.endsWith('.ekle')) parcalar.push({ tur: 'ekle', hedef: rel.slice(0, -5), kaynak, katman: ad });
      else if (rel.endsWith('.birlestir.json')) parcalar.push({ tur: 'birlestir', hedef: rel.replace(/\.birlestir\.json$/, '.json'), kaynak, katman: ad });
      else kopyalar.set(rel, kaynak);
    }
  }
  return { kopyalar, parcalar };
}

function kopyala(kaynak, hedef) {
  fs.mkdirSync(path.dirname(hedef), { recursive: true });
  fs.copyFileSync(kaynak, hedef);
}

export function birlestir(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    const var_ = new Set(a.map((x) => JSON.stringify(x)));
    return [...a, ...b.filter((x) => !var_.has(JSON.stringify(x)))];
  }
  const nesne = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (nesne(a) && nesne(b)) {
    const r = { ...a };
    for (const [k, v] of Object.entries(b)) r[k] = k in a ? birlestir(a[k], v) : v;
    return r;
  }
  return b;
}

function parcaUygula(proje, { tur, hedef, kaynak }) {
  const yol = path.join(proje, hedef);
  if (tur === 'birlestir') {
    const mevcut = fs.existsSync(yol) ? JSON.parse(oku(yol)) : {};
    fs.mkdirSync(path.dirname(yol), { recursive: true });
    fs.writeFileSync(yol, JSON.stringify(birlestir(mevcut, JSON.parse(oku(kaynak))), null, 2) + '\n');
    return;
  }
  const parca = oku(kaynak);
  const mevcut = fs.existsSync(yol) ? oku(yol) : '';
  if (mevcut.includes(parca.split('\n')[0])) return; // daha önce eklenmiş
  fs.appendFileSync(yol, (mevcut && !mevcut.endsWith('\n') ? '\n' : '') + (mevcut ? '\n' : '') + parca);
}

function kayitYaz(proje, veri) {
  fs.writeFileSync(path.join(proje, '.kit.json'), JSON.stringify(veri, null, 2) + '\n');
}

function dogrula(tip, ekler) {
  if (!TIPLER.includes(tip)) throw new Error(`Geçersiz tip: ${tip}. Seçenekler: ${TIPLER.join(', ')}`);
  for (const e of ekler) if (!EKLER.includes(e)) throw new Error(`Geçersiz ek: ${e}. Seçenekler: ${EKLER.join(', ')}`);
}

function kur({ tip, ekler, kitTut }) {
  dogrula(tip, ekler);
  if (fs.existsSync(path.join(KOK, '.kit.json'))) throw new Error('Kit bu projede zaten kurulu (.kit.json var).');

  const { kopyalar, parcalar } = katmanlar(null, [tip, ...ekler.map((e) => `ekler/${e}`)]);
  for (const [rel, kaynak] of kopyalar) kopyala(kaynak, path.join(KOK, rel));
  for (const p of parcalar) parcaUygula(KOK, p);
  kopyala(path.join(KIT, 'proje', 'README.md'), path.join(KOK, 'README.md'));

  const izlenen = new Set([...dosyalar(KOK, ORTAK_HARIC), ...kopyalar.keys()]);
  const kayit = {};
  for (const rel of [...izlenen].sort()) if (fs.existsSync(path.join(KOK, rel))) kayit[rel] = hash(path.join(KOK, rel));
  const bugun = new Date().toISOString().slice(0, 10);
  kayitYaz(KOK, { surum: SURUM, kaynak: KAYNAK, tip, ekler, olusturma: bugun, guncelleme: bugun, dosyalar: kayit });

  console.log(`Kuruldu: ${tip}${ekler.length ? ' + ' + ekler.join(', ') : ''} (kit ${SURUM})`);
  console.log(`Eklenen/değişen dosya: ${kopyalar.size + parcalar.length + 1}`);
  if (!kitTut) {
    fs.rmSync(KIT, { recursive: true, force: true });
    console.log('kit/ klasörü kaldırıldı. Güncellemeler için: /kit-guncelle');
  }
}

function guncelle({ proje, ekler: yeniEkler }) {
  proje = path.resolve(proje);
  const kayitYolu = path.join(proje, '.kit.json');
  if (!fs.existsSync(kayitYolu)) throw new Error(`.kit.json yok: ${proje} kit ile kurulmamış.`);
  const j = JSON.parse(oku(kayitYolu));
  const eskiEkler = j.ekler ?? [];
  const tumEkler = [...new Set([...eskiEkler, ...yeniEkler])];
  dogrula(j.tip, tumEkler);
  const kayit = { ...j.dosyalar };

  const { kopyalar, parcalar } = katmanlar(KOK, [j.tip, ...tumEkler.map((e) => `ekler/${e}`)]);
  const rapor = { eklenen: [], guncellenen: [], cakisan: [], kaldirilan: [] };

  for (const [rel, kaynak] of kopyalar) {
    const hedef = path.join(proje, rel);
    const kh = hash(kaynak);
    if (!fs.existsSync(hedef)) {
      if (rel in kayit) continue; // kullanıcı bilerek silmiş, geri getirme
      kopyala(kaynak, hedef); kayit[rel] = kh; rapor.eklenen.push(rel);
      continue;
    }
    if (!kitDosyasi(rel)) continue;
    const hh = hash(hedef);
    if (hh === kh) { kayit[rel] = kh; continue; }
    if (kayit[rel] === kh) continue; // kit değişmemiş, kullanıcı değiştirmiş
    if (kayit[rel] === hh) { kopyala(kaynak, hedef); kayit[rel] = kh; rapor.guncellenen.push(rel); }
    else { kopyala(kaynak, hedef + '.yeni'); rapor.cakisan.push(rel); } // ikisi de değişmiş: kullanıcınınkine dokunma
  }
  // ekle/birlestir sadece yeni eklenen eklerden (eskiler kurulumda uygulandı; projeye ait dosyalara tekrar dokunma)
  const eklenenEkler = yeniEkler.filter((e) => !eskiEkler.includes(e)).map((e) => `ekler/${e}`);
  for (const p of parcalar) if (eklenenEkler.includes(p.katman)) parcaUygula(proje, p);
  for (const rel of Object.keys(kayit)) if (!kopyalar.has(rel) && kitDosyasi(rel)) rapor.kaldirilan.push(rel);

  kayitYaz(proje, { ...j, surum: SURUM, ekler: tumEkler, guncelleme: new Date().toISOString().slice(0, 10), dosyalar: kayit });

  console.log(`Kit ${j.surum} -> ${SURUM}`);
  const yaz = (baslik, liste) => liste.length && console.log(`${baslik} (${liste.length}):\n  ${liste.join('\n  ')}`);
  yaz('Eklenen', rapor.eklenen);
  yaz('Güncellenen', rapor.guncellenen);
  yaz('Çakışma: senin değişikliğin korundu, yeni hali yanına .yeni olarak kondu. Karşılaştır, birleştir, .yeni dosyasını sil', rapor.cakisan);
  yaz('Kitten kaldırılmış (projede duruyor, istersen sil)', rapor.kaldirilan);
  if (!Object.values(rapor).some((l) => l.length)) console.log('Değişiklik yok.');
  console.log(`Sürüm notları: ${KAYNAK.replace(/\.git$/, '')}/blob/main/kit/CHANGELOG.md ("Elle uyarla" maddelerine bak)`);
}

function argumanlar(argv) {
  const a = { ekler: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--tip') a.tip = argv[++i];
    else if (k === '--proje') a.proje = argv[++i];
    else if (k === '--ekler') a.ekler = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--kit-tut') a.kitTut = true;
    else throw new Error(`Bilinmeyen argüman: ${k}`);
  }
  return a;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [islem, ...geri] = process.argv.slice(2);
  try {
    const a = argumanlar(geri);
    if (islem === 'kur') {
      if (!a.tip) throw new Error(`--tip gerekli: ${TIPLER.join(' | ')}`);
      kur(a);
    } else if (islem === 'guncelle') {
      if (!a.proje) throw new Error('--proje gerekli');
      guncelle(a);
    } else {
      console.log('Kullanım:\n  node kit/kit.mjs kur --tip <tip> [--ekler ai] [--kit-tut]\n  node kit/kit.mjs guncelle --proje <yol> [--ekler ai]');
      process.exit(islem ? 1 : 0);
    }
  } catch (e) {
    console.error('HATA: ' + e.message);
    process.exit(1);
  }
}
