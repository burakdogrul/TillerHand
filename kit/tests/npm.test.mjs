// Run: node --test "kit/tests/*.test.mjs"
// One-command install (F-09): the kit ships as the npm package tillerhand; `npx tillerhand init` sets up a project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const pkg = JSON.parse(read('package.json'));
// npm and npx are .cmd files on Windows: run through the shell there, with paths quoted (the shell joins arguments)
const WIN = process.platform === 'win32';
const q = (a) => (WIN && /\s/.test(a) ? `"${a}"` : a);
const npm = (args, cwd) => spawnSync('npm', args.map(q), { cwd, encoding: 'utf8', shell: WIN, env: { ...process.env, NODE_TEST_CONTEXT: undefined } });

test('Ö-09.3 the package version is the kit version; publishing stops on a mismatch and uses no token', () => {
  assert.equal(pkg.version, read('kit/VERSION').trim());
  assert.equal(pkg.name, 'tillerhand');
  assert.equal(pkg.bin.tillerhand, 'kit/kit.mjs');
  assert.match(read('kit/kit.mjs'), /^#!\/usr\/bin\/env node/);
  assert.equal(pkg.repository.url, 'git+https://github.com/burakdogrul/TillerHand.git', 'trusted publishing needs the exact repository');
  const wf = read('.github/workflows/npm-publish.yml');
  assert.match(wf, /tags: \['v\*'\]/);
  assert.match(wf, /\[ "\$tag" = "\$pkg" \] && \[ "\$tag" = "\$kit" \]/);
  assert.match(wf, /git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/, 'only a tag on main publishes');
  // The publish right (OIDC) only in the job that runs no repo code
  const [top, testJob, publishJob] = wf.split(/^ {2}(?:test|publish):$/m);
  assert.doesNotMatch(top + testJob, /id-token/);
  assert.match(publishJob, /needs: test[\s\S]*id-token: write/);
  assert.doesNotMatch(publishJob, /node --test|npm (ci|install|test)/);
  for (const m of wf.matchAll(/uses: (\S+)/g)) assert.match(m[1], /@[0-9a-f]{40}$/, `${m[1]} pinned to a commit`);
  assert.doesNotMatch(wf, /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./, 'OIDC, no long-lived token');
});

test('Ö-09.2 the package holds the kit and nothing private', () => {
  const r = npm(['pack', '--dry-run', '--json'], REPO);
  assert.equal(r.status, 0, r.stderr);
  const files = JSON.parse(r.stdout)[0].files.map((f) => f.path);
  for (const f of ['kit/kit.mjs', 'kit/VERSION', 'kit/project/gitignore', 'AGENTS.md', '.claude/hooks/guard-secrets.mjs', 'kit/templates/web-saas/.env.example']) assert.ok(files.includes(f), f);
  const leaks = files.filter((f) => /^\.calisma\/|^\.claude\/state\/|settings\.local\.json$|^sandbox\/|^kit\/(eval|tests)\/|(^|\/)\.env$|\.kit-new$|dashboard\.html$|CLAUDE\.local\.md$/.test(f));
  assert.deepEqual(leaks, []);
  assert.equal(read('kit/project/gitignore'), read('.gitignore'), 'the packed copy of .gitignore matches the kit\'s');
});

test('Ö-09.1 the CLI runs when started through a symlink (npx on Linux/macOS: node_modules/.bin/tillerhand)', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bin-'));
  try {
    // A directory link (a junction on Windows needs no admin right): the started path differs from the real one, as with .bin
    const link = path.join(tmp, 'kit');
    try { fs.symlinkSync(path.join(REPO, 'kit'), link, 'junction'); } catch (e) { return t.skip(`no link: ${e.code}`); }
    const r = spawnSync(process.execPath, [path.join(link, 'kit.mjs'), '--help'], { encoding: 'utf8' });
    assert.match(r.stdout + r.stderr, /Usage:/, 'a silent exit means the main-module check missed the symlink');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('Ö-09.1 npx tillerhand init sets up a project from the package: .gitignore included, the record names the package', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npx-'));
  try {
    const packed = npm(['pack', '--pack-destination', tmp], REPO);
    assert.equal(packed.status, 0, packed.stderr);
    const tgz = path.join(tmp, `tillerhand-${pkg.version}.tgz`);
    const project = path.join(tmp, 'project');
    fs.mkdirSync(project);
    const r = spawnSync('npx', ['--yes', '--package', tgz, 'tillerhand', 'init'].map(q), { cwd: project, encoding: 'utf8', shell: WIN, env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
    assert.equal(r.status, 0, r.stderr);
    const seen = () => `stdout: ${r.stdout}\nstderr: ${r.stderr}\nproject: ${fs.readdirSync(project).join(' ')}\ntmp: ${fs.readdirSync(tmp).join(' ')}`;
    assert.ok(fs.existsSync(path.join(project, '.gitignore')), seen());
    assert.match(fs.readFileSync(path.join(project, '.gitignore'), 'utf8'), /^\.env$/m, '.env stays out of git');
    for (const f of ['AGENTS.md', '.claude/hooks/guard-secrets.mjs', '.claude/settings.json']) assert.ok(fs.existsSync(path.join(project, f)), f);
    for (const f of ['package.json', '.github/workflows/npm-publish.yml', '.github/workflows/kit-tests.yml']) assert.ok(!fs.existsSync(path.join(project, f)), `${f} is the kit's own`);
    assert.equal(JSON.parse(fs.readFileSync(path.join(project, '.kit.json'), 'utf8')).kit, `npx:tillerhand@${pkg.version}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the kit version is the same in the guide (top pill and footer) and both README badges', () => {
  const v = read('kit/VERSION').trim();
  const ev = v.replace(/\./g, '\\.');
  for (const [f, footer] of [['kit/guide.html', 'Version'], ['kit/guide.tr.html', 'Sürüm']]) {
    const guide = read(f);
    assert.match(guide, new RegExp(`<b>v${ev}</b>`), `${f} pill`);
    assert.match(guide, new RegExp(`<span>${footer} ${ev} ·`), `${f} footer`);
  }
  for (const f of ['README.md', 'README.tr.md']) assert.ok(read(f).includes(`-${v}-2a78d6`), `${f} badge`);
});

test('3.29.0 no tracked file of the kit carries a path of the machine it was written on', async () => {
  const { absPathCheck } = await import('../../.claude/hooks/gate.mjs');
  const files = spawnSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
  const r = absPathCheck(REPO, files);
  assert.equal(r.status, 'passed', r.output);
});
