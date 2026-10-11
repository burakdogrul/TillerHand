# Tasarım Sistemi

> AI her ekranı yeniden "tasarlamasın" diye var. Arayüz yazarken bu dosyanın dışına çıkılmaz;
> yeni bir renk, boyut veya bileşen gerekiyorsa önce buraya eklenir.
> İlk ekrandan önce doldur (G-007). Tasarım skill'lerin kuruluysa bu dosyayı onlarla birlikte oluşturabilirsin.

## 1. Kimlik

- **His:** [3 sıfat: örn. sakin, güvenilir, hızlı]
- **Referanslar:** [Beğendiğin 2-3 ürün ve neyini beğendiğin]
- **Kaçınılacaklar:** [örn. mor-mavi gradyan, her yerde gölge, emoji ikonlar]

## 2. Tasarım belirteçleri (token)

Renkler sadece bu değişkenlerle kullanılır; kodda ham hex (`#3b82f6`) veya rastgele Tailwind rengi (`bg-blue-500`) yazılmaz.
shadcn/ui kullanılıyorsa bu değerler `app/globals.css` içindeki CSS değişkenleridir.

| Belirteç | Açık tema | Koyu tema | Nerede |
|---|---|---|---|
| `--background` | | | Sayfa zemini |
| `--foreground` | | | Ana metin |
| `--muted-foreground` | | | İkincil metin |
| `--primary` | | | Ana eylem butonu, bağlantı |
| `--destructive` | | | Silme, hata |
| `--border` | | | Çizgiler |
| [başarı / uyarı] | | | Durum etiketleri |

- **Yazı tipi:** başlık [ ], gövde [ ], sayı/kod [ ]
- **Yazı ölçeği:** 12 / 14 / 16 (gövde) / 20 / 24 / 32 — bunların dışında boyut yok
- **Boşluk ölçeği:** Tailwind 1-2-3-4-6-8-12-16 (4px katları); rastgele `mt-[13px]` yok
- **Köşe:** [örn. `rounded-md` her yerde, kartlarda `rounded-lg`]
- **Gölge:** [örn. sadece açılır menü ve dialog'da]

## 3. Bileşenler

- Önce `components/ui/` (shadcn) içinde var mı bak; varsa onu kullan, kopyalayıp değiştirme.
- Buton varyantları: `default` (sayfada en fazla 1 ana eylem), `secondary`, `outline`, `ghost`, `destructive`.
- Form: etiket her zaman görünür (sadece placeholder değil), hata mesajı alanın altında, gönderirken buton devre dışı + yükleniyor.
- Tablo/liste: boş durum bileşeni + yükleniyor iskeleti (skeleton) zorunlu.
- İkonlar: [lucide-react], tek set.

## 4. Durumlar (her ekranda)

| Durum | Nasıl görünür |
|---|---|
| Yükleniyor | İskelet; 300 ms'den kısa yüklemelerde hiçbir şey |
| Boş | Ne olacağını anlatan bir cümle + ilk adım butonu |
| Hata | Ne oldu + ne yapabilir (tekrar dene / destek); teknik detay yok |
| Başarılı işlem | Kısa bildirim (toast), 3-4 sn |

## 5. Erişilebilirlik

- Metin kontrastı en az 4.5:1 (büyük metin 3:1); iki temada da.
- Klavye ile her şeye ulaşılır, odak halkası görünür.
- Görsellerde `alt`, ikon butonlarda `aria-label`.
- Mobil genişlikte (375 px) yatay kaydırma yok, dokunma alanı en az 44 px.

## 6. Metin dili

- Hitap: [sen/siz] (`docs/SOZLUK.md` ile aynı).
- Butonlar fiil: "Kaydet", "Fatura oluştur"; "Tamam", "Gönder" gibi belirsiz değil.
- Hata mesajı suçlamaz ve çözümü söyler: "E-posta adresi geçerli değil. Örnek: ad@alan.com".
