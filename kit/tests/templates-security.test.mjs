// Run: node --test "kit/tests/*.test.mjs"
// 3.13 templates: RLS attacker test (F-01), dev/prod split (F-04), complexity budget and refactor round (F-07).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  assert.match(read('.claude/commands/release.md'), /RLS saldırgan testi \(engelleyici\)/);
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
  for (const t of ['web-saas', 'mobile', 'backend']) assert.match(read(`kit/templates/${t}/.env.example`), /GELİŞTİRME \(dev\)/, t);
  assert.match(read('docs/operations/accounts.md'), /## Ortamlar \(dev \/ prod\)/);
  assert.match(read('.claude/commands/release.md'), /Dev\/prod ayrımı \(engelleyici\)/);
});

test('F-07 the complexity budget is in all three templates\' CI, the refactor round is in the roadmap', () => {
  for (const t of ['web-saas', 'mobile', 'backend']) assert.ok(read(`kit/templates/${t}/.github/workflows/ci.yml`).includes('node .claude/hooks/budget.mjs --check --base "$BASE"'), t);
  assert.equal((read('docs/product/roadmap.md').match(/Refactor turu/g) ?? []).length, 2);
  assert.match(read('.claude/commands/start.md'), /Refactor turu/);
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
