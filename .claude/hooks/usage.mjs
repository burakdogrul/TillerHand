#!/usr/bin/env node
// 5-hour and weekly usage limits.
// The status line (statusline.mjs) writes the rate_limits Claude Code sends into .claude/state/usage.json;
// this script reads it and reports the level (green/yellow/red). Thresholds match docs/workflow/usage-limits.md.
//   node .claude/hooks/usage.mjs          human-readable summary
//   node .claude/hooks/usage.mjs --json   machine-readable
import fs from 'node:fs';
import path from 'node:path';
import { isMain } from './shared.mjs';

export const THRESHOLDS = { five_hour: { yellow: 60, red: 85 }, seven_day: { yellow: 70, red: 90 } };
const WINDOWS = { five_hour: '5 saatlik', seven_day: 'haftalık' };
// Level shown to the user
export const LEVEL_LABEL = { green: 'yeşil', yellow: 'sarı', red: 'kırmızı', unknown: 'bilinmiyor' };
const file = (root) => path.join(root, '.claude', 'state', 'usage.json');

export function writeLimits(root, rateLimits, now = Date.now()) {
  if (!rateLimits) return;
  const data = { readAt: now };
  for (const k of Object.keys(WINDOWS)) {
    const p = rateLimits[k];
    if (p && typeof p.used_percentage === 'number') data[k] = { percent: p.used_percentage, resetsAt: p.resets_at };
  }
  if (!data.five_hour && !data.seven_day) return;
  try {
    fs.mkdirSync(path.dirname(file(root)), { recursive: true });
    fs.writeFileSync(file(root), JSON.stringify(data));
  } catch {
    // no .claude folder or not writable: skip silently
  }
}

export function readLimits(root, now = Date.now()) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file(root), 'utf8'));
  } catch {
    return null;
  }
  // An old (pre-3.15) or broken file is "unknown": read as numbers it would show NaN and a green level
  if (!data || typeof data !== 'object' || typeof data.readAt !== 'number') return null;
  for (const k of Object.keys(WINDOWS)) {
    const w = data[k];
    if (typeof w?.percent === 'number') data[k] = { percent: w.percent, resetsAt: w.resetsAt };
    else delete data[k];
    // Past the reset time the window has renewed; the old percentage no longer holds
    if (data[k]?.resetsAt && data[k].resetsAt * 1000 <= now) data[k] = { percent: 0, resetsAt: null, renewed: true };
  }
  data.ageMin = Math.round((now - data.readAt) / 60000);
  return data;
}

// green | yellow | red | unknown (LEVEL_LABEL has the Turkish label)
export function level(data) {
  if (!data) return 'unknown';
  let s = 'green';
  for (const [k, e] of Object.entries(THRESHOLDS)) {
    const y = data[k]?.percent;
    if (y == null) continue;
    if (y >= e.red) return 'red';
    if (y >= e.yellow) s = 'yellow';
  }
  return s;
}

function timeLeft(resetsAt, now) {
  if (!resetsAt) return '';
  const min = Math.max(0, Math.round((resetsAt * 1000 - now) / 60000));
  const clock = new Date(resetsAt * 1000).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const left = min >= 1440 ? `${Math.floor(min / 1440)} gün ${Math.floor((min % 1440) / 60)} sa` : `${Math.floor(min / 60)} sa ${min % 60} dk`;
  return `sıfırlanma ${clock}, ${left} sonra`;
}

export function summary(data, now = Date.now()) {
  if (!data) {
    return 'Limit bilgisi yok. Masaüstü uygulamasındaysan get_usage aracını kullan. Terminal/IDE\'de durum çubuğu ilk API yanıtından sonra yazar. İkisi de yoksa kullanıcıdan /usage sonucunu iste.';
  }
  const parts = Object.entries(WINDOWS)
    .filter(([k]) => data[k])
    .map(([k, name]) => `${name}: %${Math.round(data[k].percent)}${data[k].renewed ? ' (yenilendi)' : ` (${timeLeft(data[k].resetsAt, now)})`}`);
  const stale = data.ageMin > 30 ? ' — eski olabilir, get_usage veya /usage ile doğrula' : '';
  return `${parts.join(' · ')} · seviye: ${LEVEL_LABEL[level(data)]} · ${data.ageMin} dk önce okundu${stale}`;
}

if (isMain(import.meta.url)) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const data = readLimits(root);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ...data, level: level(data), thresholds: THRESHOLDS }));
  else console.log(summary(data));
}
