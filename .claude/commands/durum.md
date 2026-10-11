---
description: Projenin ayrıntılı durum raporunu verir ve DURUM.html panosunu yeniler.
---

1. `node .claude/hooks/durum-panosu.mjs` çalıştır. Bu komut `DURUM.html`'i üretir.
2. `docs/ILERLEME.md`, `docs/YOL-HARITASI.md` ve `docs/KARARLAR.md`'yi oku ve şu raporu ver:

```
## Durum: [proje] · [tarih]
**Aşama:** [aktif faz] · **Görev:** [aktif görev] · **İlerleme:** [biten/toplam görev]
**Soru modu:** [...]

**Bu aşamada biten:** [...]
**Kalan görevler (bu faz):** [...]
**Bekleyen kararlar:** [...]  ← varsa ilk sıraya koy
**Açık sorunlar / riskler:** [...]
**Son kararlar:** [son 5: soru → seçilen (kullanıcı/otomatik)]
**Kontrol listeleri:** Güvenlik x/y · Canlıya alma x/y · KVKK x/y
**Önerilen sıradaki adım:** [tek, somut komut]
```

3. Tarayıcı aracın varsa `DURUM.html`'i aç. Yoksa dosya yolunu ver.
4. Bekleyen bir karar varsa raporun sonunda onu hemen sor.
