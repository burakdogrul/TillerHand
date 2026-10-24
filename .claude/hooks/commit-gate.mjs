#!/usr/bin/env node
// Commit kapısı: AI'nın her `git commit`'inden önce hafif kurul denetimi ve yeşil deterministik kapı (gate.mjs) ister.
//   PreToolUse (Bash) hook'u: denetim onayı yoksa commit'i çıkış kodu 2 ile durdurur ve ne yapılacağını söyler.
//   node .claude/hooks/commit-gate.mjs --approve "<katılan üyeler veya not>"   onayı mevcut değişikliklere bağlar.
// Muaf: kurul kurulmamışsa, docs/workflow/board.md'de "Commit denetimi: kapalı" ise, sadece dokümantasyon değiştiyse.
// Kullanıcının kendi terminalinden attığı commit'ler etkilenmez (bu bir Claude Code hook'u).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { kokBul } from './arac.mjs';
import { tirnaksiz } from './destructive-guard.mjs';
import { komutlar, komutListesi, agentsOku } from './gate.mjs'; // döngüsel içe alma: sadece çalışma anında kullanılır

// Alt klasörden çağrılsa da proje kökü (betiğin yeri): onay ve kapı yanlış yere yazılmasın
const kok = kokBul();
const onayDosyasi = path.join(kok, '.claude', 'state', 'commit-approval.json');
const git = (k) => execSync(`git ${k}`, { cwd: kok, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });

// Commit'e girecek değişiklikler: sahnelenmiş, izlenen dosyalardaki sahnelenmemiş (git commit -a) ve izlenmeyen yeni
// dosyalar (git add -A && git commit). -z: Türkçe veya boşluklu yollar tırnaklanıp kaçışlanmasın
export function degisiklikler() {
  // .claude/state/ (onay, kapı sonucu) imzaya girmez: .gitignore'da olmasa da onay yazmak imzayı değiştirmesin
  const yeni = git('ls-files --others --exclude-standard -z').split('\0').filter((f) => f && !f.startsWith('.claude/state/'));
  const dosyalar = [...new Set([...git('diff --cached --name-only -z').split('\0'), ...git('diff --name-only -z').split('\0'), ...yeni].filter(Boolean))];
  const h = crypto.createHash('sha256').update(git('diff --cached') + '\0' + git('diff'));
  for (const f of yeni) {
    h.update(`\0${f}\0`);
    try { h.update(fs.readFileSync(path.join(kok, f))); } catch { /* okunamayan dosya: adı yeter */ }
  }
  return { dosyalar, imza: h.digest('hex') };
}

// git'in genel seçenekleri commit'ten önce gelebilir: git --no-pager commit, git -C x commit, git --git-dir=x commit
const COMMIT = /\bgit\b(?:\s+(?:-[cC]\s+\S+|--?[\w-]+(?:=\S+)?))*\s+commit\b/;

// Hook komut çalışmadan önceki hali görür: commit'ten önce dosya değiştirebilen her şey denetimi boşa çıkarır.
// İzinli: commit tek başına, önünde "git add" ve "cd". Heredoc ve $(cat <<'EOF' … EOF) mesajı komut sayılmaz.
export function zincirSorunu(komut) {
  const k = komut.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, '<<HEREDOC')
    .replace(/\$\(\s*cat\s+<<HEREDOC\s*\)/g, 'MESAJ')
    .replace(/'[^']*'/g, "''")
    .replace(/"((?:[^"\\]|\\.)*)"/g, (m, ic) => (/\$\(|`/.test(ic) ? m : '""'))
    .replace(/\d*>&\d+/g, '');
  if (/\$\(|`/.test(k)) return 'komutta ikame var ($(...) veya `...`)';
  const parcalar = k.split(/&&|\|\||[;|&\n]/).map((s) => s.trim()).filter(Boolean);
  return parcalar.every((s) => COMMIT.test(s) || /^git\s+add\b/.test(s) || /^cd\b/.test(s)) ? null : 'commit başka komutlarla zincirli';
}

export const sadeceDokuman = (dosyalar) => dosyalar.every((f) => /\.(md|txt)$/i.test(f) || f.startsWith('docs/'));

function kurulVar() {
  const ajanlar = path.join(kok, '.claude', 'agents');
  // board-chair (konsey başkanı) şablonla gelir, kurul üyesi değildir; üye dosyaları /start Kurul adımında kopyalanır
  return fs.existsSync(ajanlar) && fs.readdirSync(ajanlar).some((f) => /^board-.+\.md$/.test(f) && f !== 'board-chair.md');
}

function denetimKapali() {
  try {
    return /^\*\*Commit denetimi:\*\*\s*kapalı/im.test(fs.readFileSync(path.join(kok, 'docs', 'workflow', 'board.md'), 'utf8'));
  } catch {
    return false;
  }
}

function onayla(not) {
  const { imza, dosyalar } = degisiklikler();
  fs.mkdirSync(path.dirname(onayDosyasi), { recursive: true });
  fs.writeFileSync(onayDosyasi, JSON.stringify({ imza, not, dosyalar, tarih: new Date().toISOString() }));
  console.log(`Commit kapısı açıldı (${dosyalar.length} dosya). Not: ${not}`);
}

function hook() {
  let komut = '';
  try {
    komut = JSON.parse(fs.readFileSync(0, 'utf8')).tool_input?.command ?? '';
  } catch {
    process.exit(0);
  }
  // "atlandı" onayı kapıyı ve kurulu aşar: kullanıcıya sorulur (AI kendi başına yazamasın)
  const acik = tirnaksiz(komut);
  if (/commit-gate\.mjs\b[^;&|\n]*--approve\s+atlandı/i.test(acik)) {
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask',
      permissionDecisionReason: 'Commit kapısı: "atlandı" onayı kurul denetimini ve deterministik kapıyı aşar. Sadece kullanıcı açıkça isterse onayla.' } }));
    process.exit(0);
  }
  // Kapı komut onayı AGENTS.md'deki komutlara çalışma izni verir: kullanıcıya sorulur (izin listesi yazımı farklı yolu da kapsasın)
  if (/gate\.mjs\b[^;&|\n]*--onayla\b/i.test(acik)) {
    // Pencere AGENTS.md'yi şimdi okur: zincirdeki başka komut onu pencereden sonra değiştirip başka listeyi onaylatmasın
    if (/\$\(|`/.test(komut) || acik.split(/&&|\|\||[;|&\n]/).filter((s) => s.trim()).length > 1) {
      console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
        permissionDecisionReason: 'Kapı komut onayı tek başına çalıştırılır (zincir veya $(...) olmadan): node .claude/hooks/gate.mjs --onayla' } }));
      process.exit(0);
    }
    const liste = komutListesi(komutlar(agentsOku(kok))) || '(tanımlı komut yok)';
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask',
      permissionDecisionReason: `Kapı komut onayı: AGENTS.md → Komutlar'daki şu komutlar bundan sonra her kapıda çalışır:\n${liste}\nGüvendiğin komutlarsa onayla.` } }));
    process.exit(0);
  }
  if (!COMMIT.test(komut) && !COMMIT.test(acik)) process.exit(0);
  if (!kurulVar() || denetimKapali()) process.exit(0);
  const zincir = zincirSorunu(komut);
  if (zincir) {
    process.stderr.write(`Commit durduruldu: ${zincir}. Kapı komut çalışmadan önceki değişiklikleri denetler; commit'i tek başına ` +
      '(veya yalnızca "git add … && git commit" ile) çalıştır. Push ve diğer komutları ayrı çalıştır.\n');
    process.exit(2);
  }

  let d;
  try {
    d = degisiklikler();
  } catch {
    process.exit(0); // git deposu değil
  }
  if (!d.dosyalar.length || sadeceDokuman(d.dosyalar)) process.exit(0);

  let onay = null;
  try {
    onay = JSON.parse(fs.readFileSync(onayDosyasi, 'utf8'));
  } catch {
    // onay yok
  }
  // Deterministik kapı (gate.mjs) aynı değişiklikler için yeşil olmalı; kullanıcı "atlandı" derse aranmaz
  let kapi = null;
  try {
    kapi = JSON.parse(fs.readFileSync(path.join(kok, '.claude', 'state', 'gate.json'), 'utf8'));
  } catch {
    // kapı çalışmadı
  }
  const atlandi = /^atlandı/i.test(String(onay?.not ?? ''));
  if (onay?.imza === d.imza && (atlandi || (kapi?.imza === d.imza && kapi.gecti === true))) process.exit(0);
  if (onay?.imza === d.imza) {
    const kalan = kapi?.imza === d.imza ? (kapi.kontroller ?? []).filter((k) => k.durum === 'kaldı').map((k) => k.ad) : null;
    process.stderr.write(kalan && !kalan.length && kapi.bos
      ? 'Commit durduruldu: deterministik kapı boş (hiçbir kontrol çalışmadı). AGENTS.md → Komutlar\'ı doldur ve kapıyı tekrar çalıştır.\n' +
        'Kullanıcı bu commit için açıkça isterse --approve "atlandı: kullanıcı isteği" kullan.\n'
      : kalan
      ? `Commit durduruldu: deterministik kapı kırmızı (${kalan.join(', ') || 'kaldı'}). Düzelt, node .claude/hooks/gate.mjs --run ile tekrar çalıştır, sonra onayla.\n` +
        'Kullanıcı ara commit (WIP) için açıkça isterse --approve "atlandı: kullanıcı isteği" kullan.\n'
      : 'Commit durduruldu: bu değişiklikler için deterministik kapı çalışmadı (ya da sonrasında değişiklik oldu). ' +
        'node .claude/hooks/gate.mjs --run çalıştır; kırmızı yoksa kurul onayını yenile ve commit\'i tekrar dene.\n');
    process.exit(2);
  }

  process.stderr.write(
    `Commit durduruldu: Bu değişiklikler için kurul denetimi yapılmadı (${d.dosyalar.length} dosya).\n` +
      '0. node .claude/hooks/gate.mjs --run ile deterministik kapıyı (lint, tip, test, Semgrep) çalıştır; çıktısını üyelere ver.\n' +
      '1. .claude/board/rules.md §3\'e göre değişen dosyalara ilgili en fazla 2 kurul üyesini model "haiku" ile, sadece diff üzerinde çalıştır.\n' +
      '2. RET yoksa: node .claude/hooks/commit-gate.mjs --approve "<katılan üyeler>" ve commit\'i tekrar dene.\n' +
      '3. RET varsa commit atma; bulguyu ve seçenekleri kullanıcıya sor.\n' +
      'Kullanıcı bu commit için denetimi açıkça atlamak isterse --approve "atlandı: kullanıcı isteği" kullan.\n'
  );
  process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--approve');
  if (i > -1) onayla(process.argv[i + 1] || 'belirtilmedi');
  else hook();
}
