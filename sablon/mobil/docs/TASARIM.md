# Tasarım Sistemi

> AI her ekranı yeniden "tasarlamasın" diye var. Arayüz yazarken bu dosyanın dışına çıkılmaz;
> yeni bir renk, boyut veya bileşen gerekiyorsa önce buraya ve tema dosyasına eklenir.
> İlk ekrandan önce doldur (G-007).

## 1. Kimlik

- **His:** [3 sıfat]
- **Referanslar:** [Beğendiğin 2-3 uygulama ve neyini beğendiğin]
- **Platform tutumu:** [iki platformda aynı görünüm / her platformda yerel hissiyat]

## 2. Tasarım belirteçleri (token)

Tüm değerler tek bir tema dosyasında: `constants/theme.ts`. Bileşenlerde ham renk (`'#3b82f6'`) veya rastgele sayı (`marginTop: 13`) yazılmaz.

| Belirteç | Açık tema | Koyu tema | Nerede |
|---|---|---|---|
| `background` | | | Ekran zemini |
| `surface` | | | Kart, sayfa (sheet) |
| `text` | | | Ana metin |
| `textMuted` | | | İkincil metin |
| `primary` | | | Ana eylem |
| `danger` | | | Silme, hata |
| `border` | | | Ayırıcılar |

- **Yazı ölçeği:** 12 / 14 / 16 (gövde) / 20 / 24 / 32. Sistem yazı boyutu büyütmesine (Dynamic Type / font scale) uyumlu; metin kesilmiyor.
- **Boşluk ölçeği:** 4 / 8 / 12 / 16 / 24 / 32 / 48
- **Köşe:** [ ] · **Gölge/yükselti:** [ ]
- **Koyu tema:** `useColorScheme()` ile; iki tema da her ekranda denenir.

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
