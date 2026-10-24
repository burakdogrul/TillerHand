---
description: Oturumu kapatır: ilerleme, CHANGELOG ve karar günlüğünü günceller, commit önerir.
---

Bu oturumu kapatıyoruz. Bir sonraki oturum (veya `/clear` sonrası) sıfır bağlamla başlayacak; ihtiyaç duyacağı her şey dosyalarda olmalı.

1. `git status` ve `git diff --stat` ile bu oturumdaki değişiklikleri gör.
2. `docs/workflow/progress.md`'yi güncelle (40 satırı geçmesin):
   - Son güncelleme tarihi, aktif faz, aktif görev
   - Şu anki durum: ne çalışıyor, ne yarım
   - Son oturumda yapılanlar (eskileri sil, sadece bu oturum)
   - Sıradaki adım: tek, net, hemen başlanabilir
   - Bekleyen kararlar (sorulup cevap alınamayanlar)
   - Açık sorunlar ve "AI için notlar"
   - Kalın etiketli satırların biçimini bozma (durum çubuğu ve pano okur)
3. `docs/product/roadmap.md`: biten görevler işaretli mi? Görev bittiyse ve kapsam kalkanı açık kaldıysa (`node .claude/hooks/freeze-guard.mjs --status`) kapat: `--plan-bitir`. Görev sürüyorsa açık kalsın.
4. `CHANGELOG.md` → "Yayınlanmamış" bölümüne kullanıcıya görünen değişiklikleri ekle.
5. Bu oturumdaki tüm kararlar `docs/decisions/log.md` günlüğünde mi? Eksik olanları ekle.
6. Yapı değiştiyse (yeni tablo, servis, klasör) `docs/architecture/overview.md`'yi güncelle.
7. `node .claude/hooks/cost.mjs` ve `node .claude/hooks/dashboard.mjs` ile `dashboard.html`'i yenile.
7b. Bu oturumda AI'nın bilmediği için hata yaptığı proje bilgisi çıktıysa `AGENTS.md`'ye eklemeyi öner (onayla; sadece Claude Code'a özelse `/revise-claude-md` ile `CLAUDE.md`'ye). Aynı düzeltmeyi kullanıcı iki kez yaptıysa `/hookify <kural>` ile kalıcı kural öner.
8. Commit edilmemiş iş varsa commit mesajı öner. Commit'i onayımla at. Testler yeşilse çalışan nokta kaydet: `node .claude/hooks/checkpoint.mjs --save "oturum sonu: <kısa özet>"`.
9. Faz bittiyse sırayla öner: `/findings-tech` (teknik borç taraması), `/board convene phase-end` (tam kurul, tahmini maliyetiyle birlikte), sonra `/retro`.
10. Limiti ve bağlamı oku. Kalan 5 saatlik payı, sıfırlanma saatini ve bağlam %50'yi geçtiyse `/clear` önerisini sıradaki adımla birlikte söyle.

Bitince durum bloğu ve tek satır, tam komutla: "Sonraki oturum: `/clear`, sonra `/build G-NNN` ([görev adı])". `/clear` sonrası da bu satır ekranda görünür (oturum başı hook'u); `/build` boş yazılırsa sıradaki görevi kendisi alır.
