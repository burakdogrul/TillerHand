#!/usr/bin/env node
// Yıkıcı komut ve prod kalkanı (PreToolUse, Bash).
// Neden: Bir AI ajanı, "dur" denmesine rağmen canlı veritabanını silebildi (Replit, 2025). Komutla (prompt) verilen
// yasaklar yetmez; koruma ajanın dışında olmalı. Bu hook kararı Claude Code'un izin katmanına bırakır:
//   deny : veri yok eden komutlar, prod veritabanı adresi içeren komutlar. Gerekirse kullanıcı kendisi çalıştırır.
//   ask  : prod'a deploy, mağazaya gönderim, geri alınması zor git işlemleri. Kullanıcıya sorulur.
import { pathToFileURL } from 'node:url';
import { girdiOku, kararVer } from './arac.mjs';

const YIKICI = [
  [/\bdrop\s+(table|database|schema|index|view|collection)\b/i, 'DROP ile veri yapısı siliniyor'],
  [/\btruncate\s+(table\s+)?\w/i, 'TRUNCATE ile tablo boşaltılıyor'],
  [/\bdelete\s+from\s+[\w."]+\s*(;|"|'|$)/im, 'WHERE koşulu olmayan DELETE: tablodaki tüm satırlar silinir'],
  [/\balter\s+table\b[^;]*\bdrop\s+column\b/i, 'ALTER TABLE ... DROP COLUMN ile sütun ve verisi siliniyor'],
  [/\b(supabase\s+db\s+reset|prisma\s+migrate\s+reset|prisma\s+db\s+push\b[^;]*--force-reset|drizzle-kit\s+drop)\b/i, 'Veritabanı sıfırlanıyor'],
  [/\b(alembic\s+downgrade\s+base|dropdb\b|rails\s+db:(drop|reset)|django-admin\s+flush|manage\.py\s+flush)\b/i, 'Veritabanı veya şema siliniyor'],
  [/\bdocker\s+(compose\s+down\b[^;]*\s-v\b|volume\s+(rm|prune)\b|system\s+prune\b[^;]*--volumes)/i, 'Docker volume (kalıcı veri) siliniyor'],
  [/\bgit\s+clean\b(?=[^;]*\s--?[a-z]*f)(?=[^;]*\s-[a-z]*d)/i, 'git clean ile takip edilmeyen dosyalar kalıcı siliniyor'],
  [/\bredis-cli\b[^;]*\b(flushall|flushdb)\b/i, 'Redis verisi siliniyor'],
  [/\bfirebase\s+firestore:delete\b/i, 'Firestore verisi siliniyor'],
];

// localhost dışındaki veritabanı adresleri prod (veya paylaşılan ortam) kabul edilir
const PROD_DB = /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|rediss):\/\/[^\s'"]*@(?!localhost|127\.0\.0\.1|0\.0\.0\.0|db[:/]|postgres[:/]|host\.docker\.internal)[^\s'"/:]+/i;
const PROD_ISARET = /\b(--prod(uction)?\b|NODE_ENV=production|ENV=production|DATABASE_URL_PROD|PROD_DATABASE_URL)\b/;

const ONAYLI = [
  // Tırnaklı yazımı tirnaksiz() açar; burada sadece kabuğun gördüğü hal
  [/\bvercel\b[^;&|]*(--prod\b|--target(=|\s+)prod(uction)?\b)/i, 'Prod ortamına deploy'],
  // Alt komut bayraklardan sonra da gelebilir: vercel --scope ekip promote <url>
  [/\bvercel(@[\w.-]+)?\b[^;&|]*\s(promote|rollback)\b/i, 'Prod ortamı değişiyor (promote/rollback)'],
  [/\b(fly|flyctl)\s+deploy\b|\brailway\s+up\b|\bnetlify\s+deploy\b[^;]*--prod/i, 'Sunucuya deploy'],
  [/\beas\s+(submit|update\b[^;]*--branch\s+production)/i, 'Mağazaya gönderim veya prod OTA güncellemesi'],
  [/\bgit\s+push\b[^;]*\b(main|master|production)\b/i, 'Ana dala doğrudan push'],
  [/\bgit\s+(rebase|filter-branch|filter-repo)\b/i, 'Git geçmişi yeniden yazılıyor'],
  [/\b(alembic\s+upgrade|prisma\s+migrate\s+deploy|supabase\s+db\s+push)\b/i, 'Migration uygulanıyor (hedef ortamı kontrol et)'],
];

// Claude Code'da .claude/settings.json → permissions ile engellenen/sorulan komutlar. Codex ve Antigravity'de
// bu liste yok; karşılığı burada (sadece o araçlarda uygulanır, Claude'un davranışı değişmez).
const IZIN_KARSILIGI = [
  ['deny', /\brm\b(?=[^;&|]*\s--?[a-z]*r)(?=[^;&|]*\s--?[a-z]*f)/i, 'rm -rf ile toplu silme'],
  ['deny', /\b(Remove-Item|rm|ri|del|erase)\b[^;&|]*\s-Recurse\b|\b(rmdir|rd|del)\s+[^;&|]*\/s\b/i, 'Klasör toplu siliniyor'],
  ['deny', /\bgit\s+reset\s+[^;&|]*--hard\b/i, 'git reset --hard ile commit edilmemiş iş siliniyor'],
  ['deny', /\bgit\s+push\b[^;&|]*\s(--force\S*|-\w*f\w*|\+\S+)(?=\s|$)/i, 'git push --force ile uzak geçmiş eziliyor'],
  ['deny', /(^|[\s'"=<>/\\])\.env(?!\.example\b)(\.[\w.-]+|\*)?(?=$|[\s'";|&)<>])|(^|[\s'"/\\])secrets[/\\]/i, '.env veya secrets/ dosyasına erişiliyor (AI okumaz, yazmaz)'],
  ['ask', /freeze-guard\.mjs\s+--off\b/i, 'Düzenleme kilidi kaldırılıyor'],
  // Dosya araçlarındaki KORUMALI kuralının kabuk karşılığı: kural veya koruma dosyasını anan ve yazan/silen komut sorulur
  ['ask', /(?=.*((^|[\s'"/\\])\.(claude|codex|agents)(?=$|[\s/\\'"])|\bAGENTS\.md|\bCLAUDE\.md))(?=.*(\b(rm|del|erase|rmdir|rd|mv|move|cp|copy|tee|truncate|checkout|restore|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item)\b|\bsed\s+-i|>|\bnode\s+-e|\bpython\d?\s+-c))/i, 'Kural veya koruma dosyası kabuk komutuyla değiştiriliyor'],
];

// Kabuğun göreceği hal: $'..' açılır, tırnaklar, \ kaçışı ve PowerShell ` kaçışı düşer. Sadece eşleştirme içindir.
// Neden: --pro""d, pr\omote, $'--prod' kabukta --prod ve promote olur; kuralları tek tek tırnağa göre yazmak atlatılır.
export const tirnaksiz = (s) => s.replace(/\$'((?:[^'\\]|\\.)*)'/g, '$1').replace(/\\(.)/g, '$1').replace(/[`'"]/g, '');

// Ham ve tırnağı açılmış metinden sıkı olan karar kazanır (deny > ask)
const SIRA = { deny: 2, ask: 1 };
const sikisi = (...s) => s.filter(Boolean).sort((a, b) => SIRA[b.karar] - SIRA[a.karar])[0] ?? null;

export function izinKarsiligi(komut) {
  return sikisi(izinTek(komut), izinTek(tirnaksiz(komut)));
}
function izinTek(komut) {
  const k = komut.replace(/\s+/g, ' ').replace(/\b2>&1|\b2>\s*(\/dev\/null|nul)\b/gi, ''); // hata yönlendirmesi yazma sayılmaz
  const e = IZIN_KARSILIGI.find(([, re]) => re.test(k));
  return e ? { karar: e[0], neden: `${e[2]}. ${e[0] === 'deny' ? 'AI bu komutu çalıştıramaz; gerekliyse kullanıcı kendisi çalıştırır.' : 'Kullanıcı onayı gerekli.'}` } : null;
}

// Şüpheliyse sor: kabuğu taklit etmek yerine, gizleme işareti varken korunan bir kelime çıkarsa karar "ask".
// Neden: satır sonu \, $'\x2d..', pro$()d, ha${X}rd, `..` gibi yazımlar metinden tam çözülemez (kullanıcı kararı 2026-10-23).
const GIZLEME = /\\\r?\n|\$'|\$\(|`|\$\{|\$[@*]/;
const KORUNAN = [
  /\bvercel\b.*\b(prod|production|promote|rollback)\b/, /\b(drop|truncate)\b/, /\breset\b.*\bhard\b/,
  /\bpush\b.*(\s-f\b|force)/, /\brm\b.*\s-[a-z]*(rf|fr)/, /\b(db|migrate)\s+reset\b/,
];
const kacisCoz = (m, e) => /^x/.test(e) ? String.fromCharCode(parseInt(e.slice(1), 16)) : /^u/.test(e) ? String.fromCharCode(parseInt(e.slice(1), 16))
  : /^[0-7]/.test(e) ? String.fromCharCode(parseInt(e, 8)) : e;
const gevsek = (s) => s.toLowerCase().replace(/\\\r?\n/g, '').replace(/`[^`]*`|\$\([^)]*\)|\$\{[^}]*\}|\$[@*]/g, '')
  .replace(/\\(x[0-9a-f]{1,2}|u[0-9a-f]{1,4}|[0-7]{1,3}|.)/g, kacisCoz).replace(/[$'"]/g, '').replace(/\s+/g, ' ');
function gizlemeTek(komut) {
  if (!GIZLEME.test(komut)) return null;
  const g = gevsek(komut);
  return KORUNAN.some((re) => re.test(g))
    ? { karar: 'ask', neden: 'Komut gizlenmiş görünüyor (satır sonu \\, $\'..\', $(...), `...` veya ${...}) ve korunan bir işlem içeriyor. Kullanıcı onayı gerekli.' } : null;
}

export function degerlendir(komut) {
  return sikisi(degerlendirTek(komut), degerlendirTek(tirnaksiz(komut)), gizlemeTek(komut));
}
function degerlendirTek(komut) {
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
  const g = girdiOku();
  // İki listeden sıkı olan kazanır (deny > ask)
  const sonuclar = g ? [degerlendir(g.komut), g.arac !== 'claude' ? izinKarsiligi(g.komut) : null].filter(Boolean) : [];
  const s = sonuclar.find((x) => x.karar === 'deny') ?? sonuclar[0];
  if (s) kararVer(g.arac, s.karar, `Kalkan: ${s.neden}`);
  process.exit(0);
}
