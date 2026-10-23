---
name: ui-motion
description: Uygulama içi hareket kuralları (mikro etkileşim, geçiş, yükleniyor, liste ve sayfa animasyonları). Arayüzde animasyon veya geçiş eklerken, değiştirirken ya da "daha canlı / akıcı olsun" denildiğinde kullan. Tanıtım videosu için değil (onun için motion-video).
---

# Arayüz hareketi

Hareketin işi bilgi vermektir: ne değişti, nereden geldi, sistem çalışıyor mu? Süs için hareket yok. Hareket dili `DESIGN.md` → "Motion" bölümünde belirteç olarak tanımlanır; yoksa önce `/design` ile karar alınır (animasyon miktarı: yok / ölçülü / zengin).

## Kurallar

1. **Sadece `transform` ve `opacity`** animasyonlanır. `width`, `height`, `top`, `left`, `box-shadow`, `filter` animasyonu yok (layout ve boyama maliyeti). Gerekirse FLIP veya layout animasyonu kullan.
2. **Süreler** (belirteç adlarıyla):

   | Belirteç | Süre | Kullanım |
   |---|---|---|
   | `motion.micro` | 100-150 ms | basma, hover, toggle |
   | `motion.base` | 200-250 ms | açılır menü, tooltip, kart |
   | `motion.page` | 300-400 ms | sayfa veya ekran geçişi, modal |
   | `motion.max` | 500 ms | hiçbir arayüz hareketi bunu geçmez |

3. **Yay (spring) tercih edilir.** Kesintiye uğrayabilen (kullanıcının ortada değiştirebildiği) her hareket yayla yapılır. Yaylar hız korur ve doğal biter. Varsayılan: sönüm 0.75-0.85, oturma süresi 0.3-0.4 s, en fazla çok küçük taşma. Zıplayan (bouncy) yay sadece bilinçli marka tercihiyse.
4. **Eğriler** (yay kullanılmıyorsa): girişte `ease-out`, çıkışta `ease-in`, yer değiştirmede `ease-in-out`. `linear` sadece ilerleme çubuğu ve döngüsel spinner için.
5. **Kademeli liste (stagger):** öğe başına 20-40 ms; en fazla ilk 8-10 öğe kademeli girer, gerisi birlikte.
6. **Yükleniyor:** 300 ms'den kısa işlemlerde gösterge yok; 300 ms-2 s arası iskelet veya spinner; 2 s üstü ilerleme ve ne yapıldığının metni. İskelet ile içerik arasında düzen kayması olmamalı.
7. **Erişilebilirlik:** `prefers-reduced-motion: reduce` (web) veya sistem "hareketi azalt" (mobil) açıkken yer değiştiren ve ölçeklenen hareketler kapatılır, sadece kısa opaklık geçişi kalır. Otomatik oynayan, 5 saniyeden uzun hareket durdurulabilir olmalı. Saniyede 3'ten fazla yanıp sönme yok.
8. **Metin ve okunurluk:** Okunması gereken metin hareket ederken okunmaz; hareket bittikten sonra okunur olmalı. Ölçeklenen öğelerde `will-change` kalıcı bırakılmaz (yazıyı bulanıklaştırır).
9. **Performans:** 60 fps hedefi; düşük seviye cihazda (mobil) dene. Uzun listede her öğeye ayrı animasyon yok.

## Araçlar

| Stack | Kütüphane |
|---|---|
| Web (React/Next.js) | Basit durumlar için CSS geçişleri; yay, layout ve giriş/çıkış için **Motion** (`motion/react`). GSAP sadece açılış sayfasında kaydırmaya bağlı anlatım gerekiyorsa (`gsap-skills:`, `tasarim` paketi; ücretsiz, ticari dahil, Webflow'a rakip kodsuz animasyon aracında yasak). |
| Web 3D | **three.js**; React'te **React Three Fiber** + drei. Skill'ler `/start` 3c'de kopyalanır (`threejs-*`). |
| Mobil (Expo) | **react-native-reanimated** (UI thread'de çalışır) ve `LayoutAnimation` yerine Reanimated layout animasyonları. Haptik geri bildirim önemli eylemlerde. |

Yeni bir animasyon kütüphanesi eklemek `teknik` karardır; sor.

## 3D

1. **Tembel yükle.** three.js ana pakete girmez: sahne görünür alana gelince dinamik `import()` ile yüklenir; Next.js'te `ssr: false`. İlk ekranı (LCP) beklemez.
2. **Yedek her zaman var.** WebGL yoksa, bağlam kaybolursa (`webglcontextlost`) veya yükleme hata verirse aynı yerde statik görsel gösterilir. Sahne bilgi taşıyorsa aynı bilgi metin olarak da sayfada olur.
3. **Hareket azaltma.** `prefers-reduced-motion: reduce` açıkken otomatik dönen kamera ve sürekli animasyon durur; sahne sabit kare olarak kalır.
4. **Mobil GPU.** Piksel oranı `Math.min(devicePixelRatio, 2)`; gölge ve son işlem efektleri mobilde kapalı başlar. Sahne görünmüyorken veya sekme arka plandayken render döngüsü durur (R3F'te `frameloop="demand"` tercih edilir).
5. **Temizlik.** Bileşen kalkınca geometri, materyal, doku ve renderer `dispose()` edilir; olay dinleyicileri sökülür. Bellek sızıntısını DevTools bellek panelinde iki kez aç-kapa ile dene.
6. **Ölçü.** Masaüstünde 60 fps, orta seviye telefonda 30 fps altına düşmez; düşüyorsa `threejs-performance` skill'i.

## İnceleme

Değişiklikten sonra `impeccable:impeccable` → `animate` ve `audit` ile değerlendir. Kanıt olarak:
- Hareketin başı, ortası ve sonundan birer ekran görüntüsü
- Hareket azaltma açıkken davranış
- Gerekirse performans izi (Chrome DevTools MCP; `docs/workflow/mcp-catalog.md`)
