#!/usr/bin/env node
// Structure guard: keeps the project's folder layout in line with the .claude/structure.json map.
//   PreToolUse (Write) hook: asks the user (ask) when a NEW file goes somewhere off the map;
//     denies when it matches a clutter pattern (.bak, *-old.*, "kopya" etc.). sandbox/ is always free.
//   node .claude/hooks/structure-guard.mjs --check   checks every file in git (CI and /findings-tech).
// Without a map (before the kit is set up) it blocks nothing.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readInput, decide, isMain } from './shared.mjs';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// "**" any depth, "*" any name inside one folder, "?" one character
export function globRegex(pattern) {
  let r = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') { r += '(?:.*/)?'; i += 2; } else { r += '.*'; i++; }
    } else if (c === '*') r += '[^/]*';
    else if (c === '?') r += '[^/]';
    else r += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${r}$`, 'i');
}

export function readMap(dir = root) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'structure.json'), 'utf8'));
    return { allow: (m.allow ?? []).map(globRegex), deny: (m.deny ?? []).map(globRegex), raw: m };
  } catch {
    return null;
  }
}

// Returns: null (fine) | { decision: 'deny' | 'ask', reason }
export function check(rel, map) {
  if (!map) return null;
  rel = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (rel.startsWith('sandbox/')) return null;
  const denied = map.deny.find((re) => re.test(rel));
  if (denied) {
    return { decision: 'deny', reason: `"${rel}" dağınıklık kalıbına uyuyor (yedek, eski sürüm, kopya veya geçici dosya). Git geçmişi zaten yedektir; deneme için sandbox/ kullan.` };
  }
  if (map.allow.some((re) => re.test(rel))) return null;
  const top = [...new Set((map.raw.allow ?? []).map((d) => d.split('/')[0]).filter((d) => !d.includes('.') || d.startsWith('.')))].slice(0, 12);
  return {
    decision: 'ask',
    reason: `"${rel}" yapı haritasında yok (.claude/structure.json). Doğru yer muhtemelen şunlardan biri: ${top.join(', ')}. ` +
      'Geçici veya deneme ise sandbox/ altına yaz. Kalıcı yeni bir yer gerekiyorsa bunu teknik karar olarak sor ve haritayı güncelle (docs/architecture/structure.md).',
  };
}

function hook() {
  const g = readInput();
  if (!g) process.exit(0);
  const map = readMap(g.root);
  for (const { path: file, isNew } of g.files) {
    const full = path.resolve(g.dir, file);
    if (isNew === false || (isNew === undefined && fs.existsSync(full))) continue; // new files only
    const rel = path.relative(g.root, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue; // outside the project
    const s = check(rel, map);
    if (s) decide(g.tool, s.decision, `Yapı: ${s.reason}`);
  }
  process.exit(0);
}

function checkAll() {
  const map = readMap();
  if (!map) { console.log('Yapı haritası yok (.claude/structure.json); kontrol atlandı.'); return; }
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const violations = files.map((f) => [f, check(f, map)]).filter(([, s]) => s);
  if (!violations.length) { console.log(`Yapı uyumlu: ${files.length} dosya.`); return; }
  console.error(`Yapı ihlali (${violations.length}):`);
  for (const [f, s] of violations) console.error(`  ${s.decision === 'deny' ? 'YASAK' : 'HARİTA DIŞI'}  ${f}`);
  console.error('Dosyayı doğru yere taşı, sandbox/ altına al veya haritayı (teknik kararla) güncelle.');
  process.exit(1);
}

if (isMain(import.meta.url)) {
  process.argv.includes('--check') ? checkAll() : hook();
}
