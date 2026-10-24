---
description: Projeyi başka bir kişiye veya hesaba devreder (devir notu yazar) ya da devralır (`/handoff devral`). Ekip arkadaşı, kurumsal hesap veya kapanan hesap sonrası aynı yerden devam için.
argument-hint: [boş = devret | devral]
---

Mod: $ARGUMENTS (boş = devret, `devral` = devral)

Projenin durumu sohbette değil dosyalarda ve git'te yaşar. Devir, bu dosyaları eksiksiz ve güncel bırakmak ve devralan tarafta ortamı yeniden kurmaktır. **Sır değerlerini asla nota, koda veya sohbete yazma**; sadece adlarını ve nereden alınacağını yaz.

## Devret (argümansız)

1. `/wrap-up` adımlarını uygula (ilerleme, yol haritası, kararlar, CHANGELOG). Yarım iş varsa "Kaldığı yer"i doldur.
2. `docs/workflow/handoff.md` dosyasını yaz (varsa üzerine):

```markdown
# Devir notu

**Durum:** bekliyor
**Tarih:** YYYY-AA-GG
**Devreden:** [ad veya rol]

## Nerede kaldık
- Aktif faz ve görev, son biten görevler, yarım kalan iş (dosya ve adım)

## Bekleyen kararlar
- ...

## Devralanın ihtiyacı
- Hesaplar ve erişimler: `docs/operations/accounts.md`'deki servisler; kimin davet etmesi gerekiyor
- Ortam değişkenleri: `.env.example`'daki adlar ve her birinin nereden alınacağı (değer yok)
- Sistem bağımlılıkları ve kurulum: `README.md` → Gereksinimler / Kurulum
- Yerel ayarlar (git'e girmeyenler): anlatıcı mod, kod haritası, MCP bağlantıları

## Dikkat
- Bilinen sorunlar, riskli bölgeler, yapılmaması gerekenler
```

2b. **İsteğe bağlı, devralan kodu ilk kez görecekse:** Understand-Anything ile tanıtım rehberi (`yayin` paketi: `node .claude/hooks/tools.mjs --required yayin`). `/understand --language en` ilk çalıştırmada bütün kodu okur, büyük projede pahalıdır: maliyeti söyle ve sor. Sonra `/understand-onboard`; çıktının yolunu devir notunun "Devralanın ihtiyacı" bölümüne yaz.
3. Commit edilmemiş değişiklik varsa commit öner: `docs: devir notu`. Uzak depo varsa push öner (onayla). Push yoksa devralanın projeyi nasıl alacağını söyle (repo daveti veya klasör kopyası; `.env` dosyası kopyalanmaz).
4. Kullanıcıya devralan kişiye ileteceği tek satırı ver: "Repoyu klonla, Claude Code'da aç, `/handoff devral` yaz."

## Devral (`/handoff devral`)

1. `docs/workflow/handoff.md`'yi oku ve özetle: nerede kalındı, bekleyen kararlar, dikkat edilecekler. Notta Understand-Anything tanıtım rehberi varsa yolunu ver; görsel harita için `/understand-dashboard` (`yayin` paketi).
2. Ortamı kur, her adımı tek satırla raporla:
   - `node --version`, `git --version`; README'deki çalışma ortamı sürümüyle (`.nvmrc` / `.python-version`) uyuşuyor mu?
   - Eklentiler: `node .claude/hooks/plugins-sync.mjs` ile eksikleri listele, onayla `--install`, sonra `/reload-plugins`. Paket tercihleri kişiseldir ve devirle gelmez: gerekenleri `/tools` ile göster.
   - Bağımlılıklar: README → Kurulum'daki kurulum komutu (kilit dosyasından).
   - Ortam değişkenleri: `.env.example`'daki adları listele. `.env` dosyasını sen oluşturma ve okuma; kullanıcı değerleri kendi girer (nereden alınacağı devir notunda).
   - Hesaplar: devir notundaki erişimleri liste halinde göster; davet bekleyenleri işaretle.
   - Kişisel ayarlar: anlatıcı mod (`/start` Adım 0b) ve kod haritası (Adım 5) bu kullanıcı için ayrıca sorulur.
3. Testleri çalıştır ve sonucu göster. Kırmızıysa devir notundaki "Dikkat" ile karşılaştır.
4. Bekleyen kararlar varsa şimdi sor.
5. `docs/workflow/handoff.md` → `**Durum:** devralındı` ve `**Devralan:**` satırını ekle. Commit öner: `docs: devir alındı`.
6. Son satır: sıradaki komut (`/build G-NNN` ya da "Kaldığı yer" doluysa oradan devam).
