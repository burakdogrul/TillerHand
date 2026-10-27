// Run: node --test "kit/tests/*.test.mjs"
// Deploy setup (F-20): /release first walks the user through hosting, DNS, env, backups and rollback per provider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findSecrets } from '../../.claude/hooks/guard-secrets.mjs';
import { evaluate } from '../../.claude/hooks/destructive-guard.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const setup = read('docs/operations/deploy-setup.md');
const release = read('.claude/commands/release.md');
const sections = Object.fromEntries(setup.split(/^## /m).slice(1).map((s) => [s.split('\n')[0].trim(), s]));

test('Ö-20.1 the wizard writes no secret: rules say so, the docs hold none, the guard blocks a key in accounts.md', () => {
  assert.match(sections.Kurallar, /Sır değeri sohbete ve dosyaya yazılmaz/);
  assert.match(sections.Kurallar, /prod sırrı istemez ve `\.env`'e prod değeri yazmaz/);
  // The prod database password stays in the user's terminal: the guide never puts a literal connection string in a command
  assert.match(sections['Supabase (veritabanı + kimlik)'], /kullanıcı kendi terminalinde/);
  assert.doesNotMatch(setup, /postgres(ql)?:\/\/[^\s"`]*:[^\s"`]*@/);
  assert.match(release, /do not ask for a secret value, do not write it in chat or in a file/);
  assert.deepEqual(findSecrets(setup), []);
  const hook = path.join(REPO, '.claude/hooks/guard-secrets.mjs');
  const input = { tool_name: 'Edit', tool_input: { file_path: 'docs/operations/accounts.md', new_string: `| Supabase | ${'sb_' + 'secret_' + 'e4'.repeat(16)} |` } };
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(JSON.parse(r.stdout || '{}').hookSpecificOutput?.permissionDecision, 'deny');
});

test('Ö-20.2 every provider has sourced, dated steps for project, env, domain, backup and rollback', () => {
  const official = { 'Vercel (web)': 'vercel.com', 'Supabase (veritabanı + kimlik)': 'supabase.com', 'Railway (backend)': 'docs.railway.com', 'EAS (mobil)': 'docs.expo.dev' };
  for (const [name, domain] of Object.entries(official)) {
    const s = sections[name];
    assert.ok(s, `${name}: section exists`);
    const checked = s.match(/^Kontrol: (\d{4}-\d{2}-\d{2})\./m);
    assert.ok(checked, `${name}: check date`);
    assert.ok(s.includes(`](https://${domain}/`), `${name}: official source`);
    for (const part of ['**Proje', name.startsWith('Supabase') ? '**Anahtarlar.**' : '**Ortam değişkenleri.**', '**Yedek.**', '**Geri alma.**']) assert.ok(s.includes(part), `${name}: ${part}`);
    // A source dated over a year before the check is flagged
    for (const [, date, rest] of s.matchAll(/\((\d{4}-\d{2}-\d{2})\)( ⚠️)?/g)) {
      const old = Date.parse(checked[1]) - Date.parse(date) > 365 * 864e5;
      assert.equal(Boolean(rest), old, `${name}: ${date} flag`);
    }
  }
  for (const name of ['Vercel (web)', 'Railway (backend)']) assert.ok(sections[name].includes('**Alan adı.**'), `${name}: domain`);
  assert.match(release, /docs\/operations\/deploy-setup\.md/);
  assert.match(release, /Reopen the section's source pages with `source-research`/);
});

test('Ö-20.3 prod deploy, rollback drill and restore always need approval', () => {
  // Every prod-changing CLI command the guide names is asked by the shield, not only by the text
  const prodCommands = ['vercel promote https://a.vercel.app', 'vercel --prod', 'vercel rollback', 'eas update --environment production --message x', 'eas update:rollback', 'eas submit --platform ios', 'railway up'];
  for (const c of prodCommands) assert.equal(evaluate(c)?.decision, 'ask', c);
  assert.match(release, /Do not start a prod deploy without approval/);
  assert.match(release, /The rollback drill and restore from backup touch prod: do not start them without approval/);
  assert.match(sections.Kurallar, /Prod deploy, geri alma provası ve yedekten geri yükleme onaysız başlamaz/);
});
