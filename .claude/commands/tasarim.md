---
description: Tasarım kararlarını görsel önizlemelerle aldırır ve doğru tasarım skill'iyle uygular.
argument-hint: [genel | sayfa/ekran adı | bileşen adı]
---

Kapsam: $ARGUMENTS (boşsa `genel`)

Her tasarım kararı **görsel önizlemeyle** sorulur (`docs/KARAR-PROTOKOLU.md` §5). Yön ve skill eşlemesi `docs/SKILLER.md` → "Tasarım" bölümünde. Soru modunda `tasarim` kapalıysa önerilenle ilerle, önizlemeleri yine üret ve raporla.

## Hazırlık

1. Oku: `docs/PRD.md`, `docs/TASARIM.md` (karar günlüğü), varsa `PRODUCT.md` ve `DESIGN.md`, `docs/SOZLUK.md` (hitap, terimler).
2. `PRODUCT.md` yoksa `impeccable:impeccable` → `init` çalıştır. PRD'deki bilgiyi kullan, sadece eksikleri sor.

## A. Genel tasarım dili (`genel` veya DESIGN.md yoksa)

Her karar için: önizleme üret → aç ve ekran görüntüsünü göster → AskUserQuestion ile sor → kaydet.

1. **Stil yönü** (büyük karar). `docs/SKILLER.md`'deki yönlerden ürüne en uygun 3'ünü seç (+ önerin ilk sırada). Her yön için aynı açılış bölümünü (hero + bir içerik bölümü) **o yönün skill'iyle**, gerçek içerikle üret: `.onizleme/01-stil/a.html`, `b.html`, `c.html` + `index.html`. Mobilde açılış ekranı + bir liste ekranı.
2. **Renk paleti.** `ui-ux-pro-max:ui-ux-pro-max` ile ürün tipine uygun 3 palet adayı çıkar. Seçilen yönü 3 palette, açık ve koyu temada yan yana göster: `.onizleme/02-renk/index.html`.
3. **Yazı tipi çifti.** `ui-ux-pro-max:ui-ux-pro-max` ile 3 çift seç (Türkçe karakter desteği şart: ğ, ş, ı, İ). Aynı bölümü 3 çiftle göster: `.onizleme/03-yazi/index.html`.
4. **Detaylar** (tek karşılaştırma sayfası, tek turda en fazla 4 soru): köşe yuvarlaklığı, gölge/derinlik, animasyon miktarı (yok / ölçülü / zengin), ikon seti, koyu tema (var / yok / sistem).
5. **Kaydet:**
   - `impeccable:impeccable` ile görsel dünyayı `DESIGN.md`'ye yaz; seçilen önizleme referans tasarımdır.
   - `ui-ux-pro-max:design-system` ile belirteçleri tamamla.
   - `docs/TASARIM.md` → "Seçilen yön" ve karar günlüğü.
   - Her kararı `docs/KARARLAR.md` günlüğüne ekle.

## B. Sayfa / ekran / bileşen

1. **Bölüm yapısı:** Sayfanın amacına göre 2-3 bölüm sırası ve düzeni öner. Örnek: açılış sayfası için "Hero → Problem → Nasıl çalışır → Kanıt → Fiyat → SSS → CTA". Her birinin kaba görsel taslağını (wireframe seviyesinde, gerçek metinle) `.onizleme/NN-<sayfa>-yapi/` altına üret ve sor.
2. **Metin:** Bölüm metinlerini yaz, `humanizer:humanizer`'dan geçir. Başlık ve ana çağrı (CTA) için 2-3 alternatif sun ve sor (`icerik` konusu).
3. **Kritik bölümler** (hero, fiyat tablosu, ana panel ekranı): 2-3 görsel varyant üret ve sor.
4. **Uygula:** Seçilen yön skill'i + `impeccable:impeccable` ile, `DESIGN.md` belirteçlerine bağlı kal.
5. **Değerlendir:** `impeccable:impeccable` → `critique` ve `audit`. Bulguları önem sırasıyla listele ve hangilerinin düzeltileceğini **çoklu seçimle sor**. Sonra `polish`.
6. **Kanıt:** Masaüstü (1440 px) ve mobil (390 px) ekran görüntüsü; açık ve koyu tema. Kullanıcı onayı.

## Kapanış

Durum bloğu. `.onizleme/` klasörü git'e girmez; kararlar dokümanlarda yaşar.
