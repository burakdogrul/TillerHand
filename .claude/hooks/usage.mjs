#!/usr/bin/env node
// 5-hour and weekly usage limits.
// The status line (statusline.mjs) writes the rate_limits Claude Code sends into .claude/state/usage.json;
// this script reads it and reports the level (green/yellow/red). Thresholds match docs/workflow/usage-limits.md.
//   node .claude/hooks/usage.mjs          human-readable summary
//   node .claude/hooks/usage.mjs --json   machine-readable
import fs from 'node:fs';
import path from 'node:path';
import { findRoot, isMain } from './shared.mjs';
import { t, readLang } from './lang.mjs';

export const THRESHOLDS = { five_hour: { yellow: 60, red: 85 }, seven_day: { yellow: 70, red: 90 } };
// Window → message key of its name
const WINDOWS = { five_hour: 'usage.window5h', seven_day: 'usage.windowWeek' };
// Plain level names (flow.mjs, read by the AI); summary() shows them in the project language through usage.level.* keys
export const LEVEL_LABEL = { green: 'green', yellow: 'yellow', red: 'red', unknown: 'unknown' };
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

// green | yellow | red | unknown (LEVEL_LABEL has the plain label)
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

function timeLeft(resetsAt, now, root) {
  if (!resetsAt) return '';
  const min = Math.max(0, Math.round((resetsAt * 1000 - now) / 60000));
  const clock = new Date(resetsAt * 1000).toLocaleString(readLang(root) === 'tr' ? 'tr-TR' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const left = min >= 1440
    ? t(root, 'usage.leftDays', { days: Math.floor(min / 1440), hours: Math.floor((min % 1440) / 60) })
    : t(root, 'usage.leftHours', { hours: Math.floor(min / 60), minutes: min % 60 });
  return t(root, 'usage.resets', { clock, left });
}

// The dashboard shows this text to the user, so it follows the project language (root)
export function summary(data, now = Date.now(), root = findRoot()) {
  if (!data) return t(root, 'usage.none');
  const parts = Object.entries(WINDOWS)
    .filter(([k]) => data[k])
    .map(([k, name]) => t(root, 'usage.windowPart', { name: t(root, name), percent: Math.round(data[k].percent), tail: data[k].renewed ? ` ${t(root, 'usage.renewed')}` : ` (${timeLeft(data[k].resetsAt, now, root)})` }));
  const stale = data.ageMin > 30 ? t(root, 'usage.stale') : '';
  return t(root, 'usage.summary', { parts: parts.join(' · '), level: t(root, `usage.level.${level(data)}`), age: data.ageMin, stale });
}

if (isMain(import.meta.url)) {
  const root = findRoot();
  const data = readLimits(root);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ...data, level: level(data), thresholds: THRESHOLDS }));
  else console.log(summary(data));
}
