# Kararlar

> İki bölüm var:
> 1. **Karar günlüğü:** Sorulan her karar tek satır. Kapı: `tek` (geri dönüşü pahalı) / `çift` (kolay geri alınır). Kim verdi: `kullanıcı` veya `otomatik` (soru modu kapalıyken).
> 2. **Ayrıntılı kayıtlar:** Mimariyi veya uzun vadeyi etkileyen kararlar (K-NNN). Kütüphane/servis seçimi, veri modeli, mimari yön.
>
> Bir karar sormadan önce buraya bak: daha önce verilmişse tekrar sorma, ona uy.
> Kararlar silinmez; değişirse yeni satır eklenir ve eskisinin yanına "→ #N ile değişti" yazılır.

## Karar günlüğü

`/durum` panosu bu tabloyu okur; sütunları değiştirme.

| # | Tarih | Aşama | Konu | Soru | Seçilen | Kapı | Karar veren |
|---|---|---|---|---|---|---|---|

## Ayrıntılı kayıtlar

Şablon:

```
### K-NNN: [Kısa başlık]
- **Tarih:** YYYY-AA-GG · **Günlük no:** #N
- **Durum:** Kabul edildi / Yerine geçti: K-NNN
- **Bağlam:** [Hangi problem bu kararı gerektirdi?]
- **Karar:** [Ne seçildi?]
- **Alternatifler:** [Neler sunuldu, neden seçilmedi?]
- **Sonuçlar:** [Neyi kolaylaştırır, neyi zorlaştırır, neye bağımlı kılar?]
```
