---
description: Gives the project's detailed status report and refreshes the dashboard.html dashboard.
---

1. Run `node .claude/hooks/cost.mjs` (tokens and cost of the last 30 days, ccusage) and `node .claude/hooks/dashboard.mjs`. This command produces the `dashboard.html` control panel (the Stop hook also produces it automatically after every Claude answer; while the page is open it refreshes every 30 s). Tabs (Turkish labels): Genel, Yol haritası, Kararlar, Kurul, Bulgular, Kalite, Aktivite, Ürün ve teknik, Operasyon, Limit ve maliyet. For token details (most expensive requests, cache) use `/session-report`.
2. Read the limit (`docs/workflow/usage-limits.md` §1). Read `docs/workflow/progress.md`, `docs/product/roadmap.md`, `docs/decisions/log.md` and `docs/workflow/board.md`, and give this report:

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

3. If you have a browser tool, open `dashboard.html`. Otherwise give the file path.
4. If a decision is pending, ask it right away at the end of the report.
