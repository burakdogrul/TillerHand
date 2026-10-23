// Çalıştır: node --test "kit/tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bul } from '../../.claude/hooks/guard-secrets.mjs';

const HOOK = fileURLToPath(new URL('../../.claude/hooks/guard-secrets.mjs', import.meta.url));
// Test değerleri parçalanarak yazıldı; bu dosyanın kendisi sır taramasına takılmasın
const SAHTE = {
  anthropic: 'sk-' + 'ant-api03-' + 'a'.repeat(40),
  stripe: 'sk_' + 'live_' + 'b'.repeat(24),
  aws: 'AKIA' + 'ABCDEFGHIJKLMNOP',
  pem: '-----BEGIN ' + 'PRIVATE KEY-----',
};

test('gerçek anahtar kalıplarını yakalar', () => {
  for (const [ad, deger] of Object.entries(SAHTE)) assert.ok(bul(`const k = "${deger}"`).length, ad);
});

test('normal kodda alarm vermez', () => {
  const temiz = [
    'const key = process.env.ANTHROPIC_API_KEY',
    'STRIPE_SECRET_KEY=',
    'password: "testpassword123"',
    'const task = "sk-short"',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY=',
  ];
  for (const s of temiz) assert.deepEqual(bul(s), [], s);
});

const calistir = (girdi) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(girdi), encoding: 'utf8' });

const engellendi = (r) => JSON.parse(r.stdout || '{}').hookSpecificOutput?.permissionDecision === 'deny';

test('hook: Write içinde sır varsa engeller (deny)', () => {
  const r = calistir({ tool_name: 'Write', tool_input: { file_path: 'a.ts', content: `x = "${SAHTE.stripe}"` } });
  assert.equal(r.status, 0);
  assert.ok(engellendi(r));
  assert.match(r.stdout, /ENGELLENDİ/);
});

test('hook: Edit ve MultiEdit kontrol edilir', () => {
  assert.ok(engellendi(calistir({ tool_input: { file_path: 'a', new_string: SAHTE.aws } })));
  assert.ok(engellendi(calistir({ tool_input: { file_path: 'a', edits: [{ new_string: 'ok' }, { new_string: SAHTE.pem }] } })));
});

test('hook: temiz içerik ve bozuk girdi geçer', () => {
  const temiz = calistir({ tool_input: { file_path: 'a', content: 'hello' } });
  assert.equal(temiz.status, 0);
  assert.equal(temiz.stdout, '');
  assert.equal(spawnSync(process.execPath, [HOOK], { input: 'bozuk', encoding: 'utf8' }).status, 0);
});
