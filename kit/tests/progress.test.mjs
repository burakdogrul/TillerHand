// Run: node --test "kit/tests/*.test.mjs"
// Mechanical doc writes by script (3.35.0): roadmap mark, cost-log row and progress labels cost no model call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel, root = ROOT) => fs.readFileSync(path.join(root, rel), 'utf8');
// docs/workflow/progress.md as shipped in 3.47.1 (Turkish labels): projects set up before 3.48 keep this file
const PROGRESS_TR_3_47_1 = [
  '# Progress', '',
  '> This file is loaded into the AI automatically in every session. **Do not exceed 40 lines.**',
  '> It holds only the current state; history lives in `CHANGELOG.md`, `docs/decisions/log.md` and git.',
  '> The status line and the `/dashboard` read the **bold-labeled** lines below; do not break their format.', '',
  '**Son güncelleme:** -', '**Aktif faz:** Başlangıç', '**Aktif görev:** /start', '**Başlangıç adımı:** 0/9',
  '**Soru modu:** açık · kapalı konular: yok', '**Profil:** -', '',
  '## Şu anki durum', '', 'The project has not started yet. Start with `/start [fikir]`.', '',
  '## Son oturumda yapılanlar', '', '- ', '',
  '## Sıradaki adım', '', '1. `/start [proje fikrin, 1-3 cümle]`', '',
  '## Bekleyen kararlar', '', '- ', '',
  '## Kaldığı yer (if stopped because of a limit or midway)', '', '- ', '',
  '## Açık sorunlar / bloklayıcılar', '', '- ', '',
  '## Watch out (notes for the AI)', '', '- ', '',
].join('\n');

test('3.35.0 progress.mjs: marks the roadmap, adds a cost row, updates progress and keeps its labels', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-'));
  for (const f of ['docs/workflow/progress.md', 'docs/product/roadmap.md', 'docs/workflow/cost-log.md']) {
    fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(p, f));
  }
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, '.claude/hooks/progress.mjs'), ...a], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  const today = new Date().toLocaleDateString('sv-SE');

  assert.equal(run('--done', 'G-002').status, 0);
  assert.match(read('docs/product/roadmap.md', p), /^- \[x\] G-002:/m);
  assert.match(read('docs/product/roadmap.md', p), /^- \[ \] G-001:/m, 'only the given task');
  assert.match(run('--done', 'G-002').stdout, /G-002 is already marked/);
  assert.equal(run('--done', 'G-999').status, 1);

  // Sizes are S / M / L (the old K / O / B are refused: templates-lang A-48.21)
  assert.equal(run('--cost', 'G-002 iskelet | ilk', 'M', '40', '52', '35', 'not').status, 0);
  assert.ok(read('docs/workflow/cost-log.md', p).trimEnd().endsWith(`| ${today} | G-002 iskelet \\| ilk | M | 40 | 52 | 12 | 35 | not |`));
  const beforeBad = read('docs/workflow/cost-log.md', p);
  assert.match(run('--cost', 'x', 'Q', '1', '2', '3').stderr, /Usage/);
  assert.equal(read('docs/workflow/cost-log.md', p), beforeBad, 'an unknown size writes nothing');
  assert.match(run('--cost', 'x', 'S', '90', '5', '3').stdout, /\| S \| 90 \| 5 \| \? \|/, 'the window renewed: the difference is unknown');

  // 3.38.0: --start keeps the start; --cost with only job and size fills start, end and minutes itself
  assert.match(run('--cost', 'x', 'S').stderr, /--start/, 'no start saved yet');
  assert.equal(run('--start', '--limit', '30').status, 0);
  assert.equal(run('--cost', 'G-003 lint', 'S', '--limit', '34').status, 0);
  assert.ok(read('docs/workflow/cost-log.md', p).trimEnd().endsWith(`| ${today} | G-003 lint | S | 30 | 34 | 4 | 0 |  |`));
  assert.match(run('--cost', 'y', 'S').stderr, /--start/, 'the start is used once');

  // The shipped template (English since 3.48.0)
  assert.equal(run('--task', 'G-003 lint', '--did', 'G-002 bitti', '--next', '/build G-003').status, 0);
  const prog = read('docs/workflow/progress.md', p);
  assert.match(prog, new RegExp(`^\\*\\*Last updated:\\*\\* ${today}$`, 'm'));
  assert.match(prog, /^\*\*Active task:\*\* G-003 lint$/m);
  assert.match(prog, /## Done last session\n\n- G-002 bitti\n\n## Next step\n\n1\. \/build G-003\n\n## /);
  assert.equal(run('--did', 'satır\nkırık').status, 0);
  assert.match(read('docs/workflow/progress.md', p), /- G-002 bitti\n- satır kırık\n/, 'one line per entry');

  assert.equal(run('--check').status, 0);
  fs.writeFileSync(path.join(p, 'docs/workflow/progress.md'), prog.replace('**Active phase:**', 'Active phase:'));
  const bad = run('--check');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /broken bold labels: Active phase\./);

  // 3.49.0: a pre-3.48 Turkish progress.md (the 3.47.1 template) is not understood: its labels are not written to,
  // and --check reports all six labels as missing
  fs.writeFileSync(path.join(p, 'docs/workflow/progress.md'), PROGRESS_TR_3_47_1);
  run('--task', 'G-003 lint', '--did', 'G-002 bitti', '--next', '/build G-003');
  const tr = read('docs/workflow/progress.md', p);
  for (const line of ['**Son güncelleme:** -', '**Aktif görev:** /start', '**Aktif faz:** Başlangıç']) {
    assert.equal(tr.split('\n').includes(line), true, `the Turkish label line is left as it was: ${line}`);
  }
  assert.doesNotMatch(tr, /^\*\*Aktif görev:\*\* G-003 lint$/m, 'no value is written under a Turkish label');
  assert.doesNotMatch(tr, /## Son oturumda yapılanlar\n\n- G-002 bitti/, 'nothing is appended to a Turkish section');
  const badTr = run('--check');
  assert.equal(badTr.status, 1);
  assert.match(badTr.stdout, /broken bold labels: Last updated, Active phase, Active task, Setup step, Question mode, Profile\./);
  fs.rmSync(p, { recursive: true, force: true });

  assert.match(read('.claude/commands/build.md'), /progress\.mjs --done/);
  assert.match(read('.claude/settings.json'), /"Bash\(node \.claude\/hooks\/progress\.mjs:\*\)"/);
});
