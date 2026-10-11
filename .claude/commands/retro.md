---
description: Faz veya proje sonunda geriye bakış yapar; kalıcı dersleri kite geri yazmayı önerir.
argument-hint: [faz adı | proje] (boş = son faz)
---

Retro kapsamı: $ARGUMENTS

Amaç: Bu projede öğrendiklerini kaybetmemek ve kiti (bundan sonraki tüm projelerin şablonunu) iyileştirmek.

1. **Veri topla** (kapsamdaki dönem için):
   - `git log --oneline` ve `CHANGELOG.md`: ne yapıldı
   - `docs/ILERLEME.md` açık sorunları, `docs/KARARLAR.md` yeni kararlar
   - `fix:` commit'leri ve `/hata-ayikla` ile çözülen hatalar: hangi tür hatalar tekrar etti?
   - `docs/YOL-HARITASI.md`: planlanan ve gerçekleşen görevler; bölünmek zorunda kalan görevler
2. **Bana sor** (AskUserQuestion, topladığın veriden çıkardığın seçeneklerle, çoklu seçim + serbest cevap):
   - Neyi iyi yaptık, devam etmeli?
   - AI nerede en çok zaman kaybettirdi veya yanlış yaptı?
   - Sorular çok mu, az mı, yerinde mi? Hangi konuda soru modu kapatılmalı/açılmalı?
   - Hangi kontrol listesi maddesi gereksiz geldi, hangisi eksikti?
   - Bir dahaki projede neyi baştan farklı yapardın?
3. **`docs/RETRO.md`'ye** bugünün tarihiyle kayıt ekle (şablon dosyada). `docs/METRIKLER.md`'ye dönem satırı ekle ve bir önceki dönemle karşılaştır: Görev süresi, düzeltme oranı ve kopya kod artıyor mu? Kullanıcının hissiyle veriler çelişiyorsa bunu açıkça söyle.
4. **Dersleri sınıflandır:**
   - **Bu projeye özel** → `CLAUDE.md`, `docs/STACK.md` veya ilgili dokümana kural olarak ekle.
   - **Tüm projelere genel** → kite önerilecek.
5. **Kit önerileri:** Her öneri için:
   - Hangi kit dosyası: Ortak dosyalar kit reposunun kökünde (`CLAUDE.md`, `docs/...`, `.claude/...`), tipe özel olanlar `kit/sablon/<tip>/...`, ekler `kit/sablon/ekler/<ek>/...`.
   - Eklenecek/değişecek metin (diff olarak) ve neden (hangi olaydan çıktı).
   - Kural ekleme > kural değiştirme > kural silme sırasıyla tercih et; kiti şişirme. Aynı amaçlı mevcut kural varsa onu güçlendir. Metni `mattpocock-skills:writing-for-agents` ilkeleriyle yaz.
   - Önerileri **çoklu seçimle** onaylat.
6. Onaylananları kite uygula:
   1. `.kit.json` → `kaynak` reposunu geçici klasöre klonla.
   2. `retro/<proje>-<tarih>` dalı aç.
   3. Değişiklikleri yap, `kit/CHANGELOG.md` → "[Yayınlanmamış]" bölümüne ekle.
   4. `node --test "kit/testler/*.test.mjs"` çalıştır, commit at.
   5. Sonra sor: "Dalı push edip PR açayım / push edip main'e birleştireyim / sadece yerelde bırakayım". Push etmek için açık onay şart.
   6. Geçici klasörü sil.

Bitince: "Projeye eklenen kurallar: N · Kite önerilen: M (onaylanan: K)".
