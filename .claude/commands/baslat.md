---
description: Projeyi fikirden başlatır. Her adımda soru sorarak tip, stack, mimari, tasarım ve yol haritasını kullanıcıyla birlikte kararlaştırır.
argument-hint: [proje fikri, 1-3 cümle]
---

Fikir: $ARGUMENTS

Bu bir **9 adımlı sihirbaz** (0-9). Kullanıcı hiçbir şeyi bilmiyormuş gibi davran: Her kararı `docs/KARAR-PROTOKOLU.md`'ye göre sor (AskUserQuestion, önerilen seçenek ilk sırada, her seçeneğin ne zaman daha iyi olduğu açıklamalı). Kendi kafana göre karar verme. Bu oturumda uygulama kodu yazma. Her kararı tek yönlü / çift yönlü kapı olarak sınıfla (`docs/KARAR-PROTOKOLU.md` §2a); veritabanı, auth, ödeme ve veri modeli gibi tek yönlü kararlarda önce kurul görüşü al.

**Devam etme:** `docs/ILERLEME.md` → `**Başlangıç adımı:**` 0'dan büyükse kaldığın adımdan devam et ve bunu kullanıcıya söyle. Her adım bitince bu satırı (`N/9`) ve `**Son güncelleme:**` satırını güncelle; sonra durum bloğunu yaz.

---

## Adım 0: Hazırlık

1. Ortamı kontrol et ve tek satırla raporla: `node --version`, `git --version`, kökte `kit/kit.mjs` var mı, `.kit.json` yok mu.
2. `docs/SKILLER.md`'deki plugin'lerin skill'leri senin skill listende var mı bak. Eksik varsa kullanıcıya hangi plugin'in eksik olduğunu ve kurulum komutunu (`/plugin install x@y`) söyle. Sonra sor: "Kurup devam edelim mi, eksik skill olmadan mı devam edelim?"
3. `caveman:caveman` skill'ini yükle (rapor dili).
4. **Limit:** Limiti oku (`docs/LIMIT-PLANI.md` §1) ve raporla. Sihirbazın tamamı Pro planda 5 saatlik limitin büyük kısmını kullanabilir; adımlar arasında durup sonra devam edilebileceğini söyle. Seviye sarı veya kırmızıysa §3'teki seçenekleri sor.
5. **Kod haritası:** Oturumda codebase-memory-mcp araçları (`index_repository`, `search_graph` vb.) var mı bak. Yoksa sor: "Kod haritası kurulsun mu? AI, kodu dosya dosya okumak yerine sorgular; proje büyüdükçe oturum başına ciddi token tasarrufu sağlar."
   - **Kur (Önerilen):** Kurulumu kullanıcı kendi terminalinde yapar; uzaktan indirilen script'i sen çalıştırma. Resmi komutları ver:
     - Windows (PowerShell): `Invoke-WebRequest -Uri https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1 -OutFile install.ps1; Unblock-File .\install.ps1; .\install.ps1`
     - macOS/Linux: `curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash`
     - Installer Claude Code'a kendisini kullanıcı düzeyinde tanıtır (MCP, hook, skill). Sonra Claude Code yeniden başlatılır ve `/mcp` ile kontrol edilir. Otomatik indeks için: `codebase-memory-mcp config set auto_index true`. Kaynak: github.com/DeusData/codebase-memory-mcp
   - **Şimdilik kurma:** Küçük proje için yeterli; sonra kurulabilir.
6. Fikir boşsa sor: "Ne yapmak istiyorsun? 1-3 cümleyle anlat."

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
3. **Dış servisler:** Aylık maliyet tahminiyle tablo; ücretli olan her servis için onay al. Her servisi `docs/HESAPLAR.md`'ye ekle (sahip, 2FA, bitiş tarihi; şifre yazma).
3b. **Birim ekonomisi** (ücretli ürünse): `docs/BIRIM-EKONOMISI.md` girdilerini fiyat, komisyon, sabit ve kullanıcı başı maliyet tahminleriyle doldur. Katkı payı negatif veya değişken maliyet fiyatın %30'unu geçiyorsa bunu `maliyet` kararı olarak sor (fiyat / kullanım limiti / model seçimi).
4. **Ortamlar:** Lokal / önizleme / prod ayrımı.
5. `docs/SOZLUK.md`: Ana kavramlar, arayüz adları ve durum geçişleri. Arayüzde "sen" mi "siz" mi kullanılacağını sor.

AI eki kurulduysa `docs/AI.md` → model envanterini doldur: Hangi özellik hangi model? Bunu maliyet tahminiyle karar olarak sor.

## Adım 6: Uzman kurulu → `.claude/agents/`, `docs/KURUL.md`

`.claude/kurul/KURALLAR.md` §5'i uygula:
1. Tipe, PRD'ye ve seçilen stack'e göre kurul öner. Kurulun ne olduğunu kısaca anlat: Uzman ajanlar planı, görevi, her commit'i ve fazı denetler. Danışmandır; kritik bulguda durdurur; karar her zaman kullanıcıda.
2. Üyeleri **çoklu seçimle** onaylat; yeni uzman eklenebileceğini söyle.
3. Model dağılımını onaylat (önerilen karma: Mimar + Güvenlik `sonnet`, diğerleri `haiku`). Pro planda tam kurul toplantısının tahmini maliyetini söyle (`docs/LIMIT-PLANI.md`).
4. Commit denetimi açık mı kalsın? Varsayılan açık ve hafif: en fazla 2 üye, `haiku`, sadece diff.
5. Ajan dosyalarını üret ve "Bu proje" bölümlerini doldur. `docs/KURUL.md`'yi doldur.
6. Yeni ajanların bir sonraki oturumda yükleneceğini söyle.

## Adım 7: Tasarım yönü (arayüz varsa)

`/tasarim genel` akışını çalıştır. Görsel önizlemelerle stil yönü, renk, yazı tipi ve detay kararları alınır; sonunda `PRODUCT.md`, `DESIGN.md` ve `docs/TASARIM.md` hazır olur. Backend tipinde bu adımı atla.

## Adım 8: Yol haritası → `docs/YOL-HARITASI.md`

1. MVP özelliklerini tek oturumluk görevlere böl; Faz 0'daki kurulum görevlerini koru. Her özelliğin ilk görevi "kabul testlerini yaz (kırmızı)" olsun (`docs/TEST-PLANI.md` §1a). Ödeme, AI, toplu bildirim ve veri silen özellikler için bayrak görevi ekle (`docs/BAYRAKLAR.md`).
2. Sor: "Faz 1'de önce hangi özellikle başlayalım?" (öneri: en riskli veya en değerli olan).
3. Sor: "Lansman hedefi ne?" (tarih / özellik tamamlanınca / sadece kişisel kullanım). Kişisel kullanımsa `docs/LANSMAN.md`'yi silmeyi öner.
4. Yol haritasını özetle ve onay al.

## Adım 9: Kapanış

1. `docs/ILERLEME.md`: Aktif faz `Faz 0`, aktif görev `G-001`, başlangıç adımı `9/9`, sıradaki adım, bekleyen kararlar.
2. `node .claude/hooks/durum-panosu.mjs` çalıştır.
3. Kullanıcıya özet ver: alınan karar sayısı, seçilen stack, kurul üyeleri, tasarım yönü, MVP özellikleri, ilk görev, kalan limit.
4. Commit öner: `docs: proje planı`.
5. Son satır: "Devam: `/gelistir G-001`".
