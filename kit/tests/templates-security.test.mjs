// Çalıştır: node --test "kit/tests/*.test.mjs"
// 3.13 şablonları: RLS saldırgan testi (F-01), dev/prod ayrımı (F-04), karmaşıklık bütçesi ve refactor turu (F-07).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const oku = (f) => fs.readFileSync(path.join(KOK, f), 'utf8');
const RLS = 'tests/security/rls.mjs';
const rlsCalistir = (env) => spawnSync(process.execPath, ['--test', path.join(KOK, 'kit/templates/web-saas', RLS)], {
  encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
});

test('F-01 RLS testi web ve mobil şablonda aynı, CI\'da zorunlu iş', () => {
  assert.equal(oku(`kit/templates/mobile/${RLS}`), oku(`kit/templates/web-saas/${RLS}`));
  for (const t of ['web-saas', 'mobile']) {
    const ci = oku(`kit/templates/${t}/.github/workflows/ci.yml`);
    assert.match(ci, /^ {2}rls:/m, t);
    assert.ok(ci.includes(`node --test ${RLS}`) && ci.includes('supabase@2.120.0 start'), t);
  }
  assert.match(oku('.claude/commands/release.md'), /RLS saldırgan testi \(engelleyici\)/);
});

test('F-01 RLS testi yerel olmayan Supabase\'e karşı çalışmayı reddeder', () => {
  const uzak = rlsCalistir({ API_URL: 'https://abcd.supabase.co', ANON_KEY: 'a', SERVICE_ROLE_KEY: 's' });
  assert.notEqual(uzak.status, 0);
  assert.match(uzak.stdout + uzak.stderr, /abcd\.supabase\.co yerel değil/);
  const uzakDb = rlsCalistir({ API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'a', SERVICE_ROLE_KEY: 's', DB_URL: 'postgresql://u:p@db.prod.com:5432/x' });
  assert.match(uzakDb.stdout + uzakDb.stderr, /yerel değil/);
  assert.match(rlsCalistir({}).stdout + rlsCalistir({}).stderr, /API_URL, ANON_KEY ve SERVICE_ROLE_KEY yok/);
});

test('F-04 şablonlarda prod kimliği yok: MCP dev projesine, .env.example dev/prod notu', () => {
  for (const t of ['web-saas', 'mobile']) {
    const mcp = oku(`kit/templates/${t}/.mcp.json`);
    assert.ok(mcp.includes('project_ref=DEV_REF&read_only=true') && !mcp.includes('PROJE_REF'), t);
  }
  for (const t of ['web-saas', 'mobile', 'backend']) assert.match(oku(`kit/templates/${t}/.env.example`), /GELİŞTİRME \(dev\)/, t);
  assert.match(oku('docs/operations/accounts.md'), /## Ortamlar \(dev \/ prod\)/);
  assert.match(oku('.claude/commands/release.md'), /Dev\/prod ayrımı \(engelleyici\)/);
});

test('F-07 karmaşıklık bütçesi üç şablonun CI\'ında, refactor turu yol haritasında', () => {
  for (const t of ['web-saas', 'mobile', 'backend']) assert.ok(oku(`kit/templates/${t}/.github/workflows/ci.yml`).includes('node .claude/hooks/budget.mjs --check --base "$BASE"'), t);
  assert.equal((oku('docs/product/roadmap.md').match(/Refactor turu/g) ?? []).length, 2);
  assert.match(oku('.claude/commands/start.md'), /Refactor turu/);
});
