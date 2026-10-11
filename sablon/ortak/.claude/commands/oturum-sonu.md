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
   - Açık sorunlar ve "AI için notlar"
3. `docs/YOL-HARITASI.md`: biten görevler işaretli mi?
4. `CHANGELOG.md` → "Yayınlanmamış" bölümüne kullanıcıya görünen değişiklikleri ekle.
5. Bu oturumda mimari bir karar alındıysa `docs/KARARLAR.md`'ye ekle.
6. Yapı değiştiyse (yeni tablo, servis, klasör) `docs/MIMARI.md`'yi güncelle.
7. Commit edilmemiş iş varsa commit mesajı öner. Commit'i onayımla at.

Bitince tek satır: "Sonraki oturum: [sıradaki adım]".
