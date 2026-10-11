# Lens: UX ve erişilebilirlik

**Bakış açısı:** Ürünü ilk kez kullanan hedef kullanıcı ve onu gözlemleyen kıdemli bir UX araştırmacısı ol. Erişilebilirlik için ekran okuyucu ve klavye kullanan bir kullanıcıyı da düşün. Soru: "Kullanıcı nerede takılır, yanılır, vazgeçer veya dışlanır?"

**Kimlik öneki:** `UX-` · **Skill'ler:** `impeccable:impeccable` (`critique`, `audit`), seçilen stil skill'i, `humanizer:humanizer` (metinler)

## Kontrol listesi

1. **Ana akışlar:** PRD'deki kullanıcı akışlarını (kayıt → ilk değer → ana eylem) adım adım yürü. Gereksiz adım, belirsiz sonraki adım, çıkmaz sokak var mı?
2. **Nielsen'in 10 ilkesi:** Sistem durumunun görünürlüğü, gerçek dünyayla uyum, kullanıcı kontrolü (geri al/iptal), tutarlılık, hata önleme, hatırlamak yerine tanıma, esneklik, sade tasarım, hatadan kurtulma, yardım.
3. **Durumlar:** Boş, yükleniyor, hata, başarı, çevrimdışı (mobil). Her ekranda var mı ve yönlendirici mi?
4. **Tutarlılık:** `DESIGN.md` belirteçleri dışında değer, aynı işin farklı ekranlarda farklı yapılması, bileşen tekrarları.
5. **Erişilebilirlik (WCAG 2.2 AA):** Kontrast (4.5:1), klavyeyle erişim ve odak sırası, görünür odak, form etiketleri, hata mesajlarının alanla ilişkisi, alt metinler, dokunma alanı (44px), hareket azaltma tercihi, ekran okuyucu adları.
6. **Metin:** Hitap tutarlılığı (`docs/product/glossary.md`), belirsiz buton metinleri, suçlayıcı hata mesajları, AI kokan kalıplar.
7. **Mobil ve responsive:** 375px genişlikte taşma, başparmak erişimi, klavyenin içeriği örtmesi.
8. **Güven işaretleri:** Ödeme ve kişisel veri adımlarında güven veren açıklamalar.

## Araçlar

- Uygulama çalışıyorsa tarayıcı aracıyla ana akışları dene; masaüstü (1440px) ve mobil (390px) ekran görüntüsü al.
- Chrome DevTools MCP: konsol hataları, ağ hataları, düzen kayması kaynakları.
- `impeccable:impeccable` → `audit` (erişilebilirlik, responsive, performans) ve `critique`.
- Web: `npx --yes @axe-core/cli <url>` veya Playwright + axe. Lighthouse erişilebilirlik puanı.
- Uygulama çalışmıyorsa kod ve `DESIGN.md` üzerinden değerlendir ve bunu raporda belirt.
