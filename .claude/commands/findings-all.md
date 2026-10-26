---
description: Tüm bulgu türlerini (teknik, iş, güvenlik, UX, performans, hukuk) tek seferde çalıştırır ve birleşik bir özet çıkarır.
argument-hint: [boş = hepsi | tür listesi, örn. tech,security]
---

Türler: $ARGUMENTS (boşsa: tech, business, security, ux, perf, legal)

1. **Limit:** Tam set çok pahalıdır (Pro planda 5 saatlik limitin büyük kısmı). Limiti oku. Her tür için tahmini maliyeti göster ve AskUserQuestion ile **çoklu seçimle** sor: hangi türler çalışsın? Seviye sarı veya kırmızıysa en kritik 2 türü (tech + security) öner.
1b. **Paket:** `security` seçildiyse `node .claude/hooks/tools.mjs --required guvenlik`. Kapalıysa alt ajanları başlatmadan önce bir kez sor (alt ajanlar oturumun eklentilerini kullanır).
2. **Ön bilgiler:** Business ve legal için `docs/findings/config.md` boşsa sektör ve uzman rolünü şimdi bir kez sor; alt ajanlar tekrar sormasın.
3. **Paralel çalıştır:** Seçilen her tür için ayrı bir alt ajan başlat (Agent aracı, tek mesajda, arka planda; inceleme rolünün `model` ve `effort`'u, `docs/workflow/models.md`). Her ajana şu talimatı ver: "`.claude/findings/protocol.md` adımlarını `.claude/findings/lenses/<tür>.md` ile uygula; raporu yaz; yol haritası sorusunu SORMA, önerdiğin görevleri raporun düzeltme planında bırak."
4. **Birleşik özet:** Tüm raporlar bitince `docs/findings/summary-YYYY-AA-GG.md` yaz:
   - Tür başına sağlık puanı ve önceki ile farkı
   - Tüm türlerden en yüksek puanlı 10 bulgu (tek liste, puana göre)
   - Türler arası kesişen konular (örn. aynı sorun hem güvenlik hem legal bulgusu)
   - Birleşik düzeltme planı: hızlı kazanımlar ve büyük işler
5. **Aktarma:** Yol haritasına hangi bulguların gireceğini **tek bir çoklu seçimle** sor (protocol §8).
6. `node .claude/hooks/dashboard.mjs` çalıştır. Özet ve durum bloğu.
