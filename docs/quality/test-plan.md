# Test Planı

> Yaklaşım: **Dengeli.** Kritik akışlarda otomatik test zorunlu, geri kalanında manuel kontrol listesi yeterli.
> Test araçları ve komutlar: `docs/architecture/stack.md`.

## 1. Kritik akışlar (otomatik test ZORUNLU)

Bu akışlardan birine dokunan her değişiklik test ile gelir. Test kırmızıysa merge/deploy yok.

| # | Akış | Neden kritik | Test türü | Test dosyası | Durum |
|---|---|---|---|---|---|
| K1 | Kayıt / giriş / çıkış | Herkes kullanır | e2e | | ⬜ |
| K2 | Yetki: kullanıcı başkasının verisini göremez | Veri sızıntısı | entegrasyon | | ⬜ |
| K3 | Ödeme / abonelik (varsa) | Para | e2e + webhook | | ⬜ |
| K4 | Ana veri yazma işlemi (oluştur/güncelle/sil) | Veri kaybı | entegrasyon | | ⬜ |
| K5 | [Projeye özel] | | | | ⬜ |

## 1a. Kabul testleri (yaşayan şartname)

PRD'deki her kabul kriteri (`Ö-01.1` gibi) **kod yazılmadan önce** çalıştırılabilir bir teste dönüşür ve önce kırmızı olur.
Test adı kriter kimliğini içerir. Örnekler:

```ts
test('Ö-01.1 geçersiz e-posta ile form gönderilmez', async ({ page }) => { /* ... */ });
```
```python
def test_O_01_1_gecersiz_eposta_form_gonderilmez(client): ...   # Python: "Ö-01.1" yerine "O_01_1"
```

- Testler JUnit XML raporu üretecek şekilde çalıştırılır. Pano bu raporu okur:
  - Playwright: `--reporter=junit` → `test-results/junit.xml`
  - Vitest: `--reporter=junit --outputFile=test-results/junit.xml`
  - pytest: `--junitxml=test-results/junit.xml`
- PRD'deki kutucuğu sadece testi geçen kriter için işaretle. Pano iki kaynağı karşılaştırır: kutucuk işaretli ama test yoksa veya kırmızıysa "Dikkat" alanında uyarır.
- AI "yaptım" dese bile kriterin testi yeşil değilse kriter bitmemiştir.

## 1b. Saldırgan testleri

AI kodunun yaklaşık yarısında güvenlik açığı bulunuyor (Veracode, 2025). Bu yüzden veri döndüren veya veri yazan her uç nokta / server action için şu testler yazılır:

| Test | Ne dener | Beklenen |
|---|---|---|
| Başkasının kaydı (IDOR) | Kullanıcı B, A'nın kaydının kimliğiyle okur / günceller / siler | 403 veya 404; veri değişmez |
| Oturumsuz erişim | Giriş yapmadan istek | 401 / yönlendirme |
| Rol aşımı | Normal kullanıcı admin ucunu çağırır | 403 |
| XSS | Metin alanına `<script>alert(1)</script>` ve `"><img src=x onerror=alert(1)>` | Metin olarak görünür, çalışmaz |
| Girdi sınırları | Çok uzun metin, negatif sayı, boş dizi, beklenmeyen alan | Doğrulama hatası; 500 değil |
| Log enjeksiyonu | Girdide satır sonu (`
`) ve sahte log satırı | Loglarda kaçışlı/tek satır |

Test adları `SALDIRI:` önekiyle başlar. `security-auditor` ajanı eksik saldırgan testlerini KRİTİK sayar.

## 2. Kurallar

- **Her hata düzeltmesi bir regresyon testiyle gelir.** Önce hatayı gösteren test kırmızı olur, sonra düzeltme ile yeşile döner.
- Testi geçirmek için testi değiştirmek yasak; test yanlışsa önce bunu açıkla.
- Saf iş mantığı (hesaplama, fiyat, tarih, izin kontrolü) birim testiyle kaplanır.
- Dış servisler (ödeme, e-posta, AI API) testte taklit (mock) edilir; gerçek anahtar kullanılmaz.

## 3. Manuel kontrol listesi (her sürüm öncesi, ~10 dk)

- [ ] Yeni kullanıcı olarak baştan sona ana akış
- [ ] Yanlış girişler: boş form, çok uzun metin, özel karakter, emoji
- [ ] Yavaş/kesik ağ (tarayıcı/cihaz ağ kısıtlama)
- [ ] Mobil genişlik / küçük ekran
- [ ] Çıkış yapıp geri tuşu ile korumalı sayfaya erişim denemesi
- [ ] Boş durum (hiç verisi olmayan kullanıcı)
- [ ] [Projeye özel]

## 4. Komutlar

```bash
[test komutu]          # tümü
[test komutu] [dosya]  # tek dosya
[e2e komutu]           # uçtan uca
```
