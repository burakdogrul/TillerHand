#!/usr/bin/env node
// Çalışan noktalar ve güvenli geri dönüş (/rollback). Git bilmeyen kullanıcı için:
//   node .claude/hooks/checkpoint.mjs --save "G-012 bitti, testler yeşil"   şu anki commit'i "çalışan nokta" olarak etiketle
//   node .claude/hooks/checkpoint.mjs --list [--json]                        çalışan noktalar + son commit'ler
//   node .claude/hooks/checkpoint.mjs --restore <etiket|commit> --evet       o hale dön
// Geri dönüş geçmişi silmez: kaydedilmemiş iş önce stash'e alınır, dosyalar hedef hale getirilir ve
// YENİ bir commit atılır. Bu yüzden geri dönüş de geri alınabilir. reset --hard kullanılmaz.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ONEK = 'calisan/';

export function git(kok, ...arg) {
  return execFileSync('git', arg, { cwd: kok, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const zamanDamgasi = (d = new Date()) => d.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

export function kaydet(kok, not = '') {
  if (git(kok, 'status', '--porcelain')) throw new Error('Kaydedilmemiş değişiklik var; çalışan nokta sadece commit edilmiş hale konur. Önce commit et.');
  const etiket = `${ONEK}${zamanDamgasi()}`;
  git(kok, 'tag', '-a', etiket, '-m', not || 'çalışan nokta');
  return etiket;
}

export function listele(kok, n = 10) {
  const noktalar = git(kok, 'for-each-ref', '--sort=-creatordate', `--count=${n}`, '--format=%(refname:short)%09%(creatordate:short)%09%(contents:subject)%09%(*objectname:short)', `refs/tags/${ONEK}`)
    .split('\n').filter(Boolean).map((s) => { const [etiket, tarih, not, commit] = s.split('\t'); return { etiket, tarih, not, commit }; });
  const commitler = git(kok, 'log', `-${n}`, '--format=%h%x09%ad%x09%s', '--date=format:%Y-%m-%d %H:%M')
    .split('\n').filter(Boolean).map((s) => { const [commit, tarih, mesaj] = s.split('\t'); return { commit, tarih, mesaj }; });
  return { noktalar, commitler };
}

export function geriDon(kok, hedef) {
  const sha = git(kok, 'rev-parse', '--verify', `${hedef}^{commit}`);
  const kisa = sha.slice(0, 7);
  let saklanan = null;
  if (git(kok, 'status', '--porcelain')) {
    saklanan = `geri-alma öncesi ${new Date().toISOString().slice(0, 16)}`;
    git(kok, 'stash', 'push', '--include-untracked', '-m', saklanan);
  }
  // Takip edilen dosyalar hedef haline gelir; hedefte olmayanlar silinir. .gitignore'daki dosyalar (.env) dokunulmaz.
  git(kok, 'restore', `--source=${sha}`, '--staged', '--worktree', '--', '.');
  if (!git(kok, 'status', '--porcelain')) return { degisti: false, saklanan, hedef: kisa };
  git(kok, 'commit', '-m', `revert: ${hedef} (${kisa}) haline dönüldü`);
  return { degisti: true, saklanan, hedef: kisa, yeni: git(kok, 'rev-parse', '--short', 'HEAD') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const kok = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const arg = process.argv.slice(2);
  // Modu SADECE ilk argüman belirler: izin listesi önekle eşleşir ("--list:*", "--save:*"),
  // sonraya eklenen "--restore ... --evet" onaysız geri dönüşe yol açmasın.
  const mod = arg[0];
  try {
    if (mod === '--save') {
      console.log(`Çalışan nokta kaydedildi: ${kaydet(kok, arg[1] ?? '')}`);
    } else if (mod === '--restore') {
      const hedef = arg[1];
      if (!hedef || hedef.startsWith('--') || arg[2] !== '--evet') {
        console.error('Geri dönüş onay ister: node .claude/hooks/checkpoint.mjs --restore <etiket|commit> --evet');
        process.exit(1);
      }
      const r = geriDon(kok, hedef);
      if (r.saklanan) console.log(`Kaydedilmemiş işin saklandı: "${r.saklanan}" (geri getirmek: git stash pop)`);
      console.log(r.degisti ? `${r.hedef} haline dönüldü, yeni commit: ${r.yeni}. Bunu da geri almak için: /rollback ile bir önceki commit'i seç.` : `Dosyalar zaten ${r.hedef} ile aynı; değişiklik yok.`);
    } else {
      const { noktalar, commitler } = listele(kok);
      if (arg.includes('--json')) { console.log(JSON.stringify({ noktalar, commitler })); process.exit(0); }
      console.log('Çalışan noktalar:');
      console.log(noktalar.length ? noktalar.map((p) => `  ${p.etiket}  ${p.tarih}  ${p.not}`).join('\n') : '  (yok; /build ve /wrap-up testler yeşilken kaydeder)');
      console.log('Son commit\'ler:');
      console.log(commitler.map((c) => `  ${c.commit}  ${c.tarih}  ${c.mesaj}`).join('\n'));
    }
  } catch (h) {
    console.error((h.stderr || h.message).toString().trim().split('\n')[0]);
    process.exit(1);
  }
}
