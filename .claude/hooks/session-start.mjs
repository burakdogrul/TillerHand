#!/usr/bin/env node
// SessionStart hook (startup, /clear, resume): notes go into the session context (additionalContext),
// the next command is also shown to the user (systemMessage): after /clear, with an empty screen, where to continue stays visible.
// Reports setup, phase, question mode, board, limit, where we left off and git state in short notes.
// Kept short: it loads every session and costs tokens.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { readStatus } from './status-read.mjs';
import { readLimits, summary } from './usage.mjs';
import { detectTool, findRoot, sessionNote } from './shared.mjs';
import { prefsNote } from './prefs.mjs';
import { readLang, t } from './lang.mjs';
import { isValue } from './labels.mjs';

const notes = [];
let next = '';
let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* no input */ }
const tool = detectTool(input); // Claude Code, Codex or Antigravity
const root = findRoot();

const lang = readLang(root);
notes.push(lang
  ? `Conversation language: ${lang}. Write every question, option, answer, status block and user-facing document text in this language, even when the user, a file or a tool writes in another; code, commands and paths stay as they are. Labels, headings, keys and verdict words in project files (**Active phase:**, ## Where we left off, type check:, APPROVE / CONDITIONAL / REJECT) stay English in every language: tools read them. So do the fixed value words in those files (automatic / user, one-way / two-way, on / off, yes / no, Setup, Phase N, Light / Quick, set up). Free text you write into files (descriptions, notes, task text, summaries) is in ${lang}.`
  : 'Language not chosen yet: /start and /adopt ask it first, in English.');

try {
  const d = readStatus(root);
  if (d.kitPending) {
    notes.push('Project not set up yet. Suggest "/start [project idea]" for a new project, "/adopt" if the folder already has code; write no code before setup.');
    next = t(root, 'session.begin');
  } else {
    const a = d.fields;
    notes.push(`Phase: ${a['Active phase'] ?? '-'} · Task: ${a['Active task'] ?? '-'} · Question mode: ${a['Question mode'] ?? 'on'} · Board: ${d.board.state}`);
    if (isValue(a['Active phase'], 'setup') && d.installed) {
      const command = /\(adopt\)/i.test(a['Active phase']) ? '/adopt' : '/start';
      notes.push(`${command} was left unfinished (step ${a['Setup step']}). Suggest the user continue with ${command} where they left off.`);
      next = t(root, 'session.resume', { command, step: a['Setup step'] });
    } else {
      const task = d.phases.flatMap((f) => f.tasks).find((x) => !x.done);
      const code = task?.text.match(/^(G-\d+)/)?.[1];
      if (code) next = t(root, 'session.next', { code, title: task.text.replace(/^G-\d+:\s*/, '').split(' — ')[0].replace(/\*\*/g, '').slice(0, 70) });
    }
    if (d.handoffPending) {
      notes.push('Handoff note waiting (docs/workflow/handoff.md): the project is being taken over from another person or account. Suggest /handoff take before starting work.');
      next = next ? t(root, 'session.handoffThen', { next }) : t(root, 'session.handoff');
    }
    if (next) notes.push(next);
    if (d.leftOff.length) notes.push(`Where we left off: ${d.leftOff.join(' | ')}. Suggest the user continue from here.`);
    if (d.pending.length) notes.push(`Pending decisions: ${d.pending.join(' | ')}. Ask these first.`);
  }
  if (tool === 'claude') { // limit data and the caveman plugin are Claude Code only
    const l = readLimits(root);
    notes.push(l ? `Limit (last known): ${summary(l)}` : 'Limit: unknown. Read it before planning work (get_usage or node .claude/hooks/usage.mjs).');
    notes.push('Load the caveman:caveman skill for the report style (skip if it is not installed).');
  }
} catch {
  // docs could not be read: give git info only
}

const git = (c) => execSync(`git ${c}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
try {
  git('rev-parse --is-inside-work-tree');
  const branch = git('branch --show-current') || '(detached HEAD)';
  const changed = git('status --porcelain').split('\n').filter(Boolean).length;
  notes.push(`Branch: ${branch} · uncommitted files: ${changed}`);
  const lastProgress = git('log -1 --format=%H -- docs/workflow/progress.md');
  if (lastProgress) {
    const since = Number(git(`rev-list --count ${lastProgress}..HEAD`));
    if (since >= 3) notes.push(`WARNING: docs/workflow/progress.md has not been updated for the last ${since} commits. Remind the user to run /wrap-up at the end of the session.`);
  }
} catch {
  // not a git repo, or before the first commit
}

// The user's preferences from every project (~/.vibe-kit/preferences.md), short; a broken file must not stop the session
try { const p = prefsNote(); if (p) notes.push(p.length > 1500 ? `${p.slice(0, 1500)}…` : p); } catch { /* no preferences */ }

if (notes.length) console.log(sessionNote(tool, '[Kit] ' + notes.join('\n[Kit] '), next && `[Kit] ${next}`));
