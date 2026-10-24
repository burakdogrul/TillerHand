// Çalıştır: node --test "kit/tests/*.test.mjs"
// Düzenleme turu sayacı (F-05): aynı kod dosyası bir oturumda 5., 10. ... kez düzenlenince güvenlik kontrolü hatırlatılır.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { kodDosyasi } from '../../.claude/hooks/edit-rounds.mjs';

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks', 'edit-rounds.mjs');
let p;
before(() => { p = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-rounds-')); });
after(() => fs.rmSync(p, { recursive: true, force: true }));

const calistir = (girdi, arg = []) => {
  const r = spawnSync(process.execPath, [HOOK, ...arg], { input: JSON.stringify(girdi), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
};
const duzenle = (dosya, oturum = 's1') => calistir({ tool_name: 'Edit', session_id: oturum, cwd: p, tool_input: { file_path: path.join(p, dosya), old_string: 'a', new_string: 'b' } });

test('F-05 kod dosyası tanıma', () => {
  for (const f of ['src/a.ts', 'app/page.tsx', 'api/odeme.py', 'x.mjs', 'supabase/migrations/1.sql']) assert.ok(kodDosyasi(f), f);
  for (const f of ['docs/workflow/progress.md', 'package.json', 'README.md', '.env.example']) assert.ok(!kodDosyasi(f), f);
});

test('F-05 Ö: 5. düzenlemede not düşer, arada sessiz, 10.da yine', () => {
  for (let i = 1; i <= 4; i++) assert.equal(duzenle('src/a.ts'), null, `${i}. düzenleme`);
  const n = duzenle('src/a.ts').hookSpecificOutput;
  assert.equal(n.hookEventName, 'PostToolUse');
  assert.match(n.additionalContext, /src\/a\.ts.*5\. kez/);
  assert.match(n.additionalContext, /semgrep/i);
  for (let i = 6; i <= 9; i++) assert.equal(duzenle('src/a.ts'), null);
  assert.match(duzenle('src/a.ts').hookSpecificOutput.additionalContext, /10\. kez/);
});

test('F-05 oturum değişince sayaç sıfırlanır; dosyalar ayrı sayılır; doküman sayılmaz', () => {
  for (let i = 1; i <= 4; i++) duzenle('src/b.ts', 's2');
  assert.equal(duzenle('src/c.ts', 's2'), null, 'başka dosya');
  assert.equal(duzenle('src/b.ts', 's3'), null, 'yeni oturum: 1. düzenleme');
  for (let i = 1; i <= 6; i++) assert.equal(duzenle('docs/not.md', 's3'), null);
});

test('F-05 Antigravity: not PreInvocation\'da bir kez verilir', () => {
  const ag = { toolCall: { name: 'replace_file_content', args: { TargetFile: path.join(p, 'src/d.ts'), TargetContent: 'a', ReplacementContent: 'b' } }, workspacePaths: [p], conversationId: 'c1' };
  for (let i = 1; i <= 5; i++) assert.deepEqual(calistir(ag), {}, 'PostToolUse çıktısı boş nesne');
  const not = calistir({ invocationNum: 3, conversationId: 'c1', workspacePaths: [p] }, ['--inject']);
  assert.match(not.injectSteps[0].systemMessage.systemMessage, /src\/d\.ts.*5\. kez/);
  assert.equal(calistir({ invocationNum: 4, conversationId: 'c1', workspacePaths: [p] }, ['--inject']), null, 'not bir kez');
});
