# Tasarım

> Arayüzün tek kaynağı üç dosyadır:
> - `PRODUCT.md`: ürün bağlamı (kim, ne için). Impeccable `init` ile, PRD'den beslenerek yazılır.
> - `DESIGN.md`: görsel dünya ve tasarım belirteçleri (renk, yazı, boşluk, köşe, gölge, hareket). Impeccable yazar; bileşenler sadece bu belirteçleri kullanır.
> - Bu dosya: seçilen yön, tasarım karar günlüğü ve her ekranda geçerli kalıcı kurallar.
>
> Kararlar `/tasarim` ile **görsel önizlemelerle** alınır (`docs/KARAR-PROTOKOLU.md` §5). Yeni bir renk, boyut veya bileşen
> gerekiyorsa önce karar olarak sorulur, sonra DESIGN.md'ye eklenir. Kodda ham renk veya rastgele boyut yazılmaz.

## 1. Seçilen yön

| Alan | Seçim | Skill | Önizleme | Tarih |
|---|---|---|---|---|
| Stil yönü | [örn. Premium / Apple tarzı] | [örn. taste-skill:high-end-visual-design] | `.onizleme/01-stil/b.html` | |
| Renk paleti | | ui-ux-pro-max | | |
| Yazı tipi çifti | | ui-ux-pro-max | | |
| Köşe / gölge / hareket | | | | |
| Koyu tema | | | | |
| Hitap (sen/siz) | | | | |

## 2. Tasarım karar günlüğü

| # | Tarih | Ekran/kapsam | Soru | Seçilen | Önizleme |
|---|---|---|---|---|---|

## 3. Bileşenler

- Ortak bileşenler `components/` altında: `Button`, `TextField`, `Screen` (SafeArea + klavye + kaydırma), `EmptyState`, `ErrorState`, `ListSkeleton`. Yeni ekran bunlarla kurulur.
- Ekranda en fazla 1 ana eylem; birincil buton ekranın altında başparmak erişiminde.
- Liste: `FlatList`/`FlashList`, boş durum + yükleniyor iskeleti + aşağı çekip yenileme.
- İkon seti: [@expo/vector-icons → tek set].
- Geri bildirim: önemli eylemlerde hafif titreşim (haptics), tutarlı kullanım.

## 4. Durumlar (her ekranda)

| Durum | Nasıl görünür |
|---|---|
| Yükleniyor | İskelet |
| Boş | Bir cümle + ilk adım butonu |
| Hata | Ne oldu + tekrar dene |
| Çevrimdışı | Üstte şerit; önbellekteki veri gösterilir, yazma işlemleri sıraya alınır veya engellenir |

## 5. Erişilebilirlik ve platform

- Dokunma alanı en az 44x44 pt; metin kontrastı en az 4.5:1.
- `accessibilityLabel` ikon butonlarda zorunlu; ekran okuyucuyla (VoiceOver/TalkBack) ana akış bir kez denenir.
- Güvenli alan (çentik, ana ekran çubuğu) ve klavye hiçbir içeriği örtmez.
- Android geri tuşu ve iOS kaydırarak geri dönme hareketi beklendiği gibi çalışır.

## 6. Metin dili

- Hitap: [sen/siz] (`docs/SOZLUK.md` ile aynı).
- Butonlar fiil; izin açıklama metinleri neden gerektiğini söyler.
