#!/usr/bin/env node
// Mechanical doc writes at task end, by script instead of a model call (0 tokens, the format cannot drift).
//   node .claude/hooks/progress.mjs --done G-012                     roadmap: [ ] → [x]
//   node .claude/hooks/progress.mjs --cost "<job>" <K|O|B|BOARD|DESIGN|FINDINGS> <start %> <end %> <min> ["<note>"]
//   node .claude/hooks/progress.mjs --start [--limit N]           at task start: keeps the 5-hour % and the time
//   node .claude/hooks/progress.mjs --cost "<job>" <size> ["<note>"] [--limit N]  start from --start, end now (once)
//   node .claude/hooks/progress.mjs --task "<active task>" --did "<done>" --next "<next step>"
//   node .claude/hooks/progress.mjs --check                          progress.md labels the status line and dashboard read
// Every progress write also sets **Son güncelleme:** to today. Flags can be combined in one call.
import fs from 'node:fs';
import path from 'node:path';
import { findRoot, isMain } from './shared.mjs';
import { clean, labels } from './status-read.mjs';
import { readLimits } from './usage.mjs';

const LABELS = ['Son güncelleme', 'Aktif faz', 'Aktif görev', 'Başlangıç adımı', 'Soru modu', 'Profil'];
const SIZES = ['K', 'O', 'B', 'BOARD', 'DESIGN', 'FINDINGS'];
const USAGE = 'Usage: node .claude/hooks/progress.mjs [--done G-NNN] [--start] [--cost "<job>" <K|O|B|BOARD|DESIGN|FINDINGS> [<start %> <end %> <min>] ["<note>"]] [--limit N] [--task "<text>"] [--did "<text>"] [--next "<text>"] [--check]';
// One line per value: a newline would break a label, a list item or a table row
const line = (s) => clean(String(s).replace(/\s*\r?\n\s*/g, ' ')).trim();
const today = () => new Date().toLocaleDateString('sv-SE');
const setLabel = (text, k, v) => text.replace(new RegExp(`^(\\*\\*${k}:\\*\\*).*$`, 'm'), `$1 ${v}`);
const setSection = (text, title, body) => text.replace(new RegExp(`^(## ${title}[^\\n]*\\n)[\\s\\S]*?(?=^## |(?![\\s\\S]))`, 'm'), `$1\n${body}\n\n`);
const section = (text, title) => text.match(new RegExp(`^## ${title}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'))?.[1] ?? '';

export function markDone(text, id) {
  const re = new RegExp(`^(\\s*- )\\[( |x)\\](\\s*${id}:)`, 'mi');
  const m = text.match(re);
  if (!m) return { error: `${id} is not in the roadmap.` };
  if (m[2].toLowerCase() === 'x') return { text, note: `${id} is already marked.` };
  return { text: text.replace(re, '$1[x]$3'), note: `${id} marked done.` };
}

export function costRow(args, date = today()) {
  const [job, size, start, end, min, note = ''] = args;
  const nums = [start, end, min].map(Number);
  if (!job || !SIZES.includes(size) || nums.some((n) => !Number.isFinite(n) || n < 0) || args.length > 6) return null;
  // The end below the start means the 5-hour window renewed in between: the difference is unknown
  const diff = nums[1] >= nums[0] ? nums[1] - nums[0] : '?';
  const cell = (s) => line(s).replace(/\|/g, '\\|');
  return `| ${date} | ${cell(job)} | ${size} | ${nums[0]} | ${nums[1]} | ${diff} | ${nums[2]} | ${cell(note)} |`;
}

export function updateProgress(text, { task, did, next }) {
  let t = setLabel(text, 'Son güncelleme', today());
  if (task != null) t = setLabel(t, 'Aktif görev', line(task));
  if (did != null) {
    const items = section(t, 'Son oturumda yapılanlar').split('\n').map((s) => s.trim()).filter((s) => /^- \S/.test(s));
    t = setSection(t, 'Son oturumda yapılanlar', [...items, `- ${line(did)}`].join('\n'));
  }
  if (next != null) t = setSection(t, 'Sıradaki adım', `1. ${line(next)}`);
  return t;
}

export const missingLabels = (text) => LABELS.filter((k) => !(k in labels(text)));

if (isMain(import.meta.url)) {
  const root = findRoot();
  const file = (rel) => path.join(root, rel);
  const argv = process.argv.slice(2);
  const fail = (msg) => { console.error(msg); process.exit(1); };
  const value = (flag) => { const i = argv.indexOf(flag); return i < 0 ? undefined : argv[i + 1] ?? fail(USAGE); };
  if (!argv.length) fail(USAGE);
  let code = 0;

  const done = value('--done');
  if (done != null) {
    if (!/^G-\d+$/i.test(done)) fail(USAGE);
    const r = markDone(fs.readFileSync(file('docs/product/roadmap.md'), 'utf8'), done.toUpperCase());
    if (r.error) fail(r.error);
    fs.writeFileSync(file('docs/product/roadmap.md'), r.text);
    console.log(r.note);
  }

  // 5-hour %: --limit (desktop app: from get_usage) or the status line's .claude/state/usage.json
  const limit = () => { const v = value('--limit'); const n = v != null ? Number(v) : readLimits(root)?.five_hour?.percent; return Number.isFinite(n) ? n : null; };
  const startFile = file('.claude/state/task-start.json');
  if (argv.includes('--start')) {
    const percent = limit() ?? fail('Could not read the limit: pass --limit <5-hour %> (on desktop, get_usage).');
    fs.mkdirSync(path.dirname(startFile), { recursive: true });
    fs.writeFileSync(startFile, JSON.stringify({ percent, at: Date.now() }));
    console.log(`Task start saved: 5h %${percent}.`);
  }

  const c = argv.indexOf('--cost');
  if (c > -1) {
    const args = [];
    for (let i = c + 1; i < argv.length && !argv[i].startsWith('--'); i++) args.push(argv[i]);
    const auto = args.length <= 3;
    if (auto) {
      // Only job and size (and a note): the start comes from --start, used once so an old start never leaks into the next task
      let start;
      try { start = JSON.parse(fs.readFileSync(startFile, 'utf8')); } catch { fail('No task start: run progress.mjs --start at the start of the task or pass the percentages.'); }
      const end = limit() ?? fail('Could not read the limit: pass --limit <5-hour %> (on desktop, get_usage).');
      args.splice(2, 0, String(start.percent), String(end), String(Math.round((Date.now() - start.at) / 60000)));
    }
    const row = costRow(args) ?? fail(USAGE);
    const log = file('docs/workflow/cost-log.md');
    fs.writeFileSync(log, `${fs.readFileSync(log, 'utf8').trimEnd()}\n${row}\n`);
    if (auto) fs.rmSync(startFile, { force: true });
    console.log(`Cost row added: ${row}`);
  }

  const [task, did, next] = ['--task', '--did', '--next'].map(value);
  if ([task, did, next].some((v) => v != null)) {
    fs.writeFileSync(file('docs/workflow/progress.md'), updateProgress(fs.readFileSync(file('docs/workflow/progress.md'), 'utf8'), { task, did, next }));
    console.log('progress.md updated.');
  }

  if (argv.includes('--check')) {
    const missing = missingLabels(fs.readFileSync(file('docs/workflow/progress.md'), 'utf8'));
    console.log(missing.length ? `progress.md has missing or broken bold labels: ${missing.join(', ')}. Format: **Label:** value` : 'progress.md labels are intact.');
    if (missing.length) code = 1;
  }
  process.exit(code);
}
