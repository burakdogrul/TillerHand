#!/usr/bin/env node
// Düzenleme kilidi (/freeze): Kilit açıkken AI sadece seçilen klasöre yazabilir; hata ayıklarken veya
// riskli bir özellikte işin başka dosyalara yayılmasını önler. Durum: .claude/state/freeze.json → { "dir": "src/features/auth" }
//   PreToolUse (Write|Edit|MultiEdit|NotebookEdit) hook'u: kilit varken klasör dışına yazmayı engeller (deny).
//   Kabukla yazım (sed -i, mv, > …) destructive-guard'da: kilit veya plan dışındaki mevcut dosya sorulur (ask).
//   Codex ve Antigravity'de ayrıca Claude Code izin listesinin dosya karşılığını uygular (KORUMALI): bu araçlarda
//   settings.json yok; olmazsa AI kilidi, hook'ları ve kuralları kendisi değiştirebilir.
//   node .claude/hooks/freeze-guard.mjs --set <klasör>   kilitle
//   node .claude/hooks/freeze-guard.mjs --off            kilidi kaldır
//   node .claude/hooks/freeze-guard.mjs --status         durumu yaz (kilit ve plan)
// Kapsam kalkanı (F-06): /plan-task onayından sonra planın dosya listesi kaydedilir; plan aktifken listede olmayan
// MEVCUT dosyaya yazım sorulur (ask). Yeni dosyaya yapı koruyucu bakar; docs/, CHANGELOG.md serbest. Plan yoksa sessiz.
// Durum: .claude/state/plan.json → { "gorev": "G-012", "yollar": ["src/a.ts", "src/features/fatura/"] } (/ ile biten: klasör)
//   node .claude/hooks/freeze-guard.mjs --plan-kaydet <görev> <yol...>   plan yokken kaydet (sorusuz)
//   node .claude/hooks/freeze-guard.mjs --plan-ekle <yol...>             listeyi genişlet (kullanıcı onayıyla)
//   node .claude/hooks/freeze-guard.mjs --plan-bitir                     görev bitince kapat
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { girdiOku, kararVer, kokBul } from './arac.mjs';

// Alt klasörden çağrılsa da proje kökü: kilit ve plan hook'un okuduğu yere yazılsın; yollar köke göre
const kok = kokBul();
const durumYolu = (dizin = kok) => path.join(dizin, '.claude', 'state', 'freeze.json');
const DURUM = durumYolu();
// Kilit varken de yazılması gereken kit dosyaları (ilerleme notu, hook durumları)
const SERBEST = ['docs/workflow/progress.md', '.claude/state/'];

// .claude/settings.json → permissions karşılığı (deny: .env ve secrets/, ask: kural ve koruma dosyaları)
const KORUMALI = [
  ['deny', /^(\.env(\.local|\.production|\.[^/]+\.local)?|secrets(\/.*)?)$/i, 'Ortam ve sır dosyaları AI tarafından okunmaz ve yazılmaz.'],
  ['ask', /^(CLAUDE\.md|AGENTS\.md|\.mcp\.json|\.claude\/.*|\.codex\/.*|\.agents\/hooks\.json|\.github\/workflows\/.*|\.git(\/.*)?)$/i, 'Kural, koruma ve iş akışı dosyaları kullanıcı onayıyla değişir.'],
];
export const korumali = (rel) => KORUMALI.find(([, re]) => re.test(rel)) ?? null;

export const goreli = (dosya, kokDizin) => path.relative(kokDizin, path.resolve(kokDizin, dosya)).split(path.sep).join('/');

// Sembolik bağ ve junction çözülür: kilit veya plan içindeki bir bağ dışarıdaki dosyaya yazdıramasın.
// Yeni dosyada var olan en yakın üst klasör çözülür.
export function gercek(yol) {
  try { return fs.realpathSync.native(yol); } catch { /* yok: üst klasöre bak */ }
  const ust = path.dirname(yol);
  return ust === yol ? yol : path.join(gercek(ust), path.basename(yol));
}

export function izinli(dosya, kilit, kokDizin = kok) {
  const rel = goreli(dosya, kokDizin);
  if (SERBEST.some((s) => rel === s || (s.endsWith('/') && rel.startsWith(s)))) return true;
  const k = kilit.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  return rel === k || rel.startsWith(`${k}/`);
}

export function kilitOku(dizin = kok) {
  try { return JSON.parse(fs.readFileSync(durumYolu(dizin), 'utf8')).dir || null; } catch { return null; }
}

const planYolu = (dizin = kok) => path.join(dizin, '.claude', 'state', 'plan.json');
const PLAN_SERBEST = ['docs/', 'CHANGELOG.md', ...SERBEST];
export const kapsamda = (rel, yollar) => [...PLAN_SERBEST, ...yollar].some((y) => rel === y || (y.endsWith('/') && rel.startsWith(y)));

// Bozuk veya elle değiştirilmiş dosya: plan yok sayılır
export function planOku(dizin = kok) {
  try {
    const p = JSON.parse(fs.readFileSync(planYolu(dizin), 'utf8'));
    return typeof p?.gorev === 'string' && Array.isArray(p.yollar) ? { gorev: p.gorev, yollar: p.yollar.filter((y) => typeof y === 'string') } : null;
  } catch { return null; }
}
const planYaz = (p) => {
  fs.mkdirSync(path.dirname(planYolu()), { recursive: true });
  fs.writeFileSync(planYolu(), JSON.stringify({ ...p, tarih: new Date().toISOString() }, null, 2));
};
// Proje içi göreli yol; sondaki / klasör demektir. Proje dışı veya kökün kendisi: null
function planYolNormal(y) {
  const r = goreli(y, kok);
  return !r || r.startsWith('..') || path.isAbsolute(r) ? null : r + (/[\\/]$/.test(y) ? '/' : '');
}

function planAyarla(mod, argumanlar) {
  const mevcut = planOku();
  if (mod === '--plan-bitir') {
    fs.rmSync(planYolu(), { force: true });
    return console.log(mevcut ? `Kapsam kalkanı kapandı (${mevcut.gorev}).` : 'Aktif plan yok.');
  }
  const [gorev, ...yollar] = mod === '--plan-kaydet' ? argumanlar : [null, ...argumanlar];
  const hata = (m) => { console.error(m); process.exit(1); };
  if (mod === '--plan-kaydet' && mevcut) hata(`Plan aktif (${mevcut.gorev}). Kapsamı genişletmek kullanıcı onayıyla --plan-ekle; görev bittiyse önce --plan-bitir.`);
  if (mod === '--plan-ekle' && !mevcut) hata('Aktif plan yok; önce --plan-kaydet <görev> <yol...>.');
  if ((mod === '--plan-kaydet' && !gorev) || !yollar.length) hata(`Kullanım: ${mod === '--plan-kaydet' ? '--plan-kaydet <görev> <yol...>' : '--plan-ekle <yol...>'}`);
  const normal = yollar.map(planYolNormal);
  if (normal.includes(null)) hata(`Proje dışındaki yol plana eklenmez: ${yollar[normal.indexOf(null)]}`);
  const plan = mevcut ? { gorev: mevcut.gorev, yollar: [...new Set([...mevcut.yollar, ...normal])] } : { gorev, yollar: [...new Set(normal)] };
  planYaz(plan);
  console.log(`Kapsam kalkanı: ${plan.gorev} · ${plan.yollar.length} yol. Liste dışı mevcut dosyaya yazım sorulur.`);
}

// Modu SADECE ilk argüman belirler (izin listesi önekle eşleşir: "--set:*" ve "--status" onaysız, "--off" onaylı).
// Kilit ajanı sınırlar: açık kilit onaysız kaldırılamaz ve genişletilemez, sadece daraltılabilir.
function ayarla() {
  const [mod, deger] = process.argv.slice(2);
  if (mod === '--off') {
    fs.rmSync(DURUM, { force: true });
    console.log('Düzenleme kilidi kaldırıldı.');
  } else if (mod === '--set' && deger) {
    const dir = goreli(deger, kok).replace(/\/+$/, '');
    if (!dir || dir.startsWith('..')) { console.error('Klasör proje içinde olmalı.'); process.exit(1); }
    const mevcut = kilitOku();
    if (mevcut && !izinli(`${dir}/x`, mevcut)) {
      console.error(`Kilit açık (${mevcut}/). Sadece daraltılabilir; genişletmek için önce kullanıcı onayıyla /freeze off.`);
      process.exit(1);
    }
    fs.mkdirSync(path.dirname(DURUM), { recursive: true });
    fs.writeFileSync(DURUM, JSON.stringify({ dir, tarih: new Date().toISOString() }, null, 2));
    console.log(`Düzenleme kilidi: sadece ${dir}/ (kaldırmak için /freeze off)`);
  } else if (mod?.startsWith('--plan-')) {
    planAyarla(mod, process.argv.slice(3));
  } else {
    const k = kilitOku();
    const p = planOku();
    console.log(k ? `Düzenleme kilidi açık: ${k}/` : 'Düzenleme kilidi yok.');
    console.log(p ? `Kapsam kalkanı: ${p.gorev} · ${p.yollar.length} yol (${p.yollar.join(', ')})` : 'Aktif plan yok.');
  }
}

function hook() {
  const g = girdiOku();
  if (!g) process.exit(0);
  const gkok = gercek(g.kok);
  const yollar = g.dosyalar.map(({ yol }) => gercek(path.resolve(g.dizin, yol)));
  // Kapı komut onayı kaydı (gate.mjs, kullanıcı klasöründe ~/.vibe-kit/): AI onu elle yazamasın
  const onay = yollar.find((yol) => /[\\/]\.vibe-kit([\\/]|$)/i.test(yol));
  if (onay) kararVer(g.arac, 'ask', `${onay}: kapı komut onayı kaydı; elle yazılmaz, node .claude/hooks/gate.mjs --onayla kullanılır.`);
  if (g.arac !== 'claude') {
    for (const yol of yollar) {
      const k = korumali(goreli(yol, gkok));
      if (k) kararVer(g.arac, k[0], `${goreli(yol, gkok)}: ${k[2]}`);
    }
    // Okuma (view_file vb.): sadece .env ve secrets/ engellenir (Claude'daki Read(./.env) karşılığı)
    for (const yol of g.okunan) {
      const rel = goreli(gercek(path.resolve(g.dizin, yol)), gkok);
      const k = korumali(rel);
      if (k?.[0] === 'deny') kararVer(g.arac, 'deny', `${rel}: ${k[2]}`);
    }
  }
  const kilit = kilitOku(g.kok);
  const disari = kilit && yollar.find((yol) => !izinli(yol, kilit, gkok));
  if (disari) kararVer(g.arac, 'deny', `Düzenleme kilidi: sadece ${kilit}/ değiştirilebilir. Bu dosya gerekiyorsa kullanıcıya sor; kilidi kaldırmak için /freeze off.`);
  const plan = planOku(g.kok);
  for (const [i, yol] of (plan ? yollar : []).entries()) {
    const rel = goreli(yol, gkok);
    // Yeni dosya sorulmaz (yapı koruyucu bakar); silme ve var olanın üstüne yazma sorulur
    if (kapsamda(rel, plan.yollar) || !(g.dosyalar[i].sil || fs.existsSync(yol))) continue;
    kararVer(g.arac, 'ask', `Kapsam kalkanı: ${rel || '(yol bilinmiyor)'} onaylı planda yok (görev ${plan.gorev}). Gerekliyse kullanıcıya sor; ` +
      `onaylarsa node .claude/hooks/freeze-guard.mjs --plan-ekle <yol>. Görev bittiyse --plan-bitir.`);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ['--set', '--off', '--status', '--plan-kaydet', '--plan-ekle', '--plan-bitir'].includes(process.argv[2]) ? ayarla() : hook();
}
