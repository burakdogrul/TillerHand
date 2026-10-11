# Promptlar

Her prompt ayrı dosya. Dosyanın başına şu bloğu koy:

```
<!--
amaç: [bu prompt ne yapar]
girdi: [değişkenler: {{musteri_adi}}, {{fatura_metni}}]
çıktı: [biçim / şema adı]
model: [AI_MODEL_* değişkeni]
son değişiklik: YYYY-AA-GG — [ne değişti, eval sonucu]
-->
```

Prompt değişikliği = kod değişikliği: eval'den geçer, commit'lenir, CHANGELOG'a yazılır.
