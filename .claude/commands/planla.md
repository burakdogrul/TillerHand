---
description: Bir görev veya özellik için kod yazmadan önce uygulama planı çıkarır.
argument-hint: [görev kodu (G-012) veya özellik tanımı]
---

Planlanacak iş: $ARGUMENTS

Bu adımda **kod yazma**, sadece plan çıkar.

0. **Limit:** Limiti oku ve görevin tahmini maliyetini hesapla (`docs/LIMIT-PLANI.md` §3). Seviye sarı veya kırmızıysa ya da tahmin kalan payı aşıyorsa seçenekleri sor. Plan, seçilen seçeneğe göre şekillenir (örn. "limite sığan kısmı yap").
1. Gerekli bağlamı oku: `docs/YOL-HARITASI.md` (görev ve kabul kriteri), `docs/PRD.md` (ilgili özellik), `docs/MIMARI.md`, `docs/KARARLAR.md`. Görevin dokunacağı mevcut kodu oku.
2. Projede benzer bir şey zaten var mı bak. Varsa onu yeniden kullan.
3. **Karar noktalarını çıkar ve sor.** Bu görevde kullanıcının vermesi gereken kararları listele: kütüphane, kullanıcı akışı, veri alanı, hata davranışı, metin, tasarım vb. (`docs/KARAR-PROTOKOLU.md`). Daha önce verilmiş olanları `docs/KARARLAR.md`'den al, tekrar sorma. Kalanları AskUserQuestion ile sor. Büyük bir özellikse önce `mattpocock-skills:grilling` ile kapsamı sorgula. Modül sınırları belirsizse `mattpocock-skills:codebase-design` kullan.
4. Planı şu biçimde yaz:

```
## Plan: [görev]
**Kabul kriterleri:** [maddeler]
**Alınan kararlar:** [soru → seçilen]
**Kullanılacak skill'ler:** [docs/SKILLER.md'den; örn. ponytail, tdd, impeccable]
**Dokunulacak dosyalar:** [yol — ne değişecek] (yeni dosyaları ayrıca belirt)
**Adımlar:** [numaralı, her biri doğrulanabilir]
**Veri modeli / API değişikliği:** [varsa; migration gerekiyor mu?]
**Yeni bağımlılık:** [varsa paket adı + neden + yerleşik alternatif neden yetmiyor]
**Testler:** [hangi test eklenecek; kritik akış mı? → docs/TEST-PLANI.md]
**Güvenlik/yasal etkisi:** [yetki, kişisel veri, sır, ödeme etkisi var mı?]
**Riskler ve açık sorular:** [...]
**Kapsam dışı bıraktıklarım:** [...]
```

5. Görev tek oturuma sığmıyorsa alt görevlere böl ve `docs/YOL-HARITASI.md` için öner.
6. Kararları `docs/KARARLAR.md` günlüğüne yaz; mimari olanlar için ayrıntılı kayıt ekle.

7. **Kurul plan toplantısı** (`.claude/kurul/KURALLAR.md` §2-4; kurul kurulduysa): `kurul-urun`, `kurul-mimar` ve plana ilgili üyeler planı denetler. Sentezi plana "Kurul görüşü" olarak ekle. RET varsa planı düzeltmeden onaya sunma. Üyelerin sorulmasını istediği kararları sor.

Planı onaylatmak için AskUserQuestion kullan: "Onayla / Şunu değiştir / Görevi böl". Onayımı bekle. Onaydan sonra `/gelistir` ile uygulanacak.
