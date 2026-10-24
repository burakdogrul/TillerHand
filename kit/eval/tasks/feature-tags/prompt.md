Özellik: notlara etiket.

- `POST /notes` ve `PATCH /notes/:id` isteğe bağlı `tags` alanını kabul eder: metin dizisi, en fazla 5 etiket, her biri boşlukları kırpıldıktan sonra 1-20 karakter. Etiketler Türkçe kurallarıyla küçük harfe çevrilir (`İŞ` → `iş`), tekrarlar atılır, ilk görülme sırası korunur. Kurala uymayan istek 400 döner.
- Etiketsiz not `tags: []` ile döner. `PATCH` ile gelen `tags` eskisinin yerine geçer.
- `GET /notes?tag=<etiket>` sadece o etiketi taşıyan notları döndürür (büyük/küçük harf duyarsız).
- `GET /tags`, `x-user` başlığındaki kullanıcının notlarındaki etiketleri kullanım sayısıyla döndürür: `[{ "tag": "iş", "count": 2 }]`, sayıya göre azalan, eşitlikte alfabetik.
