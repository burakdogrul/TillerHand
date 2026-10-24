#!/usr/bin/env node
// Test koruması: AI testi geçirmek için testi zayıflatmasın (AGENTS.md kural 7).
//   PreToolUse (Write|Edit|MultiEdit, Codex apply_patch, Antigravity yazma araçları) hook'u. Test dosyasında
//   beklenti (expect/assert) sayısı azalıyorsa, .skip/.only/xit/@pytest.mark.skip ekleniyorsa, zayıf beklenti
//   (toBeTruthy, toBeDefined, expect.anything, matcher'sız expect, assert True) artıyorsa veya test dosyası siliniyorsa
//   kullanıcıya sorar (ask). Test ayar dosyasında (vitest/jest/playwright config, conftest.py, package.json test
//   script'i) kapsamı daraltabilecek alan değişince de sorar. Yoruma alınan beklenti silinmiş sayılır.
//   Engellemez: gerekçeli değişikliği kullanıcı onaylar.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { girdiOku, kararVer } from './arac.mjs';

const TEST = /(^|\/)(tests?|__tests__|e2e|spec)\/|\.(test|spec|e2e-spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.(py|go)$/i;
export const testDosyasi = (yol) => TEST.test(yol.replace(/\\/g, '/'));
// Test koşucusunun adından tanıdığı dosya (klasörü test olsa da adı uymayan dosya çalışmaz)
const TEST_ADI = /\.(test|spec|e2e-spec)\.[cm]?[jt]sx?$|^test_[^/]*\.py$|_test\.(py|go)$/i;

const AYAR = /(^|\/)((vitest|vite|jest|playwright|cypress)(\.[\w-]+)?\.config\.([cm]?[jt]s|json)|vitest\.workspace\.[cm]?[jt]s|\.mocharc\.\w+|conftest\.py|noxfile\.py|pytest\.ini|tox\.ini|setup\.cfg|pyproject\.toml|package\.json)$/i;
export const ayarDosyasi = (yol) => AYAR.test(yol.replace(/\\/g, '/'));
// Hangi testin çalışacağını veya başarısızlığın sayılıp sayılmayacağını belirleyen alanlar (kullanıcı kararı 2026-10-24)
const RISKLI = /\b(include|exclude|testMatch|testRegex|testPathIgnorePatterns|testIgnore|testDir|testpaths|roots|passWithNoTests|bail|retries|thresholds?|coverageThreshold|grep|grepInvert|addopts|collect_ignore\w*|python_files|norecursedirs|pytest_collection_modifyitems|pytest_runtest_\w+|skip\w*|only|forbidOnly|setupFiles|globalSetup|lines|branches|functions|statements|fail_under|cov-fail-under)\b|"(test|e2e|ci)[\w:.-]*"\s*:/i;

const ATLAMA = /\.\s*(skip|only|fixme|skipIf|runIf)\b|(?<!\.\s*)\b(xit|xtest|xdescribe|fit|fdescribe)\s*\(|@pytest\.mark\.(skip|skipif|xfail)\b|\bpytest\.(skip|xfail)\s*\(|@unittest\.skip/g;
const BEKLENTI = /\bexpect\s*\(|\bassert\w*|\.should\b/g;
// Matcher'sız expect: expect(x) ardından . gelmiyorsa hiçbir şey denetlemez (iç içe bir parantez düzeyine kadar).
// Önünde . olan expect (supertest .expect(200)) kendisi denetimdir.
const ZAYIF = /\.\s*(toBeTruthy|toBeDefined|toBeFalsy)\s*\(|\bexpect\.anything\s*\(|(?<![.\w])expect\s*\((?:[^()]|\([^()]*\))*\)(?!\s*[.(])|\bassert\s+True\b/g;

// Yorumlar sayılmaz: /* */, // (URL'deki :// hariç) ve satır başında veya boşluktan sonra gelen # (#!, #{, #[ hariç)
const yorumsuz = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1').replace(/(^|\s)#(?![!{[])[^\n]*/g, '$1');
const say = (s, re) => (yorumsuz(s).match(re) ?? []).length;

// Döndürür: null (sorun yok) | zayıflatmanın açıklaması
export function zayiflatma(once, sonra) {
  if (say(sonra, ATLAMA) > say(once, ATLAMA)) return 'test atlanıyor veya tek teste odaklanıyor (.skip / .only / skipIf / xit / pytest skip)';
  if (say(sonra, BEKLENTI) < say(once, BEKLENTI)) return 'beklenti (expect/assert) siliniyor veya yoruma alınıyor';
  if (say(sonra, ZAYIF) > say(once, ZAYIF)) return 'beklenti gevşetiliyor (toBeTruthy, toBeDefined, expect.anything, matcher\'sız expect, assert True)';
  return null;
}

// Ayar dosyasında yalnız eklenen veya çıkan satırlara bakılır
export function ayarRiski(once, sonra) {
  const a = new Set(once.split('\n')), b = new Set(sonra.split('\n'));
  const degisen = [...a].filter((s) => !b.has(s)).concat([...b].filter((s) => !a.has(s)));
  return degisen.some((s) => RISKLI.test(s)) ? 'testlerin kapsamını belirleyen ayar değişiyor (include/exclude, testMatch, passWithNoTests, eşik, test script\'i)' : null;
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
    if (!d.yol) continue;
    const [tam, ad] = adBul(d.yol);
    const kaynak = d.kaynak && testDosyasi(adBul(d.kaynak)[1]) ? adBul(d.kaynak)[1] : null;
    const ayar = ayarDosyasi(ad);
    if (!kaynak && !ayar && !testDosyasi(ad)) continue;
    let once = d.once;
    if (once === undefined) { try { once = fs.readFileSync(tam, 'utf8'); } catch { once = ''; } }
    const sonra = d.sonra ?? d.metin;
    let neden;
    if (d.sil) neden = ayar ? 'test ayar dosyası siliniyor' : 'test dosyası siliniyor';
    // Codex Move: çalışmayan bir yola taşınan test silinmiş olur; var olan dosyanın üstüne taşıma onu ezer
    else if (kaynak && (!testDosyasi(ad) || (TEST_ADI.test(path.basename(kaynak)) && !TEST_ADI.test(path.basename(ad))))) neden = `test dosyası çalışmayan bir yola taşınıyor (${d.kaynak})`;
    else if (d.kaynak && fs.existsSync(tam)) neden = `taşıma var olan dosyanın üstüne yazıyor (${d.kaynak} → ${d.yol})`;
    else neden = ayar ? ayarRiski(once, sonra) : zayiflatma(once, sonra);
    if (neden) {
      kararVer(g.arac, 'ask', `Test koruması: ${ad.split(path.sep).join('/')} içinde ${neden}. Testi geçirmek için testi zayıflatmak yasak (AGENTS.md kural 7). ` +
        'Gerekçe gerçekse (yanlış test, değişen kabul kriteri) kullanıcıya söyle ve onayını al; değilse kodu düzelt.');
    }
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) hook();
