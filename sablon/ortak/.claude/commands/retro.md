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
2. **Bana sor** (tek seferde, kısa):
   - Neyi iyi yaptık, devam etmeli?
   - AI nerede en çok zaman kaybettirdi veya yanlış yaptı?
   - Hangi kontrol listesi maddesi gereksiz geldi, hangisi eksikti?
   - Bir dahaki projede neyi baştan farklı yapardın?
3. **`docs/RETRO.md`'ye** bugünün tarihiyle kayıt ekle (şablon dosyada).
4. **Dersleri sınıflandır:**
   - **Bu projeye özel** → `CLAUDE.md`, `docs/STACK.md` veya ilgili dokümana kural olarak ekle.
   - **Tüm projelere genel** → kite önerilecek.
5. **Kit önerileri:** `.kit.json` → `kaynak` alanından kit klasörünü bul. Her öneri için:
   - Hangi kit dosyası (`sablon/ortak/...`, `sablon/[tip]/...`), eklenecek/değişecek metin (diff olarak), neden (hangi olaydan çıktı)
   - Kural ekleme > kural değiştirme > kural silme sırasıyla tercih et; kiti şişirme. Aynı amaçlı mevcut kural varsa onu güçlendir.
6. Onayladığım önerileri kit dosyalarına uygula ve kitin `CHANGELOG.md` dosyasında "[Yayınlanmamış]" bölümüne ekle. Kitte commit'i ben atarım.

Bitince: "Projeye eklenen kurallar: N · Kite önerilen: M (onaylanan: K)".
