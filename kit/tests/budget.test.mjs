// Run: node --test "kit/tests/*.test.mjs"
// Complexity budget (F-07): in changed code files, function complexity 15, function 80, file 400 lines.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BUDGET, selectFiles, longFiles, lizardArgs, changedFiles } from '../../.claude/hooks/budget.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, '.claude', 'hooks', 'budget.mjs');
let p;
const sh = (c) => execSync(c, { cwd: p, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
before(() => {
  p = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-'));
  sh('git init -q && git config user.email t@t && git config user.name t');
  write('src/kisa.ts', 'export const a = 1;\n');
  write('README.md', '# x\n');
  sh('git add . && git commit -qm init');
});
after(() => fs.rmSync(p, { recursive: true, force: true }));

test('F-07 thresholds match the decision', () => {
  assert.deepEqual(BUDGET, { complexity: 15, function: 80, file: 400 });
});

test('F-07 only code files are measured; tests, migrations, generated and kit files are excluded', () => {
  assert.deepEqual(selectFiles([
    'src/a.ts', 'app/page.tsx', 'api/odeme.py', 'lib/x.mjs',
    'src/a.test.ts', 'tests/e2e/giris.ts', 'test_api.py', 'supabase/migrations/1.sql', 'alembic/versions/1_x.py',
    'next-env.d.ts', 'src/types.gen.ts', 'dist/app.js', '.claude/hooks/dashboard.mjs', 'README.md', 'package.json',
  ]), ['src/a.ts', 'app/page.tsx', 'api/odeme.py', 'lib/x.mjs']);
});

test('F-07 a file over 400 lines is caught, 400 lines pass', () => {
  write('src/sinir.ts', 'x;\n'.repeat(400));
  write('src/uzun.ts', 'x;\n'.repeat(401));
  assert.deepEqual(longFiles(p, ['src/sinir.ts', 'src/uzun.ts']), [{ file: 'src/uzun.ts', lines: 401 }]);
});

test('F-07 lizard is called with a pinned version and the thresholds', () => {
  assert.deepEqual(lizardArgs(['src/a.ts']), ['-C', '15', '-L', '80', '-w', '--', 'src/a.ts']);
});

test('F-07 changed files: the diff if base is set, the whole repo if missing or zero', () => {
  const base = sh('git rev-parse HEAD');
  write('src/yeni.ts', 'export const b = 2;\n');
  sh('git add src/yeni.ts && git commit -qm yeni');
  assert.deepEqual(changedFiles(p, base), ['src/yeni.ts']);
  assert.ok(changedFiles(p, '').includes('src/kisa.ts'), 'no base: all');
  assert.ok(changedFiles(p, '0000000000000000000000000000000000000000').includes('src/kisa.ts'), 'new branch: all');
  assert.ok(changedFiles(p, 'deadbeefdeadbeef').includes('src/kisa.ts'), 'base missing from the clone: all');
});

test('F-07 --check: passes with no changed code file, a long file turns CI red', () => {
  const base = sh('git rev-parse HEAD');
  write('docs/not.md', 'x\n');
  sh('git add docs/not.md && git commit -qm doc');
  const r = spawnSync(process.execPath, [SCRIPT, '--check', '--base', base], { cwd: p, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /değişen kod dosyası yok/i);
  const base2 = sh('git rev-parse HEAD');
  write('src/dev.ts', 'x;\n'.repeat(450));
  sh('git add src/dev.ts && git commit -qm uzun');
  const r2 = spawnSync(process.execPath, [SCRIPT, '--check', '--base', base2], { cwd: p, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, LIZARD: 'olmayan-lizard-komutu' } });
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /src\/dev\.ts.*450 satır/);
});

test('F-07 build/out/vendor in a subfolder are measured; Turkish paths are kept; base and file names are not taken for flags', () => {
  assert.deepEqual(selectFiles(['src/features/build/x.ts', 'app/out/y.ts', 'build/a.js', 'out/b.js', 'vendor/c.js']), ['src/features/build/x.ts', 'app/out/y.ts']);
  assert.deepEqual(lizardArgs(['-x.ts']).slice(-2), ['--', '-x.ts'], 'files after --');
  const base = sh('git rev-parse HEAD');
  write('src/ödeme.ts', 'export const c = 3;\n');
  sh('git add src/ödeme.ts && git commit -qm tr');
  assert.deepEqual(changedFiles(p, base), ['src/ödeme.ts'], 'diff');
  assert.ok(changedFiles(p, '').includes('src/ödeme.ts'), 'whole repo');
  assert.ok(changedFiles(p, '--output=kotu.txt').includes('src/ödeme.ts'), 'flag-like base: whole repo');
  assert.ok(!fs.existsSync(path.join(p, 'kotu.txt')), 'the git flag does not run');
});
