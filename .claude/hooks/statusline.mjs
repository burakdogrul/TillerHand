#!/usr/bin/env node
// Claude Code bottom status line: phase, task progress, question mode and usage limits.
// Example: ▶ Faz 1 · G-012 · task 7/23 · questions: open (closed: tasarim) · 5h 34% · weekly 5%
// Also writes the rate_limits Claude Code sends into .claude/state/usage.json (usage.mjs reads it).
import fs from 'node:fs';
import { readStatus } from './status-read.mjs';
import { writeLimits, readLimits, level } from './usage.mjs';
import { t } from './lang.mjs';

let root = process.cwd();
let input = {};
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
  root = input.workspace?.project_dir || input.workspace?.current_dir || root;
} catch {
  // no input: use the working folder
}
writeLimits(root, input.rate_limits);

// Context fill: Claude Code's ready percentage, otherwise computed from the last request's token total
export function contextPercent(cw) {
  if (!cw) return null;
  if (typeof cw.used_percentage === 'number') return Math.round(cw.used_percentage);
  const u = cw.current_usage;
  if (!u || !cw.context_window_size) return null;
  const total = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  return Math.round((total / cw.context_window_size) * 100);
}
const context = contextPercent(input.context_window);
if (context != null) {
  try { fs.mkdirSync(`${root}/.claude/state`, { recursive: true }); fs.writeFileSync(`${root}/.claude/state/context.json`, JSON.stringify({ percent: context, readAt: Date.now() })); } catch { /* silent */ }
}

function limitPart() {
  const l = readLimits(root);
  if (!l) return null;
  const p = [];
  if (l.five_hour) p.push(t(root, 'statusline.limit5h', { percent: Math.round(l.five_hour.percent) }));
  if (l.seven_day) p.push(t(root, 'statusline.limitWeek', { percent: Math.round(l.seven_day.percent) }));
  const s = level(l);
  return p.join(' · ') + (s === 'yellow' ? ' ⚠' : s === 'red' ? ' ⛔' : '');
}

try {
  const d = readStatus(root);
  const parts = [];
  if (d.kitPending) {
    parts.push(t(root, 'statusline.notSetUp'));
  } else {
    const a = d.fields;
    // The values in progress.md stay Turkish (açık / kapalı); only what the line shows is localized
    const question = (a['Question mode'] ?? 'açık')
      .replace(/^(açık|kapalı)(?=$|\s)/i, (m) => t(root, m.toLowerCase() === 'açık' ? 'statusline.modeOpen' : 'statusline.modeOff'))
      .replace(/\s*·\s*kapalı konular:\s*yok/i, '')
      .replace(/\s*·\s*kapalı konular:\s*(.*)$/i, (_, topics) => ` ${t(root, 'statusline.closed', { topics })}`);
    parts.push(`▶ ${a['Active phase'] ?? '-'}`);
    if (/başlangıç/i.test(a['Active phase'] ?? '')) parts.push(t(root, 'statusline.step', { step: a['Setup step'] ?? '-' }));
    else parts.push(a['Active task'] ?? '-', t(root, 'statusline.task', { done: d.taskCount.done, total: d.taskCount.total }));
    parts.push(t(root, 'statusline.question', { mode: question }));
    if (d.pending.length) parts.push(t(root, 'statusline.pending', { count: d.pending.length }));
  }
  const limit = limitPart();
  if (limit) parts.push(limit);
  if (context != null) parts.push(t(root, 'statusline.context', { percent: context }) + (context >= 70 ? ' ⛔' : context >= 50 ? ' ⚠' : ''));
  console.log(parts.join(' · '));
} catch {
  console.log(t(root, 'statusline.unreadable'));
}
