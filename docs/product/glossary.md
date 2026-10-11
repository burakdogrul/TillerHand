# Sözlük

> Projedeki her kavramın **tek** adı. AI aynı şeye bir yerde `customer`, bir yerde `client`, ekranda "Üye" derse
> kod ve arayüz dağılır. Yeni bir kavram çıktığında önce buraya eklenir, sonra kodda kullanılır.
> `/start` PRD'den ilk terimleri çıkarır.

| Terim (arayüzde) | Kodda | Tanım | Bunlarla karıştırma / kullanma |
|---|---|---|---|
| [Müşteri] | `customer` | [Fatura kesilen kişi veya şirket] | `client` (HTTP istemcisiyle karışır), "Üye" |
| [Fatura] | `invoice` | [...] | `bill` |
| [Kullanıcı] | `user` | Uygulamaya giriş yapan hesap | Müşteri ile aynı şey değil |

## Durumlar (status alanları)

Bir kaydın alabileceği durumlar ve geçişler. AI'nın yeni durum uydurmasını engeller.

```
[invoice.status]: taslak (draft) → gönderildi (sent) → ödendi (paid)
                                  ↘ gecikti (overdue) → ödendi (paid)
                  taslak → iptal (cancelled)
```

## Yazım kuralları

- Kod: İngilizce (`camelCase` değişken, `PascalCase` bileşen/tip, `snake_case` DB alanı).
- Arayüz metni: Türkçe; "siz" mi "sen" mi? → [seç: sen]
- Tarih: `GG.AA.YYYY`, para: `1.234,56 ₺` (`Intl` ile `tr-TR`).
