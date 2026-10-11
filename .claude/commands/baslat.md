---
description: Projeyi fikirden başlatır. Her adımda soru sorarak tip, stack, mimari, tasarım ve yol haritasını kullanıcıyla birlikte kararlaştırır.
argument-hint: [proje fikri, 1-3 cümle]
---

Fikir: $ARGUMENTS

Bu bir **sihirbaz**. Kullanıcı hiçbir şeyi bilmiyormuş gibi davran: Her kararı `docs/KARAR-PROTOKOLU.md`'ye göre sor (AskUserQuestion, önerilen seçenek ilk sırada, her seçeneğin ne zaman daha iyi olduğu açıklamalı). Kendi kafana göre karar verme. Bu oturumda uygulama kodu yazma.

**Devam etme:** `docs/ILERLEME.md` → `**Başlangıç adımı:**` 0'dan büyükse kaldığın adımdan devam et ve bunu kullanıcıya söyle. Her adım bitince bu satırı (`N/8`) ve `**Son güncelleme:**` satırını güncelle; sonra durum bloğunu yaz.

---

## Adım 0: Hazırlık

1. Ortamı kontrol et ve tek satırla raporla: `node --version`, `git --version`, kökte `kit/kit.mjs` var mı, `.kit.json` yok mu.
2. `docs/SKILLER.md`'deki plugin'lerin skill'leri senin skill listende var mı bak. Eksik varsa kullanıcıya hangi plugin'in eksik olduğunu ve kurulum komutunu (`/plugin install x@y`) söyle. Sonra sor: "Kurup devam edelim mi, eksik skill olmadan mı devam edelim?"
3. `caveman:caveman` skill'ini yükle (rapor dili).
4. Fikir boşsa sor: "Ne yapmak istiyorsun? 1-3 cümleyle anlat."

## Adım 1: Fikri netleştir → `docs/PRD.md`

`mattpocock-skills:grilling` yaklaşımıyla fikri sorgula. Soruları **AskUserQuestion ile, turlar halinde** sor (her tur en fazla 4 soru). Mümkün olan her soruya fikirden çıkardığın 2-4 somut seçenek ve önerini koy; açık uçlu soruyu sadece seçenek üretemiyorsan sor.

Sırayla netleştir:
1. Problem ve hedef kullanıcı (kim, hangi durumda, şu an ne kullanıyor?)
2. Değer önerisi ve rakiplerden farkı
3. MVP özellikleri: Fikirden 5-8 aday özellik çıkar. "Hangileri ilk sürümde olmalı?" diye **çoklu seçim** ile sor. Seçilmeyenler "Kapsam dışı" olur.
4. Her MVP özelliği için kabul kriteri taslağı yaz ve onaylat.
5. Başarı kriterleri, gelir modeli (ücretsiz / abonelik / tek seferlik / reklam), bütçe (aylık altyapı + AI), süre.
6. Kişisel veri, ödeme ve AI kullanımı var mı?

MVP büyük görünüyorsa küçültmeyi bir karar olarak sor. Fikirdeki riskleri açıkça söyle. `docs/PRD.md`'yi yaz, özetini göster, onay al.

## Adım 2: Proje tipi

AskUserQuestion ile sor. Seçenekleri ve önerini PRD'ye göre gerekçelendir:
- **Web uygulaması / SaaS:** Tarayıcıdan kullanılan ürün, açılış sayfası + panel. SEO, hızlı yayın, mağaza onayı yok.
- **Mobil uygulama:** Cihaz özellikleri (kamera, bildirim, konum), günlük alışkanlık ürünü. Mağaza süreci ve iki platform var.
- **Backend / API / otomasyon:** Arayüzü olmayan servis, bot, veri işleme, başka uygulamalara API.

Kullanıcı birden fazlasını isterse (örn. web + mobil) önce hangisinin MVP olacağını sor; diğeri yol haritasına sonraki faz olarak girer.

Ayrıca sor: **Projede yapay zeka (LLM) özelliği olacak mı?** Evet ise AI eki kurulur.

## Adım 3: Kurulum

Kullanıcıya ne yapılacağını tek cümleyle söyle, sonra çalıştır:

```bash
node kit/kit.mjs kur --tip <web-saas|mobil|backend> [--ekler ai]
```

Çıktıyı raporla. Artık `docs/STACK.md` seçilen tipin dosyasıdır. Commit öner: `chore: kit kurulumu (<tip>)`.

## Adım 4: Teknoloji kararları → `docs/STACK.md`

`docs/STACK.md` → **"Karar noktaları"** bölümündeki her kararı sırayla sor (birbirine bağlı olanlar sırayla, bağımsızlar aynı turda, en fazla 4).
- Katalogdaki seçeneklerden bu projeye en uygun 2-4 tanesini seç. Önerini PRD'ye dayandır (kitle, bütçe, ölçek, ekip bilgisi, SEO ihtiyacı vb.).
- Sürüm, fiyat veya ücretsiz katman bilgisine dayanan seçeneklerde emin değilsen önce `mattpocock-skills:research` ile güncel durumu kontrol et.
- Kullanıcı "hangisi daha iyi, emin değilim" derse farkları somut bir örnekle anlat ve tekrar sor.

Bütün kararlar bitince:
1. STACK.md → "Seçilen teknolojiler" tablosunu doldur.
2. Seçim önerilenden farklıysa STACK.md'nin Komutlar, Klasör yapısı, Kodlama kuralları, AI hataları ve Doğrulama bölümlerini seçime göre yeniden yaz. Bunlara bağlı `.github/workflows/ci.yml`, `.claude/settings.json` izinleri, `.env.example`, pre-commit ayarları ve `.mcp.json` dosyalarını da uyarla. Farkları raporla.
3. `CLAUDE.md` → Komutlar bölümünü doldur.
4. `docs/KARARLAR.md`: Her kararı günlüğe ekle, teknoloji yığınını K-001 olarak kaydet.

## Adım 5: Mimari → `docs/MIMARI.md`, `docs/SOZLUK.md`

`mattpocock-skills:domain-modeling` ve `mattpocock-skills:codebase-design` ile:
1. **Veri modeli:** Tablo/varlık taslağını göster. Belirsiz noktaları karar olarak sor: ilişki türü, silme davranışı (kalıcı / çöp kutusu), kişisel veri alanları, saklama süresi.
2. **Kimlik ve yetki:** Giriş yöntemleri (e-posta + şifre, magic link, Google, Apple) ve roller. Çoklu seçimle sor.
3. **Dış servisler:** Aylık maliyet tahminiyle tablo; ücretli olan her servis için onay al.
4. **Ortamlar:** Lokal / önizleme / prod ayrımı.
5. `docs/SOZLUK.md`: Ana kavramlar, arayüz adları ve durum geçişleri. Arayüzde "sen" mi "siz" mi kullanılacağını sor.

AI eki kurulduysa `docs/AI.md` → model envanterini doldur: Hangi özellik hangi model? Bunu maliyet tahminiyle karar olarak sor.

## Adım 6: Tasarım yönü (arayüz varsa)

`/tasarim genel` akışını çalıştır. Görsel önizlemelerle stil yönü, renk, yazı tipi ve detay kararları alınır; sonunda `PRODUCT.md`, `DESIGN.md` ve `docs/TASARIM.md` hazır olur. Backend tipinde bu adımı atla.

## Adım 7: Yol haritası → `docs/YOL-HARITASI.md`

1. MVP özelliklerini tek oturumluk görevlere böl; Faz 0'daki kurulum görevlerini koru.
2. Sor: "Faz 1'de önce hangi özellikle başlayalım?" (öneri: en riskli veya en değerli olan).
3. Sor: "Lansman hedefi ne?" (tarih / özellik tamamlanınca / sadece kişisel kullanım). Kişisel kullanımsa `docs/LANSMAN.md`'yi silmeyi öner.
4. Yol haritasını özetle ve onay al.

## Adım 8: Kapanış

1. `docs/ILERLEME.md`: Aktif faz `Faz 0`, aktif görev `G-001`, başlangıç adımı `8/8`, sıradaki adım, bekleyen kararlar.
2. `node .claude/hooks/durum-panosu.mjs` çalıştır.
3. Kullanıcıya özet ver: alınan karar sayısı, seçilen stack, tasarım yönü, MVP özellikleri, ilk görev.
4. Commit öner: `docs: proje planı`.
5. Son satır: "Devam: `/gelistir G-001`".
