#!/usr/bin/env node
// Claude Code bottom status line: phase, task progress, question mode and usage limits.
// Example: ▶ Faz 1 · G-012 · görev 7/23 · soru: açık (kapalı: tasarim) · 5s %34 · hf %5
// Also writes the rate_limits Claude Code sends into .claude/state/usage.json (usage.mjs reads it).
import fs from 'node:fs';
import { readStatus } from './status-read.mjs';
import { writeLimits, readLimits, level } from './usage.mjs';

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
  if (l.five_hour) p.push(`5s %${Math.round(l.five_hour.percent)}`);
  if (l.seven_day) p.push(`hf %${Math.round(l.seven_day.percent)}`);
  const s = level(l);
  return p.join(' · ') + (s === 'yellow' ? ' ⚠' : s === 'red' ? ' ⛔' : '');
}

try {
  const d = readStatus(root);
  const parts = [];
  if (d.kitPending) {
    parts.push('◆ Kit kurulmadı · başlamak için: /start [fikrin] · var olan kod: /adopt');
  } else {
    const a = d.fields;
    const question = (a['Soru modu'] ?? 'açık')
      .replace(/\s*·\s*kapalı konular:\s*yok/i, '')
      .replace(/\s*·\s*kapalı konular:\s*(.*)$/i, ' (kapalı: $1)');
    parts.push(`▶ ${a['Aktif faz'] ?? '-'}`);
    if (/başlangıç/i.test(a['Aktif faz'] ?? '')) parts.push(`adım ${a['Başlangıç adımı'] ?? '-'}`);
    else parts.push(a['Aktif görev'] ?? '-', `görev ${d.taskCount.done}/${d.taskCount.total}`);
    parts.push(`soru: ${question}`);
    if (d.pending.length) parts.push(`bekleyen karar: ${d.pending.length}`);
  }
  const limit = limitPart();
  if (limit) parts.push(limit);
  if (context != null) parts.push(`bağlam %${context}${context >= 70 ? ' ⛔' : context >= 50 ? ' ⚠' : ''}`);
  console.log(parts.join(' · '));
} catch {
  console.log('▶ durum okunamadı');
}
