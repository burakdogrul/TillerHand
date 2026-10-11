# Kit Değişiklik Günlüğü

Kit sürümü `kit/SURUM` dosyasında. Bir projeyi güncellemek: projede `/kit-guncelle`.
"Elle uyarla" notu olan maddeler projeye ait dosyalardadır; güncelleme bunlara dokunmaz.

## [Yayınlanmamış]

## [2.1.0] - 2026-10-11

### Eklendi
- **Uzman kurulu:**
  - 10 rol şablonu (`.claude/kurul/`): Ürün, Mimar, UX, Performans/SEO, KVKK, QA, DevOps, Mobil, API ve AI. Güvenlik üyesi olarak `guvenlik-denetcisi` kullanılır.
  - `/baslat` Adım 6'da tipe göre kurul önerilir, onaylanır ve projeye özel ajanlar `.claude/agents/kurul-*.md` olarak üretilir.
  - Toplantılar: plan, görev sonu, commit (hafif) ve faz sonu/canlıya alma.
  - Kurul danışmandır; kritik bulguda durdurur.
  - `/kurul` komutu ve `docs/KURUL.md` toplantı günlüğü.
- **Commit kapısı hook'u** (`commit-kapisi.mjs`): AI'nın commit'i hafif kurul denetimi olmadan geçmez. Sadece doküman değiştiyse muaf; `docs/KURUL.md` üzerinden kapatılabilir.
- **Limit farkındalığı:**
  - `limit.mjs` ve durum çubuğu Claude Code'un `rate_limits` bilgisini okur ve önbelleğe alır. Masaüstünde `get_usage` aracı kullanılır.
  - `docs/LIMIT-PLANI.md`: eşikler, maliyet tahmini, sarı/kırmızı seviyede seçenekler, güvenli durma.
  - Görev maliyetleri `docs/MALIYET-GUNLUGU.md`'ye kaydedilir.
  - `docs/ILERLEME.md`'ye "Kaldığı yer" bölümü eklendi.
- **Kod haritası:** `/baslat`, codebase-memory-mcp kurulumunu önerir; CLAUDE.md onu öncelikli keşif aracı yapar.
- **Durum panosu ve oturum notu:** Limit, kurul ve "kaldığı yer" bilgisi eklendi.

### Değişti
- **Açılış yükü yaklaşık 8.000 token'dan 1.700 token'a indi:**
  - `CLAUDE.md` artık sadece `docs/ILERLEME.md`'yi içe aktarıyor.
  - Protokol, skill ve stack kuralları CLAUDE.md'de özet olarak duruyor; ayrıntılı dokümanlar gerektiğinde okunuyor. *(Elle uyarla: CLAUDE.md)*
- **`/baslat` 9 adım oldu** (yeni adım: Kurul). *(Elle uyarla: ILERLEME.md'deki `Başlangıç adımı` satırının paydası 9 oldu)*
- **`guvenlik-denetcisi`:** `model: sonnet` ve kurul çıktı formatı eklendi.
- **Komutlar güncellendi:** `/planla`, `/gelistir`, `/incele`, `/oturum-sonu`, `/canliya-al` ve `/durum` artık kurul toplantılarını ve limit kontrolünü içeriyor.

## [2.0.0] - 2026-10-11

Soru odaklı akış ve GitHub template yapısı. **Kırıcı değişiklik:** 1.x projeleri otomatik güncellenemez (`.kit.json` biçimi ve dosya düzeni değişti).

### Eklendi
- **Karar protokolü** (`docs/KARAR-PROTOKOLU.md`):
  - Her ürün, teknik, tasarım, içerik, veri, güvenlik ve maliyet kararı AskUserQuestion ile sorulur.
  - Önerilen seçenek ilk sıradadır ve her seçeneğin ne zaman daha iyi olduğu açıklanır.
- **Soru modu:** Konu bazlı kapatılıp açılır (`/soru`, ya da "tasarımda sorma" demek yeterli). Kapalı konudaki kararlar "otomatik" olarak kaydedilir.
- **Görsel önizleme:** Tasarım kararları `.onizleme/` altında üretilen örneklerle sorulur.
- **Skill yönlendirme** (`docs/SKILLER.md`):
  - Caveman, Impeccable, Taste Skill (stil yönüne göre), UI UX Pro Max, Humanizer, Ponytail, Matt Pocock skills.
  - Bu plugin'ler `.claude/settings.json`'da tanımlı; proje açılınca Claude Code kurmayı önerir.
- **Raporlama:**
  - Her cevabın sonunda durum bloğu.
  - Alt durum çubuğu (`statusline.mjs`).
  - `/durum` komutu ve `DURUM.html` panosu (`durum-panosu.mjs`).
- **`/baslat` sihirbazı:**
  - 8 adım: fikir sorgulama, proje tipi, kurulum, teknoloji, mimari, tasarım, yol haritası, kapanış.
  - Kaldığı adımdan devam eder.
- **STACK.md'lere "Karar noktaları" kataloğu:** Her tip için seçenekler ve hangisinin ne zaman daha iyi olduğu.
- **Yeni komutlar:** `/tasarim`, `/soru`, `/durum`, `/kit-guncelle`.
- **`docs/KARARLAR.md`'ye karar günlüğü tablosu.**
- **`docs/ILERLEME.md`'ye yeni alanlar:** başlangıç adımı, soru modu, bekleyen kararlar.

### Değişti
- **Template yapısı:**
  - Repo kökü artık ortak katmanın kendisi.
  - Tipler ve ekler `kit/sablon/` altında.
  - `/baslat`, `node kit/kit.mjs kur` ile tipi yerleştirir ve `kit/` klasörünü siler.
- **Kurulum aracı Node.js'e taşındı** (`kit/kit.mjs`). `kit.ps1` kaldırıldı.
- **Tip katmanları birleştirmeyle uygulanıyor:** `.gitignore.ekle` ve `.claude/settings.birlestir.json` artık kökteki dosyalarla birleştiriliyor.
- **`TASARIM.md`:** Belirteçler Impeccable'ın `DESIGN.md` dosyasına taşındı. TASARIM.md artık seçilen yön, karar günlüğü ve kalıcı kurallar için.
- **Komutlar:** `/planla`, `/gelistir`, `/incele`, `/hata-ayikla`, `/canliya-al`, `/bakim`, `/retro` ve `/oturum-sonu` karar sorma ve skill adımlarıyla güncellendi.
- **`/retro`:** Kit önerileri artık kit reposunda bir dal olarak hazırlanır ve onayla push edilir.

## [1.1.0] - 2026-10-11

### Eklendi
- **Otomatik kontroller**
  - Claude Code hook'ları (`.claude/hooks/`): sır yazımını engelleme, dosya biçimlendirme, oturum başında git ve ILERLEME durumu.
  - Commit öncesi kontrol: web/mobil için husky + lint-staged, backend için pre-commit. İkisi de sır taraması yapar.
  - GitHub Actions CI ve Dependabot (her tip için).
- **İnceleme**
  - `inceleyici` ve `guvenlik-denetcisi` alt ajanları (`.claude/agents/`).
  - `/incele` artık bu ajanları kullanıyor.
- **Doğrulama:** `/gelistir`'e "kanıt üret" adımı, STACK.md'lere "Doğrulama" bölümü, "Bitti" tanımına kanıt maddesi.
- **MCP:** `.mcp.json` (Playwright, Supabase salt-okunur, Sentry). `/bakim` bunları kullanabiliyor.
- **Yeni dokümanlar:** `docs/SOZLUK.md`, `docs/LANSMAN.md`, `docs/RETRO.md`; web ve mobil için `docs/TASARIM.md`.
- **AI eki** (`-Ekler ai`): `docs/AI.md`, `evals/`, `prompts/`, `.env.example` parçası.
- **`/retro` komutu:** dersleri projeye ve kite geri yazar.
- **`kit.ps1`:** `yeni` ve `guncelle` işlemleri. Projede `.kit.json` ile dosya takibi yapılır; güncelleme kullanıcının değiştirdiği dosyaları ezmez.
- Testler: `testler/`.

### Değişti
- `yeni-proje.ps1` kaldırıldı, yerine `kit.ps1 yeni` geldi.
- Yol haritası Faz 0'a pre-commit + CI (G-004) ve SOZLUK/TASARIM (G-007) görevleri eklendi; sonraki görev numaraları kaydı. *(Elle uyarla: YOL-HARITASI.md)*
- `CLAUDE.md`'ye yeni dokümanlar, hook ve ajan kuralları eklendi. *(Elle uyarla)*
- Backend bağımlılık taraması `uv run --with pip-audit pip-audit` oldu. Eski `uvx pip-audit` komutu projenin değil, kendi ortamını tarıyordu. *(Elle uyarla: STACK.md, settings.json)*
- `CANLIYA-ALMA.md`'ye CI, dal koruması, AI eki ve lansman maddeleri eklendi.

## [1.0.0] - 2026-10-11

### Eklendi
- İlk sürüm: ortak dokümanlar, 8 komut, web-saas / mobil / backend şablonları, `REHBER.html`.
