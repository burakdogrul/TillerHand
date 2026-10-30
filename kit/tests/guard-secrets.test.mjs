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
