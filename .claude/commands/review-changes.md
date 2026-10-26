---
description: Değişiklikleri bağımsız inceleme ajanlarıyla inceler (gerekirse güvenlik denetimi dahil).
argument-hint: [boş = commit edilmemiş değişiklikler | main..HEAD | commit hash]
---

İncelenecek aralık: $ARGUMENTS (boşsa `git diff HEAD` ve takip edilmeyen yeni dosyalar).

Kendi yazdığın kodu kendin inceleme; bağımsız ajanlara ver.

1. `git diff --stat` ile değişen dosyaları gör.
2. **`code-reviewer`** alt ajanını inceleme rolünün `model` ve `effort`'uyla çalıştır (`docs/workflow/models.md`; adım 3 de öyle). Ona aralığı ve (biliniyorsa) görev kodunu ver. Görevin `docs/product/specs/` altında spec'i varsa onu da ver: beklenen davranış karşılandı mı, değişmemesi gereken davranış bozuldu mu?
3. Değişiklik şunlardan birine dokunuyorsa **`security-auditor`** alt ajanını da paralel çalıştır: auth, yetki, ödeme, webhook, dosya yükleme, kişisel veri, DB erişim kuralları, ortam değişkenleri, AI/LLM çağrıları.
   Kurul kurulduysa değişikliğe ilgili kurul üyelerini de ekle (`.claude/board/rules.md` §3, en fazla 3; limit sarıysa 1).
   Aynı anda `ponytail:ponytail-review` ile gereksiz kod, aşırı mühendislik ve yük altında kırılacak yerlere bak. Arayüz değiştiyse `impeccable:impeccable` → `audit` da çalışsın.
4. Ajanların bulgularını birleştir, tekrarları çıkar, önem sırasına koy:

```
[KRİTİK|ÖNEMLİ|KÜÇÜK] dosya:satır — sorun. Öneri.
```

5. Bulgulara katılmıyorsan nedenini tek satırla yaz; sessizce eleme.
6. Son satır: **Commit'e hazır** / **Önce düzelt: [maddeler]**.

Bulguları düzeltme. Hangilerinin düzeltileceğini **çoklu seçimle** sor (KRİTİK olanlar önerilen olarak işaretli). Sonra durum bloğunu yaz.
