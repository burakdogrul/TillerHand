// Run: node --test "kit/tests/*.test.mjs"
// Copies a template clone into a temp folder and tests the install and update flows end to end.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { merge, migrateSettings } from '../kit.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT_MJS = path.join(REPO, 'kit', 'kit.mjs');
let tmp;

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s);
const hashOf = (s) => crypto.createHash('sha256').update(s).digest('hex');
const node = (...args) => spawnSync(process.execPath, args, { encoding: 'utf8' });

// Mimics a new project opened from the template with "Use this template"
function cloneKit(name) {
  const target = path.join(tmp, name);
  fs.cpSync(REPO, target, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)$/.test(src) && !src.endsWith('.kit.json') });
  return target;
}
const installType = (p, ...args) => node(path.join(p, 'kit', 'kit.mjs'), 'install', ...args);
const update = (p, ...args) => node(KIT_MJS, 'update', '--project', p, ...args);
const record = (p) => JSON.parse(read(path.join(p, '.kit.json')));

before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-test-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('merge: inherited and __proto__ keys are not merged into', () => {
  const r = merge({ a: 1 }, JSON.parse('{"__proto__": {"x": 1}, "constructor": {"y": 2}, "b": 2}'));
  assert.equal(Object.getPrototypeOf(r), Object.prototype, 'the prototype is not replaced');
  assert.equal(r.x, undefined);
  assert.deepEqual(r.constructor, { y: 2 }, 'an own key named like an inherited one is a plain value');
  assert.equal(r.b, 2);
});

test('merge: objects deep, arrays without duplicates', () => {
  assert.deepEqual(merge({ a: [1, 2], b: { c: 1 } }, { a: [2, 3], b: { d: 2 } }), { a: [1, 2, 3], b: { c: 1, d: 2 } });
});

test('install: web-saas + ai', () => {
  const p = cloneKit('web');
  const r = installType(p, '--type', 'web-saas', '--addons', 'ai');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(path.join(p, 'kit')), 'kit/ deleted');
  assert.match(read(path.join(p, 'docs/architecture/stack.md')), /Next\.js/, 'the stack placeholder was replaced by the type file');
  assert.ok(fs.existsSync(path.join(p, 'docs/design/design-guide.md')));
  assert.ok(fs.existsSync(path.join(p, 'docs/ai/guide.md')));
  assert.ok(fs.existsSync(path.join(p, '.claude/structure.json')) && fs.existsSync(path.join(p, 'docs/architecture/structure.md')), 'structure map and its guide');
  assert.ok(fs.existsSync(path.join(p, '.claude/findings/protocol.md')) && fs.existsSync(path.join(p, '.claude/commands/findings-business.md')), 'findings system');
  assert.ok(!fs.existsSync(path.join(p, '.github/workflows/kit-tests.yml')), 'the kit-only workflow is not carried into the project');
  for (const sk of ['source-research', 'logo-design', 'ui-motion', 'motion-video']) assert.ok(fs.existsSync(path.join(p, `.claude/skills/${sk}/SKILL.md`)), `skill: ${sk}`);
  assert.match(read(path.join(p, 'README.md')), /\[PROJECT NAME\]/, 'README is the project template (English since 3.48.0)');
  const s = JSON.parse(read(path.join(p, '.claude/settings.json')));
  assert.ok(s.hooks.PostToolUse && s.hooks.PreToolUse && s.statusLine && s.enabledPlugins, 'settings merged');
  assert.ok(s.permissions.allow.includes('Bash(npm run lint)') && s.permissions.allow.includes('Bash(git status)'));
  const gi = read(path.join(p, '.gitignore'));
  assert.ok(gi.includes('dashboard.html') && gi.includes('node_modules/'), '.gitignore = common + type');
  const env = read(path.join(p, '.env.example'));
  assert.ok(env.includes('NEXT_PUBLIC_SUPABASE_URL') && env.includes('AI_MODEL_DEFAULT'), '.env.example = type + AI');
  assert.ok(!fs.readdirSync(p, { recursive: true }).some((f) => /\.(append|merge\.json)$/.test(f)), 'the patch file was not copied');
  const k = record(p);
  assert.equal(k.type, 'web-saas');
  assert.deepEqual(k.addons, ['ai']);
  assert.ok(k.files['.claude/commands/start.md'] && k.files['docs/architecture/stack.md']);
});

test('install: stops before deleting kit/ when the clone has uncommitted work', () => {
  const p = cloneKit('dirty');
  const git = (...a) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: p, encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'first');
  fs.appendFileSync(path.join(p, 'kit', 'kit.mjs'), '\n// local change\n');
  const r = installType(p, '--type', 'backend');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Uncommitted changes found/);
  assert.ok(fs.existsSync(path.join(p, 'kit', 'kit.mjs')) && !fs.existsSync(path.join(p, '.kit.json')), 'nothing changed');
  git('commit', '-qam', 'second');
  assert.equal(installType(p, '--type', 'backend').status, 0, 'committed work can be restored from git: install runs');
});

test('lang install: the template path carries the chosen language into .kit.json, no lang without a valid choice', () => {
  const p = cloneKit('lang');
  fs.mkdirSync(path.join(p, '.claude/state'), { recursive: true });
  write(path.join(p, '.claude/state/lang.json'), JSON.stringify({ lang: 'en' }));
  const r = installType(p, '--type', 'backend');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(record(p).lang, 'en', 'state lang written into .kit.json');
  for (const [name, state] of [['lang-missing', null], ['lang-broken', JSON.stringify({ lang: '../x' })], ['lang-json', '{"lang": ']]) {
    const q = cloneKit(name);
    fs.rmSync(path.join(q, '.claude/state/lang.json'), { force: true }); // the developer's own choice must not leak into the clone
    fs.mkdirSync(path.join(q, '.claude/state'), { recursive: true }); // .claude/state is gitignored: a clean checkout has no such folder
    if (state !== null) write(path.join(q, '.claude/state/lang.json'), state);
    const s = installType(q, '--type', 'backend');
    assert.equal(s.status, 0, s.stderr);
    assert.equal(record(q).lang, undefined, `${name}: no lang field`);
  }
});

test('install: does not run twice, an invalid type is rejected', () => {
  const p = cloneKit('twice');
  assert.equal(installType(p, '--type', 'none').status, 1);
  assert.equal(installType(p, '--type', 'mobile', '--keep-kit').status, 0);
  assert.equal(installType(p, '--type', 'mobile', '--keep-kit').status, 1);
});

test('update: scenarios', () => {
  const p = cloneKit('gnc');
  assert.equal(installType(p, '--type', 'backend').status, 0);
  let r = update(p);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /No changes\./);

  const k = record(p);
  const f1 = '.claude/commands/plan-task.md'; write(path.join(p, f1), 'old kit'); k.files[f1] = hashOf('old kit');
  const f2 = '.claude/commands/review-changes.md'; write(path.join(p, f2), 'user'); k.files[f2] = hashOf('old kit');
  const f3 = 'docs/security/checklist.md'; write(path.join(p, f3), 'user note');
  const f4 = 'docs/product/launch.md'; fs.rmSync(path.join(p, f4));
  const f5 = 'docs/product/glossary.md'; fs.rmSync(path.join(p, f5)); delete k.files[f5];
  write(path.join(p, 'CLAUDE.md'), 'project rule');
  fs.writeFileSync(path.join(p, '.kit.json'), JSON.stringify(k));

  r = update(p);
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(read(path.join(p, f1)), 'old kit', '(1) an untouched kit file was updated');
  assert.equal(read(path.join(p, f2)), 'user', '(2) the user change was kept');
  assert.ok(fs.existsSync(path.join(p, f2 + '.kit-new')), '(2) .kit-new was left');
  assert.equal(read(path.join(p, f3)), 'user note', '(3) kit unchanged: not touched');
  assert.ok(!fs.existsSync(path.join(p, f3 + '.kit-new')));
  assert.ok(!fs.existsSync(path.join(p, f4)), '(4) a deleted file did not come back');
  assert.ok(fs.existsSync(path.join(p, f5)), '(5) a new kit file was added');
  assert.equal(read(path.join(p, 'CLAUDE.md')), 'project rule', '(6) a project-owned file was not touched');
});

test('update: AI add-on added later', () => {
  const p = cloneKit('ek');
  assert.equal(installType(p, '--type', 'mobile').status, 0);
  assert.ok(!fs.existsSync(path.join(p, 'docs/ai/guide.md')));
  const r = update(p, '--addons', 'ai');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(p, 'docs/ai/guide.md')));
  const env = read(path.join(p, '.env.example'));
  assert.equal(env.split('AI_MODEL_DEFAULT').length, 2, 'the patch was appended once');
  update(p, '--addons', 'ai');
  assert.equal(read(path.join(p, '.env.example')).split('AI_MODEL_DEFAULT').length, 2, 'not appended again');
  assert.deepEqual(record(p).addons, ['ai']);
});

test('init: the kit stays in its own folder, the project is set up in its folder', () => {
  const game = path.join(tmp, 'game');
  fs.mkdirSync(game);
  fs.cpSync(cloneKit('game-kit'), path.join(game, 'git_repo'), { recursive: true });
  const kitMjs = path.join(game, 'git_repo', 'kit', 'kit.mjs');
  fs.writeFileSync(path.join(game, 'git_repo', 'CLAUDE.local.md'), 'personal note'); // install from a local folder
  // Git-ignored personal files and secrets of a local kit checkout (3.16.2)
  const personal = ['.claude/settings.local.json', '.claude/state/gate.json', '.env', '.env.local', 'secrets/key.txt', 'debug.log', 'CLAUDE-SECURITY-1/r.md'];
  for (const f of personal) {
    fs.mkdirSync(path.dirname(path.join(game, 'git_repo', f)), { recursive: true });
    fs.writeFileSync(path.join(game, 'git_repo', f), '{}');
  }
  const r = node(kitMjs, 'init', '--project', game);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(path.join(game, 'CLAUDE.local.md')), 'the personal CLAUDE.local.md is not copied into the project');
  assert.ok(!fs.existsSync(path.join(game, 'LICENSE')), "the kit's license is not the project's license");
  assert.ok(!fs.existsSync(path.join(game, '.claude-plugin')), 'the kit marketplace is not copied into the project');
  for (const f of personal) assert.ok(!fs.existsSync(path.join(game, f)), `${f} is not copied into the project`);
  for (const f of ['CLAUDE.md', 'README.md', '.claude/commands/start.md', '.claude/commands/adopt.md', 'docs/workflow/progress.md', '.git']) {
    assert.ok(fs.existsSync(path.join(game, f)), `${f} installed`);
  }
  assert.ok(!fs.existsSync(path.join(game, 'kit')), 'the kit\'s own folder was not copied into the project');
  assert.ok(fs.existsSync(kitMjs), 'the kit folder was not touched');
  assert.match(read(path.join(game, '.gitignore')), /^git_repo\/$/m);
  assert.match(read(path.join(game, 'README.md')), /^# \[PROJECT NAME\]/m, 'the project\'s README template (English since 3.48.0)');
  assert.deepEqual([record(game).type, record(game).kit], [null, 'git_repo']);
  const statusText = spawnSync(process.execPath, [path.join(game, '.claude/hooks/statusline.mjs')], { input: JSON.stringify({ workspace: { project_dir: game } }), encoding: 'utf8' }).stdout;
  assert.match(statusText, /Kit not set up.*\/adopt/, 'no language chosen before setup: English');
  assert.notEqual(node(kitMjs, 'init', '--project', game).status, 0, 'a second init is refused');

  const k = node(kitMjs, 'install', '--type', 'web-saas', '--project', game);
  assert.equal(k.status, 0, k.stderr);
  assert.equal(record(game).type, 'web-saas');
  assert.equal(read(path.join(game, 'docs/architecture/stack.md')), read(path.join(REPO, 'kit/templates/web-saas/docs/architecture/stack.md')), 'the type\'s stack.md overwrote the common placeholder');
  assert.deepEqual(fs.readdirSync(game, { recursive: true }).filter((f) => f.endsWith('.kit-new')), [], 'no conflicts in an empty project');
  assert.ok(fs.existsSync(kitMjs), 'install did not delete the kit folder');
  assert.match(update(game).stdout, /No changes\./);
});

test('init: in a non-empty folder it does not touch the project\'s files', () => {
  const p = path.join(tmp, 'old-project');
  const file = { 'CLAUDE.md': '# Old\n- Always use pnpm\n', '.gitignore': 'node_modules\n', 'package.json': '{"name":"old"}\n', '.claude/settings.json': '{"model":"x","permissions":{"allow":["Bash(pnpm test)"]}}\n', '.env.example': 'OLD=\n' };
  for (const [f, s] of Object.entries(file)) { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); write(path.join(p, f), s); }
  const r = node(path.join(cloneKit('old-kit'), 'kit', 'kit.mjs'), 'init', '--project', p);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(path.join(p, 'CLAUDE.md')), file['CLAUDE.md'], 'the old CLAUDE.md stays');
  assert.ok(fs.existsSync(path.join(p, 'CLAUDE.md.kit-new')) && /CLAUDE\.md/.test(r.stdout), 'the kit\'s CLAUDE.md is beside it');
  assert.equal(read(path.join(p, 'package.json')), file['package.json']);
  assert.match(read(path.join(p, '.gitignore')), /^node_modules$/m);
  assert.match(read(path.join(p, '.gitignore')), /^\.env$/m, 'the kit\'s .gitignore lines were added');
  const settings = JSON.parse(read(path.join(p, '.claude/settings.json')));
  assert.equal(settings.model, 'x', 'the project\'s setting stayed');
  assert.ok(settings.permissions.allow.includes('Bash(pnpm test)') && settings.hooks, 'permissions and the kit\'s hooks merged');
  const k = node(path.join(tmp, 'old-kit', 'kit', 'kit.mjs'), 'install', '--type', 'web-saas', '--project', p);
  assert.equal(k.status, 0, k.stderr);
  assert.equal(read(path.join(p, '.env.example')), file['.env.example'], 'the project\'s .env.example is still there');
  assert.ok(fs.existsSync(path.join(p, '.env.example.kit-new')));
  // 3.29.0: the kit clone outside the project is this machine's path: it stays out of the committed .kit.json
  const kitDir = path.join(tmp, 'old-kit');
  assert.equal(record(p).kit, 'local');
  assert.ok(!read(path.join(p, '.kit.json')).includes(path.basename(tmp)), 'no machine path in .kit.json');
  assert.equal(JSON.parse(read(path.join(p, '.kit.local.json'))).kit, kitDir);
  assert.match(read(path.join(p, '.gitignore')), /^\.kit\.local\.json$/m);
});

test('update: an old .kit.json with an absolute kit path is moved to .kit.local.json', () => {
  const p = cloneKit('old-path');
  assert.equal(installType(p, '--type', 'backend', '--keep-kit').status, 0);
  const old = { ...record(p), kit: path.join(tmp, 'old-kit') }; // a kit folder that exists on this machine
  fs.writeFileSync(path.join(p, '.kit.json'), JSON.stringify(old));
  fs.rmSync(path.join(p, '.kit.local.json'), { force: true });
  const r = update(p);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\.kit\.local\.json/);
  assert.equal(record(p).kit, 'local');
  assert.equal(JSON.parse(read(path.join(p, '.kit.local.json'))).kit, old.kit);
  assert.match(read(path.join(p, '.gitignore')), /^\.kit\.local\.json$/m);
  // Written on another machine (another OS's form too): not copied into .kit.local.json, /start and /adopt ask
  fs.rmSync(path.join(p, '.kit.local.json'));
  for (const elsewhere of ['Z:\\other\\machine\\kit', '/other/machine/kit']) {
    fs.writeFileSync(path.join(p, '.kit.json'), JSON.stringify({ ...old, kit: elsewhere }));
    const u = update(p);
    assert.equal(u.status, 0, u.stderr);
    assert.match(u.stdout, /does not exist on this machine/, elsewhere);
    assert.equal(record(p).kit, 'local');
    assert.ok(!fs.existsSync(path.join(p, '.kit.local.json')));
  }
});

test('session start: the next command is shown to the user (after /clear)', () => {
  const session = (p) => JSON.parse(spawnSync(process.execPath, [path.join(p, '.claude/hooks/session-start.mjs')], {
    encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, HOME: p, USERPROFILE: p }, // not the developer's preferences
  }).stdout);
  const p = cloneKit('session');
  assert.match(session(p).systemMessage, /\/start/);
  assert.equal(installType(p, '--type', 'backend').status, 0);
  const progress = path.join(p, 'docs/workflow/progress.md');
  // 3.48.0: the shipped progress.md is English; the label must exist, so the replace never silently does nothing
  const set = (label, value) => {
    const re = new RegExp(`^\\*\\*${label}:\\*\\* .*$`, 'm');
    assert.match(read(progress), re, `the template has **${label}:**`);
    write(progress, read(progress).replace(re, `**${label}:** ${value}`));
  };
  // 3.49.0: installed without a language choice, the messages are English
  set('Setup step', '4/9');
  assert.match(session(p).systemMessage, /Continue: \/start \(step 4\/9\)/);
  set('Active phase', 'Phase 0');
  const filePath = path.join(p, 'docs/product/roadmap.md');
  write(filePath, read(filePath).replace('- [ ] G-001', '- [x] G-001'));
  const o = session(p);
  assert.match(o.systemMessage, /Next: \/build G-002 · Project skeleton set up/);
  assert.match(o.hookSpecificOutput.additionalContext, /\/build G-002/);

  const handoff = path.join(p, 'docs/workflow/handoff.md');
  write(handoff, '# Handoff note\n\n**Status:** waiting\n**From:** a\n');
  assert.match(session(p).systemMessage, /Handoff note waiting: \/handoff take/);
  const r = node(path.join(p, '.claude/hooks/dashboard.mjs'), p);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(read(path.join(p, 'dashboard.html')).includes('Handoff note waiting'), 'the dashboard shows the handoff note in the alert list');
  write(handoff, read(handoff).replace('waiting', 'taken over'));
  assert.match(session(p).systemMessage, /Next: \/build G-002/);
  // An old Turkish handoff note is not understood: no handoff suggestion
  write(handoff, '# Devir notu\n\n**Durum:** bekliyor\n');
  assert.doesNotMatch(session(p).systemMessage, /\/handoff take/);
});

test('status line and dashboard: before and after setup', () => {
  const statusBar = (p) => spawnSync(process.execPath, [path.join(p, '.claude/hooks/statusline.mjs')], {
    input: JSON.stringify({ workspace: { project_dir: p } }), encoding: 'utf8',
  }).stdout;
  const p = cloneKit('status');
  assert.match(statusBar(p), /Kit not set up/, 'no language chosen before setup: English');
  assert.equal(installType(p, '--type', 'web-saas').status, 0);
  const progress = path.join(p, 'docs/workflow/progress.md');
  // 3.48.0: the shipped progress.md is English (Turkish labels are covered in labels-readers.test.mjs)
  assert.match(read(progress), /^\*\*Active phase:\*\* .*$/m);
  assert.match(read(progress), /^\*\*Question mode:\*\* .*$/m);
  write(progress, read(progress).replace(/^\*\*Active phase:\*\* .*$/m, '**Active phase:** Phase 1').replace(/^\*\*Question mode:\*\* .*$/m, '**Question mode:** on · closed topics: design'));
  const decisions = path.join(p, 'docs/decisions/log.md');
  const separator = '|---|---|---|---|---|---|---|---|\n';
  assert.ok(read(decisions).includes(separator), 'decision log has 8 columns');
  write(decisions, read(decisions).replace(separator, separator + '| 1 | 2026-01-01 | Setup | tech | Framework? | Next.js | one-way | user |\n'));
  // 3.49.0: installed without a language choice, the status line and the dashboard are English
  assert.match(statusBar(p), /▶ Phase 1 · .* · task 0\/\d+ · questions: open \(closed: design\)/);
  const r = node(path.join(p, '.claude/hooks/dashboard.mjs'), p);
  assert.equal(r.status, 0, r.stderr);
  const html = read(path.join(p, 'dashboard.html'));
  assert.ok(html.includes('Next.js') && html.includes('step now'), 'the dashboard shows the decision and the active phase');
  assert.ok(html.includes('Needs attention') && (html.match(/role="tab"/g) ?? []).length === 10, 'dashboard: alert area and 10 tabs');
});

test('3.19.1 update removes the allowed Playwright CLI rules; the user\'s own rule stays', () => {
  const kit = JSON.parse(read(path.join(REPO, '.claude', 'settings.json')));
  const pw = ['open', 'snapshot', 'console', 'requests', 'screenshot'].map((c) => `Bash(npx -y @playwright/cli@0.1.22 ${c}:*)`);
  const own = 'Bash(npx -y @playwright/cli@0.1.22 snapshot --depth=2)';
  const { settings: s, removed } = migrateSettings({ permissions: { allow: ['Bash(npm run dev)', ...pw, own] } }, kit);
  assert.deepEqual(removed.sort(), pw.map((r) => `allow: ${r}`).sort());
  assert.ok(!s.permissions.allow.some((r) => pw.includes(r)));
  assert.ok(s.permissions.allow.includes(own) && s.permissions.allow.includes('Bash(npm run dev)'));
});

test('3.15.0 update settings migration: missing kit permission rules are added, project rules stay, hooks are not touched', () => {
  const kit = JSON.parse(read(path.join(REPO, '.claude', 'settings.json')));
  const stop = (flag) => ({ Stop: [{ hooks: [{ type: 'command', command: `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dashboard.mjs" ${flag}` }] }] });
  // 3.49.0: the five Turkish-named allow rules (--plan-kaydet, --plan-bitir, --gerekli, --olc, --kapat) left OLD_RULES:
  // the kit no longer carries Turkish names and there is no migration for them
  // AC-49.22: the last three Turkish-named ask rules (--plan-ekle, --onayla, --ac) left OLD_RULES too: OLD_RULES holds no
  // Turkish-named rule, so they are not removed any more; in a project they are plain rules and stay
  const oldAllow = [];
  const oldAsk = [];
  const formerKit = ['Bash(node .claude/hooks/freeze-guard.mjs --plan-ekle:*)', 'Bash(node .claude/hooks/gate.mjs --onayla)', 'Bash(node .claude/hooks/tools.mjs --ac:*)'];
  // The user's own rule that only looks like an old one (another script, another spelling) stays
  const own = ['Bash(npm test)', 'Bash(node scripts/x.mjs --onayla)', 'Bash(node .claude/hooks/tools.mjs --ac)'];
  const old = { permissions: { allow: [own[0], ...oldAllow, own[1]], ask: [...oldAsk, ...formerKit, own[2]] }, hooks: stop('--sessiz') };
  const { settings: s, added, removed } = migrateSettings(old, kit);
  assert.ok(added.includes('ask: Bash(node .claude/hooks/freeze-guard.mjs --plan-add:*)'), 'added rules are listed for the report');
  assert.ok(s.permissions.ask.includes('Bash(node .claude/hooks/freeze-guard.mjs --plan-add:*)'), 'new ask rule added');
  assert.ok(s.permissions.ask.includes('Bash(node .claude/hooks/tools.mjs --enable:*)'));
  assert.deepEqual(removed, [], 'no old kit rule is in this project: nothing removed');
  assert.deepEqual(s.permissions.ask.slice(0, formerKit.length), formerKit, 'the Turkish-named rules are not in OLD_RULES: kept, in order');
  assert.deepEqual(s.permissions.allow.slice(0, 2), own.slice(0, 2), 'project rules kept, in order');
  assert.ok(s.permissions.ask.includes(own[2]));
  // 3.49.0 (K19): the old-install rewrite of the Turkish dashboard flag is gone; a hook command is never rewritten
  assert.deepEqual(s.hooks, stop('--sessiz'), 'the old Turkish flag is not read or rewritten');
  const save = 'Bash(node .claude/hooks/freeze-guard.mjs --plan-save:*)';
  const moved = migrateSettings({ permissions: { allow: [save] } }, kit).settings.permissions;
  assert.ok(!moved.allow.includes(save) && moved.ask.includes(save), '3.28.0: --plan-save moves from allow to ask');
  const broad = 'Bash(node .claude/hooks/tools.mjs:*)';
  const narrowed = migrateSettings({ permissions: { allow: [broad] } }, kit).settings.permissions;
  assert.ok(!narrowed.allow.includes(broad) && narrowed.ask.includes('Bash(node .claude/hooks/tools.mjs --enable:*)'), '3.10.0 broad tools.mjs rule is removed');
  assert.deepEqual(migrateSettings(s, kit), { settings: s, added: [], removed: [] }, 'running again changes nothing');
  for (const bad of [null, 'x', { permissions: 'abc' }, { permissions: { allow: 'xyz' } }, { permissions: { allow: { a: 1 } } }])
    assert.throws(() => migrateSettings(bad, kit), Error, 'a broken shape is reported, not merged');
  assert.deepEqual(old.hooks, stop('--sessiz'), 'the input is not mutated');
});

test('3.49.2: ATTACK update removes the whole-script lang.mjs allow rule (it allowed --write); the four narrow rules arrive, the user\'s own rules stay', () => {
  const kit = JSON.parse(read(path.join(REPO, '.claude', 'settings.json')));
  const broad = 'Bash(node .claude/hooks/lang.mjs:*)';
  const narrow = ['Bash(node .claude/hooks/lang.mjs --show)', 'Bash(node .claude/hooks/lang.mjs --check)',
    'Bash(node .claude/hooks/lang.mjs --export:*)', 'Bash(node .claude/hooks/lang.mjs --set:*)'];
  const own = ['Bash(npm test)', 'Bash(node scripts/lang.mjs:*)'];
  const { settings: s, removed } = migrateSettings({ permissions: { allow: [own[0], broad, own[1]] } }, kit);
  assert.equal(s.permissions.allow.includes(broad), false, 'the 3.49.1 wildcard is gone');
  assert.deepEqual(removed, [`allow: ${broad}`], 'the removal is listed for the report');
  for (const r of narrow) assert.ok(s.permissions.allow.includes(r), r);
  assert.equal(s.permissions.allow.some((r) => r.includes('lang.mjs --write')), false, '--write is not allowed');
  assert.deepEqual(s.permissions.allow.slice(0, 2), own, 'the project\'s own rules stay, in order');
  assert.deepEqual(migrateSettings(s, kit), { settings: s, added: [], removed: [] }, 'running again changes nothing');
});

test('F-10 update settings migration: the kit command list is added when the project has none, a Full profile ({}) is kept', () => {
  const kit = JSON.parse(read(path.join(REPO, '.claude', 'settings.json')));
  const { settings: s, added } = migrateSettings({ permissions: {} }, kit);
  assert.deepEqual(s.skillOverrides, kit.skillOverrides);
  assert.ok(added.some((a) => a.startsWith('skillOverrides')), 'the addition is reported');
  for (const own of [{}, { retro: 'on' }]) {
    const r = migrateSettings({ permissions: {}, skillOverrides: own }, kit);
    assert.deepEqual(r.settings.skillOverrides, own, 'the project value wins');
    assert.ok(!r.added.some((a) => a.startsWith('skillOverrides')));
  }
  assert.throws(() => migrateSettings({ skillOverrides: 'x' }, kit), Error, 'a broken shape is reported');
});
