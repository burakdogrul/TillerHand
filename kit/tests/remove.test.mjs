// Run: node --test kit/tests/remove.test.mjs
// `kit.mjs remove --project <dir> [--yes]` takes out what the kit put into a project and keeps what the user wrote or changed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as kitApi from '../kit.mjs';
import { approvalPath } from '../../.claude/hooks/gate.mjs';

const { merge } = kitApi;
// namespace import: a missing export fails the unmerge test only, not the whole file
const unmerge = (...a) => {
  assert.equal(typeof kitApi.unmerge, 'function', 'kit.mjs exports unmerge');
  return kitApi.unmerge(...a);
};

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT_MJS = path.join(REPO, 'kit', 'kit.mjs');
let tmp;
const approvals = []; // gate approval files live in the real home folder: always removed in after()

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const hashOf = (s) => crypto.createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');
const node = (...args) => spawnSync(process.execPath, args, { encoding: 'utf8' });
const git = (p, ...a) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a], { cwd: p, encoding: 'utf8' });
const remove = (p, ...args) => node(KIT_MJS, 'remove', '--project', p, ...args);
const exists = (p, rel) => fs.existsSync(path.join(p, rel));
const record = (p) => JSON.parse(read(path.join(p, '.kit.json')));

before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-remove-test-')); });
after(() => {
  for (const f of approvals) fs.rmSync(f, { force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
});

function commitAll(p) {
  assert.equal(git(p, 'add', '-A').status, 0);
  const r = git(p, 'commit', '-qm', 'snapshot');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(git(p, 'status', '--porcelain').stdout, '', 'precondition: the tree is clean');
}

// init + install (+ add-ons) into a fresh folder under tmp. Not committed: callers edit, then commitAll.
function mkProject(name, addons = [], tools = 'claude') {
  const p = path.join(tmp, name);
  let r = node(KIT_MJS, 'init', '--project', p, '--tool', tools);
  assert.equal(r.status, 0, r.stderr);
  r = node(KIT_MJS, 'install', '--type', 'web-saas', ...(addons.length ? ['--addons', addons.join(',')] : []), '--project', p);
  assert.equal(r.status, 0, r.stderr);
  return p;
}

// Every file under p (except .git) -> content
function snapshot(p) {
  const out = {};
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (!rel && e.name === '.git') continue;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else out[r] = fs.readFileSync(path.join(dir, e.name)).toString('base64');
    }
  })(p, '');
  return out;
}

const commandsOf = (hooks) => {
  const found = [];
  (function walk(x) {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (k === 'command' && typeof v === 'string') found.push(v); else walk(v); }
  })(hooks);
  return found;
};

// ---------- AC-71.1 ----------

test('AC-71.1 dry run: exit 0, lists what would go, mentions --yes, changes nothing', () => {
  const p = mkProject('dry');
  commitAll(p);
  const before = snapshot(p);
  const r = remove(p);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\.claude\/hooks\/gate\.mjs/);
  assert.match(r.stdout, /\.claude\/commands\/start\.md/);
  assert.match(r.stdout, /--yes/);
  assert.deepEqual(snapshot(p), before, 'no file added, removed or changed');
});

// ---------- AC-71.2 ----------

test('AC-71.2 --yes removes unchanged kit files, keeps user-changed kit files and user files', () => {
  const p = mkProject('yes');
  const files = record(p).files;
  for (const rel of ['docs/product/prd.md', 'AGENTS.md', '.claude/hooks/gate.mjs', '.claude/commands/start.md']) assert.match(files[rel], /^[0-9a-f]{64}$/, `precondition: ${rel} is a recorded kit file`);
  fs.appendFileSync(path.join(p, 'docs/product/prd.md'), '\nUser requirement: export to CSV.\n');
  fs.appendFileSync(path.join(p, 'AGENTS.md'), '\nUser rule: always answer in Turkish.\n');
  write(path.join(p, 'src/app.ts'), 'export const x = 1;\n');
  const prd = read(path.join(p, 'docs/product/prd.md'));
  const agents = read(path.join(p, 'AGENTS.md'));
  commitAll(p);

  const r = remove(p, '--yes');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(exists(p, '.claude/hooks/gate.mjs'), false, 'unchanged kit hook removed');
  assert.equal(exists(p, '.claude/commands/start.md'), false, 'unchanged kit command removed');
  assert.equal(read(path.join(p, 'docs/product/prd.md')), prd, 'user-changed prd.md kept as is');
  assert.equal(read(path.join(p, 'AGENTS.md')), agents, 'user-changed AGENTS.md kept as is');
  assert.match(r.stdout, /docs\/product\/prd\.md/);
  assert.match(r.stdout, /AGENTS\.md/);
  assert.equal(read(path.join(p, 'src/app.ts')), 'export const x = 1;\n', 'user file untouched');
});

// ---------- AC-71.3 ----------

test('AC-71.3 settings.json: user permission and user hook stay, every kit rule and kit hook goes', () => {
  const p = mkProject('settings');
  const repoSettings = JSON.parse(read(path.join(REPO, '.claude/settings.json')));
  const patch = JSON.parse(read(path.join(REPO, 'kit/templates/web-saas/.claude/settings.merge.json')));
  const kit = merge(repoSettings, patch);
  const kitRules = ['allow', 'ask', 'deny'].flatMap((k) => kit.permissions?.[k] ?? []);
  const kitCommands = commandsOf(kit.hooks);
  assert.ok(kitRules.length > 10 && kitCommands.length > 3, 'precondition: kit has permission rules and hook commands');

  const userHook = { matcher: 'Write', hooks: [{ type: 'command', command: 'node my-own-hook.mjs' }] };
  const file = path.join(p, '.claude/settings.json');
  const s = JSON.parse(read(file));
  s.permissions.allow.push('Bash(make deploy)');
  s.hooks.PreToolUse.push(userHook);
  write(file, JSON.stringify(s, null, 2) + '\n');
  commitAll(p);

  const r = remove(p, '--yes');
  assert.equal(r.status, 0, r.stderr);
  const after = JSON.parse(read(file));
  assert.deepEqual(after.permissions.allow, ['Bash(make deploy)']);
  assert.deepEqual(after.hooks.PreToolUse, [userHook]);
  for (const rule of kitRules) assert.ok(!(after.permissions?.allow ?? []).includes(rule) && !(after.permissions?.ask ?? []).includes(rule), `kit rule gone: ${rule}`);
  const left = commandsOf(after.hooks);
  assert.deepEqual(left, ['node my-own-hook.mjs'], 'only the user hook command is left');
});

test('AC-71.3 settings.json without user edits is deleted', () => {
  const p = mkProject('settings-clean');
  commitAll(p);
  const r = remove(p, '--yes');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(exists(p, '.claude/settings.json'), false);
});

test('AC-71.3 unmerge: reverses merge for nested objects, string arrays and object arrays', () => {
  const cases = [
    [{ own: 1, nest: { u: 'a', deep: { du: true } } }, { kitKey: 2, nest: { k: 'b', deep: { dk: false } } }],
    [{ list: ['u1', 'u2'], keep: 'x' }, { list: ['k1', 'k2'], other: ['k3'] }],
    [{ hooks: { Pre: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'user' }] }] } },
      { hooks: { Pre: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'kit' }] }], Post: [{ matcher: 'Edit', hooks: [] }] } }],
    [{ permissions: { allow: ['Bash(make deploy)'] }, mine: { a: [{ n: 1 }] } }, { permissions: { allow: ['Bash(git status)'], ask: ['Bash(git push:*)'] }, mine: { b: [{ n: 2 }] } }],
  ];
  for (const [a, b] of cases) {
    const aCopy = structuredClone(a);
    assert.deepEqual(unmerge(merge(a, b), b), aCopy);
    assert.deepEqual(unmerge(b, b), {}, 'only kit content: nothing is left');
  }
});

// ---------- AC-71.4 ----------

const appendedLines = (appendFile, baseFile) => {
  const base = fs.existsSync(baseFile) ? read(baseFile).split(/\r?\n/).map((l) => l.trim()) : [];
  return read(appendFile).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !base.includes(l));
};

const outLines = (s) => s.split(/\r?\n/);

test('AC-71.4 .gitignore is never modified (kit block lines are listed for manual removal); .env.example: user lines stay, kit block goes', () => {
  const p = mkProject('append', ['ai']);
  const giBlock = appendedLines(path.join(REPO, 'kit/templates/web-saas/.gitignore.append'), path.join(REPO, '.gitignore'));
  const envBlock = appendedLines(path.join(REPO, 'kit/templates/addons/ai/.env.example.append'), path.join(REPO, '.env.example'));
  assert.ok(giBlock.includes('supabase/.temp/') && envBlock.some((l) => l.startsWith('AI_MODEL_DEFAULT=')), 'precondition: distinctive block lines found');
  assert.ok(read(path.join(p, '.gitignore')).includes('supabase/.temp/') && read(path.join(p, '.env.example')).includes('AI_MODEL_DEFAULT'), 'precondition: blocks were appended');
  fs.appendFileSync(path.join(p, '.gitignore'), '\nmy-secret-dir/\n');
  fs.appendFileSync(path.join(p, '.env.example'), '\nMY_VAR=\n');
  commitAll(p);
  const giBefore = read(path.join(p, '.gitignore'));

  const r = remove(p, '--yes');
  assert.equal(r.status, 0, r.stderr);
  const gi = read(path.join(p, '.gitignore'));
  const env = read(path.join(p, '.env.example'));
  assert.equal(gi, giBefore, '.gitignore is byte-identical: it keeps secrets out of git');
  assert.match(gi, /^my-secret-dir\/$/m);
  for (const l of giBlock) assert.ok(gi.split(/\r?\n/).some((x) => x.trim() === l), `.gitignore kit line still there: ${l}`);
  const lines = outLines(r.stdout);
  assert.ok(lines.some((l) => l.includes('.gitignore')), 'output has a line that mentions .gitignore');
  for (const l of giBlock.filter((x) => !x.startsWith('#'))) assert.ok(lines.some((x) => x.trim() === l), `output lists the kit line for manual removal: ${l}`);
  assert.ok(lines.some((x) => x === '  supabase/.temp/'), 'listed lines are indented by two spaces');
  assert.match(env, /^MY_VAR=$/m);
  for (const l of envBlock) assert.ok(!env.includes(l), `.env.example kit line gone: ${l}`);
});

test('AC-71.4 without user edits: .env.example is deleted, .gitignore stays byte-identical, dry run and --yes list the kit block lines', () => {
  const p = mkProject('append-clean', ['ai']);
  const giBlock = appendedLines(path.join(REPO, 'kit/templates/web-saas/.gitignore.append'), path.join(REPO, '.gitignore'));
  assert.ok(giBlock.includes('supabase/.temp/'), 'precondition: an append block with supabase/.temp/ exists');
  commitAll(p);
  const giBefore = read(path.join(p, '.gitignore'));
  const snap = snapshot(p);

  const dry = remove(p);
  assert.equal(dry.status, 0, dry.stderr);
  assert.deepEqual(snapshot(p), snap, 'dry run changed nothing');
  const dryLines = outLines(dry.stdout);
  assert.ok(dryLines.some((l) => l.includes('.gitignore')), 'dry run mentions .gitignore');
  assert.ok(dryLines.some((l) => l.trim() === 'supabase/.temp/'), 'dry run lists supabase/.temp/');

  const r = remove(p, '--yes');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(exists(p, '.env.example'), false);
  assert.equal(exists(p, '.gitignore'), true, 'deleting .gitignore would expose .env to git');
  assert.equal(read(path.join(p, '.gitignore')), giBefore, '.gitignore is byte-identical');
  assert.ok(outLines(r.stdout).some((l) => l.trim() === 'supabase/.temp/'), '--yes output lists supabase/.temp/');
});

// ---------- AC-71.5 ----------

test('AC-71.5 kit records, state, .kit-new, approval go; empty kit folders go; user content stays', () => {
  const p = mkProject('leftovers');
  write(path.join(p, '.kit.local.json'), JSON.stringify({ kit: 'somewhere' }));
  write(path.join(p, 'docs/product/prd.md.kit-new'), 'kit version\n');
  write(path.join(p, '.claude/state/limit.json'), '{}');
  write(path.join(p, '.claude/commands/my-own.md'), 'my command\n');
  write(path.join(p, 'src/index.ts'), 'export {};\n');
  const approval = approvalPath(p);
  approvals.push(approval);
  fs.mkdirSync(path.dirname(approval), { recursive: true });
  fs.writeFileSync(approval, '{"digest":"x"}');
  commitAll(p);
  assert.equal(fs.existsSync(approval), true, 'precondition: approval record exists');

  const r = remove(p, '--yes');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(exists(p, '.kit.json'), false);
  assert.equal(exists(p, '.kit.local.json'), false);
  assert.equal(exists(p, 'docs/product/prd.md.kit-new'), false);
  assert.equal(exists(p, '.claude/state'), false);
  assert.equal(fs.existsSync(approval), false, 'gate approval record removed');
  assert.equal(exists(p, '.claude/hooks'), false, 'emptied kit folder removed');
  assert.equal(read(path.join(p, 'src/index.ts')), 'export {};\n');
  assert.equal(read(path.join(p, '.claude/commands/my-own.md')), 'my command\n', 'user file inside a kit folder stays with its folder');
});

// ---------- AC-71.6 ----------

test('AC-71.6 refuses the kit repo itself', () => {
  const r = remove(REPO);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /^ERROR: .*kit/im);
  assert.equal(fs.existsSync(KIT_MJS), true);
});

test('AC-71.6 refuses a folder without .kit.json', () => {
  const p = path.join(tmp, 'plain');
  write(path.join(p, 'a.txt'), 'mine\n');
  git(p, 'init', '-q');
  commitAll(p);
  const r = remove(p, '--yes');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /^ERROR: .*\.kit\.json/m);
  assert.equal(read(path.join(p, 'a.txt')), 'mine\n');
});

test('AC-71.6 --yes refuses uncommitted changes, dry run does not; commit then --yes works', () => {
  const p = mkProject('dirty');
  commitAll(p);
  write(path.join(p, 'notes.txt'), 'uncommitted\n');
  let r = remove(p, '--yes');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /commit|stash/i);
  assert.equal(exists(p, '.claude/hooks/gate.mjs'), true, 'nothing deleted');
  assert.equal(exists(p, '.kit.json'), true);
  r = remove(p);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--yes/);
  commitAll(p);
  r = remove(p, '--yes');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(exists(p, '.claude/hooks/gate.mjs'), false);
});

test('AC-71.6 --yes refuses a folder that is not a git repository', () => {
  const p = mkProject('nogit');
  fs.rmSync(path.join(p, '.git'), { recursive: true, force: true });
  const r = remove(p, '--yes');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /^ERROR: .*git/im);
  assert.equal(exists(p, '.claude/hooks/gate.mjs'), true, 'nothing deleted');
  assert.equal(exists(p, '.kit.json'), true);
});

// ---------- ATTACK-71.7 ----------

test('ATTACK-71.7 forged .kit.json entries cannot make remove touch files outside the project or .git', async (t) => {
  const p = mkProject(path.join('atk', 'proj'));
  const base = path.join(tmp, 'atk');
  const content = 'outside data\n';
  const outside = path.join(base, 'outside.txt');
  const abs = path.join(base, 'abs-target.txt');
  const outDir = path.join(base, 'outdir');
  write(outside, content);
  write(abs, content);
  write(path.join(outDir, 'inner.txt'), content);

  let linkFile = true;
  let linkDir = true;
  try { fs.symlinkSync(outside, path.join(p, 'link-file.txt'), 'file'); } catch { linkFile = false; }
  try { fs.symlinkSync(outDir, path.join(p, 'linkdir'), process.platform === 'win32' ? 'junction' : 'dir'); } catch { linkDir = false; }
  // links are not part of the committed tree (git on Windows may not store them as links)
  fs.appendFileSync(path.join(p, '.git/info/exclude'), '\nlink-file.txt\nlinkdir\n');

  const gitConfig = read(path.join(p, '.git/config'));
  const rec = record(p);
  const h = hashOf(content);
  rec.files['../outside.txt'] = h;
  rec.files[abs] = h;
  rec.files['.git/config'] = hashOf(gitConfig);
  if (linkFile) rec.files['link-file.txt'] = h;
  if (linkDir) rec.files['linkdir/inner.txt'] = h;
  write(path.join(p, '.kit.json'), JSON.stringify(rec, null, 2) + '\n');
  commitAll(p);

  const r = remove(p, '--yes');
  const out = r.stdout + r.stderr;
  assert.equal(exists(p, '.claude/hooks/gate.mjs'), false, 'the genuine kit files were still removed');
  assert.match(out, /unsafe|skipped/i);

  await t.test('../ escape', () => {
    assert.equal(read(outside), content);
    assert.ok(out.includes('../outside.txt'), 'reported');
  });
  await t.test('absolute path', () => {
    assert.equal(read(abs), content);
    assert.ok(out.includes('abs-target.txt'), 'reported');
  });
  await t.test('.git/config', () => {
    assert.equal(read(path.join(p, '.git/config')), gitConfig);
    assert.ok(out.includes('.git/config'), 'reported');
  });
  await t.test('symlinked file', { skip: linkFile ? false : 'symlink not permitted' }, () => {
    assert.equal(read(outside), content);
    assert.ok(out.includes('link-file.txt'), 'reported');
  });
  await t.test('path through a symlinked directory', { skip: linkDir ? false : 'symlink not permitted' }, () => {
    assert.equal(read(path.join(outDir, 'inner.txt')), content);
    assert.ok(out.includes('linkdir/inner.txt'), 'reported');
  });
});

// ---------- ATTACK-71.8 ----------

test('ATTACK-71.8 CRLF-converted kit file counts as unchanged, a one-byte change counts as changed', () => {
  const p = mkProject('eol');
  const crlf = '.claude/commands/start.md';
  const edited = 'docs/product/glossary.md';
  const a = read(path.join(p, crlf));
  assert.ok(a.includes('\n') && !a.includes('\r'), 'precondition: LF file');
  write(path.join(p, crlf), a.replace(/\n/g, '\r\n'));
  const g = read(path.join(p, edited));
  const changed = String.fromCharCode(g.charCodeAt(0) ^ 1) + g.slice(1);
  write(path.join(p, edited), changed);
  commitAll(p);

  const r = remove(p, '--yes');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(exists(p, crlf), false, 'CRLF copy removed');
  assert.equal(read(path.join(p, edited)), changed, 'one-byte change kept');
});

// ---------- AC-71.9 ----------

test('AC-71.9 kit-remove command contract: dry run first, asks the user, no commit, not pre-allowed', () => {
  const file = path.join(REPO, '.claude/commands/kit-remove.md');
  assert.equal(fs.existsSync(file), true, '.claude/commands/kit-remove.md exists');
  const text = read(file);
  const lines = text.split(/\r?\n/);
  const runs = lines.map((l, i) => [i, l]).filter(([, l]) => /kit\.mjs["']?\s+remove\b/.test(l));
  const dry = runs.find(([, l]) => !l.includes('--yes'));
  const real = runs.find(([, l]) => l.includes('--yes'));
  assert.notEqual(dry, undefined, 'a remove run without --yes');
  assert.notEqual(real, undefined, 'a remove run with --yes');
  assert.ok(dry[0] < real[0], 'dry run comes before the --yes run');
  assert.match(text, /AskUserQuestion/);
  assert.doesNotMatch(text, /propose a commit/i);
  assert.doesNotMatch(text, /git commit/i);

  const settingsFiles = [path.join(REPO, '.claude/settings.json')];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(full); } else if (e.name === 'settings.merge.json') settingsFiles.push(full);
    }
  })(path.join(REPO, 'kit', 'templates'));
  assert.ok(settingsFiles.length >= 2, 'precondition: found the settings files to check');
  for (const f of settingsFiles) {
    const allow = JSON.parse(read(f)).permissions?.allow ?? [];
    for (const rule of allow) assert.doesNotMatch(rule, /kit\.mjs\W+remove/, `${path.relative(REPO, f)} must not pre-allow remove: ${rule}`);
  }
});

// ---------- AC-71.10 ----------

const hookScriptsIn = (settings) => commandsOf(settings.hooks).flatMap((c) => [...c.matchAll(/\.claude\/hooks\/([\w.-]+\.mjs)/g)].map((m) => `.claude/hooks/${m[1]}`));

test('AC-71.10 a hook of an older kit version (no longer in the kit) goes with its script and settings entries', () => {
  const p = mkProject('old-hook');
  const script = 'console.log("old guard");\n';
  write(path.join(p, '.claude/hooks/old-guard.mjs'), script);
  const rec = record(p);
  rec.files['.claude/hooks/old-guard.mjs'] = hashOf(script);
  write(path.join(p, '.kit.json'), JSON.stringify(rec, null, 2) + '\n');
  const file = path.join(p, '.claude/settings.json');
  const s = JSON.parse(read(file));
  s.hooks.PreToolUse.push({ matcher: 'Write', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/old-guard.mjs"' }] });
  s.permissions.allow.push('Bash(node .claude/hooks/old-guard.mjs --x)');
  write(file, JSON.stringify(s, null, 2) + '\n');
  commitAll(p);

  const r = remove(p, '--yes');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(exists(p, '.claude/hooks/old-guard.mjs'), false);
  if (fs.existsSync(file)) assert.ok(!read(file).includes('old-guard.mjs'), 'no trace of the old hook in settings.json');
});

test('AC-71.10 a user hook inside a kit matcher group survives, no command points at a removed script', () => {
  const p = mkProject('own-in-group');
  const file = path.join(p, '.claude/settings.json');
  const s = JSON.parse(read(file));
  s.hooks.PreToolUse[0].hooks.push({ type: 'command', command: 'node my-own-hook.mjs' });
  write(file, JSON.stringify(s, null, 2) + '\n');
  commitAll(p);

  const r = remove(p, '--yes');
  assert.equal(r.status, 0, r.stderr);
  const after = JSON.parse(read(file));
  assert.ok(commandsOf(after.hooks).includes('node my-own-hook.mjs'), 'user hook command survives');
  const scripts = hookScriptsIn(after);
  for (const rel of scripts) assert.equal(exists(p, rel), true, `settings.json still runs ${rel}, which no longer exists`);
});

// ---------- AC-71.11 ----------

test('AC-71.11 adopt case: .gitignore stays byte-identical (own line and kit block), settings.json and .env.example lose only kit lines', () => {
  const p = path.join(tmp, 'adopt');
  write(path.join(p, '.gitignore'), 'my-own-ignore/\n');
  write(path.join(p, '.claude/settings.json'), JSON.stringify({ permissions: { allow: ['Bash(make x)'] } }, null, 2) + '\n');
  write(path.join(p, '.env.example'), 'OWN=1\n');
  assert.equal(git(p, 'init', '-q').status, 0);
  commitAll(p);
  mkProject('adopt', ['ai']);
  assert.equal(exists(p, '.env.example.kit-new'), true, 'precondition: the kit .env.example waited as .kit-new');
  assert.equal(record(p).files['.env.example'], undefined, 'precondition: the project .env.example is not a recorded kit file');
  assert.match(read(path.join(p, '.env.example')), /^OWN=1$/m);
  assert.match(read(path.join(p, '.env.example')), /AI_MODEL_DEFAULT/, 'precondition: the ai block was appended to the project file');
  commitAll(p);

  const repoSettings = JSON.parse(read(path.join(REPO, '.claude/settings.json')));
  const patch = JSON.parse(read(path.join(REPO, 'kit/templates/web-saas/.claude/settings.merge.json')));
  const kit = merge(repoSettings, patch);
  const kitRules = ['allow', 'ask', 'deny'].flatMap((k) => kit.permissions?.[k] ?? []);
  const envBlock = appendedLines(path.join(REPO, 'kit/templates/addons/ai/.env.example.append'), '');

  const giBefore = read(path.join(p, '.gitignore'));
  assert.match(giBefore, /^supabase\/\.temp\/$/m, 'precondition: the web-saas block was appended to the project .gitignore');

  const r = remove(p, '--yes');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(path.join(p, '.gitignore')), giBefore, '.gitignore is byte-identical');
  assert.match(read(path.join(p, '.gitignore')), /^my-own-ignore\/$/m);
  const s = JSON.parse(read(path.join(p, '.claude/settings.json')));
  assert.deepEqual(s.permissions.allow, ['Bash(make x)']);
  for (const rule of kitRules) assert.ok(!(s.permissions?.ask ?? []).includes(rule), `kit rule gone: ${rule}`);
  const env = read(path.join(p, '.env.example'));
  assert.match(env, /^OWN=1$/m);
  for (const l of envBlock) assert.ok(!env.includes(l), `.env.example kit line gone: ${l}`);
});

// ---------- AC-71.12 ----------

test('AC-71.12 codex: generated skill of a user command stays, kit skills and kit hook config go', () => {
  const p = mkProject('codex', [], 'claude,codex');
  write(path.join(p, '.claude/commands/my-own.md'), '---\ndescription: mine\n---\nDo my thing.\n');
  let r = node(KIT_MJS, 'update', '--project', p);
  assert.equal(r.status, 0, r.stderr);
  const files = record(p).files;
  for (const rel of ['.agents/skills/my-own/SKILL.md', '.agents/skills/start/SKILL.md', '.codex/hooks.json']) assert.match(files[rel], /^[0-9a-f]{64}$/, `precondition: ${rel} is recorded`);
  commitAll(p);

  r = remove(p, '--yes');
  assert.equal(r.status, 0, r.stderr);
  assert.match(read(path.join(p, '.claude/commands/my-own.md')), /Do my thing/);
  assert.match(read(path.join(p, '.agents/skills/my-own/SKILL.md')), /Do my thing/);
  assert.equal(exists(p, '.agents/skills/start/SKILL.md'), false, 'kit skill removed');
  assert.equal(exists(p, '.codex/hooks.json'), false, 'unchanged codex hook config removed');
});

// ---------- ATTACK-71.13 ----------

test('ATTACK-71.13 .kit-new files that are not the kit own stay; a link into .git is not followed', async (t) => {
  const p = mkProject('knew');
  write(path.join(p, 'notes.kit-new'), 'mine\n');
  write(path.join(p, 'src/a.ts.kit-new'), 'mine\n');
  write(path.join(p, '.claude/worktrees/w1/docs/x.md.kit-new'), 'worktree\n');
  const desc = path.join(p, '.git/description');
  assert.equal(fs.existsSync(desc), true, 'precondition: .git/description exists');
  const descText = read(desc);
  let linked = true;
  try { fs.symlinkSync(path.join(p, '.git'), path.join(p, 'lnk'), process.platform === 'win32' ? 'junction' : 'dir'); } catch { linked = false; }
  if (linked) {
    fs.appendFileSync(path.join(p, '.git/info/exclude'), '\nlnk\n');
    const rec = record(p);
    rec.files['lnk/description'] = hashOf(descText);
    write(path.join(p, '.kit.json'), JSON.stringify(rec, null, 2) + '\n');
  }
  commitAll(p);

  const r = remove(p, '--yes');
  const out = r.stdout + r.stderr;
  assert.equal(exists(p, '.claude/hooks/gate.mjs'), false, 'the genuine kit files were still removed');

  await t.test('(a) user .kit-new files stay', () => {
    assert.equal(read(path.join(p, 'notes.kit-new')), 'mine\n');
    assert.equal(read(path.join(p, 'src/a.ts.kit-new')), 'mine\n');
  });
  await t.test('(b) a .kit-new under .claude/worktrees stays', () => {
    assert.equal(read(path.join(p, '.claude/worktrees/w1/docs/x.md.kit-new')), 'worktree\n');
  });
  await t.test('(c) a link into .git is not followed', { skip: linked ? false : 'symlink not permitted' }, () => {
    assert.equal(read(desc), descText);
    assert.match(out, /unsafe|skipped/i);
    assert.ok(out.includes('lnk/description'), 'reported');
  });
});

test('ATTACK-71.13 unmerge: a __proto__ key in the project settings does not pollute the result', () => {
  const result = unmerge(JSON.parse('{"__proto__":{"x":1},"a":1}'), { a: 1 });
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(result.x, undefined);
});

// ---------- AC-71.14 ----------

test('AC-71.14 a type layer the kit no longer has does not stop remove', () => {
  const p = mkProject('gone-type');
  const rec = record(p);
  rec.type = 'old-type-that-does-not-exist';
  write(path.join(p, '.kit.json'), JSON.stringify(rec, null, 2) + '\n');
  commitAll(p);

  let r = remove(p);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(exists(p, '.claude/hooks/gate.mjs'), true, 'dry run changes nothing');
  r = remove(p, '--yes');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(exists(p, '.claude/hooks/gate.mjs'), false);
});

// ---------- AC-71.15 ----------

test('AC-71.15 CLAUDE.md note naming AGENTS.md appears in the dry run and in --yes', () => {
  const p = mkProject('claude-md');
  assert.match(record(p).files['CLAUDE.md'], /^[0-9a-f]{64}$/, 'precondition: CLAUDE.md is a recorded kit file');
  fs.appendFileSync(path.join(p, 'CLAUDE.md'), '\nMy own rule.\n');
  const text = read(path.join(p, 'CLAUDE.md'));
  commitAll(p);

  const dry = remove(p);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^Note: CLAUDE\.md.*AGENTS\.md/m);
  const real = remove(p, '--yes');
  assert.equal(real.status, 0, real.stderr);
  assert.match(real.stdout, /^Note: CLAUDE\.md.*AGENTS\.md/m);
  assert.equal(read(path.join(p, 'CLAUDE.md')), text, 'changed CLAUDE.md stays');
});
