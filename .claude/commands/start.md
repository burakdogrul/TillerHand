---
description: Projeyi fikirden başlatır. Her adımda soru sorarak tip, stack, mimari, tasarım ve yol haritasını kullanıcıyla birlikte kararlaştırır.
argument-hint: [proje fikri, 1-3 cümle]
---

Fikir: $ARGUMENTS

Bu bir **9 adımlı sihirbaz** (0-9). Kullanıcı hiçbir şeyi bilmiyormuş gibi davran: Her kararı `docs/workflow/decision-protocol.md`'ye göre sor (AskUserQuestion, önerilen seçenek ilk sırada, her seçeneğin ne zaman daha iyi olduğu açıklamalı). Kendi kafana göre karar verme. Bu oturumda uygulama kodu yazma. Her kararı tek yönlü / çift yönlü kapı olarak sınıfla (`docs/workflow/decision-protocol.md` §2a); veritabanı, auth, ödeme ve veri modeli gibi tek yönlü kararlarda önce kurul görüşü al (veritabanı ve auth'ta karar konseyi; profil kuralı `.claude/board/council.md`).

**Devam etme:** `docs/workflow/progress.md` → `**Başlangıç adımı:**` 0'dan büyükse kaldığın adımdan devam et ve bunu kullanıcıya söyle. Her adım bitince bu satırı (`N/9`) ve `**Son güncelleme:**` satırını güncelle; sonra durum bloğunu yaz. Ağır adımlardan (1b araştırma, 4, 6, 7) sonra sıradaki adıma geçmeden tek satırla `/clear` öner: adımın sonucu dosyalarda, sonraki adım onları okur; her tur bütün bağlamı yeniden okuduğu için temiz oturum ucuzdur. `/start` yeniden çağrılınca kaldığı adımdan devam eder.

**Kararlar anında kaydedilir:** Her kararı verildiği anda `docs/decisions/log.md` → Karar günlüğüne yaz (adım sonunu bekleme). Pano kararları ve adım ilerlemesini oradan canlı gösterir.

**Pahalı adımlar** (Adım 4'teki karar konseyi, Adım 6 kurul, Adım 7 tasarım): Başlamadan tahmini maliyeti (`docs/workflow/usage-limits.md` tablosu) ve kalan limiti tek satırla söyle. Adım kaldırılmaz; seçim kullanıcıdadır. Ayrıntılı derinlikte bildir ve yap. Hızlı ve Standart'ta sor: **Yap** / **Hafif yap** / **Sonraya bırak**. Önerilen: Hızlı'da "Sonraya bırak", Standart'ta "Hafif yap".
- Hafif yap: Adım 4'te konsey yerine tek danışman görüşü; Adım 6'da önerilen 3 üye tek onayla; Adım 7'de tek önizleme turu (stil yönü), renk ve yazı tipi o yönün önerilen setinden.
- Sonraya bırak: Adım 4'te tek yönlü kararı yine kullanıcı verir (önerilen + gerekçe ile). Adım 6 ve 7 için Faz 0'a görev eklenir (`/board setup`, `/design genel`).

---

## Adım 0: Hazırlık

0. **Profil** (ilk soru): Hafif / Standart / Tam. Tabloyu `.claude/board/council.md` → "Ne zaman"den göster; Pro planda **Hafif** önerilen, Max planda Standart. Seçimi `docs/workflow/progress.md` → `**Profil:**` satırına yaz.
   - **Hafif:** Şu eklentileri proje kapsamında kapat (her biri için `claude plugin disable <id> --scope project`): hookify@claude-plugins-official, claude-md-management@claude-plugins-official. (Paket eklentileri her profilde zaten kapalı gelir; komutlar gerektiğinde açmayı sorar.) `docs/workflow/board.md` → `**Commit denetimi:** kapalı`.
   - **Standart / Tam:** Eklentiler ve commit denetimi açık kalır.
   - **Komut listesi:** Hafif ve Standart'ta çekirdek dışı 19 komut skill listesinde sadece adıyla durur (`/` menüsünde var, adıyla çağrılır; kit varsayılanı). **Tam:** `node .claude/hooks/tools.mjs --commands full` (bütün açıklamalar listede; 200K bağlamda liste taşabilir).
   - Profil sonradan değiştirilebilir; aynı adımları tersine uygula.
0a. **Planlama derinliği** (ikinci soru, profilden ayrı: profil sürekli maliyeti, derinlik sadece bu sihirbazı belirler). Seçenekleri `docs/workflow/usage-limits.md` tablosundaki tahmini maliyetle göster. Fikir netse ve Pro plandaysa **Hızlı**, fikir belirsizse veya üründe ödeme/kişisel veri varsa **Standart** önerilen. Seçimi `**Profil:**` satırına ekle (örn. `Hafif · derinlik: Hızlı`).
   - **Hızlı:** Adım 1 tek tur (problem, kitle, MVP çoklu seçim); kabul kriterleri taslak olarak tek onayla. Adım 4'te önerilen stack tek ekranda onaylanır. Adım 5 sadece veri modeli ve giriş yöntemi; dış servis ve birim ekonomisi ilgili göreve kalır.
   - **Standart:** Bütün adımlar; pahalı adımlar başlamadan sorulur.
   - **Ayrıntılı:** Bütün adımlar tam haliyle.
0b. **Anlatıcı mod:** Sor: "Yazılımı yeni öğreniyorsan, Anlatıcı mod her değişikliği ve hatayı sade Türkçe anlatır. Cevaplar biraz uzar, bu da biraz daha fazla token demek. Açılsın mı?" Seçenekler: "Evet" ve "Hayır, kısa cevaplar". Kullanıcının bilgi seviyesi düşükse "Evet" önerilen olsun.
    - Evet ise `.claude/settings.local.json` dosyasına `"outputStyle": "anlatici"` ekle (dosya varsa birleştir; bu dosya git'e girmez, kişisel ayardır).
    - Mod bir sonraki mesajdan itibaren geçerli olur. Terminalde `/output-style anlatici` komutu da aynı işi yapar. Kapatmak için değeri sil.
0c. **Araç:** Bu projede hangi yapay zekâ araçlarıyla çalışılacak? `.kit.json` → `tool` doluysa (`init` sırasında seçildi) tek satırla bildir, tekrar sorma. Yoksa **çoklu seçimle** sor:
    - **Claude Code (Önerilen):** Kit bunun için yazıldı; bütün özellikler (kurul ajanları, soru arayüzü, durum çubuğu, limit).
    - **Codex:** Kurallar `AGENTS.md`'den, komutlar skill olarak (`$start`), korumalar `.codex/hooks.json` ile. Kurul tek model, seçenekler düz metin, durum çubuğu yok.
    - **Antigravity:** Kurallar `AGENTS.md`'den, komutlar skill olarak (`/start`), korumalar `.agents/hooks.json` ile. Kurul tek model, durum çubuğu yok.
    Seçimi `**Profil:**` satırına ekle (örn. `araç: claude,codex`) ve Adım 3'teki kurulum komutuna `--tool <liste>` olarak ver. Claude Code dosyaları her durumda kurulur (hook betikleri ortaktır).
0d. **Auto memory** (sadece Claude Code): Claude Code varsayılan olarak düzeltmelerinden kendine not tutar. Notlar bu makinede kalır, git'e girmez, ekip görmez ve kimse gözden geçirmez. Sor:
    - **Kapalı (Önerilen):** Projenin hafızası `AGENTS.md`, `progress.md` ve karar günlüğünde; görünür ve git'te. Tekrarlayan hatalar `/fix-bug` ile "Öğrenilen kurallar"a önerilir. `.claude/settings.json`'a `"autoMemoryEnabled": false` ekle (dosyayı birleştir).
    - **Açık:** Tercihlerin oturumlar arasında kendiliğinden hatırlanır; notlar `AGENTS.md` ile çelişebilir. Ayara dokunma.
    Seçimi `**Profil:**` satırına ekle (örn. `hafıza: kapalı`). Kaynak: code.claude.com/docs/en/memory (2026-10-25).
0e. **Model ve effort** (`docs/workflow/models.md`): `/build` adım 0b'deki iki ekranı sor ve kaydet. Planlama işleri ana oturumda, araştırma ve tarama doküman rolünde, kurul inceleme rolünde çalışır; Adım 6'da model ayrıca sorulmaz.
1. Ortamı kontrol et ve tek satırla raporla: `node --version`, `git --version` ve kitin yeri. İki kurulum yolu var: kökte `kit/kit.mjs` (template yolu) ya da `.kit.json` → `kit` alanındaki klasör (`init` ile kurulmuş, `type` boş). `kit` alanı `npx:tillerhand@<sürüm>` ise kit npm paketinden kurulmuştur. `local` ise klasörün bu makinedeki yolu git dışı `.kit.local.json` → `kit`'tedir; o dosya yoksa kullanıcıya kit klasörünü sor ya da `npx -y tillerhand@<.kit.json → version>` kullan. Klasörde zaten uygulama kodu varsa (`package.json`, `pyproject.toml`, `src/` vb.) dur ve `/adopt` öner.
2. `docs/workflow/skills.md`'deki plugin'lerin skill'leri senin skill listende var mı bak. LSP eklentisi dil sunucusu ister: web ve mobil için `npm i -g typescript-language-server typescript`, backend için `npm i -g pyright` (global kurulum; kullanıcı onayıyla). **Eklentiler:** Proje ayarı eklentileri açar ama indirmez; kurulmamış olanlar yükleme hatası verir ve skill'leri gelmez. Kullanıcıya listeyi göster ve sor: "Proje ayarındaki eklentiler kurulsun mu?" Önce `node .claude/hooks/plugins-sync.mjs` ile eksikleri listele; onay gelirse `node .claude/hooks/plugins-sync.mjs --install` çalıştır. Betik eksikleri proje kapsamında kurar, `false` olanları (paket eklentileri: tasarım, güvenlik, yayın, video) kurup kapatır. Kullanıcıya tek cümleyle söyle: "Paketler kapalı gelir, ilgili komut gerektiğinde açmayı sorar; durum için `/tools`." Sonra kullanıcıdan `/reload-plugins` çalıştırmasını iste. claude CLI yoksa eksik eklentilerin `/plugin install x@y` komutlarını ver ve "Kurup devam edelim mi, eksik skill olmadan mı?" diye sor.
3. `caveman:caveman` skill'ini yükle (rapor dili).
4. **Limit:** Limiti oku (`docs/workflow/usage-limits.md` §1) ve raporla. Seçilen derinliğin tahmini maliyetini kalan limitle karşılaştır; adımlar arasında durup sonra devam edilebileceğini söyle. Seviye sarı veya kırmızıysa bunu tek satırla söyle; durdurma.
5. **Kod haritası:** Oturumda codebase-memory-mcp araçları (`index_repository`, `search_graph` vb.) var mı bak. Yoksa sor: "Kod haritası kurulsun mu? AI, kodu dosya dosya okumak yerine sorgular; proje büyüdükçe oturum başına ciddi token tasarrufu sağlar."
   - **Kur (Önerilen):** Kurulumu kullanıcı kendi terminalinde yapar; uzaktan indirilen script'i sen çalıştırma. Resmi komutları ver:
     - Windows (PowerShell): `Invoke-WebRequest -Uri https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1 -OutFile install.ps1; Unblock-File .\install.ps1; .\install.ps1`
     - macOS/Linux: `curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash`
     - Installer Claude Code'a kendisini kullanıcı düzeyinde tanıtır (MCP, hook, skill). Sonra Claude Code yeniden başlatılır ve `/mcp` ile kontrol edilir. Otomatik indeks için: `codebase-memory-mcp config set auto_index true`. Kaynak: github.com/DeusData/codebase-memory-mcp
   - **Şimdilik kurma:** Küçük proje için yeterli; sonra kurulabilir.
6. **Bildirimler:** Claude soru sorduğunda veya uzun bir işi bitirdiğinde masaüstü bildirimi gelir (`.claude/hooks/notify.mjs`). Kapatmak için `KIT_NOTIFY=off`.
6b. **Pano:** `node .claude/hooks/dashboard.mjs` çalıştır. Sor: "Pano kararları ve adım ilerlemesini canlı gösterir, her cevaptan sonra kendini yeniler. Tarayıcıda açayım mı?" Evet ise aç: Windows `start dashboard.html`, macOS `open dashboard.html`, Linux `xdg-open dashboard.html`.
7. Fikir boşsa sor: "Ne yapmak istiyorsun? 1-3 cümleyle anlat."

## Adım 1: Fikri netleştir → `docs/product/prd.md`

`mattpocock-skills:grilling` yaklaşımıyla fikri sorgula. Soruları **AskUserQuestion ile, turlar halinde** sor (her tur en fazla 4 soru). Mümkün olan her soruya fikirden çıkardığın 2-4 somut seçenek ve önerini koy; açık uçlu soruyu sadece seçenek üretemiyorsan sor.

Sırayla netleştir:
1. Problem ve hedef kullanıcı (kim, hangi durumda, şu an ne kullanıyor?)
2. Değer önerisi ve rakiplerden farkı
3. MVP özellikleri: Fikirden 5-8 aday özellik çıkar. "Hangileri ilk sürümde olmalı?" diye **çoklu seçim** ile sor. Seçilmeyenler "Kapsam dışı" olur.
4. Her MVP özelliği için kabul kriteri taslağı yaz ve onaylat.
5. Başarı kriterleri, gelir modeli (ücretsiz / abonelik / tek seferlik / reklam), bütçe (aylık altyapı + AI), süre.
6. Kişisel veri, ödeme ve AI kullanımı var mı?

MVP büyük görünüyorsa küçültmeyi bir karar olarak sor. Fikirdeki riskleri açıkça söyle. `docs/product/prd.md`'yi yaz, özetini göster, onay al.

**1b. Araştırma (pahalı adım, isteğe bağlı):** Sor: "Fikirle ilgili makaleleri, GitHub'daki benzer projeleri ve rakip ürünleri araştırayım mı? Hızlı araştırma 5 saatlik limitin yaklaşık %10-15'i." Seçenekler: Yap / Sonraya bırak (Faz 0'a `/research` görevi eklenir). Önerilen: fikir alanı tanıdık değilse veya ticari üründe "Yap", aksi halde "Sonraya bırak". Yap ise `/research` akışını uygula; seçilen özellikler PRD'ye girer.

## Adım 2: Proje tipi

AskUserQuestion ile sor. Seçenekleri ve önerini PRD'ye göre gerekçelendir:
- **Web uygulaması / SaaS:** Tarayıcıdan kullanılan ürün, açılış sayfası + panel. SEO, hızlı yayın, mağaza onayı yok.
- **Mobil uygulama:** Cihaz özellikleri (kamera, bildirim, konum), günlük alışkanlık ürünü. Mağaza süreci ve iki platform var.
- **Backend / API / otomasyon:** Arayüzü olmayan servis, bot, veri işleme, başka uygulamalara API.

Kullanıcı birden fazlasını isterse (örn. web + mobil) önce hangisinin MVP olacağını sor; diğeri yol haritasına sonraki faz olarak girer.

Ayrıca sor: **Projede yapay zeka (LLM) özelliği olacak mı?** Evet ise AI eki kurulur. **Türkiye'de satış yapacak veya Türk kullanıcısı olacak mı?** Evet ise Türkiye eki (`tr`) önerilir: KVKK yurt dışı aktarım, e-Fatura/e-Arşiv, iyzico/PayTR bildirim imzası (web-saas ve backend'de kodlu), İ/ı testleri. Birden fazla ek virgülle: `--addons ai,tr`.

## Adım 3: Kurulum

Kullanıcıya ne yapılacağını tek cümleyle söyle, sonra çalıştır:

```bash
# template yolu (kökte kit/ var): kit/ kurulumdan sonra silinir
node kit/kit.mjs install --type <web-saas|mobile|backend> [--addons ai,tr] [--tool claude,codex,antigravity]
# init yolu (.kit.json → kit; "local" ise .kit.local.json → kit, o dosya yoksa kullanıcıya sor): kit klasörüne dokunulmaz; araç init'te seçildiyse --tool gerekmez
node <kit>/kit/kit.mjs install --type <web-saas|mobile|backend> [--addons ai,tr] --project .
# npm yolu (.kit.json → kit = npx:tillerhand@<sürüm>): aynı sürümle. Sürüm tam olarak 1.2.3 biçiminde ve .kit.json → version ile aynı değilse dur, kullanıcıya sor
npx -y tillerhand@<sürüm> install --type <web-saas|mobile|backend> [--addons ai,tr] --project .
```

Çıktıyı raporla. Artık `docs/architecture/stack.md` seçilen tipin dosyasıdır. Proje yapısını (`docs/architecture/structure.md`) kullanıcıya kısaca göster: kod özellik bazlı olacak, yapı haritası (`.claude/structure.json`) korunacak, deneme işleri `sandbox/` altına gidecek. Commit öner: `chore: kit kurulumu (<tip>)`.

## Adım 4: Teknoloji kararları → `docs/architecture/stack.md`

`docs/architecture/stack.md` → **"Karar noktaları"** bölümündeki her kararı sırayla sor (birbirine bağlı olanlar sırayla, bağımsızlar aynı turda, en fazla 4).
- Katalogdaki seçeneklerden bu projeye en uygun 2-4 tanesini seç. Önerini PRD'ye dayandır (kitle, bütçe, ölçek, ekip bilgisi, SEO ihtiyacı vb.).
- Sürüm, fiyat veya ücretsiz katman bilgisine dayanan seçeneklerde yalnız değişeni doğrula: katalogda `(kaynak: <adres>, YYYY-AA-GG)` notu 90 günden yeni olan iddiayı yeniden araştırma. Notsuz ya da eski iddiaları, kullanıcıya sunacağın seçeneklerle sınırlı olarak, adımın başında tek bir `source-research` turunda topla (karar başına ayrı araştırma yok). Doğruladığın iddianın yanına bu projenin `stack.md`'sinde kaynak ve tarih notunu yaz.
- Kullanıcı "hangisi daha iyi, emin değilim" derse farkları somut bir örnekle anlat ve tekrar sor.

Bütün kararlar bitince:
1. docs/architecture/stack.md → "Seçilen teknolojiler" tablosunu doldur.
2. Seçim önerilenden farklıysa docs/architecture/stack.md'nin Komutlar, Klasör yapısı, Kodlama kuralları, AI hataları ve Doğrulama bölümlerini seçime göre yeniden yaz. Bunlara bağlı `.github/workflows/ci.yml`, `.claude/settings.json` izinleri, `.env.example`, pre-commit ayarları ve `.mcp.json` dosyalarını da uyarla. Farkları raporla.
3. `AGENTS.md` → Komutlar bölümünü doldur. `önizleme:` satırına uygulamanın yerel adresini yaz (örn. `http://localhost:3000`); arayüzü olmayan projede boş kalır.
3a. **Başka bilgisayarda kurulabilirlik:** Çalışma ortamı sürümünü sabitle: Node için `.nvmrc`, Python için `.python-version` (sürüm stack.md'deki). `README.md` → Gereksinimler (çalışma ortamı ve sürümü, sistem bağımlılıkları: veritabanı, ffmpeg vb., hesaplar) ve Kurulum bölümlerini doldur; komutlar `AGENTS.md` → Komutlar ile aynı olsun. Kilit dosyası (`package-lock.json`, `uv.lock` vb.) ilk paket kurulumunda oluşur ve commit'e girer.
3b. **Stack skill'leri:** Web'de (React/Next) `npx -y skills@1.7.2 add vercel-labs/agent-skills --skill react-best-practices --skill composition-patterns -a claude-code -y --copy`, mobilde `--skill react-native-guidelines` ile çalıştır. Gelen SKILL.md dosyalarını kurmadan önce oku (üçüncü taraf içerik). Mobilde Maestro CLI kurulu değilse kurulumunu söyle (`docs/workflow/mcp-catalog.md`).
3c. **3D (web, PRD'de 3D sahne, ürün görselleştirme veya WebGL efekti varsa):** three.js `teknik` karar olarak sorulur. Seçilirse `CloudAI-X/threejs-skills`'ten (MIT, topluluk) üç skill sabit commit'ten kopyalanır: `threejs-fundamentals`, `threejs-performance` ve React'te `threejs-react-three-fiber`. Her biri için `curl -fsSL https://raw.githubusercontent.com/CloudAI-X/threejs-skills/0e181866f095b5f06d005133876e926515390d95/skills/<ad>/SKILL.md -o .claude/skills/<ad>/SKILL.md` (klasörü önce oluştur). Dosyaları kurmadan önce oku (üçüncü taraf içerik). Diğer konular (shader, ışık, yükleyici) için skill eklenmez, Context7 kullanılır. 3D kuralları `ui-motion` → "3D".
4. `docs/decisions/log.md`: Günlükte eksik karar kalmadığını kontrol et, teknoloji yığınını `docs/decisions/adr-0001-tech-stack.md` olarak kaydet (şablon: `adr-template.md`).

## Adım 5: Mimari → `docs/architecture/overview.md`, `docs/product/glossary.md`

`mattpocock-skills:domain-modeling` ve `mattpocock-skills:codebase-design` ile:
1. **Veri modeli:** Tablo/varlık taslağını göster. Belirsiz noktaları karar olarak sor: ilişki türü, silme davranışı (kalıcı / çöp kutusu), kişisel veri alanları, saklama süresi.
2. **Kimlik ve yetki:** Giriş yöntemleri (e-posta + şifre, magic link, Google, Apple) ve roller. Çoklu seçimle sor.
3. **Dış servisler:** Aylık maliyet tahminiyle tablo; ücretli olan her servis için onay al. Seçilen servisin `docs/workflow/mcp-catalog.md`'de bağlantısı varsa (GitHub, Stripe, Vercel, PostHog, Figma, Firebase, Linear) kurulmasını öner; kimliği kullanıcı kendisi bağlar (OAuth veya ortam değişkeni). Her servisi `docs/operations/accounts.md`'ye ekle (sahip, 2FA, bitiş tarihi; şifre yazma). Ücretli her servis için `docs/operations/spend-alarms.md` → Alarmlar tablosuna satır ekle ve tavan tutarını sor (önerilen: birim ekonomisindeki aylık tahminin 2 katı).
3b. **Birim ekonomisi** (ücretli ürünse): `docs/product/unit-economics.md` girdilerini fiyat, komisyon, sabit ve kullanıcı başı maliyet tahminleriyle doldur. Katkı payı negatif veya değişken maliyet fiyatın %30'unu geçiyorsa bunu `maliyet` kararı olarak sor (fiyat / kullanım limiti / model seçimi).
4. **Ortamlar:** Lokal / önizleme / prod ayrımı.
5. `docs/product/glossary.md`: Ana kavramlar, arayüz adları ve durum geçişleri. Arayüzde "sen" mi "siz" mi kullanılacağını sor.

AI eki kurulduysa `docs/ai/guide.md` → model envanterini doldur: Hangi özellik hangi model? Bunu maliyet tahminiyle karar olarak sor.

## Adım 6: Uzman kurulu → `.claude/agents/`, `docs/workflow/board.md`

Pahalı adım: önce maliyeti söyle ve derinliğe göre sor (yukarıdaki "Pahalı adımlar").

`.claude/board/rules.md` §5'i uygula:
1. Tipe, PRD'ye ve seçilen stack'e göre kurul öner. Kurulun ne olduğunu kısaca anlat: Uzman ajanlar planı, görevi, her commit'i ve fazı denetler. Danışmandır; kritik bulguda durdurur; karar her zaman kullanıcıda.
2. Üyeleri **çoklu seçimle** onaylat; yeni uzman eklenebileceğini söyle.
3. Üyeler inceleme rolünün modeli ve effort'uyla çalışır (Adım 0e, `docs/workflow/models.md`); ayrıca sorma. Pro planda tam kurul toplantısının tahmini maliyetini söyle (`docs/workflow/usage-limits.md`).
4. Commit denetimi açık mı kalsın? Varsayılan açık ve hafif: en fazla 2 üye, `haiku`, sadece diff.
5. Ajan dosyalarını üret ve "Bu proje" bölümlerini doldur. `docs/workflow/board.md`'yi doldur.
6. Yeni ajanların bir sonraki oturumda yükleneceğini söyle.

## Adım 7: Tasarım yönü (arayüz varsa)

Pahalı adım: önce maliyeti söyle ve derinliğe göre sor (yukarıdaki "Pahalı adımlar"). `/design genel` akışını çalıştır. Görsel önizlemelerle stil yönü, renk, yazı tipi ve detay kararları alınır; sonunda `PRODUCT.md`, `DESIGN.md` ve `docs/design/design-guide.md` hazır olur. Backend tipinde bu adımı atla.

## Adım 8: Yol haritası → `docs/product/roadmap.md`

1. MVP özelliklerini tek oturumluk görevlere böl; Faz 0'daki kurulum görevlerini koru. Her özelliğin ilk görevi "kabul testlerini yaz (kırmızı)" olsun (`docs/quality/test-plan.md` §1a). Ödeme, AI, toplu bildirim ve veri silen özellikler için bayrak görevi ekle (`docs/operations/feature-flags.md`). Faz 1'den itibaren her fazın son görevi "Refactor turu" olsun (karmaşıklık bütçesi tüm depoda temiz: `node .claude/hooks/budget.mjs --check`).
2. Sor: "Faz 1'de önce hangi özellikle başlayalım?" (öneri: en riskli veya en değerli olan).
3. Sor: "Lansman hedefi ne?" (tarih / özellik tamamlanınca / sadece kişisel kullanım). Kişisel kullanımsa `docs/product/launch.md`'yi silmeyi öner.
4. Yol haritasını özetle ve onay al.

## Adım 9: Kapanış

1. `docs/workflow/progress.md`: Aktif faz `Faz 0`, aktif görev `G-001`, başlangıç adımı `9/9`, sıradaki adım, bekleyen kararlar.
2. `node .claude/hooks/dashboard.mjs` çalıştır.
3. Kullanıcıya özet ver: alınan karar sayısı, seçilen stack, kurul üyeleri, tasarım yönü, MVP özellikleri, sonraya bırakılan adımlar, ilk görev, kalan limit.
4. Commit öner: `docs: proje planı`.
5. Son satır: "Devam: `/build G-001`".
