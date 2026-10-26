---
description: Uzman kurulunu kurar, değiştirir, toplar veya durumunu gösterir.
argument-hint: [boş | setup | convene <plan|task|phase-end|release|konu> | council <soru>]
---

İstek: $ARGUMENTS

Önce `.claude/board/rules.md` ve `docs/workflow/board.md`'yi oku.

- **Boş:** Kurulun durumunu göster: üyeler, inceleme rolünün modeli (`node .claude/hooks/models.mjs --show`), son 5 toplantı ve sonuçları, açık kritik bulgular, commit denetimi açık/kapalı. Kurul kurulmamışsa `/board setup` öner.
- **`setup`:** rules.md §5'i uygula. Kurul zaten varsa, ne yapılacağını sor: üye ekle / üye çıkar / "Bu proje" bölümlerini güncel stack'e göre yenile. Model buradan değişmez: üyeler inceleme rolüyle çalışır (`docs/workflow/models.md`).
- **`convene <tür>`:** rules.md §4'ü uygula.
  - `plan`: son onaylanmamış plan
  - `task`: aktif görevin değişiklikleri (`git diff`)
  - `phase-end`: aktif fazın tüm değişiklikleri (faz başlangıcından bu yana `git log` ve diff özeti)
  - `release`: tüm kod tabanı
  - Diğer metinler: kullanıcının verdiği konu (örn. "ödeme akışı")

- **`council <soru>`:** Karar konseyi (`.claude/board/council.md`). Soruyu ve seçenekleri netleştir, eksikse önce kullanıcıya seçenekleri onaylat. Bitince başkanın önerisiyle kararı AskUserQuestion ile sor.

Toplantıdan önce limiti kontrol et (`node .claude/hooks/usage.mjs`). Tam kurul toplantısı pahalıdır. Seviye sarı veya kırmızıysa tahmini maliyeti tek satırla söyle (`docs/workflow/usage-limits.md` §3). Tam kurul isteğe bağlı bir toplantıysa üye sayısını azaltmayı öner; limit yüzünden toplantıyı durdurma.

Bitince: kurul sentezi, kullanıcıya sorulan kararlar, günlüğe eklenen satır, durum bloğu.
