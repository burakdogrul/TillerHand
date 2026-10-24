// Run: node --test "kit/tests/*.test.mjs"
// The kit's own skills: the motion-video spring formula (read from the skill file), the notification hook, settings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('motion-video: the closed-form spring in SKILL.md satisfies the differential equation', () => {
  const md = fs.readFileSync(path.join(ROOT, '.claude/skills/motion-video/SKILL.md'), 'utf8');
  const code = md.match(/```js\n([\s\S]*?function yay[\s\S]*?)```/)[1];
  const spring = new Function(`${code}; return yay;`)();
  for (const [zeta, omega, y0, v0] of [[0.75, 12, 1, 0], [0.7, 20, -2, 5], [1, 10, 1, -3]]) {
    const h = 1e-4;
    for (const t of [0, 0.05, 0.13, 0.3, 0.6]) {
      const a = spring(y0, v0, omega, zeta, t);
      const forward = spring(y0, v0, omega, zeta, t + h), back = spring(y0, v0, omega, zeta, Math.max(0, t - h));
      const dt = t === 0 ? h : 2 * h;
      // velocity must be the derivative of position
      assert.ok(Math.abs((forward.y - back.y) / dt - a.v) < 1e-2 * Math.max(1, Math.abs(a.v)), `v=y' (ζ=${zeta}, t=${t})`);
      // y'' + 2ζω y' + ω² y = 0
      const accel = (forward.v - back.v) / dt;
      assert.ok(Math.abs(accel + 2 * zeta * omega * a.v + omega * omega * a.y) < 0.05 * omega * omega, `ODE (ζ=${zeta}, t=${t})`);
    }
    const startPct = spring(y0, v0, omega, zeta, 0);
    assert.ok(Math.abs(startPct.y - y0) < 1e-12 && Math.abs(startPct.v - v0) < 1e-9, 'initial conditions');
    const Ts = 4 / (zeta * omega);
    assert.ok(Math.abs(spring(y0, v0, omega, zeta, Ts * 1.5).y) < 0.03 * Math.max(Math.abs(y0), 1), 'close to the target at the settle time');
  }
});

test('notification: none for a short job or with KIT_NOTIFY=off, no error', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'bildirim-'));
  fs.mkdirSync(path.join(p, '.claude', 'state'), { recursive: true });
  fs.writeFileSync(path.join(p, '.claude/state/reminder.json'), JSON.stringify({ turnAt: Date.now() }));
  const run = (arg, env = {}) => spawnSync(process.execPath, [path.join(ROOT, '.claude/hooks/notify.mjs'), ...arg], {
    input: '{}', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, ...env }, timeout: 10000,
  });
  assert.equal(run(['--stop']).status, 0, 'below the threshold it exits silently');
  assert.equal(run([], { KIT_NOTIFY: 'off' }).status, 0);
  fs.rmSync(p, { recursive: true, force: true });
});

test('settings: notification hooks, skill budget, pinned MCP versions', () => {
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'));
  assert.ok(s.hooks.Notification && s.hooks.Stop[0].hooks.some((h) => /notify\.mjs" --stop$/.test(h.command)));
  assert.equal(s.enabledPlugins['remotion@remotion'], false, 'Remotion is off by default');
  const backend = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit/templates/backend/.claude/settings.merge.json'), 'utf8'));
  assert.equal(backend.enabledPlugins['impeccable@impeccable'], false, 'backend design skill budget');
  for (const t of ['web-saas', 'mobile', 'backend']) {
    const m = JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, `kit/templates/${t}/.mcp.json`), 'utf8')));
    assert.ok(m.includes('mcp.context7.com'), `${t}: Context7`);
    assert.ok(!m.includes('@latest'), `${t}: no @latest`);
  }
});

test('settings 3.2: official plugins, quota setting, lock hook, type-specific plugins', () => {
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'));
  for (const e of ['security-guidance', 'hookify', 'claude-md-management']) assert.equal(s.enabledPlugins[`${e}@claude-plugins-official`], true, e);
  for (const e of ['claude-security', 'session-report']) assert.equal(s.enabledPlugins[`${e}@claude-plugins-official`], false, `${e} in a package, off by default`);
  assert.equal(s.env.ENABLE_STOP_REVIEW, '0', 'the end-of-turn security review eats quota, ships off');
  assert.ok(s.hooks.PreToolUse.some((m) => m.matcher === 'Write|Edit|MultiEdit|NotebookEdit' && m.hooks.some((h) => h.command.includes('freeze-guard.mjs'))));
  // 3.13: the test guard and the edit round counter are registered for all three tools
  const registered = (events, event, script) => JSON.stringify(events[event] ?? []).includes(script);
  assert.ok(registered(s.hooks, 'PreToolUse', 'test-guard.mjs') && registered(s.hooks, 'PostToolUse', 'edit-rounds.mjs'), 'Claude');
  const cx = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit/tools/codex/.codex/hooks.json'), 'utf8')).hooks;
  assert.ok(registered(cx, 'PreToolUse', 'test-guard.mjs') && registered(cx, 'PostToolUse', 'edit-rounds.mjs'), 'Codex');
  const ag = Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, 'kit/tools/antigravity/.agents/hooks.json'), 'utf8')));
  assert.ok(ag.some((h) => registered(h, 'PreToolUse', 'test-guard.mjs')) && ag.some((h) => registered(h, 'PostToolUse', 'edit-rounds.mjs') && registered(h, 'PreInvocation', 'edit-rounds.mjs --inject')), 'Antigravity');
  JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/security-patterns.json'), 'utf8')).patterns.forEach((p) => new RegExp(p.regex));
  const expected = { 'web-saas': 'typescript-lsp', mobile: 'typescript-lsp', backend: 'pyright-lsp' };
  for (const [t, lsp] of Object.entries(expected)) {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, `kit/templates/${t}/.claude/settings.merge.json`), 'utf8'));
    assert.equal(m.enabledPlugins[`${lsp}@claude-plugins-official`], true, `${t}: ${lsp}`);
    for (const e of Object.keys(m.enabledPlugins)) {
      const marketplace = e.split('@')[1];
      assert.ok(marketplace === 'claude-plugins-official' || s.extraKnownMarketplaces[marketplace] || m.extraKnownMarketplaces?.[marketplace], `${t}: ${marketplace} marketplace is defined`);
    }
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT, 'kit/templates/mobile/.mcp.json'), 'utf8')).mcpServers.maestro, { command: 'maestro', args: ['mcp'] });
});

test('settings 3.11: browser MCPs in the catalog, the agent uses Playwright CLI, pinned versions', () => {
  const web = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit/templates/web-saas/.mcp.json'), 'utf8')).mcpServers;
  assert.ok(!web.playwright && !web['chrome-devtools'], 'no default browser MCP in the web .mcp.json');
  const catalog = fs.readFileSync(path.join(ROOT, 'docs/workflow/mcp-catalog.md'), 'utf8');
  for (const s of ['@playwright/mcp@0.0.83', 'chrome-devtools-mcp@1.10.1', '--scope local', 'figma-remote-mcp', 'supabase-dev']) assert.ok(catalog.includes(s), `katalog: ${s}`);
  assert.ok(!/@latest\b/.test(catalog), 'no @latest in the catalog');
  const permission = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit/templates/web-saas/.claude/settings.merge.json'), 'utf8')).permissions.allow;
  for (const sub of ['open', 'snapshot', 'console', 'requests', 'screenshot']) assert.ok(permission.includes(`Bash(npx -y @playwright/cli@0.1.22 ${sub}:*)`), `Playwright CLI ${sub} izinli`);
  // Subcommands that run code in the page (eval, run-code) are not allowed, they are asked
  assert.ok(!permission.some((r) => /@playwright\/cli@[\d.]+(:\*|\s+(eval|run-code))/.test(r)), 'no broad or code-running Playwright CLI permission');
  for (const t of ['web-saas', 'mobile']) {
    const stack = fs.readFileSync(path.join(ROOT, `kit/templates/${t}/docs/architecture/stack.md`), 'utf8');
    assert.match(stack, /supabase(@[\d.]+)? migration new/, `${t}: schema changes via migration`);
  }
  assert.match(fs.readFileSync(path.join(ROOT, '.claude/commands/release.md'), 'utf8'), /vercel@63\.1\.1 deploy/, '/release preview deploy');
});

test('settings 3.12: rea, Understand-Anything, design-md, three.js pinned and with a warning', () => {
  const readText = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  assert.ok(readText('docs/workflow/mcp-catalog.md').includes('rea-agents@6.2.0'), 'catalog: rea pinned');
  for (const k of ['research', 'adopt']) {
    const md = readText(`.claude/commands/${k}.md`);
    assert.match(md, /\brea\b/, `/${k}: rea`);
    assert.match(md, /yetkili/, `/${k}: permission warning`);
  }
  for (const k of ['release', 'handoff', 'adopt']) assert.match(readText(`.claude/commands/${k}.md`), /\/understand/, `/${k}: Understand-Anything`);
  const commands = fs.readdirSync(path.join(ROOT, '.claude/commands')).map((f) => readText(`.claude/commands/${f}`)).join('\n');
  assert.ok(!/\/understand[^\n`]*--auto-update/.test(commands), 'UA --auto-update is not used in commands');
  const design = readText('.claude/commands/design.md');
  assert.ok(design.includes('awesome-design-md/3b605329240ce735b510037cca322f1831fdd7f8/'), '/design: design-md sabit commit');
  assert.match(design, /takli[dt]/, '/design: no brand imitation');
  const start = readText('.claude/commands/start.md');
  for (const s of ['threejs-fundamentals', 'threejs-performance', 'threejs-react-three-fiber']) assert.ok(start.includes(s), `/start: ${s}`);
  assert.ok(start.includes('threejs-skills/0e181866f095b5f06d005133876e926515390d95/'), '/start: three.js skill\'leri sabit commit');
  const motion = readText('.claude/skills/ui-motion/SKILL.md');
  for (const s of ['React Three Fiber', 'dispose', 'WebGL', 'GSAP']) assert.ok(motion.includes(s), `ui-motion: ${s}`);
  for (const l of ['perf', 'ux']) assert.match(readText(`.claude/findings/lenses/${l}.md`), /WebGL/, `${l} lens: WebGL`);
});

test('plugin sync: finds the missing and the disabled, ignores installs in another project', async () => {
  const { missingPlugins } = await import('../../.claude/hooks/plugins-sync.mjs');
  const root = path.resolve(os.tmpdir(), 'proje-a');
  const installed = [
    { id: 'caveman@caveman', scope: 'user' },
    { id: 'hookify@claude-plugins-official', scope: 'project', projectPath: root.toUpperCase() },
    { id: 'fp-check@trailofbits', scope: 'project', projectPath: path.resolve(os.tmpdir(), 'proje-b') },
  ];
  const enabled = { 'caveman@caveman': true, 'hookify@claude-plugins-official': true, 'fp-check@trailofbits': true, 'remotion@remotion': false };
  assert.deepEqual(missingPlugins(enabled, installed, root), [{ id: 'fp-check@trailofbits', enabled: true }, { id: 'remotion@remotion', enabled: false }]);
});

test('plugin sync: a plugin disabled locally is not missing, it is reported as info', async () => {
  const { missingPlugins, disabledHere } = await import('../../.claude/hooks/plugins-sync.mjs');
  const root = path.resolve(os.tmpdir(), 'proje-a');
  const installed = [{ id: 'fp-check@trailofbits', scope: 'project', projectPath: root, enabled: false }];
  const enabled = { 'fp-check@trailofbits': true, 'remotion@remotion': false };
  assert.deepEqual(missingPlugins({ 'fp-check@trailofbits': true }, installed, root), [], 'installed: not reinstalled, the choice is not overridden');
  assert.deepEqual(disabledHere(enabled, installed, root), ['fp-check@trailofbits']);
  assert.deepEqual(disabledHere({ 'fp-check@trailofbits': false }, installed, root), [], 'no info when already off in the settings');
  const otherProject = [{ id: 'fp-check@trailofbits', scope: 'project', projectPath: path.resolve(os.tmpdir(), 'proje-b'), enabled: false }];
  assert.deepEqual(disabledHere(enabled, otherProject, root), [], 'a disabled record in another project does not concern this one');
  assert.deepEqual(missingPlugins({ 'fp-check@trailofbits': true }, otherProject, root), [{ id: 'fp-check@trailofbits', enabled: true }], 'not installed here: on the install list');
});

test('settings: every hook and status line command really runs (no quote, path or module errors)', () => {
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'));
  const commands = Object.values(s.hooks).flat().flatMap((m) => m.hooks.map((h) => h.command)).concat(s.statusLine.command);
  const env = { ...process.env, CLAUDE_PROJECT_DIR: ROOT, KIT_NOTIFY: 'off' };
  for (const k of commands) {
    // Claude Code runs hooks with bash (Git Bash on Windows); including the "$CLAUDE_PROJECT_DIR" expansion and quotes
    const r = spawnSync('bash', ['-c', k], { cwd: ROOT, input: '{}', env, encoding: 'utf8', timeout: 60000 });
    assert.doesNotMatch(r.stderr ?? '', /Cannot find module|MODULE_NOT_FOUND|No such file/, k);
    assert.equal(r.status, 0, `${k}\n${r.stderr}`);
  }
});
