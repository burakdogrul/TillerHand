#!/usr/bin/env node
// Karmaşıklık bütçesi: AI kodu büyüdükçe fonksiyonlar uzar ve dallanır; bütçe aşılınca CI kırmızı olur.
//   node .claude/hooks/budget.mjs --check [--base <commit>]
//   Sadece base'ten bu yana değişen kod dosyaları ölçülür (base yoksa veya sıfırsa tüm depo). Böylece kite alınan
//   eski kod dokunulana kadar engellemez. Test, migration, üretilmiş dosyalar ve kit dosyaları hariç.
//   Fonksiyon karmaşıklığı ve uzunluğu lizard ile (CI'da pipx run, sabit sürüm), dosya uzunluğu bu betikle ölçülür.
//   LIZARD=<çalıştırılabilir dosya> verilirse pipx yerine o kullanılır (yerelde kurulu lizard).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { testDosyasi } from './test-guard.mjs';

export const BUTCE = { karmasiklik: 15, fonksiyon: 80, dosya: 400 };
const LIZARD = ['pipx', 'run', 'lizard==1.24.1'];
const KOD = /\.(m?[jt]sx?|cjs|py)$/i;
const HARIC = /(^|\/)(node_modules|dist|build|out|\.next|\.expo|coverage|vendor|\.venv|migrations|alembic|\.claude|\.codex|\.agents)\/|\.d\.ts$|\.(gen|generated|min)\.[cm]?[jt]sx?$/i;

export const secilenler = (dosyalar) => dosyalar.filter((f) => KOD.test(f) && !HARIC.test(f) && !testDosyasi(f));

export function uzunDosyalar(kok, dosyalar) {
  return dosyalar
    .map((dosya) => {
      const s = fs.readFileSync(path.join(kok, dosya), 'utf8');
      return { dosya, satir: s.split('\n').length - (s.endsWith('\n') ? 1 : 0) };
    })
    .filter(({ satir }) => satir > BUTCE.dosya);
}

export const lizardArgumanlari = (dosyalar) => ['-C', String(BUTCE.karmasiklik), '-L', String(BUTCE.fonksiyon), '-w', ...dosyalar];

export function degisenler(kok, base) {
  const git = (...a) => execFileSync('git', a, { cwd: kok, encoding: 'utf8' }).split('\n').filter(Boolean);
  let liste;
  // base bilinmiyorsa (yeni dal, force-push sonrası klonda olmayan commit) tüm depo ölçülür
  try { liste = !base || /^0+$/.test(base) ? git('ls-files') : git('diff', '--name-only', '--diff-filter=AMR', base, 'HEAD'); }
  catch { console.warn(`base (${base}) bulunamadı; tüm depo ölçülüyor.`); liste = git('ls-files'); }
  return liste.filter((f) => fs.existsSync(path.join(kok, f)));
}

function kontrol() {
  const kok = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const i = process.argv.indexOf('--base');
  const dosyalar = secilenler(degisenler(kok, i > 0 ? process.argv[i + 1] : ''));
  if (!dosyalar.length) { console.log('Karmaşıklık bütçesi: değişen kod dosyası yok.'); return; }
  let hata = false;
  for (const { dosya, satir } of uzunDosyalar(kok, dosyalar)) {
    console.error(`${dosya}: ${satir} satır (bütçe ${BUTCE.dosya}). Dosyayı sorumluluklarına göre böl.`);
    hata = true;
  }
  const [komut, ...onEk] = process.env.LIZARD ? [process.env.LIZARD] : LIZARD;
  const r = spawnSync(komut, [...onEk, ...lizardArgumanlari(dosyalar)], { cwd: kok, stdio: 'inherit' });
  if (r.error) { console.error(`lizard çalıştırılamadı (${komut}): ${r.error.code}. CI'da pipx hazır gelir; yerelde: pip install lizard==1.24.1, sonra LIZARD=lizard.`); hata = true; }
  else if (r.status !== 0) { console.error(`Fonksiyon bütçesi aşıldı (karmaşıklık ${BUTCE.karmasiklik}, uzunluk ${BUTCE.fonksiyon} satır). Fonksiyonu küçük parçalara böl.`); hata = true; }
  if (hata) process.exit(1);
  console.log(`Karmaşıklık bütçesi uygun: ${dosyalar.length} dosya.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--check')) kontrol();
  else { console.error('Kullanım: node .claude/hooks/budget.mjs --check [--base <commit>]'); process.exit(1); }
}
