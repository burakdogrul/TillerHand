---
description: Var olan (ilerlemiş, beğenilmeyen veya iyileştirilecek) bir projeyi kite alır. Kodu tarar, belgeleri koddan çıkarır, soru sorarak doğrular, testleri ve yapıyı kitin düzenine getiren bir uyum yol haritası çıkarır.
argument-hint: [boş | projeyle ilgili kısa not]
---

Not: $ARGUMENTS

Bu bir **9 adımlı uyum sihirbazı** (0-9). `/start`'ın var olan kod için olan karşılığıdır. Fikirden değil koddan başlar, ama kararları yine kullanıcı verir: Her kararı `docs/workflow/decision-protocol.md`'ye göre sor ve verildiği anda `docs/decisions/log.md`'ye yaz. Bu oturumda uygulama kodunu değiştirme ve dosya taşıma. Taşıma ve düzeltmeler yol haritasındaki görevlerle, `/build` ile yapılır.

**Önkoşul:** Kit bu klasöre `init` ile kurulmuş olmalı (`.kit.json` var, `type` boş). Kurulmamışsa kullanıcıya kurulum komutunu ver: `node <kit klasörü>/kit/kit.mjs init`. Kurulumdan sonra yeni oturum açılması gerekir.

**Devam etme:** `docs/workflow/progress.md` → `**Aktif faz:** Başlangıç (uyum)` ve `**Başlangıç adımı:**` 0'dan büyükse kaldığın adımdan devam et. Her adım bitince bu satırı (`N/9`) ve `**Son güncelleme:**` satırını güncelle, sonra durum bloğunu yaz.

**Mevcut koda saygı:** Kurulum projenin dosyalarının üzerine yazmaz; kitin hali yanına `<dosya>.kit-new` olarak konur. Bunları Adım 2'de tek tek ele al.

---

## Adım 0: Hazırlık

1. `docs/workflow/progress.md` → `**Aktif faz:** Başlangıç (uyum)`, `**Başlangıç adımı:** 0/9`.
2. `/start` Adım 0'daki şu maddeleri aynen uygula: Profil (0), anlatıcı mod (0b), araç (0c), auto memory (0d), ortam kontrolü (1), eklentiler (2), caveman (3), kod haritası (5), bildirimler (6), pano (6b). Var olan projede kod haritası daha da faydalıdır; önerilen seçenek "Kur" olsun.
3. **Tarama derinliği:** Limiti oku ve sor. Tahmini maliyetleri göster:
   - **Hızlı tarama (Önerilen, Pro'da):** Yapı, stack, testler, git geçmişi, belgeler. 5 saatlik limitin yaklaşık %10-20'si.
   - **Derin tarama:** Hızlı taramaya ek olarak seçilen bulgu raporları (`/findings-tech`, `-security`, `-ux` vb.). Rapor başına yaklaşık %8-15 daha. Hangi raporların çalışacağını çoklu seçimle sor.
   Seçimi `**Profil:**` satırına ekle (örn. `Hafif · tarama: Hızlı`).

## Adım 1: Tara (salt okunur)

Dosyaları toptan okuma: kod haritası bağlıysa önce onu kullan, yoksa paket dosyalarından, klasör ağacından ve giriş noktalarından başla. Çıkar:
1. **Stack:** Dil, framework, veritabanı, auth, hosting, paket yöneticisi. Kilit dosyası var mı? Çalışma ortamı sürümü sabit mi (`.nvmrc`, `.python-version`, `engines`)?
2. **Yapı:** Klasör ağacı (2-3 seviye), giriş noktaları, katmanlar. Kitin özellik bazlı yapısından (`features/<özellik>/`) ne kadar uzak?
3. **Özellikler:** Rotalar, ekranlar, API uçları ve modellerden kullanıcıya görünen özellik listesi.
4. **Testler:** Test altyapısı var mı? Testleri çalıştır, sonucu göster: kaç test, kaçı kırmızı, kapsanan alanlar. Doğrulama satırı olmayan ya da her şeyi taklitle (mock) geçen testleri ayrıca işaretle.
5. **Kurulabilirlik:** README'de kurulum adımı, `.env.example`, sistem bağımlılıkları.
6. **Git geçmişi:** Son 30 commit'in özeti, aktif dallar, en çok değişen dosyalar (riskli bölgeler).
7. **Mevcut belgeler:** README, eski `CLAUDE.md` ve `AGENTS.md` (yerinde duruyorlar; kitinkiler `.kit-new` uzantılı), varsa docs klasörü.
8. **Kaynağı olmayan parçalar:** Repoya girmiş derlenmiş paket, küçültülmüş JS, Electron ASAR veya kaynağı kayıp bağımlılık. Varsa listele. İçini anlamak gerekirse rea CLI öner (`docs/workflow/mcp-catalog.md` → rea): sadece projenin sahibi olduğu veya incelemeye yetkili olduğu parçalar için, lisansını kontrol ederek.

Bulguları kısa bir tablo halinde göster. Hızlı taramada kodun içine dalma: sadece yapı ve özet.

## Adım 2: Tip ve kurulum

1. Taramaya göre tipi öner ve onaylat (web-saas / mobile / backend; AI özelliği var mı; Türkiye'de satış veya Türk kullanıcı varsa Türkiye eki `tr`, ayrıntı `/start` Adım 2).
2. Kur: `node <kit klasörü>/kit/kit.mjs install --type <tip> [--addons ai,tr] --project .` (kit klasörü `.kit.json` → `kit` alanında). Araç `init`'te seçilmediyse Adım 0'daki seçimi `--tool <liste>` olarak ekle.
3. **`.kit-new` dosyaları:** Her biri için (`CLAUDE.md` ve `AGENTS.md` hariç, onlar Adım 4'te) farkı özetle ve karar olarak sor: kitinkini al / projeninkini koru / birleştir. Örnekler: `.env.example` genelde birleştirilir; `ci.yml` için mevcut CI'ın yaptıklarını kitinkiyle karşılaştır. Sonra `.kit-new` dosyasını sil.

## Adım 3: Belgeleri koddan çıkar

Kodun söylediğini taslak olarak yaz, koddan anlaşılmayanı sor (AskUserQuestion, turlar halinde):
1. **`docs/product/prd.md`:** Problem, hedef kullanıcı, mevcut özellikler (koddan), kabul kriterleri taslağı. Sor: Projenin amacı ve kitlesi doğru anlaşıldı mı? **Neyi beğenmiyorsun, neyi iyileştirmek istiyorsun?** (çoklu seçim + serbest). Eksik veya yarım kalan özellikler hangileri?
2. **`docs/architecture/stack.md`:** "Seçilen teknolojiler" tablosunu mevcut stack'le doldur. Kitin kataloğundan farklı seçimler hata değildir; değiştirmeyi önermek ayrı bir karardır ve sadece ciddi bir sebep varsa sorulur (güvenlik, bakımı bitmiş sürüm, maliyet).
3. **`docs/architecture/overview.md`, `docs/product/glossary.md`:** Veri modeli, servisler, ana kavramlar.
3b. **Araştırma (pahalı adım, isteğe bağlı):** Benzer projeler ve rakiplerle karşılaştırma için `/research` öner (hızlı: limitin yaklaşık %10-15'i). Yap / Sonraya bırak. Seçilen özellikler Adım 8'de Faz 3'e girer.
4. **README:** Gereksinimler ve Kurulum bölümleri (`/start` Adım 4 madde 3a). Eksik kilit dosyası veya sürüm dosyası Adım 8'de ilk görevlerden biri olur.

## Adım 4: AGENTS.md ve CLAUDE.md'yi yeniden yaz

Ortak kurallar `AGENTS.md`'de (Claude Code, Codex, Antigravity okur); `CLAUDE.md` onu `@AGENTS.md` ile içe alır ve sadece Claude Code'a özel ekleri tutar.

1. Kitin `AGENTS.md` (veya `AGENTS.md.kit-new`) dosyasını temel al; proje adı, tek cümle tanım ve Komutlar bölümünü doldur. `CLAUDE.md` kitin `CLAUDE.md.kit-new` haline geçer. `init` projenin `AGENTS.md`'si yüzünden `CLAUDE.md`'ye `@AGENTS.md.kit-new` yazdıysa bu satırı `@AGENTS.md` yap.
2. Eski `CLAUDE.md`'yi (ve varsa eski `AGENTS.md`'yi) oku ve içindeki projeye özel kuralları listele (kod stili, yasak komutlar, paket yöneticisi, ortam notları, dikkat edilecek yerler). Kitin kurallarıyla aynı olanları ayıkla.
3. Kalanları **çoklu seçimle** sor: "Eski kurallardan hangileri yeni AGENTS.md'ye girsin?" Kitin kuralıyla çelişen varsa ayrıca belirt.
4. Seçilenleri `AGENTS.md`'ye `## Proje kuralları` bölümü olarak ekle ("Temel kurallar"dan sonra; sadece Claude Code'a özel olanlar `CLAUDE.md`'ye). Eskileri `docs/archive/claude-md-eski.md` (ve `agents-md-eski.md`) olarak sakla, `.kit-new` dosyalarını sil.

## Adım 5: Testler ve kritik akışlar

1. Adım 1'deki test sonucunu hatırlat. Kırmızı testler ve hiçbir şeyi doğrulamayan testler bulgu olarak kaydedilir.
2. Kritik akışları öner (giriş, ödeme, veri kaydı ve silme gibi; 3-7 akış) ve çoklu seçimle onaylat. `docs/quality/test-plan.md`'ye yaz.
3. **Her kritik akışın doğru davranışını kullanıcıya sor** ("Şifre yanlışsa ne olmalı?" gibi somut sorular). Kodun şu anki davranışı test için kaynak değildir: kod yanlış olabilir. Kod ile cevap çelişirse bunu bulgu olarak yaz ve düzeltme görevini Adım 8'e ekle.
4. Kural: Yapı taşınmadan önce bu akışlara uçtan uca test yazılır. Sonrasında her görev dokunduğu kodun testini kendisi yazar. Bütün projeye toplu test yazılmaz.

## Adım 6: Derin tarama (seçildiyse)

Adım 0'da seçilen bulgu raporlarını çalıştır (`/findings-all <türler>` veya tek tek). Kritik ve yüksek bulguları Adım 8'deki yol haritasına aday olarak al.

**İnsan için kod haritası (isteğe bağlı):** Kullanıcı kodu kendisi de görsel olarak keşfetmek isterse Understand-Anything öner (`yayin` paketi: `node .claude/hooks/tools.mjs --required yayin`). `/understand` ilk çalıştırmada bütün kodu okur, büyük projede pahalıdır: maliyeti söyle ve sor. Türkçe çıktı yok; `--language en` kullan. Sonra `/understand-dashboard`. Kod haritası (codebase-memory-mcp) ajan içindir, bu insan içindir; biri diğerinin yerine geçmez.

## Adım 7: Kurul ve tasarım (isteğe bağlı)

Pahalı adımlar: önce maliyeti söyle (`docs/workflow/usage-limits.md`), sonra sor: Yap / Hafif yap / Sonraya bırak.
1. **Kurul:** `/start` Adım 6.
2. **Tasarım** (arayüz varsa): Önce mevcut arayüzden `DESIGN.md` çıkar (`impeccable:impeccable` → extract); sonra sor: mevcut tasarımı koru / iyileştir / yeni yön (`/design genel`).

## Adım 8: Uyum yol haritası → `docs/product/roadmap.md`

Kitin "Faz 0" şablonunu bu projeye göre yeniden yaz. Sıra önemli:
1. **Faz 0: Güvenli zemin.** Kilit dosyası ve sürüm dosyası, README kurulum adımları, CI ve pre-commit, kırmızı testlerin durumu. Sonra her kritik akış için ayrı görev: "Ö-xx uçtan uca testi (doğru davranışa göre)".
2. **Faz 1: Yapıyı taşı.** Proje kitin klasör yapısına (`docs/architecture/structure.md`) taşınır. Her özellik ayrı görevdir (tek oturumluk). Kurallar:
   - Taşıma ayrı bir dalda yapılır (`uyum/yapi`).
   - Her görev sonunda testler ve uygulama çalışıyor olmalıdır. Testler yeşilse çalışan nokta kaydedilir (`checkpoint.mjs --save`). Bozulursa `/rollback` ile dönülür.
   - Taşıma bitene kadar eski klasörler `.claude/structure.json` → `allow` listesine geçici olarak eklenir (CI yapı denetimi kırmızı kalmasın). Bu bir yapı kararıdır: kullanıcıya sor. Faz 1'in son görevi bu geçici satırları silmektir.
3. **Faz 2: Bulgular.** Kullanıcının beğenmediği şeyler, kod ile doğru davranış arasındaki çelişkiler ve bulgu raporlarının kritik maddeleri, önem sırasıyla.
4. **Faz 3 ve sonrası:** Yeni özellikler (PRD'deki eksikler).

Sor: "Faz 2'de önce hangisiyle başlayalım?" Yol haritasını özetle ve onay al.

## Adım 9: Kapanış

1. `docs/workflow/progress.md`: Aktif faz `Faz 0`, aktif görev `G-001`, başlangıç adımı `9/9`, sıradaki adım, bekleyen kararlar.
2. `node .claude/hooks/dashboard.mjs` çalıştır.
3. Özet ver: tip ve stack, mevcut test durumu, kritik akışlar, AGENTS.md'ye taşınan kurallar, yapı farkı, en önemli 3 bulgu, ilk görev, kalan limit.
4. Commit öner: `docs: kit uyumu (adopt)`.
5. Son satır: "Devam: `/build G-001`".
