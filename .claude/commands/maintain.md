---
description: Düzenli bakım kontrolünü çalıştırır ve bakım kaydına ekler.
argument-hint: [weekly | monthly | quarterly]
---

Bakım türü: $ARGUMENTS (boşsa `weekly`).

Kaynak: `docs/operations/maintenance.md` ilgili bölüm + `docs/architecture/stack.md` → "Bakım". `monthly` haftalık maddeleri, `quarterly` hepsini kapsar.

1. **Otomatik yapabildiklerini yap:**
   - Güncel olmayan bağımlılıkları listele (`npm outdated` / `uv tree --outdated` vb.)
   - Bağımlılık güvenlik taraması
   - Testler ve build hâlâ geçiyor mu?
   - Ölü kod, kullanılmayan ortam değişkeni, kullanılmayan bağımlılık taraması
   - `docs/workflow/progress.md` ve `docs/architecture/overview.md` kodla uyumlu mu?
   - Açık Dependabot PR'ları (`gh pr list --author app/dependabot`, gh kuruluysa): CI yeşil olanları merge için öner
   - MCP bağlıysa kendin bak: Sentry'de son dönemin yeni/artan hataları, Supabase'de güvenlik ve performans uyarıları (salt-okunur)
   - `monthly`: temiz kurulum testi (`/release` → "Temiz kurulum testi" maddesi); `ponytail:ponytail-debt` ile ertelenmiş kısa yollar listesi; `npx --yes jscpd@4 --silent .` ile kopya kod oranı; `docs/quality/metrics.md`'ye dönem satırı (tanımlar dosyada); `docs/product/unit-economics.md` gerçek faturalarla; süresi geçen bayraklar; işlenmemiş geri bildirimler (`/user-feedback`)
   - Her türde: `docs/operations/accounts.md`'de 30 gün içinde dolan tarihler
   - `quarterly`: `/findings-all` (veya en azından tech + security) ile tam tarama; sağlık puanlarını bir önceki çeyrekle karşılaştır
2. **Erişemediğin maddeleri** (uptime, maliyet panelleri, yedekler, sertifika/kart bitiş tarihleri) AskUserQuestion ile sor (Sorun yok / Sorun var / Bakamadım); cevaplarımı bekle.
3. Güncellemeler için öneri ver: güvenli olanlar (yama/küçük sürüm) ve riskli olanlar (majör) ayrı. Hangilerinin uygulanacağını **çoklu seçimle** sor. Onaysız güncelleme yapma.
4. Bulguları `docs/operations/maintenance.md` → "Bakım kaydı" tablosuna bugünün tarihiyle ekle.
5. Aksiyon gerektirenleri `docs/product/roadmap.md`'ye görev olarak öner.

Özet: 🔴 acil / 🟡 bu ay / 🟢 sorun yok.
