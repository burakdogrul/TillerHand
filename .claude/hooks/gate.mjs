#!/usr/bin/env node
// Deterministik kapı: kurul toplanmadan önce lint, tip kontrolü, test ve Semgrep çalışır; çıktı üyelere girdi olur.
// Neden: lint/tip/test'in yakaladığını model aramasın, kırmızı kontrol model kararına kalmasın (F-03).
//   node .claude/hooks/gate.mjs --run      çıkış kodu: 0 yeşil, 1 kırmızı
//   Komutlar AGENTS.md → Komutlar bölümünden okunur (lint, tip kontrol, test); boş ([ ]) olan "tanımsız" sayılır.
//   Semgrep kuruluysa değişen kod dosyalarında çalışır (SEMGREP=<çalıştırılabilir> ile değiştirilir); yoksa atlanır, CI'da çalışır.
//   Sonuç .claude/state/gate.json'a commit kapısıyla aynı değişiklik imzasıyla yazılır; commit kapısı kırmızı veya
//   eski sonuçta commit'i durdurur. Yeşil kontrolün çıktısı yazılmaz, kırmızının son 30 satırı yazılır.
//   Hiçbir kontrol geçmediyse (komutlar boş, Semgrep yok) sonuç BOŞ: commit kapısı açılmaz.
//   node .claude/hooks/gate.mjs --onayla   komutları kullanıcı onayıyla kaydeder. Yeni veya değişen komut onaysız çalışmaz:
//   güvenilmeyen bir deponun AGENTS.md'si kapı üzerinden kod çalıştıramasın. Onay kullanıcı klasöründe durur (~/.vibe-kit/).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { degisiklikler } from './commit-gate.mjs';
import { kodDosyasi } from './edit-rounds.mjs';
import { kokBul } from './arac.mjs';

const KONTROLLER = ['lint', 'tip kontrol', 'test'];
const SURE = 10 * 60 * 1000;
const TAMPON = 64 * 1024 * 1024;
const kuyruk = (s) => s.trimEnd().split(/\r?\n/).slice(-30).join('\n');

// Sadece "## Komutlar" bölümü okunur: başka yerdeki "test:" satırı komut sayılmasın
export function komutlar(md) {
  const bolum = md.match(/^## Komutlar[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';
  return KONTROLLER.map((ad) => {
    const deger = bolum.match(new RegExp(`^${ad}:[ \\t]*(.*?)[ \\t\\r]*$`, 'm'))?.[1];
    return { ad, komut: deger && !/^\[.*\]$/.test(deger) ? deger : null };
  });
}

// Onay kaydı proje dışında, kullanıcı klasöründe (proje gerçek yolunun özetiyle): hiçbir depo, arşiv veya .git onay taşıyamaz.
// Ev klasörü işletim sisteminden okunur (os.userInfo); HOME/USERPROFILE değişkeniyle başka yere yönlendirilemez.
export function onayYolu(kok) {
  let gercekKok = kok;
  try { gercekKok = fs.realpathSync.native(kok); } catch { /* yok: verilen yol */ }
  const anahtar = crypto.createHash('sha256').update(gercekKok.toLowerCase()).digest('hex').slice(0, 32);
  return path.join(os.userInfo().homedir, '.vibe-kit', 'kapi-onayi', `${anahtar}.json`);
}
const ozet = (liste) => crypto.createHash('sha256').update(JSON.stringify(liste.map((k) => [k.ad, k.komut]))).digest('hex');
export const komutListesi = (liste) => liste.filter((k) => k.komut).map((k) => `- ${k.ad}: ${k.komut}`).join('\n');
export const agentsOku = (kok) => { try { return fs.readFileSync(path.join(kok, 'AGENTS.md'), 'utf8'); } catch { return ''; } };

export function onayla(kok) {
  const liste = komutlar(agentsOku(kok));
  const yol = onayYolu(kok);
  fs.mkdirSync(path.dirname(yol), { recursive: true });
  fs.writeFileSync(yol, JSON.stringify({ ozet: ozet(liste), komutlar: liste, tarih: new Date().toISOString() }, null, 2));
  return `Kapı komutları onaylandı:\n${komutListesi(liste) || '(tanımlı komut yok)'}`;
}

function onayli(kok, liste) {
  if (!liste.some((k) => k.komut)) return true; // çalışacak komut yok
  try { return JSON.parse(fs.readFileSync(onayYolu(kok), 'utf8')).ozet === ozet(liste); } catch { return false; }
}

function kontrol(kok, { ad, komut }) {
  if (!komut) return { ad, durum: 'tanımsız', not: 'AGENTS.md → Komutlar' };
  const bas = Date.now();
  // Komut AGENTS.md'den gelir (kural dosyası, yazımı onaylı); boru ve && için kabuk gerekir
  const r = spawnSync(komut, { cwd: kok, shell: true, encoding: 'utf8', timeout: SURE, maxBuffer: TAMPON });
  const sn = Math.round((Date.now() - bas) / 1000);
  if (r.status === 0) return { ad, komut, durum: 'geçti', sn };
  return { ad, komut, durum: 'kaldı', sn, cikti: kuyruk(`${r.error ? `${r.error.message}\n` : ''}${r.stdout ?? ''}${r.stderr ?? ''}`) };
}

function semgrep(kok, dosyalar) {
  const ad = 'Semgrep';
  const kod = dosyalar.filter((f) => kodDosyasi(f) && fs.existsSync(path.join(kok, f)));
  if (!kod.length) return { ad, durum: 'atlandı', not: 'değişen kod dosyası yok' };
  const bas = Date.now();
  const cmd = process.env.SEMGREP || 'semgrep';
  // --metrics=off: kod taraması kullanım verisi göndermesin (docs.semgrep.dev/cli-reference, 2026-10-24)
  const r = spawnSync(cmd, ['scan', '--metrics=off', '--config', 'p/default', '--config', 'p/owasp-top-ten', '--severity', 'ERROR', '--error', '--quiet', '--', ...kod],
    { cwd: kok, encoding: 'utf8', timeout: SURE, maxBuffer: TAMPON });
  if (['ENOENT', 'EINVAL'].includes(r.error?.code)) {
    // Windows'ta .cmd/.bat kabuksuz çalışmaz; dosya adları kabuğa verilmez, kullanıcı .exe yolunu verir.
    // where önce cwd'ye bakar: projenin içindeki (depoyla gelmiş olabilecek) semgrep önerilmez.
    const disarida = (y) => y && path.relative(kok, y).startsWith('..');
    const bulunan = r.error.code === 'EINVAL' ? cmd
      : process.platform === 'win32' ? (spawnSync('where', [cmd], { encoding: 'utf8' }).stdout ?? '').split(/\r?\n/).map((y) => y.trim()).find(disarida) ?? '' : '';
    return { ad, durum: 'atlandı', not: bulunan ? `${bulunan} bulundu ama çalıştırılamadı (.cmd/.bat); SEMGREP=<semgrep.exe yolu> ile ver`
      : 'kurulu değil; CI\'daki semgrep işi çalıştırır' };
  }
  const sn = Math.round((Date.now() - bas) / 1000);
  if (r.status === 0) return { ad, durum: 'geçti', sn };
  return { ad, durum: 'kaldı', sn, cikti: kuyruk(`${r.error ? `${r.error.message}\n` : ''}${r.stdout ?? ''}${r.stderr ?? ''}`) };
}

const ISARET = { 'geçti': '✅', 'kaldı': '❌', 'tanımsız': '⚪', 'atlandı': '⚪' };
const satir = (k) => `${ISARET[k.durum]} ${k.ad}${k.sn != null ? ` (${k.sn} sn)` : ''}${k.durum === 'geçti' ? '' : `: ${k.durum}`}${k.not ? ` (${k.not})` : ''}` +
  (k.cikti ? `\n\`\`\`\n${k.cikti}\n\`\`\`` : '');

export function calistir(kok) {
  let imza = null, dosyalar = [];
  try { ({ imza, dosyalar } = degisiklikler()); } catch { /* git deposu değil: komutlar yine çalışır */ }
  const liste = komutlar(agentsOku(kok));
  if (!onayli(kok, liste)) {
    return { gecti: false, metin: `## Kapı · komut onayı gerekli\nAGENTS.md → Komutlar yeni veya değişmiş; kapı bu komutları onaysız çalıştırmaz:\n${komutListesi(liste)}\n` +
      'Komutları kullanıcıya göster ve sor. Onaylarsa: node .claude/hooks/gate.mjs --onayla, sonra kapıyı tekrar çalıştır.' };
  }
  const kontroller = [...liste.map((k) => kontrol(kok, k)), semgrep(kok, dosyalar)];
  const bos = !kontroller.some((k) => k.durum === 'geçti');
  const gecti = !bos && kontroller.every((k) => k.durum !== 'kaldı');
  const yol = path.join(kok, '.claude', 'state', 'gate.json');
  fs.mkdirSync(path.dirname(yol), { recursive: true });
  fs.writeFileSync(yol, JSON.stringify({ imza, tarih: new Date().toISOString(), gecti, bos, kontroller }, null, 2));
  const sonuc = kontroller.some((k) => k.durum === 'kaldı') ? 'Sonuç: KIRMIZI. Commit kapısı açılmaz: düzelt ve kapıyı tekrar çalıştır.'
    : bos ? 'Sonuç: BOŞ, hiçbir kontrol çalışmadı. AGENTS.md → Komutlar\'ı doldur; commit kapısı açılmaz (kullanıcı isterse "atlandı").'
    : 'Sonuç: YEŞİL.';
  return { gecti, metin: [`## Kapı · ${dosyalar.length} dosya değişti`, ...kontroller.map(satir), sonuc].join('\n') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--onayla') { console.log(onayla(kokBul())); process.exit(0); }
  if (process.argv[2] !== '--run') { console.error('Kullanım: node .claude/hooks/gate.mjs --run | --onayla'); process.exit(1); }
  const { gecti, metin } = calistir(kokBul());
  console.log(metin);
  process.exit(gecti ? 0 : 1);
}
