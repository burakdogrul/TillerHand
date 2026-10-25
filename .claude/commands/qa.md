---
description: Arayüz kabul kriterlerini gerçek tarayıcıda Playwright testi olarak yürütür; raporu test sonucundan yazar.
argument-hint: [kriter kimlikleri (Ö-01.1 Ö-02.3), boşsa PRD'deki arayüz kriterleri]
---

Kapsam: $ARGUMENTS

`/qa` "çalışıyor" iddiasını kanıta bağlar. Her kriter gerçek tarayıcıda koşan bir Playwright testidir ve rapor test sonucundan üretilir. Mobil projede bu komut yerine Maestro akışlarını (`.maestro/`) çalıştır. Arayüzü olmayan projede kabul testleri yeterlidir.

1. **Kriterleri seç.** `docs/product/prd.md`'deki kimlikli kriterlerden (`Ö-01.1`) kullanıcının ekranda gördüğü davranışı anlatanları al. Argüman verildiyse sadece onları al. Listeyi bana tek satırla söyle.
2. **Hazırlık.** Testler yalnız yerel uygulamaya gider: `playwright.config.*`'teki `baseURL` ve `webServer.url` localhost, 127.0.0.1 veya [::1] değilse dur ve bana sor (veri yazan testler başka bir ortama gitmesin). `webServer` yoksa ekle: `command` = `AGENTS.md` → `geliştirme:`, `url` = `önizleme:`, `reuseExistingServer: true`. Eklediğin komutu ve adresi bana göster: `npx playwright test` bu komutu çalıştıracak.
3. **Her kriter bir test.**
   - Kriterin `tests/e2e/`'de kalıcı testi varsa (`tests/e2e/qa/` dışında) onu kullan, yeniden yazma.
   - Yoksa `tests/e2e/qa/<kimlik>.spec.ts` yaz (bu klasör git'e girmez; önceki `/qa`'dan kalan test varsa güncelle). Test adı kimlikle başlar: `test('Ö-01.2 Kayıt listede görünür', ...)`. Kullanıcının yaptığını yap (tıkla, doldur) ve sonucu ekranda ara. Uygulama koduna veya veritabanına doğrudan dokunma.
   - Her yeni test dosyasının başına bu kalıbı koy. Ekran görüntüsü test kalsa da alınır, konsol hatası testi kırmızı yapar:
     ```ts
     let errors: string[] = [];
     test.beforeEach(({ page }) => {
       errors = [];
       page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
       page.on('pageerror', (e) => errors.push(e.message));
     });
     test.afterEach(async ({ page }, info) => {
       await page.screenshot({ path: `test-results-qa/shots/${info.title.split(' ')[0]}.png`, fullPage: true });
       expect(errors, `konsol hatası: ${errors[0] ?? ''}`).toEqual([]);
     });
     ```
4. **Çalıştır:** seçili bütün test dosyalarını her seferinde tek komutta koş:
   `PLAYWRIGHT_JUNIT_OUTPUT_NAME=test-results-qa/junit.xml npx playwright test <dosyalar> --output=test-results-qa --reporter=list,junit`.
   Ayrı çıktı klasörü şart: Playwright çıktı klasörünü her koşuda boşaltır, `test-results/`'taki kabul raporu silinmesin. Uygulamadaki hatayı burada düzeltme: `/qa` ölçer, düzeltmek `/fix-bug`'ın işidir. Hata testin kendisindeyse (yanlış seçici, yanlış adres) testi düzelt, bütün dosyaları yeniden koş ve bunu raporda söyle.
5. **Rapor:** `node .claude/hooks/qa-report.mjs` → `docs/quality/qa/<tarih>.md`, kanıt `.previews/qa-<tarih>/`. Raporu elle değiştirme. Betik "rapor yazılmadı" derse nedenini bana söyle; hiçbir test koşmadıysa sonuç "geçti" değildir. Kalan kriterleri ekran görüntüsü ve nedeniyle göster, her biri için `/fix-bug` öner.
6. **Yeni testler:** `tests/e2e/qa/`'de geçen test varsa AskUserQuestion ile sor: "Geçen N testi kalıcı kabul testi olarak `tests/e2e/`'ye taşıyayım mı?" Evet derse taşı. Hayır derse klasörde kalır; bir sonraki `/qa` onları yeniden kullanır.
7. Durum bloğu.
