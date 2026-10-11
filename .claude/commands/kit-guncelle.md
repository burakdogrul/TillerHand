---
description: Projeyi kitin GitHub'daki son sürümüne günceller (komutlar, ajanlar, hook'lar, kontrol listeleri).
argument-hint: [boş | --ekler ai]
---

Ek argüman: $ARGUMENTS

1. `.kit.json`'u oku: mevcut sürüm, `kaynak` (kit repo adresi), tip, ekler.
2. Commit edilmemiş değişiklik varsa dur ve önce commit etmeyi öner (güncelleme dosya yazar).
3. Kiti geçici bir klasöre klonla ve güncellemeyi çalıştır:

```bash
git clone --depth 1 <kaynak> "<geçici klasör>/vibe-kit"
node "<geçici klasör>/vibe-kit/kit/kit.mjs" guncelle --proje . $ARGUMENTS
```

4. Çıktıyı raporla:
   - **Güncellenen / eklenen** dosyalar.
   - **Çakışmalar (`.yeni`):** Her biri için senin değişikliğinle kitin yeni hali arasındaki farkı özetle. Nasıl birleştirileceğini **karar olarak sor**: kitinkini al / benimkini koru / birleştir. Sonra `.yeni` dosyasını sil.
   - Klondaki `kit/CHANGELOG.md`'den mevcut sürümden yeni sürüme kadar olan notları özetle. **"Elle uyarla"** maddelerini (CLAUDE.md, STACK.md, settings.json gibi projeye ait dosyalar) tek tek göster ve her biri için uygulanıp uygulanmayacağını sor.
5. Geçici klasörü sil. Commit öner: `chore: kit <eski> → <yeni>`.
