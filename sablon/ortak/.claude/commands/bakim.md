---
description: Düzenli bakım kontrolünü çalıştırır ve bakım kaydına ekler.
argument-hint: [haftalik | aylik | ceyreklik]
---

Bakım türü: $ARGUMENTS (boşsa `haftalik`).

Kaynak: `docs/BAKIM.md` ilgili bölüm + `docs/STACK.md` → "Bakım". `aylik` haftalık maddeleri, `ceyreklik` hepsini kapsar.

1. **Otomatik yapabildiklerini yap:**
   - Güncel olmayan bağımlılıkları listele (`npm outdated` / `uv tree --outdated` vb.)
   - Bağımlılık güvenlik taraması
   - Testler ve build hâlâ geçiyor mu?
   - Ölü kod, kullanılmayan ortam değişkeni, kullanılmayan bağımlılık taraması
   - `docs/ILERLEME.md` ve `docs/MIMARI.md` kodla uyumlu mu?
   - Açık Dependabot PR'ları (`gh pr list --author app/dependabot`, gh kuruluysa): CI yeşil olanları merge için öner
   - MCP bağlıysa kendin bak: Sentry'de son dönemin yeni/artan hataları, Supabase'de güvenlik ve performans uyarıları (salt-okunur)
2. **Erişemediğin maddeleri** (uptime, maliyet panelleri, yedekler, sertifika/kart bitiş tarihleri) bana soru listesi olarak ver; cevaplarımı bekle.
3. Güncellemeler için öneri ver: güvenli olanlar (yama/küçük sürüm) ve riskli olanlar (majör) ayrı. Onaysız güncelleme yapma.
4. Bulguları `docs/BAKIM.md` → "Bakım kaydı" tablosuna bugünün tarihiyle ekle.
5. Aksiyon gerektirenleri `docs/YOL-HARITASI.md`'ye görev olarak öner.

Özet: 🔴 acil / 🟡 bu ay / 🟢 sorun yok.
