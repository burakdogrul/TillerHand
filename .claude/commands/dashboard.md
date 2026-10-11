---
description: Projenin ayrıntılı durum raporunu verir ve dashboard.html panosunu yeniler.
---

1. `node .claude/hooks/dashboard.mjs` çalıştır. Bu komut `dashboard.html` kontrol panelini üretir (her Claude cevabından sonra Stop hook'u da otomatik üretir; sayfa açıkken 30 sn'de bir yenilenir). Sekmeler: Genel, Yol haritası, Kararlar, Kurul, Kalite, Aktivite, Ürün ve teknik, Limit ve maliyet.
2. Limiti oku (`docs/workflow/usage-limits.md` §1). `docs/workflow/progress.md`, `docs/product/roadmap.md`, `docs/decisions/log.md` ve `docs/workflow/board.md`'yi oku ve şu raporu ver:

```
## Durum: [proje] · [tarih]
**Aşama:** [aktif faz] · **Görev:** [aktif görev] · **İlerleme:** [biten/toplam görev]
**Soru modu:** [...] · **Limit:** [5s % (sıfırlanma) · hf %] · **Kurul:** [durum, üye sayısı]

**Bu aşamada biten:** [...]
**Kalan görevler (bu faz):** [...]
**Bekleyen kararlar:** [...]  ← varsa ilk sıraya koy
**Açık sorunlar / riskler:** [...]
**Son kararlar:** [son 5: soru → seçilen (kullanıcı/otomatik)]
**Son kurul toplantıları:** [son 3: tür → sonuç, açık kritik]
**Kaldığı yer:** [varsa]
**Kontrol listeleri:** Güvenlik x/y · Canlıya alma x/y · KVKK x/y
**Önerilen sıradaki adım:** [tek, somut komut]
```

3. Tarayıcı aracın varsa `dashboard.html`'i aç. Yoksa dosya yolunu ver.
4. Bekleyen bir karar varsa raporun sonunda onu hemen sor.
