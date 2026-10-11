# Vibe Coding Kit

Claude Code ile bir projeyi fikirden canlıya ve bakıma kadar **soru sorarak** yürüten proje şablonu.
AI hiçbir kararı kendi başına vermez. Her adımda seçenekleri, ne zaman hangisinin daha iyi olduğunu ve önerisini sunar; sen seçersin. Tasarım kararlarını görsel önizlemelerle sorar. Her işte uygun skill'i kullanır ve her cevabın sonunda nerede olduğunu raporlar.

> Bu README kitin kendisini anlatır. `/baslat` kurulumu yaptığında yerini projenin README'si alır.

## Gereksinimler

- [Claude Code](https://claude.com/claude-code)
- Git, Node.js 18+ (kurulum aracı ve hook'lar için)
- Skill plugin'leri: Proje açıldığında Claude Code bunları kurmayı önerir (`.claude/settings.json`). Elle kurmak için:

```
/plugin marketplace add juliusbrussee/caveman
/plugin marketplace add pbakaus/impeccable
/plugin marketplace add Leonxlnx/taste-skill
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin marketplace add blader/humanizer
/plugin marketplace add DietrichGebert/ponytail
/plugin marketplace add mattpocock/skills
/plugin install caveman@caveman
/plugin install impeccable@impeccable
/plugin install taste-skill@taste-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
/plugin install humanizer@humanizer
/plugin install ponytail@ponytail
/plugin install mattpocock-skills@mattpocock
```

## Yeni proje başlatmak

1. GitHub'da bu repoda **Use this template → Create a new repository**.
2. Yeni repoyu klonla ve Claude Code'u aç:

```bash
git clone https://github.com/<kullanici>/<yeni-proje>.git
cd <yeni-proje>
claude
```

3. `/baslat Serbest çalışanlar için fatura takip uygulaması`

`/baslat` sihirbazı 8 adımda ilerler. Her adımda sorar, cevabını kaydeder, kaldığı yerden devam edebilir:

| Adım | Ne olur | Örnek sorular |
|---|---|---|
| 0 Hazırlık | Ortam ve skill kontrolü | "Impeccable kurulu değil. Kurup devam edelim mi?" |
| 1 Fikir → PRD | Fikir sorgulanır (grilling) | "İlk sürümde hangi özellikler olsun?" (çoklu seçim) |
| 2 Proje tipi | Web/SaaS, mobil, backend; AI özelliği | "Web mi, mobil mi? Senin kullanıcın için şu daha iyi, çünkü…" |
| 3 Kurulum | `kit/kit.mjs kur` tipi yerleştirir, `kit/`'i siler | - |
| 4 Teknoloji | Tipin karar kataloğundan tek tek | "Backend dili: FastAPI (önerilen) / Node + Hono / Go?" |
| 5 Mimari | Veri modeli, kimlik, roller, servisler ve maliyet | "Silinen kayıt çöp kutusuna mı gitsin, kalıcı mı silinsin?" |
| 6 Tasarım | Görsel önizlemelerle stil, renk, yazı tipi, detaylar | "Bu üç açılış sayfasından hangisi? Premium / Minimal / Cesur" |
| 7 Yol haritası | Görevler, öncelik, lansman hedefi | "Faz 1'de hangi özellikle başlayalım?" |
| 8 Kapanış | Özet, durum panosu, ilk görev | - |

## Proje boyunca

| Komut | Ne yapar |
|---|---|
| `/planla [görev]` | Görevin karar noktalarını sorar, plan çıkarır, onay alır |
| `/gelistir [görev]` | Uygular; yeni karar çıkarsa durup sorar; çalıştığını kanıtlar |
| `/tasarim [kapsam]` | Tasarım kararlarını görsel önizlemelerle aldırır ve uygular |
| `/incele` | Bağımsız inceleme ve güvenlik ajanları + ponytail-review |
| `/hata-ayikla [belirti]` | Kök neden, kırmızı test, düzeltme |
| `/oturum-sonu` | İlerleme, kararlar ve durum panosunu günceller |
| `/durum` | Ayrıntılı rapor + `DURUM.html` panosu |
| `/soru [kapat\|ac] [konu]` | Soru modu: "tasarımda sorma", "tekrar sor" |
| `/canliya-al [ilk]` | Güvenlik, kalite, KVKK ve lansman kontrolleri |
| `/bakim [haftalik\|aylik\|ceyreklik]` | Düzenli bakım |
| `/retro` | Dersleri projeye ve kite geri yazar |
| `/kit-guncelle` | Projeyi kitin son sürümüne çeker |

**Soru modu:** Konular `urun`, `teknik`, `tasarim`, `icerik`, `veri`, `guvenlik` ve `maliyet`. "Tasarımda sorma" dersen sadece o konu kapanır; AI önerilen seçeneği seçer ve kararı "otomatik" diye raporlar. "Tekrar sor" ile açılır. Veri silme, prod deploy ve para harcatan işlemler her zaman onay ister.

**Raporlama:** Her cevabın sonunda durum bloğu, Claude Code'un alt durum çubuğunda aşama/görev/soru modu, `/durum` ile ayrıntılı rapor ve `DURUM.html` panosu.

## Skill'ler nerede kullanılır

Tam tablo: [`docs/SKILLER.md`](docs/SKILLER.md).

| Alan | Skill |
|---|---|
| Rapor dili | Caveman (sorular ve dokümanlar tam cümle) |
| Fikir sorgulama, alan modeli, mimari, araştırma, TDD, hata ayıklama | Matt Pocock skills |
| Kod: en küçük tam çözüm, inceleme, denetim | Ponytail |
| Stil yönü: Premium/Apple, minimal, cesur, brutalist | Taste Skill (yöne göre) |
| Ürün bağlamı, tasarım sistemi, critique/audit/polish | Impeccable |
| Renk, yazı tipi, belirteçler, marka, banner | UI UX Pro Max |
| Kullanıcıya görünen metinler | Humanizer |

## Yapı

```
CLAUDE.md                      AI'nın anayasası (protokol, skill, stack, ilerleme içe aktarılır)
docs/
  KARAR-PROTOKOLU.md           nasıl sorulur, soru modu, görsel önizleme, durum bloğu
  SKILLER.md                   hangi işte hangi skill
  PRD MIMARI YOL-HARITASI ILERLEME KARARLAR SOZLUK TEST-PLANI
  GUVENLIK YASAL-KVKK CANLIYA-ALMA LANSMAN BAKIM RETRO
  STACK.md                     kurulumda tipin dosyasıyla değişir
.claude/
  commands/                    14 komut
  agents/                      inceleyici, guvenlik-denetcisi
  hooks/                       sır engeli, oturum notu, durum çubuğu, durum panosu
  settings.json                izinler, hook'lar, durum çubuğu, skill plugin'leri
kit/                           kurulumdan sonra silinir
  kit.mjs                      kur / guncelle
  sablon/web-saas|mobil|backend   STACK (karar kataloğu dahil), TASARIM, CI, Dependabot, MCP, pre-commit…
  sablon/ekler/ai              AI.md, evals/, prompts/
  proje/README.md              projenin README şablonu
  CHANGELOG.md  SURUM  KAYNAK  REHBER.html  testler/
```

## Kiti geliştirmek

- Testler: `node --test "kit/testler/*.test.mjs"`
- Dersler projelerden `/retro` ile gelir. `/retro` bu repoda bir dal açar ve onayınla push eder.
- Sürüm çıkarmak için:
  1. `kit/SURUM` dosyasındaki numarayı artır.
  2. `kit/CHANGELOG.md`'de "[Yayınlanmamış]" bölümünü sürüm numarasıyla adlandır.
  3. Testleri çalıştır.
  4. Commit at, `git tag vX.Y.Z` ile etiketle ve push et.
- Projeler `/kit-guncelle` ile yeni sürümü alır. Senin değiştirdiğin dosyalar ezilmez, yeni hali yanına `.yeni` olarak gelir.
- Yeni tip eklemek için `kit/sablon/<tip>/` klasörü aç. Gerekli dosyalar:
  - `docs/STACK.md` ("Karar noktaları" bölümü dahil)
  - `.claude/settings.birlestir.json`
  - `.claude/hooks/format.mjs`
  - `.gitignore.ekle`
  - `.env.example`
- Yeni ek eklemek için `kit/sablon/ekler/<ad>/` klasörü aç. Mevcut bir dosyanın sonuna eklenecek içerik için `x.ekle`, JSON birleştirmek için `x.birlestir.json` adını kullan.
