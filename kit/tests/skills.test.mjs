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
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-'));
  fs.mkdirSync(path.join(p, '.claude', 'state'), { recursive: true });
  fs.writeFileSync(path.join(p, '.claude/state/reminder.json'), JSON.stringify({ turnAt: Date.now() }));
  const run = (arg, env = {}) => spawnSync(process.execPath, [path.join(ROOT, '.claude/hooks/notify.mjs'), ...arg], {
    input: '{}', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, ...env }, timeout: 10000,
  });
  assert.equal(run(['--stop']).status, 0, 'below the threshold it exits silently');
  assert.equal(run([], { KIT_NOTIFY: 'off' }).status, 0);
  fs.rmSync(p, { recursive: true, force: true });
});

test('notification: project name never enters the PowerShell script (’ is a quote there)', async () => {
  const { winCommand } = await import('../../.claude/hooks/notify.mjs');
  const title = 'Claude Code · Project’; Write-Output INJECTED; ’';
  const { args, env } = winCommand(title, 'message ‘x');
  assert.ok(!args.some((a) => a.includes('INJECTED') || a.includes('message')), 'text is not in the command');
  assert.match(args.at(-1), /\$env:KIT_T, \$env:KIT_M/);
  assert.equal(env.KIT_T, title);
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
  const { allow: permission, ask } = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit/templates/web-saas/.claude/settings.merge.json'), 'utf8')).permissions;
  // 3.19.1: in the project folder the CLI loads a repo's .playwright/cli.config.json, which can run a program: asked, never allowed
  for (const sub of ['open', 'snapshot', 'console', 'requests', 'screenshot']) assert.ok(ask.includes(`Bash(npx -y @playwright/cli@0.1.22 ${sub}:*)`), `Playwright CLI ${sub} sorulur`);
  assert.ok(!permission.some((r) => r.includes('@playwright/cli')), 'no Playwright CLI rule is allowed');
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
    assert.match(md, /authorized/, `/${k}: permission warning`);
  }
  for (const k of ['release', 'handoff', 'adopt']) assert.match(readText(`.claude/commands/${k}.md`), /\/understand/, `/${k}: Understand-Anything`);
  const commands = fs.readdirSync(path.join(ROOT, '.claude/commands')).map((f) => readText(`.claude/commands/${f}`)).join('\n');
  assert.ok(!/\/understand[^\n`]*--auto-update/.test(commands), 'UA --auto-update is not used in commands');
  const design = readText('.claude/commands/design.md');
  assert.ok(design.includes('awesome-design-md/3b605329240ce735b510037cca322f1831fdd7f8/'), '/design: design-md sabit commit');
  assert.match(design, /No brand imitation/, '/design: no brand imitation');
  const start = readText('.claude/commands/start.md');
  for (const s of ['threejs-fundamentals', 'threejs-performance', 'threejs-react-three-fiber']) assert.ok(start.includes(s), `/start: ${s}`);
  assert.ok(start.includes('threejs-skills/0e181866f095b5f06d005133876e926515390d95/'), '/start: three.js skill\'leri sabit commit');
  const motion = readText('.claude/skills/ui-motion/SKILL.md');
  for (const s of ['React Three Fiber', 'dispose', 'WebGL', 'GSAP']) assert.ok(motion.includes(s), `ui-motion: ${s}`);
  for (const l of ['perf', 'ux']) assert.match(readText(`.claude/findings/lenses/${l}.md`), /WebGL/, `${l} lens: WebGL`);
});

// The rea passage: every line naming rea, plus the more indented lines under it
const reaPassage = (rel) => {
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split(/\r?\n/);
  const indent = (l) => l.match(/^\s*/)[0].length;
  const out = [];
  lines.forEach((line, i) => {
    if (!/\brea\b/i.test(line)) return;
    out.push(line);
    for (let j = i + 1; j < lines.length && lines[j].trim() && indent(lines[j]) > indent(line); j++) out.push(lines[j]);
  });
  assert.notEqual(out.length, 0, `${rel}: no line names rea`);
  return out.join('\n');
};
const reaCatalogRow = () => {
  const row = fs.readFileSync(path.join(ROOT, 'docs/workflow/mcp-catalog.md'), 'utf8').split(/\r?\n/).find((l) => /^\|\s*rea\b/i.test(l));
  assert.notEqual(row, undefined, 'catalog: no rea row');
  return row;
};
const sentences = (text) => text.split(/(?<=[.!?])\s+|\n+/);
// Two stable words in either order, in one sentence, at most `gap` characters apart
const near = (a, b, gap = 40) => new RegExp(`\\b(?:${a})\\b[^.\\n]{0,${gap}}\\b(?:${b})\\b|\\b(?:${b})\\b[^.\\n]{0,${gap}}\\b(?:${a})\\b`, 'i');
const GOES_ON = 'continues?|continuing|go on|goes on|going on|proceeds?|carry on|carries on|keep going|keeps going|keep working';
const MODEL_REFUSES = near('model', 'refus\\w*');
const FALLS_BACK = /\bfall(?:s|ing)?[\s-]*back\b|\bfallback\b|\bfell back\b/i;

// A sentence that orders stopping because of a copy request or before any work. The model refusing and negated forms do not count.
const upFrontRefusals = (text) => sentences(text).filter((s) => {
  const refuses = /(?<!\b(?:not|never|don't|without|model|it)\s+(?:\w+\s+){0,2})\b(?:stop|stops|stopped|decline|declines|declined|refuse|refuses|refused|reject|rejects|rejected|abort|aborts|aborted|deny|denies|denied|turn down)\b/i.test(s)
    || /\b(?:do not|don't|never)\s+(?:proceed|continue|go on|help|answer)\b/i.test(s);
  return refuses && /\b(?:as soon as|up[- ]?front|immediately|right away|at once|outright|on sight|cop(?:y|ies|ying)|clone|replicate)\b/i.test(s);
});

test('3.52.0 AC-1: research rea passage states the purpose, how a feature works and the need it serves', () => {
  const rea = reaPassage('.claude/commands/research.md');
  assert.match(rea, /\bhow\b[^.\n]{0,40}\bworks?\b/i, 'how it works');
  assert.match(rea, near('needs?', 'serves?|meets?|solves?|address(?:es)?|fulfils?|fulfills?|fills?', 30), 'the need it serves');
});

test('3.52.0 AC-1: research rea passage says the work goes on while the model answers', () => {
  const modelAnswers = /\b(?:while|as long as|when|if|once)\b[^.\n]{0,20}\bmodel\b[^.\n]{0,20}\b(?:answers?|answering|responds?|responding|complies|cooperates?)\b/i;
  const goesOn = new RegExp(`\\b(?:${GOES_ON})\\b`, 'i');
  assert.equal(sentences(reaPassage('.claude/commands/research.md')).some((s) => modelAnswers.test(s) && goesOn.test(s)), true, 'one sentence: the model answers, the work goes on');
});

test('3.52.0 AC-1: research rea passage, on refusal or fallback ask with AskUserQuestion and continue by the answer', () => {
  const rea = reaPassage('.claude/commands/research.md');
  assert.match(rea, MODEL_REFUSES, 'the model refuses');
  assert.match(rea, FALLS_BACK, 'the model falls back');
  assert.match(rea, /\bAskUserQuestion\b/i, 'asks with AskUserQuestion');
  assert.match(rea, /\b(?:which|what)\b[^.\n]{0,20}\bfeature\b/i, 'asks which feature');
  assert.match(rea, /\bwhy\b[^.\n]{0,30}\bneed/i, 'asks why it is needed');
  assert.match(rea, /\b(?:own|their|your|user's)\s+product\b/i, 'asks what their own product will do');
  assert.match(rea, near(`${GOES_ON}|acts?`, 'answers?|repl(?:y|ies)|responses?'), 'continues according to the answer');
});

test('3.52.0 AC-1: research rea passage keeps the authorized warning and the nothing-is-taken rule', () => {
  const rea = reaPassage('.claude/commands/research.md');
  assert.match(rea, /\bauthorized\b/i, 'authorized warning');
  const notTaken = sentences(rea).some((s) => [/\bcode\b/i, /\btexts?\b/i, /\bimages?\b/i, /\bbrands?\b/i, /\b(?:not|never|no)\b/i, /\b(?:taken?|copied|copy|reused?)\b/i].every((re) => re.test(s)));
  assert.equal(notTaken, true, 'one sentence: code, text, images and brand are not taken');
});

test('3.52.0 AC-2: adopt rea passage keeps authorized', () => {
  assert.match(reaPassage('.claude/commands/adopt.md'), /\bauthorized\b/i);
});

test('3.52.0 AC-2: adopt rea passage, on refusal or fallback ask the user', () => {
  const rea = reaPassage('.claude/commands/adopt.md');
  assert.match(rea, MODEL_REFUSES, 'the model refuses');
  assert.match(rea, FALLS_BACK, 'the model falls back');
  assert.match(rea, /\bAskUserQuestion\b|\basks?\b[^.\n]{0,20}\buser\b/i, 'asks the user');
});

test('3.52.0 AC-3: catalog rea row describes /research as how an existing product or feature works', () => {
  const row = reaCatalogRow();
  assert.match(row, /\/research\b[^|\n]*\bhow\b[^|\n]*\bexisting\b[^|\n]*\b(?:product|feature)\b[^|\n]*\bworks?\b/i, 'how an existing product or feature works');
  assert.doesNotMatch(row, /\bhow\b[^|\n]{0,10}\bcompetitor(?:'s)?\s+feature\b/i, 'not: how a competitor feature works');
});

test('3.52.0 AC-3: catalog rea row states what the kit does not support', () => {
  const row = reaCatalogRow();
  assert.match(row, /\b(?:not|never|doesn't|don't)\b[^.|\n]{0,30}\bsupport|\bunsupported\b/i, 'says not supported');
  for (const re of [/\bbypass/i, /\bDRM\b/i, /\blicen[sc]e checks?\b/i, /\bauthentication\b/i, /\bcop(?:y|ied|ying)\b/i, /\bprotected\b[^.|\n]{0,20}\bcode\b/i, /\bassets?\b/i]) assert.match(row, re);
});

test('3.52.0 AC-3: catalog rea row keeps the rea-agents@6.2.0 pin', () => {
  assert.equal(reaCatalogRow().includes('rea-agents@6.2.0'), true);
});

test('3.52.0 AC-4: ATTACK the up-front refusal detector catches refusals and spares the intended wording', () => {
  for (const bad of [
    'Refuse up front.',
    'Stop as soon as the user asks for a copy.',
    'Decline any request to copy a product.',
    'If the user asks for a clone, do not proceed.',
    'Requests for a copy are refused immediately.',
  ]) assert.deepEqual(upFrontRefusals(bad), [bad]);
  for (const good of [
    'If the model refuses or falls back, ask the user with AskUserQuestion and continue according to the answer.',
    'The request is not stopped up front.',
    'Do not refuse a request up front.',
    'The purpose is understanding how a feature works, not copying a product.',
    "The other product's code, text, images and brand are not taken.",
  ]) assert.deepEqual(upFrontRefusals(good), []);
});

test('3.52.0 AC-4: ATTACK research and adopt rea passages hold no instruction to refuse up front', () => {
  for (const f of ['research', 'adopt']) assert.deepEqual(upFrontRefusals(reaPassage(`.claude/commands/${f}.md`)), [], `/${f}`);
});

test('plugin sync: finds the missing and the disabled, ignores installs in another project', async () => {
  const { missingPlugins } = await import('../../.claude/hooks/plugins-sync.mjs');
  const root = path.resolve(os.tmpdir(), 'project-a');
  const installed = [
    { id: 'caveman@caveman', scope: 'user' },
    // Windows paths ignore case; Linux and macOS paths do not
    { id: 'hookify@claude-plugins-official', scope: 'project', projectPath: process.platform === 'win32' ? root.toUpperCase() : root },
    { id: 'fp-check@trailofbits', scope: 'project', projectPath: path.resolve(os.tmpdir(), 'project-b') },
  ];
  const enabled = { 'caveman@caveman': true, 'hookify@claude-plugins-official': true, 'fp-check@trailofbits': true, 'remotion@remotion': false };
  assert.deepEqual(missingPlugins(enabled, installed, root), [{ id: 'fp-check@trailofbits', enabled: true }, { id: 'remotion@remotion', enabled: false }]);
});

test('plugin sync: a plugin disabled locally is not missing, it is reported as info', async () => {
  const { missingPlugins, disabledHere } = await import('../../.claude/hooks/plugins-sync.mjs');
  const root = path.resolve(os.tmpdir(), 'project-a');
  const installed = [{ id: 'fp-check@trailofbits', scope: 'project', projectPath: root, enabled: false }];
  const enabled = { 'fp-check@trailofbits': true, 'remotion@remotion': false };
  assert.deepEqual(missingPlugins({ 'fp-check@trailofbits': true }, installed, root), [], 'installed: not reinstalled, the choice is not overridden');
  assert.deepEqual(disabledHere(enabled, installed, root), ['fp-check@trailofbits']);
  assert.deepEqual(disabledHere({ 'fp-check@trailofbits': false }, installed, root), [], 'no info when already off in the settings');
  const otherProject = [{ id: 'fp-check@trailofbits', scope: 'project', projectPath: path.resolve(os.tmpdir(), 'project-b'), enabled: false }];
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

// 3.51.0: attribution off by default; the status block has one item per line
const settings351 = () => JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'));
const read351 = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const LABELS_EN = ['Phase:', 'Task:', 'Question mode:', 'Limit:', 'Done:', 'Board:', 'Auto decisions:', 'Next:', 'Pending decision:'];
const LABELS_TR = ['Faz:', 'Görev:', 'Soru modu:', 'Limit:', 'Biten:', 'Kurul:', 'Otomatik karar:', 'Sıradaki:', 'Bekleyen karar:'];
const fencedStatus = (p) => [...read351(p).matchAll(/^```[^\n]*\n(── Status[\s\S]*?)\n```$/gm)].map((m) => m[1]);
const preStatus = (p, word) => [...read351(p).matchAll(new RegExp(`<pre class="term">(── ${word}[\\s\\S]*?)</pre>`, 'g'))].map((m) => m[1]);
// Lines under the header. Markup goes: a span around a value or a label does not change the format.
const statusLines = (block) => block.replace(/<[^>]+>/g, '').split('\n').slice(1).filter((l) => l.trim() !== '');
const labelsAtLineStart = (lines, labels) => lines.map((l) => labels.find((label) => l.startsWith(label)) ?? `no label: ${l}`);

test('3.51.0 AC-1: attribution deep-equals the empty commit and PR text with no session URL', () => {
  assert.deepEqual(settings351().attribution, { commit: '', pr: '', sessionUrl: false });
});

test('3.51.0 AC-1: settings have no includeCoAuthoredBy key', () => {
  assert.equal(Object.hasOwn(settings351(), 'includeCoAuthoredBy'), false);
});

test('3.51.0 AC-1: attribution is not the bare value false, older CLI versions skip such a file', () => {
  assert.notEqual(settings351().attribution, false);
});

test('3.51.0 AC-2: AGENTS.md status block has the nine labels in order, each starting its own line', () => {
  const blocks = fencedStatus('AGENTS.md');
  assert.equal(blocks.length, 1, 'one fenced block starts with ── Status');
  assert.deepEqual(labelsAtLineStart(statusLines(blocks[0]), LABELS_EN), LABELS_EN);
});

test('3.51.0 AC-2: no line of the AGENTS.md status block contains the " · " joiner', () => {
  const blocks = fencedStatus('AGENTS.md');
  assert.equal(blocks.length, 1, 'one fenced block starts with ── Status');
  assert.deepEqual(blocks[0].split('\n').filter((l) => l.includes(' · ')), []);
});

test('3.51.0 AC-2: rule 8 still says the words follow the conversation language', () => {
  const rule8 = read351('AGENTS.md').match(/^8\. [\s\S]*?(?=^9\. )/m)[0];
  assert.match(rule8, /words[^.\n]*conversation language/i);
});

// No current example leaves out Question mode or Soru modu and the guide's windows have no fixed height, so all nine are pinned everywhere.
// The count stops an example passing by being removed or renamed. " · " stays allowed inside a value, not in front of a label.
for (const [file, labels, count, examples] of [
  ['docs/workflow/decision-protocol.md', LABELS_EN, 1, () => fencedStatus('docs/workflow/decision-protocol.md')],
  ['kit/guide.html', LABELS_EN, 2, () => preStatus('kit/guide.html', 'Status')],
  ['kit/guide.tr.html', LABELS_TR, 2, () => preStatus('kit/guide.tr.html', 'Durum')],
]) {
  test(`3.51.0 AC-3: ${file} examples have the nine labels in order, each starting its own line`, () => {
    const blocks = examples();
    assert.equal(blocks.length, count, 'number of status examples');
    for (const block of blocks) assert.deepEqual(labelsAtLineStart(statusLines(block), labels), labels);
  });

  test(`3.51.0 AC-3: ${file} examples have no label joined to the previous item with " · "`, () => {
    const blocks = examples();
    assert.equal(blocks.length, count, 'number of status examples');
    const joined = new RegExp(` · (?:${labels.join('|')})`, 'i');
    for (const block of blocks) assert.deepEqual(statusLines(block).filter((l) => joined.test(l)), []);
  });
}

// 3.54.0: motion-video gains a launch clip mode next to the demo loop.
// Every line of the skill body carries its heading chain, so a pattern can be scoped to a section whatever its number or level.
const SKILL354 = '.claude/skills/motion-video';
const rows354 = () => {
  const stack = [];
  let fenced = false;
  return read351(`${SKILL354}/SKILL.md`).replace(/^---\n[\s\S]*?\n---\n/, '').split('\n').map((line) => {
    if (line.startsWith('```')) fenced = !fenced;
    const h = fenced ? null : line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      while (stack.length && stack.at(-1).level >= h[1].length) stack.pop();
      stack.push({ level: h[1].length, text: h[2] });
    }
    return { line, chain: stack.map((s) => s.text) };
  });
};
const under354 = (re) => rows354().filter((r) => r.chain.some((h) => re.test(h))).map((r) => r.line);
const launch354 = () => {
  const lines = under354(/launch clip/i);
  assert.notEqual(lines.length, 0, 'no heading contains "launch clip"');
  return lines;
};
const launchText354 = () => launch354().join('\n');
const outsideLaunch354 = () => rows354().filter((r) => !r.chain.some((h) => /launch clip/i.test(h))).map((r) => r.line).join('\n');
// Sound rules may sit in the launch clip section, under their own heading, or on the sound question's line.
const soundText354 = () => rows354().filter((r) => r.chain.some((h) => /launch clip|sound|audio|music/i.test(h)) || /\bsound\b/i.test(r.line)).map((r) => r.line).join('\n');
const windows354 = (lines, re, before, after) => lines.flatMap((l, i) => (re.test(l) ? [lines.slice(Math.max(0, i - before), i + after + 1).join('\n')] : []));
// Some window holds every pattern; a failure names the patterns the closest window lacks.
const someWindowHasAll354 = (windows, patterns, label) => {
  const gaps = windows.map((w) => patterns.filter((p) => !p.test(w)).map(String)).sort((a, b) => a.length - b.length);
  assert.deepEqual(gaps[0] ?? patterns.map(String), [], label);
};

test('3.54.0 AC-1: the skill names a demo loop mode and a launch clip mode', () => {
  const body = rows354().map((r) => r.line).join('\n');
  assert.match(body, /demo loop[^.\n]*\bmode\b|\bmode\b[^.\n]*demo loop/i);
  assert.match(body, /launch clip[^.\n]*\bmode\b|\bmode\b[^.\n]*launch clip/i);
});

test('3.54.0 AC-1: which mode is asked before any other input question', () => {
  const lines = rows354().map((r) => r.line);
  const asks = /(\bask|\bfirst question)[^.\n]*\b(which|mode)\b|\b(which|mode)\b[^.\n]*\bask/i;
  const askAt = lines.findIndex((l, i) => asks.test(l) && /demo loop/i.test(lines.slice(Math.max(0, i - 2), i + 7).join('\n')) && /launch clip/i.test(lines.slice(Math.max(0, i - 2), i + 7).join('\n')));
  assert.notEqual(askAt, -1, 'no line asks which mode, next to both mode names');
  const firstInput = lines.findIndex((l) => /\*\*(States|Color|Sound|Format)\b/i.test(l));
  assert.equal(askAt < (firstInput === -1 ? lines.length : firstInput), true, `mode question at line ${askAt}, first input question at line ${firstInput}`);
});

for (const [rule, pattern] of [
  ['renderAt', /\brenderAt\b/],
  ['a real cursor', /\breal cursor\b/i],
  ['closed-form springs', /\bsprings?\b[^.\n]*closed form|closed[- ]form[^.\n]*\bsprings?\b/i],
  ['the loop seam', /\bloop seam\b/i],
  ['determinism', /\bdeterminism\b/i],
  ['120 BPM', /\b120 BPM\b/i],
  ['the ban on cuts', /\b(no|without|never)\b[^.\n]{0,20}\bcuts\b/i],
]) {
  test(`3.54.0 AC-1: the demo loop keeps ${rule} outside the launch clip section`, () => {
    assert.match(outsideLaunch354(), pattern);
  });
}

test('3.54.0 AC-1: the launch clip section allows cuts', () => {
  assert.match(launchText354(), /\bcuts?\b[^.\n]*\b(allowed|fine|ok|okay|permitted|welcome|may|can)\b|\b(may|can)\b(?!\s+(not|never)\b)[^.\n]*\bcuts?\b|\b(allowed|free)\b[^.\n]*\bcuts?\b/i);
});

test('3.54.0 AC-1: the ban on cuts is tied to the demo loop by its own sentence or heading', () => {
  const rows = rows354();
  const sameSentence = rows.some((r) => /\bcuts?\b[^.\n]*demo loop|demo loop[^.\n]*\bcuts?\b/i.test(r.line));
  const underHeading = rows.some((r) => /\bcuts\b/i.test(r.line) && r.chain.some((h) => /demo loop/i.test(h)));
  assert.equal(sameSentence || underHeading, true, 'no line or heading ties the ban on cuts to the demo loop');
});

test('3.54.0 AC-1: motion-video stays the single video skill', () => {
  const dirs = fs.readdirSync(path.join(ROOT, '.claude/skills')).filter((d) => /video|launch|clip|promo|brag/i.test(d));
  assert.deepEqual(dirs, ['motion-video']);
});

test('3.54.0 AC-2: launch clip runs about 20 seconds, within 15-25', () => {
  const text = launchText354();
  assert.match(text, /\b20\s*(s|sec|secs|seconds)\b/i);
  assert.match(text, /\b15\s*(-|–|to)\s*25\b/i);
});

test('3.54.0 AC-2: launch clip shape is hook, reveal, 2-3 highlights, punchline, in that order', () => {
  const text = launchText354();
  assert.match(text, /\bhook\b[\s\S]*?\breveal\b[\s\S]*?\bhighlights?\b[\s\S]*?\bpunchline\b/i);
  assert.match(text, /\b(2\s*(-|–|to)\s*3|two (or|to) three)\b[^.\n]{0,20}\bhighlights?\b|\bhighlights?\b[^.\n]{0,20}\b(2\s*(-|–|to)\s*3|two (or|to) three)\b/i);
});

test('3.54.0 AC-2: launch clip reads the project first: main page, styles, real flow', () => {
  someWindowHasAll354(windows354(launch354(), /\bread\w*\b[^.\n]*\bproject\b|\bproject\b[^.\n]*\bread\b/i, 0, 4), [/\bmain page\b/i, /\bstyles?\b/i, /\bflow\b/i], 'project reading');
});

test('3.54.0 AC-2: launch clip does not ask for a list of states', () => {
  assert.match(launchText354(), /\b(not|never|instead of|rather than|without)\b[^.\n]*\b(ask\w*|list)\b[^.\n]*\bstates?\b/i);
});

test('3.54.0 AC-2: launch clip reuses the real interface rather than redrawing it', () => {
  const text = launchText354();
  assert.match(text, /\bre-?us\w*\b[^.\n]*\b(real|actual|existing)\b[^.\n]*\b(interface|ui|components?|screens?)\b/i);
  assert.match(text, /\b(not|never|rather than|instead of|no)\b[^.\n]*\b(re-?draw\w*|recreat\w*)\b/i);
});

test('3.54.0 AC-2: launch clip bans invented claims, numbers and testimonials', () => {
  someWindowHasAll354(windows354(launch354(), /\b(invent\w*|made[- ]up|fabricat\w*)\b/i, 0, 2), [/\bclaims?\b/i, /\bnumbers?\b/i, /\btestimonials?\b/i, /\b(no|not|never)\b/i], 'invented content');
});

test('3.54.0 AC-2: on-screen text is held about 0.3 seconds per word', () => {
  someWindowHasAll354(windows354(launch354(), /\b0[.,]3\s*(s|sec|secs|seconds?)\b/i, 0, 0), [/\bwords?\b/i, /\btext\b/i], 'reading time');
});

test('3.54.0 AC-2: launch clip formats are landscape, vertical and square', () => {
  const text = launchText354();
  for (const format of [/\blandscape\b/i, /\bvertical\b/i, /\bsquare\b/i]) assert.match(text, format);
});

test('3.54.0 AC-3: the sound question offers generated music', () => {
  assert.match(soundText354(), /\bgenerat\w*\W+(\w+\W+)?(music|soundtrack|score)\b|\b(music|soundtrack|score)\s+(\w+\s+){0,3}generat/i);
});

test('3.54.0 AC-3: the sound question offers a track the user gives', () => {
  assert.match(soundText354(), /\b(track|music|audio)\b[^.\n]*\b(user|you|your)\b[^.\n]*\b(giv|provid|suppl|bring)\w*|\b(user|you|your)\b[^.\n]*\b(giv|provid|suppl|bring)\w*[^.\n]*\b(track|music|audio)\b|\b(user's|your own)\s+(own\s+)?(track|music)\b/i);
});

test('3.54.0 AC-3: the sound question offers silence', () => {
  assert.match(soundText354(), /\bsilen(t|ce)\b/i);
});

test('3.54.0 AC-3: generated sound is written by the model with tools on the machine', () => {
  const text = soundText354();
  assert.match(text, /\bmodel\b[^.\n]*\b(writ|generat|compos|synth)\w*|\b(writ|generat|compos|synth)\w*\b[^.\n]*\bmodel\b/i);
  assert.match(text, /\b(on|from)\s+(the|this|the user's)\s+machine\b|\blocal tools?\b|\balready installed\b/i);
});

test('3.54.0 AC-3: generated sound shares one beat grid with the video', () => {
  assert.match(soundText354(), /\b(one|same|single|shared)\s+(\w+\s+){0,2}beat\s+grid\b|\bbeat\s+grid\b[^.\n]*\b(video|picture)\b|\b(video|picture)\b[^.\n]*\bbeat\s+grid\b/i);
});

test('3.54.0 AC-3: sound effects are blended under the music', () => {
  assert.match(soundText354(), /(\bsound effects?\b|\bsfx\b)[^.\n]*\b(under|beneath|below|blend\w*|duck\w*|mix\w*)\b|\b(blend|mix)\w*\b[^.\n]*(\bsound effects?\b|\bsfx\b)/i);
});

test('3.54.0 AC-3: generated sound does not clip', () => {
  // "clip" alone would match "launch clip"
  assert.match(soundText354(), /\b(no|not|never|without|avoid\w*|prevent\w*)\b[^.\n]{0,30}\bclipp(ing|ed)\b|\b(not|never) clip\b/i);
});

test('3.54.0 AC-3: no audio file sits under the skill folder', () => {
  const files = fs.readdirSync(path.join(ROOT, SKILL354), { recursive: true }).map(String);
  assert.deepEqual(files.filter((f) => /\.(wav|mp3|ogg|oga|flac|m4a|aac|aiff?|opus|wma|mid|midi)$/i.test(f)), []);
});

test('3.54.0 AC-4: ATTACK launch clip does not read .env files, keys or credentials', () => {
  someWindowHasAll354(windows354(launch354(), /\b(not|never)\b[^.\n]{0,30}\b(read|open)\b|\bdon't (read|open)\b/i, 0, 4), [/\.env\b/i, /\bkeys?\b/i, /\bcredentials?\b/i], 'not-read list');
});

test('3.54.0 AC-4: ATTACK secrets and personal data never reach the video or the share text', () => {
  someWindowHasAll354(windows354(launch354(), /\bsecrets?\b/i, 2, 5), [
    /\b(never|not|no)\b/i, /\btokens?\b/i, /\binternal URLs?\b/i, /\bcustomer names?\b/i, /\be-?mails?\b/i, /\bpersonal data\b/i, /\bvideo\b/i, /\bshare[- ](text|copy)\b/i,
  ], 'data kept out');
});

test('3.54.0 AC-4: ATTACK such data on screen is replaced with made-up sample values', () => {
  someWindowHasAll354(windows354(launch354(), /\b(replac|swap|substitut)\w*|\binstead\b/i, 1, 1), [/\b(made[- ]up|fake|fictional)\b/i, /\b(sample|values?)\b/i, /\b(on[- ]screen|screen|visible|interface|ui)\b/i], 'replacement');
});

test('3.54.0 AC-5: launch clip delivers a poster frame', () => {
  assert.match(launchText354(), /\bposter\b/i);
});

test('3.54.0 AC-5: launch clip delivers share-copy.txt, passed through humanizer', () => {
  someWindowHasAll354(windows354(launch354(), /\bshare-copy\.txt\b/i, 2, 2), [/\bhumanizer\b/i, /\bshare\b/i], 'share text');
});

test('3.54.0 AC-5: the launch clip section says deliverables go to marketing/motion/', () => {
  assert.match(launchText354(), /\bmarketing\/motion\//i);
});

test('3.54.0 AC-6: the skill credits latent-spaces/brag (MIT) for the launch clip ideas', () => {
  someWindowHasAll354(windows354(rows354().map((r) => r.line), /\blatent-spaces\/brag\b/i, 1, 1), [/\bMIT\b/, /\blaunch clip\b/i], 'brag credit');
});

test('3.54.0 AC-6: the credit for the original prompt stays', () => {
  assert.match(rows354().map((r) => r.line).join('\n'), /\bN01ennn\b[^\n]*\bprompt\b/i);
});

const releaseOffer354 = () => read351('.claude/commands/release.md').split('\n').filter((l) => /\bmotion-video\b/.test(l));

test('3.54.0 AC-7: release.md suggests a launch clip with motion-video as an offer the user answers', () => {
  someWindowHasAll354(releaseOffer354(), [/\blaunch clip\b/i, /\b(suggest\w*|offer\w*|ask\w*|AskUserQuestion)\b/i], 'release offer');
});

test('3.54.0 AC-7: ATTACK the launch clip offer in release.md is not an automatic step', () => {
  const lines = releaseOffer354();
  assert.notEqual(lines.length, 0, 'release.md does not mention motion-video');
  const sentences = lines.flatMap((l) => l.split(/(?<=[.;:])\s+/));
  assert.deepEqual(sentences.filter((s) => /\bautomatic(ally)?\b/i.test(s) && !/\b(not|never|no)\b/i.test(s)), []);
});

test('3.54.0 AC-7: the motion-video row in docs/workflow/skills.md mentions the launch clip', () => {
  const row = read351('docs/workflow/skills.md').match(/^\|\s*`motion-video`\s*\|.*$/m);
  assert.notEqual(row, null, 'no motion-video row');
  assert.match(row[0], /\blaunch clip\b/i);
});

test('3.54.0 AC-8: the prerequisites table lists Node, Playwright and ffmpeg, nothing else', () => {
  const rows = under354(/prerequisites/i).filter((l) => l.startsWith('|')).slice(2);
  assert.deepEqual(rows.map((l) => l.split('|')[1].trim().split(/\s+/)[0].toLowerCase()), ['node', 'playwright', 'ffmpeg']);
});

test('3.54.0 AC-8: hyperframes does not appear in the skill', () => {
  assert.doesNotMatch(read351(`${SKILL354}/SKILL.md`), /hyperframes/i);
});

test('3.54.0 AC-8: the skill installs no new package', () => {
  const md = read351(`${SKILL354}/SKILL.md`);
  const packages = [...md.matchAll(/\b(?:npm\s+(?:i|install)|pnpm\s+add|yarn\s+add|bun\s+add|pip3?\s+install|npx|uv\s+run\s+--with)\s+(?:-\S+\s+)*(@?[\w./-]+)/gi)].map((m) => m[1]);
  assert.deepEqual([...new Set(packages)].sort(), ['numpy', 'playwright']);
  assert.deepEqual(fs.readdirSync(path.join(ROOT, SKILL354), { recursive: true }).map(String).filter((f) => /package(-lock)?\.json$/.test(f)), []);
});

// 3.55.0: agents batch reads in one shell call (AGENTS.md rule 4); the AI add-on guide covers programmatic tool calling for the user's product.
const sentences355 = (text) => text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim());
const rule4355 = () => {
  const rule = read351('AGENTS.md').match(/^4\. \*\*Spend few tokens\.\*\*[\s\S]*?(?=^5\. )/m);
  assert.notEqual(rule, null, 'AGENTS.md has no rule 4 "Spend few tokens"');
  return rule[0];
};
// Rule 4 minus its sentences from before 3.55.0: the older "read only the part you need" must not pass for the new read-only limit.
const batch355 = () => {
  const added = sentences355(rule4355()).filter((s) => !/^4\.$|codebase-memory|do not read files in bulk|read docs only when needed|document-to-markdown/i.test(s));
  assert.notEqual(added.length, 0, 'rule 4 has no batch passage');
  return added;
};

test('3.55.0 AC-1: rule 4 applies when several reads or searches are needed', () => {
  someWindowHasAll354(batch355(), [/\b(several|multiple|many|more than one|two or more)\b/i, /\breads?\b/i, /\bsearch(es)?\b/i], 'several reads or searches');
});

test('3.55.0 AC-1: rule 4 says to run them together in one shell call', () => {
  someWindowHasAll354(batch355(), [/\b(together|batch\w*|at once)\b/i, /\b(one|single)\s+(\w+\s+)?(shell|bash)\s+(call|command)\b/i], 'together in one shell call');
});

test('3.55.0 AC-1: rule 4 says the call uses an inline script', () => {
  assert.match(batch355().join('\n'), /\binline\s+(\w+\s+)?script\b/i);
});

test('3.55.0 AC-1: rule 4 says to print only what is needed', () => {
  assert.match(batch355().join('\n'), /\b(print|output|show)\w*\s+only\b[^.\n]*\bneed|\bonly\s+(print|output|show)\w*\b[^.\n]*\bneed/i);
});

test('3.55.0 AC-2: ATTACK rule 4 limits the batch to reading only', () => {
  // The lookahead keeps "read only the files you need", which is scope advice, from passing as the limit.
  assert.match(batch355().join('\n'), /\b(read-only|read only|reads only|reading only|for reads? only|only (for )?(reading|reads))\b(?!\s+(the|what|those|files?|parts?|lines?)\b)/i);
});

test('3.55.0 AC-2: ATTACK rule 4 says writing, deleting, commits and deploys are not done through the batch', () => {
  const sentences = batch355();
  const banned = {
    // "do not write a script file" is the inline rule, not the limit on writing.
    writing: /\bwrit(e|es|ing)\b(?!\s+(an?\s+|the\s+)?(\w+\s+)?(script|file))/i,
    deleting: /\bdelet(e|es|ing|ion)\b/i,
    commits: /\bcommit(s|ting)?\b/i,
    deploys: /\bdeploy(s|ing|ments?)?\b/i,
  };
  const unstated = Object.keys(banned).filter((k) => !sentences.some((s) => banned[k].test(s) && /\b(not|never|no|nothing|outside)\b|n't\b/i.test(s)));
  assert.deepEqual(unstated, []);
});

test('3.55.0 AC-2: ATTACK rule 4 says the script is not a script file', () => {
  assert.match(batch355().join('\n'), /\b(not|never|no|instead of|rather than|without)\b[^.\n]*\bscript files?\b/i);
});

test('3.55.0 AC-2: ATTACK rule 4 gives the reason next to it, guards only see the command text', () => {
  const sentences = batch355();
  const near = sentences.filter((_, i) => sentences.slice(Math.max(0, i - 1), i + 2).some((s) => /\bscript files?\b/i.test(s)));
  someWindowHasAll354(near, [/\b(guards?|hooks?)\b/i, /\bcommand text\b/i, /\b(only|just|nothing but)\b/i], 'guards only see the command text');
});

// Where the kit keeps it: the AI add-on's template, which install copies to docs/ai/guide.md. The repo root has no docs/ai.
const GUIDE355 = 'kit/templates/addons/ai/docs/ai/guide.md';
const ptc355 = () => {
  let fenced = false, level = 0;
  const section = [];
  for (const line of read351(GUIDE355).split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    const h = fenced ? null : line.match(/^(#{1,6})\s/);
    if (h && level && h[1].length <= level) break;
    if (h && !level && /programmatic tool calling/i.test(line)) level = h[1].length;
    if (level) section.push(line);
  }
  assert.notEqual(section.length, 0, 'the guide has no heading containing "programmatic tool calling"');
  return section;
};
const notUse355 = () => {
  const text = ptc355().join('\n');
  const at = text.search(/\bwhen not\b|\b(not|don't) use\b|\bskip it\b|\bnot worth\b/i);
  assert.notEqual(at, -1, 'the section does not say when not to use it');
  return sentences355(text.slice(at));
};

test('3.55.0 AC-3: the section is for an AI product the user builds', () => {
  assert.match(ptc355().join('\n'), /\b(your|AI)\s+(\w+\s+)?(product|app|application)\b|\b(product|app|application)\s+(that\s+)?you\b/i);
});

test('3.55.0 AC-3: the section names allowed_callers', () => {
  assert.match(ptc355().join('\n'), /\ballowed_callers\b/);
});

test('3.55.0 AC-3: the section names code_execution', () => {
  // No closing \b: the tool type can carry a date suffix.
  assert.match(ptc355().join('\n'), /\bcode_execution/);
});

test('3.55.0 AC-3: the section says it is an API feature', () => {
  assert.match(ptc355().join('\n'), /\bAPI\b[^.\n]*\bfeature\b|\bfeature\b[^.\n]*\bAPI\b/i);
});

test('3.55.0 AC-3: not to use it with few calls and small results', () => {
  someWindowHasAll354(notUse355(), [/\bfew\b/i, /\bcalls?\b/i, /\bsmall\b/i, /\b(results?|outputs?|responses?)\b/i], 'few calls, small results');
});

test('3.55.0 AC-3: not to use it when each call depends on reasoning over the last', () => {
  someWindowHasAll354(notUse355(), [/\b(each|every|next)\b/i, /\bcalls?\b/i, /\b(depend\w*|needs?|requires?|relies|hinges)\b/i, /\breason\w*/i, /\b(last|previous|prior|earlier)\b/i], 'each call depends on reasoning over the last');
});

test('3.55.0 AC-3: not to use it when a user needs to see results between calls', () => {
  someWindowHasAll354(notUse355(), [/\busers?\b/i, /\b(see|sees|seeing|review\w*)\b/i, /\bresults?\b/i, /\bbetween\s+(\w+\s+)?(calls?|steps?)\b/i], 'a user sees results between calls');
});

test('3.55.0 AC-3: the section tells the reader to measure billed input tokens with and without it', () => {
  const windows = windows354(sentences355(ptc355().join('\n')), /\bbilled\b/i, 1, 1);
  someWindowHasAll354(windows, [/\bmeasur\w*/i, /\bbilled\s+(\w+\s+)?input\s+tokens?\b|\binput\s+tokens?\s+billed\b/i, /\bwith\b[^.\n]*\bwithout\b/i], 'measure billed input tokens with and without');
});

// A percentage or a multiplier; "no invented figure" covers both.
const FIGURE355 = /\d\s*%|%\s*\d|\bper\s?cent\b|\b\d+(\.\d+)?\s*(x|times)\b/i;

test('3.55.0 AC-4: ATTACK the AGENTS.md rule carries no percentage or multiplier', () => {
  assert.doesNotMatch(rule4355(), FIGURE355);
});

test('3.55.0 AC-4: ATTACK every figure in the guide beyond the project thresholds gives its source', () => {
  // These three lines are thresholds the project fills in, not claims about a result.
  const thresholds = /\*\*Acceptance threshold:\*\*|50%\/80% alarms|warning at 80%, at 100%/;
  const unsourced = read351(GUIDE355).split('\n').filter((l) => FIGURE355.test(l) && !thresholds.test(l) && !/https?:\/\/\S+|\bsource:\s*\S/i.test(l));
  assert.deepEqual(unsourced, []);
});
