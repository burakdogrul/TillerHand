---
description: Canlıya alma kontrol listesini çalıştırır; otomatik kontrolleri yapar, gerisini sorar.
argument-hint: [ilk | surum] (boş = surum)
---

Mod: $ARGUMENTS (boş veya `surum` = sadece A bölümü; `ilk` = A + B bölümleri)

Kaynak listeler: `docs/CANLIYA-ALMA.md`, `docs/STACK.md` → "Canlıya alma", `docs/GUVENLIK.md` (ilk lansmanda tamamı), varsa `docs/AI.md` → "Canlıya alma" ve `docs/LANSMAN.md`.

1. **Otomatik kontrol edebildiklerini çalıştır:**
   - `ilk` modunda `guvenlik-denetcisi` alt ajanını tüm kod tabanı için paralel başlat
   - Son CI çalışmasının durumu (`gh run list --branch main --limit 1`, gh kuruluysa)
   - Lint, tip kontrolü, testler, build (`CLAUDE.md` → Komutlar)
   - Bağımlılık açık taraması
   - Sır taraması (`docs/GUVENLIK.md` §8)
   - Kodda kalan `console.log` / `print` / `debugger` / `TODO` / test verisi
   - `.env.example` ile koddaki ortam değişkeni kullanımları uyumlu mu?
   - Commit edilmemiş değişiklik var mı?
   - `CHANGELOG.md` güncel mi?
   - Bekleyen DB migration var mı?
2. **Kontrol edemediklerini** (panel ayarları, yedek, alan adı, yasal metinler, mağaza ayarları) bana soru olarak listele. Her biri için nasıl kontrol edeceğimi tek satırla yaz.
3. Raporu tablo olarak ver:

| Madde | Durum | Not |
|---|---|---|
| ... | ✅ / ❌ / 👤 (senin kontrol etmen gerek) / ➖ | ... |

4. Son satır: **Yayına hazır** veya **Engelleyenler: [❌ maddeleri]**.

Deploy'u kendin başlatma. ❌ maddelerini düzeltmek için onayımı bekle.
