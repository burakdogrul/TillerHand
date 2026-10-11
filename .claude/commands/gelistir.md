---
description: Yol haritasındaki sıradaki (veya verilen) görevi uygular, test eder, işaretler.
argument-hint: [görev kodu, boşsa sıradaki görev]
---

Görev: $ARGUMENTS
Boşsa `docs/ILERLEME.md` → "Sıradaki adım" veya `docs/YOL-HARITASI.md`'deki ilk işaretsiz görevi al.

0. **Limit ve bağlam:** Limiti oku, 5 saatlik yüzdeyi ve başlangıç saatini not et (maliyet günlüğü için). Bağlam %50'yi geçmişse önce `/oturum-sonu` + `/clear` öner. Seviye sarı/kırmızıysa veya tahmin kalan payı aşıyorsa `docs/LIMIT-PLANI.md` §3'teki seçenekleri sor. `docs/ILERLEME.md` → "Kaldığı yer" doluysa oradan devam et.
1. Görevi ve kabul kriterlerini bana tek cümleyle tekrar et. `docs/ILERLEME.md` → aktif görevi güncelle.
2. Bu görev için onaylanmış bir plan yoksa ve 2'den fazla dosyaya dokunacaksa önce `/planla` adımlarını uygula (karar noktaları dahil), onay bekle.
2b. **Önce kabul testleri:** Görevin kabul kriterleri için testleri (kimlik test adında: `Ö-01.1`) ve gerekiyorsa saldırgan testlerini yaz, çalıştır ve **kırmızı** olduklarını göster. Sonra uygula.
3. Uygula. Kurallar:
   - **Uygularken yeni bir karar noktası çıkarsa dur ve sor** (`docs/KARAR-PROTOKOLU.md`). Tahmin edip devam etme.
   - Skill'ler (`docs/SKILLER.md`): Kod için `ponytail:ponytail`, kritik akış için `mattpocock-skills:tdd`. Arayüz için seçilen yön skill'i + `impeccable:impeccable` (`DESIGN.md`'ye bağlı kal; yeni tasarım kararı gerekirse `/tasarim`). Kullanıcıya görünen metin için `humanizer:humanizer`.
   - Sadece bu görevin kapsamı. Görev dışı sorunları düzeltme, `docs/ILERLEME.md` → "Açık sorunlar"a yaz.
   - Kod haritası bağlıysa keşfi onunla yap; dosyaları toptan okuma.
   - Paket kurarken paket kapısı uyarırsa (uydurma / çok yeni / az kullanılan) kullanıcıya bildir; zorlamaya çalışma.
   - Plan bayrak gerektiriyorsa özelliği bayrak arkasına koy ve `docs/BAYRAKLAR.md`'ye ekle.
   - Çalışırken 5 saatlik limit %90'a gelirse `docs/LIMIT-PLANI.md` §4 (güvenli durma) uygula.
   - Projedeki mevcut kalıpları kullan.
   - Hata, boş ve yükleniyor durumlarını unutma.
   - Kritik akışa dokunuyorsan (`docs/TEST-PLANI.md`) test ekle.
   - Yeni ortam değişkeni → `.env.example`.
4. Doğrula: lint, tip kontrolü, ilgili testler. Kırmızı varsa düzelt. Aynı hatada 2 denemede çözemezsen dur ve bana durumu anlat.
5. **Kanıt üret.** "Çalışıyor olmalı" yetmez; çalıştığını göster. Yöntem `docs/STACK.md` → "Doğrulama" bölümünde:
   - Arayüz değişikliği → uygulamayı çalıştır, ilgili ekranı aç, ana senaryoyu ve bir hata senaryosunu dene, ekran görüntüsü al.
   - API/iş mantığı → gerçek istek at veya testi çalıştır; isteği ve yanıtı göster.
   - Kanıt üretemiyorsan (cihaz, panel, ödeme gibi) bunu açıkça söyle ve benim yapmam gereken adımları yaz.
6. Arayüz değiştiyse `impeccable:impeccable` → `critique` çalıştır; önemli bulguları düzeltip düzeltmeyeceğimi sor.
6b. **Görev sonu kurul toplantısı** (`.claude/kurul/KURALLAR.md`; kurul kurulduysa): Değişikliğe ilgili en fazla 3 üye. RET varsa görev bitmez; bulguyu ve seçenekleri sor. Toplantıyı `docs/KURUL.md` günlüğüne yaz.
7. `CLAUDE.md` → "Bitti tanımı" listesini tek tek kontrol et.
8. `docs/YOL-HARITASI.md`'de görevi işaretle; PRD'de sadece testi yeşil olan kriterleri işaretle. Testleri JUnit raporuyla çalıştır (`docs/STACK.md` → Kabul testleri) ki pano güncellensin. Limiti tekrar oku ve `docs/MALIYET-GUNLUGU.md`'ye satır ekle (başlangıç/bitiş 5 saatlik %, süre dk).
9. Rapor ver:
   - Ne yapıldı (2-3 satır)
   - Bu görevde alınan kararlar (kullanıcı / otomatik)
   - Kanıt (ekran görüntüsü, istek/yanıt, test çıktısı)
   - Benim nasıl test edeceğim (adım adım)
   - Önerilen commit mesajı
   - Kontrol edemediğin veya şüpheli olduğun yerler
   - Sonra ne yapalım? AskUserQuestion ile sor: `/incele` ve commit (Önerilen) / sıradaki göreve geç / bu görevde değişiklik iste. Commit'te hafif kurul denetimi otomatik istenir (commit kapısı hook'u).
   - Durum bloğu
