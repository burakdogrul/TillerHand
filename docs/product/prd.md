# Ürün Gereksinimleri (PRD)

> Aşama: **0 - Fikir**. Kod yazmadan önce doldurulur. `/start` komutu bu dosyayı seninle birlikte doldurur.
> Son güncelleme: [YYYY-AA-GG]

## 1. Problem

[Kim, hangi durumda, neyi yapamıyor veya neyi zor yapıyor? 2-3 cümle.]

## 2. Hedef kullanıcı

| Persona | Kim? | En büyük derdi | Şu an ne kullanıyor? |
|---|---|---|---|
| [Birincil] | | | |
| [İkincil] | | | |

## 3. Değer önerisi

[Tek cümle: "[Kullanıcı], [ürün] sayesinde [sonuç] elde eder, çünkü [fark]."]

## 4. Başarı kriterleri (ölçülebilir)

- [ ] [Örn: İlk 30 günde 50 kayıtlı kullanıcı]
- [ ] [Örn: Kayıttan ilk değere ulaşma süresi < 3 dakika]
- [ ] [Örn: Aylık altyapı maliyeti < X TL]

## 5. MVP kapsamı

Her özellik bir kullanıcı hikayesi + kabul kriterleri. Kabul kriteri yoksa özellik hazır değildir.
Her kriterin bir kimliği var (`Ö-01.1`). Kabul testleri bu kimliği test adında taşır; `/dashboard` panosu MVP ilerlemesini kutucuklardan değil **test sonuçlarından** okur (`docs/quality/test-plan.md` §1a).

### Ö-01: [Özellik adı]
**Hikaye:** [Kullanıcı] olarak [eylem] yapmak istiyorum, böylece [fayda].
**Kabul kriterleri:**
- [ ] Ö-01.1: [Gözlemlenebilir davranış: "Geçersiz e-posta girilince form gönderilmez ve hata mesajı gösterilir"]
- [ ] Ö-01.2: [...]
**Öncelik:** Olmazsa olmaz / Olsa iyi olur

### Ö-02: [Özellik adı]
...

## 6. Kapsam dışı (bu sürümde YAPILMAYACAK)

Bu liste AI'nın kapsamı genişletmesini engeller. Aklına gelen her "sonra" fikrini buraya yaz.

- [Örn: Çoklu dil desteği]
- [Örn: Takım/organizasyon hesapları]
- [Örn: Mobil uygulama]

## 7. Ana kullanıcı akışları

```
[Akış 1: Kayıt]  Açılış → Kayıt ol → E-posta doğrula → Onboarding → Panel
[Akış 2: ...]
```

## 8. Ekranlar / uç noktalar listesi

| Ad | Tür (sayfa/ekran/endpoint) | Kimler erişir | İlgili özellik |
|---|---|---|---|
| | | | |

## 9. Kısıtlar

- **Bütçe:** [aylık altyapı + AI API üst limiti]
- **Süre:** [MVP hedef tarihi]
- **Yasal:** [Kişisel veri işleniyor mu? Ödeme alınıyor mu? → `docs/legal/privacy-kvkk.md`]
- **Teknik:** [Zorunlu platform, entegrasyon vb.]

## 10. Gelir modeli (varsa)

[Ücretsiz / abonelik / tek seferlik / reklam. Fiyat. Ödeme sağlayıcısı.]

## 11. Açık sorular

- [ ] [Henüz cevabı olmayan, kararı etkileyen sorular]
