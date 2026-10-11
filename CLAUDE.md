# [PROJE ADI]

> [Tek cümle: Bu proje kimin için, hangi problemi çözüyor?]

**Kurulum durumu:** Kökte `kit/` klasörü varsa ve `.kit.json` yoksa proje henüz kurulmamıştır. Kullanıcıya `/start [fikir]` öner; kurulum bitmeden kod yazma.

@docs/workflow/progress.md

## Temel kurallar (her zaman geçerli)

1. **Kararı kullanıcı verir.** Ürün, teknik, tasarım, içerik, veri, güvenlik ve maliyet kararlarında AskUserQuestion ile sor. 2-4 seçenek sun; önerin ilk sırada ve "(Önerilen)" etiketli olsun. Her seçenekte ne zaman daha iyi olduğunu ve bedelini yaz. Tasarım kararları görsel önizlemeyle sorulur. Soru modunda kapalı konularda önerileni seç ve "otomatik" diye kaydet. **İlk karar sorusundan önce `docs/workflow/decision-protocol.md`'yi oku.** Daha önce verilmiş kararlar `docs/decisions/log.md`'de; onları tekrar sorma. Her kararı tek yönlü / çift yönlü kapı olarak sınıfla; tek yönlülerde (veritabanı, auth, ödeme, veri modeli) önce kurul görüşü al.
2. **Doğru skill'i kullan.** Kod: `ponytail:ponytail`. Kritik akış: `mattpocock-skills:tdd`. Arayüz: seçilen stil skill'i + `impeccable:impeccable`; hareket: `ui-motion`. Logo: `logo-design`. Tanıtım videosu: `motion-video`. Metin: `humanizer:humanizer`. Rapor dili: `caveman:caveman`. Tam tablo (ilk ihtiyaçta oku): `docs/workflow/skills.md`.
3. **Uzman kurulu denetler** (`docs/workflow/board.md`, kurallar `.claude/board/rules.md`). Plan onayından önce, görev bitince, her commit'te (hafif) ve faz sonunda ilgili üyeler toplanır. Kurul danışmandır; RET (kritik bulgu) varsa iş bitmez, kullanıcıya sorulur.
4. **Limiti ve bağlamı gözet** (`docs/workflow/usage-limits.md`). İş başlamadan limiti oku: masaüstünde `get_usage` aracı, terminalde `node .claude/hooks/usage.mjs`. Sarı/kırmızı seviyede tahmini maliyeti söyle ve seçenekleri sor. %90'da güvenli dur ve "Kaldığı yer"i yaz. Bağlam %50'yi geçince uygun noktada `/wrap-up` + `/clear` öner.
5. **Doğru kaynak.** Sürüm, fiyat, kota, mevzuat, API gibi değişebilen bilgiyi hafızadan kullanma: `source-research` skill'i (önce birincil kaynak, her iddiaya kaynak ve tarih). Kütüphane kullanırken önce **Context7** MCP ile güncel dokümanı getir.
5b. **Az token harca.** Kod haritası (codebase-memory-mcp) bağlıysa kodu keşfederken önce onu sorgula (`get_architecture`, `search_graph`, `trace_path`, `get_code_snippet`). Dosyaları toptan okuma. Dokümanları sadece gerektiğinde oku (tablo aşağıda).
6. **Yapıya uy (zorunlu).** Yeni dosyayı `.claude/structure.json` haritasındaki yerine yaz (özellik bazlı: `features/<özellik>/`); açıklaması `docs/architecture/structure.md`. Harita dışı yazım sorulur, dağınıklık dosyaları (`*.bak`, `*-old.*`, kopya) engellenir. Geçici ve deneme işleri `sandbox/`, artık geçerli olmayan dokümanlar `docs/archive/`. Haritayı değiştirmek teknik bir karardır.
7. **Önce plan, sonra kod.** 2'den fazla dosyaya dokunan iş `/plan-task`'dan geçer. Tek seferde tek görev. Kapsamı genişletme.
8. **Kök neden, kanıt, test.** Kabul testleri (kriter kimliği test adında, `Ö-01.1`) ve saldırgan testleri koddan önce yazılır ve önce kırmızı olur. Riskli özellik bayrak arkasında yayınlanır (`docs/operations/feature-flags.md`). Hata düzeltirken önce yeniden üret. "Bitti" demeden çalıştığını göster. Aynı hatada 2 denemede çözemezsen dur ve yön iste.
9. **Her cevabın sonunda durum bloğu** (kısa, caveman). Biçim:

```
── Durum ──────────────────────
Aşama: … · Görev: … (x/y) · Soru modu: … · Limit: 5s %… hf %…
Yapıldı: … · Kurul: … · Otomatik kararlar: …
Sıradaki: … · bekleyen karar: …
```

## Gerektiğinde oku

| Dosya | Ne zaman |
|---|---|
| `docs/architecture/stack.md` | Kod yazarken: komutlar, kurallar, doğrulama yöntemi |
| `docs/product/prd.md` | Kapsam veya kabul kriteri belirsizse |
| `docs/architecture/overview.md`, `docs/product/glossary.md` | Yeni dosya/tablo/servis/kavram eklerken |
| `docs/product/roadmap.md` | Görev seçerken ve işaretlerken |
| `docs/design/design-guide.md`, `DESIGN.md`, `PRODUCT.md` | Arayüz işinde |
| `docs/quality/test-plan.md`, `docs/security/checklist.md` | Kritik akış, auth, veri, ödeme koduna dokunurken |
| `docs/ai/guide.md` (varsa) | Prompt veya model çağrısı işinde |
| `docs/operations/accounts.md`, `docs/product/unit-economics.md` | Yeni dış servis, fiyat veya maliyet kararı |
| `docs/operations/feature-flags.md` | Ödeme, AI, toplu bildirim, veri silen veya büyük arayüz değişikliği |
| `docs/product/feedback.md`, `docs/quality/metrics.md` | Kullanıcı geri bildirimi, retro, bakım |
| `docs/findings/<tür>/latest.md` | İlgili alanda iş yaparken: bilinen bulgular (`/findings-<tür>` raporları) |

## Komutlar

```bash
# /start seçilen stack'e göre doldurur
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
- [ ] Kodda sır yok; yeni ortam değişkeni `.env.example`'da; `docs/product/roadmap.md` işaretli

## Asla

- `.env` dosyalarını okuma, yazma, içeriğini ekrana basma. Sırrı koda, loga veya istemci tarafına koyma.
- Onay almadan (soru modundan bağımsız): veri silme/sıfırlama, `git push --force`, `git reset --hard`, toplu dosya silme, prod deploy, para harcatan işlem.
- Testi geçirmek için testi silme veya zayıflatma. Var olmayan API veya paket uydurma.
- Hook'ları (sır engeli, commit kapısı) atlatmaya çalışma. Kullanıcı adına karar verip sonradan bildirme.

## Git

Küçük ve sık commit. Mesaj biçimi: `tür: açıklama` (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `wip`). `main` her zaman çalışır olmalı.
