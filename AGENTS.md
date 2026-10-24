# [PROJE ADI]

> [Tek cümle: Bu proje kimin için, hangi problemi çözüyor?]

Bu dosya projenin ortak kurallarıdır; Claude Code, Codex ve Antigravity okur. Claude Code'a özel ekler `CLAUDE.md`'de.

**Kurulum durumu:** Kökte `kit/` klasörü varsa ve `.kit.json` yoksa, ya da `.kit.json` → `type` boşsa (`null`) proje henüz kurulmamıştır. Kullanıcıya yeni projede `/start [fikir]`, klasörde var olan kod varsa `/adopt` öner; kurulum bitmeden kod yazma.

**Oturum başı:** `docs/workflow/progress.md`'yi oku (güncel durum, sıradaki adım). Claude Code bunu kendisi yükler.

## Temel kurallar (her zaman geçerli)

1. **Kararı kullanıcı verir.** Ürün, teknik, tasarım, içerik, veri, güvenlik ve maliyet kararlarında AskUserQuestion ile sor. 2-4 seçenek sun; önerin ilk sırada ve "(Önerilen)" etiketli olsun. Her seçenekte ne zaman daha iyi olduğunu ve bedelini yaz. Tasarım kararları görsel önizlemeyle sorulur. Soru modunda kapalı konularda önerileni seç ve "otomatik" diye kaydet. **İlk karar sorusundan önce `docs/workflow/decision-protocol.md`'yi oku.** Daha önce verilmiş kararlar `docs/decisions/log.md`'de; onları tekrar sorma. Her kararı tek yönlü / çift yönlü kapı olarak sınıfla; tek yönlülerde (veritabanı, auth, ödeme, veri modeli) önce kurul görüşü al.
2. **Uzman kurulu denetler** (`docs/workflow/board.md`, kurallar `.claude/board/rules.md`). Plan onayından önce, görev bitince, her commit'te (hafif) ve faz sonunda ilgili üyeler toplanır. Kurul danışmandır; RET (kritik bulgu) varsa iş bitmez, kullanıcıya sorulur.
3. **Doğru kaynak.** Sürüm, fiyat, kota, mevzuat, API gibi değişebilen bilgiyi hafızadan kullanma: `source-research` skill'i (önce birincil kaynak, her iddiaya kaynak ve tarih). Kütüphane kullanırken önce **Context7** MCP ile güncel dokümanı getir.
4. **Az token harca.** Kod haritası (codebase-memory-mcp) bağlıysa kodu keşfederken önce onu sorgula (`get_architecture`, `search_graph`, `trace_path`, `get_code_snippet`). Dosyaları toptan okuma. Dokümanları sadece gerektiğinde oku (tablo aşağıda).
5. **Yapıya uy (zorunlu).** Yeni dosyayı `.claude/structure.json` haritasındaki yerine yaz (özellik bazlı: `features/<özellik>/`); açıklaması `docs/architecture/structure.md`. Harita dışı yazım sorulur, dağınıklık dosyaları (`*.bak`, `*-old.*`, kopya) engellenir. Geçici ve deneme işleri `sandbox/`, artık geçerli olmayan dokümanlar `docs/archive/`. Haritayı değiştirmek teknik bir karardır.
6. **Önce plan, sonra kod.** 2'den fazla dosyaya dokunan iş `/plan-task`'dan geçer. Tek seferde tek görev. Kapsamı genişletme. Dört ilke: (1) varsayımını söyle, belirsizse sor; (2) en sade çözüm, istenmeyen esneklik yok; (3) sadece görevin gerektirdiği satırlara dokun; (4) işe başlarken doğrulanabilir başarı ölçütünü yaz.
7. **Kök neden, kanıt, test.** Kabul testleri (kriter kimliği test adında, `Ö-01.1`) ve saldırgan testleri koddan önce yazılır ve önce kırmızı olur. Riskli özellik bayrak arkasında yayınlanır (`docs/operations/feature-flags.md`). Hata düzeltirken önce yeniden üret. "Bitti" demeden çalıştığını göster. Aynı hatada 2 denemede çözemezsen dur ve yön iste.
8. **Her cevabın sonunda durum bloğu** (kısa). Biçim:

```
── Durum ──────────────────────
Aşama: … · Görev: … (x/y) · Soru modu: … · Limit: 5s %… hf %…
Yapıldı: … · Kurul: … · Otomatik kararlar: …
Sıradaki: … · bekleyen karar: …
```

## Codex ve Antigravity'de

Kit Claude Code için yazıldı; bu iki araçta şu karşılıklar geçerli:

- **Komutlar** (`/start`, `/build`…) `.agents/skills/` altında skill olarak durur: Codex'te `$start` ya da `/skills`, Antigravity'de `/start`. Kaynakları `.claude/commands/`; skill kopyaları kit güncellemesinde yeniden üretilir, düzenleme kaynakta yapılır.
- **AskUserQuestion** geçen her yerde: Antigravity'de `ask_question` aracı. Seçenekli soru aracı yoksa (Codex) seçenekleri numaralı liste olarak yaz, önerileni ilk sıraya koy ve "(Önerilen)" diye işaretle, cevabı bekle. Karar yine kullanıcınındır.
- **Alt ajanlar** (kurul üyeleri, konsey, inceleme ajanları `.claude/agents/`): Çalıştıramıyorsan ilgili tanımı oku, o rolle kendin değerlendir ve raporda "tek model" diye belirt.
- **Korumalar** (sır engeli, yıkıcı komut kalkanı, yapı koruyucu, düzenleme kilidi, test koruması, düzenleme turu sayacı, paket kapısı ve Claude Code izin listesinin karşılığı) hook olarak çalışır: Codex `.codex/hooks.json`, Antigravity `.agents/hooks.json`. Kural ve koruma dosyalarına (`AGENTS.md`, `.claude/`, `.codex/`, `.agents/hooks.json`) yazma onaya bağlıdır. Engellenen işlemi başka yoldan (örneğin kabuk komutuyla) yapmaya çalışma; nedenini kullanıcıya söyle.
- Claude Code eklentilerine ait skill'ler (adı `eklenti:skill` biçiminde) bu araçlarda yok: o adımı atla. Limit okuma ve durum çubuğu da yok: durum bloğunda limit "-" kalır.

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
- [ ] Hata, boş ve yükleniyor durumları ele alındı; çalıştığına dair kanıt gösterildi (doğrulama komutu bu turda çalıştırıldı ve çıktısı gösterildi; "çalışmalı" kanıt değildir)
- [ ] Arayüz varsa: `DESIGN.md`'ye uygun, Impeccable critique yapıldı, metinler humanizer'dan geçti
- [ ] Görev sonu kurul toplantısında RET yok
- [ ] Kodda sır yok; yeni ortam değişkeni `.env.example`'da; `docs/product/roadmap.md` işaretli

## Asla

- `.env` dosyalarını okuma, yazma, içeriğini ekrana basma. Sırrı koda, loga veya istemci tarafına koyma.
- Onay almadan (soru modundan bağımsız): veri silme/sıfırlama, `git push --force`, `git reset --hard`, toplu dosya silme, prod deploy, para harcatan işlem.
- Testi geçirmek için testi silme veya zayıflatma (test koruması hook'u sorar). Var olmayan API veya paket uydurma.
- Hook'ları (sır engeli, commit kapısı) atlatmaya çalışma. Kullanıcı adına karar verip sonradan bildirme.

## Git

Küçük ve sık commit. Mesaj biçimi: `tür: açıklama` (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `wip`). `main` her zaman çalışır olmalı.
