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
import { onayYolu } from '../../.claude/hooks/gate.mjs';

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
after(() => { fs.rmSync(onayYolu(p), { force: true }); fs.rmSync(p, { recursive: true, force: true }); });

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

// 3.14.1: kabuk komutu (sed -i, mv, >, Set-Content…) plan veya kilit dışındaki mevcut dosyayı değiştiriyorsa sorulur
const kabuk = (komut, dizin = p) => {
  const r = spawnSync(process.execPath, [path.join(p, '.claude', 'hooks', 'destructive-guard.mjs')], { input: JSON.stringify({ tool_name: 'Bash', cwd: dizin, tool_input: { command: komut } }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
};

test('3.14.1 kabuk: plan aktifken liste dışı mevcut dosyaya kabukla yazım sorulur', () => {
  assert.equal(kabuk('sed -i s/x/y/ src/b.ts'), null, 'plan yokken sessiz');
  cli('--plan-kaydet', 'G-4', 'src/a.ts');
  for (const k of ['sed -i s/x/y/ src/b.ts', 'echo y > src/b.ts', 'echo y >> src/b.ts', 'mv src/b.ts src/b2.ts', 'git checkout -- src/b.ts',
    'sed -i s/x/y/ "src/ödeme dosyası.ts"', 'cd src && sed -i s/x/y/ b.ts', 'Set-Content -Path src/b.ts -Value y']) {
    const r = kabuk(k);
    assert.equal(r?.permissionDecision, 'ask', k);
    assert.match(r.permissionDecisionReason, /Kapsam kalkanı/, k);
  }
  assert.equal(kabuk('sed -i s/x/y/ b.ts', path.join(p, 'src'))?.permissionDecision, 'ask', 'oturumun cwd\'sine göre');
  for (const k of ['sed -i s/x/y/ src/a.ts', 'cat src/b.ts', 'grep x src/b.ts > /dev/null', 'echo y > src/yeni.ts', 'echo y > docs/not.md', 'node --test 2>&1'])
    assert.equal(kabuk(k), null, k);
  cli('--plan-bitir');
});

test('3.14.1 kabuk: kilit dışına kabukla yazım sorulur', () => {
  cli('--set', 'src/lib');
  const r = kabuk('rm src/a.ts');
  assert.equal(r?.permissionDecision, 'ask');
  assert.match(r.permissionDecisionReason, /kilit/i);
  assert.equal(kabuk('sed -i s/x/y/ src/lib/c.ts'), null);
  fs.rmSync(path.join(p, '.claude/state/freeze.json'));
});

test('3.14.1 sembolik bağ/junction: plan veya kilit içinden dışarıdaki dosyaya yazılamaz', () => {
  const bag = path.join(p, 'src', 'lib', 'kok');
  fs.symlinkSync(p, bag, 'junction');
  try {
    cli('--plan-kaydet', 'G-5', 'src/lib/');
    assert.equal(duzenle('src/lib/kok/src/b.ts')?.karar, 'ask', 'gerçek yol src/b.ts');
    cli('--plan-bitir');
    cli('--set', 'src/lib');
    assert.equal(duzenle('src/lib/kok/src/b.ts')?.karar, 'deny');
    fs.rmSync(path.join(p, '.claude/state/freeze.json'));
    const codex = kanca({ tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: '*** Begin Patch\n*** Update File: src/lib/kok/AGENTS.md\n@@\n-x\n+y\n*** End Patch' } }, { CLAUDE_PROJECT_DIR: '' });
    assert.equal(codex?.karar, 'deny');
    assert.match(codex.neden, /AGENTS\.md:/, 'korumalı dosya bağ üzerinden de korunur');
  } finally {
    try { fs.unlinkSync(bag); } catch { fs.rmdirSync(bag); }
  }
});

test('3.14.1 denetim: MSYS yolu, glob, değişken, kök hedefi, alt kabuk ve geniş yazan listesi sorulur', () => {
  cli('--plan-kaydet', 'G-7', 'src/a.ts');
  const sor = [
    'sed -i s/x/y/ src/*.ts', 'rm -r src/*', 'mv * ../', 'sed -i s/x/y/ $PWD/src/b.ts', 'sed -i s/x/y/ `pwd`/src/b.ts',
    'git checkout .', 'git restore .', 'git checkout -- .', 'echo x >| src/b.ts', 'ln -sf x src/b.ts', 'curl -o src/b.ts http://x',
    'dd if=/dev/zero of=src/b.ts', 'git apply x.patch', 'git stash', 'patch -p1 < x.patch', '(cd src && sed -i s/x/y/ b.ts)',
    'pushd src && sed -i s/x/y/ b.ts', 'npx prettier --write src/b.ts', 'npx eslint --fix src/b.ts',
  ];
  if (process.platform === 'win32') sor.push(`sed -i s/x/y/ /${p[0].toLowerCase()}${p.slice(2).replace(/\\/g, '/')}/src/b.ts`);
  for (const k of sor) assert.equal(kabuk(k)?.permissionDecision, 'ask', k);
  for (const k of ['grep -rn tee src', "sed -i 's/a*/b/' src/a.ts", "sed -i 's/$/x/' src/a.ts", 'git status', 'npx prettier --check src/b.ts'])
    assert.equal(kabuk(k), null, k);
  cli('--plan-bitir');
});

test('3.14.1 denetim: kit koruma durum dosyaları kabukla değiştirilemez (kilit ve plan Bash ile kapanmasın)', () => {
  for (const k of ['rm .claude/state/plan.json', 'echo {} > .claude/state/freeze.json', 'echo {} > .claude/state/gate.json', 'rm -f .claude/state/commit-approval.json'])
    assert.equal(kabuk(k)?.permissionDecision, 'ask', k);
  const codex = kanca({ tool_name: 'apply_patch', turn_id: 't', cwd: p, tool_input: { command: '*** Begin Patch\n*** Update File: .git\n@@\n-x\n+y\n*** End Patch' } }, { CLAUDE_PROJECT_DIR: '' });
  assert.equal(codex?.karar, 'deny', 'worktree .git işaretçi dosyası korunur');
});

test('3.14.1 yeniden denetim: cd çözümü, kabuk sarmalayıcıları, birleşik bayraklar, koruma klasörleri', () => {
  cli('--set', 'src/lib');
  const msys = `/${p[0].toLowerCase()}${p.slice(2).replace(/\\/g, '/')}`;
  const sor = [
    'cd $PWD/src && rm a.ts', 'cd "$(pwd)/src" && rm a.ts', '(cd src/lib); rm CHANGELOG.md', 'cd olmayan || rm CHANGELOG.md',
    'cd', 'Set-Location src; rm a.ts', 'rm {src/a.ts,x}', 'rm src/{a,b}.ts', "rm sr'c'/a.ts", '\\rm src/a.ts', `rm ~/${path.relative(os.homedir(), p).split(path.sep).join('/')}/src/a.ts`,
    'bash -c "rm src/a.ts"', "sh -c 'sed -i s/x/y/ src/a.ts'", 'find src -delete', 'find src -name x -exec rm {} ;', 'ls | xargs rm',
    'git checkout main', 'git switch main', 'curl -sSLo src/a.ts http://x', 'curl -osrc/a.ts http://x', 'wget -qO src/a.ts http://x',
    'tar -xf x.tar', 'unzip x.zip', 'rsync -a x/ src/',
  ];
  if (process.platform === 'win32') sor.push(`cd ${msys}/src && rm a.ts`);
  for (const k of sor) assert.equal(kabuk(k)?.permissionDecision, 'ask', k);
  for (const k of ['cd src/lib && sed -i s/x/y/ c.ts', 'pushd src/lib && sed -i s/x/y/ c.ts && popd', 'git checkout -- src/lib/c.ts', 'git status'])
    assert.equal(kabuk(k), null, k);
  fs.rmSync(path.join(p, '.claude/state/freeze.json'));
  cli('--plan-kaydet', 'G-8', 'src/a.ts');
  for (const k of ['rm -r .claude/state', 'rm .claude/state/*', 'cp x .claude/state/', 'tar -C .claude/state -xf x.tar', 'echo x > .git/hooks/pre-commit', 'sed -i s/a/b/ AGENTS.md', 'echo x > .claude/settings.json'])
    assert.equal(kabuk(k)?.permissionDecision, 'ask', k);
  cli('--plan-bitir');
  assert.equal(kabuk('echo x > .git/hooks/pre-commit')?.permissionDecision, 'ask', 'plan olmadan da');
  assert.equal(kabuk('echo SIR=1 > .env')?.permissionDecision, 'deny', '.env kabukla da yazılmaz');
});

test('3.14.3 çözülemeyen hedef kural dosyası adını içeriyorsa kilit/plan olmadan da sorulur; yerel UNC çevrilir', () => {
  yaz('AGENTS.md', '# x');
  const sor = ['echo x > $D/AGENTS.md', 'sed -i s/a/b/ {AGENTS,X}.md', 'cp x `pwd`/.claude/settings.json',
    `echo x > \\\\?\\${p}\\AGENTS.md`];
  if (process.platform === 'win32') sor.push(`echo x > \\\\localhost\\${p[0]}$\\${p.slice(3)}\\AGENTS.md`);
  for (const k of sor) assert.equal(kabuk(k)?.permissionDecision, 'ask', k);
  for (const k of ['echo x > $OUT', 'echo $HOME > out.txt']) assert.equal(kabuk(k), null, k);
  assert.equal(kabuk('echo {} > ~/.vibe-kit/kapi-onayi/x.json')?.permissionDecision, 'ask', 'kullanıcı klasöründeki onay kaydı');
  assert.equal(duzenle(`${onayYolu(p)}`)?.karar, 'ask', 'dosya aracıyla da');
});

test('3.14.1 NotebookEdit kalkana takılır', () => {
  yaz('src/n.ipynb', '{}');
  cli('--plan-kaydet', 'G-6', 'src/a.ts');
  const r = kanca({ tool_name: 'NotebookEdit', cwd: p, tool_input: { notebook_path: path.join(p, 'src/n.ipynb'), new_source: 'x' } });
  assert.equal(r?.karar, 'ask');
  cli('--plan-bitir');
});
