#!/usr/bin/env node
// Desktop notification:
//   Notification hook  -> Claude is waiting for permission or an answer (when it asks, wants approval, goes idle)
//   Stop hook (--stop) -> a long job finished (at least 90 s; no notification for short answers)
// To turn off, env variable: KIT_NOTIFY=off. If the Claude desktop app's own notifications are on, there may be two.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { isMain } from './shared.mjs';

export const THRESHOLD_SEC = 90;

// Title and message go in env, never into the script text: PowerShell also treats ’ ‘ ‚ ‛ as quotes.
export function winCommand(title, message) {
  const script = 'Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; ' +
    '$n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; ' +
    '$n.ShowBalloonTip(6000, $env:KIT_T, $env:KIT_M, [System.Windows.Forms.ToolTipIcon]::Info); Start-Sleep -Seconds 7; $n.Dispose()';
  return { args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], env: { ...process.env, KIT_T: title, KIT_M: message } };
}

if (isMain(import.meta.url)) main();

function main() {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* no input */ }
  if (process.env.KIT_NOTIFY === 'off') return;

  let project = path.basename(root);
  for (const f of ['AGENTS.md', 'CLAUDE.md']) { // in projects before 3.9.0 the name is in CLAUDE.md
    try { const name = fs.readFileSync(path.join(root, f), 'utf8').match(/^# (.+)$/m)?.[1]; if (name && name !== '[PROJE ADI]') { project = name; break; } } catch { /* */ }
  }

  let message;
  if (process.argv.includes('--stop')) {
    if (input.stop_hook_active) process.exit(0);
    let startedAt = 0;
    try { const r = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'state', 'reminder.json'), 'utf8')); startedAt = r.turnAt ?? r.tur ?? 0; } catch { /* */ } // tur: key before 3.15.0
    const duration = (Date.now() - startedAt) / 1000;
    if (!startedAt || duration < THRESHOLD_SEC) process.exit(0);
    message = `İş bitti (${Math.round(duration / 60)} dk). Sonuca bakabilirsin.`;
  } else {
    message = input.message || 'Claude cevabını bekliyor.';
  }

  const title = `Claude Code · ${project}`.slice(0, 60);
  message = String(message).replace(/\s+/g, ' ').slice(0, 180);
  const detachedOpts = { detached: true, stdio: 'ignore', windowsHide: true };

  try {
    if (process.platform === 'win32') {
      const { args, env } = winCommand(title, message);
      spawn('powershell', args, { ...detachedOpts, env }).unref();
    } else if (process.platform === 'darwin') {
      const as = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      spawn('osascript', ['-e', `display notification "${as(message)}" with title "${as(title)}"`], detachedOpts).unref();
    } else {
      spawn('notify-send', ['--', title, message], detachedOpts).unref();
    }
  } catch {
    // no notification tool: skip silently
  }
}
