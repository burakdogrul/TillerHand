// Run: node --test "kit/tests/*.test.mjs"
// Edit round counter (F-05): a security check is suggested on the 5th, 10th ... edit of the same code file in a session.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isCodeFile } from '../../.claude/hooks/edit-rounds.mjs';

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks', 'edit-rounds.mjs');
let p;
before(() => { p = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-rounds-')); });
after(() => fs.rmSync(p, { recursive: true, force: true }));

const run = (input, args = []) => {
  const r = spawnSync(process.execPath, [HOOK, ...args], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
};
const edit = (file, session = 's1') => run({ tool_name: 'Edit', session_id: session, cwd: p, tool_input: { file_path: path.join(p, file), old_string: 'a', new_string: 'b' } });

test('F-05 code file detection', () => {
  for (const f of ['src/a.ts', 'app/page.tsx', 'api/odeme.py', 'x.mjs', 'supabase/migrations/1.sql']) assert.ok(isCodeFile(f), f);
  for (const f of ['docs/workflow/progress.md', 'package.json', 'README.md', '.env.example']) assert.ok(!isCodeFile(f), f);
});

test('F-05 Ö: a note on the 5th edit, silent in between, again on the 10th', () => {
  for (let i = 1; i <= 4; i++) assert.equal(edit('src/a.ts'), null, `edit ${i}`);
  const n = edit('src/a.ts').hookSpecificOutput;
  assert.equal(n.hookEventName, 'PostToolUse');
  assert.match(n.additionalContext, /src\/a\.ts.*edited 5 times/);
  assert.match(n.additionalContext, /semgrep/i);
  for (let i = 6; i <= 9; i++) assert.equal(edit('src/a.ts'), null);
  assert.match(edit('src/a.ts').hookSpecificOutput.additionalContext, /edited 10 times/);
});

test('F-05 the counter resets on a new session; files count separately; docs do not count', () => {
  for (let i = 1; i <= 4; i++) edit('src/b.ts', 's2');
  assert.equal(edit('src/c.ts', 's2'), null, 'another file');
  assert.equal(edit('src/b.ts', 's3'), null, 'new session: edit 1');
  for (let i = 1; i <= 6; i++) assert.equal(edit('docs/not.md', 's3'), null);
});

test('F-05 Antigravity: the note is given once at PreInvocation', () => {
  const ag = { toolCall: { name: 'replace_file_content', args: { TargetFile: path.join(p, 'src/d.ts'), TargetContent: 'a', ReplacementContent: 'b' } }, workspacePaths: [p], conversationId: 'c1' };
  for (let i = 1; i <= 5; i++) assert.deepEqual(run(ag), {}, 'PostToolUse output is an empty object');
  const note = run({ invocationNum: 3, conversationId: 'c1', workspacePaths: [p] }, ['--inject']);
  assert.match(note.injectSteps[0].systemMessage.systemMessage, /src\/d\.ts.*edited 5 times/);
  assert.equal(run({ invocationNum: 4, conversationId: 'c1', workspacePaths: [p] }, ['--inject']), null, 'note given once');
});

test('F-05 the path in the note is safe: a name with special characters is not written, the Semgrep path is quoted and after --', () => {
  const five = (file) => { let n; for (let i = 1; i <= 5; i++) n = edit(file, 'g1'); return n.hookSpecificOutput.additionalContext; };
  const bad = five('src/$(touch x)`id`.ts');
  assert.doesNotMatch(bad, /\$\(|`id`/, 'no command substitution in the note');
  assert.match(bad, /-- "<file path>"/);
  assert.match(five('src/ödeme.ts'), /-- "src\/ödeme\.ts"/, 'a Turkish name is written');
});

test('F-05 a broken state file does not crash; the Antigravity note goes only to the same session', () => {
  const state = path.join(p, '.claude', 'state', 'edit-rounds.json');
  fs.writeFileSync(state, JSON.stringify({ session: 'b1', counts: 'x', pending: 'y' }));
  assert.equal(edit('src/e.ts', 'b1'), null);
  fs.writeFileSync(state, JSON.stringify({ session: 'b1', counts: { 'src/e.ts': '4' }, pending: [] }));
  assert.equal(edit('src/e.ts', 'b1'), null, 'a non-number count starts from zero');
  fs.writeFileSync(state, JSON.stringify({ session: 'c9', counts: {}, pending: ['yabancı not'] }));
  assert.equal(run({ invocationNum: 1, conversationId: 'baska', workspacePaths: [p] }, ['--inject']), null, 'another session\'s note is not given');
});

test('3.17.0 a state file with pre-3.15 keys is not read: counting starts over with the new keys', () => {
  const state = path.join(p, '.claude', 'state', 'edit-rounds.json');
  fs.writeFileSync(state, JSON.stringify({ oturum: 'o1', sayac: { 'src/f.ts': 4 }, bekleyen: [] }));
  edit('src/f.ts', 'o1');
  const d = JSON.parse(fs.readFileSync(state, 'utf8'));
  assert.deepEqual([d.session, d.counts['src/f.ts'], 'sayac' in d], ['o1', 1, false]);
});
