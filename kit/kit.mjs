#!/usr/bin/env node
// Vibe Coding Kit: kurulum ve güncelleme.
//   node kit/kit.mjs install --type web-saas [--addons ai] [--keep-kit]
//       Template'ten açılmış projede tipi ve ekleri yerleştirir, sonra kit/ klasörünü siler. /start çalıştırır.
//   node <kit-klonu>/kit/kit.mjs init [--project <yol>]
//       Kiti ayrı duran bir klasörden projeye kurar (varsayılan: bulunulan klasör). Kit klasörüne dokunmaz.
//       Dolu klasörde mevcut dosyanın üzerine yazmaz: kitin hali yanına .kit-new olarak konur (/adopt birleştirir).
//   node <kit-klonu>/kit/kit.mjs install --type web-saas --project <yol>
//       init ile kurulmuş projeye tipi yerleştirir. /start ve /adopt çalıştırır.
//   node <kit-klonu>/kit/kit.mjs update --project <yol> [--addons ai]
//       Projeyi kitin bu sürümüne çeker. /kit-update çalıştırır.
//
// Katmanlar: repo kökü (ortak) -> kit/templates/<type> -> kit/templates/addons/<addon>; sonraki öncekini ezer.
// Özel dosyalar: "x.append" -> projedeki x'in sonuna eklenir; "x.merge.json" -> x.json ile birleştirilir.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const KIT = path.dirname(fileURLToPath(import.meta.url));
const KOK = path.dirname(KIT);
const SABLON = path.join(KIT, 'templates');
const SURUM = fs.readFileSync(path.join(KIT, 'VERSION'), 'utf8').trim();
const KAYNAK = fs.readFileSync(path.join(KIT, 'SOURCE'), 'utf8').trim();
const TIPLER = fs.readdirSync(SABLON).filter((d) => d !== 'addons');
const EKLER = fs.readdirSync(path.join(SABLON, 'addons'));
// Ortak katmana dahil olmayan kök girdileri (kitin kendisi, üretilen ve geçici dosyalar)
const ORTAK_HARIC = new Set(['.git', 'kit', 'node_modules', '.kit.json', 'README.md', 'dashboard.html', '.previews', 'sandbox']);
// Sadece kit reposunda anlamlı, projeye taşınmayan dosyalar
const SADECE_KIT = ['.github/workflows/kit-tests.yml'];

// Kitin sahiplendiği dosyalar: güncellemede kullanıcı değiştirmediyse yenisiyle değişir.
// Diğerleri projeye aittir (CLAUDE.md, PRD, stack, settings.json...); güncelleme sadece eksikse ekler.
const KIT_DOSYASI = [
  /^\.claude\/(commands|agents|hooks|board|findings|skills)\//,
  /^docs\/(security\/checklist|operations\/(release-checklist|maintenance)|legal\/privacy-kvkk|workflow\/(decision-protocol|skills|usage-limits))\.md$/,
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
      else if (!SADECE_KIT.includes(r)) sonuc.push(r);
    }
  })(kok, '');
  return sonuc;
}

// kopyalar: hedef göreli yol -> kaynak dosya. parcalar: append/merge işlemleri (sırayla uygulanır).
function katmanlar(ortakKok, adlar) {
  const kopyalar = new Map();
  const parcalar = [];
  if (ortakKok) for (const rel of dosyalar(ortakKok, ORTAK_HARIC)) kopyalar.set(rel, path.join(ortakKok, rel));
  for (const ad of adlar) {
    const kok = path.join(SABLON, ad);
    if (!fs.existsSync(kok)) throw new Error(`Şablon katmanı yok: ${ad}`);
    for (const rel of dosyalar(kok)) {
      const kaynak = path.join(kok, rel);
      if (rel.endsWith('.append')) parcalar.push({ tur: 'append', hedef: rel.slice(0, -'.append'.length), kaynak, katman: ad });
      else if (rel.endsWith('.merge.json')) parcalar.push({ tur: 'merge', hedef: rel.replace(/\.merge\.json$/, '.json'), kaynak, katman: ad });
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
  if (tur === 'merge') {
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

// Projenin kendi dosyasını ezme: kitin yeni hali yanına .kit-new olarak gider.
// .gitignore satır satır birleşir, .claude/settings.json derin birleşir (projenin değeri kalır).
function guvenliKopyala(proje, rel, kaynak, cakisan) {
  const hedef = path.join(proje, rel);
  if (!fs.existsSync(hedef)) { kopyala(kaynak, hedef); return; }
  if (hash(hedef) === hash(kaynak)) return;
  if (rel === '.gitignore') {
    for (const satir of oku(kaynak).split(/\r?\n/)) if (satir.trim()) satirEkle(hedef, satir);
    return;
  }
  if (rel === '.claude/settings.json') {
    fs.writeFileSync(hedef, JSON.stringify(birlestir(JSON.parse(oku(kaynak)), JSON.parse(oku(hedef))), null, 2) + '\n');
    return;
  }
  kopyala(kaynak, hedef + '.kit-new');
  cakisan.push(rel);
}

function satirEkle(dosya, satir) {
  const mevcut = fs.existsSync(dosya) ? oku(dosya) : '';
  if (mevcut.split(/\r?\n/).includes(satir)) return;
  fs.appendFileSync(dosya, (mevcut && !mevcut.endsWith('\n') ? '\n' : '') + satir + '\n');
}

function kayitYaz(proje, veri) {
  fs.writeFileSync(path.join(proje, '.kit.json'), JSON.stringify(veri, null, 2) + '\n');
}

function dogrula(tip, ekler) {
  if (!TIPLER.includes(tip)) throw new Error(`Geçersiz tip: ${tip}. Seçenekler: ${TIPLER.join(', ')}`);
  for (const e of ekler) if (!EKLER.includes(e)) throw new Error(`Geçersiz ek: ${e}. Seçenekler: ${EKLER.join(', ')}`);
}

const cakismaRaporu = (cakisan) => cakisan.length && console.log(
  `Mevcut dosyaya dokunulmadı, kitin hali yanına .kit-new olarak kondu (${cakisan.length}):\n  ${cakisan.join('\n  ')}`);

function init({ project }) {
  const proje = path.resolve(project ?? process.cwd());
  if (proje === KOK) throw new Error('Hedef kitin kendi klasörü. Proje klasöründen çalıştır: node <kit>/kit/kit.mjs init');
  if (fs.existsSync(path.join(proje, '.kit.json'))) throw new Error('Kit bu projede zaten kurulu (.kit.json var).');
  fs.mkdirSync(proje, { recursive: true });
  const cakisan = [];
  const { kopyalar } = katmanlar(KOK, []);
  for (const [rel, kaynak] of kopyalar) guvenliKopyala(proje, rel, kaynak, cakisan);
  if (!fs.existsSync(path.join(proje, 'README.md'))) kopyala(path.join(KIT, 'project', 'README.md'), path.join(proje, 'README.md'));

  // Kit proje klasörünün içindeyse git'e girmesin
  const kitRel = path.relative(proje, KOK).replace(/\\/g, '/');
  const iceride = !kitRel.startsWith('..') && !path.isAbsolute(kitRel);
  if (iceride) satirEkle(path.join(proje, '.gitignore'), `${kitRel}/`);
  let git = 'vardı';
  if (!fs.existsSync(path.join(proje, '.git'))) {
    git = spawnSync('git', ['init', '-q'], { cwd: proje }).status === 0 ? 'açıldı' : 'açılamadı (git kurulu mu?)';
  }

  const files = {};
  for (const rel of kopyalar.keys()) if (!cakisan.includes(rel)) files[rel] = hash(path.join(proje, rel));
  const bugun = new Date().toISOString().slice(0, 10);
  // type: null = kit kuruldu, tip henüz seçilmedi (/start Adım 3 veya /adopt)
  kayitYaz(proje, { version: SURUM, source: KAYNAK, kit: iceride ? kitRel : KOK, type: null, addons: [], created: bugun, updated: bugun, files });

  console.log(`Kit ${SURUM} kuruldu: ${proje}`);
  console.log(`Kit klasörü: ${iceride ? `${kitRel} (.gitignore'a eklendi)` : KOK} · git deposu: ${git}`);
  cakismaRaporu(cakisan);
  console.log('Sonraki adım: Claude Code\'da bu klasörü yeni oturumla aç (komutlar ve hook\'lar yüklensin). Yeni projede /start [fikir], var olan projede /adopt.');
}

// init ile kurulmuş projeye tip katmanı. init'in koyduğu ve kullanıcının değiştirmediği dosyalar ezilir,
// projenin kendi dosyaları ezilmez (.kit-new).
function installProje(proje, type, addons) {
  const kayitYolu = path.join(proje, '.kit.json');
  if (!fs.existsSync(kayitYolu)) throw new Error(`.kit.json yok: önce init çalıştır (node ${path.join(KIT, 'kit.mjs')} init).`);
  const j = JSON.parse(oku(kayitYolu));
  if (j.type) throw new Error(`Kit bu projede zaten kurulu (tip: ${j.type}).`);
  const files = { ...j.files };
  const cakisan = [];
  const { kopyalar, parcalar } = katmanlar(null, [type, ...addons.map((e) => `addons/${e}`)]);
  for (const [rel, kaynak] of kopyalar) {
    const hedef = path.join(proje, rel);
    if (fs.existsSync(hedef) && files[rel] === hash(hedef)) kopyala(kaynak, hedef);
    else guvenliKopyala(proje, rel, kaynak, cakisan);
    if (!cakisan.includes(rel)) files[rel] = hash(hedef);
  }
  for (const p of parcalar) parcaUygula(proje, p);
  kayitYaz(proje, { ...j, version: SURUM, type, addons, updated: new Date().toISOString().slice(0, 10), files });
  console.log(`Kuruldu: ${type}${addons.length ? ' + ' + addons.join(', ') : ''} (kit ${SURUM}) · ${proje}`);
  cakismaRaporu(cakisan);
}

function install({ type, addons, keepKit, project }) {
  dogrula(type, addons);
  if (project && path.resolve(project) !== KOK) return installProje(path.resolve(project), type, addons);
  if (fs.existsSync(path.join(KOK, '.kit.json'))) throw new Error('Kit bu projede zaten kurulu (.kit.json var).');

  const { kopyalar, parcalar } = katmanlar(null, [type, ...addons.map((e) => `addons/${e}`)]);
  for (const [rel, kaynak] of kopyalar) kopyala(kaynak, path.join(KOK, rel));
  for (const p of parcalar) parcaUygula(KOK, p);
  kopyala(path.join(KIT, 'project', 'README.md'), path.join(KOK, 'README.md'));
  for (const rel of SADECE_KIT) fs.rmSync(path.join(KOK, rel), { force: true });

  const izlenen = new Set([...dosyalar(KOK, ORTAK_HARIC), ...kopyalar.keys()]);
  const files = {};
  for (const rel of [...izlenen].sort()) if (fs.existsSync(path.join(KOK, rel))) files[rel] = hash(path.join(KOK, rel));
  const bugun = new Date().toISOString().slice(0, 10);
  kayitYaz(KOK, { version: SURUM, source: KAYNAK, type, addons, created: bugun, updated: bugun, files });

  console.log(`Kuruldu: ${type}${addons.length ? ' + ' + addons.join(', ') : ''} (kit ${SURUM})`);
  console.log(`Eklenen/değişen dosya: ${kopyalar.size + parcalar.length + 1}`);
  if (!keepKit) {
    fs.rmSync(KIT, { recursive: true, force: true });
    console.log('kit/ klasörü kaldırıldı. Güncellemeler için: /kit-update');
  }
}

function update({ project, addons: yeniEkler }) {
  project = path.resolve(project);
  const kayitYolu = path.join(project, '.kit.json');
  if (!fs.existsSync(kayitYolu)) throw new Error(`.kit.json yok: ${project} kit ile kurulmamış.`);
  const j = JSON.parse(oku(kayitYolu));
  if (!j.type) throw new Error('.kit.json eski biçimde (kit 2.x). Bu sürüme otomatik güncellenemez; kit/CHANGELOG.md → 3.0.0 notlarına bak.');
  const eskiEkler = j.addons ?? [];
  const tumEkler = [...new Set([...eskiEkler, ...yeniEkler])];
  dogrula(j.type, tumEkler);
  const kayit = { ...j.files };

  const { kopyalar, parcalar } = katmanlar(KOK, [j.type, ...tumEkler.map((e) => `addons/${e}`)]);
  const rapor = { eklenen: [], guncellenen: [], cakisan: [], kaldirilan: [] };

  for (const [rel, kaynak] of kopyalar) {
    const hedef = path.join(project, rel);
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
    else { kopyala(kaynak, hedef + '.kit-new'); rapor.cakisan.push(rel); } // ikisi de değişmiş: kullanıcınınkine dokunma
  }
  // append/merge sadece yeni eklenen eklerden (eskiler kurulumda uygulandı; projeye ait dosyalara tekrar dokunma)
  const eklenenEkler = yeniEkler.filter((e) => !eskiEkler.includes(e)).map((e) => `addons/${e}`);
  for (const p of parcalar) if (eklenenEkler.includes(p.katman)) parcaUygula(project, p);
  for (const rel of Object.keys(kayit)) if (!kopyalar.has(rel) && kitDosyasi(rel)) rapor.kaldirilan.push(rel);

  kayitYaz(project, { ...j, version: SURUM, addons: tumEkler, updated: new Date().toISOString().slice(0, 10), files: kayit });

  console.log(`Kit ${j.version} -> ${SURUM}`);
  const yaz = (baslik, liste) => liste.length && console.log(`${baslik} (${liste.length}):\n  ${liste.join('\n  ')}`);
  yaz('Eklenen', rapor.eklenen);
  yaz('Güncellenen', rapor.guncellenen);
  yaz('Çakışma: senin değişikliğin korundu, yeni hali yanına .kit-new olarak kondu. Karşılaştır, birleştir, .kit-new dosyasını sil', rapor.cakisan);
  yaz('Kitten kaldırılmış (projede duruyor, istersen sil)', rapor.kaldirilan);
  if (!Object.values(rapor).some((l) => l.length)) console.log('Değişiklik yok.');
  console.log(`Sürüm notları: ${KAYNAK.replace(/\.git$/, '')}/blob/main/kit/CHANGELOG.md ("Elle uyarla" maddelerine bak)`);
}

function argumanlar(argv) {
  const a = { addons: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--type') a.type = argv[++i];
    else if (k === '--project') a.project = argv[++i];
    else if (k === '--addons') a.addons = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--keep-kit') a.keepKit = true;
    else throw new Error(`Bilinmeyen argüman: ${k}`);
  }
  return a;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [islem, ...geri] = process.argv.slice(2);
  try {
    const a = argumanlar(geri);
    if (islem === 'init') init(a);
    else if (islem === 'install') {
      if (!a.type) throw new Error(`--type gerekli: ${TIPLER.join(' | ')}`);
      install(a);
    } else if (islem === 'update') {
      if (!a.project) throw new Error('--project gerekli');
      update(a);
    } else {
      console.log('Kullanım:\n  node kit/kit.mjs install --type <type> [--addons ai] [--keep-kit] [--project <yol>]\n  node <kit>/kit/kit.mjs init [--project <yol>]\n  node kit/kit.mjs update --project <yol> [--addons ai]');
      process.exit(islem ? 1 : 0);
    }
  } catch (e) {
    console.error('HATA: ' + e.message);
    process.exit(1);
  }
}
