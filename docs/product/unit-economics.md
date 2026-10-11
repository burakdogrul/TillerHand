# Birim Ekonomisi

> Ürün her yeni kullanıcıda para kazandırıyor mu, kaybettiriyor mu? AI özellikli ürünlerde kullanıcı başı maliyet
> fark edilmeden fiyatı geçebilir. `/dashboard` panosu aşağıdaki girdilerden hesabı **otomatik** yapar.
> `/start` Adım 5'te doldurulur; `/maintain monthly` gerçek faturalarla günceller.
> Sayılarda nokta ondalık ayırıcıdır (örn. `3.5`). Para birimi tek olmalı.

## Girdiler

**Para birimi:** TL
**Fiyat (kullanıcı başı aylık):** 0
**Ödeme komisyonu (%):** 0
**Sabit aylık maliyet:** 0
**Kullanıcı başı değişken maliyet (aylık):** 0
**Hedef aktif kullanıcı:** 0
**Ücretsiz kullanıcı oranı (%):** 0

## Değişken maliyetin dökümü (kullanıcı başı, aylık)

| Kalem | Varsayım | Tutar |
|---|---|---|
| AI / LLM çağrıları | [örn. kullanıcı başı ayda 200 istek × ortalama token × fiyat] | |
| E-posta | | |
| Depolama / bant genişliği | | |
| Diğer | | |

## Sabit maliyetin dökümü (aylık)

| Kalem | Tutar |
|---|---|
| Hosting | |
| Veritabanı | |
| Alan adı (aylığa bölünmüş) | |
| Diğer abonelikler | |

## Notlar

- **Katkı payı** = fiyat × (1 − komisyon) − değişken maliyet. Negatifse her yeni ödeyen kullanıcı zarar ettirir.
- **Başa baş** = sabit maliyet ÷ katkı payı (ödeyen kullanıcı sayısı).
- Ücretsiz kullanıcılar da değişken maliyet doğurur; hesap bunu "ücretsiz kullanıcı oranı" ile dahil eder.
- Değişken maliyet fiyatın %30'unu geçiyorsa fiyat veya kullanım limiti kararı `maliyet` konusu olarak sorulur.
