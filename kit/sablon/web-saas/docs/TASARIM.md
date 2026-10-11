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
