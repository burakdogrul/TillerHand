---
description: Canlıya alma kontrol listesini çalıştırır; otomatik kontrolleri yapar, gerisini sorar.
argument-hint: [first] (boş = her sürüm kontrolü)
---

Mod: $ARGUMENTS (boş = sadece A bölümü, her sürüm; `first` = A + B bölümleri, ilk lansman)

Kaynak listeler: `docs/operations/release-checklist.md`, `docs/architecture/stack.md` → "Canlıya alma", `docs/security/checklist.md` (ilk lansmanda tamamı), varsa `docs/ai/guide.md` → "Canlıya alma" ve `docs/product/launch.md`.

1. **Otomatik kontrol edebildiklerini çalıştır:**
   - `first` modunda önce limiti oku; tam denetim pahalıdır (`docs/workflow/usage-limits.md`). `node .claude/hooks/tools.mjs --gerekli guvenlik` kapalıysa açmayı sor. Kurul kurulduysa **canlıya alma kurul toplantısı** (tüm kurul, `.claude/board/rules.md`) yap.
   - `first` modunda önce `/findings-all security,legal,perf` öner (tahmini maliyetiyle); raporlardaki Kritik bulgular yayını engeller.
   - `first` modunda paralel başlat: `security-auditor` alt ajanı (tüm kod tabanı; kurul toplantısına zaten katılıyorsa tekrar çalıştırma), `security-review` skill'i, `ponytail:ponytail-audit` (kalite, yük altında kırılacak yerler); arayüz varsa `impeccable:impeccable` → `audit` (erişilebilirlik, performans, responsive)
   - Son CI çalışmasının durumu (`gh run list --branch main --limit 1`, gh kuruluysa)
   - Lint, tip kontrolü, testler, build (`AGENTS.md` → Komutlar)
   - Bağımlılık açık taraması ve Semgrep (`docs/security/checklist.md` §9)
   - Kabul testleri: MVP kriterlerinin tamamı yeşil mi (JUnit raporu)? Saldırgan testleri var mı?
   - `docs/operations/accounts.md` eksiksiz mi, 30 gün içinde dolan tarih var mı? `docs/operations/feature-flags.md`'de riskli özellikler bayrakta mı?
   - `docs/product/unit-economics.md`: katkı payı pozitif mi?
   - Sır taraması (`docs/security/checklist.md` §9)
   - Kodda kalan `console.log` / `print` / `debugger` / `TODO` / test verisi
   - `.env.example` ile koddaki ortam değişkeni kullanımları uyumlu mu?
   - **Temiz kurulum testi:** `git clone . "<geçici klasör>/temiz"` (sadece commit'li dosyalar). Orada `README.md` → Kurulum'daki bağımlılık kurulumunu, build'i ve testleri sırayla çalıştır (`.env` oluşturma; ortam değişkeni isteyen adımları 👤 say). Kilit dosyası, sürüm dosyası (`.nvmrc` / `.python-version`) veya README adımı eksikse ❌. Geçici klasörü sil.
   - Commit edilmemiş değişiklik var mı?
   - `CHANGELOG.md` güncel mi?
   - Bekleyen DB migration var mı?
2. **Kontrol edemediklerini** (panel ayarları, yedek, alan adı, yasal metinler, mağaza ayarları) AskUserQuestion ile sor: Yapıldı / Yapılmadı / Bu projede geçerli değil. Her biri için nasıl kontrol edeceğimi tek satırla yaz. Benim elle yapmam gereken çok adımlı kurulumlar (DNS, SPF/DKIM, mağaza hesabı, prod ortam değişkenleri) için `mattpocock-skills:wizard` ile adım adım rehber hazırla.
   - Yayına girecek metinler (açılış sayfası, mağaza açıklaması, e-postalar) `humanizer:humanizer`'dan geçti mi?
3. Raporu tablo olarak ver:

| Madde | Durum | Not |
|---|---|---|
| ... | ✅ / ❌ / 👤 (senin kontrol etmen gerek) / ➖ | ... |

4. Son satır: **Yayına hazır** veya **Engelleyenler: [❌ maddeleri]**.

Deploy'u kendin başlatma. ❌ maddelerinden hangilerini şimdi düzelteceğimizi **çoklu seçimle** sor. `docs/workflow/progress.md`'yi güncelle ve durum bloğunu yaz.
