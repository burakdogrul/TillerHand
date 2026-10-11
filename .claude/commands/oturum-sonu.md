---
description: Oturumu kapatır - ILERLEME, CHANGELOG ve KARARLAR'ı günceller, commit önerir.
---

Bu oturumu kapatıyoruz. Bir sonraki oturum (veya `/clear` sonrası) sıfır bağlamla başlayacak; ihtiyaç duyacağı her şey dosyalarda olmalı.

1. `git status` ve `git diff --stat` ile bu oturumdaki değişiklikleri gör.
2. `docs/ILERLEME.md`'yi güncelle (40 satırı geçmesin):
   - Son güncelleme tarihi, aktif faz, aktif görev
   - Şu anki durum: ne çalışıyor, ne yarım
   - Son oturumda yapılanlar (eskileri sil, sadece bu oturum)
   - Sıradaki adım: tek, net, hemen başlanabilir
   - Bekleyen kararlar (sorulup cevap alınamayanlar)
   - Açık sorunlar ve "AI için notlar"
   - Kalın etiketli satırların biçimini bozma (durum çubuğu ve pano okur)
3. `docs/YOL-HARITASI.md`: biten görevler işaretli mi?
4. `CHANGELOG.md` → "Yayınlanmamış" bölümüne kullanıcıya görünen değişiklikleri ekle.
5. Bu oturumdaki tüm kararlar `docs/KARARLAR.md` günlüğünde mi? Eksik olanları ekle.
6. Yapı değiştiyse (yeni tablo, servis, klasör) `docs/MIMARI.md`'yi güncelle.
7. `node .claude/hooks/durum-panosu.mjs` ile `DURUM.html`'i yenile.
8. Commit edilmemiş iş varsa commit mesajı öner. Commit'i onayımla at.
9. Faz bittiyse sırayla öner: `/kurul topla faz-sonu` (tam kurul, tahmini maliyetiyle birlikte), sonra `/retro`.
10. Limiti ve bağlamı oku. Kalan 5 saatlik payı, sıfırlanma saatini ve bağlam %50'yi geçtiyse `/clear` önerisini sıradaki adımla birlikte söyle.

Bitince durum bloğu ve tek satır: "Sonraki oturum: [sıradaki adım]".
