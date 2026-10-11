---
description: Canlıya alma kontrol listesini çalıştırır; otomatik kontrolleri yapar, gerisini sorar.
argument-hint: [ilk | surum] (boş = surum)
---

Mod: $ARGUMENTS (boş veya `surum` = sadece A bölümü; `ilk` = A + B bölümleri)

Kaynak listeler: `docs/CANLIYA-ALMA.md`, `docs/STACK.md` → "Canlıya alma", `docs/GUVENLIK.md` (ilk lansmanda tamamı), varsa `docs/AI.md` → "Canlıya alma" ve `docs/LANSMAN.md`.

1. **Otomatik kontrol edebildiklerini çalıştır:**
   - `ilk` modunda önce limiti oku; tam denetim pahalıdır (`docs/LIMIT-PLANI.md`). Kurul kurulduysa **canlıya alma kurul toplantısı** (tüm kurul, `.claude/kurul/KURALLAR.md`) yap.
   - `ilk` modunda paralel başlat: `guvenlik-denetcisi` alt ajanı (tüm kod tabanı; kurul toplantısına zaten katılıyorsa tekrar çalıştırma), `security-review` skill'i, `ponytail:ponytail-audit` (kalite, yük altında kırılacak yerler); arayüz varsa `impeccable:impeccable` → `audit` (erişilebilirlik, performans, responsive)
   - Son CI çalışmasının durumu (`gh run list --branch main --limit 1`, gh kuruluysa)
   - Lint, tip kontrolü, testler, build (`CLAUDE.md` → Komutlar)
   - Bağımlılık açık taraması
   - Sır taraması (`docs/GUVENLIK.md` §8)
   - Kodda kalan `console.log` / `print` / `debugger` / `TODO` / test verisi
   - `.env.example` ile koddaki ortam değişkeni kullanımları uyumlu mu?
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

Deploy'u kendin başlatma. ❌ maddelerinden hangilerini şimdi düzelteceğimizi **çoklu seçimle** sor. `docs/ILERLEME.md`'yi güncelle ve durum bloğunu yaz.
