---
description: Yol haritasındaki sıradaki (veya verilen) görevi uygular, test eder, işaretler.
argument-hint: [görev kodu, boşsa sıradaki görev]
---

Görev: $ARGUMENTS
Boşsa `docs/ILERLEME.md` → "Sıradaki adım" veya `docs/YOL-HARITASI.md`'deki ilk işaretsiz görevi al.

1. Görevi ve kabul kriterlerini bana tek cümleyle tekrar et.
2. Bu görev için onaylanmış bir plan yoksa ve 2'den fazla dosyaya dokunacaksa önce kısa plan yaz, onay bekle.
3. Uygula. Kurallar:
   - Sadece bu görevin kapsamı. Görev dışı sorunları düzeltme, `docs/ILERLEME.md` → "Açık sorunlar"a yaz.
   - Projedeki mevcut kalıpları kullan.
   - Hata, boş ve yükleniyor durumlarını unutma.
   - Kritik akışa dokunuyorsan (`docs/TEST-PLANI.md`) test ekle.
   - Yeni ortam değişkeni → `.env.example`.
4. Doğrula: lint, tip kontrolü, ilgili testler. Kırmızı varsa düzelt. Aynı hatada 2 denemede çözemezsen dur ve bana durumu anlat.
5. **Kanıt üret.** "Çalışıyor olmalı" yetmez; çalıştığını göster. Yöntem `docs/STACK.md` → "Doğrulama" bölümünde:
   - Arayüz değişikliği → uygulamayı çalıştır, ilgili ekranı aç, ana senaryoyu ve bir hata senaryosunu dene, ekran görüntüsü al.
   - API/iş mantığı → gerçek istek at veya testi çalıştır; isteği ve yanıtı göster.
   - Kanıt üretemiyorsan (cihaz, panel, ödeme gibi) bunu açıkça söyle ve benim yapmam gereken adımları yaz.
6. `CLAUDE.md` → "Bitti tanımı" listesini tek tek kontrol et.
7. `docs/YOL-HARITASI.md`'de görevi işaretle.
8. Rapor ver:
   - Ne yapıldı (2-3 satır)
   - Kanıt (ekran görüntüsü, istek/yanıt, test çıktısı)
   - Benim nasıl test edeceğim (adım adım)
   - Önerilen commit mesajı
   - Kontrol edemediğin veya şüpheli olduğun yerler
