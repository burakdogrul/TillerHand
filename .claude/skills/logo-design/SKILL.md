---
name: logo-design
description: Marka logosu tasarlar: önce marka sorularını sorar, 4-6 SVG konsepti görsel önizlemeyle sunar, seçilen konsepti iyileştirir ve favicon, uygulama ikonu ve PNG boyutlarıyla birlikte marka paketini üretir. Logo, ikon, favicon, marka işareti veya "marka kimliği" istendiğinde kullan. API gerektirmez; çıktı vektördür ve düzenlenebilir.
---

# Logo tasarımı

Logo bir görsel üretim isteği değil, **koddur**: basit geometrik şekillerden kurulan, her boyutta okunan, düzenlenebilir SVG. Kararları `docs/workflow/decision-protocol.md`'ye göre sor (tasarım kararı = görsel önizleme). `tasarim` konusu soru modunda kapalıysa önerilenle ilerle ve önizlemeleri yine üret.

## 1. Marka özeti (sorular)

Önce `docs/product/prd.md`, `docs/product/glossary.md`, `DESIGN.md` (varsa renk ve yazı tipi) dosyalarını oku. Cevabı bunlardan çıkarabildiğin soruları önerili seçeneklerle, tek turda (en fazla 4 soru) sor:

1. **Kişilik:** 3 sıfat. Örneğin güvenilir, sade, hızlı veya oyunbaz, sıcak, cesur.
2. **Logo tipi:**
   - **Kelime işareti:** sadece adın kendisi.
   - **Harf işareti:** baş harf.
   - **Simge + kelime:** önerilen; en esnek.
   - **Amblem:** ad bir şeklin içinde.
3. **Simge fikri:** Ürünün ne yaptığından türeyen 2-3 kavram önerisi (örn. fatura → kâğıt kıvrımı, onay işareti, yukarı ok).
4. **Kısıtlar:** Mevcut renkler, kaçınılacaklar (rakiplerin logoları, klişe simgeler), kullanılacak yerler (uygulama ikonu, favicon, sosyal medya).

Cevapları `docs/design/brand.md` → "Marka özeti" bölümüne yaz.

## 2. Konseptler

4-6 **gerçekten farklı** konsept üret. Farklılık fikirden gelmeli; aynı şeklin renk varyasyonları sayılmaz. Kurallar:

- SVG elle kurulur: `viewBox="0 0 64 64"` (simge) ve `0 0 240 64` (yatay). `rect`, `circle`, `path` ve basit dönüşümler kullan. 8 birimlik ızgaraya otur, optik dengeyi kontrol et.
- En fazla 2 renk + nötr. Tek renkli (siyah ve beyaz) hali de çalışmalı.
- **16 px'te tanınmalı.** İnce çizgi, küçük boşluk, ince ayrıntı yok.
- Kelime işaretinde konseptlerde yazı tipi kullanılabilir (`DESIGN.md`'deki başlık fontu). Son halde yazı yol (path) olmalı (bkz. §4).
- Klişelerden kaçın: ampul, dişli, dünya küresi, rastgele gradyan, kalkan + tik.

Önizleme: `.previews/NN-logo/index.html`. Her konsept için açık ve koyu zeminde büyük hal, 64/32/16 px boyutlar, tek renkli hal ve gerçek kullanım örneği (tarayıcı sekmesi, uygulama ikonu karesi). Tarayıcı aracı varsa aç ve ekran görüntüsü göster. Sonra AskUserQuestion ile sor: A-F, her birinin fikrini ve güçlü yanını tek cümleyle yaz.

## 3. İyileştirme

Seçilen konsept için 2-3 ince ayar varyantı üret (ağırlık, oran, köşe, renk) ve aynı yolla sor. Kullanıcı karma isterse ("A'nın simgesi, C'nin yazısı") yeni önizlemeyle doğrula.

## 4. Marka paketi

Çıktı klasörü: web için `public/brand/`, mobil için `assets/brand/` (yapı haritasında izinli).

| Dosya | İçerik |
|---|---|
| `logo.svg` | Simge + kelime, yatay |
| `logo-mark.svg` | Sadece simge |
| `logo-wordmark.svg` | Sadece kelime |
| `logo-mono.svg`, `logo-white.svg` | Tek renk, koyu zemin için beyaz |
| `favicon.svg` | Basitleştirilmiş simge (16 px okunurluğu için gerekirse ayrı çizim) |
| `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` | Web |
| `icon.png` (1024), `adaptive-icon.png` (Android ön plan, güvenli alan %66) | Mobil |

- **Yazıyı yola çevir:** Kelime işaretindeki metni yazı tipi dosyasından yola çevir; böylece font yüklü olmayan yerde de aynı görünür. Örnek: `opentype.js` ile kısa bir script, `sandbox/` altında çalıştırılır. Font lisansının buna izin verdiğini kontrol et.
- **Optimize et:** `npx --yes svgo --multipass <dosya>`
- **PNG üret:** `npx --yes sharp-cli -i logo-mark.svg -o icon-512.png resize 512 512`. Bu araçta sorun olursa Playwright ile SVG'nin ekran görüntüsü alınabilir.
- Web'de `<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">` ve PNG yedekleri. Mobilde `app.config.ts` → `icon`, `android.adaptiveIcon`.

## 5. Kayıt

- `docs/design/brand.md`:
  - Marka özeti ve seçilen konseptin gerekçesi
  - Kullanım kuralları: boşluk payı (simge yüksekliğinin yarısı), en küçük boyut, renk kodları, yapılmaması gerekenler (esnetme, gölge, döndürme, renk değiştirme)
- Seçimler `docs/decisions/log.md` (konu: `tasarim`) ve `docs/design/design-guide.md` → karar günlüğü.
- Slogan veya marka metni varsa `humanizer:humanizer`'dan geçir.
