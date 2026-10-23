#!/usr/bin/env node
// Masaüstü bildirimi:
//   Notification hook'u  -> Claude izin veya cevap bekliyor (soru sorduğunda, onay istediğinde, boşta kaldığında)
//   Stop hook'u (--stop) -> uzun süren bir iş bitti (en az 90 sn; kısa cevaplarda bildirim yok)
// Kapatmak için ortam değişkeni: KIT_NOTIFY=off. Claude masaüstü uygulamasının kendi bildirimleri açıksa çift bildirim olabilir.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const kok = process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const ESIK_SN = 90;

let girdi = {};
try { girdi = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* girdi yok */ }
if (process.env.KIT_NOTIFY === 'off') process.exit(0);

let proje = path.basename(kok);
for (const f of ['AGENTS.md', 'CLAUDE.md']) { // 3.9.0 öncesi projelerde ad CLAUDE.md'de
  try { const ad = fs.readFileSync(path.join(kok, f), 'utf8').match(/^# (.+)$/m)?.[1]; if (ad && ad !== '[PROJE ADI]') { proje = ad; break; } } catch { /* */ }
}

let mesaj;
if (process.argv.includes('--stop')) {
  if (girdi.stop_hook_active) process.exit(0);
  let baslangic = 0;
  try { baslangic = JSON.parse(fs.readFileSync(path.join(kok, '.claude', 'state', 'reminder.json'), 'utf8')).tur ?? 0; } catch { /* */ }
  const sure = (Date.now() - baslangic) / 1000;
  if (!baslangic || sure < ESIK_SN) process.exit(0);
  mesaj = `İş bitti (${Math.round(sure / 60)} dk). Sonuca bakabilirsin.`;
} else {
  mesaj = girdi.message || 'Claude cevabını bekliyor.';
}

const baslik = `Claude Code · ${proje}`.slice(0, 60);
mesaj = String(mesaj).replace(/\s+/g, ' ').slice(0, 180);
const ayrik = { detached: true, stdio: 'ignore', windowsHide: true };

try {
  if (process.platform === 'win32') {
    const ps = (s) => s.replace(/'/g, "''");
    const betik = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; ` +
      `$n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; ` +
      `$n.ShowBalloonTip(6000, '${ps(baslik)}', '${ps(mesaj)}', [System.Windows.Forms.ToolTipIcon]::Info); Start-Sleep -Seconds 7; $n.Dispose()`;
    spawn('powershell', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', betik], ayrik).unref();
  } else if (process.platform === 'darwin') {
    const as = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    spawn('osascript', ['-e', `display notification "${as(mesaj)}" with title "${as(baslik)}"`], ayrik).unref();
  } else {
    spawn('notify-send', [baslik, mesaj], ayrik).unref();
  }
} catch {
  // bildirim aracı yoksa sessiz geç
}
