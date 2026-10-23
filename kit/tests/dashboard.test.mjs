// Çalıştır: node --test "kit/tests/*.test.mjs"
// DURUM panosunun veri kaynakları: kabul testleri, hesaplar, bayraklar, birim ekonomisi, geri bildirim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prdKriterleri, junitSonuclari, kabulDurumu, hesaplar, bayraklar, birimEkonomisi, geriBildirim, kalanGun } from '../../.claude/hooks/dashboard-data.mjs';

test('kabul: PRD kriterleri kimlikle okunur, şablon satırları atlanır', () => {
  const prd = '- [x] Ö-01.1: Zorunlu alan boşsa kaydedilmez\n- [ ] Ö-01.2: PDF indirilir\n- [ ] Ö-02.1: [Gözlemlenebilir davranış]\n- [ ] kimliksiz madde';
  assert.deepEqual(prdKriterleri(prd).map((k) => [k.id, k.anahtar, k.isaretli]), [['Ö-01.1', 'O_01_1', true], ['Ö-01.2', 'O_01_2', false]]);
});

test('kabul: JUnit sonuçları Ö ve O_ biçimlerini eşler, başarısızlık kazanır', () => {
  const xml = `<testsuite>
    <testcase name="Ö-01.1 zorunlu alan" classname="form"/>
    <testcase name="test_O_01_2_pdf" classname="tests.test_fatura"><failure message="x"/></testcase>
    <testcase name="Ö-01.2 pdf ikinci" classname="e2e"></testcase>
    <testcase name="Ö-03.1 atlandı"><skipped/></testcase>
  </testsuite>`;
  const s = junitSonuclari([xml]);
  assert.equal(s.get('O_01_1'), 'gecti');
  assert.equal(s.get('O_01_2'), 'kaldi');
  assert.equal(s.has('O_03_1'), false);
});

test('kabul: proje taraması test dosyası, rapor ve uyumsuzluk', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'kabul-'));
  fs.mkdirSync(path.join(p, 'docs/product'), { recursive: true }); fs.mkdirSync(path.join(p, 'tests')); fs.mkdirSync(path.join(p, 'test-results'));
  fs.writeFileSync(path.join(p, 'docs/product/prd.md'), '- [x] Ö-01.1: a\n- [x] Ö-01.2: b\n- [ ] Ö-02.1: c\n');
  fs.writeFileSync(path.join(p, 'tests/fatura.spec.ts'), "test('Ö-01.1 a', () => {}); test('Ö-02.1 c', () => {});");
  fs.writeFileSync(path.join(p, 'test-results/junit.xml'), '<testcase name="Ö-01.1 a"/>');
  const k = kabulDurumu(p);
  assert.equal(k.toplam, 3);
  assert.equal(k.testli, 2);
  assert.equal(k.gecen, 1);
  assert.deepEqual(k.uyumsuz.map((x) => x.id), ['Ö-01.2'], 'işaretli ama testi yok');
  fs.rmSync(p, { recursive: true, force: true });
});

test('hesaplar ve bayraklar: tarih hesabı, 2FA, gecikme', () => {
  const simdi = Date.parse('2026-10-11T12:00:00');
  assert.equal(kalanGun('2026-10-21', simdi), 10);
  const h = hesaplar(`## Hesaplar\n\n| Servis | Amaç | Sahip | 2FA | Plan | Bitiş | Anahtar | Not |\n|---|---|---|---|---|---|---|---|\n| [GitHub] | Kod | | | | - | - | |\n| Alan adı | site | ben | hayır | 300 TL/yıl | 2026-10-21 | - | |\n`, simdi);
  assert.equal(h.length, 1, 'şablon satırı atlanır');
  assert.equal(h[0].ikiFaYok, true);
  assert.equal(h[0].tarihler[0].kalan, 10);
  const b = bayraklar(`## Bayraklar\n\n| Bayrak | Amaç | Durum | Sahibi | Eklendi | Kaldırma | Test |\n|---|---|---|---|---|---|---|\n| yeni_odeme | ödeme | açık | ben | 2026-09-01 | 2026-10-01 | evet |\n`, simdi);
  assert.equal(b[0].gecikti, true);
  assert.equal(b[0].testsiz, false);
});

test('birim ekonomisi: katkı, başa baş, ücretsiz kullanıcı payı', () => {
  const metin = '**Para birimi:** TL\n**Fiyat (kullanıcı başı aylık):** 200\n**Ödeme komisyonu (%):** 5\n**Sabit aylık maliyet:** 1500\n**Kullanıcı başı değişken maliyet (aylık):** 20\n**Hedef aktif kullanıcı:** 100\n**Ücretsiz kullanıcı oranı (%):** 50';
  const e = birimEkonomisi(metin);
  assert.equal(e.katki, 200 * 0.95 - 20); // 170
  assert.equal(e.etkinKatki, 170 - 20); // her ödeyen bir ücretsiz kullanıcıyı taşır
  assert.equal(e.basaBas, Math.ceil(1500 / 150));
  assert.equal(Math.round(e.kar), Math.round(50 * 190 - (1500 + 100 * 20)));
  assert.equal(birimEkonomisi('**Fiyat (kullanıcı başı aylık):** 0'), null, 'boş girdi');
});

test('geri bildirim: yeni sayısı ve tema sıralaması', () => {
  const g = geriBildirim(`## Gelen kutusu\n\n| # | Tarih | Kaynak | Kullanıcı | Özet | Tür | Tema | Öncelik | Durum | Görev |\n|---|---|---|---|---|---|---|---|---|---|\n| 1 | 2026-10-01 | e-posta | K-001 | PDF yok | istek | PDF | yüksek | yeni | |\n| 2 | 2026-10-02 | form | K-002 | yavaş | şikayet | hız | orta | planlandı | G-030 |\n\n## Temalar\n\n| Tema | Sayı | Özellik | Karar |\n|---|---|---|---|\n| hız | 2 | liste | |\n| PDF | 5 | fatura | |\n`);
  assert.equal(g.yeni, 1);
  assert.deepEqual(g.temalar.map((t) => t.tema), ['PDF', 'hız']);
});

test('bulgu raporları: son rapor tür başına, sayılar ayrıştırılır', async () => {
  const { bulguRaporlari } = await import('../../.claude/hooks/dashboard-data.mjs');
  const r = bulguRaporlari(`## Raporlar\n\n| Tarih | Tür | Sağlık | Önceki | Bulgu | Kritik | Rapor |\n|---|---|---|---|---|---|---|\n| 2026-10-01 | tech | 61 | - | 14 | 2 | [rapor](tech/2026-10-01.md) |\n| 2026-10-11 | tech | 74 | 61 | 9 | 0 | [rapor](tech/2026-10-11.md) |\n| 2026-10-11 | business | 58/100 | - | 12 | 1 | x |\n`);
  assert.equal(r.satirlar.length, 3);
  assert.equal(r.son.tech.saglik, 74);
  assert.equal(r.son.tech.onceki, 61);
  assert.equal(r.son.business.saglik, 58);
  assert.equal(r.son.business.kritik, 1);
});

test('üretim varlıkları: marka paketi, video çıktısı, araştırma başlığı', async () => {
  const { uretimVarliklari } = await import('../../.claude/hooks/dashboard-data.mjs');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'varlik-'));
  assert.deepEqual(uretimVarliklari(p), { markaKlasor: null, marka: [], markaRehberi: false, videolar: [], arastirma: [], kodHaritasiGun: null });
  for (const k of ['assets/brand', 'marketing/motion/demo/out', 'marketing/motion/taslak', 'docs/research', 'docs/design']) fs.mkdirSync(path.join(p, k), { recursive: true });
  fs.writeFileSync(path.join(p, 'assets/brand/logo.svg'), '<svg/>');
  fs.writeFileSync(path.join(p, 'docs/design/brand.md'), '# Marka');
  fs.writeFileSync(path.join(p, 'marketing/motion/demo/out/demo.mp4'), '');
  fs.writeFileSync(path.join(p, 'docs/research/2026-10-01-odeme.md'), '# Ödeme sağlayıcıları\n');
  fs.writeFileSync(path.join(p, 'docs/research/2026-10-05-kvkk.md'), 'başlıksız');
  const v = uretimVarliklari(p);
  assert.equal(v.markaKlasor, 'assets/brand');
  assert.deepEqual(v.marka, ['logo.svg']);
  assert.equal(v.markaRehberi, true);
  assert.deepEqual(v.videolar, [{ ad: 'demo', mp4: 'marketing/motion/demo/out/demo.mp4' }, { ad: 'taslak', mp4: null }]);
  assert.deepEqual(v.arastirma.map((r) => r.baslik), ['2026-10-05-kvkk', 'Ödeme sağlayıcıları']);
  // Understand-Anything grafı: yaşı gün olarak (otomatik güncelleme kapalı, eskiyince panoda ipucu)
  fs.mkdirSync(path.join(p, '.ua'));
  const graf = path.join(p, '.ua/knowledge-graph.json');
  fs.writeFileSync(graf, '{}');
  const kirkGunOnce = new Date(Date.now() - 40 * 864e5);
  fs.utimesSync(graf, kirkGunOnce, kirkGunOnce);
  assert.equal(uretimVarliklari(p).kodHaritasiGun, 40);
});

test('maliyet: ccusage proje adı ve günlük özet (date/period alanları)', async () => {
  const { ccusageProjeAdi, maliyetOzeti } = await import('../../.claude/hooks/dashboard-data.mjs');
  if (process.platform === 'win32') assert.equal(ccusageProjeAdi(String.raw`D:\Claude Projeler\Vibe_Kit`), 'D--Claude-Projeler-Vibe-Kit');
  else assert.equal(ccusageProjeAdi('/home/a/my.app'), '-home-a-my-app');
  const o = maliyetOzeti({ projects: { x: [{ date: '2026-10-11', totalTokens: 2e6, totalCost: 3 }, { date: '2026-10-09', totalTokens: 1e6, totalCost: 1.5 }] }, totals: {} });
  assert.deepEqual(o.gunler.map((g) => g.tarih), ['2026-10-09', '2026-10-11']);
  assert.deepEqual(o.toplam, { token: 3e6, maliyet: 4.5 });
  assert.equal(maliyetOzeti({ daily: [{ period: '2026-10-01', totalTokens: 5, totalCost: 0 }] }).gunler[0].tarih, '2026-10-01');
  assert.deepEqual(maliyetOzeti(null), { gunler: [], toplam: { token: 0, maliyet: 0 } });
});

test('harcama alarmları: tutarsız satır ayarlanmadı, eski kontrol işaretlenir', async () => {
  const { harcamaAlarmlari } = await import('../../.claude/hooks/dashboard-data.mjs');
  const simdi = Date.parse('2026-10-12T12:00:00');
  const a = harcamaAlarmlari(`## Alarmlar\n\n| Servis | Tür | Tutar | Uyarı eşikleri | Nereden ayarlandı | Son kontrol |\n|---|---|---|---|---|---|\n| Anthropic | tavan | 50 USD | %50, %80 | Console | 2026-10-10 |\n| Vercel | uyarı | - | | | 2026-08-01 |\n`, simdi);
  assert.equal(a.length, 2);
  assert.equal(a[0].ayarsiz, false);
  assert.equal(a[0].eski, false);
  assert.equal(a[1].ayarsiz, true);
  assert.equal(a[1].eski, true);
});
