---
description: Hatayı kök nedeniyle bulur, regresyon testi yazar, sonra düzeltir.
argument-hint: [hata açıklaması, hata mesajı veya adımlar]
---

Hata: $ARGUMENTS

`mattpocock-skills:diagnosing-bugs` skill'ini yükle ve onun döngüsünü uygula. Düzeltme sırasında `ponytail:ponytail` (en küçük tam düzeltme). Belirtiyi yamamak yasak. Sırayla:

1. **Yeniden üret.** Hatayı tetikleyen en kısa adımları bul. Üretemiyorsan dur ve benden ek bilgi iste (log, ekran görüntüsü, adımlar).
2. **Kanıt topla.** İlgili kodu, logları, son değişiklikleri (`git log -p -- [dosya]`) oku. Hata ne zaman başladı?
3. **Hipotez kur.** En olası 1-3 kök neden. Her biri için onu doğrulayacak veya çürütecek kontrol. Aynı anda tek değişken değiştir; hipotezi çürüten kanıtı da yaz.
4. **Doğrula.** Kontrolleri yap. Kök neden kanıtlanmadan düzeltmeye geçme. Kök neden tek bir özellik klasöründeyse düzeltme yayılmasın diye `/freeze <klasör>` öner.
5. **Kırmızı test.** Hatayı gösteren testi yaz, başarısız olduğunu gör.
6. **Düzelt.** Birden fazla düzeltme yolu varsa (örn. hızlı yama ile kalıcı düzeltme veya davranış değişikliği) hangisini seçeceğini **karar olarak sor**. Kök nedeni, paylaşılan kodda bir kez düzelt. Aynı hatanın başka çağıranlarda da olup olmadığına bak.
7. **Yeşil.** Yeni test ve mevcut testler geçiyor: komutu bu turda çalıştır ve çıktısını göster. Kilit açtıysan `/freeze off`.
8. **Rapor:** Kök neden (1 cümle), düzeltme, eklenen test, benzer riskli yerler.

2 denemede çözemezsen: dur, ne denediğini ve neleri elediğini yaz, yön iste.
Son çare: `git log` ile hatanın girdiği commit'i bul (`git bisect`), oradan ilerle.
