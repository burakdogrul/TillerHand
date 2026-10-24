#!/usr/bin/env node
// Test koruması: AI testi geçirmek için testi zayıflatmasın (AGENTS.md kural 7).
//   PreToolUse (Write|Edit|MultiEdit, Codex apply_patch, Antigravity yazma araçları) hook'u. Test dosyasında
//   beklenti (expect/assert) sayısı azalıyorsa, .skip/.only/xit/@pytest.mark.skip ekleniyorsa, zayıf beklenti
//   (toBeTruthy, toBeDefined, expect.anything, assert True) artıyorsa veya test dosyası siliniyorsa kullanıcıya sorar (ask).
//   Yoruma alınan beklenti silinmiş sayılır. Engellemez: gerekçeli değişikliği kullanıcı onaylar.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { girdiOku, kararVer } from './arac.mjs';

const TEST = /(^|\/)(tests?|__tests__|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.py$/i;
export const testDosyasi = (yol) => TEST.test(yol.replace(/\\/g, '/'));

const ATLAMA = /\.\s*(skip|only|fixme)\b|\b(xit|xtest|xdescribe|fit|fdescribe)\s*\(|@pytest\.mark\.(skip|skipif|xfail)\b|\bpytest\.(skip|xfail)\s*\(|@unittest\.skip/g;
const BEKLENTI = /\bexpect\s*\(|\bassert\w*|\.should\b/g;
const ZAYIF = /\.\s*(toBeTruthy|toBeDefined|toBeFalsy)\s*\(|\bexpect\.anything\s*\(|\bassert\s+True\b/g;

// Yorumlar sayılmaz: /* */, satır başında veya boşluktan sonra gelen // ve # (URL'deki // korunur)
const yorumsuz = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)(\/\/|#(?![!\w{[]))[^\n]*/g, '$1');
const say = (s, re) => (yorumsuz(s).match(re) ?? []).length;

// Döndürür: null (sorun yok) | zayıflatmanın açıklaması
export function zayiflatma(once, sonra) {
  if (say(sonra, ATLAMA) > say(once, ATLAMA)) return 'test atlanıyor veya tek teste odaklanıyor (.skip / .only / xit / pytest skip)';
  if (say(sonra, BEKLENTI) < say(once, BEKLENTI)) return 'beklenti (expect/assert) siliniyor veya yoruma alınıyor';
  if (say(sonra, ZAYIF) > say(once, ZAYIF)) return 'beklenti gevşetiliyor (toBeTruthy, toBeDefined, expect.anything, assert True)';
  return null;
}

function hook() {
  const g = girdiOku();
  if (!g) process.exit(0);
  const adBul = (yol) => {
    const tam = path.resolve(g.dizin, yol);
    const rel = path.relative(g.kok, tam);
    return [tam, rel.startsWith('..') || path.isAbsolute(rel) ? tam : rel];
  };
  for (const d of g.dosyalar) {
    const [tam, ad] = adBul(d.yol);
    // Codex Move: test, test olmayan yola taşınırsa test silinmiş olur
    const tasima = d.kaynak && testDosyasi(adBul(d.kaynak)[1]) && !testDosyasi(ad);
    if (!d.yol || (!tasima && !testDosyasi(ad))) continue;
    let once = d.once;
    if (once === undefined) { try { once = fs.readFileSync(tam, 'utf8'); } catch { once = ''; } }
    const neden = d.sil ? 'test dosyası siliniyor' : tasima ? `test dosyası test olmayan yola taşınıyor (${d.kaynak})` : zayiflatma(once, d.sonra ?? d.metin);
    if (neden) {
      kararVer(g.arac, 'ask', `Test koruması: ${ad.split(path.sep).join('/')} içinde ${neden}. Testi geçirmek için testi zayıflatmak yasak (AGENTS.md kural 7). ` +
        'Gerekçe gerçekse (yanlış test, değişen kabul kriteri) kullanıcıya söyle ve onayını al; değilse kodu düzelt.');
    }
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) hook();
