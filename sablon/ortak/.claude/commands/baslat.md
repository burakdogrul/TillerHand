---
description: Aşama 0 - Fikirden PRD, mimari ve yol haritası çıkarır. Kod yazmaz.
argument-hint: [proje fikri, 1-3 cümle]
---

Yeni bir projeye başlıyoruz. Fikir: $ARGUMENTS

Bu oturumda **kod yazma**. Amacın şu dokümanları benimle birlikte doldurmak:
`docs/PRD.md`, `docs/MIMARI.md`, `docs/SOZLUK.md`, `docs/YOL-HARITASI.md`, `docs/KARARLAR.md`.
Ayrıca `docs/STACK.md`'yi oku; önerilen teknolojiler oradan gelir.

Adımlar:

1. **Sorgula.** PRD'nin boş bölümlerini dolduracak soruları sor. Tek seferde en fazla 5 soru sor, her biri için önerdiğin cevabı da yaz. Cevaplarımla bir sonraki tura geç. Şunlar netleşmeden ilerleme:
   - Problem ve hedef kullanıcı
   - Ölçülebilir başarı kriterleri
   - MVP özellikleri ve her birinin kabul kriterleri
   - Kapsam dışı listesi (en az 3 madde)
   - Kişisel veri, ödeme, AI API kullanımı var mı?
   - Bütçe ve süre
2. **Zayıf noktaları göster.** MVP çok büyükse küçültmeyi öner. Belirsiz kabul kriterlerini işaretle. Fikirdeki riskleri açıkça söyle.
3. **PRD.md'yi yaz.** Bana göster, onay al.
4. **MIMARI.md'yi yaz.** STACK.md'deki varsayılanlardan sapıyorsan nedenini söyle. Veri modelini ve dış servisleri (aylık maliyet tahminiyle) tablola. Onay al.
5. **KARARLAR.md'ye** teknoloji seçimini K-001 olarak ekle.
6. **SOZLUK.md'yi başlat.** PRD'deki ana kavramlar için arayüz adı, koddaki adı ve durum geçişleri.
7. **AI kullanımı varsa** ve `docs/AI.md` yoksa: Kit klasöründe (`.kit.json` → `kaynak`) `.\kit.ps1 guncelle -Proje "[bu proje]" -Ekler ai` çalıştırmamı öner. Sonra AI.md'deki model envanterini doldur.
8. **YOL-HARITASI.md'yi yaz.** Her görev tek oturumluk, kabul kriterli olsun. Faz 0'daki kurulum görevlerini (CI, merhaba dünya canlıda, SOZLUK/TASARIM) silme.
9. `CLAUDE.md`'nin başlığını, tek cümlelik açıklamasını ve komutlar bölümünü güncelle.
10. Kişisel araç / iç proje ise `docs/LANSMAN.md`'yi silmeyi öner.
11. `docs/ILERLEME.md`'yi güncelle: aktif faz Faz 0, sıradaki adım G-001.

Bitince: Doldurulan dosyaları, açık kalan soruları ve ilk görevi 5 satırla özetle.
