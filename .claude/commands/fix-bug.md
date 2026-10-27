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
5. **Kırmızı test.** Hatayı gösteren testi düzeltmeyi yapacak olan yazmaz (AGENTS.md kural 7): `test-writer` alt ajanını test rolünün modeliyle çalıştır; istemde yeniden üretme adımları, beklenen davranış ve ilgili kodun dışa açık arayüzü olsun, kök neden hipotezi ve düzeltme fikri olmasın. Ajan testi yazar ve başarısız olduğunu gösterir. Test dosyalarına yalnız `test-writer` yazabilir. Kısa hata spec'i yaz: `docs/product/specs/<hata-kısa-adı>.md` (`_template.md`, Tür: hata), birkaç satır yeter. `**Sınıf:**` satırına şu listeden tam olarak birini yaz: `boş-girdi`, `doğrulama`, `yetki`, `tarih-saat`, `yerel-dil`, `sıralama`, `eşzamanlılık`, `yapılandırma`, `dış-servis`, `sözleşme`, `arayüz-durumu`, `diğer`. Mevcut davranış yeniden üretme adımlarıdır, beklenen davranış testin sınadığıdır. Değişmemesi gereken davranışa hatanın yakınındaki, testi olan kabul kriterlerini kimliğiyle yaz (`- Ö-01.1: ...`); yoksa bölümü boş bırak.
6. **Düzelt.** Birden fazla düzeltme yolu varsa (örn. hızlı yama ile kalıcı düzeltme veya davranış değişikliği) hangisini seçeceğini **karar olarak sor**. Kök nedeni, paylaşılan kodda bir kez düzelt. Aynı hatanın başka çağıranlarda da olup olmadığına bak.
7. **Yeşil.** Yeni test ve mevcut testler geçiyor: komutu bu turda çalıştır ve çıktısını göster. Sonra kapıyı çalıştır: `node .claude/hooks/gate.mjs --run` (lint, tip kontrolü, test, Semgrep; commit toplantısı bu çıktıyı kullanır). Kırmızı varsa düzelt. "Komut onayı gerekli" derse komutları bana göster; onaylarsam `node .claude/hooks/gate.mjs --approve`. Kilit açtıysan `/freeze off`.
8. **Tekrar mı?** `docs/product/specs/` altında aynı `**Sınıf:**` değerini taşıyan başka bir hata spec'i varsa (sınıf `diğer` değilse) bu hata sınıfı tekrarlıyor: tekrarı önleyecek tek bir kural öner. Mekanik denetlenebiliyorsa ("X dosyasında Y yazma", "Z çağrısında W zorunlu") `/hookify` kuralı olur (`.claude/hookify.<ad>.local.md`; `.gitignore`'a ekleme, git'e girer ve ekip de kullanır). Değilse, hookify kapalıysa (Hafif profil) veya Claude Code dışındaysan `AGENTS.md` → "Öğrenilen kurallar"a tek satır (bölüm yoksa dosyanın sonuna aç). Kaynak ve tarih satırı: `(kaynak: specs/<a>.md, specs/<b>.md · YYYY-AA-GG)`; AGENTS.md'de kuralın sonunda, hookify dosyasında mesaj gövdesinin son satırında. Kural metnini ve hedef dosyayı göstererek AskUserQuestion ile sor: Ekle / Sonra (panoda hatırlatılır) / Gerek yok. Onay yoksa hiçbir kural dosyasına yazma. Ekle veya Gerek yok cevabını aynı sınıftaki spec'lere `**Kural:** <hedef dosya veya "gerek yok"> · YYYY-AA-GG` satırıyla yaz; pano uyarısı kapanır, karar tekrar sorulmaz.
9. **Rapor:** Kök neden (1 cümle), düzeltme, eklenen test, benzer riskli yerler, eklenen kural (varsa).

2 denemede çözemezsen: dur, ne denediğini ve neleri elediğini yaz, yön iste.
Son çare: `git log` ile hatanın girdiği commit'i bul (`git bisect`), oradan ilerle.
