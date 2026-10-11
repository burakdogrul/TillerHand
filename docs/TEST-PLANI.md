# Test Planı

> Yaklaşım: **Dengeli.** Kritik akışlarda otomatik test zorunlu, geri kalanında manuel kontrol listesi yeterli.
> Test araçları ve komutlar: `docs/STACK.md`.

## 1. Kritik akışlar (otomatik test ZORUNLU)

Bu akışlardan birine dokunan her değişiklik test ile gelir. Test kırmızıysa merge/deploy yok.

| # | Akış | Neden kritik | Test türü | Test dosyası | Durum |
|---|---|---|---|---|---|
| K1 | Kayıt / giriş / çıkış | Herkes kullanır | e2e | | ⬜ |
| K2 | Yetki: kullanıcı başkasının verisini göremez | Veri sızıntısı | entegrasyon | | ⬜ |
| K3 | Ödeme / abonelik (varsa) | Para | e2e + webhook | | ⬜ |
| K4 | Ana veri yazma işlemi (oluştur/güncelle/sil) | Veri kaybı | entegrasyon | | ⬜ |
| K5 | [Projeye özel] | | | | ⬜ |

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
