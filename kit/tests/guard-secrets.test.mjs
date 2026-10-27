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
  assert.equal(spawnSync(process.execPath, [HOOK], { input: 'bozuk', encoding: 'utf8' }).status, 0);
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
