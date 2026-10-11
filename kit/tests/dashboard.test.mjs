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
