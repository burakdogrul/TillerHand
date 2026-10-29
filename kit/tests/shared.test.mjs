// Run: node --test "kit/tests/*.test.mjs"
// Hook input/output layer: the same guards work in Claude Code, Codex and Antigravity formats.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseInput, decisionText, patchFiles } from '../../.claude/hooks/shared.mjs';
import { commandToSkill, syncToolSection } from '../kit.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(REPO, '.claude', 'hooks');
const SECRET = 'sk_' + 'live_' + 'b'.repeat(24); // split up so this file does not trip the secret scan

// The input each of the three tools sends for the same operation (root: project folder)
const write = (tool, root, file, text) => ({
  claude: { tool_name: 'Write', cwd: root, tool_input: { file_path: path.join(root, file), content: text } },
  codex: { tool_name: 'apply_patch', turn_id: 't1', cwd: root, tool_input: { command: `*** Begin Patch\n*** Add File: ${file}\n+${text}\n*** End Patch\n` } },
  antigravity: { toolCall: { name: 'write_to_file', args: { TargetFile: path.join(root, file), CodeContent: text } }, workspacePaths: [root] },
})[tool];
const command = (tool, root, c) => ({
  claude: { tool_name: 'Bash', cwd: root, tool_input: { command: c } },
  codex: { tool_name: 'Bash', turn_id: 't1', cwd: root, tool_input: { command: c } },
  antigravity: { toolCall: { name: 'run_command', args: { CommandLine: c, Cwd: root } }, workspacePaths: [root] },
})[tool];

// Codex and Antigravity do not set CLAUDE_PROJECT_DIR: the root must come from the input (cwd / workspacePaths)
const envFor = (tool, root) => {
  const env = { ...process.env, HOME: root, USERPROFILE: root }; // the developer's own ~/.vibe-kit preferences stay out of the test
  delete env.CLAUDE_PROJECT_DIR;
  if (tool === 'claude') env.CLAUDE_PROJECT_DIR = root;
  return env;
};
// Hooks run from inside the project as after install: the root is found from the script's location
const run = (script, tool, root, input) => {
  const r = spawnSync(process.execPath, [path.join(root, '.claude', 'hooks', script)], { input: JSON.stringify(input), encoding: 'utf8', env: envFor(tool, root), cwd: os.tmpdir() });
  assert.equal(r.status, 0, r.stderr);
  if (!r.stdout.trim()) return null;
  const j = JSON.parse(r.stdout);
  return tool === 'antigravity' ? j.decision : j.hookSpecificOutput.permissionDecision;
};
const TOOLS = ['claude', 'codex', 'antigravity'];
// Temporary project: the kit's hook scripts are copied into it
const tempRoot = (name) => {
  const k = fs.mkdtempSync(path.join(os.tmpdir(), `shared-${name}-`));
  fs.cpSync(HOOKS, path.join(k, '.claude', 'hooks'), { recursive: true });
  return k;
};

test('parseInput: all three formats give the same command and file', () => {
  for (const tool of TOOLS) {
    assert.equal(parseInput(command(tool, '/p', 'git status')).command, 'git status', tool);
    const f = parseInput(write(tool, '/p', 'a.ts', 'x')).files;
    assert.equal(f.length, 1, tool);
    assert.ok(f[0].text.includes('x'), tool); // Antigravity scans every argument
  }
  assert.deepEqual(parseInput(command('antigravity', '/p', 'ls')).tool, 'antigravity');
  assert.deepEqual(parseInput(command('codex', '/p', 'ls')).tool, 'codex');
  const multi = parseInput({ toolCall: { name: 'multi_replace_file_content', args: { TargetFile: '/p/a', ReplacementChunks: [{ ReplacementContent: 'a' }, { ReplacementContent: SECRET }] } } });
  assert.ok(multi.files[0].text.includes(SECRET), 'Antigravity multi replace');
});

test('Codex patch: added, updated and moved files', () => {
  const f = patchFiles('*** Begin Patch\n*** Add File: new.ts\n+a\n+b\n*** Update File: old.ts\n@@\n-x\n+y\n*** Update File: t.ts\n*** Move to: u.ts\n+z\n*** End Patch');
  assert.deepEqual(f.map(({ path: p, isNew }) => [p, isNew]), [['new.ts', true], ['old.ts', false], ['t.ts', false], ['u.ts', true]]);
  assert.equal(f[0].text, 'a\nb\n');
  assert.equal(f[1].text, 'y\n', 'a removed line is not part of the text');
});

test('decision format: "ask" turns into deny on Codex, Antigravity uses the decision field', () => {
  assert.equal(JSON.parse(decisionText('claude', 'ask', 'n')).hookSpecificOutput.permissionDecision, 'ask');
  const c = JSON.parse(decisionText('codex', 'ask', 'n')).hookSpecificOutput;
  assert.equal(c.permissionDecision, 'deny');
  assert.match(c.permissionDecisionReason, /ask the user/);
  assert.deepEqual(JSON.parse(decisionText('antigravity', 'ask', 'n')), { decision: 'ask', reason: 'n' });
});

test('secret guard: secret writes are denied in all three input formats', () => {
  const root = tempRoot('secret');
  for (const tool of TOOLS) {
    assert.equal(run('guard-secrets.mjs', tool, root, write(tool, root, 'a.ts', `const k = "${SECRET}"`)), 'deny', tool);
    assert.equal(run('guard-secrets.mjs', tool, root, write(tool, root, 'a.ts', 'const k = process.env.K')), null, `${tool}: clean`);
  }
});

test('destructive command shield: all three formats; "ask" is denied on Codex', () => {
  const root = tempRoot('shield');
  const table = 'users';
  for (const tool of TOOLS) {
    assert.equal(run('destructive-guard.mjs', tool, root, command(tool, root, `psql -c "DROP TABLE ${table}"`)), 'deny', tool);
    assert.equal(run('destructive-guard.mjs', tool, root, command(tool, root, 'git status')), null, tool);
  }
  assert.equal(run('destructive-guard.mjs', 'claude', root, command('claude', root, 'git push origin main')), 'ask');
  assert.equal(run('destructive-guard.mjs', 'antigravity', root, command('antigravity', root, 'git push origin main')), 'ask');
  assert.equal(run('destructive-guard.mjs', 'codex', root, command('codex', root, 'git push origin main')), 'deny');
});

test('structure guard and edit lock: root is cwd on Codex, workspacePaths on Antigravity', () => {
  const root = tempRoot('structure');
  fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'structure.json'), JSON.stringify({ allow: ['src/**'], deny: ['**/*.bak'] }));
  for (const tool of TOOLS) {
    assert.equal(run('structure-guard.mjs', tool, root, write(tool, root, 'src/a.ts', 'x')), null, `${tool}: in map`);
    assert.equal(run('structure-guard.mjs', tool, root, write(tool, root, 'src/a.bak', 'x')), 'deny', `${tool}: clutter`);
    assert.equal(run('structure-guard.mjs', tool, root, write(tool, root, 'other/a.ts', 'x')), tool === 'codex' ? 'deny' : 'ask', `${tool}: off map`);
  }
  fs.writeFileSync(path.join(root, '.claude', 'state', 'freeze.json'), JSON.stringify({ dir: 'src/auth' }));
  for (const tool of TOOLS) {
    assert.equal(run('freeze-guard.mjs', tool, root, write(tool, root, 'src/lib/x.ts', 'x')), 'deny', `${tool}: outside lock`);
    assert.equal(run('freeze-guard.mjs', tool, root, write(tool, root, 'src/auth/x.ts', 'x')), null, `${tool}: inside lock`);
  }
});

test('session start: Codex additionalContext, Antigravity injectSteps', () => {
  const root = tempRoot('session');
  const session = (tool, input) => JSON.parse(spawnSync(process.execPath, [path.join(root, '.claude', 'hooks', 'session-start.mjs')], { input: JSON.stringify(input), encoding: 'utf8', env: envFor(tool, root) }).stdout);
  const c = session('codex', { hook_event_name: 'SessionStart', cwd: root }); // no turn_id expected at SessionStart
  assert.equal(c.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(c.systemMessage, undefined, 'no undocumented field on Codex');
  assert.doesNotMatch(c.hookSpecificOutput.additionalContext, /get_usage|caveman/, 'no Claude-only notes');
  const a = session('antigravity', { workspacePaths: [root] });
  assert.match(a.injectSteps[0].systemMessage.systemMessage, /^\[Kit\]/);
});

test('command -> skill: name, description and body', () => {
  const s = commandToSkill('build', '---\ndescription: Runs the task: tests it.\nargument-hint: [task id]\n---\n\nTask: $ARGUMENTS\n');
  assert.match(s, /^---\nname: build\ndescription: "Runs the task: tests it."\n---\n/);
  assert.match(s, /Expected: \[task id\]/);
  assert.match(s, /Task: \$ARGUMENTS\n$/);
});

test('init --tool: files are generated per tool, no copies kept in the repo', () => {
  const tmp = tempRoot('init');
  const kit = path.join(tmp, 'kit-clone');
  fs.cpSync(REPO, kit, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)$/.test(src) && !src.endsWith('.kit.json') });
  assert.ok(!fs.existsSync(path.join(REPO, '.agents')) && !fs.existsSync(path.join(REPO, '.codex')), 'no generated copies in the kit repo');
  const init = (name, ...args) => {
    const p = path.join(tmp, name);
    const r = spawnSync(process.execPath, [path.join(kit, 'kit', 'kit.mjs'), 'init', '--project', p, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return p;
  };
  const commandCount = fs.readdirSync(path.join(REPO, '.claude', 'commands')).length;
  const exists = (p, f) => fs.existsSync(path.join(p, f));
  const record = (p) => JSON.parse(fs.readFileSync(path.join(p, '.kit.json'), 'utf8'));

  const cl = init('claude');
  assert.equal(record(cl).tool, null, 'no tool chosen: /start asks');
  assert.ok(!exists(cl, '.agents') && !exists(cl, '.codex'), 'Claude Code files only');
  assert.ok(exists(cl, 'AGENTS.md') && /^@AGENTS\.md/.test(fs.readFileSync(path.join(cl, 'CLAUDE.md'), 'utf8')), 'CLAUDE.md imports AGENTS.md');

  const cx = init('codex', '--tool', 'codex');
  assert.deepEqual(record(cx).tool, ['codex']);
  assert.ok(exists(cx, '.codex/hooks.json') && !exists(cx, '.agents/hooks.json'));
  assert.equal(fs.readdirSync(path.join(cx, '.agents', 'skills')).filter((d) => exists(cx, `.agents/skills/${d}/SKILL.md`)).length, commandCount + 4, 'every command + the kit\'s 4 skills');
  assert.match(fs.readFileSync(path.join(cx, '.agents/skills/start/SKILL.md'), 'utf8'), /^---\nname: start\n/);
  assert.ok(record(cx).files['.codex/hooks.json'], 'hook config is tracked on update');

  const ag = init('ag', '--tool', 'antigravity,claude');
  assert.deepEqual(record(ag).tool, ['antigravity', 'claude']);
  assert.ok(exists(ag, '.agents/hooks.json') && exists(ag, '.agents/skills/adopt/SKILL.md') && !exists(ag, '.codex'));

  const bad = spawnSync(process.execPath, [path.join(kit, 'kit', 'kit.mjs'), 'init', '--project', path.join(tmp, 'x'), '--tool', 'cursor'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Invalid tool: cursor/);

  // Every script in the hook configs exists, and Antigravity tool names match what the layer knows
  for (const f of ['.codex/hooks.json', '.agents/hooks.json']) {
    const p = f.startsWith('.codex') ? cx : ag;
    for (const b of fs.readFileSync(path.join(p, f), 'utf8').match(/\.claude\/hooks\/[\w-]+\.mjs/g)) assert.ok(exists(p, b), `${f}: ${b}`);
  }

  // Update: a changed command refreshes its skill copy; a hook config the user changed is kept
  assert.equal(spawnSync(process.execPath, [path.join(kit, 'kit', 'kit.mjs'), 'install', '--type', 'backend', '--project', cx], { encoding: 'utf8' }).status, 0);
  fs.writeFileSync(path.join(cx, '.codex/hooks.json'), '{"hooks":{}}\n');
  fs.appendFileSync(path.join(kit, '.claude/commands/build.md'), '\nNEW LINE\n');
  const u = spawnSync(process.execPath, [path.join(kit, 'kit', 'kit.mjs'), 'update', '--project', cx], { encoding: 'utf8' });
  assert.equal(u.status, 0, u.stderr);
  assert.match(fs.readFileSync(path.join(cx, '.agents/skills/build/SKILL.md'), 'utf8'), /NEW LINE/);
  assert.equal(fs.readFileSync(path.join(cx, '.codex/hooks.json'), 'utf8'), '{"hooks":{}}\n');
  assert.ok(exists(cx, '.codex/hooks.json.kit-new') === false, 'kit unchanged: no .kit-new');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// Attacker tests for the security audit (3.9.0 RET) findings
const patch = (root, body, extra = {}) => ({ tool_name: 'apply_patch', turn_id: 't', cwd: root, tool_input: { command: `*** Begin Patch\n${body}\n*** End Patch\n` }, ...extra });

test('attacker: a secret is denied even with a padded or unparsable patch header', () => {
  const root = tempRoot('patch');
  assert.equal(run('guard-secrets.mjs', 'codex', root, patch(root, `  *** Add File: x.ts\n+k = "${SECRET}"`)), 'deny', 'leading space');
  assert.equal(run('guard-secrets.mjs', 'codex', root, patch(root, `*** Insert: x.ts\n+k = "${SECRET}"`)), 'deny', 'unknown header');
  assert.equal(run('guard-secrets.mjs', 'codex', root, { tool_name: 'apply_patch', turn_id: 't', cwd: root, tool_input: { command: { patch: SECRET } } }), 'deny', 'object-typed input is scanned without crashing');
});

test('attacker: a secret is denied even if the Antigravity field name changes; a write without a path hits the lock', () => {
  const root = tempRoot('field');
  const g = { toolCall: { name: 'write_to_file', args: { Path: path.join(root, 'a.ts'), Content: SECRET } }, workspacePaths: [root] };
  assert.equal(run('guard-secrets.mjs', 'antigravity', root, g), 'deny');
  fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'state', 'freeze.json'), JSON.stringify({ dir: 'src/auth' }));
  g.toolCall.args.Content = 'clean';
  assert.equal(run('freeze-guard.mjs', 'antigravity', root, g), 'deny', 'the lock denies when the target path is unknown');
});

test('attacker: the root is found even when Codex opens in a subfolder; lock and structure guard work', () => {
  const root = tempRoot('subfolder');
  fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
  fs.mkdirSync(path.join(root, 'sub'));
  fs.writeFileSync(path.join(root, '.claude', 'structure.json'), JSON.stringify({ allow: ['src/**', 'sub/**'], deny: ['**/*.bak'] }));
  fs.writeFileSync(path.join(root, '.claude', 'state', 'freeze.json'), JSON.stringify({ dir: 'src/auth' }));
  const sub = path.join(root, 'sub');
  assert.equal(run('freeze-guard.mjs', 'codex', root, patch(sub, '*** Add File: ../src/lib/x.ts\n+x')), 'deny');
  assert.equal(run('freeze-guard.mjs', 'codex', root, patch(sub, '*** Add File: ../src/auth/x.ts\n+x')), null, 'relative path resolves against cwd');
  assert.equal(run('structure-guard.mjs', 'codex', root, patch(sub, '*** Add File: a.bak\n+x')), 'deny');
  fs.mkdirSync(path.join(sub, '.git')); // a fake marker the agent opens in a subfolder does not change the root
  assert.equal(run('freeze-guard.mjs', 'codex', root, patch(sub, '*** Add File: ../src/lib/x.ts\n+x')), 'deny', 'fake .git');
  assert.equal(run('freeze-guard.mjs', 'antigravity', root, { toolCall: { name: 'write_to_file', args: { TargetFile: path.join(root, 'src/lib/x.ts'), CodeContent: 'x' } }, workspacePaths: [sub] }), 'deny', 'workspacePaths does not decide the root');
});

test('attacker: on non-Claude tools, rule and guard files, .env and the lock are protected', () => {
  const root = tempRoot('protected');
  for (const [f, codex, ag] of [['.claude/state/freeze.json', 'deny', 'ask'], ['.claude/hooks/guard-secrets.mjs', 'deny', 'ask'], ['.codex/hooks.json', 'deny', 'ask'], ['.agents/hooks.json', 'deny', 'ask'], ['AGENTS.md', 'deny', 'ask'], ['.env', 'deny', 'deny'], ['.env.local', 'deny', 'deny']]) {
    assert.equal(run('freeze-guard.mjs', 'codex', root, patch(root, `*** Delete File: ${f}`)), codex, `codex: ${f}`);
    assert.equal(run('freeze-guard.mjs', 'antigravity', root, write('antigravity', root, f, 'x')), ag, `antigravity: ${f}`);
  }
  assert.equal(run('freeze-guard.mjs', 'claude', root, write('claude', root, '.claude/x.md', 'x')), null, 'Claude Code: settings.json permissions apply, the hook stays out');
  assert.equal(run('freeze-guard.mjs', 'codex', root, patch(root, '*** Add File: .env.example\n+A=')), null, '.env.example is free');
});

test('attacker: commands forbidden in the Claude permission list are also denied on Codex and Antigravity', () => {
  const root = tempRoot('command');
  for (const c of ['rm -rf .', 'git reset --hard HEAD~3', 'git push --force origin x', 'cat .env', 'Remove-Item -Recurse -Force src']) {
    assert.equal(run('destructive-guard.mjs', 'codex', root, command('codex', root, c)), 'deny', `codex: ${c}`);
    assert.equal(run('destructive-guard.mjs', 'antigravity', root, command('antigravity', root, c)), 'deny', `antigravity: ${c}`);
    assert.equal(run('destructive-guard.mjs', 'claude', root, command('claude', root, c)), null, `claude: ${c} (in settings.json deny)`);
  }
  for (const c of ['rm .claude/state/freeze.json', 'sed -i s/deny/x/ .claude/hooks/destructive-guard.mjs', 'echo {} > .agents/hooks.json', 'cp x AGENTS.md']) {
    assert.equal(run('destructive-guard.mjs', 'codex', root, command('codex', root, c)), 'deny', `codex shell: ${c}`);
    assert.equal(run('destructive-guard.mjs', 'antigravity', root, command('antigravity', root, c)), 'ask', `antigravity shell: ${c}`);
  }
  assert.equal(run('destructive-guard.mjs', 'codex', root, command('codex', root, 'node .claude/hooks/usage.mjs 2>&1')), null, 'running a kit script is free');
  for (const c of ['rm -r .claude', 'git checkout -- .claude/hooks/shared.mjs', 'git restore AGENTS.md']) {
    assert.equal(run('destructive-guard.mjs', 'antigravity', root, command('antigravity', root, c)), 'ask', `antigravity shell: ${c}`);
  }
  assert.equal(run('destructive-guard.mjs', 'antigravity', root, command('antigravity', root, 'git push --force origin main')), 'deny', 'the stricter decision wins (deny, not ask)');
  const read = (p) => ({ toolCall: { name: 'view_file', args: { AbsolutePath: path.join(root, p) } }, workspacePaths: [root] });
  assert.equal(run('freeze-guard.mjs', 'antigravity', root, read('.env')), 'deny', 'Antigravity cannot read .env');
  assert.equal(run('freeze-guard.mjs', 'antigravity', root, read('.claude/hooks/shared.mjs')), null, 'rule files are readable');
  assert.equal(run('freeze-guard.mjs', 'antigravity', root, { toolCall: { name: 'list_dir', args: { DirectoryPath: path.join(root, 'secrets') } }, workspacePaths: [root] }), 'deny', 'the secrets folder itself');
  assert.equal(run('freeze-guard.mjs', 'antigravity', root, { toolCall: { name: 'new_read_tool', args: { Target: path.join(root, '.env.local') } }, workspacePaths: [root] }), 'deny', 'unknown tool name');
  assert.equal(run('freeze-guard.mjs', 'antigravity', root, { toolCall: { name: 'view_files', args: { Items: [{ Where: path.join(root, '.env') }] } }, workspacePaths: [root] }), 'deny', 'nested argument');
  const lock = 'node .claude/hooks/freeze-guard.mjs --off';
  assert.equal(run('destructive-guard.mjs', 'codex', root, command('codex', root, lock)), 'deny');
  assert.equal(run('destructive-guard.mjs', 'antigravity', root, command('antigravity', root, lock)), 'ask');
});

test('attacker: shell secret writes are denied on Codex and Antigravity; Codex input without turn_id is not taken for Claude', () => {
  const root = tempRoot('shell');
  const heredoc = `cat > a.ts <<EOF\nk = "${SECRET}"\nEOF`;
  assert.equal(run('guard-secrets.mjs', 'codex', root, command('codex', root, heredoc)), 'deny');
  assert.equal(run('guard-secrets.mjs', 'antigravity', root, command('antigravity', root, heredoc)), 'deny');
  assert.equal(run('guard-secrets.mjs', 'claude', root, command('claude', root, heredoc)), null, 'Claude Code behavior unchanged');
  const noTurn = { tool_name: 'Bash', cwd: root, tool_input: { command: 'git push origin main' } };
  assert.equal(run('destructive-guard.mjs', 'codex', root, noTurn), 'deny', 'no CLAUDE_PROJECT_DIR means Codex: ask is denied');
});

test('init: the project\'s AGENTS.md and skill files are not overwritten; a tool is added later to a 3.8 record', () => {
  const tmp = tempRoot('init2');
  const kit = path.join(tmp, 'kit-clone');
  fs.cpSync(REPO, kit, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)$/.test(src) && !src.endsWith('.kit.json') });
  const kitMjs = path.join(kit, 'kit', 'kit.mjs');
  const p = path.join(tmp, 'old');
  fs.mkdirSync(path.join(p, '.agents', 'skills', 'build'), { recursive: true });
  fs.writeFileSync(path.join(p, 'AGENTS.md'), '# Old\n- use pnpm\n');
  fs.writeFileSync(path.join(p, '.agents/skills/build/SKILL.md'), 'my own build skill\n');
  const r = spawnSync(process.execPath, [kitMjs, 'init', '--project', p, '--tool', 'codex'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(p, 'AGENTS.md'), 'utf8'), '# Old\n- use pnpm\n');
  assert.match(fs.readFileSync(path.join(p, 'CLAUDE.md'), 'utf8'), /^@AGENTS\.md\.kit-new$/m, 'Claude reads the kit rules from .kit-new until /adopt');
  assert.equal(fs.readFileSync(path.join(p, '.agents/skills/build/SKILL.md'), 'utf8'), 'my own build skill\n');
  assert.ok(fs.existsSync(path.join(p, '.agents/skills/build/SKILL.md.kit-new')) && /build\/SKILL\.md/.test(r.stdout), 'kit version beside it, in the report');

  // 3.8 project: no tool field; update --tool adds Codex
  const q = path.join(tmp, 'v38');
  assert.equal(spawnSync(process.execPath, [kitMjs, 'init', '--project', q], { encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync(process.execPath, [kitMjs, 'install', '--type', 'backend', '--project', q], { encoding: 'utf8' }).status, 0);
  const k = JSON.parse(fs.readFileSync(path.join(q, '.kit.json'), 'utf8'));
  delete k.tool;
  fs.writeFileSync(path.join(q, '.kit.json'), JSON.stringify(k));
  const u = spawnSync(process.execPath, [kitMjs, 'update', '--project', q, '--tool', 'codex'], { encoding: 'utf8' });
  assert.equal(u.status, 0, u.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(q, '.kit.json'), 'utf8')).tool, ['codex']);
  assert.ok(fs.existsSync(path.join(q, '.codex/hooks.json')) && fs.existsSync(path.join(q, '.agents/skills/start/SKILL.md')));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('3.14.1 NotebookEdit: notebook path and new cell text are read', () => {
  const f = parseInput({ tool_name: 'NotebookEdit', tool_input: { notebook_path: '/p/n.ipynb', new_source: 'print(1)', cell_id: 'c1' } }).files;
  assert.deepEqual(f.map(({ path: p, text }) => ({ path: p, text })), [{ path: '/p/n.ipynb', text: 'print(1)' }]);
});

test('3.15.1 F-13 the Codex/Antigravity section of AGENTS.md is filled only for those tools', () => {
  const block = (body) => `# X\n\n<!-- kit:other-tools -->\n${body}<!-- /kit:other-tools -->\n\n## Next\n`;
  const kit = block('## In Codex and Antigravity\n\nrule\n');
  assert.equal(syncToolSection(kit, kit, false), block(''), 'claude only: emptied, markers stay');
  assert.equal(syncToolSection(block(''), kit, true), kit, 'tool added later: filled from the kit');
  assert.equal(syncToolSection(kit, kit, true), kit);
  const edited = block('my own note\n');
  assert.equal(syncToolSection(edited, kit, false), edited, 'a user-edited block is not emptied');
  assert.equal(syncToolSection(edited, kit, true), edited, 'and not overwritten');
  assert.equal(syncToolSection('# Old\n- pnpm\n', kit, false), '# Old\n- pnpm\n', 'no markers: untouched');

  const tmp = tempRoot('tools-section');
  const kitDir = path.join(tmp, 'kit-clone');
  fs.cpSync(REPO, kitDir, { recursive: true, filter: (src) => !/[\/](\.git|node_modules)$/.test(src) && !src.endsWith('.kit.json') });
  const kitMjs = path.join(kitDir, 'kit', 'kit.mjs');
  const section = /<!-- kit:other-tools -->\n## In Codex and Antigravity/;
  const agents = (p) => fs.readFileSync(path.join(p, 'AGENTS.md'), 'utf8');
  const cl = path.join(tmp, 'cl');
  assert.equal(spawnSync(process.execPath, [kitMjs, 'init', '--project', cl], { encoding: 'utf8' }).status, 0);
  assert.doesNotMatch(agents(cl), section, 'init without a tool: empty block');
  assert.match(agents(cl), /<!-- kit:other-tools -->\n<!-- \/kit:other-tools -->/);
  assert.equal(spawnSync(process.execPath, [kitMjs, 'install', '--type', 'backend', '--project', cl, '--tool', 'codex'], { encoding: 'utf8' }).status, 0);
  assert.match(agents(cl), section, 'install --tool codex fills it');
  const cx = path.join(tmp, 'cx');
  assert.equal(spawnSync(process.execPath, [kitMjs, 'init', '--project', cx, '--tool', 'antigravity'], { encoding: 'utf8' }).status, 0);
  assert.match(agents(cx), section, 'init --tool antigravity: filled');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('3.28.1 every hook finds the project root the same way (findRoot), not from the folder it was started in', () => {
  const fromCwd = fs.readdirSync(HOOKS).filter((f) => f.endsWith('.mjs') && /CLAUDE_PROJECT_DIR\s*\|\|\s*process\.cwd\(\)/.test(fs.readFileSync(path.join(HOOKS, f), 'utf8')));
  assert.deepEqual(fromCwd, [], 'Codex runs hooks from a subfolder: cwd is not the root');
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'checkpoint.mjs'), '--list', '--json'], { cwd: path.join(REPO, 'kit'), encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Array.isArray(JSON.parse(r.stdout).commits), 'runs against the repo from kit/');
});
