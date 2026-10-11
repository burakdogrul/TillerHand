#!/usr/bin/env node
// Yıkıcı komut ve prod kalkanı (PreToolUse, Bash).
// Neden: Bir AI ajanı, "dur" denmesine rağmen canlı veritabanını silebildi (Replit, 2025). Komutla (prompt) verilen
// yasaklar yetmez; koruma ajanın dışında olmalı. Bu hook kararı Claude Code'un izin katmanına bırakır:
//   deny : veri yok eden komutlar, prod veritabanı adresi içeren komutlar. Gerekirse kullanıcı kendisi çalıştırır.
//   ask  : prod'a deploy, mağazaya gönderim, geri alınması zor git işlemleri. Kullanıcıya sorulur.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const YIKICI = [
  [/\bdrop\s+(table|database|schema|index|view|collection)\b/i, 'DROP ile veri yapısı siliniyor'],
  [/\btruncate\s+(table\s+)?\w/i, 'TRUNCATE ile tablo boşaltılıyor'],
  [/\bdelete\s+from\s+[\w."]+\s*(;|"|'|$)/im, 'WHERE koşulu olmayan DELETE: tablodaki tüm satırlar silinir'],
  [/\balter\s+table\b[^;]*\bdrop\s+column\b/i, 'ALTER TABLE ... DROP COLUMN ile sütun ve verisi siliniyor'],
  [/\b(supabase\s+db\s+reset|prisma\s+migrate\s+reset|prisma\s+db\s+push\b[^;]*--force-reset|drizzle-kit\s+drop)\b/i, 'Veritabanı sıfırlanıyor'],
  [/\b(alembic\s+downgrade\s+base|dropdb\b|rails\s+db:(drop|reset)|django-admin\s+flush|manage\.py\s+flush)\b/i, 'Veritabanı veya şema siliniyor'],
  [/\bdocker\s+(compose\s+down\b[^;]*\s-v\b|volume\s+(rm|prune)\b|system\s+prune\b[^;]*--volumes)/i, 'Docker volume (kalıcı veri) siliniyor'],
  [/\bgit\s+clean\b[^;]*-[a-z]*f[a-z]*d/i, 'git clean ile takip edilmeyen dosyalar kalıcı siliniyor'],
  [/\bredis-cli\b[^;]*\b(flushall|flushdb)\b/i, 'Redis verisi siliniyor'],
  [/\bfirebase\s+firestore:delete\b/i, 'Firestore verisi siliniyor'],
];

// localhost dışındaki veritabanı adresleri prod (veya paylaşılan ortam) kabul edilir
const PROD_DB = /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|rediss):\/\/[^\s'"]*@(?!localhost|127\.0\.0\.1|0\.0\.0\.0|db[:/]|postgres[:/]|host\.docker\.internal)[^\s'"/:]+/i;
const PROD_ISARET = /\b(--prod(uction)?\b|NODE_ENV=production|ENV=production|DATABASE_URL_PROD|PROD_DATABASE_URL)\b/;

const ONAYLI = [
  [/\bvercel\b[^;]*--prod\b|\bvercel\s+deploy\b[^;]*--prod/i, 'Prod ortamına deploy'],
  [/\b(fly|flyctl)\s+deploy\b|\brailway\s+up\b|\bnetlify\s+deploy\b[^;]*--prod/i, 'Sunucuya deploy'],
  [/\beas\s+(submit|update\b[^;]*--branch\s+production)/i, 'Mağazaya gönderim veya prod OTA güncellemesi'],
  [/\bgit\s+push\b[^;]*\b(main|master|production)\b/i, 'Ana dala doğrudan push'],
  [/\bgit\s+(rebase|filter-branch|filter-repo)\b/i, 'Git geçmişi yeniden yazılıyor'],
  [/\b(alembic\s+upgrade|prisma\s+migrate\s+deploy|supabase\s+db\s+push)\b/i, 'Migration uygulanıyor (hedef ortamı kontrol et)'],
];

export function degerlendir(komut) {
  const k = komut.replace(/\s+/g, ' ');
  const prodDb = PROD_DB.test(k) || PROD_ISARET.test(k);
  for (const [re, neden] of YIKICI) {
    if (re.test(k)) {
      return { karar: 'deny', neden: `${neden}${prodDb ? ' — PROD/uzak veritabanı hedefleniyor' : ''}. AI bu komutu çalıştıramaz. Gerekliyse kullanıcı, önce yedek alıp kendisi çalıştırır (Claude Code'da "! komut" veya kendi terminali).` };
    }
  }
  for (const [re, neden] of ONAYLI) {
    if (re.test(k)) return { karar: prodDb ? 'deny' : 'ask', neden: `${neden}. Kullanıcı onayı gerekli.${prodDb ? ' Komut prod veritabanı adresi içeriyor; AI çalıştıramaz.' : ''}` };
  }
  if (prodDb && /\b(psql|mysql|mongosh|redis-cli|prisma|drizzle-kit|alembic|supabase)\b/i.test(k)) {
    return { karar: 'ask', neden: 'Komut localhost dışındaki bir veritabanına bağlanıyor (prod olabilir). Kullanıcı onayı gerekli; AI prod erişim bilgisi kullanmamalı.' };
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let komut = '';
  try { komut = JSON.parse(readFileSync(0, 'utf8')).tool_input?.command ?? ''; } catch { process.exit(0); }
  const s = degerlendir(komut);
  if (s) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: s.karar, permissionDecisionReason: `Kalkan: ${s.neden}` } }));
  process.exit(0);
}
