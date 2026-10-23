---
description: Projeyi son çalışan haline (veya seçilen bir noktaya) güvenle döndürür. Geçmiş silinmez, yarım iş saklanır, geri dönüş de geri alınabilir.
argument-hint: [boş = seçenekleri göster | etiket veya commit]
---

Hedef: $ARGUMENTS

Kullanıcı git bilmiyor olabilir. Her şeyi sade Türkçe anlat; git terimini kullanırsan tek cümleyle ne demek olduğunu söyle.

1. `node .claude/hooks/checkpoint.mjs --list` çalıştır.
2. **Hedef verilmediyse sor** (AskUserQuestion), en fazla 4 seçenek:
   - En yeni **çalışan nokta** (Önerilen). Etiketi `calisan/...` olanlar, testler yeşilken `/build` ve `/wrap-up` tarafından kaydedilir. Açıklamada notunu ve tarihini yaz.
   - Bir önceki çalışan nokta.
   - Son 1-2 commit; her birinin ne değiştirdiğini commit mesajından tek cümleyle anlat.

   Çalışan nokta yoksa son commit'leri göster ve bunu söyle.
3. **Ne olacağını önceden söyle:**
   - Seçilen noktadan sonra yapılan değişiklikler dosyalardan kalkar, ama geçmişte durur.
   - Kaydedilmemiş iş varsa önce saklanır (`git stash`); sonra geri getirilebilir.
   - `.env` gibi git'e girmeyen dosyalara dokunulmaz.
   - Bu geri dönüş de `/rollback` ile geri alınabilir.
4. Kullanıcı açıkça onaylarsa `node .claude/hooks/checkpoint.mjs --restore <hedef> --evet` çalıştır.
5. Projenin test komutunu çalıştır (`AGENTS.md` → Komutlar). Sonucu göster: Çalışan hale gerçekten dönüldü mü?
6. `docs/workflow/progress.md` → "Son oturumda yapılanlar" ve "Dikkat" bölümlerine geri dönüşü yaz: hangi noktaya dönüldü, neden, saklanan iş.
7. Bitince kısa rapor ver:
   - hangi hale dönüldü,
   - testlerin sonucu,
   - saklanan iş varsa nasıl geri getirileceği (`git stash pop`),
   - bunu geri almak için ne yapılacağı.

Asla: `git reset --hard`, `git push --force`, stash'i silmek (`git stash drop/clear`). Uzak depoya (push) geri dönüşü göndermek ayrı bir onay ister.
