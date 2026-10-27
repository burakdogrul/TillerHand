// Run: node --test "kit/tests/*.test.mjs"
// 3.13 templates: RLS attacker test (F-01), dev/prod split (F-04), complexity budget and refactor round (F-07).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const RLS = 'tests/security/rls.mjs';
const runRls = (env) => spawnSync(process.execPath, ['--test', path.join(ROOT, 'kit/templates/web-saas', RLS)], {
  encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
});

test('F-01 the RLS test is the same in the web and mobile templates, a required CI job', () => {
  assert.equal(read(`kit/templates/mobile/${RLS}`), read(`kit/templates/web-saas/${RLS}`));
  for (const t of ['web-saas', 'mobile']) {
    const ci = read(`kit/templates/${t}/.github/workflows/ci.yml`);
    assert.match(ci, /^ {2}rls:/m, t);
    assert.ok(ci.includes(`node --test ${RLS}`) && ci.includes('supabase@2.120.0 start'), t);
  }
  assert.match(read('.claude/commands/release.md'), /RLS adversarial test \(blocking\)/);
});

test('F-01 the RLS test refuses to run against a non-local Supabase', () => {
  const remote = runRls({ API_URL: 'https://abcd.supabase.co', ANON_KEY: 'a', SERVICE_ROLE_KEY: 's' });
  assert.notEqual(remote.status, 0);
  assert.match(remote.stdout + remote.stderr, /abcd\.supabase\.co yerel değil/);
  const remoteDb = runRls({ API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'a', SERVICE_ROLE_KEY: 's', DB_URL: 'postgresql://u:p@db.prod.com:5432/x' });
  assert.match(remoteDb.stdout + remoteDb.stderr, /yerel değil/);
  assert.match(runRls({}).stdout + runRls({}).stderr, /API_URL, ANON_KEY ve SERVICE_ROLE_KEY yok/);
});

test('F-04 no prod identity in templates: MCP points to the dev project, .env.example has a dev/prod note', () => {
  for (const t of ['web-saas', 'mobile']) {
    const mcp = read(`kit/templates/${t}/.mcp.json`);
    assert.ok(mcp.includes('project_ref=DEV_REF&read_only=true') && !mcp.includes('PROJE_REF'), t);
  }
  for (const t of ['web-saas', 'mobile', 'backend']) assert.match(read(`kit/templates/${t}/.env.example`), /DEVELOPMENT \(dev\)/, t);
  assert.match(read('docs/operations/accounts.md'), /## Ortamlar \(dev \/ prod\)/);
  assert.match(read('.claude/commands/release.md'), /Dev\/prod separation \(blocking\)/);
});

test('F-07 the complexity budget is in all three templates\' CI, the refactor round is in the roadmap', () => {
  for (const t of ['web-saas', 'mobile', 'backend']) assert.ok(read(`kit/templates/${t}/.github/workflows/ci.yml`).includes('node .claude/hooks/budget.mjs --check --base "$BASE"'), t);
  assert.equal((read('docs/product/roadmap.md').match(/Refactor round/g) ?? []).length, 2);
  assert.match(read('.claude/commands/start.md'), /"Refactor round"/);
});

test('F-01 3.13.1 RLS test: does not skip without DB_URL in CI, verifies a change by rereading the row, states what is out of scope', () => {
  const ci = runRls({ API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'a', SERVICE_ROLE_KEY: 's', CI: 'true' });
  assert.notEqual(ci.status, 0);
  assert.match(ci.stdout + ci.stderr, /DB_URL yok/);
  const rls = read(`kit/templates/web-saas/${RLS}`);
  assert.match(rls, /assert\.deepEqual\(\(await admin\.from\(name\)\.select\(\)\.eq\(key, id\)\.single\(\)\)\.data, row/);
  assert.match(rls, /SECURITY DEFINER/);
  assert.ok(rls.includes('update({ ...sample(), [owner]: b.id })'), 'the update writes a value different from the row');
});

test('F-01 3.13.1 CI templates: GITHUB_TOKEN is read-only, the supabase status output is not eval-ed', () => {
  for (const t of ['web-saas', 'mobile', 'backend']) {
    const ci = read(`kit/templates/${t}/.github/workflows/ci.yml`);
    assert.match(ci, /^permissions:\n {2}contents: read$/m, t);
    assert.ok(!/\beval\b/.test(ci), t);
    assert.match(ci, /sir-taramasi:\n.*\n.*\n {4}permissions:\n {6}contents: read\n {6}pull-requests: read/, `${t}: gitleaks reads PR commits in a private repo`);
  }
});

test('Supabase keys use the new names (legacy anon/service_role are retired by the end of 2026); the client pattern catches both', () => {
  for (const f of ['kit/templates/web-saas/.env.example', 'kit/templates/mobile/.env.example', 'kit/templates/web-saas/.github/workflows/ci.yml']) {
    assert.doesNotMatch(read(f), /SUPABASE_(ANON_KEY|SERVICE_ROLE_KEY)/, f);
  }
  assert.match(read('kit/templates/web-saas/.env.example'), /^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=.*\n^SUPABASE_SECRET_KEY=/m);
  assert.match(read('kit/templates/mobile/.env.example'), /^EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/m);
  const rule = JSON.parse(read('.claude/security-patterns.json')).patterns.find((p) => p.rule_name === 'supabase_service_role_client');
  for (const s of ['process.env.SUPABASE_SECRET_KEY', 'service_role', 'process.env.SUPABASE_SERVICE_ROLE_KEY']) assert.match(s, new RegExp(rule.regex), s);
  assert.doesNotMatch('process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', new RegExp(rule.regex));
});

test('format hook: runs Prettier without a shell, so a spaced or quoted path works (web and mobile)', () => {
  for (const t of ['web-saas', 'mobile']) {
    const p = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'proje boşluk & x '));
    const bin = path.join(p, 'node_modules', 'prettier', 'bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, 'prettier.cjs'), "require('fs').writeFileSync(require('path').join(process.cwd(), 'args.json'), JSON.stringify(process.argv.slice(2)));");
    const file = path.join(p, "a b'c.ts");
    const r = spawnSync(process.execPath, [path.join(ROOT, `kit/templates/${t}/.claude/hooks/format.mjs`)], {
      input: JSON.stringify({ tool_input: { file_path: file } }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p },
    });
    assert.equal(r.status, 0, t);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p, 'args.json'), 'utf8')), ['--write', '--log-level', 'warn', file], t);
    fs.rmSync(p, { recursive: true, force: true });
  }
});

test('template copies stay identical (one fix must reach every type)', () => {
  const same = [
    ['.github/workflows/claude-ci-fix.yml', ['web-saas', 'mobile', 'backend']],
    ['.github/workflows/claude-maintenance.yml', ['web-saas', 'mobile', 'backend']],
    ['.claude/hooks/format.mjs', ['web-saas', 'mobile']],
    [RLS, ['web-saas', 'mobile']],
  ];
  for (const [file, types] of same)
    for (const t of types.slice(1)) assert.equal(read(`kit/templates/${t}/${file}`), read(`kit/templates/${types[0]}/${file}`), `${t}/${file} differs from ${types[0]}`);
});

test('every action ref in the kit and template workflows is one that was checked to resolve', () => {
  // Checked 2026-10-26 with: gh api repos/<owner>/<repo>/commits/<ref>. A new or bumped ref must be checked the same way and
  // added here (3.28.4 shipped astral-sh/setup-uv@v10, a tag that does not exist: every backend CI run failed to start).
  const CHECKED = new Set(['actions/checkout@v7', 'actions/setup-node@v7', 'gitleaks/gitleaks-action@v3',
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1',
    'astral-sh/setup-uv@07a047e608db84b3d8c06cd9a7c7dcc9c355c18e', 'anthropics/claude-code-action@925afb53776cf1a2b738c6bdbed37b4d4000ef13']);
  const files = [...fs.readdirSync(path.join(ROOT, '.github/workflows')).map((f) => `.github/workflows/${f}`),
    ...fs.readdirSync(path.join(ROOT, 'kit/templates'), { recursive: true }).map((f) => `kit/templates/${f.replaceAll('\\', '/')}`).filter((f) => /\.github\/workflows\/.+\.ya?ml$/.test(f))];
  for (const f of files) for (const [, ref] of read(f).matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm))
    assert.ok(CHECKED.has(ref), `${f}: ${ref} is not a checked ref`);
});

test('workflows: no ${{ }} expression inside run: (values go through env, so a value is never shell code)', () => {
  const files = [...fs.readdirSync(path.join(ROOT, '.github/workflows')).map((f) => `.github/workflows/${f}`),
    ...fs.readdirSync(path.join(ROOT, 'kit/templates'), { recursive: true }).map((f) => `kit/templates/${f.replaceAll('\\', '/')}`).filter((f) => /\.github\/workflows\/.+\.ya?ml$/.test(f))];
  const found = [];
  for (const f of files) {
    let runIndent = -1;
    read(f).split('\n').forEach((line, i) => {
      const indent = line.match(/^\s*/)[0].length;
      const run = line.match(/^(\s*)(?:-\s*)?run:\s*(.*)$/);
      if (run) { runIndent = /^[|>]/.test(run[2]) ? run[1].length : -1; if (/\$\{\{/.test(run[2])) found.push(`${f}:${i + 1}`); return; }
      if (runIndent >= 0 && line.trim() && indent <= runIndent) runIndent = -1;
      if (runIndent >= 0 && /\$\{\{/.test(line)) found.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(found, []);
});

test('CI repair agent: works on the commit CI saw, skips Dependabot and red security jobs, pinned action', () => {
  const y = read('kit/templates/web-saas/.github/workflows/claude-ci-fix.yml');
  assert.match(y, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.doesNotMatch(y, /ref: \$\{\{ github\.event\.workflow_run\.head_branch \}\}/, 'a branch can move after CI');
  assert.match(y, /actor\.login != 'dependabot\[bot\]'/);
  assert.match(y, /semgrep\|sir-taramasi\|rls/);
  assert.match(y, /claude-code-action@[0-9a-f]{40} # v1/);
  for (const t of ['web-saas', 'mobile', 'backend']) {
    const jobs = [...read(`kit/templates/${t}/.github/workflows/ci.yml`).matchAll(/^ {2}([a-z-]+):$/gm)].map((m) => m[1]);
    for (const j of ['semgrep', 'sir-taramasi']) assert.ok(jobs.includes(j), `${t}: the repair skip list names ${j}, which must exist`);
  }
});
