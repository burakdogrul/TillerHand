#!/usr/bin/env node
// Work plan for a task from its size, the context and the limit (0 tokens): a subagent only where it pays.
// A subagent starts cold (it reads its prompt and the files again); for a small task that costs more than it saves.
//   node .claude/hooks/flow.mjs [--files N] [--context N] [--limit N] [--json]
// Without arguments: files = changed files in git, context = status line (.claude/state/context.json),
// limit = usage.mjs. On the desktop app there is no status line: give --context and --limit from get_usage.
import fs from 'node:fs';
import path from 'node:path';
import { findRoot, isMain } from './shared.mjs';
import { changes } from './commit-gate.mjs';
import { readLimits, level, LEVEL_LABEL } from './usage.mjs';

// Same bands as the cost table in docs/workflow/usage-limits.md §3 (1-2, 3-6, more files)
export function flow({ files, context, level: lvl }) {
  const size = files <= 2 ? 'küçük' : files <= 6 ? 'orta' : 'büyük';
  const clear = context != null && context >= 50;
  // A full main context is paid again on every turn: the code goes out of it
  const code = size === 'küçük' && !clear ? 'ana' : 'alt ajan';
  const base = { küçük: 1, orta: 2, büyük: 3 }[size];
  // Yellow halves the members (rules.md §4); red runs one, so a RET stops before the rest is paid for
  const members = lvl === 'red' ? 1 : lvl === 'yellow' ? Math.ceil(base / 2) : base;
  return { files, context, level: lvl, size, clear, code, docs: code, members, reviewer: true, parallel: lvl !== 'red' };
}

export function flowText(f) {
  const where = (w) => (w === 'ana' ? 'ana oturum' : 'alt ajan');
  return [
    `Akış: ${f.files} dosya · ${f.size} · bağlam ${f.context == null ? 'bilinmiyor' : `%${f.context}`} · limit ${LEVEL_LABEL[f.level]}`,
    `Kod: ${where(f.code)}${f.code === 'ana' ? '' : ' (kod rolü)'}`,
    `Doküman (roadmap, progress, cost-log): ${where(f.docs)}${f.docs === 'ana' ? '' : ' (doküman rolü)'}`,
    `Kurul: ${f.members} üye + code-reviewer, ${f.parallel ? 'paralel' : 'sırayla'} (hassas yolda + security-auditor)`,
    ...(f.clear ? [`Önce /clear öner: bağlam %${f.context}, her tur bunu yeniden okur.`] : []),
  ].join('\n');
}

const readContext = (root) => {
  try { const c = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'state', 'context.json'), 'utf8')); return typeof c.percent === 'number' ? c.percent : null; } catch { return null; }
};

if (isMain(import.meta.url)) {
  const root = findRoot();
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    if (i < 0) return undefined;
    const n = Number(process.argv[i + 1]);
    if (!Number.isFinite(n) || n < 0) { console.error('Kullanım: node .claude/hooks/flow.mjs [--files N] [--context N] [--limit N] [--json]'); process.exit(1); }
    return n;
  };
  const files = arg('--files') ?? (() => { try { return changes().files.length; } catch { return 0; } })();
  const limit = arg('--limit');
  const f = flow({ files, context: arg('--context') ?? readContext(root), level: level(limit != null ? { five_hour: { percent: limit } } : readLimits(root)) });
  console.log(process.argv.includes('--json') ? JSON.stringify(f) : flowText(f));
}
