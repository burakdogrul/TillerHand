#!/usr/bin/env node
// Düzenleme kilidi (/freeze): Kilit açıkken AI sadece seçilen klasöre yazabilir; hata ayıklarken veya
// riskli bir özellikte işin başka dosyalara yayılmasını önler. Durum: .claude/state/freeze.json → { "dir": "src/features/auth" }
//   PreToolUse (Write|Edit|MultiEdit) hook'u: kilit varken klasör dışına yazmayı engeller (deny).
//   Codex ve Antigravity'de ayrıca Claude Code izin listesinin dosya karşılığını uygular (KORUMALI): bu araçlarda
//   settings.json yok; olmazsa AI kilidi, hook'ları ve kuralları kendisi değiştirebilir.
//   node .claude/hooks/freeze-guard.mjs --set <klasör>   kilitle
//   node .claude/hooks/freeze-guard.mjs --off            kilidi kaldır
//   node .claude/hooks/freeze-guard.mjs --status         durumu yaz
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { girdiOku, kararVer } from './arac.mjs';

const kok = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const durumYolu = (dizin = kok) => path.join(dizin, '.claude', 'state', 'freeze.json');
const DURUM = durumYolu();
// Kilit varken de yazılması gereken kit dosyaları (ilerleme notu, hook durumları)
const SERBEST = ['docs/workflow/progress.md', '.claude/state/'];

// .claude/settings.json → permissions karşılığı (deny: .env ve secrets/, ask: kural ve koruma dosyaları)
const KORUMALI = [
  ['deny', /^(\.env(\.local|\.production|\.[^/]+\.local)?|secrets(\/.*)?)$/i, 'Ortam ve sır dosyaları AI tarafından okunmaz ve yazılmaz.'],
  ['ask', /^(CLAUDE\.md|AGENTS\.md|\.mcp\.json|\.claude\/.*|\.codex\/.*|\.agents\/hooks\.json|\.github\/workflows\/.*)$/i, 'Kural, koruma ve iş akışı dosyaları kullanıcı onayıyla değişir.'],
];
export const korumali = (rel) => KORUMALI.find(([, re]) => re.test(rel)) ?? null;

const goreli = (dosya, kokDizin) => path.relative(kokDizin, path.resolve(kokDizin, dosya)).split(path.sep).join('/');

export function izinli(dosya, kilit, kokDizin = kok) {
  const rel = goreli(dosya, kokDizin);
  if (SERBEST.some((s) => rel === s || (s.endsWith('/') && rel.startsWith(s)))) return true;
  const k = kilit.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  return rel === k || rel.startsWith(`${k}/`);
}

function kilitOku(dizin = kok) {
  try { return JSON.parse(fs.readFileSync(durumYolu(dizin), 'utf8')).dir || null; } catch { return null; }
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
  } else {
    const k = kilitOku();
    console.log(k ? `Düzenleme kilidi açık: ${k}/` : 'Düzenleme kilidi yok.');
  }
}

function hook() {
  const g = girdiOku();
  if (!g) process.exit(0);
  const yollar = g.dosyalar.map(({ yol }) => path.resolve(g.dizin, yol));
  if (g.arac !== 'claude') {
    for (const yol of yollar) {
      const k = korumali(goreli(yol, g.kok));
      if (k) kararVer(g.arac, k[0], `${goreli(yol, g.kok)}: ${k[2]}`);
    }
    // Okuma (view_file vb.): sadece .env ve secrets/ engellenir (Claude'daki Read(./.env) karşılığı)
    for (const yol of g.okunan) {
      const rel = goreli(path.resolve(g.dizin, yol), g.kok);
      const k = korumali(rel);
      if (k?.[0] === 'deny') kararVer(g.arac, 'deny', `${rel}: ${k[2]}`);
    }
  }
  const kilit = kilitOku(g.kok);
  if (!kilit) process.exit(0);
  const disari = yollar.find((yol) => !izinli(yol, kilit, g.kok));
  if (disari) kararVer(g.arac, 'deny', `Düzenleme kilidi: sadece ${kilit}/ değiştirilebilir. Bu dosya gerekiyorsa kullanıcıya sor; kilidi kaldırmak için /freeze off.`);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ['--set', '--off', '--status'].includes(process.argv[2]) ? ayarla() : hook();
}
