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
const spec = (tur, sinif) => `# Spec\n\n**Tür:** ${tur}\n**Sınıf:** ${sinif}\n\n## Mevcut davranış\n\nx\n`;

test('Ö-21.1 the second bug of the same class raises a proposal; "diğer", free text, empty fields and features do not count', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-'));
  const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
  try {
    write('docs/product/specs/_template.md', spec('hata', 'tarih-saat'));
    write('docs/product/specs/saat-dilimi.md', spec('hata', 'tarih-saat'));
    assert.deepEqual(repeatedBugClasses(p), [], 'one bug is not a repeat');
    write('docs/product/specs/takvim.md', spec('hata', 'TARİH-SAAT').replace(/\n/g, '\r\n'));
    write('docs/product/specs/rapor.md', spec('özellik', 'tarih-saat'));
    for (const [f, cls] of [['a', 'diğer'], ['b', 'DİĞER'], ['c', ''], ['d', ''], ['e', 'saat sorunu'], ['f', 'saat sorunu']]) write(`docs/product/specs/${f}.md`, spec('hata', cls));
    write('docs/product/specs/g.md', spec('hata', '`YETKI`'));
    write('docs/product/specs/h.md', spec('hata', 'yetki,'));
    assert.deepEqual(repeatedBugClasses(p), [{ cls: 'yetki', specs: ['g.md', 'h.md'] }, { cls: 'tarih-saat', specs: ['saat-dilimi.md', 'takvim.md'] }]);
    write('.kit.json', JSON.stringify({ type: 'web-saas', version: '3.24.0' }));
    const html = () => {
      const r = spawnSync(process.execPath, [path.join(REPO, '.claude/hooks/dashboard.mjs'), p, '--quiet'], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8');
    };
    assert.match(html(), /Aynı hata sınıfı 2 kez: tarih-saat[\s\S]{0,300}\/retro/);
    // Answered (rule added or not needed): the alert closes and the question is not asked again
    const decided = (s, answer) => s.replace('\n\n## Mevcut', `\n**Kural:** ${answer} · 2026-10-25\n\n## Mevcut`);
    write('docs/product/specs/saat-dilimi.md', decided(spec('hata', 'tarih-saat'), 'AGENTS.md'));
    write('docs/product/specs/takvim.md', decided(spec('hata', 'tarih-saat'), 'gerek yok'));
    assert.doesNotMatch(html(), /Aynı hata sınıfı \d+ kez: tarih-saat/);
    // A third bug of the class after the answer: the rule did not prevent it, ask again
    write('docs/product/specs/ucuncu.md', spec('hata', 'tarih-saat'));
    assert.match(html(), /Aynı hata sınıfı 3 kez: tarih-saat/);
  } finally {
    fs.rmSync(p, { recursive: true, force: true });
  }
});

test('Ö-21.1 the class list is the same in the template, /fix-bug and the dashboard', () => {
  const template = read('docs/product/specs/_template.md').match(/^\*\*Sınıf:\*\* \[bug only: (.*)\]$/m)[1].split(' / ');
  const fixBug = [...read('.claude/commands/fix-bug.md').match(/write exactly one of this list: (.*?`diğer`)/)[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  assert.deepEqual(template, [...BUG_CLASSES, 'diğer']);
  assert.deepEqual(fixBug, [...BUG_CLASSES, 'diğer']);
});

test('Ö-21.1 no rule file changes without approval', () => {
  const fix = read('.claude/commands/fix-bug.md');
  assert.match(fix, /another bug spec under `docs\/product\/specs\/` has the same `\*\*Sınıf:\*\*` value/);
  assert.match(fix, /Ask with AskUserQuestion, showing the rule text and the target file: Add \/ Later/);
  assert.match(fix, /If there is no approval, write to no rule file/);
  assert.match(fix, /do not add it to `\.gitignore`/);
  for (const c of ['wrap-up', 'retro']) assert.match(read(`.claude/commands/${c}.md`), /The rule goes to the "Öğrenilen kurallar" \(learned rules\) section/, c);
  assert.match(read('.claude/commands/adopt.md'), /auto memory \(0d\)/);
  // The places a rule can land (AGENTS.md, CLAUDE.md, .claude/hookify.*.local.md) are all "ask" in Claude Code
  const ask = JSON.parse(read('.claude/settings.json')).permissions.ask;
  for (const rule of ['Edit(./AGENTS.md)', 'Edit(./CLAUDE.md)', 'Edit(./.claude/**)']) assert.ok(ask.includes(rule), rule);
  assert.match(read('docs/product/specs/_template.md'), /^\*\*Sınıf:\*\* \[bug only: .*\/ diğer\]$/m);
});

test('Ö-21.2 every learned rule carries source and date; /maintain monthly reviews those over 90 days', () => {
  assert.match(read('.claude/commands/fix-bug.md'), /\(kaynak: specs\/<a>\.md, specs\/<b>\.md · YYYY-AA-GG\)/);
  assert.match(read('.claude/commands/retro.md'), /write source and date in the format of `\/fix-bug` step 8/);
  assert.match(read('AGENTS.md'), /## Öğrenilen kurallar\n\n> .*\(kaynak: … · YYYY-AA-GG\)/);
  const monthly = read('.claude/commands/maintain.md').split('\n').find((l) => l.includes('`monthly`:'));
  assert.match(monthly, /hookify\.\*\.local\.md[\s\S]*older than 90 days[\s\S]*Keep[\s\S]*Delete/);
});

test('Ö-21.3 /start asks about auto memory; off is recommended and lands in project settings', () => {
  const start = read('.claude/commands/start.md');
  assert.match(start, /\*\*Auto memory\*\*/);
  assert.match(start, /\*\*Off \(Recommended\):\*\*[^\n]*`"autoMemoryEnabled": false`/);
  assert.match(read('kit/guide.html'), /<h3>Öğrenen kurallar<\/h3>[^\n]*\/fix-bug/);
});
