---
description: Soru modunu gösterir veya değiştirir (hangi konularda karar sorulacak).
argument-hint: [boş | off <konu|hepsi> | on <konu|hepsi>]
---

İstek: $ARGUMENTS

Konular: `urun`, `teknik`, `tasarim`, `icerik`, `veri`, `guvenlik`, `maliyet` (`docs/workflow/decision-protocol.md` §1).

- **Boşsa:** Mevcut soru modunu, kapalı konuları ve kapalıyken verilen otomatik kararları (`docs/decisions/log.md` → karar veren `otomatik`) göster.
- **`off <konu|hepsi>`:** `docs/workflow/progress.md` → `**Soru modu:**` satırını güncelle. Örnek: `açık · kapalı konular: tasarim, icerik`. Hepsi kapalıysa: `kapalı · kapalı konular: hepsi`.
- **`on <konu|hepsi>`:** Konuyu listeden çıkar. Liste boşalırsa: `açık · kapalı konular: yok`.
- Konu adı listede yoksa en yakın konuyu öner ve sor.

Değişikliği tek satırla onayla. Ayrıca hatırlat: Veri silme, prod deploy ve para harcatan işlemler soru modundan bağımsız olarak her zaman onay ister.
