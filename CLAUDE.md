# [PROJE ADI]

> [Tek cümle: Bu proje kimin için, hangi problemi çözüyor?]

Bu dosya her oturumda otomatik okunur. Ayrıntılar `docs/` altında.

**Kurulum durumu:** Kökte `kit/` klasörü varsa ve `.kit.json` yoksa proje henüz kurulmamıştır. Kullanıcıya `/baslat [fikir]` ile başlamasını öner; kurulum bitmeden kod yazma.

## Her oturumda bağlam

@docs/KARAR-PROTOKOLU.md
@docs/SKILLER.md
@docs/STACK.md
@docs/ILERLEME.md

Gerektiğinde oku (her seferinde değil):

| Dosya | Ne zaman |
|---|---|
| `docs/PRD.md` | Özelliğin kapsamı veya kabul kriteri belirsizse |
| `docs/MIMARI.md` | Yeni dosya, tablo, servis veya klasör eklerken |
| `docs/YOL-HARITASI.md` | Sıradaki görevi seçerken, görev bitince işaretlerken |
| `docs/KARARLAR.md` | Bir karar sormadan önce: daha önce sorulmuş mu? |
| `docs/SOZLUK.md` | Yeni bir kavrama isim verirken |
| `docs/TASARIM.md`, `DESIGN.md`, `PRODUCT.md` | Arayüz yazarken veya değiştirirken |
| `docs/TEST-PLANI.md` | Kritik akışa dokunurken |
| `docs/GUVENLIK.md` | Auth, veri, dosya yükleme, dış API, ödeme koduna dokunurken |
| `docs/AI.md` (varsa) | Prompt, model çağrısı veya AI özelliğine dokunurken |

Otomatik koruma: `.claude/hooks/` sır yazımını engeller ve dosyaları biçimlendirir. Bir hook işini engellerse mesajı oku ve nedeni düzelt; hook'u atlatmaya çalışma.

## Komutlar

```bash
# /baslat seçilen stack'e göre doldurur
geliştirme:  [ ]
test:        [ ]
lint:        [ ]
tip kontrol: [ ]
build:       [ ]
```

## Çalışma kuralları

1. **Karar senin değil.** Her karar noktasında `docs/KARAR-PROTOKOLU.md`'ye göre sor. Soru modu kapalı konular hariç.
2. **Önce plan, sonra kod.** 2'den fazla dosyaya dokunan her iş için önce kısa plan yaz ve onay bekle.
3. **Tek seferde tek görev.** Görev dışı bir sorun görürsen düzeltme, `docs/ILERLEME.md` → "Açık sorunlar"a yaz ve raporla.
4. **Kapsamı genişletme.** PRD'de olmayan özellik, ayar veya soyutlama ekleme; gerekli görüyorsan karar noktası olarak sor.
5. **Doğru skill'i kullan** (`docs/SKILLER.md`). Kod yazarken her zaman `ponytail:ponytail`.
6. **Mevcut kalıbı kullan.** Yeni bir şey yazmadan önce projede benzeri var mı bak.
7. **Hata düzeltirken kök nedeni bul.** Önce yeniden üret, sonra düzelt, sonra regresyon testi ekle.
8. **Aynı hatada 2 deneme kuralı.** İki denemede çözemezsen dur; ne denediğini ve olası nedenleri yaz, yön iste.
9. **Her cevabın sonunda durum bloğu** (`docs/KARAR-PROTOKOLU.md` §6).
10. **Oturum sonunda `/oturum-sonu`.** ILERLEME güncellenir, durum panosu yenilenir.

## "Bitti" tanımı

Bir görev ancak şunların hepsi doğruysa bitmiştir:

- [ ] Kabul kriterleri karşılandı
- [ ] Görev sırasında çıkan tüm kararlar soruldu ve `docs/KARARLAR.md`'ye yazıldı
- [ ] Lint ve tip kontrolü temiz; testler geçiyor; kritik akışa dokunulduysa test eklendi
- [ ] Hata, boş ve yükleniyor durumları ele alındı
- [ ] Çalıştığına dair kanıt gösterildi (`docs/STACK.md` → "Doğrulama")
- [ ] Arayüz varsa: `DESIGN.md`'ye uygun; `impeccable` critique yapıldı; metinler humanizer'dan geçti
- [ ] Kodda sır yok; yeni ortam değişkeni `.env.example`'da
- [ ] `docs/YOL-HARITASI.md`'de görev işaretlendi

## Asla

- `.env` dosyalarını okuma, yazma, içeriğini ekrana basma.
- Sırrı koda, loga, commit mesajına veya istemci tarafına (tarayıcı/mobil paket) koyma.
- Onay almadan (soru modundan bağımsız): veritabanı silme/sıfırlama, `git push --force`, `git reset --hard`, toplu dosya silme, prod ortamına deploy, para harcatan işlem.
- Testi geçirmek için testi silme veya zayıflatma.
- Var olmayan bir API'yi, paketi veya fonksiyonu varmış gibi kullanma; emin değilsen dokümana bak.
- Kullanıcı adına karar verip "şöyle yaptım" diye sonradan bildirme (soru modu kapalı konular hariç).

## Git

- Küçük ve sık commit. Her çalışan adım bir kayıt noktasıdır.
- Mesaj biçimi: `tür: kısa açıklama` (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`).
- `main` her zaman çalışır durumda olmalı. Riskli iş için dal aç.
