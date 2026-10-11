#!/usr/bin/env node
// Sır (API anahtarı, özel anahtar) yazılmasını engeller.
// İki kullanım:
//   1) Claude Code PreToolUse hook'u: stdin'den araç girdisini okur, sır varsa çıkış kodu 2 ile engeller.
//   2) Git pre-commit: `node .claude/hooks/guard-secrets.mjs --staged` sahnelenmiş değişiklikleri tarar.
// Sadece yüksek güvenilirlikli kalıplar var; yanlış alarm vermemesi için genel "password=" araması yok.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

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

function aracMetni(girdi) {
  const t = girdi.tool_input ?? {};
  if (typeof t.content === 'string') return t.content;
  if (typeof t.new_string === 'string') return t.new_string;
  if (Array.isArray(t.edits)) return t.edits.map((e) => e.new_string ?? '').join('\n');
  return '';
}

function hookModu() {
  let girdi;
  try {
    girdi = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0); // girdi okunamadıysa işi engelleme
  }
  const bulunan = bul(aracMetni(girdi));
  if (bulunan.length) {
    const dosya = girdi.tool_input?.file_path ?? '';
    process.stderr.write(
      `ENGELLENDİ: ${dosya} dosyasına sır yazılıyor (${bulunan.join(', ')}). ` +
        'Sırrı koda yazma; ortam değişkeninden oku ve değişken adını .env.example dosyasına boş değerle ekle.\n'
    );
    process.exit(2);
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
