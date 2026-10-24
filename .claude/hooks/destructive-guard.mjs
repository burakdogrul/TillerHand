#!/usr/bin/env node
// Yıkıcı komut ve prod kalkanı (PreToolUse, Bash).
// Neden: Bir AI ajanı, "dur" denmesine rağmen canlı veritabanını silebildi (Replit, 2025). Komutla (prompt) verilen
// yasaklar yetmez; koruma ajanın dışında olmalı. Bu hook kararı Claude Code'un izin katmanına bırakır:
//   deny : veri yok eden komutlar, prod veritabanı adresi içeren komutlar. Gerekirse kullanıcı kendisi çalıştırır.
//   ask  : prod'a deploy, mağazaya gönderim, geri alınması zor git işlemleri. Kullanıcıya sorulur.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { girdiOku, kararVer } from './arac.mjs';
import { testDosyasi, ayarDosyasi } from './test-guard.mjs';
import { kilitOku, planOku, izinli, kapsamda, gercek, goreli, korumali } from './freeze-guard.mjs';

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

// Prod sırlarını ajanın makinesine çekmek: yerel ortam ve AI sadece dev projesine bağlanır (dev/prod ayrımı)
// vc: Vercel CLI'nin kısa adı
const PROD_SIRRI = /\b(vercel|vc)(@[\w.-]+)?\b(?=[^;&|]*\s(env\s+pull|pull)\b)(?=[^;&|]*\s--environment(=|\s+)prod(uction)?\b)/i;
// Ortam düz development/preview değilse (değişken, $(...), özel ortam) hangi sırların çekileceği bilinemez: sorulur
const BELIRSIZ_ORTAM = /\b(vercel|vc)(@[\w.-]+)?\b(?=[^;&|]*\s(env\s+pull|pull)\b)(?=[^;&|]*\s--environment(=|\s+)(?!['"]?(development|preview)['"]?(\s|$))\S)/i;

const ONAYLI = [
  // Tırnaklı yazımı tirnaksiz() açar; burada sadece kabuğun gördüğü hal
  [/\b(vercel|vc)\b[^;&|]*(--prod\b|--target(=|\s+)prod(uction)?\b)/i, 'Prod ortamına deploy'],
  // Alt komut bayraklardan sonra da gelebilir: vercel --scope ekip promote <url>
  [/\b(vercel|vc)(@[\w.-]+)?\b[^;&|]*\s(promote|rollback)\b/i, 'Prod ortamı değişiyor (promote/rollback)'],
  [BELIRSIZ_ORTAM, 'Ortam değişkenleri çekiliyor ama ortam düz development/preview değil (değişken veya özel ortam: prod olabilir)'],
  [/\b(fly|flyctl)\s+deploy\b|\brailway\s+up\b|\bnetlify\s+deploy\b[^;]*--prod/i, 'Sunucuya deploy'],
  [/\beas\s+(submit|update\b[^;]*--branch\s+production)/i, 'Mağazaya gönderim veya prod OTA güncellemesi'],
  [/\bgit\s+push\b[^;]*\b(main|master|production)\b/i, 'Ana dala doğrudan push'],
  [/\bgit\s+(rebase|filter-branch|filter-repo)\b/i, 'Git geçmişi yeniden yazılıyor'],
  [/\b(alembic\s+upgrade|prisma\s+migrate\s+deploy|supabase\s+db\s+push)\b/i, 'Migration uygulanıyor (hedef ortamı kontrol et)'],
];

// Test koruması dosya araçlarında çalışır; kabukla (sed -i, rm, >, mv, git checkout) test veya test ayar dosyası değiştirmek sorulur.
// Komut zincirinin her parçası ayrı bakılır: "rm -r node_modules && npx vitest run a.test.ts" testi değiştirmez.
const YAZAN = /\b(rm|del|erase|rmdir|rd|unlink|mv|move|cp|copy|tee|truncate|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|Clear-Content)\b|\bsed\b[^;&|]*\s(-[a-zA-Z]*i\S*|--in-place\b)|\bperl\b[^;&|]*\s-[a-zA-Z]*i|\bgit\s+(checkout|restore|rm|mv)\b/i;
const testYolu = (t) => testDosyasi(t) || ayarDosyasi(t) || /(^|[/\\])(tests?|__tests__|e2e|spec)[/\\]?$/i.test(t);
function testYazimi(komut) {
  return komut.split(/&&|\|\||[;|\n]/).some((parca) => {
    const p = parca.replace(/\b2>&1|\b2>\s*(\/dev\/null|nul)\b/gi, '');
    const hedefler = [...p.matchAll(/>{1,2}\s*([^\s;&|<>]+)/g)].map((m) => m[1]);
    return hedefler.some(testYolu) || (YAZAN.test(p) && p.split(/\s+/).some(testYolu));
  });
}

// Kilit ve kapsam kalkanı için yazan komut, komutun ADINA bakılarak bulunur (yoldaki "copy", argümandaki "tee" sayılmaz).
const YAZAN_AD = /^(rm|del|erase|rmdir|rd|unlink|mv|move|cp|copy|tee|truncate|ln|install|dd|black|set-content|add-content|out-file|new-item|remove-item|move-item|copy-item|clear-content)$/;
const ONEK = /^(sudo|npx|bunx|pnpx|command|exec|env|nohup|time)$|^\w+=/;
// 'hedef': argümanlar hedef dosyadır; 'belirsiz': komut hedefini argümanda göstermeden dosya değiştirir
function yazanTuru(ad, a) {
  if (YAZAN_AD.test(ad)) return 'hedef';
  if (ad === 'sed') return a.some((x) => /^(-[a-zA-Z]*i|--in-place)/.test(x)) ? 'hedef' : null;
  if (ad === 'perl') return a.some((x) => /^-[a-zA-Z]*i/.test(x)) ? 'hedef' : null;
  if (/^(curl|wget)$/.test(ad)) return a.some((x) => /^(-[a-zA-Z]*[oO]|--output)/.test(x)) ? 'hedef' : null;
  if (/^(prettier|eslint|biome|ruff)$/.test(ad)) return a.some((x) => /^(--write|--fix|-w|format)$/.test(x)) ? 'hedef' : null;
  if (/^(rsync|unzip)$/.test(ad)) return 'hedef';
  if (ad === 'tar') return a.some((x, i) => /^-[a-zA-Z]*x[a-zA-Z]*$|^--extract$/.test(x) || (i === 0 && /^[a-zA-Z]*x[a-zA-Z]*$/.test(x))) ? 'hedef' : null;
  if (ad === 'find') return a.some((x) => /^-(delete|exec|execdir|ok|okdir|fprint\w*)$/.test(x)) ? 'hedef' : null;
  if (ad === 'patch') return 'belirsiz';
  if (ad === 'git') {
    const [alt, ikinci] = a.filter((x) => !x.startsWith('-'));
    if (/^(checkout|restore|rm|mv)$/.test(alt)) return 'hedef';
    if (/^(apply|am|cherry-pick|revert|clean|switch)$/.test(alt) || (alt === 'stash' && !/^(list|show)$/.test(ikinci ?? ''))) return 'belirsiz';
  }
  return null;
}

const KABUK = /^(bash|sh|zsh|dash|ksh|cmd|powershell|pwsh)$/;
const CD = /^(cd|pushd|chdir|set-location|sl)$/;

// Kabukla değişebilecek dosyalar (kilit ve kapsam kalkanı): yönlendirme hedefleri ve yazan komutun argümanları.
// Zincirdeki cd/pushd/popd ve alt kabuk izlenir; bash -c / sh -c içi de taranır; Git Bash yolu (/c/...) ve ~ çevrilir;
// glob hedefi klasörü sayılır. Değişkenli, ters tırnaklı veya süslü parantezli hedef, doğrulanamayan cd ve hedefini
// göstermeyen komut (git apply, git switch, patch, xargs rm) "belirsiz" döner: kilit veya plan açıkken sorulur.
// shortcut: sezgisel; cp/copy'nin kaynağı da hedef sayılır (fazladan soru), node -e / python -c içindeki yazım görülmez.
export function kabukHedefleri(komut, dizin) {
  const hedefler = [];
  let belirsiz = null;
  const bel = (m) => { belirsiz ??= m; };
  const coz = (t, d = dizin) => {
    // Yerel UNC (\\?\C:\x, \\.\C:\x, \\localhost\c$\x) sürücü yoluna çevrilir; diğer UNC belirsiz sayılır, hook ağ yoluna dokunmaz
    let h = t.replace(/^(\\\\|\/\/)[?.][\\/]/, '').replace(/^(\\\\|\/\/)(localhost|127\.0\.0\.1)[\\/]([a-zA-Z])\$(?=[\\/]|$)/i, '$3:');
    if (/^(\\\\|\/\/)/.test(h)) return bel(`hedef ağ yolu (${t})`), null;
    h = h.replace(/\$\{?PWD\}?/g, d).replace(/^~(?=\/|\\|$)/, os.homedir());
    if (/[$`]/.test(h)) return bel(`hedef değişken veya komut içeriyor (${t})`), null;
    if (/\{[^}]*(,|\.\.)[^}]*\}/.test(h)) return bel(`hedef süslü parantez açılımı içeriyor (${t})`), null;
    if (process.platform === 'win32') h = h.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:');
    let yol = path.resolve(d, h);
    // Glob: diskte yoksa ilk joker karakterden önceki klasör hedef sayılır (src/*.ts → src, * → bulunulan klasör)
    if (/[*?[]/.test(h) && !fs.existsSync(yol)) {
      const once = h.slice(0, h.search(/[*?[]/));
      yol = path.resolve(d, once.endsWith('/') || once.endsWith('\\') || !once ? once || '.' : path.dirname(once));
    }
    return yol;
  };
  const ekle = (t) => { const y = coz(t); if (y) hedefler.push(y); };
  const altKabuk = [], yigin = [];
  for (const parca of komut.replace(/>\|/g, '>').split(/&&|\|\||[;|\n]/)) {
    let p = parca.replace(/\b2>&1|\b2>\s*(\/dev\/null|nul)\b/gi, '').trim();
    // Alt kabuk ( … ) ve grup { …; }: süslü parantez açılımı ({a,b}) grup sayılmaz
    const ac = /^(\(|\{\s)/.test(p), kapa = /(\)|(^|\s)\})$/.test(p);
    if (ac) altKabuk.push(dizin);
    p = p.replace(/^(\(|\{\s)\s*/, '').replace(/\s*(\)|(^|\s)\})$/, '');
    for (const m of p.matchAll(/>{1,2}\s*((?:[^\s;&|<>"']+|"[^"]*"|'[^']*')+)/g)) ekle(m[1].replace(/["']/g, ''));
    // Kabuk kelimesi: kelime ortasındaki tırnak da kelimeye dahil (o'ther' → other)
    const ham = [...p.replace(/>{1,2}\s*((?:[^\s;&|<>"']+|"[^"]*"|'[^']*')+)/g, '').matchAll(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)].map((m) => m[0]);
    const k = ham.map((x) => x.replace(/["']/g, ''));
    while (k.length && ONEK.test(k[0])) { k.shift(); ham.shift(); while (k[0]?.startsWith('-')) { k.shift(); ham.shift(); } }
    const ad = path.basename((k[0] ?? '').replace(/^\\/, '')).toLowerCase().replace(/\.(exe|cmd)$/, '');
    const a = k.slice(1);
    const kapat = () => { if (kapa && altKabuk.length) dizin = altKabuk.pop(); };
    if (CD.test(ad) || ad === 'popd') {
      const hedef = ad === 'popd' ? yigin.pop() : coz(a.filter((x) => !/^-/.test(x) && !/^\/d$/i.test(x)).pop() ?? '$HOME');
      if (ad === 'pushd') yigin.push(dizin);
      if (hedef && fs.existsSync(hedef)) dizin = hedef;
      else bel(`${ad} hedefi doğrulanamadı (${a.join(' ') || 'ev dizini'}); sonraki komutların klasörü bilinmiyor`);
      kapat();
      continue;
    }
    // bash -c "…", cmd /c …, powershell -Command …: içteki komut aynı kurallarla taranır
    if (KABUK.test(ad)) {
      const i = a.findIndex((x) => /^(-c|\/c|-command)$/i.test(x));
      if (i > -1) {
        const ic = kabukHedefleri(ham.slice(i + 2).map((x) => x.replace(/^(["'])([\s\S]*)\1$/, '$2')).join(' '), dizin);
        hedefler.push(...ic.hedefler);
        if (ic.belirsiz) bel(ic.belirsiz);
      }
      kapat();
      continue;
    }
    if (ad === 'xargs') {
      const ic = a.filter((x) => !x.startsWith('-'));
      if (yazanTuru(path.basename(ic[0] ?? '').toLowerCase(), ic.slice(1))) bel(`xargs ${ic[0]} hedef dosyayı göstermiyor`);
      kapat();
      continue;
    }
    const tur = yazanTuru(ad, a);
    if (tur === 'belirsiz') bel(`${ad} ${a.find((x) => !x.startsWith('-')) ?? ''}`.trim() + ' hedef dosyayı göstermiyor');
    if (tur === 'hedef') {
      for (const x of dosyaArgumanlari(ad, a)) {
        const y = coz(x);
        if (!y) continue;
        hedefler.push(y);
        // git checkout <dal>: yol değilse dal değişimidir, bütün çalışma ağacı değişebilir
        if (ad === 'git' && !fs.existsSync(y) && !a.slice(0, a.indexOf(x)).includes('--')) bel(`git ${a[0]} ${x}: yol değil (dal olabilir)`);
      }
    }
    kapat();
  }
  return { hedefler, belirsiz };
}

// Yazan komutun hedef argümanları. sed betiği (-e yoksa ilk argüman) ve -e/-f değeri dosya değildir; dd'de sadece of=,
// tar'da -C (yoksa bulunulan klasör), unzip'te -d (yoksa bulunulan klasör), rsync'te son argüman, find'da başlangıç klasörleri.
function dosyaArgumanlari(ad, a) {
  const deger = (bayrak) => { const i = a.findIndex((x) => bayrak.test(x)); return i > -1 ? a[i + 1] : null; };
  if (ad === 'dd') return a.filter((x) => x.startsWith('of=')).map((x) => x.slice(3));
  if (ad === 'tar') return [deger(/^(-C|--directory)$/) ?? '.'];
  if (ad === 'unzip') return [deger(/^-d$/) ?? '.'];
  if (ad === 'rsync') return a.filter((x) => !x.startsWith('-')).slice(-1);
  if (ad === 'find') { const i = a.findIndex((x) => /^[-(!]/.test(x)); const k = a.slice(0, i < 0 ? a.length : i); return k.length ? k : ['.']; }
  if (ad === 'git') return a.slice(a.findIndex((x) => !x.startsWith('-')) + 1).filter((x) => !x.startsWith('-'));
  const sonuc = [];
  let betikAtla = ad === 'sed' && !a.some((x) => /^(-e|--expression|-f|--file)/.test(x));
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (ad === 'sed' && /^(-e|-f)$/.test(x)) { i++; continue; }
    if (x.startsWith('-')) {
      if (/^--output(-document)?=/.test(x)) sonuc.push(x.split('=')[1]);
      else if (/^(curl|wget)$/.test(ad) && /^-[a-zA-Z]*?[oO].+$/.test(x)) sonuc.push(x.replace(/^-[a-zA-Z]*?[oO]/, '')); // -osrc/a.ts
      continue;
    }
    if (betikAtla) { betikAtla = false; continue; }
    sonuc.push(x);
  }
  return sonuc;
}

// Kilit veya onaylı plan varken kabukla proje içindeki mevcut bir dosyayı değiştirmek sorulur (dosya araçlarındaki
// freeze-guard'ın kabuk karşılığı). Yeni dosya ve proje dışı (geçici) dosya serbest; kökü veya üst klasörü hedeflemek sorulur.
// Kural ve koruma dosyaları (.claude/, .git/, AGENTS.md…; kilit, plan ve onay durumları dahil) kilit/plan olmasa da sorulur, .env engellenir.
export const VIBE_KIT = /[\\/]\.vibe-kit([\\/]|$)/i;
export function kapsamSorunu(komut, dizin, kok) {
  const { hedefler, belirsiz } = kabukHedefleri(komut, dizin);
  const gkok = gercek(kok);
  for (const h of hedefler) {
    if (VIBE_KIT.test(h)) return { karar: 'ask', neden: `${h}: kapı komut onayı kaydı (kullanıcı klasörü); kabukla değiştirilmez, node .claude/hooks/gate.mjs --onayla kullanılır. Kullanıcı onayı gerekli.` };
    const rel = goreli(gercek(h), gkok);
    const k = korumali(rel) ?? korumali(`${rel}/`);
    if (k) return { karar: k[0], neden: k[0] === 'deny' ? `${rel}: ${k[2]}`
      : `${rel}: ${k[2]} Kabuk komutuyla değiştiriliyor; kilit, plan ve onay durumları için ilgili kit komutunu kullan. Kullanıcı onayı gerekli.` };
  }
  // Hedef çözülemedi ama komut kural/koruma dosyası adını anıyor ($D/AGENTS.md, {AGENTS,X}.md): kilit/plan olmasa da sorulur
  if (belirsiz && /AGENTS|CLAUDE|\.(claude|git|github|codex|agents|env|mcp)\b|secrets|vibe-kit/i.test(komut)) {
    return { karar: 'ask', neden: `${belirsiz}; komut kural veya koruma dosyası adını içeriyor (.claude, .git, AGENTS.md…), hedef doğrulanamadı. Kullanıcı onayı gerekli.` };
  }
  const kilit = kilitOku(kok), plan = planOku(kok);
  if (!kilit && !plan) return null;
  const etiket = kilit ? `Düzenleme kilidi (${kilit}/)` : `Kapsam kalkanı (görev ${plan.gorev})`;
  if (belirsiz) return { karar: 'ask', neden: `${etiket}: ${belirsiz}; hangi dosyaların değişeceği bilinemiyor. Gerekliyse kullanıcıya sor.` };
  for (const h of hedefler) {
    if (!fs.existsSync(h)) continue;
    const yol = gercek(h), ust = path.relative(yol, gkok), rel = goreli(yol, gkok);
    if (!ust.startsWith('..') && !path.isAbsolute(ust)) {
      return { karar: 'ask', neden: `${etiket}: komut proje kökünü veya üst klasörünü hedefliyor (${rel || '.'}); kilit/plan dışındaki dosyalar da değişebilir. Gerekliyse kullanıcıya sor.` };
    }
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    if (kilit && !izinli(yol, kilit, gkok)) {
      return { karar: 'ask', neden: `Düzenleme kilidi: ${rel} kilit (${kilit}/) dışında ve komut onu değiştirebilir. Gerekliyse kullanıcıya sor.` };
    }
    if (plan && !kapsamda(fs.statSync(yol).isDirectory() ? `${rel}/` : rel, plan.yollar)) {
      return { karar: 'ask', neden: `Kapsam kalkanı: ${rel} onaylı planda yok (görev ${plan.gorev}) ve komut onu değiştirebilir. Gerekliyse kullanıcıya sor; ` +
        'onaylarsa node .claude/hooks/freeze-guard.mjs --plan-ekle <yol>.' };
    }
  }
  return null;
}

// Claude Code'da .claude/settings.json → permissions ile engellenen/sorulan komutlar. Codex ve Antigravity'de
// bu liste yok; karşılığı burada (sadece o araçlarda uygulanır, Claude'un davranışı değişmez).
const IZIN_KARSILIGI = [
  ['deny', /\brm\b(?=[^;&|]*\s--?[a-z]*r)(?=[^;&|]*\s--?[a-z]*f)/i, 'rm -rf ile toplu silme'],
  ['deny', /\b(Remove-Item|rm|ri|del|erase)\b[^;&|]*\s-Recurse\b|\b(rmdir|rd|del)\s+[^;&|]*\/s\b/i, 'Klasör toplu siliniyor'],
  ['deny', /\bgit\s+reset\s+[^;&|]*--hard\b/i, 'git reset --hard ile commit edilmemiş iş siliniyor'],
  ['deny', /\bgit\s+push\b[^;&|]*\s(--force\S*|-\w*f\w*|\+\S+)(?=\s|$)/i, 'git push --force ile uzak geçmiş eziliyor'],
  ['deny', /(^|[\s'"=<>/\\])\.env(?!\.example\b)(\.[\w.-]+|\*)?(?=$|[\s'";|&)<>])|(^|[\s'"/\\])secrets[/\\]/i, '.env veya secrets/ dosyasına erişiliyor (AI okumaz, yazmaz)'],
  ['ask', /freeze-guard\.mjs['"]?\s+['"]?--off\b/i, 'Düzenleme kilidi kaldırılıyor'],
  ['ask', /freeze-guard\.mjs['"]?\s+['"]?--plan-ekle\b/i, 'Onaylı planın dosya listesi genişliyor (kapsam kalkanı)'],
  ['ask', /gate\.mjs['"]?\s+['"]?--onayla\b/i, 'Deterministik kapının çalıştıracağı komutlar onaylanıyor'],
  // Dosya araçlarındaki KORUMALI kuralının kabuk karşılığı: kural veya koruma dosyasını anan ve yazan/silen komut sorulur
  // (.git: kapı komut onayı ve git hook'ları orada)
  ['ask', /(?=.*((^|[\s'"/\\])\.(claude|codex|agents|git)(?=$|[\s/\\'"])|\bAGENTS\.md|\bCLAUDE\.md))(?=.*(\b(rm|del|erase|rmdir|rd|mv|move|cp|copy|tee|truncate|checkout|restore|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item)\b|\bsed\s+-i|>|\bnode\s+-e|\bpython\d?\s+-c))/i, 'Kural veya koruma dosyası kabuk komutuyla değiştiriliyor'],
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
  /\b(vercel|vc)\b.*\b(prod|production|promote|rollback)\b/, /\b(vercel|vc)\b.*\bpull\b/, /\b(drop|truncate)\b/, /\breset\b.*\bhard\b/,
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
  if (PROD_SIRRI.test(k)) {
    return { karar: 'deny', neden: 'Prod ortam değişkenleri (sırlar) bu makineye çekiliyor. Yerel ortam ve AI sadece dev projesine bağlanır; prod değerleri barındırma panelinde kalır. Gerekliyse kullanıcı kendisi çalıştırır.' };
  }
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
  if (testYazimi(k)) {
    return { karar: 'ask', neden: 'Test dosyası kabuk komutuyla değiştiriliyor, taşınıyor veya siliniyor. Testi geçirmek için testi zayıflatmak yasak (AGENTS.md kural 7); test düzenlemesini dosya aracıyla yap. Kullanıcı onayı gerekli.' };
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const g = girdiOku();
  // İki listeden sıkı olan kazanır (deny > ask)
  const sonuclar = g ? [degerlendir(g.komut), g.arac !== 'claude' ? izinKarsiligi(g.komut) : null, kapsamSorunu(g.komut, g.dizin, g.kok)].filter(Boolean) : [];
  const s = sonuclar.find((x) => x.karar === 'deny') ?? sonuclar[0];
  if (s) kararVer(g.arac, s.karar, `Kalkan: ${s.neden}`);
  process.exit(0);
}
