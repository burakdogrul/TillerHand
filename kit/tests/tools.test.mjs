// Run: node --test "kit/tests/*.test.mjs"
// Context packages (tools.mjs): enabling/disabling writes to personal settings, the project settings and other keys are kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PACKAGES, setPackage, packageStatus, CORE_COMMANDS, LIGHT_COMMANDS, setCommandMode, commandMode } from '../../.claude/hooks/tools.mjs';
import { permissionEquivalent } from '../../.claude/hooks/destructive-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, '.claude/hooks/tools.mjs');
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function project(local) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'paket-'));
  fs.mkdirSync(path.join(p, '.claude'));
  fs.writeFileSync(path.join(p, '.claude/settings.json'), JSON.stringify({
    enabledPlugins: { 'taste-skill@taste-skill': false, 'ui-ux-pro-max@ui-ux-pro-max-skill': false, 'ponytail@ponytail': true },
  }));
  if (local !== undefined) fs.writeFileSync(path.join(p, '.claude/settings.local.json'), typeof local === 'string' ? local : JSON.stringify(local));
  return p;
}
const run = (p, arg, env = {}) => spawnSync(process.execPath, [SCRIPT, ...arg], {
  encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, ...env }, timeout: 15000,
});

test('enabling a package: writes to personal settings, keeps other keys and plugins not in the project', () => {
  const p = project({ permissions: { allow: ['Bash(x)'] }, enabledPlugins: { 'foo@bar': true } });
  setPackage(p, 'tasarim', true);
  const l = json(path.join(p, '.claude/settings.local.json'));
  assert.deepEqual(l.permissions, { allow: ['Bash(x)'] }, 'izinler korunur');
  assert.equal(l.enabledPlugins['foo@bar'], true, 'another plugin is kept');
  assert.equal(l.enabledPlugins['taste-skill@taste-skill'], true);
  assert.equal(l.enabledPlugins['ui-ux-pro-max@ui-ux-pro-max-skill'], true);
  assert.ok(!('gsap-skills@gsap-skills' in l.enabledPlugins), 'a plugin the project does not know is not added');
  assert.equal(json(path.join(p, '.claude/settings.json')).enabledPlugins['taste-skill@taste-skill'], false, 'the project settings do not change');
  assert.equal(packageStatus(p).find((d) => d.name === 'tasarim').enabled, true);

  setPackage(p, 'tasarim', false);
  const k = json(path.join(p, '.claude/settings.local.json'));
  assert.ok(!('taste-skill@taste-skill' in k.enabledPlugins), 'disabling deletes the personal override, back to the project default');
  assert.equal(k.enabledPlugins['foo@bar'], true);
  assert.equal(packageStatus(p).find((d) => d.name === 'tasarim').enabled, false);
  fs.rmSync(p, { recursive: true, force: true });
});

test('enabling a package: creates the personal settings file if missing', () => {
  const p = project();
  setPackage(p, 'tasarim', true);
  assert.equal(json(path.join(p, '.claude/settings.local.json')).enabledPlugins['taste-skill@taste-skill'], true);
  fs.rmSync(p, { recursive: true, force: true });
});

test('attacker: unknown package, path and JSON arguments are rejected; a broken personal settings file is not overwritten', () => {
  const broken = '{"enabledPlugins": {';
  const p = project(broken);
  for (const name of ['yok', '../x', '{"a":1}', '__proto__', 'constructor']) {
    assert.throws(() => setPackage(p, name, true), /paket/i, name);
    const r = run(p, ['--enable', name]);
    assert.equal(r.status, 1, `${name}: exit code 1`);
  }
  assert.throws(() => setPackage(p, 'tasarim', true), /settings\.local\.json/);
  assert.equal(fs.readFileSync(path.join(p, '.claude/settings.local.json'), 'utf8'), broken, 'the broken file stays as it is');
  fs.rmSync(p, { recursive: true, force: true });
});

test('--required: a disabled package exits 2 and says how to enable it, 0 when enabled', () => {
  const p = project();
  const off = run(p, ['--required', 'tasarim']);
  assert.equal(off.status, 2);
  assert.match(off.stdout, /kapalı/);
  assert.match(off.stdout, /--enable tasarim/);
  assert.equal(run(p, ['--enable', 'tasarim']).status, 0);
  const enabled = run(p, ['--required', 'tasarim']);
  assert.equal(enabled.status, 0);
  assert.match(enabled.stdout, /açık/);
  assert.equal(run(p, []).status, 0, 'durum tablosu');
  fs.rmSync(p, { recursive: true, force: true });
});

test('--measure: measures the skill description load of installed plugins', () => {
  const p = project();
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  const installRecord = path.join(cfg, 'plugins/cache/x/taste-skill');
  fs.mkdirSync(path.join(installRecord, 'skills/a'), { recursive: true });
  fs.writeFileSync(path.join(installRecord, 'skills/a/SKILL.md'), `---\nname: a\ndescription: ${'x'.repeat(400)}\n---\ngövde`);
  fs.writeFileSync(path.join(cfg, 'plugins/installed_plugins.json'), JSON.stringify({ plugins: { 'taste-skill@taste-skill': [{ scope: 'user', installPath: installRecord }] } }));
  const r = run(p, ['--measure'], { CLAUDE_CONFIG_DIR: cfg });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /taste-skill@taste-skill/);
  assert.match(r.stdout, /\b100\b/, '400 karakter ≈ 100 token');
  fs.rmSync(p, { recursive: true, force: true });
  fs.rmSync(cfg, { recursive: true, force: true });
});

test('settings: package plugins off by default, core on, marketplaces defined', () => {
  const s = json(path.join(ROOT, '.claude/settings.json'));
  const packaged = new Set(Object.values(PACKAGES).flatMap((k) => k.plugins));
  for (const id of packaged) {
    assert.equal(s.enabledPlugins[id], false, `${id} package plugin ships off`);
    const marketplace = id.split('@')[1];
    assert.ok(marketplace === 'claude-plugins-official' || s.extraKnownMarketplaces[marketplace], `${marketplace} marketplace is defined`);
  }
  for (const id of ['caveman@caveman', 'ponytail@ponytail', 'mattpocock-skills@mattpocock', 'impeccable@impeccable', 'humanizer@humanizer',
    'security-guidance@claude-plugins-official', 'hookify@claude-plugins-official', 'claude-md-management@claude-plugins-official']) {
    assert.equal(s.enabledPlugins[id], true, `${id} is in core`);
    assert.ok(!packaged.has(id), `${id} is not in a package`);
  }
  assert.ok(s.permissions.allow.includes('Bash(node .claude/hooks/tools.mjs --required:*)'));
  // Enabling a package runs plugin hooks with the user's rights: always asked
  assert.ok(s.permissions.ask.includes('Bash(node .claude/hooks/tools.mjs --enable:*)'));
  assert.ok(!s.permissions.allow.some((r) => r.startsWith('Bash(node .claude/hooks/tools.mjs') && (r.includes(':*)') && !/--(required|disable):\*\)$/.test(r))), 'no broad permission');
  assert.ok(s.permissions.ask.includes('Bash(node .claude/hooks/tools.mjs --ac:*)'), '3.15.0: the old flag is still asked');
  // --commands rewrites the shared settings.json: asked (Codex/Antigravity: the hook counterpart)
  assert.ok(s.permissions.ask.includes('Bash(node .claude/hooks/tools.mjs --commands:*)'));
  for (const k of ['node .claude/hooks/tools.mjs --commands full', 'node ".claude/hooks/tools.mjs" "--commands" light'])
    assert.equal(permissionEquivalent(k)?.decision, 'ask', k);
});

test('F-10 settings: non-core kit commands ship name-only, core commands keep their description', () => {
  const s = json(path.join(ROOT, '.claude/settings.json'));
  const commands = fs.readdirSync(path.join(ROOT, '.claude/commands')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
  assert.deepEqual([...CORE_COMMANDS, ...LIGHT_COMMANDS].sort(), commands.sort(), 'every kit command is either core or light');
  assert.equal(CORE_COMMANDS.length, 10);
  assert.deepEqual(s.skillOverrides, Object.fromEntries(LIGHT_COMMANDS.map((c) => [c, 'name-only'])));
});

test('F-10 --commands full/light: only kit light commands change, the user values stay', () => {
  const p = project();
  const file = path.join(p, '.claude/settings.json');
  const base = json(file);
  fs.writeFileSync(file, JSON.stringify({ ...base, skillOverrides: { 'findings-legal': 'off', 'my-skill': 'name-only', retro: 'name-only', board: 'on' } }));
  assert.equal(commandMode(p).mode, 'mixed');

  setCommandMode(p, 'full');
  let s = json(file);
  assert.deepEqual(s.skillOverrides, { 'findings-legal': 'off', 'my-skill': 'name-only', board: 'on' }, 'full drops kit name-only values only');
  assert.equal(commandMode(p).mode, 'full');
  assert.deepEqual(s.enabledPlugins, base.enabledPlugins, 'other keys are kept');

  setCommandMode(p, 'light');
  s = json(file);
  assert.equal(s.skillOverrides['findings-legal'], 'off', 'the user value is not overwritten');
  assert.equal(s.skillOverrides.board, 'on', 'an explicit "on" is the user\'s choice too');
  assert.equal(s.skillOverrides.retro, 'name-only');
  assert.equal(s.skillOverrides['my-skill'], 'name-only');
  assert.ok(CORE_COMMANDS.every((c) => !(c in s.skillOverrides)), 'core commands are never hidden');
  assert.equal(commandMode(p).mode, 'mixed', 'board keeps its description');
  delete s.skillOverrides.board;
  fs.writeFileSync(file, JSON.stringify(s));
  setCommandMode(p, 'light');
  assert.equal(commandMode(p).mode, 'light', 'without the user value light hides board too');

  fs.writeFileSync(file, JSON.stringify(base));
  setCommandMode(p, 'full');
  assert.deepEqual(json(file).skillOverrides, {}, 'full leaves an empty key so the update does not bring the list back');
  fs.rmSync(p, { recursive: true, force: true });
});

test('F-10 --commands CLI: status shows the mode, a bad mode and a broken settings file are rejected', () => {
  const p = project();
  const file = path.join(p, '.claude/settings.json');
  assert.equal(run(p, ['--commands', 'light']).status, 0);
  assert.match(run(p, []).stdout, /Komut listesi: hafif/);
  assert.equal(run(p, ['--commands', 'full']).status, 0);
  assert.match(run(p, []).stdout, /Komut listesi: tam/);
  assert.equal(run(p, ['--commands', 'x']).status, 1);
  for (const bad of ['{"skillOverrides": {', '{"skillOverrides": "abc"}', '{"skillOverrides": ["a"]}', 'null']) {
    fs.writeFileSync(file, bad);
    assert.equal(run(p, ['--commands', 'full']).status, 1, bad);
    assert.equal(fs.readFileSync(file, 'utf8'), bad, `${bad}: the file stays as it is`);
  }
  fs.rmSync(file);
  assert.equal(run(p, ['--commands', 'light']).status, 1, 'a missing settings.json is not created');
  assert.ok(!fs.existsSync(file));
  fs.rmSync(p, { recursive: true, force: true });
});
