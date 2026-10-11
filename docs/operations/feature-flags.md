# Özellik Bayrakları

> Riskli özellikler bir bayrağın arkasında yayınlanır. Sorun çıkarsa **yeniden deploy etmeden** kapatılır (acil kapatma).
> Unutulan bayrak teknik borçtur: her bayrağın bir kaldırma tarihi olur. `/dashboard` panosu süresi geçenleri gösterir.
> Uygulama yöntemi `docs/architecture/stack.md` → "Özellik bayrakları" bölümünde.

## Ne zaman bayrak zorunlu?

- Ödeme, abonelik veya para hareketi
- AI/LLM çağrısı yapan özellik (maliyet patlaması riski)
- Toplu e-posta / bildirim gönderen özellik
- Veri silen, taşıyan veya dışa aktaran özellik
- Büyük arayüz değişikliği (kademeli açmak için)

## Bayraklar

`/dashboard` panosu bu tabloyu okur. Tarih biçimi `YYYY-AA-GG`, durum `açık` / `kapalı` / `kademeli %N`.

| Bayrak | Amaç | Durum | Sahibi | Eklendi | Kaldırma tarihi | Acil kapatma test edildi |
|---|---|---|---|---|---|---|

## Kurallar

- Bayrak adı `ozellik_adi` biçiminde ve `docs/product/glossary.md` ile uyumlu.
- Bayrak kapalıyken kod yolu da test edilir (iki durum için en az bir test).
- Özellik herkese açıldıktan ve 2 hafta sorunsuz çalıştıktan sonra bayrak ve eski kod yolu kaldırılır.
- Acil kapatma: Panelden veya ortam değişkeninden kapatma adımı bu dosyada yazılı ve en az bir kez denenmiş olmalı.
