---
name: motion-video
description: Ürünün tanıtım videosunu (SaaS demo döngüsü, açılış sayfası videosu, sosyal medya klibi) kod ile üretir. Tek HTML dosyası ve renderAt(t), gerçek imleç, kapalı formlu yaylar, 120 BPM ritim; Playwright ile kare kare çekilir, ffmpeg ile MP4'e çevrilir. "Tanıtım videosu", "demo video", "ürün animasyonu", "landing page loop" istendiğinde kullan. Uygulama içi animasyon için değil (onun için ui-motion).
---

# Tanıtım videosu (kod ile)

> Bu skill N01ennn'in "UI motion design for Opus 5.5" prompt'undan uyarlanmıştır (Ekim 2026).

**Temel sorun:** Claude kendi kareleri hareket ederken izleyemez. Bu yüzden her kare `t` zamanından hesaplanır; gerçek bir imleç hikâyeyi yürütür; iş bitti demeden önce durağan kareler kontrol edilir.

Kararları `docs/workflow/decision-protocol.md`'ye göre sor. Görsel kararlar (yön, kare seçimi) önizlemeyle sorulur.

## 0. Ön koşullar

Kontrol et, eksikse kullanıcıya kurulum komutunu ver (kurulum kullanıcının onayıyla yapılır):

| Araç | Kontrol | Kurulum |
|---|---|---|
| Node 18+ | `node --version` | - |
| Playwright + Chromium | `npx playwright --version` | `npm i -D playwright` ve `npx playwright install chromium` |
| ffmpeg | `ffmpeg -version` | Windows: `winget install Gyan.FFmpeg` · macOS: `brew install ffmpeg` · Linux: paket yöneticisi |

**Remotion seçeneği:** Proje React kullanıyorsa ve altyazı, ses miksajı veya çok sahneli bir video gerekiyorsa Remotion daha uygun olabilir. Bunu karar olarak sor:
- Remotion'ın resmi plugin'i `.claude/settings.json`'da tanımlı ama kapalı. Seçilirse `node .claude/hooks/tools.mjs --enable video` ile bu makinede açılır (`/tools`; onay istenir) ve `/remotion-best-practices` kullanılır.
- Remotion büyük şirketler için ücretli lisans ister. Kullanıcıya kendi durumunu remotion.dev'deki lisans sayfasından doğrulamasını söyle.

## 1. Girdiler (önce sor)

Tek turda sor (en fazla 4 soru, önerili):

1. **Durumlar:** Ürünün 8-12 arayüz durumu. Kaynak: çalışan uygulamanın rotaları (önerilen), ekran görüntüleri veya bileşenler. Her durumun ne gösterdiğini bir cümleyle listele ve onaylat.
2. **Renk ve tipografi:** Siyah, beyaz ve tek bir vurgu rengi (varsayılan `DESIGN.md`'deki ana renk), yazı tipleri, logo (`public/brand/` veya `assets/brand/`).
3. **Ses:** 120 BPM bir müzik parçası (kullanıcı verir; lisansı kullanıcının sorumluluğunda) veya sadece tık izi (otomatik üretilir) veya sessiz.
4. **Format ve kapanış:** 1440×1440 (varsayılan, sosyal medya ve açılış sayfası) veya 1920×1080; son karede görünecek tek satırlık metin (`humanizer:humanizer`'dan geçir).

## 2. Yön

- **Tek kesintisiz dönüşüm (morph):** Durumlar arasında kesme ve solma yok. Bir öğe bir sonraki durumun öğesine dönüşür.
- **Gerçek imleç:** Her değişikliği imleç tetikler (hover, tıklama, sürükleme, yazma). İmleç asla kadrajdan çıkmaz.
- **Kamera:** Her durumda o durumu kadrajı dolduracak şekilde yakınlaşır, sonra geri çekilir.
- **Yaylar:** Kütleli ve çok küçük taşmalı yaylar kullanılır.
- **Yasak:** zıplayan eğriler, parçacık efektleri, parlamalar, arayüzde gradyan, ölü zaman, şablon görünümü.

## 3. Yapı

- 120 BPM, **her vuruşta tek eylem**. Örnek akış: buton → yükleniyor → onay → panel → liste → grafik → … → açılış karesine dönüş.
- Ana (hero) durum 2 vuruş bekler. Hiçbir an 4 vuruş boyunca hareketsiz kalmaz.
- **Vuruş haritası:** `beats.json` dosyasında her vuruş için zaman (s), eylem, hedef öğe ve kamera bilgisi. Müzik verildiyse vuruşlar parçadan çıkarılır; ilk vuruşun zamanı ffmpeg ile ses başlangıcından tespit edilir, gerisi 0.5 s ızgarasına oturtulur. Gerekirse `uv run --with numpy` ile kısa bir analiz yapılır.

## 4. Yapım

Dosyalar `marketing/motion/<ad>/` altında: `index.html`, `beats.json`, `render.mjs`. Kareler ve çıktı `frames/` ve `out/` altına gider (bunlar git'e girmez).

**`index.html`**
- `renderAt(t)` ve `seek(t)` fonksiyonları dışa açılır.
- Her piksel `t`'den hesaplanır. CSS `transition` ve `animation` yok; `setTimeout`, `requestAnimationFrame` ve `Date.now()` ile zamanlama yok.

**Yaylar** kapalı formlu hesaplanır. Hedef uçuş ortasında değişirse yeni yay, o anki konum ve hızdan başlar. `y` hedefe uzaklık, `ω` doğal frekans, `ζ` sönüm oranıdır:

```js
// y0: başlangıçtaki uzaklık, v0: başlangıç hızı, t: geçen süre (s)
function yay(y0, v0, omega, zeta, t) {
  const e = Math.exp(-zeta * omega * t);
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta), c = Math.cos(wd * t), s = Math.sin(wd * t);
    return { y: e * (y0 * c + ((v0 + zeta * omega * y0) / wd) * s),
             v: e * (v0 * c - ((omega * omega * y0 + zeta * omega * v0) / wd) * s) };
  }
  return { y: (y0 + (v0 + omega * y0) * t) * e, v: (v0 - omega * (v0 + omega * y0) * t) * e }; // kritik sönüm
}
// Oturma süresi Ts (%2) ≈ 4 / (ζ·ω)  →  ω = 4 / (ζ·Ts)
// Arayüz: ζ 0.7-0.8, Ts 0.3-0.45 s · Kamera: ζ ≈ 1.0
```

**`render.mjs`** (Playwright)
- Belirlenen boyutta Chromium açılır ve her karede `seek(t)` çağrılır.
- **Hareket bulanıklığı:** Kare başına 4 alt kare çekilir, yani 240 fps. ffmpeg bunları birleştirir:

```bash
ffmpeg -y -framerate 240 -i frames/%06d.png -i track.wav \
  -vf "tmix=frames=4,fps=60" -shortest \
  -c:v libx264 -crf 14 -pix_fmt yuv420p out/loop.mp4
```

Ses yoksa `-i track.wav` ve `-shortest` kaldırılır. Tık izi gerekiyorsa vuruş zamanlarında kısa sinüs vuruşlarıyla ffmpeg'in `aevalsrc` kaynağı kullanılarak üretilir.

## 5. Tuzaklar (kontrol et)

- **Döngü dikişi:** Son kare = ilk kare, imleç dahil.
- **Bulanıklık:** Ölçeklenen öğelerde `will-change` yok; yazıyı bulanıklaştırır. Her yakınlaşmadan sonra yazıyı 1x'te kontrol et.
- **Belirlenimcilik:** `seek(7.25)` iki kez çağrılınca piksel piksel aynı sonuç vermeli. Ekran görüntüsü tamponlarını karşılaştır.
- **Fontlar:** Fontlar yerel dosyadan yüklenir ve render başlamadan `document.fonts.ready` beklenir.

## 6. Başlangıç sırası

1. Girdileri sor (§1).
2. **Vuruş haritasını** tablo olarak göster ve **4 durağan kare** üret: açılış durumu, iki ara durum, döngü dikişi (son kare ile ilk kareyi yan yana).
3. Kareleri `.previews/NN-motion/` altında göster ve AskUserQuestion ile onay iste: Başla / Şunu değiştir. **Kullanıcı "başla" demeden tam render alma.**
4. Render al, belirlenimcilik ve döngü dikişi testini çalıştır, videonun 3 karesinin ekran görüntüsünü göster.
5. Kararları `docs/decisions/log.md`'ye yaz. Videonun yolunu ve nasıl yeniden üretileceğini `marketing/motion/<ad>/README.md` dosyasına yaz.
