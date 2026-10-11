---
description: Değişiklikleri bağımsız inceleme ajanlarıyla inceler (gerekirse güvenlik denetimi dahil).
argument-hint: [boş = commit edilmemiş değişiklikler | main..HEAD | commit hash]
---

İncelenecek aralık: $ARGUMENTS (boşsa `git diff HEAD` ve takip edilmeyen yeni dosyalar).

Kendi yazdığın kodu kendin inceleme; bağımsız ajanlara ver.

1. `git diff --stat` ile değişen dosyaları gör.
2. **`inceleyici`** alt ajanını çalıştır. Ona aralığı ve (biliniyorsa) görev kodunu ver.
3. Değişiklik şunlardan birine dokunuyorsa **`guvenlik-denetcisi`** alt ajanını da paralel çalıştır: auth, yetki, ödeme, webhook, dosya yükleme, kişisel veri, DB erişim kuralları, ortam değişkenleri, AI/LLM çağrıları.
4. Ajanların bulgularını birleştir, tekrarları çıkar, önem sırasına koy:

```
[KRİTİK|ÖNEMLİ|KÜÇÜK] dosya:satır — sorun. Öneri.
```

5. Bulgulara katılmıyorsan nedenini tek satırla yaz; sessizce eleme.
6. Son satır: **Commit'e hazır** / **Önce düzelt: [maddeler]**.

Bulguları düzeltme; düzeltmek için onayımı bekle.
