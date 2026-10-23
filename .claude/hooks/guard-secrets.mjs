#!/usr/bin/env node
// Sır (API anahtarı, özel anahtar) yazılmasını engeller.
// İki kullanım:
//   1) PreToolUse hook'u (Claude Code, Codex, Antigravity): stdin'den araç girdisini okur, sır varsa engeller (deny).
//   2) Git pre-commit: `node .claude/hooks/guard-secrets.mjs --staged` sahnelenmiş değişiklikleri tarar.
// Sadece yüksek güvenilirlikli kalıplar var; yanlış alarm vermemesi için genel "password=" araması yok.
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { girdiOku, kararVer } from './arac.mjs';

export const KALIPLAR = [
  ['Anthropic/OpenAI anahtarı', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}/],
  ['Stripe gizli anahtarı', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/],
  ['AWS erişim anahtarı', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}|\bgithub_pat_[A-Za-z0-9_]{50,}/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Özel anahtar', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['Resend anahtarı', /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/],
];

export function bul(metin) {
  return KALIPLAR.filter(([, re]) => re.test(metin)).map(([ad]) => ad);
}

function hookModu() {
  const g = girdiOku();
  if (!g) process.exit(0); // girdi okunamadıysa işi engelleme
  // Codex ve Antigravity'de kabuk komutu da taranır (heredoc, echo > dosya); Claude Code'da sadece dosya araçları
  if (g.arac !== 'claude' && bul(g.komut).length) {
    kararVer(g.arac, 'deny', `ENGELLENDİ: komut sır içeriyor (${bul(g.komut).join(', ')}). Sırrı komuta veya dosyaya yazma; ortam değişkeninden oku.`);
  }
  for (const { yol, metin } of g.dosyalar) {
    const bulunan = bul(metin);
    if (bulunan.length) {
      kararVer(g.arac, 'deny',
        `ENGELLENDİ: ${yol} dosyasına sır yazılıyor (${bulunan.join(', ')}). ` +
          'Sırrı koda yazma; ortam değişkeninden oku ve değişken adını .env.example dosyasına boş değerle ekle.');
    }
  }
}

function stagedModu() {
  const diff = execSync('git diff --cached -U0 --no-color', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let dosya = '';
  const bulgular = [];
  for (const satir of diff.split('\n')) {
    if (satir.startsWith('+++ ')) dosya = satir.slice(6);
    else if (satir.startsWith('+') && !satir.startsWith('+++')) {
      const b = bul(satir);
      if (b.length) bulgular.push(`${dosya}: ${b.join(', ')}`);
    }
  }
  if (bulgular.length) {
    console.error('Commit durduruldu, sır bulundu:\n  ' + bulgular.join('\n  '));
    console.error('Sırrı kaldır, ortam değişkenine taşı. Sızmış olabilecek anahtarı iptal edip yenile.');
    process.exit(1);
  }
}

// Testler bu dosyayı import ettiğinde çalışmasın, sadece doğrudan çağrılınca çalışsın
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.argv.includes('--staged') ? stagedModu() : hookModu();
}
