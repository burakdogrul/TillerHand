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

  assert.equal(run('--cost', 'G-002 iskelet | ilk', 'O', '40', '52', '35', 'not').status, 0);
  assert.ok(read('docs/workflow/cost-log.md', p).trimEnd().endsWith(`| ${today} | G-002 iskelet \\| ilk | O | 40 | 52 | 12 | 35 | not |`));
  assert.match(run('--cost', 'x', 'Q', '1', '2', '3').stderr, /Usage/);
  assert.match(run('--cost', 'x', 'K', '90', '5', '3').stdout, /\| \? \|/, 'the window renewed: the difference is unknown');

  // 3.38.0: --start keeps the start; --cost with only job and size fills start, end and minutes itself
  assert.match(run('--cost', 'x', 'K').stderr, /--start/, 'no start saved yet');
  assert.equal(run('--start', '--limit', '30').status, 0);
  assert.equal(run('--cost', 'G-003 lint', 'K', '--limit', '34').status, 0);
  assert.ok(read('docs/workflow/cost-log.md', p).trimEnd().endsWith(`| ${today} | G-003 lint | K | 30 | 34 | 4 | 0 |  |`));
  assert.match(run('--cost', 'y', 'K').stderr, /--start/, 'the start is used once');

  assert.equal(run('--task', 'G-003 lint', '--did', 'G-002 bitti', '--next', '/build G-003').status, 0);
  const prog = read('docs/workflow/progress.md', p);
  assert.match(prog, new RegExp(`^\\*\\*Son güncelleme:\\*\\* ${today}$`, 'm'));
  assert.match(prog, /^\*\*Aktif görev:\*\* G-003 lint$/m);
  assert.match(prog, /## Son oturumda yapılanlar\n\n- G-002 bitti\n\n## Sıradaki adım\n\n1\. \/build G-003\n\n## /);
  assert.equal(run('--did', 'satır\nkırık').status, 0);
  assert.match(read('docs/workflow/progress.md', p), /- G-002 bitti\n- satır kırık\n/, 'one line per entry');

  assert.equal(run('--check').status, 0);
  fs.writeFileSync(path.join(p, 'docs/workflow/progress.md'), prog.replace('**Aktif faz:**', 'Aktif faz:'));
  const bad = run('--check');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /broken bold labels: Active phase\./, '3.48.0: a broken Turkish label is reported by its English name');
  fs.rmSync(p, { recursive: true, force: true });

  assert.match(read('.claude/commands/build.md'), /progress\.mjs --done/);
  assert.match(read('.claude/settings.json'), /"Bash\(node \.claude\/hooks\/progress\.mjs:\*\)"/);
});
