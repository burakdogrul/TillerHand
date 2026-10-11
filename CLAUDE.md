# [PROJE ADI]

> [Tek cümle: Bu proje kimin için, hangi problemi çözüyor?]

**Kurulum durumu:** Kökte `kit/` klasörü varsa ve `.kit.json` yoksa proje henüz kurulmamıştır. Kullanıcıya `/baslat [fikir]` öner; kurulum bitmeden kod yazma.

@docs/ILERLEME.md

## Temel kurallar (her zaman geçerli)

1. **Kararı kullanıcı verir.** Ürün, teknik, tasarım, içerik, veri, güvenlik ve maliyet kararlarında AskUserQuestion ile sor. 2-4 seçenek sun; önerin ilk sırada ve "(Önerilen)" etiketli olsun. Her seçenekte ne zaman daha iyi olduğunu ve bedelini yaz. Tasarım kararları görsel önizlemeyle sorulur. Soru modunda kapalı konularda önerileni seç ve "otomatik" diye kaydet. **İlk karar sorusundan önce `docs/KARAR-PROTOKOLU.md`'yi oku.** Daha önce verilmiş kararlar `docs/KARARLAR.md`'de; onları tekrar sorma. Her kararı tek yönlü / çift yönlü kapı olarak sınıfla; tek yönlülerde (veritabanı, auth, ödeme, veri modeli) önce kurul görüşü al.
2. **Doğru skill'i kullan.** Kod: `ponytail:ponytail`. Kritik akış: `mattpocock-skills:tdd`. Arayüz: seçilen stil skill'i + `impeccable:impeccable`. Metin: `humanizer:humanizer`. Rapor dili: `caveman:caveman`. Tam tablo (ilk ihtiyaçta oku): `docs/SKILLER.md`.
3. **Uzman kurulu denetler** (`docs/KURUL.md`, kurallar `.claude/kurul/KURALLAR.md`). Plan onayından önce, görev bitince, her commit'te (hafif) ve faz sonunda ilgili üyeler toplanır. Kurul danışmandır; RET (kritik bulgu) varsa iş bitmez, kullanıcıya sorulur.
4. **Limiti ve bağlamı gözet** (`docs/LIMIT-PLANI.md`). İş başlamadan limiti oku: masaüstünde `get_usage` aracı, terminalde `node .claude/hooks/limit.mjs`. Sarı/kırmızı seviyede tahmini maliyeti söyle ve seçenekleri sor. %90'da güvenli dur ve "Kaldığı yer"i yaz. Bağlam %50'yi geçince uygun noktada `/oturum-sonu` + `/clear` öner.
5. **Az token harca.** Kod haritası (codebase-memory-mcp) bağlıysa kodu keşfederken önce onu sorgula (`get_architecture`, `search_graph`, `trace_path`, `get_code_snippet`). Dosyaları toptan okuma. Dokümanları sadece gerektiğinde oku (tablo aşağıda).
6. **Önce plan, sonra kod.** 2'den fazla dosyaya dokunan iş `/planla`'dan geçer. Tek seferde tek görev. Kapsamı genişletme.
7. **Kök neden, kanıt, test.** Kabul testleri (kriter kimliği test adında, `Ö-01.1`) ve saldırgan testleri koddan önce yazılır ve önce kırmızı olur. Riskli özellik bayrak arkasında yayınlanır (`docs/BAYRAKLAR.md`). Hata düzeltirken önce yeniden üret. "Bitti" demeden çalıştığını göster. Aynı hatada 2 denemede çözemezsen dur ve yön iste.
8. **Her cevabın sonunda durum bloğu** (kısa, caveman). Biçim:

```
── Durum ──────────────────────
Aşama: … · Görev: … (x/y) · Soru modu: … · Limit: 5s %… hf %…
Yapıldı: … · Kurul: … · Otomatik kararlar: …
Sıradaki: … · bekleyen karar: …
```

## Gerektiğinde oku

| Dosya | Ne zaman |
|---|---|
| `docs/STACK.md` | Kod yazarken: komutlar, kurallar, doğrulama yöntemi |
| `docs/PRD.md` | Kapsam veya kabul kriteri belirsizse |
| `docs/MIMARI.md`, `docs/SOZLUK.md` | Yeni dosya/tablo/servis/kavram eklerken |
| `docs/YOL-HARITASI.md` | Görev seçerken ve işaretlerken |
| `docs/TASARIM.md`, `DESIGN.md`, `PRODUCT.md` | Arayüz işinde |
| `docs/TEST-PLANI.md`, `docs/GUVENLIK.md` | Kritik akış, auth, veri, ödeme koduna dokunurken |
| `docs/AI.md` (varsa) | Prompt veya model çağrısı işinde |
| `docs/HESAPLAR.md`, `docs/BIRIM-EKONOMISI.md` | Yeni dış servis, fiyat veya maliyet kararı |
| `docs/BAYRAKLAR.md` | Ödeme, AI, toplu bildirim, veri silen veya büyük arayüz değişikliği |
| `docs/GERI-BILDIRIM.md`, `docs/METRIKLER.md` | Kullanıcı geri bildirimi, retro, bakım |

## Komutlar

```bash
# /baslat seçilen stack'e göre doldurur
geliştirme:  [ ]
test:        [ ]
lint:        [ ]
tip kontrol: [ ]
build:       [ ]
```

## "Bitti" tanımı

- [ ] Kabul kriterleri karşılandı; görevde çıkan kararlar soruldu ve kaydedildi
- [ ] Lint, tip, testler temiz; kritik akışa dokunulduysa test eklendi
- [ ] Hata, boş ve yükleniyor durumları ele alındı; çalıştığına dair kanıt gösterildi
- [ ] Arayüz varsa: `DESIGN.md`'ye uygun, Impeccable critique yapıldı, metinler humanizer'dan geçti
- [ ] Görev sonu kurul toplantısında RET yok
- [ ] Kodda sır yok; yeni ortam değişkeni `.env.example`'da; `docs/YOL-HARITASI.md` işaretli

## Asla

- `.env` dosyalarını okuma, yazma, içeriğini ekrana basma. Sırrı koda, loga veya istemci tarafına koyma.
- Onay almadan (soru modundan bağımsız): veri silme/sıfırlama, `git push --force`, `git reset --hard`, toplu dosya silme, prod deploy, para harcatan işlem.
- Testi geçirmek için testi silme veya zayıflatma. Var olmayan API veya paket uydurma.
- Hook'ları (sır engeli, commit kapısı) atlatmaya çalışma. Kullanıcı adına karar verip sonradan bildirme.

## Git

Küçük ve sık commit. Mesaj biçimi: `tür: açıklama` (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `wip`). `main` her zaman çalışır olmalı.
