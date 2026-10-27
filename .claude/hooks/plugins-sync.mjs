#!/usr/bin/env node
// Brings the plugins in the project settings (.claude/settings.json → enabledPlugins) in line with the install record.
//   node .claude/hooks/plugins-sync.mjs            lists the missing ones, does not install
//   node .claude/hooks/plugins-sync.mjs --install  installs the list (the user must have been asked first)
// Why: the settings file enables a plugin but does not download it. Every plugin not installed gives a "not cached" or
// "enabled in project settings but isn't installed" load error and its skills do not arrive.
// Plugins set to false are installed too and then disabled; otherwise the same error shows for them.
// /start (environment step) and /kit-update list first and run --install if the user approves. Plugin code (hooks) runs with your rights.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findRoot, isMain } from './shared.mjs';

// Windows paths are case-insensitive; other systems are case-sensitive
const norm = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
const samePath = (a, b) => norm(a) === norm(b);

// A record that counts as installed for this project: user scope or this project's scope (another project's does not count)
const installedHere = (p, id, root) => p.id === id && (p.scope === 'user' || (p.scope === 'project' && p.projectPath && samePath(p.projectPath, root)));

export function missingPlugins(wanted, installed, root) {
  return Object.entries(wanted ?? {})
    .filter(([id]) => !installed.some((p) => installedHere(p, id, root)))
    .map(([id, enabled]) => ({ id, enabled: enabled !== false }));
}

// Enabled in the project settings, installed, but disabled on this machine (settings.local.json or /plugin as a personal choice).
// Not an error, Claude Code skips it on purpose; the script does not override the personal choice, it only reports it.
// The `enabled` field is computed for the folder the CLI runs in; the script runs it at the project root.
export function disabledHere(wanted, installed, root) {
  return Object.entries(wanted ?? {})
    .filter(([id, enabled]) => enabled !== false && installed.some((p) => installedHere(p, id, root) && p.enabled === false))
    .map(([id]) => id);
}

if (isMain(import.meta.url)) {
  const root = findRoot();
  // No shell: arguments go straight to claude (claude is a single-file executable, .exe on Windows)
  const run = (...arg) => execFileSync('claude', arg, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
  const reason = (h) => (h.stderr || h.stdout || h.message || '').toString().trim().split('\n')[0];
  const install = process.argv.includes('--install');
  let wanted;
  try { wanted = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8')).enabledPlugins; } catch (h) {
    console.error(`Could not read .claude/settings.json: ${h.message}`);
    process.exit(1);
  }
  let installed;
  try { installed = JSON.parse(run('plugin', 'list', '--json')); } catch (h) {
    console.error(`The claude CLI failed (${reason(h)}). Install the plugins by hand with /plugin.`);
    process.exit(1);
  }
  const off = disabledHere(wanted, installed, root);
  if (off.length) console.log(`Info: installed but disabled on this machine (personal choice, left unchanged): ${off.join(', ')}. To enable: /plugin → Installed.`);
  const list = missingPlugins(wanted, installed, root);
  if (!list.length) { console.log('Plugins in sync: every plugin in the project settings is installed.'); process.exit(0); }
  if (!install) {
    console.log(`${list.length} plugins not installed:\n${list.map((e) => `  ${e.id}${e.enabled ? '' : ' (will be installed, then disabled)'}`).join('\n')}\nAsk the user first; if they approve: node .claude/hooks/plugins-sync.mjs --install`);
    process.exit(0);
  }
  let failures = 0;
  for (const { id, enabled } of list) {
    if (!/^[\w.-]+@[\w.-]+$/.test(id)) { console.error(`skipped (invalid name): ${id}`); failures++; continue; }
    try {
      run('plugin', 'install', id, '--scope', 'project');
      if (!enabled) run('plugin', 'disable', id, '--scope', 'project');
      console.log(`installed${enabled ? '' : ' (disabled)'}: ${id}`);
    } catch (h) { console.error(`install failed: ${id} · ${reason(h)}`); failures++; }
  }
  console.log(`${list.length - failures}/${list.length} plugins installed. To enable them in this session: /reload-plugins.`);
  process.exit(failures ? 1 : 0);
}
