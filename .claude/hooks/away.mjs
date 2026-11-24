#!/usr/bin/env node
// Away mode: node .claude/hooks/away.mjs --on | --off | --status | --push | --hook | --prompt
// While away, nothing waits on an approval prompt: asks are denied and queued (shared.mjs decide), questions follow the
// two-way / one-way rule, and the queue is shown on --off. Only the user turns it on (--on is an ask rule).
// The project's ask rules prompt in every mode, bypass included, and a hook cannot allow past them, so the hook denies
// what they would ask before the prompt opens. git push is an ask rule: --push is the one way to push while away.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findRoot, isMain, isAway, addToQueue, findProgram, decisionText } from './shared.mjs';

export { isAway, addToQueue };
const stateFile = (root) => path.join(root, '.claude', 'state', 'away.json');
const queueFile = (root) => path.join(root, '.claude', 'state', 'away-queue.jsonl');

export function readQueue(root) {
  let lines = [];
  try { lines = fs.readFileSync(queueFile(root), 'utf8').split('\n'); } catch { return []; }
  return lines.flatMap((l) => { try { const x = JSON.parse(l); return x && typeof x === 'object' ? [x] : []; } catch { return []; } });
}

// Claude Code rule forms: Bash(prefix:*) or Bash(exact); Edit(./dir/**) or Edit(./file)
function askRules(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'))?.permissions?.ask ?? []; } catch { return []; }
}
const norm = (s) => String(s).trim().replace(/\s+/g, ' ');
function commandAsked(root, command) {
  // Each part of a chain is checked, as Claude Code does: "git push;echo x" still asks there
  const parts = [norm(command), ...String(command).split(/;|&&|\|\||\||\n/).map(norm).filter(Boolean)];
  return askRules(root).some((r) => {
    const m = /^Bash\((.*)\)$/.exec(r);
    if (!m) return false;
    const rule = norm(m[1]);
    return parts.some((c) => (rule.endsWith(':*') ? c === rule.slice(0, -2) || c.startsWith(`${rule.slice(0, -2)} `) : c === rule));
  });
}
function editAsked(root, file) {
  const rel = path.relative(root, path.resolve(root, String(file))).split(path.sep).join('/');
  return askRules(root).some((r) => {
    const m = /^(?:Edit|Write)\(\.\/(.*)\)$/.exec(r);
    if (!m) return false;
    return m[1].endsWith('/**') ? rel.startsWith(`${m[1].slice(0, -2)}`) : rel === m[1];
  });
}

const deny = (reason) => { console.log(decisionText('claude', 'deny', reason)); process.exit(0); };
const QUESTION = 'Away mode: the user is not here, so this question was queued. If it is a two-way door (easy to undo), pick the recommended option, record it in docs/decisions/log.md as "automatic (away)" and go on. If it is a one-way door (database, auth, payment, data model), park this task and go on with the next independent one.';

function hook(root) {
  let g;
  try { g = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return; }
  if (!g || typeof g !== 'object' || !isAway(root)) return;
  const t = g.tool_input ?? {};
  if (g.tool_name === 'AskUserQuestion') {
    for (const q of Array.isArray(t.questions) ? t.questions : []) addToQueue(root, 'question', q?.question ?? JSON.stringify(q));
    deny(QUESTION);
  }
  if (g.tool_name === 'Bash' && typeof t.command === 'string' && commandAsked(root, t.command)) {
    addToQueue(root, 'command', t.command);
    deny(`Away mode: this command needs the user's approval, so it was queued for when they return; go on with other work.${/^git push\b/.test(norm(t.command)) ? ' To push while away, run: node .claude/hooks/away.mjs --push' : ''}`);
  }
  if ((g.tool_name === 'Edit' || g.tool_name === 'Write') && typeof t.file_path === 'string' && editAsked(root, t.file_path)) {
    addToQueue(root, 'edit', t.file_path);
    deny('Away mode: this file needs the user\'s approval, so the edit was queued for when they return; go on with other work.');
  }
}

if (isMain(import.meta.url)) {
  const [mode, ...rest] = process.argv.slice(2);
  const root = findRoot();
  if (mode === '--on') {
    fs.mkdirSync(path.dirname(stateFile(root)), { recursive: true });
    fs.writeFileSync(stateFile(root), JSON.stringify({ since: new Date().toISOString() }));
    console.log('Away mode is on. Approval prompts are queued instead of waiting; questions and blocked steps are shown on node .claude/hooks/away.mjs --off.');
  } else if (mode === '--status') {
    console.log(isAway(root) ? 'on' : 'off');
  } else if (mode === '--off') {
    try { fs.rmSync(stateFile(root), { force: true }); } catch { /* already off */ }
    const items = readQueue(root);
    console.log(items.length ? items.map((x, i) => `${i + 1}. [${x.kind}] ${x.text}`).join('\n') : 'Nothing queued.');
    try { fs.rmSync(queueFile(root), { force: true }); } catch { /* nothing to clear */ }
  } else if (mode === '--push') {
    // Plain push only: no force, no other remote or refspec
    if (rest.length) { console.error('--push takes no arguments.'); process.exit(1); }
    if (!isAway(root)) { console.error('--push works only in away mode; otherwise push as usual (it asks).'); process.exit(1); }
    const git = findProgram('git', root);
    if (!git) { console.error('git was not found on PATH.'); process.exit(1); }
    const r = spawnSync(git, ['push'], { cwd: root, stdio: 'inherit' });
    process.exit(r.status ?? 1);
  } else if (mode === '--hook') {
    hook(root);
  } else if (mode === '--prompt') {
    if (isAway(root)) console.log('Away mode is on. If the user says they are back, run node .claude/hooks/away.mjs --off and go through the queued items with them.');
  } else {
    console.error('Usage: node .claude/hooks/away.mjs --on | --off | --status | --push');
    process.exit(1);
  }
}
