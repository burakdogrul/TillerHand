#!/usr/bin/env node
// Düzenleme kilidi (/freeze): Kilit açıkken AI sadece seçilen klasöre yazabilir; hata ayıklarken veya
// riskli bir özellikte işin başka dosyalara yayılmasını önler. Durum: .claude/state/freeze.json → { "dir": "src/features/auth" }
//   PreToolUse (Write|Edit|MultiEdit) hook'u: kilit varken klasör dışına yazmayı engeller (deny).
//   node .claude/hooks/freeze-guard.mjs --set <klasör>   kilitle
//   node .claude/hooks/freeze-guard.mjs --off            kilidi kaldır
//   node .claude/hooks/freeze-guard.mjs --status         durumu yaz
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const kok = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const DURUM = path.join(kok, '.claude', 'state', 'freeze.json');
// Kilit varken de yazılması gereken kit dosyaları (ilerleme notu, hook durumları)
const SERBEST = ['docs/workflow/progress.md', '.claude/state/'];

const goreli = (dosya, kokDizin) => path.relative(kokDizin, path.resolve(kokDizin, dosya)).split(path.sep).join('/');

export function izinli(dosya, kilit, kokDizin = kok) {
  const rel = goreli(dosya, kokDizin);
  if (SERBEST.some((s) => rel === s || (s.endsWith('/') && rel.startsWith(s)))) return true;
  const k = kilit.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  return rel === k || rel.startsWith(`${k}/`);
}

function kilitOku() {
  try { return JSON.parse(fs.readFileSync(DURUM, 'utf8')).dir || null; } catch { return null; }
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
  const kilit = kilitOku();
  if (!kilit) process.exit(0);
  let girdi;
  try { girdi = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
  const yol = girdi.tool_input?.file_path;
  if (!yol || izinli(yol, kilit)) process.exit(0);
  const neden = `Düzenleme kilidi: sadece ${kilit}/ değiştirilebilir. Bu dosya gerekiyorsa kullanıcıya sor; kilidi kaldırmak için /freeze off.`;
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: neden } }));
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ['--set', '--off', '--status'].includes(process.argv[2]) ? ayarla() : hook();
}
