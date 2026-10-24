// Çalıştır: node --test "kit/tests/*.test.mjs"
// Kapsam kalkanı (F-06): onaylı plan aktifken listede olmayan mevcut dosyaya yazım sorulur; plansız iş sessiz.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { izinKarsiligi } from '../../.claude/hooks/destructive-guard.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');
let p, HOOK;
const yaz = (f, s = 'x') => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
const cli = (...a) => spawnSync(process.execPath, [HOOK, ...a], { cwd: p, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
const kanca = (girdi, env = { CLAUDE_PROJECT_DIR: p }) => {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(girdi), cwd: p, encoding: 'utf8', env: { ...process.env, ...env } });
  if (!r.stdout.trim()) return null;
  const o = JSON.parse(r.stdout);
  return { karar: o.decision ?? o.hookSpecificOutput.permissionDecision, neden: o.reason ?? o.hookSpecificOutput.permissionDecisionReason };
};
const duzenle = (dosya) => kanca({ tool_name: 'Edit', cwd: p, tool_input: { file_path: path.isAbsolute(dosya) ? dosya : path.join(p, dosya), old_string: 'x', new_string: 'y' } });

before(() => {
  p = fs.mkdtempSync(path.join(os.tmpdir(), 'kapsam-'));
  // Codex'te proje kökü betiğin yerinden çıkar: hook'lar geçici projeye kopyalanır
  fs.cpSync(HOOKS, path.join(p, '.claude', 'hooks'), { recursive: true });
  HOOK = path.join(p, '.claude', 'hooks', 'freeze-guard.mjs');
  for (const f of ['src/a.ts', 'src/b.ts', 'src/lib/c.ts', 'src/ödeme dosyası.ts', 'docs/not.md', 'CHANGELOG.md']) yaz(f);
});
after(() => fs.rmSync(p, { recursive: true, force: true }));

test('F-06 plan yokken sessiz; plan kaydedilince liste dışı mevcut dosya sorulur', () => {
  assert.equal(duzenle('src/b.ts'), null, 'plansız iş');
  const r = cli('--plan-kaydet', 'G-1', 'src/a.ts', 'src/lib/', 'src/ödeme dosyası.ts');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(duzenle('src/a.ts'), null);
  assert.equal(duzenle('src/lib/c.ts'), null, 'klasör öneki');
  assert.equal(duzenle('src/ödeme dosyası.ts'), null, 'Türkçe ve boşluklu yol');
  const dis = duzenle('src/b.ts');
  assert.equal(dis.karar, 'ask');
  assert.match(dis.neden, /Kapsam kalkanı.*src\/b\.ts.*G-1/);
  assert.equal(duzenle(path.join(p, 'src/b.ts')).karar, 'ask', 'mutlak yol');
  assert.equal(duzenle('src/lib/../b.ts').karar, 'ask', '.. ile');
  assert.equal(duzenle('src/yeni.ts'), null, 'yeni dosya: yapı koruyucu bakar');
  assert.equal(duzenle('docs/not.md'), null, 'docs serbest');
  assert.equal(duzenle('CHANGELOG.md'), null);
  assert.match(cli('--status').stdout, /G-1.*3 yol/);
});

test('F-06 aktif plan sorusuz genişlemez; ekle ve bitir çalışır; kalkan eklemeyi sorar', () => {
  const tekrar = cli('--plan-kaydet', 'G-2', 'src/b.ts');
  assert.equal(tekrar.status, 1);
  assert.match(tekrar.stderr, /aktif/);
  assert.equal(duzenle('src/b.ts').karar, 'ask', 'liste değişmedi');
  assert.equal(izinKarsiligi('node .claude/hooks/freeze-guard.mjs --plan-ekle src/b.ts')?.karar, 'ask', 'Codex/Antigravity karşılığı');
  assert.equal(izinKarsiligi('node .claude/hooks/freeze-guard.mjs --plan-bitir'), null);
  assert.equal(cli('--plan-ekle', 'src/b.ts').status, 0);
  assert.equal(duzenle('src/b.ts'), null);
  assert.equal(cli('--plan-ekle', '../dis.ts').status, 1, 'proje dışı yol eklenmez');
  assert.equal(cli('--plan-bitir').status, 0);
  assert.equal(duzenle('src/lib/c.ts'), null);
  assert.equal(cli('--plan-ekle', 'src/b.ts').status, 1, 'plan yokken eklenmez');
});

test('F-06 Codex ve Antigravity; kilit önce gelir; bozuk plan dosyası çökertmez', () => {
  cli('--plan-kaydet', 'G-3', 'src/a.ts');
  const codex = kanca({ tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: '*** Begin Patch\n*** Update File: src/b.ts\n@@\n-x\n+y\n*** End Patch' } }, { CLAUDE_PROJECT_DIR: '' });
  assert.equal(codex?.karar, 'deny', 'Codex: ask engellenip sorulur');
  const sil = kanca({ tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: '*** Begin Patch\n*** Delete File: src/b.ts\n*** End Patch' } }, { CLAUDE_PROJECT_DIR: '' });
  assert.equal(sil?.karar, 'deny');
  const ag = kanca({ toolCall: { name: 'replace_file_content', args: { TargetFile: path.join(p, 'src/b.ts'), TargetContent: 'x', ReplacementContent: 'y' } }, workspacePaths: [p] }, { CLAUDE_PROJECT_DIR: '' });
  assert.equal(ag?.karar, 'ask');
  cli('--set', 'src/lib');
  assert.equal(duzenle('src/a.ts').karar, 'deny', 'planda olsa da kilit dışı');
  fs.rmSync(path.join(p, '.claude/state/freeze.json'));
  fs.writeFileSync(path.join(p, '.claude/state/plan.json'), '{bozuk');
  assert.equal(duzenle('src/b.ts'), null);
  cli('--plan-bitir');
});

test('F-06 denetim: tırnaklı mod da sorulur; alt klasörden çağrılınca plan proje köküne yazılır', () => {
  for (const k of ["node .claude/hooks/freeze-guard.mjs '--plan-ekle' x", 'node ".claude/hooks/freeze-guard.mjs" "--plan-ekle" x', "node .claude/hooks/freeze-guard.mjs '--off'"])
    assert.equal(izinKarsiligi(k)?.karar, 'ask', k);
  fs.mkdirSync(path.join(p, 'src', 'alt'), { recursive: true });
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  const r = spawnSync(process.execPath, [HOOK, '--plan-kaydet', 'G-9', 'src/b.ts'], { cwd: path.join(p, 'src', 'alt'), encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(p, '.claude/state/plan.json')), 'kökte');
  assert.ok(!fs.existsSync(path.join(p, 'src/alt/.claude')), 'alt klasörde değil');
  assert.equal(duzenle('src/b.ts'), null, 'plan yolları proje köküne göre');
  cli('--plan-bitir');
});
