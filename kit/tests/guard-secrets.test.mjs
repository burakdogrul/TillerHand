// Run: node --test "kit/tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findSecrets } from '../../.claude/hooks/guard-secrets.mjs';

const HOOK = fileURLToPath(new URL('../../.claude/hooks/guard-secrets.mjs', import.meta.url));
// Test values are split up so this file itself does not trip the secret scan
const FAKE = {
  anthropic: 'sk-' + 'ant-api03-' + 'a'.repeat(40),
  stripe: 'sk_' + 'live_' + 'b'.repeat(24),
  aws: 'AKIA' + 'ABCDEFGHIJKLMNOP',
  pem: '-----BEGIN ' + 'PRIVATE KEY-----',
  supabase: 'sb_' + 'secret_' + 'N7c-' + 'c'.repeat(16) + '_x9Ab',
};

test('catches real key patterns', () => {
  for (const [name, value] of Object.entries(FAKE)) assert.ok(findSecrets(`const k = "${value}"`).length, name);
});

test('no alarm on normal code', () => {
  const clean = [
    'const key = process.env.ANTHROPIC_API_KEY',
    'STRIPE_SECRET_KEY=',
    'password: "testpassword123"',
    'const task = "sk-short"',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY=',
    'SUPABASE_SECRET_KEY=sb_secret_...',
    'SUPABASE_SECRET_KEY=sb_secret_your-secret-key-here',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_' + 'd'.repeat(32),
  ];
  for (const s of clean) assert.deepEqual(findSecrets(s), [], s);
});

const run = (input) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8' });

const denied = (r) => JSON.parse(r.stdout || '{}').hookSpecificOutput?.permissionDecision === 'deny';

test('hook: denies a secret inside Write', () => {
  const r = run({ tool_name: 'Write', tool_input: { file_path: 'a.ts', content: `x = "${FAKE.stripe}"` } });
  assert.equal(r.status, 0);
  assert.ok(denied(r));
  assert.match(r.stdout, /BLOCKED/);
});

test('hook: Edit and MultiEdit are checked', () => {
  assert.ok(denied(run({ tool_input: { file_path: 'a', new_string: FAKE.aws } })));
  assert.ok(denied(run({ tool_input: { file_path: 'a', edits: [{ new_string: 'ok' }, { new_string: FAKE.pem }] } })));
});

test('hook: clean content and broken input pass', () => {
  const clean = run({ tool_input: { file_path: 'a', content: 'hello' } });
  assert.equal(clean.status, 0);
  assert.equal(clean.stdout, '');
  assert.equal(spawnSync(process.execPath, [HOOK], { input: 'broken', encoding: 'utf8' }).status, 0);
});

// ---------- 3.49.7: security audit of guard-secrets ----------

// Mixed-case letters and digits, built at runtime so this file holds no key literal
const alnum = (n) => Array.from({ length: n }, (_, i) => 'aB3xQ9mZ7k'[i % 10]).join('');
// Claude Code PreToolUse input with CLAUDE_PROJECT_DIR set (tool detected as claude)
const runClaude = (input, timeout = 20000) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-3497-'));
  try {
    return spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: root, ...input }),
      encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root }, timeout,
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
};

test('3.49.7: ATTACK ReDoS: a long run of -sb_secret_ before a real key is denied by the hook in under 3000 ms', () => {
  const content = '-sb_secret_'.repeat(50000) + '\n' + `const k = "${FAKE.anthropic}"\n`;
  const start = Date.now();
  const r = runClaude({ tool_name: 'Write', tool_input: { file_path: 'a.ts', content } }, 10000);
  const ms = Date.now() - start;
  assert.equal(r.error, undefined, `spawn error: ${r.error && r.error.code} after ${ms} ms`);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(denied(r), `expected deny, stdout: ${r.stdout.slice(0, 200)}`);
  assert.ok(ms < 3000, `took ${ms} ms`);
});

test('3.49.7: ATTACK ReDoS: findSecrets on a long run of -sb_secret_ returns in under 1000 ms', () => {
  // Measured in a child process so a catastrophic regex cannot stall the whole test run
  const mod = new URL('../../.claude/hooks/guard-secrets.mjs', import.meta.url).href;
  const code = `const { findSecrets } = await import(${JSON.stringify(mod)});
const s = '-sb_secret_'.repeat(50000); const t = Date.now(); const f = findSecrets(s);
process.stdout.write(JSON.stringify({ ms: Date.now() - t, f }));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.error, undefined, `child did not finish in 5000 ms: ${r.error && r.error.code}`);
  assert.equal(r.status, 0, r.stderr);
  const { ms, f } = JSON.parse(r.stdout);
  assert.ok(ms < 1000, `findSecrets took ${ms} ms`);
  assert.deepEqual(f, [], 'no digit, no real key: nothing found');
});

test('3.49.7: ATTACK boundary: a key right after an underscore or a letter is found', () => {
  const cases = [
    'STRIPE=prod_' + 'sk_' + 'live_' + alnum(32),
    'OPENAI_' + 'sk-' + alnum(48),
    '"_' + 'AK' + 'IA' + 'QWERTYUIOP234567' + '"',
  ];
  const missed = cases.filter((s) => findSecrets(s).length === 0);
  assert.deepEqual(missed, [], 'these keys were not found');
});

test('3.49.7: new key formats are found (Google, GitLab, Hugging Face, Stripe webhook, npm, SendGrid, Slack app/refresh, PGP)', () => {
  const formats = {
    google: 'AI' + 'za' + 'Sy' + alnum(30) + '_-x',
    gitlab: 'gl' + 'pat-' + alnum(20),
    huggingface: 'hf' + '_' + alnum(34),
    stripeWebhook: 'wh' + 'sec_' + alnum(32),
    npm: 'np' + 'm_' + alnum(36),
    sendgrid: 'S' + 'G.' + alnum(20) + '-_' + '.' + alnum(40) + '_-x',
    slackApp: 'xa' + 'pp-1-' + alnum(20),
    slackRefresh: 'xo' + 'xe.' + 'xo' + 'xp-1-' + alnum(20),
    pgp: '-----BEGIN ' + 'PGP PRIVATE KEY BLOCK-----',
  };
  assert.equal(formats.google.length, 39, 'AIza + 35');
  assert.equal(formats.sendgrid.length, 3 + 22 + 1 + 43, 'SG. + 22 + . + 43');
  const missed = Object.entries(formats).filter(([, v]) => findSecrets(`const k = "${v}"`).length === 0).map(([k]) => k);
  assert.deepEqual(missed, [], 'these formats were not found');
});

test('3.49.7: new formats stay quiet on look-alike normal code', () => {
  for (const s of ['const prefix = "AIzaSy"', 'from hf_hub import x', 'npm_config_cache=/tmp/npm', 'SG.title = "x"', 'const glpatch = 1'])
    assert.deepEqual(findSecrets(s), [], s);
});

test('3.49.7: ATTACK non-string fields: a Write content array and a NotebookEdit new_source array holding a key are denied', () => {
  const w = runClaude({ tool_name: 'Write', tool_input: { file_path: 'a.ts', content: ['const a = 1;\n', `const k = "${FAKE.anthropic}";\n`] } });
  assert.equal(w.status, 0, w.stderr);
  assert.ok(denied(w), `Write with array content: stdout ${JSON.stringify(w.stdout)}`);
  const n = runClaude({ tool_name: 'NotebookEdit', tool_input: { notebook_path: 'a.ipynb', new_source: ['import os\n', `k = "${FAKE.anthropic}"\n`] } });
  assert.equal(n.status, 0, n.stderr);
  assert.ok(denied(n), `NotebookEdit with array new_source: stdout ${JSON.stringify(n.stdout)}`);
});

test('3.49.7: ATTACK --staged: an added line that starts with "++ " and holds a key stops the commit; a clean staged file passes', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'staged-3497-'));
  try {
    const git = (...args) => {
      const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
      assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    };
    const staged = () => spawnSync(process.execPath, [HOOK, '--staged'], { cwd: repo, encoding: 'utf8', timeout: 20000 });
    git('init', '-q');
    fs.writeFileSync(path.join(repo, 'clean.txt'), 'hello\n++ not a key\n');
    git('add', 'clean.txt');
    assert.equal(staged().status, 0, 'clean staged file passes');
    fs.writeFileSync(path.join(repo, 'notes.txt'), `++ key ${FAKE.anthropic}\n`);
    git('add', 'notes.txt');
    const r = staged();
    assert.equal(r.status, 1, `a "++ " line with a key must stop the commit; stderr: ${r.stderr}`);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

// ---------- 3.49.12: secrets split across edits, unknown Antigravity tools, Codex patch in tool_input.input ----------

// Two halves of one Stripe key: neither half alone matches, the joined key does
const HALF_A = 'sk_' + 'live_' + 'abcdefghij', HALF_B = 'klmnopqrstuvwxyz12';
// Temp project holding a.ts with the given text; returns its root
const projectWithFile = (text) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-34912-'));
  fs.writeFileSync(path.join(root, 'a.ts'), text);
  return root;
};
// Runs the hook as tool (claude | codex | antigravity) from root; returns deny | ask | null
const hookDecision = (tool, root, input) => {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  if (tool === 'claude') env.CLAUDE_PROJECT_DIR = root;
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8', env, timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  if (!r.stdout.trim()) return null;
  const j = JSON.parse(r.stdout);
  return tool === 'antigravity' ? j.decision : j.hookSpecificOutput.permissionDecision;
};

test('3.49.12: precondition: neither half of the split key is a secret, the joined key is', () => {
  assert.deepEqual(findSecrets(`const a = "${HALF_A}HOLDER";`), []);
  assert.deepEqual(findSecrets(`const a = "PLACE${HALF_B}";`), []);
  assert.deepEqual(findSecrets(`${HALF_A}\n${HALF_B}`), []);
  assert.deepEqual(findSecrets(`const a = "${HALF_A}${HALF_B}";`), ['Stripe secret key']);
});

test('3.49.12: ATTACK a key split across MultiEdit edits is denied (the file after the edit holds it)', () => {
  const root = projectWithFile('const a = "PLACEHOLDER";\n');
  try {
    const input = { hook_event_name: 'PreToolUse', tool_name: 'MultiEdit', cwd: root, tool_input: { file_path: path.join(root, 'a.ts'),
      edits: [{ old_string: 'PLACE', new_string: HALF_A }, { old_string: 'HOLDER', new_string: HALF_B }] } };
    assert.equal(hookDecision('claude', root, input), 'deny');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('3.49.12: ATTACK a key split across Antigravity ReplacementChunks (replace_file_content, multi_replace_file_content) is denied', () => {
  const root = projectWithFile('const a = "PLACEHOLDER";\n');
  try {
    for (const name of ['replace_file_content', 'multi_replace_file_content']) {
      const input = { toolCall: { name, args: { TargetFile: path.join(root, 'a.ts'),
        ReplacementChunks: [{ TargetContent: 'PLACE', ReplacementContent: HALF_A }, { TargetContent: 'HOLDER', ReplacementContent: HALF_B }] } }, workspacePaths: [root] };
      assert.equal(hookDecision('antigravity', root, input), 'deny', name);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('3.49.12: a key already in the file on disk is not denied for an unrelated edit elsewhere (only added secrets count)', () => {
  const root = projectWithFile(`const k = "${HALF_A}${HALF_B}";\nconst a = 1;\nconst b = 2;\n`);
  try {
    const file = path.join(root, 'a.ts');
    assert.equal(hookDecision('claude', root, { hook_event_name: 'PreToolUse', tool_name: 'Edit', cwd: root,
      tool_input: { file_path: file, old_string: 'const a = 1;', new_string: 'const a = 3;' } }), null, 'Edit');
    assert.equal(hookDecision('claude', root, { hook_event_name: 'PreToolUse', tool_name: 'MultiEdit', cwd: root,
      tool_input: { file_path: file, edits: [{ old_string: 'const a = 1;', new_string: 'const a = 3;' }, { old_string: 'const b = 2;', new_string: 'const b = 4;' }] } }), null, 'MultiEdit');
    assert.equal(hookDecision('antigravity', root, { toolCall: { name: 'multi_replace_file_content', args: { TargetFile: file,
      ReplacementChunks: [{ TargetContent: 'const a = 1;', ReplacementContent: 'const a = 3;' }] } }, workspacePaths: [root] }), null, 'Antigravity chunks');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('3.49.12: ATTACK an unknown Antigravity write tool (create_file) with a key in its arguments is denied', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-34912-'));
  try {
    const input = { toolCall: { name: 'create_file', args: { path: 'a.ts', content: `const k = "${FAKE.anthropic}";` } }, workspacePaths: [root] };
    assert.equal(hookDecision('antigravity', root, input), 'deny');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('3.49.12: ATTACK a Codex apply_patch whose patch text is in tool_input.input (no command) is scanned: a key in an added line is denied', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-34912-'));
  try {
    const input = { tool_name: 'apply_patch', turn_id: 't1', cwd: root,
      tool_input: { input: `*** Begin Patch\n*** Add File: a.ts\n+const k = "${FAKE.anthropic}";\n*** End Patch\n` } };
    assert.equal(hookDecision('codex', root, input), 'deny');
    const clean = { ...input, tool_input: { input: '*** Begin Patch\n*** Add File: a.ts\n+const k = process.env.K;\n*** End Patch\n' } };
    assert.equal(hookDecision('codex', root, clean), null, 'a clean patch passes');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('3.49.12b: ATTACK a key split across MultiEdit edits is denied for several key formats (Anthropic, AWS, GitHub, Stripe)', () => {
  const keys = { anthropic: FAKE.anthropic, aws: FAKE.aws, github: 'gh' + 'p_' + alnum(36), stripe: HALF_A + HALF_B };
  const missed = [];
  for (const [name, key] of Object.entries(keys)) {
    const cut = Math.floor(key.length / 2), a = key.slice(0, cut), b = key.slice(cut);
    assert.deepEqual([findSecrets(`"${a}HOLDER"`), findSecrets(`"PLACE${b}"`)], [[], []], `${name}: neither half alone is a secret`);
    const root = projectWithFile('const a = "PLACEHOLDER";\n');
    try {
      const d = hookDecision('claude', root, { hook_event_name: 'PreToolUse', tool_name: 'MultiEdit', cwd: root, tool_input: { file_path: path.join(root, 'a.ts'),
        edits: [{ old_string: 'PLACE', new_string: a }, { old_string: 'HOLDER', new_string: b }] } });
      if (d !== 'deny') missed.push(`${name} -> ${d}`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  assert.deepEqual(missed, []);
});

test('hook: also runs when the project is opened through a symlink or junction (macOS /tmp, linked folders)', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hooklink-'));
  try {
    const link = path.join(tmp, 'hooks');
    try { fs.symlinkSync(path.dirname(HOOK), link, 'junction'); } catch (e) { return t.skip(`no link: ${e.code}`); }
    const input = { tool_name: 'Write', tool_input: { file_path: 'a.ts', content: `x = "${FAKE.stripe}"` } };
    const r = spawnSync(process.execPath, [path.join(link, 'guard-secrets.mjs')], { input: JSON.stringify(input), encoding: 'utf8' });
    assert.ok(denied(r), 'a guard started by its linked path must not skip silently');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
