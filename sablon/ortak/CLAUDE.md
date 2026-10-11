# [PROJE ADI]

> [Tek cümle: Bu proje kimin için, hangi problemi çözüyor?]

Bu dosya her oturumda otomatik okunur. Kısa tut; ayrıntılar `docs/` altında.

## Her oturumda bağlam

@docs/STACK.md
@docs/ILERLEME.md

Gerektiğinde oku (her seferinde değil):

| Dosya | Ne zaman |
|---|---|
| `docs/PRD.md` | Özelliğin kapsamı veya kabul kriteri belirsizse |
| `docs/MIMARI.md` | Yeni dosya, tablo, servis veya klasör eklerken |
| `docs/YOL-HARITASI.md` | Sıradaki görevi seçerken, görev bitince işaretlerken |
| `docs/KARARLAR.md` | Mimari bir tercih yapmadan önce (daha önce karar verilmiş mi?) |
| `docs/TEST-PLANI.md` | Kritik akışa dokunurken |
| `docs/GUVENLIK.md` | Auth, veri, dosya yükleme, dış API, ödeme koduna dokunurken |
| `docs/SOZLUK.md` | Yeni bir kavrama isim verirken (tablo, tip, fonksiyon, ekran metni) |
| `docs/TASARIM.md` (varsa) | Arayüz yazarken veya değiştirirken |
| `docs/AI.md` (varsa) | Prompt, model çağrısı veya AI özelliğine dokunurken |

Otomatik koruma: `.claude/hooks/` sır yazımını engeller ve dosyaları biçimlendirir. Bir hook işini engellerse mesajı oku ve nedeni düzelt; hook'u atlatmaya çalışma.
İnceleme: Commit öncesi `inceleyici`, güvenlik açısından hassas değişikliklerde `guvenlik-denetcisi` alt ajanını kullan.

## Komutlar

```bash
# STACK.md'deki varsayılanlardan farklıysa burayı güncelle
geliştirme:  [npm run dev]
test:        [npm run test]
lint:        [npm run lint]
tip kontrol: [npx tsc --noEmit]
build:       [npm run build]
```

## Çalışma kuralları

1. **Önce plan, sonra kod.** 2'den fazla dosyaya dokunan her iş için önce kısa bir plan yaz (hangi dosyalar, hangi adımlar, risk) ve onay bekle.
2. **Tek seferde tek görev.** `docs/YOL-HARITASI.md`'deki bir görevi bitirmeden diğerine geçme. Görev dışı bir sorun görürsen düzeltme, `docs/ILERLEME.md` → "Açık sorunlar"a yaz.
3. **Kapsamı genişletme.** PRD'de olmayan özellik, ayar, soyutlama ekleme. Gerekli olduğunu düşünüyorsan sor.
4. **Bağımlılık eklemeden önce sor.** Paket adı, neden gerektiği, alternatifi (yerleşik çözüm var mı?) ile birlikte.
5. **Mevcut kalıbı kullan.** Yeni bir şey yazmadan önce projede benzeri var mı bak; varsa onu aynı şekilde kullan.
6. **Belirsizse sor, tahmin etme.** Özellikle veri modeli, ödeme, yetki ve silme işlemlerinde.
7. **Mimari karar = kayıt.** Kütüphane seçimi, veri modeli değişikliği, servis değişikliği gibi kararları `docs/KARARLAR.md`'ye ekle.
8. **Hata düzeltirken kök nedeni bul.** Belirtiyi yamamak yok. Önce hatayı yeniden üret, sonra düzelt, sonra regresyon testi ekle.
9. **Aynı hatada 2 deneme kuralı.** Aynı sorunu 2 denemede çözemezsen dur; ne denediğini, ne öğrendiğini ve olası nedenleri yaz, benden yön iste.
10. **Oturum sonunda `docs/ILERLEME.md`'yi güncelle.**

## "Bitti" tanımı

Bir görev ancak şunların hepsi doğruysa bitmiştir:

- [ ] Kabul kriterleri karşılandı (PRD / YOL-HARITASI'ndaki)
- [ ] Lint ve tip kontrolü temiz
- [ ] Testler geçiyor; kritik akışa dokunulduysa test eklendi/güncellendi
- [ ] Hata, boş ve yükleniyor durumları ele alındı
- [ ] Çalıştığına dair kanıt gösterildi (ekran görüntüsü, istek/yanıt, test çıktısı; `docs/STACK.md` → "Doğrulama")
- [ ] Kodda sır (API key, şifre, token) yok; yeni ortam değişkeni `.env.example`'a eklendi
- [ ] `docs/YOL-HARITASI.md`'de görev işaretlendi
- [ ] Kullanıcıya ne yapıldığı ve nasıl test edileceği 2-3 satırla anlatıldı

## Asla

- `.env` dosyalarını okuma, yazma, içeriğini ekrana basma.
- Sırrı koda, loga, commit mesajına veya istemci tarafına (tarayıcı/mobil paket) koyma.
- Onay almadan: veritabanı silme/sıfırlama, `git push --force`, `git reset --hard`, toplu dosya silme, prod ortamına deploy.
- Testi geçirmek için testi silme veya zayıflatma.
- Var olmayan bir API'yi, paketi veya fonksiyonu varmış gibi kullanma; emin değilsen dokümana bak.
- Yorum satırlarını, hata yönetimini veya doğrulamayı gerekçesiz silme.

## Git

- Küçük ve sık commit. Her çalışan adım bir kayıt noktasıdır.
- Mesaj biçimi: `tür: kısa açıklama` (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`).
- `main` her zaman çalışır durumda olmalı. Riskli iş için dal aç.
