---
description: Uzman kurulunu kurar, değiştirir, toplar veya durumunu gösterir.
argument-hint: [boş | kur | topla <plan|gorev|faz-sonu|canliya-alma|konu>]
---

İstek: $ARGUMENTS

Önce `.claude/kurul/KURALLAR.md` ve `docs/KURUL.md`'yi oku.

- **Boş:** Kurulun durumunu göster: üyeler, modelleri, son 5 toplantı ve sonuçları, açık kritik bulgular, commit denetimi açık/kapalı. Kurul kurulmamışsa `/kurul kur` öner.
- **`kur`:** KURALLAR.md §5'i uygula. Kurul zaten varsa, ne yapılacağını sor: üye ekle / üye çıkar / model değiştir / "Bu proje" bölümlerini güncel stack'e göre yenile.
- **`topla <tür>`:** KURALLAR.md §4'ü uygula.
  - `plan`: son onaylanmamış plan
  - `gorev`: aktif görevin değişiklikleri (`git diff`)
  - `faz-sonu`: aktif fazın tüm değişiklikleri (faz başlangıcından bu yana `git log` ve diff özeti)
  - `canliya-alma`: tüm kod tabanı
  - Diğer metinler: kullanıcının verdiği konu (örn. "ödeme akışı")

Toplantıdan önce limiti kontrol et (`node .claude/hooks/limit.mjs`). Tam kurul toplantısı pahalıdır. Seviye sarı veya kırmızıysa tahmini maliyeti söyle ve `docs/LIMIT-PLANI.md` §3'teki seçenekleri sor.

Bitince: kurul sentezi, kullanıcıya sorulan kararlar, günlüğe eklenen satır, durum bloğu.
