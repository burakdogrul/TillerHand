---
description: Yol haritasındaki sıradaki (veya verilen) görevi uygular, test eder, işaretler.
argument-hint: [görev kodu, boşsa sıradaki görev]
---

Görev: $ARGUMENTS
Boşsa `docs/workflow/progress.md` → "Sıradaki adım" veya `docs/product/roadmap.md`'deki ilk işaretsiz görevi al.

0. **Limit ve bağlam:** Limiti oku, 5 saatlik yüzdeyi ve başlangıç saatini not et (maliyet günlüğü için). Bağlam %50'yi geçmişse önce `/wrap-up` + `/clear` öner. Seviye sarı/kırmızıysa veya tahmin kalan payı aşıyorsa bunu tek satırla söyle ve başla (`docs/workflow/usage-limits.md` §3; soru sorma). `docs/workflow/progress.md` → "Kaldığı yer" doluysa oradan devam et.
0b. **Model ve effort** (`docs/workflow/models.md`): Son seçimi `node .claude/hooks/models.mjs --show` ile oku. İki AskUserQuestion çağrısı yap: önce dört soru, her rolün modeli (Opus / Sonnet / Haiku); sonra dört soru, her rolün effort'u (düşük / orta / yüksek / ekstra yüksek). Her soruda models.md'deki önerilen seçenek ilk sırada ve "(Önerilen)" etiketli; son seçim farklıysa o seçeneğin açıklamasına "son seçim" yaz. Cevabı `node .claude/hooks/models.mjs --set plan=<model>:<effort> code=… review=… docs=…` ile kaydet. Ana oturumun modeli veya effort'u plan rolünden farklıysa tek satırla `/model <ad>` ve `/effort <düzey>` öner. Soru modunda `maliyet` konusu kapalıysa sorma ve `--set` çalıştırma: son seçim geçerli kalır, durum bloğunda "otomatik" yaz.
1. Görevi ve kabul kriterlerini bana tek cümleyle tekrar et. `docs/workflow/progress.md` → aktif görevi güncelle.
2. Bu görev için onaylanmış bir plan yoksa ve 2'den fazla dosyaya dokunacaksa önce `/plan-task` adımlarını uygula (karar noktaları dahil), onay bekle.
2b. **Kod rolüne devret (2b ve 3):** Agent aracıyla alt ajan çalıştır, çağrıda kod rolünün `model` ve `effort`'unu ver. İstemde: görev ve kabul kriterleri, onaylı plan, dokunulacak dosyalar, adım 3'teki kurallar, önce kırmızı testler. Alt ajan kullanıcıya soru soramaz: karar noktasında durup soruyu ve seçenekleri raporlamasını iste; soruyu sen sor, kararı günlüğe yaz, alt ajanı cevapla devam ettir. Alt ajan bitince diff'i ve test çıktısını kendin oku; adım 4'ten sonrası ana oturumda. Kullanıcıya görünen metni (humanizer) son haline sen getir.
   **Önce kabul testleri:** Görevin kabul kriterleri için testleri (kimlik test adında: `Ö-01.1`) ve gerekiyorsa saldırgan testlerini yaz, çalıştır ve **kırmızı** olduklarını göster (alt ajanın kırmızı çıktısını bana göster). Sonra uygula.
3. Uygula. Kurallar:
   - **Uygularken yeni bir karar noktası çıkarsa dur ve sor** (`docs/workflow/decision-protocol.md`). Tahmin edip devam etme.
   - Skill'ler (`docs/workflow/skills.md`): Kod için `ponytail:ponytail`, kritik akış için `mattpocock-skills:tdd`. Arayüz için seçilen yön skill'i + `impeccable:impeccable` (`DESIGN.md`'ye bağlı kal; yeni tasarım kararı gerekirse `/design`). Kullanıcıya görünen metin için `humanizer:humanizer`.
   - Sadece bu görevin kapsamı. Görev dışı sorunları düzeltme, `docs/workflow/progress.md` → "Açık sorunlar"a yaz.
   - Kod haritası bağlıysa keşfi onunla yap; dosyaları toptan okuma.
   - Paket kurarken paket kapısı uyarırsa (uydurma / çok yeni / az kullanılan) kullanıcıya bildir; zorlamaya çalışma.
   - Plan bayrak gerektiriyorsa özelliği bayrak arkasına koy ve `docs/operations/feature-flags.md`'ye ekle.
   - Çalışırken limit %90 / %95 / %99'a gelirse `docs/workflow/usage-limits.md` §4'teki uyarıları ver; işi durdurma.
   - Projedeki mevcut kalıpları kullan.
   - Hata, boş ve yükleniyor durumlarını unutma.
   - Kritik akışa dokunuyorsan (`docs/quality/test-plan.md`) test ekle.
   - Yeni ortam değişkeni → `.env.example`.
   - Yeni paket → kilit dosyası commit'e girer. Yeni sistem bağımlılığı (veritabanı, ffmpeg vb.) veya kurulum adımı → `README.md` → Gereksinimler / Kurulum.
4. Doğrula: `node .claude/hooks/gate.mjs --run` (lint, tip kontrolü, test, Semgrep; görev sonu ve commit toplantısı bu çıktıyı kullanır). Kırmızı varsa düzelt. "Komut onayı gerekli" derse komutları bana göster; onaylarsam `node .claude/hooks/gate.mjs --approve`. Aynı hatada 2 denemede çözemezsen dur ve bana durumu anlat.
5. **Kanıt üret.** "Çalışıyor olmalı" yetmez; çalıştığını göster. Yöntem `docs/architecture/stack.md` → "Doğrulama" bölümünde:
   - Arayüz değişikliği → `node .claude/hooks/preview.mjs <görev kodu>`: dev sunucuyu açar, masaüstü (1440) ve mobil (390) ekran görüntüsünü `.previews/<görev kodu>/`'e yazar, sunucuyu kapatır. İlk çalıştırma Playwright indirmesi ve ilk derleme yüzünden birkaç dakika sürebilir: komuta 10 dakika zaman aşımı ver. Görüntüleri aç ve bana göster. Betik "komut onayı gerekli" derse komutları bana göster; onaylarsam `node .claude/hooks/gate.mjs --approve`. Başka bir hata verirse mesajı rapora yaz ve görüntüyü elle al. Sonra ilgili ekranda ana senaryoyu ve bir hata senaryosunu dene. Görevin arayüz kabul kriterlerini tarayıcıda kanıtlamak için raporda `/qa` öner.
   - API/iş mantığı → gerçek istek at veya testi çalıştır; isteği ve yanıtı göster.
   - Kanıt üretemiyorsan (cihaz, panel, ödeme gibi) bunu açıkça söyle ve benim yapmam gereken adımları yaz.
6. Arayüz değiştiyse `impeccable:impeccable` → `critique` çalıştır; önemli bulguları düzeltip düzeltmeyeceğimi sor.
6b. **Görev sonu kurul toplantısı** (`.claude/board/rules.md`; kurul kurulduysa): Değişikliğe ilgili en fazla 3 üye, inceleme rolünün `model` ve `effort`'uyla. RET varsa görev bitmez; bulguyu ve seçenekleri sor. Toplantıyı `docs/workflow/board.md` günlüğüne yaz.
7. `AGENTS.md` → "Bitti tanımı" listesini tek tek kontrol et.
8. Kapsam kalkanını kapat (komut kullanıcıya sorulur): `node .claude/hooks/freeze-guard.mjs --plan-end`. `docs/product/roadmap.md`'de görevi işaretle; PRD'de sadece testi yeşil olan kriterleri işaretle. Testleri JUnit raporuyla çalıştır (`docs/architecture/stack.md` → Kabul testleri) ki pano güncellensin. Limiti tekrar oku ve `docs/workflow/cost-log.md`'ye satır ekle (başlangıç/bitiş 5 saatlik %, süre dk). Roadmap, cost-log ve progress yazımını tek alt ajan çağrısıyla doküman rolüne ver (`model`, `effort`); sonucu kontrol et (progress.md'nin kalın etiketli satırları durum çubuğu ve pano için aynı biçimde kalmalı).
9. Rapor ver:
   - Ne yapıldı (2-3 satır)
   - Bu görevde alınan kararlar (kullanıcı / otomatik)
   - Kanıt (ekran görüntüsü, istek/yanıt, test çıktısı)
   - Benim nasıl test edeceğim (adım adım)
   - Önerilen commit mesajı
   - Kontrol edemediğin veya şüpheli olduğun yerler
   - Görevde bir davranışını düzelttiysem ya da tercih söylediysem: aynı AskUserQuestion çağrısında ayrı bir çoklu seçim sorusu olarak "Tercih olarak kaydedeyim mi?" (AGENTS.md → kural 9, varsa; seçilenler `prefs.mjs --add`). Not yoksa sorma.
   - Sonra ne yapalım? AskUserQuestion ile sor: `/review-changes` ve commit (Önerilen) / sıradaki göreve geç / bu görevde değişiklik iste. Commit'te hafif kurul denetimi otomatik istenir (commit kapısı hook'u). Commit atıldıktan ve testler yeşilken çalışan nokta kaydet: `node .claude/hooks/checkpoint.mjs --save "<görev kodu> bitti, testler yeşil"` (`/rollback` buraya döner).
   - Durum bloğu
