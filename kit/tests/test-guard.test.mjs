// Çalıştır: node --test "kit/tests/*.test.mjs"
// Test koruması (F-02): testi zayıflatan düzenleme kullanıcıya sorulur.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testDosyasi, zayiflatma } from '../../.claude/hooks/test-guard.mjs';
import { cozumle } from '../../.claude/hooks/arac.mjs';

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks', 'test-guard.mjs');
let p;
before(() => { p = fs.mkdtempSync(path.join(os.tmpdir(), 'test-guard-')); });
after(() => fs.rmSync(p, { recursive: true, force: true }));

const calistir = (girdi, env = { CLAUDE_PROJECT_DIR: p }) => {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(girdi), encoding: 'utf8', env: { ...process.env, ...env } });
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
};

test('F-02 test dosyası tanıma', () => {
  for (const f of ['src/a.test.ts', 'b.spec.tsx', 'tests/e2e/giris.ts', 'src/features/x/__tests__/y.ts', 'app/test_odeme.py', 'odeme_test.py', 'kit/tests/x.test.mjs'])
    assert.ok(testDosyasi(f), f);
  for (const f of ['src/test-utils.ts', 'src/latest.ts', 'docs/test-plan.md', 'contest.py'])
    assert.ok(!testDosyasi(f), f);
});

test('F-02 assert silmek, .skip/.only eklemek, beklentiyi gevşetmek yakalanır', () => {
  const eski = "test('Ö-01.1 toplam', () => {\n  expect(topla(1, 2)).toBe(3);\n  expect(topla(0, 0)).toBe(0);\n});\n";
  assert.match(zayiflatma(eski, eski.replace('  expect(topla(0, 0)).toBe(0);\n', '')), /beklenti/);
  assert.match(zayiflatma(eski, eski.replace("test('", "test.skip('")), /atlan/);
  assert.match(zayiflatma(eski, eski.replace("test('", "test .only ('")), /atlan/, 'boşluklu yazım');
  assert.match(zayiflatma(eski, eski.replace("test('", "it.skip.each([1])('")), /atlan/);
  assert.match(zayiflatma(eski, eski.replace('.toBe(3)', '.toBeTruthy()')), /gevşe/);
  assert.match(zayiflatma(eski, eski.replace('  expect(topla(0', '  // expect(topla(0')), /beklenti/, 'yoruma almak silmek sayılır');
  assert.match(zayiflatma(eski, eski.replace('  expect(topla(0, 0)).toBe(0);', '  /* expect(topla(0, 0)).toBe(0); */')), /beklenti/);
  assert.match(zayiflatma('def test_a():\n    assert a == 1\n    assert b == 2\n', 'def test_a():\n    assert a == 1\n    # assert b == 2\n'), /beklenti/);
  assert.match(zayiflatma('def test_a():\n    assert a\n', '@pytest.mark.skip\ndef test_a():\n    assert a\n'), /atlan/);
  assert.match(zayiflatma('', "test.only('x', () => {});"), /atlan/, 'yeni dosyada .only');
});

test('F-02 testi güçlendiren veya nötr düzenleme sessiz kalır', () => {
  const eski = "test('a', () => {\n  expect(x).toBeTruthy();\n});\n";
  assert.equal(zayiflatma(eski, eski.replace('.toBeTruthy()', '.toBe(3)')), null, 'sıkılaştırma');
  assert.equal(zayiflatma(eski, eski + "test('b', () => { expect(y).toBe(1); });\n"), null, 'test ekleme');
  assert.equal(zayiflatma(eski, eski.replace("'a'", "'a yeniden adlandı'")), null);
  assert.equal(zayiflatma('', "test('yeni', () => { expect(1).toBe(1); });"), null, 'yeni test dosyası');
  assert.equal(zayiflatma("const url = 'http://x';\nexpect(a).toBe(1);\n", "const url = 'http://y';\nexpect(a).toBe(1);\n"), null, 'URL yorum sayılmaz');
});

test('F-02 cozumle eski ve yeni metni verir (üç araç)', () => {
  const c = cozumle({ tool_name: 'Edit', tool_input: { file_path: '/p/a.test.ts', old_string: 'A', new_string: 'B' } }).dosyalar[0];
  assert.deepEqual([c.once, c.sonra], ['A', 'B']);
  const m = cozumle({ tool_name: 'MultiEdit', tool_input: { file_path: '/p/a.test.ts', edits: [{ old_string: 'A', new_string: 'B' }, { old_string: 'C', new_string: 'D' }] } }).dosyalar[0];
  assert.deepEqual([m.once, m.sonra], ['A\nC', 'B\nD']);
  const w = cozumle({ tool_name: 'Write', tool_input: { file_path: '/p/a.test.ts', content: 'X' } }).dosyalar[0];
  assert.deepEqual([w.once, w.sonra], [undefined, 'X'], 'Write: eski metin diskten okunur');
  const x = cozumle({ tool_name: 'apply_patch', turn_id: 't', tool_input: { command: '*** Begin Patch\n*** Update File: a.test.ts\n@@\n-  expect(a).toBe(1);\n+  // yok\n*** Delete File: b.test.ts\n*** End Patch' } }).dosyalar;
  assert.deepEqual([x[0].once, x[0].sonra], ['  expect(a).toBe(1);\n', '  // yok\n']);
  assert.equal(x[1].sil, true);
  const ag = cozumle({ toolCall: { name: 'replace_file_content', args: { TargetFile: '/p/a.test.ts', TargetContent: 'A', ReplacementContent: 'B' } }, workspacePaths: ['/p'] }).dosyalar[0];
  assert.deepEqual([ag.once, ag.sonra], ['A', 'B']);
  const agm = cozumle({ toolCall: { name: 'multi_replace_file_content', args: { TargetFile: '/p/a.test.ts', ReplacementChunks: [{ TargetContent: 'A', ReplacementContent: 'B' }] } }, workspacePaths: ['/p'] }).dosyalar[0];
  assert.deepEqual([agm.once, agm.sonra], ['A', 'B']);
});

test('F-02 hook: Claude sorar, Codex engelleyip sordurur, test dışı dosya serbest', () => {
  const dosya = path.join(p, 'a.test.ts');
  fs.writeFileSync(dosya, "test('a', () => {\n  expect(1).toBe(1);\n  expect(2).toBe(2);\n});\n");
  const ezme = { tool_name: 'Write', cwd: p, tool_input: { file_path: dosya, content: "test('a', () => {\n  expect(1).toBe(1);\n});\n" } };
  assert.equal(calistir(ezme).hookSpecificOutput.permissionDecision, 'ask', 'Write diskteki dosyayla karşılaştırılır');
  const kod = { tool_name: 'Edit', cwd: p, tool_input: { file_path: path.join(p, 'src/a.ts'), old_string: 'expect(1)', new_string: '' } };
  assert.equal(calistir(kod), null);
  const codex = { tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: '*** Begin Patch\n*** Update File: a.test.ts\n@@\n-  expect(2).toBe(2);\n*** End Patch' } };
  assert.equal(calistir(codex, { CLAUDE_PROJECT_DIR: '' }).hookSpecificOutput.permissionDecision, 'deny');
  const sil = { tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: '*** Begin Patch\n*** Delete File: a.test.ts\n*** End Patch' } };
  assert.match(calistir(sil, { CLAUDE_PROJECT_DIR: '' }).hookSpecificOutput.permissionDecisionReason, /siliniyor/);
  const ag = { toolCall: { name: 'replace_file_content', args: { TargetFile: dosya, TargetContent: "test('a'", ReplacementContent: "test.only('a'" } }, workspacePaths: [p] };
  assert.equal(calistir(ag, { CLAUDE_PROJECT_DIR: '' }).decision, 'ask');
});

test('F-02 hook: Codex Add File var olan testi ezerse ve test, test olmayan yola taşınırsa sorar', () => {
  const dosya = path.join(p, 'b.test.ts');
  fs.writeFileSync(dosya, "test('b', () => {\n  expect(1).toBe(1);\n});\n");
  const yama = (govde) => ({ tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: `*** Begin Patch\n${govde}\n*** End Patch` } });
  const codex = { CLAUDE_PROJECT_DIR: '' };
  assert.match(calistir(yama("*** Add File: b.test.ts\n+test('b', () => {});"), codex).hookSpecificOutput.permissionDecisionReason, /beklenti/, 'Add File diskteki halle karşılaştırılır');
  assert.equal(calistir(yama("*** Add File: c.test.ts\n+test('c', () => { expect(1).toBe(1); });"), codex), null, 'yeni test dosyası serbest');
  assert.match(calistir(yama('*** Update File: b.test.ts\n*** Move to: src/b.ts'), codex).hookSpecificOutput.permissionDecisionReason, /taşınıyor/);
  assert.equal(calistir(yama('*** Update File: b.test.ts\n*** Move to: tests/b.test.ts'), codex), null, 'testten teste taşıma serbest');
});
