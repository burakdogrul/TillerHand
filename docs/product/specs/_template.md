# Spec: [görev kodu veya hata kısa adı] [başlık]

> Kopyala: `docs/product/specs/<görev kodu>.md`. Özellik spec'i `/plan-task` 3+ dosyalık işte, hata spec'i `/fix-bug` her hatada yazar; küçük işte spec yok.
> "Değişmemesi gereken davranış" satırları kabul kriteri kimliğiyle başlar (`- Ö-01.1: ...`). Kapı (`gate.mjs --run`) bu kimliklerin testi yoksa veya son test raporunda kırmızıysa kırmızı olur.
> Kapı yalnız kendi koşusunda yazılan test raporuna bakar; test komutu JUnit raporu yazmıyorsa sadece testin var olduğunu denetler.
> Davranışı bilerek değiştiriyorsan veya bir kriter kimliğini değiştiriyorsan önce bu dosyayı güncelle; spec artık geçerli değilse `docs/archive/`'e taşı.

**Tür:** [özellik / hata]
**Sınıf:** [sadece hata: boş-girdi / doğrulama / yetki / tarih-saat / yerel-dil / sıralama / eşzamanlılık / yapılandırma / dış-servis / sözleşme / arayüz-durumu / diğer]
**Kural:** [sadece hata, aynı sınıf tekrarlayınca `/fix-bug` yazar: eklenen kuralın yeri veya "gerek yok" · YYYY-AA-GG]

## Mevcut davranış

[Şu an ne oluyor. Hatada: yeniden üretme adımları ve görülen sonuç.]

## Beklenen davranış

[İşten sonra ne olmalı. Ölçülebilir yaz; kabul kriteri varsa kimliğiyle (`Ö-03.1`).]

## Değişmemesi gereken davranış

- [Ö-01.1: Bu iş bozmamalı; kimliği olan ve testi bulunan kriter]
