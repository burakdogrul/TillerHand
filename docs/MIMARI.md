# Mimari

> Aşama: **0 - Fikir** sonunda yazılır, **2 - Geliştirme** boyunca güncellenir.
> Yapı değiştikçe bu dosya da değişir. Güncel değilse AI yanlış varsayım yapar.

## 1. Genel bakış

```
[İstemci] ──HTTPS──> [Uygulama/API] ──> [Veritabanı]
                          │
                          ├──> [Auth sağlayıcı]
                          ├──> [Ödeme]
                          └──> [E-posta / AI API / Depolama]
```

## 2. Teknoloji seçimi

| Katman | Seçim | Neden | Alternatif |
|---|---|---|---|
| Dil | | | |
| Framework | | | |
| Veritabanı | | | |
| Auth | | | |
| Hosting | | | |
| Hata takibi | | | |

Ayrıntılı kurallar: `docs/STACK.md`.

## 3. Klasör yapısı

```
[Proje kök klasör ağacı, sadece ana klasörler + her birinin görevi]
```

## 4. Veri modeli

| Tablo | Alanlar (önemli olanlar) | İlişkiler | Kişisel veri? | Erişim kuralı |
|---|---|---|---|---|
| users | id, email, created_at | | Evet | Sadece kendisi |
| | | | | |

## 5. Dış servisler

| Servis | Amaç | Ortam değişkeni | Ücret / limit | Hesap sahibi |
|---|---|---|---|---|
| | | | | |

## 6. Kimlik doğrulama ve yetki

- **Giriş yöntemleri:** [e-posta+şifre / magic link / Google / Apple]
- **Roller:** [user, admin]
- **Yetki nerede kontrol ediliyor:** [sunucu tarafı / DB kuralları (RLS) / ikisi]

## 7. Ortamlar

| Ortam | URL | Veritabanı | Deploy nasıl |
|---|---|---|---|
| Lokal | localhost | lokal/dev projesi | - |
| Önizleme/Staging | | ayrı | PR açılınca |
| Prod | | ayrı | `main`'e merge |

## 8. Bilinen teknik borç

| Ne | Neden böyle | Ne zaman düzeltilmeli |
|---|---|---|
| | | |
