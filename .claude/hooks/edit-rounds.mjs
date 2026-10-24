#!/usr/bin/env node
// Edit round counter: security holes the AI adds pile up as the same code file is edited again and again in one
// session. On the 5th, 10th, ... edit the AI is reminded to run Semgrep and a security check; the work is not blocked.
//   PostToolUse (Write|Edit|MultiEdit, Codex apply_patch) hook: gives the note via additionalContext.
//   On Antigravity PostToolUse carries no output: the note is queued and the PreInvocation hook (--inject) gives it via injectSteps.
// State: .claude/state/edit-rounds.json → { session, counts: { file: n }, pending: [note] }; reset when the session changes.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readInput, findRoot } from './shared.mjs';

export const ROUND = 5;
const CODE = /\.(m?[jt]sx?|cjs|py|go|rb|php|java|kt|swift|rs|sql|vue|svelte)$/i;
export const isCodeFile = (rel) => CODE.test(rel);

const statePath = (root) => path.join(root, '.claude', 'state', 'edit-rounds.json');
// The file may have been broken by hand or by another tool: only fields in the expected shape are taken.
function readState(root) {
  let d;
  try { d = JSON.parse(fs.readFileSync(statePath(root), 'utf8')); } catch { return {}; }
  if (!d || typeof d !== 'object') return {};
  const counts = d.counts && typeof d.counts === 'object' && !Array.isArray(d.counts)
    ? Object.fromEntries(Object.entries(d.counts).filter(([, n]) => Number.isInteger(n) && n > 0)) : {};
  const pending = Array.isArray(d.pending) ? d.pending.filter((x) => typeof x === 'string') : [];
  return { session: d.session, counts, pending };
}
function writeState(root, d) {
  fs.mkdirSync(path.dirname(statePath(root)), { recursive: true });
  fs.writeFileSync(statePath(root), JSON.stringify(d, null, 2));
}

// The AI runs the command in the note: $( ) or ` in a file name must not get into it, so the name is written only if it uses safe characters
const SAFE = /^[\p{L}\p{N}_@./+-]+$/u;
const noteText = (rel, n) => `${SAFE.test(rel) ? rel : 'Adı özel karakter içeren bir dosya'} bu oturumda ${n}. kez düzenlendi. Tekrarlanan AI düzenlemeleri güvenlik açığı biriktirebilir: ` +
  `devam etmeden bu dosyada Semgrep çalıştır (\`semgrep scan --config p/default --config p/owasp-top-ten -- "${SAFE.test(rel) ? rel : '<dosya yolu>'}"\`; kurulu değilse CI'daki semgrep işine bak) ` +
  've değişikliği security-auditor ile gözden geçir. Aynı hatayı 2 denemede çözemediysen dur ve kullanıcıdan yön iste.';

function hook() {
  const g = readInput();
  if (!g) process.exit(0);
  const d = readState(g.root);
  const state = d.session === g.session ? { counts: {}, pending: [], ...d } : { session: g.session, counts: {}, pending: [] };
  const notes = [];
  for (const x of g.files) {
    if (!x.path || x.deleted) continue;
    const rel = path.relative(g.root, path.resolve(g.dir, x.path)).split(path.sep).join('/');
    if (rel.startsWith('..') || !isCodeFile(rel)) continue;
    const n = (state.counts[rel] ?? 0) + 1;
    state.counts[rel] = n;
    if (n % ROUND === 0) notes.push(noteText(rel, n));
  }
  if (g.tool === 'antigravity') state.pending.push(...notes);
  writeState(g.root, state);
  if (g.tool === 'antigravity') console.log('{}');
  else if (notes.length) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: notes.join('\n') } }));
  process.exit(0);
}

// Antigravity PreInvocation: give the queued notes once, only to the session that produced them (a file someone else wrote cannot inject a note)
function inject() {
  const root = findRoot();
  const d = readState(root);
  if (!d.pending?.length || d.session !== readInput()?.session) process.exit(0);
  console.log(JSON.stringify({ injectSteps: d.pending.map((text) => ({ systemMessage: { systemMessage: text } })) }));
  writeState(root, { ...d, pending: [] });
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.argv.includes('--inject') ? inject() : hook();
}
