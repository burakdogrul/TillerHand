# Kit Değişiklik Günlüğü

Kit sürümü `kit/VERSION` dosyasında. Bir projeyi güncellemek: projede `/kit-guncelle`.
"Elle uyarla" notu olan maddeler projeye ait dosyalardadır; güncelleme bunlara dokunmaz.

## [Yayınlanmamış]

## [3.0.0] - 2026-10-12

Profesyonel yapı ve bulgu raporları. **Kırıcı değişiklik:** dosya ve komut adları değişti, `.kit.json` biçimi değişti; 2.x projeleri otomatik güncellenemez.

### Değişti
- **Dosya ve klasör adları İngilizce kebab-case oldu** (içerik Türkçe). `docs/` alt klasörlere ayrıldı: `product`, `architecture`, `design`, `decisions`, `quality`, `security`, `legal`, `operations`, `workflow`, `findings`, `archive`.
  - Örnekler: `docs/PRD.md` → `docs/product/prd.md`, `docs/ILERLEME.md` → `docs/workflow/progress.md`, `docs/KARARLAR.md` → `docs/decisions/log.md`.
- **Komutlar İngilizce oldu:**

  | Eski | Yeni | Eski | Yeni |
  |---|---|---|---|
  | `/baslat` | `/start` | `/oturum-sonu` | `/wrap-up` |
  | `/planla` | `/plan-task` | `/canliya-al` | `/release` |
  | `/gelistir` | `/build` | `/bakim` | `/maintain` |
  | `/incele` | `/review-changes` | `/tasarim` | `/design` |
  | `/hata-ayikla` | `/fix-bug` | `/soru` | `/ask-mode` |
  | `/durum` | `/dashboard` | `/kurul` | `/board` |
  | `/kit-guncelle` | `/kit-update` | `/geri-bildirim` | `/user-feedback` |

  Argümanlar da İngilizce: `setup`, `convene`, `first`, `on`/`off`, `weekly`/`monthly`/`quarterly`.
- **Ajanlar:** `inceleyici` → `code-reviewer`, `guvenlik-denetcisi` → `security-auditor`, `kurul-*` → `board-*`.
- **Hook dosyaları:**
  - İngilizce adlar aldı: `dashboard.mjs`, `commit-gate.mjs`, `package-gate.mjs`, `destructive-guard.mjs`, `usage.mjs`, `reminder.mjs`, `status-read.mjs`, `dashboard-data.mjs`.
  - Çalışma durumu dosyaları `.claude/state/` altında toplandı.
- **Pano:** `DURUM.html` → `dashboard.html`. Tasarım önizlemeleri `.previews/` altında.
- **Kit iç yapısı:**
  - `kit/sablon` → `kit/templates`, `mobil` → `mobile`, `ekler` → `addons`.
  - `SURUM`/`KAYNAK` → `VERSION`/`SOURCE`, `REHBER.html` → `guide.html`, `testler` → `tests`.
  - Özel dosya uzantıları: `.ekle` → `.append`, `.birlestir.json` → `.merge.json`. Çakışma dosyası: `.yeni` → `.kit-new`.
  - `kit.mjs`: `kur`/`guncelle` → `install`/`update`, `--tip`/`--ekler`/`--proje` → `--type`/`--addons`/`--project`. `.kit.json` alanları İngilizce.
- **Ayrıntılı kararlar ADR dosyalarına taşındı:** `docs/decisions/adr-NNNN-*.md` (şablon `adr-template.md`). Karar günlüğü `docs/decisions/log.md`.

### Eklendi
- **Korunan proje yapısı:**
  - Tip başına özellik bazlı yapı haritası (`.claude/structure.json`) ve rehberi (`docs/architecture/structure.md`).
  - `structure-guard.mjs`: Harita dışı yeni dosya için kullanıcıya sorulur; dağınıklık kalıpları (`*.bak`, `*-old.*`, kopya, `temp/`, `deneme*`) engellenir; `--check` ile tüm depo denetlenir.
  - Her tipin CI'ına `structure` işi eklendi. Kurul Mimarı ve `/findings-tech` da yapıyı denetler.
  - `sandbox/` (git dışı deneme alanı) ve `docs/archive/` eklendi.
- **Bulgu raporları:**
  - Komutlar: `/findings-tech`, `/findings-business`, `/findings-security`, `/findings-ux`, `/findings-perf`, `/findings-legal`, `/findings-all`.
  - Ortak protokol (`.claude/findings/protocol.md`), tür başına bakış açısı (`lenses/`) ve rapor şablonu.
  - En fazla 20 bulgu; önem puanı = etki + olasılık + yayılım + aciliyet; alan sağlık puanı; önceki raporla karşılaştırma.
  - Rapor sonrası düzeltme planı, kurul görüşü ve yol haritasına aktarma.
  - Business raporu sektör uzmanı rolünü PRD'den çıkarır, kullanıcıya onaylatır ve web araştırması yapar; ayarlar `docs/findings/config.md`'de tutulur.
- **Panoya "Bulgular" sekmesi:** tür başına sağlık puanı ve değişimi, rapor geçmişi; kritik bulgular "Dikkat" alanına düşer.
- **README yenilendi:** banner (`kit/assets/banner.svg`), rozetler, Mermaid diyagramları.
- **Kitin kendi CI'ı:** `.github/workflows/kit-tests.yml` (projeye taşınmaz).

## [2.3.0] - 2026-10-11

Araştırmaya dayalı 15 öneri.

### Eklendi
- **Güvenlik:**
  - **Paket kapısı** (`paket-kapisi.mjs`): AI'nın kurmak istediği paket kurulumdan önce kayıt defterinden doğrulanır. Var olmayan paket engellenir. Çok yeni, az indirilmiş veya popüler bir pakete çok benzeyen paket için kullanıcıya sorulur (slopsquatting'e karşı).
  - **Yıkıcı komut kalkanı** (`yikici-kalkan.mjs`): `DROP`, `TRUNCATE`, koşulsuz `DELETE`, `db reset`, volume silme, `git clean` engellenir. Prod deploy, ana dala push ve uzak veritabanı bağlantısı için kullanıcıya sorulur. Karar Claude Code'un izin katmanında verilir; AI kendisi atlayamaz.
  - **Ajan yapılandırması koruması:** `CLAUDE.md`, `.claude/`, `.mcp.json` ve `.github/workflows/` düzenlemeleri kullanıcı onayı gerektirir. GUVENLIK.md'ye "AI ajanı güvenliği" bölümü eklendi.
  - **CI'da Semgrep** ve TEST-PLANI'nda saldırgan testleri (IDOR, oturumsuz erişim, rol aşımı, XSS, girdi sınırı, log enjeksiyonu).
- **Kalite:**
  - **Kabul testleri yaşayan şartname oldu:** PRD kriterlerinin kimliği var (`Ö-01.1`), testler koddan önce kırmızı yazılır. Pano JUnit raporunu okur ve "işaretli ama testi yok/kırmızı" uyumsuzluğunu yakalar.
  - **CI'da kopya kod denetimi** (jscpd, eşik %5).
  - **Bağlam sağlığı:** Durum çubuğunda bağlam doluluğu gösterilir. Bir UserPromptSubmit hook'u 12 mesajda bir temel kuralları hatırlatır ve %50/%70 eşiklerinde `/clear` önerir.
  - **`docs/METRIKLER.md`:** Görev süresi, düzeltme oranı, geri alma, kopya kod, kabul oranı aylık olarak kaydedilir; retro bu verilerle yapılır.
- **Operasyon:**
  - **Canlı izleme iş akışı** (web, backend): Kritik akışlar saatlik denenir, bozulursa issue açılır.
  - **Bulut ajanları** (`claude-code-action`): CI kırmızıysa PR dalına düzeltme (döngü ve fork koruması ile) ve haftalık bakım issue'su. Değişkenle açılırlar.
  - **`docs/HESAPLAR.md`:** Servis, sahip, 2FA ve bitiş tarihleri; pano 30 gün içinde dolanları uyarır.
  - **`docs/BAYRAKLAR.md` ve STACK'lerde bayrak yöntemi:** Acil kapatma deploy gerektirmez.
- **Ürün:**
  - **Tek yönlü / çift yönlü kapı:** Karar günlüğüne "Kapı" sütunu eklendi. Tek yönlü kararlarda kurul görüşü ve ayrıntılı kayıt zorunlu.
  - **`docs/BIRIM-EKONOMISI.md`:** Pano katkı payını, başa baş noktasını ve hedefteki kâr/zararı hesaplar.
  - **`/geri-bildirim` komutu ve `docs/GERI-BILDIRIM.md`:** Gelen kutusu, temalar ve yol haritasına aktarma.
- **DURUM panosu:**
  - Yeni "Operasyon" sekmesi: hesaplar, bayraklar, GitHub (CI, açık PR'lar, canlı izleme; gh varsa 5 dk önbellekle).
  - Kabul testi tablosu, metrik eğilimi, birim ekonomisi, geri bildirim, bağlam kartı, karar kapı filtresi.
  - "Dikkat" listesi önem sırasına dizilir; ilk 6 madde gösterilir, kalanı açılır.

### Değişti
- **`docs/KARARLAR.md` karar günlüğü 8 sütun oldu (Kapı).** Pano eski 7 sütunlu tabloyu da okur. *(Elle uyarla: KARARLAR.md tablo başlığı)*
- **`docs/MALIYET-GUNLUGU.md`'ye "Süre (dk)" sütunu eklendi.** *(Elle uyarla)*
- **`docs/PRD.md` kabul kriterlerine kimlik eklendi.** *(Elle uyarla)*
- **Komutlar güncellendi:** `/baslat`, `/planla`, `/gelistir`, `/bakim`, `/retro`, `/canliya-al` ve `/oturum-sonu` yeni kuralları uygular.

## [2.2.0] - 2026-10-11

### Değişti
- **DURUM.html proje sahibinin kontrol paneline dönüştü:**
  - Üst bölümde "Şimdi" (aşama, görev, sıradaki adım) ve "Dikkat gerektirenler" alanları var. Burada kurul RET'i, limit, bekleyen kararlar, yarıda kalan iş, açık sorunlar, eski ILERLEME ve soru modu görünür.
  - Genel sağlık rozeti: Yolunda / Dikkat / Engel var.
  - Özet kutucuklar: görevler, MVP kabul kriterleri, kararlar, kurul, son 7 günün commit'leri, limit.
  - 8 sekme: Genel, Yol haritası (görev listesi, aktif görev vurgulu), Kararlar (konu filtresi), Kurul, Kalite (kontrol listeleri, kod sağlığı, düzeltme oranı, kritik akış testleri, bakım), Aktivite (14 günlük commit grafiği ve birleşik akış), Ürün ve teknik (PRD, MVP, stack, tasarım, önizleme bağlantıları, CHANGELOG), Limit ve maliyet.
  - Açık ve koyu tema, 30 saniyede bir otomatik yenileme, klavyeyle sekme gezintisi.
- **Stop hook'u:** Panoyu her Claude cevabından sonra yeniler (token harcamaz).
- **`durum-oku.mjs`:** Yardımcı fonksiyonları dışa açar; görev listeleri ve son oturum bilgisini okur.

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
