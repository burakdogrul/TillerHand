#!/usr/bin/env node
// Commit kapısı: AI'nın her `git commit`'inden önce hafif kurul denetimi yapılmasını zorunlu kılar.
//   PreToolUse (Bash) hook'u: denetim onayı yoksa commit'i çıkış kodu 2 ile durdurur ve ne yapılacağını söyler.
//   node .claude/hooks/commit-gate.mjs --approve "<katılan üyeler veya not>"   onayı mevcut değişikliklere bağlar.
// Muaf: kurul kurulmamışsa, docs/workflow/board.md'de "Commit denetimi: kapalı" ise, sadece dokümantasyon değiştiyse.
// Kullanıcının kendi terminalinden attığı commit'ler etkilenmez (bu bir Claude Code hook'u).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const kok = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const onayDosyasi = path.join(kok, '.claude', 'state', 'commit-approval.json');
const git = (k) => execSync(`git ${k}`, { cwd: kok, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });

// Commit'e girecek değişiklikler: sahnelenmiş + izlenen dosyalardaki sahnelenmemiş (git commit -a için)
export function degisiklikler() {
  const dosyalar = [...new Set([...git('diff --cached --name-only').split('\n'), ...git('diff --name-only').split('\n')].filter(Boolean))];
  const imza = crypto.createHash('sha256').update(git('diff --cached') + '\0' + git('diff')).digest('hex');
  return { dosyalar, imza };
}

export const sadeceDokuman = (dosyalar) => dosyalar.every((f) => /\.(md|txt)$/i.test(f) || f.startsWith('docs/'));

function kurulVar() {
  const ajanlar = path.join(kok, '.claude', 'agents');
  return fs.existsSync(ajanlar) && fs.readdirSync(ajanlar).some((f) => /^board-.+\.md$/.test(f));
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
  if (!/\bgit\b(?:\s+-[cC]\s+\S+)*\s+commit\b/.test(komut)) process.exit(0);
  if (!kurulVar() || denetimKapali()) process.exit(0);

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
  if (onay?.imza === d.imza) process.exit(0);

  process.stderr.write(
    `Commit durduruldu: Bu değişiklikler için kurul denetimi yapılmadı (${d.dosyalar.length} dosya).\n` +
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
