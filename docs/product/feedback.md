# Kullanıcı Geri Bildirimi

> Kullanıcıların sesi. `/user-feedback` komutu yeni geri bildirimleri buraya işler, Ürün kurul üyesiyle önceliklendirir,
> hangilerinin yol haritasına gireceğini sana sorar. `/dashboard` panosu açık geri bildirimleri ve öne çıkan temaları gösterir.
> Kişisel veri yazma: kullanıcıyı anonim etiketle (K-001) belirt.

## Gelen kutusu

Tür: `hata` / `istek` / `şikayet` / `övgü` / `soru`. Durum: `yeni` / `planlandı` / `yapıldı` / `reddedildi` / `birleşti`.

| # | Tarih | Kaynak | Kullanıcı | Özet | Tür | Tema | Öncelik | Durum | Görev |
|---|---|---|---|---|---|---|---|---|---|

## Temalar

Benzer geri bildirimler bir temada toplanır. Aynı temada 3+ geri bildirim varsa güçlü sinyaldir.

| Tema | Geri bildirim sayısı | Etkilenen özellik | Karar |
|---|---|---|---|
