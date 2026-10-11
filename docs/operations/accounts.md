# Hesaplar ve Son Tarihler

> Projenin bağlı olduğu her dış hesap burada. Tek kişilik projelerde en sık yaşanan felaketler kod değil:
> alan adının süresinin dolması, kartın geçersiz olup servisin durması, 2FA'sız hesabın ele geçirilmesi,
> kimde olduğu unutulan bir anahtar. `/dashboard` panosu **30 gün içinde dolan tarihleri** "Dikkat" alanında gösterir.
>
> **Buraya asla şifre, anahtar veya token yazma.** Sadece hangi hesap, kimde, ne zaman bitiyor.
> Tarihler `YYYY-AA-GG` biçiminde olmalı (pano okur).

## Hesaplar

| Servis | Amaç | Hesap sahibi | 2FA | Plan / aylık maliyet | Bitiş / yenileme | Anahtar yenileme | Not |
|---|---|---|---|---|---|---|---|
| [GitHub] | Kod deposu | [e-posta] | [evet/hayır] | [Ücretsiz] | - | - | |
| [Alan adı kayıt firması] | Alan adı | | | | [YYYY-AA-GG] | - | Otomatik yenileme açık mı? |
| [Hosting] | | | | | | | |
| [Veritabanı] | | | | | | [YYYY-AA-GG] | |
| [E-posta servisi] | | | | | | | |
| [Ödeme sağlayıcı] | | | | | | | |
| [Hata takibi] | | | | | | | |
| [AI sağlayıcı] | | | | | | [YYYY-AA-GG] | Harcama limiti: |
| [Apple / Google geliştirici] | Mağaza | | | | [YYYY-AA-GG] | | Yıllık üyelik |

## Kurallar

- Her yeni dış servis eklendiğinde (`/start` Adım 5, yeni entegrasyon) bu tabloya satır eklenir.
- Kritik hesaplarda 2FA zorunlu: kod deposu, hosting, veritabanı, alan adı, ödeme, e-posta.
- Ödeme kartının son kullanma tarihini de "Bitiş" sütununa yaz (kart bitince servisler durur).
- `/maintain quarterly` bu tabloyu gözden geçirir; `/release ilk` boş satır bırakmaz.
