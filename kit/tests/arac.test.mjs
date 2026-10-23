// Çalıştır: node --test "kit/tests/*.test.mjs"
// Hook girdi/çıktı katmanı: aynı korumalar Claude Code, Codex ve Antigravity biçimlerinde çalışır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cozumle, kararMetni, yamaDosyalari } from '../../.claude/hooks/arac.mjs';
import { komuttanSkill } from '../kit.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(REPO, '.claude', 'hooks');
const SIR = 'sk_' + 'live_' + 'b'.repeat(24); // parçalı: bu dosya sır taramasına takılmasın

// Üç aracın aynı işlem için gönderdiği girdi (kok: proje klasörü)
const yazma = (arac, kok, dosya, metin) => ({
  claude: { tool_name: 'Write', cwd: kok, tool_input: { file_path: path.join(kok, dosya), content: metin } },
  codex: { tool_name: 'apply_patch', turn_id: 't1', cwd: kok, tool_input: { command: `*** Begin Patch\n*** Add File: ${dosya}\n+${metin}\n*** End Patch\n` } },
  antigravity: { toolCall: { name: 'write_to_file', args: { TargetFile: path.join(kok, dosya), CodeContent: metin } }, workspacePaths: [kok] },
})[arac];
const komut = (arac, kok, k) => ({
  claude: { tool_name: 'Bash', cwd: kok, tool_input: { command: k } },
  codex: { tool_name: 'Bash', turn_id: 't1', cwd: kok, tool_input: { command: k } },
  antigravity: { toolCall: { name: 'run_command', args: { CommandLine: k, Cwd: kok } }, workspacePaths: [kok] },
})[arac];

// Codex ve Antigravity CLAUDE_PROJECT_DIR vermez: kök girdiden (cwd / workspacePaths) bulunmalı
const ortam = (arac, kok) => {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  if (arac === 'claude') env.CLAUDE_PROJECT_DIR = kok;
  return env;
};
// Hook'lar kurulumdaki gibi projenin içinden çalışır: kök betiğin yerinden bulunur
const calistir = (betik, arac, kok, girdi) => {
  const r = spawnSync(process.execPath, [path.join(kok, '.claude', 'hooks', betik)], { input: JSON.stringify(girdi), encoding: 'utf8', env: ortam(arac, kok), cwd: os.tmpdir() });
  assert.equal(r.status, 0, r.stderr);
  if (!r.stdout.trim()) return null;
  const j = JSON.parse(r.stdout);
  return arac === 'antigravity' ? j.decision : j.hookSpecificOutput.permissionDecision;
};
const ARACLAR = ['claude', 'codex', 'antigravity'];
// Geçici proje: kitin hook betikleri içine kopyalanır
const geciciKok = (ad) => {
  const k = fs.mkdtempSync(path.join(os.tmpdir(), `arac-${ad}-`));
  fs.cpSync(HOOKS, path.join(k, '.claude', 'hooks'), { recursive: true });
  return k;
};

test('çözümle: üç biçim aynı komutu ve dosyayı verir', () => {
  for (const arac of ARACLAR) {
    assert.equal(cozumle(komut(arac, '/p', 'git status')).komut, 'git status', arac);
    const d = cozumle(yazma(arac, '/p', 'a.ts', 'x')).dosyalar;
    assert.equal(d.length, 1, arac);
    assert.ok(d[0].metin.includes('x'), arac); // Antigravity'de tüm argümanlar taranır
  }
  assert.deepEqual(cozumle(komut('antigravity', '/p', 'ls')).arac, 'antigravity');
  assert.deepEqual(cozumle(komut('codex', '/p', 'ls')).arac, 'codex');
  const coklu = cozumle({ toolCall: { name: 'multi_replace_file_content', args: { TargetFile: '/p/a', ReplacementChunks: [{ ReplacementContent: 'a' }, { ReplacementContent: SIR }] } } });
  assert.ok(coklu.dosyalar[0].metin.includes(SIR), 'Antigravity çoklu değiştirme');
});

test('Codex yaması: eklenen, güncellenen ve taşınan dosyalar', () => {
  const d = yamaDosyalari('*** Begin Patch\n*** Add File: yeni.ts\n+a\n+b\n*** Update File: eski.ts\n@@\n-x\n+y\n*** Update File: t.ts\n*** Move to: u.ts\n+z\n*** End Patch');
  assert.deepEqual(d.map(({ yol, yeni }) => [yol, yeni]), [['yeni.ts', true], ['eski.ts', false], ['t.ts', false], ['u.ts', true]]);
  assert.equal(d[0].metin, 'a\nb\n');
  assert.equal(d[1].metin, 'y\n', 'silinen satır metne girmez');
});

test('karar biçimi: Codex\'te "ask" engellemeye döner, Antigravity\'de decision alanı', () => {
  assert.equal(JSON.parse(kararMetni('claude', 'ask', 'n')).hookSpecificOutput.permissionDecision, 'ask');
  const c = JSON.parse(kararMetni('codex', 'ask', 'n')).hookSpecificOutput;
  assert.equal(c.permissionDecision, 'deny');
  assert.match(c.permissionDecisionReason, /kullanıcıya sor/);
  assert.deepEqual(JSON.parse(kararMetni('antigravity', 'ask', 'n')), { decision: 'ask', reason: 'n' });
});

test('sır engeli: üç aracın girdi biçiminde de sır yazımı engellenir', () => {
  const kok = geciciKok('sir');
  for (const arac of ARACLAR) {
    assert.equal(calistir('guard-secrets.mjs', arac, kok, yazma(arac, kok, 'a.ts', `const k = "${SIR}"`)), 'deny', arac);
    assert.equal(calistir('guard-secrets.mjs', arac, kok, yazma(arac, kok, 'a.ts', 'const k = process.env.K')), null, `${arac}: temiz`);
  }
});

test('yıkıcı komut kalkanı: üç biçimde; Codex\'te "sor" engellenir', () => {
  const kok = geciciKok('kalkan');
  const tablo = 'users';
  for (const arac of ARACLAR) {
    assert.equal(calistir('destructive-guard.mjs', arac, kok, komut(arac, kok, `psql -c "DROP TABLE ${tablo}"`)), 'deny', arac);
    assert.equal(calistir('destructive-guard.mjs', arac, kok, komut(arac, kok, 'git status')), null, arac);
  }
  assert.equal(calistir('destructive-guard.mjs', 'claude', kok, komut('claude', kok, 'git push origin main')), 'ask');
  assert.equal(calistir('destructive-guard.mjs', 'antigravity', kok, komut('antigravity', kok, 'git push origin main')), 'ask');
  assert.equal(calistir('destructive-guard.mjs', 'codex', kok, komut('codex', kok, 'git push origin main')), 'deny');
});

test('yapı koruyucu ve düzenleme kilidi: kök Codex\'te cwd, Antigravity\'de workspacePaths', () => {
  const kok = geciciKok('yapi');
  fs.mkdirSync(path.join(kok, '.claude', 'state'), { recursive: true });
  fs.writeFileSync(path.join(kok, '.claude', 'structure.json'), JSON.stringify({ allow: ['src/**'], deny: ['**/*.bak'] }));
  for (const arac of ARACLAR) {
    assert.equal(calistir('structure-guard.mjs', arac, kok, yazma(arac, kok, 'src/a.ts', 'x')), null, `${arac}: haritada`);
    assert.equal(calistir('structure-guard.mjs', arac, kok, yazma(arac, kok, 'src/a.bak', 'x')), 'deny', `${arac}: dağınıklık`);
    assert.equal(calistir('structure-guard.mjs', arac, kok, yazma(arac, kok, 'baska/a.ts', 'x')), arac === 'codex' ? 'deny' : 'ask', `${arac}: harita dışı`);
  }
  fs.writeFileSync(path.join(kok, '.claude', 'state', 'freeze.json'), JSON.stringify({ dir: 'src/auth' }));
  for (const arac of ARACLAR) {
    assert.equal(calistir('freeze-guard.mjs', arac, kok, yazma(arac, kok, 'src/lib/x.ts', 'x')), 'deny', `${arac}: kilit dışı`);
    assert.equal(calistir('freeze-guard.mjs', arac, kok, yazma(arac, kok, 'src/auth/x.ts', 'x')), null, `${arac}: kilit içi`);
  }
});

test('oturum başı: Codex additionalContext, Antigravity injectSteps', () => {
  const kok = geciciKok('oturum');
  const oturum = (arac, girdi) => JSON.parse(spawnSync(process.execPath, [path.join(kok, '.claude', 'hooks', 'session-start.mjs')], { input: JSON.stringify(girdi), encoding: 'utf8', env: ortam(arac, kok) }).stdout);
  const c = oturum('codex', { hook_event_name: 'SessionStart', cwd: kok }); // SessionStart'ta turn_id beklenmez
  assert.equal(c.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(c.systemMessage, undefined, 'Codex\'te belgelenmemiş alan yok');
  assert.doesNotMatch(c.hookSpecificOutput.additionalContext, /get_usage|caveman/, 'Claude\'a özel notlar yok');
  const a = oturum('antigravity', { workspacePaths: [kok] });
  assert.match(a.injectSteps[0].systemMessage.systemMessage, /^\[Kit\]/);
});

test('komut -> skill: ad, açıklama ve gövde', () => {
  const s = komuttanSkill('build', '---\ndescription: Görevi uygular: test eder.\nargument-hint: [görev kodu]\n---\n\nGörev: $ARGUMENTS\n');
  assert.match(s, /^---\nname: build\ndescription: "Görevi uygular: test eder."\n---\n/);
  assert.match(s, /Beklenen: \[görev kodu\]/);
  assert.match(s, /Görev: \$ARGUMENTS\n$/);
});

test('init --tool: araca göre dosyalar üretilir, repoda kopya tutulmaz', () => {
  const tmp = geciciKok('init');
  const kit = path.join(tmp, 'kit-klon');
  fs.cpSync(REPO, kit, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)$/.test(src) && !src.endsWith('.kit.json') });
  assert.ok(!fs.existsSync(path.join(REPO, '.agents')) && !fs.existsSync(path.join(REPO, '.codex')), 'kit reposunda üretilmiş kopya yok');
  const init = (ad, ...arg) => {
    const p = path.join(tmp, ad);
    const r = spawnSync(process.execPath, [path.join(kit, 'kit', 'kit.mjs'), 'init', '--project', p, ...arg], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return p;
  };
  const komutSayisi = fs.readdirSync(path.join(REPO, '.claude', 'commands')).length;
  const var_ = (p, f) => fs.existsSync(path.join(p, f));
  const kayit = (p) => JSON.parse(fs.readFileSync(path.join(p, '.kit.json'), 'utf8'));

  const cl = init('claude');
  assert.equal(kayit(cl).tool, null, 'araç seçilmedi: /start sorar');
  assert.ok(!var_(cl, '.agents') && !var_(cl, '.codex'), 'sadece Claude Code dosyaları');
  assert.ok(var_(cl, 'AGENTS.md') && /^@AGENTS\.md/.test(fs.readFileSync(path.join(cl, 'CLAUDE.md'), 'utf8')), 'CLAUDE.md AGENTS.md\'yi içe alır');

  const cx = init('codex', '--tool', 'codex');
  assert.deepEqual(kayit(cx).tool, ['codex']);
  assert.ok(var_(cx, '.codex/hooks.json') && !var_(cx, '.agents/hooks.json'));
  assert.equal(fs.readdirSync(path.join(cx, '.agents', 'skills')).filter((d) => var_(cx, `.agents/skills/${d}/SKILL.md`)).length, komutSayisi + 4, 'her komut + kitin 4 skill\'i');
  assert.match(fs.readFileSync(path.join(cx, '.agents/skills/start/SKILL.md'), 'utf8'), /^---\nname: start\n/);
  assert.ok(kayit(cx).files['.codex/hooks.json'], 'hook ayarı güncellemede izlenir');

  const ag = init('ag', '--tool', 'antigravity,claude');
  assert.deepEqual(kayit(ag).tool, ['antigravity', 'claude']);
  assert.ok(var_(ag, '.agents/hooks.json') && var_(ag, '.agents/skills/adopt/SKILL.md') && !var_(ag, '.codex'));

  const hata = spawnSync(process.execPath, [path.join(kit, 'kit', 'kit.mjs'), 'init', '--project', path.join(tmp, 'x'), '--tool', 'cursor'], { encoding: 'utf8' });
  assert.equal(hata.status, 1);
  assert.match(hata.stderr, /Geçersiz araç: cursor/);

  // Hook ayarlarındaki her betik var ve Antigravity araç adları katmanın tanıdıklarıyla aynı
  for (const f of ['.codex/hooks.json', '.agents/hooks.json']) {
    const p = f.startsWith('.codex') ? cx : ag;
    for (const b of fs.readFileSync(path.join(p, f), 'utf8').match(/\.claude\/hooks\/[\w-]+\.mjs/g)) assert.ok(var_(p, b), `${f}: ${b}`);
  }

  // Güncelleme: komut değişince skill kopyası yenilenir; kullanıcının değiştirdiği hook ayarı korunur
  assert.equal(spawnSync(process.execPath, [path.join(kit, 'kit', 'kit.mjs'), 'install', '--type', 'backend', '--project', cx], { encoding: 'utf8' }).status, 0);
  fs.writeFileSync(path.join(cx, '.codex/hooks.json'), '{"hooks":{}}\n');
  fs.appendFileSync(path.join(kit, '.claude/commands/build.md'), '\nYENİ SATIR\n');
  const g = spawnSync(process.execPath, [path.join(kit, 'kit', 'kit.mjs'), 'update', '--project', cx], { encoding: 'utf8' });
  assert.equal(g.status, 0, g.stderr);
  assert.match(fs.readFileSync(path.join(cx, '.agents/skills/build/SKILL.md'), 'utf8'), /YENİ SATIR/);
  assert.equal(fs.readFileSync(path.join(cx, '.codex/hooks.json'), 'utf8'), '{"hooks":{}}\n');
  assert.ok(var_(cx, '.codex/hooks.json.kit-new') === false, 'kit değişmedi: .kit-new yok');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// Güvenlik denetimi (3.9.0 RET) bulgularının saldırgan testleri
const yama = (kok, govde, ek = {}) => ({ tool_name: 'apply_patch', turn_id: 't', cwd: kok, tool_input: { command: `*** Begin Patch\n${govde}\n*** End Patch\n` }, ...ek });

test('saldırgan: yama başlığı boşluklu veya anlaşılmaz olsa da sır engellenir', () => {
  const kok = geciciKok('yama');
  assert.equal(calistir('guard-secrets.mjs', 'codex', kok, yama(kok, `  *** Add File: x.ts\n+k = "${SIR}"`)), 'deny', 'baştaki boşluk');
  assert.equal(calistir('guard-secrets.mjs', 'codex', kok, yama(kok, `*** Ekle: x.ts\n+k = "${SIR}"`)), 'deny', 'tanınmayan başlık');
  assert.equal(calistir('guard-secrets.mjs', 'codex', kok, { tool_name: 'apply_patch', turn_id: 't', cwd: kok, tool_input: { command: { patch: SIR } } }), 'deny', 'nesne tipli girdi çökmeden taranır');
});

test('saldırgan: Antigravity alan adı değişse de sır engellenir, yolsuz yazma kilide takılır', () => {
  const kok = geciciKok('alan');
  const g = { toolCall: { name: 'write_to_file', args: { Path: path.join(kok, 'a.ts'), Content: SIR } }, workspacePaths: [kok] };
  assert.equal(calistir('guard-secrets.mjs', 'antigravity', kok, g), 'deny');
  fs.mkdirSync(path.join(kok, '.claude', 'state'), { recursive: true });
  fs.writeFileSync(path.join(kok, '.claude', 'state', 'freeze.json'), JSON.stringify({ dir: 'src/auth' }));
  g.toolCall.args.Content = 'temiz';
  assert.equal(calistir('freeze-guard.mjs', 'antigravity', kok, g), 'deny', 'hedef yol bilinmiyorsa kilit engeller');
});

test('saldırgan: Codex alt klasörde açılsa da kök bulunur, kilit ve yapı koruması çalışır', () => {
  const kok = geciciKok('altklasor');
  fs.mkdirSync(path.join(kok, '.claude', 'state'), { recursive: true });
  fs.mkdirSync(path.join(kok, 'sub'));
  fs.writeFileSync(path.join(kok, '.claude', 'structure.json'), JSON.stringify({ allow: ['src/**', 'sub/**'], deny: ['**/*.bak'] }));
  fs.writeFileSync(path.join(kok, '.claude', 'state', 'freeze.json'), JSON.stringify({ dir: 'src/auth' }));
  const alt = path.join(kok, 'sub');
  assert.equal(calistir('freeze-guard.mjs', 'codex', kok, yama(alt, '*** Add File: ../src/lib/x.ts\n+x')), 'deny');
  assert.equal(calistir('freeze-guard.mjs', 'codex', kok, yama(alt, '*** Add File: ../src/auth/x.ts\n+x')), null, 'göreli yol cwd\'ye göre çözülür');
  assert.equal(calistir('structure-guard.mjs', 'codex', kok, yama(alt, '*** Add File: a.bak\n+x')), 'deny');
  fs.mkdirSync(path.join(alt, '.git')); // ajanın alt klasörde açtığı sahte işaret kökü değiştirmez
  assert.equal(calistir('freeze-guard.mjs', 'codex', kok, yama(alt, '*** Add File: ../src/lib/x.ts\n+x')), 'deny', 'sahte .git');
  assert.equal(calistir('freeze-guard.mjs', 'antigravity', kok, { toolCall: { name: 'write_to_file', args: { TargetFile: path.join(kok, 'src/lib/x.ts'), CodeContent: 'x' } }, workspacePaths: [alt] }), 'deny', 'workspacePaths kökü belirlemez');
});

test('saldırgan: Claude dışı araçta kural ve koruma dosyaları, .env ve kilit korunur', () => {
  const kok = geciciKok('korumali');
  for (const [f, codex, ag] of [['.claude/state/freeze.json', 'deny', 'ask'], ['.claude/hooks/guard-secrets.mjs', 'deny', 'ask'], ['.codex/hooks.json', 'deny', 'ask'], ['.agents/hooks.json', 'deny', 'ask'], ['AGENTS.md', 'deny', 'ask'], ['.env', 'deny', 'deny'], ['.env.local', 'deny', 'deny']]) {
    assert.equal(calistir('freeze-guard.mjs', 'codex', kok, yama(kok, `*** Delete File: ${f}`)), codex, `codex: ${f}`);
    assert.equal(calistir('freeze-guard.mjs', 'antigravity', kok, yazma('antigravity', kok, f, 'x')), ag, `antigravity: ${f}`);
  }
  assert.equal(calistir('freeze-guard.mjs', 'claude', kok, yazma('claude', kok, '.claude/x.md', 'x')), null, 'Claude Code: settings.json izinleri geçerli, hook karışmaz');
  assert.equal(calistir('freeze-guard.mjs', 'codex', kok, yama(kok, '*** Add File: .env.example\n+A=')), null, '.env.example serbest');
});

test('saldırgan: Claude izin listesindeki yasak komutlar Codex ve Antigravity\'de de engellenir', () => {
  const kok = geciciKok('komut');
  for (const k of ['rm -rf .', 'git reset --hard HEAD~3', 'git push --force origin x', 'cat .env', 'Remove-Item -Recurse -Force src']) {
    assert.equal(calistir('destructive-guard.mjs', 'codex', kok, komut('codex', kok, k)), 'deny', `codex: ${k}`);
    assert.equal(calistir('destructive-guard.mjs', 'antigravity', kok, komut('antigravity', kok, k)), 'deny', `antigravity: ${k}`);
    assert.equal(calistir('destructive-guard.mjs', 'claude', kok, komut('claude', kok, k)), null, `claude: ${k} (settings.json deny'da)`);
  }
  for (const k of ['rm .claude/state/freeze.json', 'sed -i s/deny/x/ .claude/hooks/destructive-guard.mjs', 'echo {} > .agents/hooks.json', 'cp x AGENTS.md']) {
    assert.equal(calistir('destructive-guard.mjs', 'codex', kok, komut('codex', kok, k)), 'deny', `codex kabuk: ${k}`);
    assert.equal(calistir('destructive-guard.mjs', 'antigravity', kok, komut('antigravity', kok, k)), 'ask', `antigravity kabuk: ${k}`);
  }
  assert.equal(calistir('destructive-guard.mjs', 'codex', kok, komut('codex', kok, 'node .claude/hooks/usage.mjs 2>&1')), null, 'kit betiğini çalıştırmak serbest');
  for (const k of ['rm -r .claude', 'git checkout -- .claude/hooks/arac.mjs', 'git restore AGENTS.md']) {
    assert.equal(calistir('destructive-guard.mjs', 'antigravity', kok, komut('antigravity', kok, k)), 'ask', `antigravity kabuk: ${k}`);
  }
  assert.equal(calistir('destructive-guard.mjs', 'antigravity', kok, komut('antigravity', kok, 'git push --force origin main')), 'deny', 'sıkı karar kazanır (ask değil deny)');
  const oku = (p) => ({ toolCall: { name: 'view_file', args: { AbsolutePath: path.join(kok, p) } }, workspacePaths: [kok] });
  assert.equal(calistir('freeze-guard.mjs', 'antigravity', kok, oku('.env')), 'deny', 'Antigravity .env okuyamaz');
  assert.equal(calistir('freeze-guard.mjs', 'antigravity', kok, oku('.claude/hooks/arac.mjs')), null, 'kural dosyası okunabilir');
  assert.equal(calistir('freeze-guard.mjs', 'antigravity', kok, { toolCall: { name: 'list_dir', args: { DirectoryPath: path.join(kok, 'secrets') } }, workspacePaths: [kok] }), 'deny', 'secrets klasörünün kendisi');
  assert.equal(calistir('freeze-guard.mjs', 'antigravity', kok, { toolCall: { name: 'yeni_okuma_araci', args: { Dosya: path.join(kok, '.env.local') } }, workspacePaths: [kok] }), 'deny', 'bilinmeyen araç adı');
  const kilit = 'node .claude/hooks/freeze-guard.mjs --off';
  assert.equal(calistir('destructive-guard.mjs', 'codex', kok, komut('codex', kok, kilit)), 'deny');
  assert.equal(calistir('destructive-guard.mjs', 'antigravity', kok, komut('antigravity', kok, kilit)), 'ask');
});

test('saldırgan: kabukla sır yazma Codex ve Antigravity\'de engellenir; turn_id\'siz Codex girdisi Claude sanılmaz', () => {
  const kok = geciciKok('kabuk');
  const heredoc = `cat > a.ts <<EOF\nk = "${SIR}"\nEOF`;
  assert.equal(calistir('guard-secrets.mjs', 'codex', kok, komut('codex', kok, heredoc)), 'deny');
  assert.equal(calistir('guard-secrets.mjs', 'antigravity', kok, komut('antigravity', kok, heredoc)), 'deny');
  assert.equal(calistir('guard-secrets.mjs', 'claude', kok, komut('claude', kok, heredoc)), null, 'Claude Code davranışı aynı');
  const turnsuz = { tool_name: 'Bash', cwd: kok, tool_input: { command: 'git push origin main' } };
  assert.equal(calistir('destructive-guard.mjs', 'codex', kok, turnsuz), 'deny', 'CLAUDE_PROJECT_DIR yoksa Codex: ask engellenir');
});

test('init: projenin AGENTS.md ve skill dosyaları ezilmez; 3.8 kaydına sonradan araç eklenir', () => {
  const tmp = geciciKok('init2');
  const kit = path.join(tmp, 'kit-klon');
  fs.cpSync(REPO, kit, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)$/.test(src) && !src.endsWith('.kit.json') });
  const kitMjs = path.join(kit, 'kit', 'kit.mjs');
  const p = path.join(tmp, 'eski');
  fs.mkdirSync(path.join(p, '.agents', 'skills', 'build'), { recursive: true });
  fs.writeFileSync(path.join(p, 'AGENTS.md'), '# Eski\n- pnpm kullan\n');
  fs.writeFileSync(path.join(p, '.agents/skills/build/SKILL.md'), 'kendi build skill\'im\n');
  const r = spawnSync(process.execPath, [kitMjs, 'init', '--project', p, '--tool', 'codex'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(p, 'AGENTS.md'), 'utf8'), '# Eski\n- pnpm kullan\n');
  assert.match(fs.readFileSync(path.join(p, 'CLAUDE.md'), 'utf8'), /^@AGENTS\.md\.kit-new$/m, 'Claude kitin kurallarını /adopt\'a kadar .kit-new\'den alır');
  assert.equal(fs.readFileSync(path.join(p, '.agents/skills/build/SKILL.md'), 'utf8'), 'kendi build skill\'im\n');
  assert.ok(fs.existsSync(path.join(p, '.agents/skills/build/SKILL.md.kit-new')) && /build\/SKILL\.md/.test(r.stdout), 'kitin hali yanında, raporda');

  // 3.8 projesi: tool alanı yok; update --tool ile Codex eklenir
  const q = path.join(tmp, 'v38');
  assert.equal(spawnSync(process.execPath, [kitMjs, 'init', '--project', q], { encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync(process.execPath, [kitMjs, 'install', '--type', 'backend', '--project', q], { encoding: 'utf8' }).status, 0);
  const k = JSON.parse(fs.readFileSync(path.join(q, '.kit.json'), 'utf8'));
  delete k.tool;
  fs.writeFileSync(path.join(q, '.kit.json'), JSON.stringify(k));
  const u = spawnSync(process.execPath, [kitMjs, 'update', '--project', q, '--tool', 'codex'], { encoding: 'utf8' });
  assert.equal(u.status, 0, u.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(q, '.kit.json'), 'utf8')).tool, ['codex']);
  assert.ok(fs.existsSync(path.join(q, '.codex/hooks.json')) && fs.existsSync(path.join(q, '.agents/skills/start/SKILL.md')));
  fs.rmSync(tmp, { recursive: true, force: true });
});
