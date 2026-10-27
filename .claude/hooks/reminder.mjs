#!/usr/bin/env node
// UserPromptSubmit hook: in long sessions it repeats the core rules at regular intervals (against context rot)
// and suggests closing the session when the context is very full. stdout is added to the user's message as context.
// Kept short: every reminder costs tokens.
import fs from 'node:fs';
import path from 'node:path';
import { findRoot } from './shared.mjs';
import { readLang } from './lang.mjs';

export const INTERVAL = 12; // every 12 messages
const root = findRoot();
const counterFile = path.join(root, '.claude', 'state', 'reminder.json');

let data = { session: '', count: 0 };
let session = '';
try { session = JSON.parse(fs.readFileSync(0, 'utf8')).session_id ?? ''; } catch { /* no input */ }
try { data = JSON.parse(fs.readFileSync(counterFile, 'utf8')); } catch { /* first run */ }
if (data.session !== session) data = { session, count: 0 };
data.count++;
data.turnAt = Date.now(); // notify.mjs computes the length of long jobs from this
try { fs.mkdirSync(path.dirname(counterFile), { recursive: true }); fs.writeFileSync(counterFile, JSON.stringify(data)); } catch { /* not writable: skip silently */ }

const notes = [];
const lang = readLang(root);
if (lang) notes.push(`[Kit] Reply in ${lang}.`); // every message: the language rule must not fade in long sessions
if (data.count % INTERVAL === 0) {
  notes.push('[Kit reminder] Ask decisions with AskUserQuestion (recommended option first). Do not widen the scope. Follow the board and limit rules. End every answer with the status block.');
}
try {
  const b = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'state', 'context.json'), 'utf8'));
  const percent = b.percent;
  if (percent >= 70) notes.push(`[Kit] Context is ${percent}% full: answer quality may drop. Finish the current step, then suggest /wrap-up and /clear to the user.`);
  else if (percent >= 50 && data.count % 4 === 0) notes.push(`[Kit] Context is ${percent}%: consider suggesting /wrap-up + /clear at a suitable point.`);
} catch { /* no context info */ }

if (notes.length) console.log(notes.join('\n'));
