---
description: Projeyi kitin GitHub'daki son sürümüne günceller (komutlar, ajanlar, hook'lar, kontrol listeleri).
argument-hint: [boş | --addons ai,tr | --tool claude,codex,antigravity]
---

Ek argüman: $ARGUMENTS

1. `.kit.json`'u oku: mevcut sürüm, `kaynak` (kit repo adresi), tip, ekler.
2. Commit edilmemiş değişiklik varsa dur ve önce commit etmeyi öner (güncelleme dosya yazar).
3. Kiti geçici bir klasöre klonla ve güncellemeyi çalıştır:

```bash
git clone --depth 1 <kaynak> "<geçici klasör>/vibe-kit"
node "<geçici klasör>/vibe-kit/kit/kit.mjs" update --project . $ARGUMENTS
```

4. Çıktıyı raporla:
   - **Güncellenen / eklenen** dosyalar.
   - **Çakışmalar (`.kit-new`):** Her biri için senin değişikliğinle kitin yeni hali arasındaki farkı özetle. Nasıl birleştirileceğini **karar olarak sor**: kitinkini al / benimkini koru / birleştir. Sonra `.kit-new` dosyasını sil.
   - Klondaki `kit/CHANGELOG.md`'den mevcut sürümden yeni sürüme kadar olan notları özetle. **"Elle uyarla"** maddelerini (AGENTS.md, CLAUDE.md, docs/architecture/stack.md, settings.json gibi projeye ait dosyalar) tek tek göster ve her biri için uygulanıp uygulanmayacağını sor.
4b. Yeni sürüm yeni eklenti açtıysa `node .claude/hooks/plugins-sync.mjs` ile listele, kullanıcı onaylarsa `--install` ile kur, sonra `/reload-plugins` öner. Paket tanımı değiştiyse (`.claude/hooks/tools.mjs` → `PAKETLER`) `node .claude/hooks/tools.mjs` ile durumu göster.
5. Geçici klasörü sil. Commit öner: `chore: kit <eski> → <yeni>`.
