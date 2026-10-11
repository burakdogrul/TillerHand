---
description: Bir görev veya özellik için kod yazmadan önce uygulama planı çıkarır.
argument-hint: [görev kodu (G-012) veya özellik tanımı]
---

Planlanacak iş: $ARGUMENTS

Bu adımda **kod yazma**, sadece plan çıkar.

1. Gerekli bağlamı oku: `docs/YOL-HARITASI.md` (görev ve kabul kriteri), `docs/PRD.md` (ilgili özellik), `docs/MIMARI.md`, `docs/KARARLAR.md`. Görevin dokunacağı mevcut kodu oku.
2. Projede benzer bir şey zaten var mı bak. Varsa onu yeniden kullan.
3. Planı şu biçimde yaz:

```
## Plan: [görev]
**Kabul kriterleri:** [maddeler]
**Dokunulacak dosyalar:** [yol — ne değişecek] (yeni dosyaları ayrıca belirt)
**Adımlar:** [numaralı, her biri doğrulanabilir]
**Veri modeli / API değişikliği:** [varsa; migration gerekiyor mu?]
**Yeni bağımlılık:** [varsa paket adı + neden + yerleşik alternatif neden yetmiyor]
**Testler:** [hangi test eklenecek; kritik akış mı? → docs/TEST-PLANI.md]
**Güvenlik/yasal etkisi:** [yetki, kişisel veri, sır, ödeme etkisi var mı?]
**Riskler ve açık sorular:** [...]
**Kapsam dışı bıraktıklarım:** [...]
```

4. Görev tek oturuma sığmıyorsa alt görevlere böl ve `docs/YOL-HARITASI.md` için öner.
5. Mimari bir karar içeriyorsa `docs/KARARLAR.md` kaydı öner.

Onayımı bekle. Onaydan sonra `/gelistir` ile uygulanacak.
