---
description: Yol haritasındaki sıradaki (veya verilen) görevi uygular, test eder, işaretler.
argument-hint: [görev kodu, boşsa sıradaki görev]
---

Görev: $ARGUMENTS
Boşsa `docs/workflow/progress.md` → "Sıradaki adım" veya `docs/product/roadmap.md`'deki ilk işaretsiz görevi al.

0. **Limit ve bağlam:** Limiti oku ve başlangıcı kaydet: `node .claude/hooks/progress.mjs --start` (masaüstünde durum çubuğu yok: `--limit <5 saatlik %>`, `get_usage`'dan). Bağlam %50'yi geçmişse önce `/wrap-up` + `/clear` öner. Seviye sarı/kırmızıysa veya tahmin kalan payı aşıyorsa bunu tek satırla söyle ve başla (`docs/workflow/usage-limits.md` §3; soru sorma). `docs/workflow/progress.md` → "Kaldığı yer" doluysa oradan devam et.
0b. **Model ve effort** (`docs/workflow/models.md`): Son seçimi `node .claude/hooks/models.mjs --show` ile oku. İki AskUserQuestion çağrısı yap: önce dört soru, her rolün modeli (Opus / Sonnet / Haiku); sonra dört soru, her rolün effort'u (düşük / orta / yüksek / ekstra yüksek). Her soruda models.md'deki önerilen seçenek ilk sırada ve "(Önerilen)" etiketli; son seçim farklıysa o seçeneğin açıklamasına "son seçim" yaz. Cevabı `node .claude/hooks/models.mjs --set plan=<model>:<effort> code=… review=… docs=…` ile kaydet. Ana oturumun modeli veya effort'u plan rolünden farklıysa tek satırla `/model <ad>` ve `/effort <düzey>` öner. Soru modunda `maliyet` konusu kapalıysa sorma ve `--set` çalıştırma: son seçim geçerli kalır, durum bloğunda "otomatik" yaz.
1. Görevi ve kabul kriterlerini bana tek cümleyle tekrar et. `docs/workflow/progress.md` → aktif görevi güncelle.
2. Bu görev için onaylanmış bir plan yoksa ve 2'den fazla dosyaya dokunacaksa önce `/plan-task` adımlarını uygula (karar noktaları dahil), onay bekle.
2a. **Akış:** `node .claude/hooks/flow.mjs --files <plandaki dosya sayısı>` (masaüstünde durum çubuğu yok: `--context` ve `--limit`'i `get_usage`'dan ver). Çıktı kodun ve doküman işinin nerede yapılacağını (ana oturum / alt ajan), görev sonu kurulunun kaç üyeyle ve paralel mi sırayla mı toplanacağını söyler (6b'de yeniden çalıştır: değişen yollardan üyeleri adıyla önerir); 2b, 6b ve 8 buna uyar. "Önce /clear öner" derse tek satırla öner.
2b. **Kod rolüne devret (2b ve 3):** Akış "Kod: ana oturum" diyorsa (küçük görev: alt ajanın soğuk başlangıcı kazandırdığından pahalı) kodu adım 3'e göre kendin yaz. Yoksa Agent aracıyla alt ajan çalıştır, çağrıda kod rolünün `model` ve `effort`'unu ver. İstemde: görev ve kabul kriterleri, onaylı plan, dokunulacak dosyalar, adım 3'teki kurallar, önce kırmızı testler. Alt ajan kullanıcıya soru soramaz: karar noktasında durup soruyu ve seçenekleri raporlamasını iste; soruyu sen sor, kararı günlüğe yaz, alt ajanı cevapla devam ettir. Düzeltme veya devam için de aynı alt ajanı SendMessage ile sürdür; yeni ajan başlatma (dosyaları yeniden okur). Raporu kısa iste (en fazla ~15 satır: değişen dosyalar, test sonucu sayıyla, açık sorular; kod ve tam çıktı yok). Alt ajan bitince diff'i ve test çıktısını kendin oku; adım 4'ten sonrası ana oturumda. Kullanıcıya görünen metni (humanizer) son haline sen getir.
   **Önce kabul testleri:** Görevin kabul kriterleri için testleri (kimlik test adında: `Ö-01.1`) ve gerekiyorsa saldırgan testlerini yaz, çalıştır ve **kırmızı** olduklarını göster (alt ajanın kırmızı çıktısını bana göster). Sonra uygula.
3. Uygula. Kurallar:
   - **Uygularken yeni bir karar noktası çıkarsa dur ve sor** (`docs/workflow/decision-protocol.md`). Tahmin edip devam etme.
   - Skill'ler (`docs/workflow/skills.md`): Kod için `ponytail:ponytail`, kritik akış için `mattpocock-skills:tdd`. Arayüz için seçilen yön skill'i + `impeccable:impeccable` (`DESIGN.md`'ye bağlı kal; yeni tasarım kararı gerekirse `/design`). Kullanıcıya görünen metin için `humanizer:humanizer`.
   - Sadece bu görevin kapsamı. Görev dışı sorunları düzeltme, `docs/workflow/progress.md` → "Açık sorunlar"a yaz.
   - Kod haritası bağlıysa keşfi onunla yap; dosyaları toptan okuma. Büyük dosyada önce ara (grep), sonra yalnız gereken satır aralığını oku.
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
6b. **Görev sonu kurul toplantısı** (`.claude/board/rules.md`; kurul kurulduysa). Bu, değişikliğin tek tam denetimidir: değişikliğe ilgili, akışın (2a) söylediği sayıda üye (en fazla 3) + `code-reviewer` (değişiklik auth, ödeme, kişisel veri gibi hassas bir yola dokunuyorsa `security-auditor` da), inceleme rolünün `model` ve `effort`'uyla. RET varsa görev bitmez; bulguyu ve seçenekleri sor. ONAY veya KOŞULLU ONAY ise ve kapı (adım 4) yeşilse `node .claude/hooks/commit-gate.mjs --approve "görev sonu: <katılanlar>"`: commit aynı değişiklikler için kurulu yeniden toplamaz, sonradan değişen dosyalar varsa yalnız onlar incelenir. Toplantıyı `docs/workflow/board.md` günlüğüne yaz. Kurul kurulmadıysa adım 9'da `/review-changes` öner.
7. `AGENTS.md` → "Bitti tanımı" listesini tek tek kontrol et.
8. Kapsam kalkanını kapat (komut kullanıcıya sorulur): `node .claude/hooks/freeze-guard.mjs --plan-end`. PRD'de sadece testi yeşil olan kriterleri işaretle. Testleri JUnit raporuyla çalıştır (`docs/architecture/stack.md` → Kabul testleri) ki pano güncellensin. Limiti tekrar oku. Roadmap, maliyet günlüğü ve progress yazımı mekaniktir, model çağrısı harcama; tek komutla yaz:
   `node .claude/hooks/progress.mjs --done <görev kodu> --cost "<görev kodu> <kısa ad>" <K|O|B> --task "-" --did "<görev kodu>: <tek satır ne yapıldı>" --next "<sıradaki görev>" --check`
   `--cost` başlangıcı adım 0'dan alır, bitişi ve süreyi kendisi hesaplar (masaüstünde `--limit <%>` ekle). `--check` progress.md'nin kalın etiketli satırlarını (durum çubuğu ve pano okur) denetler; bozuksa düzelt. Açık sorunlar ve bekleyen kararlar gibi düz metin bölümlerini gerekirse elle yaz.
9. Rapor ver:
   - Ne yapıldı (2-3 satır)
   - Bu görevde alınan kararlar (kullanıcı / otomatik)
   - Kanıt (ekran görüntüsü, istek/yanıt, test çıktısı)
   - Benim nasıl test edeceğim (adım adım)
   - Önerilen commit mesajı
   - Kontrol edemediğin veya şüpheli olduğun yerler
   - Görevde bir davranışını düzelttiysem ya da tercih söylediysem: aynı AskUserQuestion çağrısında ayrı bir çoklu seçim sorusu olarak "Tercih olarak kaydedeyim mi?" (AGENTS.md → kural 9, varsa; seçilenler `prefs.mjs --add`). Not yoksa sorma.
   - Sonra ne yapalım? AskUserQuestion ile sor: commit (Önerilen; görev sonu denetimi geçerli, kurul kurulmadıysa önce `/review-changes`) / sıradaki göreve geç / bu görevde değişiklik iste. Commit'te hafif kurul denetimi otomatik istenir (commit kapısı hook'u). Commit atıldıktan ve testler yeşilken çalışan nokta kaydet: `node .claude/hooks/checkpoint.mjs --save "<görev kodu> bitti, testler yeşil"` (`/rollback` buraya döner).
   - Commit atıldıysa: `docs/workflow/progress.md` → "Sıradaki adım" güncel mi bak, sonra tek satırla `/clear` öner (görev = oturum, `docs/workflow/usage-limits.md` §3; bağlam yüzdesinden bağımsız). Yeni oturum progress.md'den devam eder.
   - Durum bloğu
