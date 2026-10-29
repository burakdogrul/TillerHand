// Run: node --test "kit/tests/*.test.mjs"
// Learning rules (F-21): a repeated bug class leads to a rule proposal; nothing is written without approval.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { repeatedBugClasses, BUG_CLASSES } from '../../.claude/hooks/dashboard-data.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const spec = (type, cls) => `# Spec\n\n**Type:** ${type}\n**Class:** ${cls}\n\n## Current behavior\n\nx\n`;

test('Ö-21.1 the second bug of the same class raises a proposal; "other", free text, empty fields and features do not count', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-'));
  const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
  try {
    write('docs/product/specs/_template.md', spec('bug', 'date-time'));
    write('docs/product/specs/time-zone.md', spec('bug', 'date-time'));
    assert.deepEqual(repeatedBugClasses(p), [], 'one bug is not a repeat');
    write('docs/product/specs/calendar.md', spec('bug', 'DATE-TIME').replace(/\n/g, '\r\n'));
    write('docs/product/specs/report.md', spec('feature', 'date-time'));
    for (const [f, cls] of [['a', 'other'], ['b', 'OTHER'], ['c', ''], ['d', ''], ['e', 'clock issue'], ['f', 'clock issue']]) write(`docs/product/specs/${f}.md`, spec('bug', cls));
    // An English class with an I: a Turkish-locale lowercasing must not break it ("AUTHORIZATION" -> "authorızatıon")
    write('docs/product/specs/g.md', spec('bug', '`AUTHORIZATION`'));
    write('docs/product/specs/h.md', spec('bug', 'authorization,'));
    assert.deepEqual(repeatedBugClasses(p), [{ cls: 'date-time', specs: ['calendar.md', 'time-zone.md'] }, { cls: 'authorization', specs: ['g.md', 'h.md'] }]);
    write('.kit.json', JSON.stringify({ type: 'web-saas', version: '3.24.0', lang: 'en' }));
    const html = () => {
      const r = spawnSync(process.execPath, [path.join(REPO, '.claude/hooks/dashboard.mjs'), p, '--quiet'], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8');
    };
    assert.match(html(), /Same bug class 2 times: date-time[\s\S]{0,300}\/retro/);
    // Answered (rule added or not needed): the alert closes and the question is not asked again
    const decided = (s, answer) => s.replace('\n\n## Current', `\n**Rule:** ${answer} · 2026-10-25\n\n## Current`);
    write('docs/product/specs/time-zone.md', decided(spec('bug', 'date-time'), 'AGENTS.md'));
    write('docs/product/specs/calendar.md', decided(spec('bug', 'date-time'), 'not needed'));
    assert.doesNotMatch(html(), /Same bug class \d+ times: date-time/);
    // A third bug of the class after the answer: the rule did not prevent it, ask again
    write('docs/product/specs/third.md', spec('bug', 'date-time'));
    assert.match(html(), /Same bug class 3 times: date-time/);
  } finally {
    fs.rmSync(p, { recursive: true, force: true });
  }
});

test('AC-49.5 learning rules: a Turkish **Kural:** answer does not close the repeated-bug question', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-tr-'));
  const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
  try {
    const answered = (answer) => spec('bug', 'date-time').replace('\n\n## Current', `\n**Kural:** ${answer} · 2026-10-25\n\n## Current`);
    write('docs/product/specs/a.md', answered('AGENTS.md'));
    write('docs/product/specs/b.md', answered('gerek yok'));
    assert.deepEqual(repeatedBugClasses(p), [{ cls: 'date-time', specs: ['a.md', 'b.md'] }], '**Kural:** is not the Rule label');
  } finally {
    fs.rmSync(p, { recursive: true, force: true });
  }
});

test('Ö-21.1 the class list is the same in the template, /fix-bug and the dashboard', () => {
  // The template label is English (**Class:**)
  const template = read('docs/product/specs/_template.md').match(/^\*\*Class:\*\* \[bug only: (.*)\]$/m)[1].split(' / ');
  const fixBug = [...read('.claude/commands/fix-bug.md').match(/write exactly one of this list: (.*?`other`)/)[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  assert.deepEqual(template, [...BUG_CLASSES, 'other']);
  assert.deepEqual(fixBug, [...BUG_CLASSES, 'other']);
});

test('Ö-21.1 no rule file changes without approval', () => {
  const fix = read('.claude/commands/fix-bug.md');
  assert.match(fix, /another bug spec under `docs\/product\/specs\/` has the same `\*\*Class:\*\*` value/);
  assert.match(fix, /Ask with AskUserQuestion, showing the rule text and the target file: Add \/ Later/);
  assert.match(fix, /If there is no approval, write to no rule file/);
  assert.match(fix, /do not add it to `\.gitignore`/);
  for (const c of ['wrap-up', 'retro']) assert.match(read(`.claude/commands/${c}.md`), /The rule goes to the "Learned rules" (\(learned rules\) )?section/, c);
  assert.match(read('.claude/commands/adopt.md'), /auto memory \(0d\)/);
  // The places a rule can land (AGENTS.md, CLAUDE.md, .claude/hookify.*.local.md) are all "ask" in Claude Code
  const ask = JSON.parse(read('.claude/settings.json')).permissions.ask;
  for (const rule of ['Edit(./AGENTS.md)', 'Edit(./CLAUDE.md)', 'Edit(./.claude/**)']) assert.ok(ask.includes(rule), rule);
  assert.match(read('docs/product/specs/_template.md'), /^\*\*Class:\*\* \[bug only: .*\/ other\]$/m);
});

test('Ö-21.2 every learned rule carries source and date; /maintain monthly reviews those over 90 days', () => {
  assert.match(read('.claude/commands/fix-bug.md'), /\(source: specs\/<a>\.md, specs\/<b>\.md · YYYY-MM-DD\)/);
  assert.match(read('.claude/commands/retro.md'), /write source and date in the format of `\/fix-bug` step 8/);
  assert.match(read('AGENTS.md'), /## Learned rules\n\n> .*\(source: … · YYYY-MM-DD\)/);
  const monthly = read('.claude/commands/maintain.md').split('\n').find((l) => l.includes('`monthly`:'));
  assert.match(monthly, /hookify\.\*\.local\.md[\s\S]*older than 90 days[\s\S]*Keep[\s\S]*Delete/);
});

test('Ö-21.3 /start asks about auto memory; off is recommended and lands in project settings', () => {
  const start = read('.claude/commands/start.md');
  assert.match(start, /\*\*Auto memory\*\*/);
  assert.match(start, /\*\*Off \(Recommended\):\*\*[^\n]*`"autoMemoryEnabled": false`/);
  assert.match(read('kit/guide.html'), /<h3>Rules that learn<\/h3>[^\n]*\/fix-bug/);
  assert.match(read('kit/guide.tr.html'), /<h3>Öğrenen kurallar<\/h3>[^\n]*\/fix-bug/);
});
