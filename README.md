# Vibe Coding Kit

Claude Code ile bir projeyi fikirden canlıya ve bakıma kadar **soru sorarak** yürüten proje şablonu.

- **Kararları sen verirsin.** AI hiçbir kararı kendi başına vermez. Her adımda seçenekleri, hangisinin ne zaman daha iyi olduğunu ve önerisini sunar.
- **Tasarımı görerek seçersin.** Tasarım kararları görsel önizlemelerle sorulur.
- **Uzman kurulu denetler.** Projeye özel uzman ajanlar planı, görevi, her commit'i ve fazı denetler.
- **Limitini gözetir.** 5 saatlik ve haftalık kullanım limitini hesaba katar.
- **Az token harcar.** Her oturumu düşük maliyetle açar.
- **Durumu raporlar.** Her işte uygun skill'i kullanır ve her cevabın sonunda nerede olduğunu söyler.

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

**Önerilen: Kod haritası** ([codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp), MIT). AI kodu dosya dosya okumak yerine sorgular; proje büyüdükçe oturum başına ciddi token tasarrufu sağlar. `/baslat` kurmak isteyip istemediğini sorar. Kurulum script'ini kendi terminalinde çalıştırırsın:

```powershell
# Windows (PowerShell)
Invoke-WebRequest -Uri https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1 -OutFile install.ps1
Unblock-File .\install.ps1
.\install.ps1
```

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash
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

`/baslat` sihirbazı 9 adımda ilerler. Her adımda sorar, cevabını kaydeder, kaldığı yerden devam edebilir:

| Adım | Ne olur | Örnek sorular |
|---|---|---|
| 0 Hazırlık | Ortam, skill, limit ve kod haritası kontrolü | "Impeccable kurulu değil. Kurup devam edelim mi?" |
| 1 Fikir → PRD | Fikir sorgulanır (grilling) | "İlk sürümde hangi özellikler olsun?" (çoklu seçim) |
| 2 Proje tipi | Web/SaaS, mobil, backend; AI özelliği | "Web mi, mobil mi? Senin kullanıcın için şu daha iyi, çünkü…" |
| 3 Kurulum | `kit/kit.mjs kur` tipi yerleştirir, `kit/`'i siler | - |
| 4 Teknoloji | Tipin karar kataloğundan tek tek | "Backend dili: FastAPI (önerilen) / Node + Hono / Go?" |
| 5 Mimari | Veri modeli, kimlik, roller, servisler ve maliyet | "Silinen kayıt çöp kutusuna mı gitsin, kalıcı mı silinsin?" |
| 6 Kurul | Tipe göre önerilen uzman kurulunu onaylarsın, model dağılımını seçersin | "Kurulda kimler olsun?" (çoklu seçim) |
| 7 Tasarım | Görsel önizlemelerle stil, renk, yazı tipi, detaylar | "Bu üç açılış sayfasından hangisi? Premium / Minimal / Cesur" |
| 8 Yol haritası | Görevler, öncelik, lansman hedefi | "Faz 1'de hangi özellikle başlayalım?" |
| 9 Kapanış | Özet, durum panosu, ilk görev | - |

## Uzman kurulu

Seçilen ürün tipine göre uzman ajanlar senin projende oluşturulur: `.claude/agents/kurul-*.md`. Her ajan seçilen stack'e ve projeye göre özelleştirilir.

| Tip | Önerilen kurul |
|---|---|
| Web / SaaS | Ürün, Mimar, Güvenlik, UX, Performans/SEO, KVKK, QA (+ DevOps, + AI) |
| Mobil | Ürün, Mimar, Güvenlik, UX, Mobil Platform, KVKK, QA (+ DevOps, + AI) |
| Backend | Ürün, Mimar, Güvenlik, API, DevOps, QA (+ KVKK, + AI) |

- **Toplantılar:**
  - Plan onayından önce ve görev bitince ilgili üyeler toplanır.
  - Her commit'te hafif denetim yapılır: en fazla 2 üye, hızlı model, sadece değişen satırlar. Hook bunu zorunlu kılar.
  - Faz sonunda ve canlıya almadan önce tüm kurul toplanır.
- **Yetki:** Kurul danışmandır. Kritik bulguda (güvenlik açığı, veri kaybı, yasal ihlal) iş bitmez ve sana sorulur.
- **Model:** Önerilen karma: Mimar ve Güvenlik `sonnet`, diğer üyeler `haiku`.
- **Komutlar:** `/kurul` durumu gösterir, `/kurul kur` kurulu değiştirir, `/kurul topla faz-sonu` toplantı yapar. Kararlar `docs/KURUL.md`'deki toplantı günlüğüne yazılır.

## Limit farkındalığı

- **Limit okuma:**
  - Masaüstü uygulamasında `get_usage` aracıyla okunur.
  - Terminalde ve IDE'de Claude Code'un durum çubuğuna gönderdiği `rate_limits` bilgisiyle okunur (`node .claude/hooks/limit.mjs`).
  - Alt durum çubuğunda her zaman `5s %34 · hf %5` biçiminde görünür.
- **Seviyeler:** Yeşil, sarı (5 saatlikte %60 üstü) ve kırmızı (5 saatlikte %85 üstü). Sarı veya kırmızı seviyede iş başlamadan önce tahmini maliyet söylenir ve şu seçenekler sunulur:
  - Limite sığanı yap, kalanını sıraya koy
  - Hepsini başlat; limit dolunca kaydet, yenilenince devam et (masaüstünde zamanlanmış görevle otomatik)
  - Ucuz modele geçerek devam et
  - Kurulu hafiflet
- **Güvenli durma:** 5 saatlik %90'da iş yarım bırakılmaz. Mevcut adım tamamlanır, "Kaldığı yer" kaydedilir ve durulur.
- **Kalibrasyon:** Görev maliyetleri `docs/MALIYET-GUNLUGU.md`'ye yazılır; tahminler zamanla gerçek verilere oturur.

## Az token

- Oturum açılışında sadece `CLAUDE.md` (özet kurallar) ve `docs/ILERLEME.md` yüklenir, toplam yaklaşık 1.700 token. Önceki sürümde bu yaklaşık 8.000 token'dı.
- Diğer dokümanlar sadece gerektiğinde okunur.
- Kod haritası bağlıysa kod, dosyalar okunmadan sorgulanır.

## Proje boyunca

| Komut | Ne yapar |
|---|---|
| `/planla [görev]` | Görevin karar noktalarını sorar, plan çıkarır, onay alır |
| `/gelistir [görev]` | Uygular; yeni karar çıkarsa durup sorar; çalıştığını kanıtlar |
| `/tasarim [kapsam]` | Tasarım kararlarını görsel önizlemelerle aldırır ve uygular |
| `/incele` | Bağımsız inceleme ve güvenlik ajanları + ponytail-review |
| `/hata-ayikla [belirti]` | Kök neden, kırmızı test, düzeltme |
| `/oturum-sonu` | İlerleme, kararlar ve durum panosunu günceller |
| `/durum` | Ayrıntılı rapor + `DURUM.html` panosu (limit ve kurul dahil) |
| `/kurul [kur\|topla <tür>]` | Uzman kurulunu kurar, değiştirir, toplar |
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
  KURUL.md  LIMIT-PLANI.md  MALIYET-GUNLUGU.md
  SKILLER.md                   hangi işte hangi skill
  PRD MIMARI YOL-HARITASI ILERLEME KARARLAR SOZLUK TEST-PLANI
  GUVENLIK YASAL-KVKK CANLIYA-ALMA LANSMAN BAKIM RETRO
  STACK.md                     kurulumda tipin dosyasıyla değişir
.claude/
  commands/                    14 komut
  agents/                      inceleyici, guvenlik-denetcisi (+ kurulumda kurul-*)
  kurul/                       kurul rol şablonları (10 uzman) + KURALLAR.md
  hooks/                       sır engeli, commit kapısı, oturum notu, durum çubuğu, limit, durum panosu
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
