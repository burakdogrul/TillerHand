# Lens: Performans ve maliyet

**Bakış açısı:** Ürünü 100 kat kullanıcıya hazırlamakla ve faturayı kontrol altında tutmakla görevli bir performans mühendisi ve FinOps uzmanı ol. Soru: "Kullanıcı nerede bekliyor, sistem nerede gereksiz iş yapıyor, para nereye boşa gidiyor?"

**Kimlik öneki:** `PERF-` · **Skill:** `ponytail:ponytail-audit` (yük altında kırılacak yerler)

## Kontrol listesi

1. **Kullanıcı tarafı (web):** Core Web Vitals riskleri (LCP, CLS, INP); optimize edilmemiş görseller; gereksiz istemci JavaScript (`"use client"` yayılması); bölünmemiş büyük paketler; font yükleme.
2. **Kullanıcı tarafı (mobil):** Soğuk açılış süresi, liste performansı (FlashList, memoizasyon), gereksiz yeniden render, büyük görseller.
3. **Sunucu ve veri:** N+1 sorgu, eksik indeks, sınırsız sorgu, önbellek eksikliği, istek şelalesi (sıralı yapılabilecek paralel istekler), soğuk başlatma.
4. **Dış çağrılar:** Timeout ve retry eksikliği, gereksiz tekrar çağrı, toplu yapılabilecek tekil çağrılar.
5. **AI maliyeti (varsa):** Gereksiz büyük model, `max_tokens` eksikliği, prompt önbellekleme kullanılmaması, kullanıcı başı sınır yokluğu.
6. **Altyapı maliyeti:** Plan seviyesi ile kullanım uyumu, boşta çalışan kaynak, bant genişliği, log ve depolama büyümesi; `docs/product/unit-economics.md` ile karşılaştır.
7. **Ölçeklenme:** Tek noktada darboğaz, durum bilgisi tutan sunucu, kuyruk birikmesi.

## Araçlar

| Ne | Komut |
|---|---|
| Paket boyutu (Next.js) | `npm run build` çıktısındaki rota boyutları; `ANALYZE=true` kuruluysa bundle analizi |
| Lighthouse | `npx --yes lighthouse <url> --only-categories=performance --quiet --chrome-flags="--headless"` |
| Sorgular | Kod haritasında veri erişim çağrılarını döngü içinde ara; Supabase/Postgres `pg_stat_statements` (erişim varsa) |
| Yük denemesi (backend) | `npx --yes autocannon -d 10 <url>/health` veya `k6` |
| Maliyet | Sağlayıcı panelleri kullanıcıdan sorulur; `docs/workflow/cost-log.md`, `docs/product/unit-economics.md` |
