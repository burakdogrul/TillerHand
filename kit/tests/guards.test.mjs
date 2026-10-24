// Run: node --test "kit/tests/*.test.mjs"
// Package gate, destructive command shield and context percentage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findPackages, check, similarPopular } from '../../.claude/hooks/package-gate.mjs';
import { evaluate, permissionEquivalent } from '../../.claude/hooks/destructive-guard.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');

test('package gate: extracts package names from commands', () => {
  assert.deepEqual(findPackages('npm install -D zod @types/node@20 ./yerel'), [{ eco: 'npm', name: 'zod' }, { eco: 'npm', name: '@types/node' }]);
  assert.deepEqual(findPackages('cd web && pnpm add react-dom@18.3.1'), [{ eco: 'npm', name: 'react-dom' }]);
  assert.deepEqual(findPackages('npx expo install expo-camera'), [{ eco: 'npm', name: 'expo-camera' }]);
  assert.deepEqual(findPackages('uv add "fastapi[standard]>=0.110" httpx'), [{ eco: 'pypi', name: 'fastapi' }, { eco: 'pypi', name: 'httpx' }]);
  assert.deepEqual(findPackages('pip install -r requirements.txt requests==2.32'), [{ eco: 'pypi', name: 'requests' }]);
  assert.deepEqual(findPackages('npm install'), [], 'an install without arguments (lock file) is not checked');
  assert.deepEqual(findPackages('npm run build && git status'), []);
});

test('package gate: catches a name that looks like a popular package', () => {
  assert.equal(similarPopular('npm', 'reacts'), 'react');
  assert.equal(similarPopular('pypi', 'reqeusts'), null, 'a two-letter swap is distance 2');
  assert.equal(similarPopular('pypi', 'request'), 'requests');
  assert.equal(similarPopular('npm', 'react'), null, 'popular itself');
});

const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const now = Date.parse('2026-10-11T00:00:00Z');

test('package gate: registry decisions', async () => {
  const get = (data) => async (url) => data[url.includes('downloads') ? 'downloads' : 'pkg'];
  assert.equal((await check({ eco: 'npm', name: 'olmayan-paket' }, get({ pkg: response(404) }), now)).status, 'missing');
  assert.equal((await check({ eco: 'npm', name: 'taze' }, get({ pkg: response(200, { time: { created: '2026-10-01' } }), downloads: response(200, { downloads: 99999 }) }), now)).status, 'new');
  assert.equal((await check({ eco: 'npm', name: 'sessiz' }, get({ pkg: response(200, { time: { created: '2020-01-01' } }), downloads: response(200, { downloads: 12 }) }), now)).status, 'low');
  assert.equal((await check({ eco: 'npm', name: 'saglam' }, get({ pkg: response(200, { time: { created: '2020-01-01' } }), downloads: response(200, { downloads: 50000 }) }), now)).status, 'ok');
  assert.equal((await check({ eco: 'pypi', name: 'yeni-py' }, get({ pkg: response(200, { releases: { '0.1': [{ upload_time_iso_8601: '2026-10-05T00:00:00Z' }] } }) }), now)).status, 'new');
  assert.equal((await check({ eco: 'pypi', name: 'x' }, async () => { throw new Error('ağ'); }, now)).status, 'unknown');
});

test('shield: destructive commands are denied, normal commands pass', () => {
  const k = (s) => evaluate(s)?.decision ?? 'free';
  const table = 'users';
  assert.equal(k(`psql -c "DROP TABLE ${table}"`), 'deny');
  assert.equal(k(`psql -c 'TRUNCATE ${table}'`), 'deny');
  assert.equal(k(`psql -c 'DELETE FROM ${table}'`), 'deny', 'no WHERE');
  assert.equal(k(`psql -c "DELETE FROM ${table} WHERE id=1"`), 'free');
  assert.equal(k('npx supabase db reset'), 'deny');
  assert.equal(k('npx prisma migrate reset --force'), 'deny');
  assert.equal(k('docker compose down -v'), 'deny');
  assert.equal(k('git clean -fdx'), 'deny');
  assert.equal(k('vercel --prod'), 'ask');
  assert.equal(k('npx -y vercel@63.1.1 deploy --prod'), 'ask', 'prod deploy via pinned npx');
  assert.equal(k('npx vercel@63.1.1 promote https://app-abc.vercel.app'), 'ask', 'promoting a preview to prod');
  assert.equal(k('vercel rollback'), 'ask', 'prod rollback');
  assert.equal(k('npx -y vercel@63.1.1 deploy'), 'free', 'preview deploy');
  assert.equal(k('vercel --scope ekip promote https://app-abc.vercel.app'), 'ask', 'promote even with a flag in between');
  assert.equal(k('npx vercel@63.1.1 -t $TOKEN rollback'), 'ask', 'rollback even with a flag in between');
  assert.equal(k('vercel deploy --target=production'), 'ask', '--target=production');
  assert.equal(k('vercel deploy --target production'), 'ask', '--target production');
  assert.equal(k('vercel deploy --target preview'), 'free');
  assert.equal(k('vercel deploy --target "production"'), 'ask', 'quoted target');
  assert.equal(k("vercel deploy --target='prod'"), 'ask', 'quoted = target');
  assert.equal(k('vercel deploy --target    production'), 'ask', 'many spaces');
  assert.equal(k('vercel --scope ekip "promote" https://a.vercel.app'), 'ask', 'quoted subcommand');
  // The same command once the shell removes quotes and escapes: the rules also apply to the unquoted text
  assert.equal(k('vercel deploy --pro""d'), 'ask', 'quote inside a word');
  assert.equal(k("vercel deploy --'prod'"), 'ask');
  assert.equal(k('vercel pro\\mote https://a.vercel.app'), 'ask', 'backslash escape');
  assert.equal(k("vercel deploy $'--prod'"), 'ask', "$'..' string");
  assert.equal(k('psql -c "DR""OP TABLE users"'), 'deny', 'quote inside SQL');
  assert.equal(k('git commit -m "it\'s fine"'), 'free', 'an ordinary quoted command is free');
  assert.equal(permissionEquivalent('git reset --ha"rd" HEAD~1')?.decision, 'deny', 'the permission equivalent also unquotes');
  // When in doubt, ask: obfuscation mark + guarded keyword (no attempt to emulate the shell)
  assert.equal(k('vercel deploy --pr\\\nod'), 'ask', 'trailing \\');
  assert.equal(k("vercel deploy $'\\x2d\\x2dprod'"), 'ask', 'ANSI-C escape');
  assert.equal(k('vercel pro$()mote https://a.vercel.app'), 'ask', 'empty substitution');
  assert.equal(k('git reset --ha${X}rd HEAD~1'), 'ask', 'variable fragment');
  assert.equal(k('psql -c "DR`true`OP TABLE users"'), 'ask', 'backtick substitution');
  assert.equal(k('rm -r$@f build'), 'ask', '$@ fragment');
  assert.equal(k('echo $(date) && npm run build'), 'free', 'obfuscation but no guarded word');
  assert.equal(k("vercel deploy $'--target=preview'"), 'free', 'preview');
  assert.equal(k('git push origin main'), 'ask');
  assert.equal(k('psql postgres://u:p@db.ornek-prod.com:5432/app -c "select 1"'), 'ask', 'remote database');
  assert.equal(k('psql postgres://u:p@localhost:5432/app -c "select 1"'), 'free');
  assert.equal(k('npm run test && git status'), 'free');
  assert.equal(k('git push origin ozellik/fatura'), 'free');
});

test('F-04 shield: prod environment variables cannot be pulled onto the agent\'s machine', () => {
  const k = (s) => evaluate(s)?.decision ?? 'free';
  assert.equal(k('vercel env pull .env.local --environment=production'), 'deny');
  assert.equal(k('npx -y vercel@63.1.1 env pull --environment production'), 'deny');
  assert.equal(k('vercel pull --yes --environment=prod'), 'deny');
  assert.equal(k('vercel --environment production env pull'), 'deny', 'flag before the subcommand');
  assert.equal(k('vercel env pull --environment "production"'), 'deny', 'quoted');
  assert.equal(k('vercel env pull .env.local'), 'free', 'default: development');
  assert.equal(k('vercel env pull --environment=preview'), 'free');
  assert.equal(k('vercel env pull --environment "development"'), 'free', 'quoted development');
  assert.equal(k('vc env pull --environment=production'), 'deny', 'vc short name');
  assert.equal(k('vc deploy --prod'), 'ask', 'prod deploy with vc');
  assert.equal(k('vc promote https://a.vercel.app'), 'ask');
  assert.equal(k('vercel env pull --environment=$ORTAM'), 'ask', 'environment from a variable');
  assert.equal(k('vercel pull --environment $(cat ortam)'), 'ask', 'environment from command substitution');
  assert.equal(k('vercel env pull --environment=staging'), 'ask', 'unknown environment');
  assert.equal(k('vercel env pull --environment=pro$()duction'), 'ask', 'obfuscated pull');
});

test('F-02 shield: a command that changes or deletes a test file from the shell is asked, running tests is free', () => {
  const k = (s) => evaluate(s)?.decision ?? 'free';
  for (const s of [
    "sed -i 's/expect/x/' src/a.test.ts", 'rm src/a.test.ts', 'rm -r tests/', 'echo x > src/a.test.ts',
    "cat >> kit/tests/x.test.mjs <<'EOF'", 'mv tests/a.test.ts src/a.ts', 'git checkout -- tests/a.test.ts',
    'Set-Content tests\\a.test.ts x', 'npm run lint && rm "src/a.test.ts"', 'perl -pi -e s/a/b/ odeme_test.py',
    "sed -e 's/a/b/' -i tests/a.test.ts", "sed --in-place 's/a/b/' a.test.ts", "sed -i 's/x/y/' package.json",
    'rm vitest.config.ts', 'echo {} > conftest.py',
  ]) assert.equal(k(s), 'ask', s);
  for (const s of [
    'npx vitest run src/a.test.ts', 'node --test "kit/tests/*.test.mjs" 2>&1 | grep fail', 'cat tests/a.test.ts',
    'rm -r node_modules && npx vitest run src/a.test.ts', 'node --test kit/tests/a.test.mjs > sonuc.txt',
  ]) assert.equal(k(s), 'free', s);
});

test('context percentage: the status line shows the ready field or the token count', () => {
  const bar = (cw) => spawnSync(process.execPath, [path.join(HOOKS, 'statusline.mjs')], {
    input: JSON.stringify({ workspace: { project_dir: os.tmpdir() }, context_window: cw }), encoding: 'utf8',
  }).stdout;
  assert.match(bar({ used_percentage: 41.6 }), /bağlam %42/);
  assert.match(bar({ context_window_size: 200000, current_usage: { input_tokens: 1000, cache_read_input_tokens: 99000, output_tokens: 5000 } }), /bağlam %50 ⚠/);
  assert.doesNotMatch(bar(null), /bağlam/);
});

test('structure guard: map, sandbox, clutter patterns', async () => {
  const { globRegex, check: checkPath } = await import('../../.claude/hooks/structure-guard.mjs');
  assert.ok(globRegex('src/features/*/components/**').test('src/features/invoice/components/List.tsx'));
  assert.ok(!globRegex('src/features/*/components/**').test('src/features/invoice/random/List.tsx'));
  assert.ok(globRegex('docs/**').test('docs/a/b/c.md'));
  assert.ok(globRegex('next.config.*').test('next.config.mjs'));
  const map = {
    allow: ['README.md', 'docs/**', 'src/features/*/components/**', 'src/lib/**'].map(globRegex),
    deny: ['**/*.bak', '**/*-old.*', '**/* copy*'].map(globRegex),
    raw: { allow: ['README.md', 'docs/**', 'src/features/*/components/**', 'src/lib/**'] },
  };
  assert.equal(checkPath('src/features/invoice/components/List.tsx', map), null);
  assert.equal(checkPath('sandbox/deneme.ts', map), null, 'sandbox is free');
  assert.equal(checkPath('src/utils/x.ts', map)?.decision, 'ask', 'off the map is asked');
  assert.equal(checkPath('src/lib/db-old.ts', map)?.decision, 'deny', 'an old-version file is denied');
  assert.equal(checkPath('docs/plan copy.md', map)?.decision, 'deny');
  assert.equal(checkPath(['src', 'lib', 'db.ts'].join(String.fromCharCode(92)), map), null, 'Windows separator');
  assert.equal(checkPath('herhangi.txt', null), null, 'no map: free');
});

test('edit lock: inside the folder is free, outside and a similarly named folder are denied', async () => {
  const { allowedInLock } = await import('../../.claude/hooks/freeze-guard.mjs');
  const root = path.resolve(os.tmpdir(), 'kilit-kok');
  assert.equal(allowedInLock('src/features/auth/login.ts', 'src/features/auth', root), true);
  assert.equal(allowedInLock(path.join(root, 'src/features/auth/x.ts'), 'src/features/auth/', root), true, 'absolute path and trailing /');
  assert.equal(allowedInLock('src/features/authz/x.ts', 'src/features/auth', root), false, 'a prefix match is not enough');
  assert.equal(allowedInLock('src/lib/db.ts', 'src/features/auth', root), false);
  assert.equal(allowedInLock('docs/workflow/progress.md', 'src/features/auth', root), true, 'the progress note is free');
});

test('edit lock: the hook rejects outside writes while locked, free once unlocked', async () => {
  const fs = await import('node:fs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kilit-'));
  const run = (args, input) => spawnSync('node', [path.join(HOOKS, 'freeze-guard.mjs'), ...args], { input, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  const write = (f) => JSON.stringify({ tool_input: { file_path: path.join(root, f) } });
  assert.equal(run([], write('src/lib/x.ts')).stdout, '', 'silent without a lock');
  assert.match(run(['--set', 'src/features/auth'], '').stdout, /src\/features\/auth/);
  assert.match(run([], write('src/lib/x.ts')).stdout, /"permissionDecision":"deny"/);
  assert.equal(run([], write('src/features/auth/a.ts')).stdout, '');
  run(['--off'], '');
  assert.equal(run([], write('src/lib/x.ts')).stdout, '');
});

test('edit lock: the allowed --set prefix cannot remove or widen the lock, only narrow it', async () => {
  const fs = await import('node:fs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kilit2-'));
  const run = (...args) => spawnSync('node', [path.join(HOOKS, 'freeze-guard.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  const lock = () => JSON.parse(fs.readFileSync(path.join(root, '.claude/state/freeze.json'), 'utf8')).dir;
  run('--set', 'src/features/auth');
  run('--set', 'x', '--off');
  assert.equal(lock(), 'src/features/auth', 'a trailing --off does not remove the lock');
  assert.equal(run('--set', '.').status, 1, 'the lock cannot widen to the whole project');
  assert.equal(run('--set', 'src').status, 1, 'cannot widen to a parent folder');
  assert.equal(run('--set', 'src/features/auth/login').status, 0, 'narrowing is free');
  assert.equal(lock(), 'src/features/auth/login');
  run('--off');
  assert.equal(fs.existsSync(path.join(root, '.claude/state/freeze.json')), false);
});
