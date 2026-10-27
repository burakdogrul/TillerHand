// Run: node --test "kit/tests/*.test.mjs"
// /rollback: saving working points, listing, rolling back without deleting history, stashing unsaved work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git, saveCheckpoint, listCheckpoints, restore } from '../../.claude/hooks/checkpoint.mjs';

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'geri-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(root, '.gitignore'), '.env\n');
  return root;
}
const write = (root, f, m) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), m); };
const commit = (root, m) => { git(root, 'add', '-A'); git(root, 'commit', '-qm', m); };

test('rollback: returns to a working point, history and .env are kept, unsaved work is stashed', () => {
  const root = repo();
  write(root, 'app.js', 'calisiyor');
  commit(root, 'feat: ilk');
  const label = saveCheckpoint(root, 'G-001 bitti');
  assert.match(label, /^calisan\/\d{8}-\d{6}$/);

  write(root, 'app.js', 'bozuk');
  write(root, 'yeni.js', 'sonradan eklendi');
  commit(root, 'feat: bozan değişiklik');
  write(root, 'app.js', 'yarım iş');
  write(root, '.env', 'GIZLI=1');

  const { points, commits } = listCheckpoints(root);
  assert.equal(points[0].label, label);
  assert.equal(points[0].note, 'G-001 bitti');
  assert.equal(commits[0].message, 'feat: bozan değişiklik');

  const r = restore(root, label);
  assert.equal(r.changed, true);
  assert.ok(r.stashed, 'unfinished work was stashed');
  assert.equal(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), 'calisiyor');
  assert.equal(fs.existsSync(path.join(root, 'yeni.js')), false, 'a tracked file not in the target was removed');
  assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), 'GIZLI=1', 'a .gitignore file is not touched');
  assert.match(git(root, 'log', '-1', '--format=%s'), /^revert: back to calisan\/.+ \([0-9a-f]+\)$/);
  assert.match(git(root, 'log', '--format=%s'), /feat: bozan değişiklik/, 'history was not deleted');
  assert.match(git(root, 'stash', 'list'), /before rollback/);

  // A rollback can be undone too
  restore(root, 'HEAD~1');
  assert.equal(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), 'bozuk');
});

test('rollback: no working point with unsaved changes; no commit if already in that state', () => {
  const root = repo();
  write(root, 'a.js', '1');
  commit(root, 'ilk');
  write(root, 'a.js', '2');
  assert.throws(() => saveCheckpoint(root), /uncommitted changes/);
  git(root, 'checkout', '--', 'a.js');
  const previous = git(root, 'rev-parse', 'HEAD');
  assert.equal(restore(root, 'HEAD').changed, false);
  assert.equal(git(root, 'rev-parse', 'HEAD'), previous);
  assert.throws(() => restore(root, 'yok-boyle-bir-sey'));
});

test('rollback: the allowed --list/--save prefixes cannot trigger a rollback (the first argument sets the mode)', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks', 'checkpoint.mjs');
  const root = repo();
  write(root, 'a.js', 'ilk');
  commit(root, 'ilk');
  write(root, 'a.js', 'ikinci');
  commit(root, 'ikinci');
  const run = (...arg) => spawnSync('node', [script, ...arg], { cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  run('--list', '--restore', 'HEAD~1', '--yes');
  run('--save', 'x', '--restore', 'HEAD~1', '--yes');
  assert.equal(fs.readFileSync(path.join(root, 'a.js'), 'utf8'), 'ikinci', 'no rollback through an allowed prefix');
  assert.equal(run('--restore', 'HEAD~1', '--yes').status, 0);
  assert.equal(fs.readFileSync(path.join(root, 'a.js'), 'utf8'), 'ilk');
});
