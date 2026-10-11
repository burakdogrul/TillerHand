# Karar Protokolü

> Bu proje **soru odaklı** yürür. Kararları kullanıcı verir, AI seçenekleri hazırlar, önerir, uygular ve raporlar.
> Kullanıcı bir konuda "sorma" diyene kadar o konuda tek bir karar bile kendiliğinden verilmez.

## 1. Karar noktası nedir?

Aşağıdakilerden birini etkileyen her seçim bir **karar noktasıdır** ve sorulur:

| Konu (kod) | Örnekler |
|---|---|
| `urun` | Özellik kapsamı, öncelik, MVP sınırı, kullanıcı akışı, fiyat, hedef kitle |
| `teknik` | Dil, framework, veritabanı, auth yöntemi, hosting, kütüphane ekleme, API stili, mimari yapı, klasör yapısı |
| `tasarim` | Stil yönü, renk, yazı tipi, sayfa/ekran düzeni, bileşen stili, animasyon miktarı, ikon seti, koyu tema |
| `icerik` | Arayüz metinleri, ses tonu, hitap, açılış sayfası metni, e-posta metinleri |
| `veri` | Veri modeli, alanlar, ilişkiler, saklama süresi, silme davranışı, migration |
| `guvenlik` | Yetki modeli, roller, oturum süresi, hız sınırları, kişisel veri işleme |
| `maliyet` | Ücretli servis seçimi, plan seviyesi, AI model seçimi, harcama limitleri |

**Karar noktası değildir** (sorulmaz, uygulanır ve durum bloğunda kısaca raporlanır): dosya/değişken/fonksiyon adı (`docs/SOZLUK.md`'ye uygun), kodun iç düzeni, biçimlendirme, projede zaten kararı verilmiş bir kalıbın tekrar uygulanması.

Emin değilsen karar noktasıdır, sor.

## 2. Nasıl sorulur?

1. **AskUserQuestion aracını kullan.** Araç yoksa aynı yapıyı numaralı liste olarak yaz ve cevap bekle.
2. **Önce bağlam (1-3 cümle, soru metninin içinde veya hemen öncesinde):** Hangi aşamadayız, bu karar neyi etkiler, geri dönmesi kolay mı zor mu?
3. **2-4 seçenek.** En uygun gördüğün **ilk sırada** ve etiketinin sonunda **"(Önerilen)"**.
4. **Her seçeneğin açıklamasında:** Ne olduğu, hangi durumda daha iyi olduğu ve bedeli. Örnek: "Next.js — SEO ve sunucu tarafı gereken ürünlerde en iyisi, AI bu ekosistemi en iyi bilir; öğrenme eğrisi ve barındırma maliyeti Vite SPA'dan yüksek."
5. **Önerinin gerekçesi bu projeye özel olsun:** PRD'deki kullanıcıya, bütçeye, ölçeğe ve kullanıcının daha önceki kararlarına dayan. Genel geçer "en popüler" gerekçe yetmez.
6. **Tur başına en fazla 4 soru.** Birbirine bağlı kararları sırayla sor (önce framework, sonra ona bağlı kütüphane).
7. Kullanıcı "Other" ile serbest cevap verirse onu da değerlendir. Riskli bulursan bir kez nedenini söyle, ısrar ederse uygula ve kayda geç.
8. **Güncellik:** Sürüm, fiyat, kullanımdan kaldırma gibi değişebilen bilgiye dayanan seçeneklerde hafızana güvenme. Gerekirse önce araştır (`docs/SKILLER.md` → araştırma).
9. **Tasarım kararlarında görsel önizleme zorunlu.** Bkz. bölüm 5.

## 3. Cevap gelince

1. Kararı `docs/KARARLAR.md` → **Karar günlüğü** tablosuna ekle (tarih, aşama, konu, soru, seçilen, karar veren: `kullanıcı`).
2. Mimariyi veya uzun vadeyi etkileyen kararlarda aynı dosyaya ayrıntılı kayıt da (K-NNN) yaz.
3. Kararın etkilediği dokümanı güncelle (STACK, MIMARI, TASARIM, PRD, SOZLUK…).
4. Sonra uygula.

## 4. Soru modu

Durum `docs/ILERLEME.md` → `**Soru modu:**` satırında tutulur. Varsayılan: `açık · kapalı konular: yok`.

| Kullanıcı ne der | Ne yaparsın |
|---|---|
| "sorma", "hiç sorma", `/soru kapat hepsi` | Tüm konular kapalı |
| "tasarımda sorma", "renkleri sen seç", `/soru kapat tasarim` | Sadece o konu kapalı (konu kodlarıyla eşleştir; emin değilsen hangi konuyu kastettiğini sor) |
| "tekrar sor", "sormaya devam et", `/soru ac [konu\|hepsi]` | Konu(lar) tekrar açık |

**Kapalı konuda:** "(Önerilen)" seçeneği seç, uygula. Günlüğe `karar veren: otomatik` yaz. Durum bloğunda "Otomatik kararlar" satırında listele. Tasarım konusu kapalı olsa bile önizlemeleri `.onizleme/` altına üret ki kullanıcı sonradan bakabilsin.

**Soru modundan bağımsız, her zaman onay iste:** veri silme, prod'a deploy, ödeme veya para harcatan işlem, geri dönülemez her komut, `CLAUDE.md` → "Asla" listesi.

## 5. Tasarım kararlarında görsel önizleme

Her `tasarim` kararı görselle sorulur. Kullanıcı yazıyı değil, görüntüyü seçer.

1. Seçenek başına bir örnek üret: `.onizleme/NN-konu/a.html`, `b.html`, `c.html` (NN sıra no). Ayrıca hepsini yan yana veya alt alta gösteren `index.html`.
2. Örnekler **gerçek içerikle** yapılır (PRD'deki ürün adı, gerçek başlık ve metinler); lorem ipsum yok.
3. Her örnek, `docs/SKILLER.md`'de o seçeneğe eşlenen skill ile üretilir. Örneğin "Premium" seçeneği premium tasarım skill'iyle, "Minimal" seçeneği minimal skill'le. Böylece seçenekler arasındaki fark gerçek olur.
4. Büyük kararlarda (stil yönü, sayfa düzeni, ana ekran) her seçenek ayrı tam bölümdür. Küçük kararlarda (renk paleti, yazı tipi çifti, köşe/gölge, buton stili) tek bir karşılaştırma sayfasında yan yana örnekler yeterlidir.
5. Önizlemeyi aç: Tarayıcı aracı varsa `index.html`'i aç, masaüstü ve mobil genişlikte ekran görüntüsü al ve göster. Yoksa dosya yolunu ver.
6. Sonra AskUserQuestion ile sor: seçenekler A/B/C, açıklamalarında her birinin farkı ve hangi durumda daha iyi olduğu. Kullanıcı karma isteyebilir ("A'nın düzeni, B'nin renkleri"); bunu yeni bir önizlemeyle doğrula.
7. Seçim `docs/TASARIM.md` → karar günlüğüne ve `docs/KARARLAR.md`'ye yazılır. `.onizleme/` git'e girmez.

## 6. Durum bloğu (her cevabın sonunda)

Kısa ve sıkıştırılmış dille (caveman), en fazla 4 satır:

```
── Durum ─────────────────────────────
Aşama: Faz 1 · Görev: G-012 (7/23) · Soru modu: açık · Limit: 5s %34 hf %5
Yapıldı: kayıt formu + doğrulama, test yeşil · Kurul: ONAY (ux, qa)
Otomatik kararlar: yok
Sıradaki: G-013 şifre sıfırlama · bekleyen karar: e-posta servisi
```

- Aşama ve görev `docs/ILERLEME.md`'den; görev sayısı `docs/YOL-HARITASI.md`'deki işaretli/toplam.
- Limit: masaüstünde `get_usage`, terminalde `node .claude/hooks/limit.mjs` (okunamıyorsa "bilinmiyor").
- Kurul: bu turda toplantı yapıldıysa sonucu ve katılanlar.
- "Sıradaki" her zaman somut olsun; bir karar bekleniyorsa onu söyle.
- Sadece soru sorduğun turda (cevap beklerken) durum bloğunu soru öncesine tek satır olarak koy.

## 7. Dil

- **Sorular, seçenek açıklamaları, dokümanlar ve kullanıcıya görünen metinler:** Tam cümlelerle, düzgün Türkçe.
- **Durum bloğu, ilerleme notları, kod açıklamaları:** Kısa ve sıkıştırılmış (caveman).
