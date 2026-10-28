// Reads the project state from the docs. Used by statusline, session-start and the dashboard.
// Formats read: **Label:** lines and ## sections in docs/workflow/progress.md, checkboxes under "## Phase" headings
// in docs/product/roadmap.md, the "Decision log" in docs/decisions/log.md and the docs/workflow/board.md tables.
// Labels are read in English: readText turns the Turkish ones of pre-3.48 projects into English.
// Must stay fast: the status line calls it on every refresh (git and heavy reads are in dashboard.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { t } from './lang.mjs';
import { normalize } from './labels.mjs';

// Only a regular file: a folder or a link to a folder named like a test or report file must not throw (EISDIR)
export const readText = (p) => { try { return fs.statSync(p).isFile() ? normalize(fs.readFileSync(p, 'utf8')) : ''; } catch { return ''; } };

export function sections(text, level = '## ') {
  const result = {};
  const re = new RegExp(`^${level}`, 'm');
  for (const part of text.split(re).slice(1)) {
    const [title, ...body] = part.split('\n');
    result[title.trim()] = body.join('\n');
  }
  return result;
}

export const findSection = (b, prefix) => Object.entries(b).find(([k]) => k.startsWith(prefix))?.[1] ?? '';

export function tally(text) {
  const done = (text.match(/^\s*- \[x\]/gim) ?? []).length;
  const left = (text.match(/^\s*- \[ \]/gm) ?? []).length;
  return { done, total: done + left };
}

// Data rows of a Markdown table (header and separator excluded)
export const tableRows = (body = '', minCols = 2) =>
  body.split('\n')
    .filter((s) => s.trim().startsWith('|') && !/^\s*\|\s*:?-/.test(s))
    .map((s) => s.trim().split('|').slice(1, -1).map((c) => c.trim()))
    .filter((c) => c.length >= minCols)
    .slice(1)
    .filter((c) => c.some(Boolean));

// Control characters (ESC sequences) are dropped: these values reach the terminal status line and must not move the
// cursor, rewrite the line or set the clipboard (OSC 52)
export const clean = (s) => s.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');

export const labels = (text) => {
  const a = {};
  for (const [, k, v] of text.matchAll(/^\*\*(.+?):\*\*\s*(.*)$/gm)) a[clean(k).trim()] = clean(v).trim();
  return a;
};

const rows = (b) => (b ?? '').split('\n').map((s) => clean(s).trim())
  .filter((s) => /^([-*]|\d+\.)\s+\S/.test(s)).map((s) => s.replace(/^([-*]|\d+\.)\s+/, '').replace(/^\[[ x]\]\s*/i, ''));

export function readStatus(root) {
  const d = (f) => path.join(root, f);
  const progress = readText(d('docs/workflow/progress.md'));
  const fields = labels(progress);
  const progressSections = sections(progress);

  const roadmap = sections(readText(d('docs/product/roadmap.md')));
  const phases = Object.entries(roadmap)
    .filter(([b]) => /^Phase \d/.test(b))
    .map(([name, body]) => ({
      name, ...tally(body),
      tasks: body.split('\n').map((s) => s.match(/^\s*- \[( |x)\]\s*(.+)$/i)).filter(Boolean)
        .map(([, x, text]) => ({ done: x.toLowerCase() === 'x', text })),
    }));
  const taskCount = phases.reduce((a, f) => ({ done: a.done + f.done, total: a.total + f.total }), { done: 0, total: 0 });

  // 8 columns (with Kapı, kit 2.3+) or the old 7 columns
  const decisions = tableRows(sections(readText(d('docs/decisions/log.md')))['Decision log'], 7)
    .map((c) => (c.length >= 8 ? c : [...c.slice(0, 6), '', c[6]]))
    .map(([no, date, stage, topic, question, chosen, door, decidedBy]) => ({ no, date, stage, topic, question, chosen, door, decidedBy }));

  const checklists = [
    ['statusRead.checklist.security', 'docs/security/checklist.md'], ['statusRead.checklist.release', 'docs/operations/release-checklist.md'],
    ['statusRead.checklist.legal', 'docs/legal/privacy-kvkk.md'], ['statusRead.checklist.ai', 'docs/ai/guide.md'], ['statusRead.checklist.launch', 'docs/product/launch.md'],
  ].filter(([, f]) => fs.existsSync(d(f))).map(([name, f]) => ({ name: t(root, name), file: f, ...tally(readText(d(f))) }));

  let kit = null;
  try { kit = JSON.parse(readText(d('.kit.json'))); } catch { /* not set up */ }

  const boardText = readText(d('docs/workflow/board.md'));
  const boardLabels = labels(boardText);
  const boardSections = sections(boardText);
  const board = {
    state: boardLabels['Status'] ?? 'kurulmadı',
    commitReview: boardLabels['Commit review'] ?? 'açık',
    members: tableRows(boardSections['Members'], 5).map(([member, agent, model, focus, meetings]) => ({ member, agent, model, focus, meetings })),
    meetings: tableRows(boardSections['Meeting log'], 8)
      .map(([no, date, kind, scope, attendees, result, critical, decision]) => ({ no, date, kind, scope, attendees, result, critical, decision })),
  };

  const title = (f) => readText(d(f)).match(/^# (.+)$/m)?.[1].trim();
  return {
    // The project name is in AGENTS.md; in projects before 3.9.0 in CLAUDE.md (the update adds AGENTS.md with a placeholder)
    project: [title('AGENTS.md'), title('CLAUDE.md')].find((a) => a && a !== '[PROJE ADI]') ?? title('AGENTS.md') ?? t(root, 'statusRead.defaultProject'),
    // type: null = set up by init, no type chosen yet (waiting for /start or /adopt)
    installed: !!kit && kit.type !== null,
    kitPending: kit ? kit.type === null : fs.existsSync(d('kit/kit.mjs')),
    kit,
    fields,
    state: (progressSections['Current state'] ?? '').split('\n').filter((s) => s.trim() && !s.startsWith('>')).join(' ').trim(),
    lastSession: rows(progressSections['Done last session']),
    next: rows(progressSections['Next step']),
    pending: rows(progressSections['Pending decisions']),
    issues: rows(progressSections['Open issues / blockers']),
    leftOff: rows(findSection(progressSections, 'Where we left off')),
    handoffPending: /^\*\*Status:\*\*\s*bekliyor/im.test(readText(d('docs/workflow/handoff.md'))),
    phases,
    taskCount,
    decisions,
    checklists,
    board,
  };
}
