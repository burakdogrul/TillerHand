# Skill Yönlendirme

> Hangi işte hangi skill kullanılır? Skill'i Skill aracıyla yükle, talimatlarını uygula.
> Bu proje `.claude/settings.json` içinde aşağıdaki plugin'leri tanımlar; Claude Code projeyi açınca kurmayı önerir.
> Bir skill yüklü değilse işi skill'siz yap, durum bloğunda "skill eksik: X" yaz ve kullanıcıya kurulum komutunu ver:
> `/plugin install <plugin>@<marketplace>` (örn. `/plugin install impeccable@impeccable`).

| Plugin | Marketplace | Skill önekleri |
|---|---|---|
| caveman | caveman | `caveman:` |
| impeccable | impeccable | `impeccable:` |
| taste-skill | taste-skill | `taste-skill:` |
| ui-ux-pro-max | ui-ux-pro-max-skill | `ui-ux-pro-max:` |
| humanizer | humanizer | `humanizer:` |
| ponytail | ponytail | `ponytail:` |
| mattpocock-skills | mattpocock | `mattpocock-skills:` |

## İletişim

| Durum | Skill |
|---|---|
| Durum bloğu, ilerleme notları, kod açıklamaları | `caveman:caveman` (oturum başında yükle). Sorular, seçenek açıklamaları ve dokümanlar bundan muaftır, tam cümle yazılır |

## Fikir, ürün ve mimari

| Durum | Skill |
|---|---|
| Fikri ve planı sorgulamak (`/start` 1. adım, büyük özellik planı) | `mattpocock-skills:grilling` (soruları AskUserQuestion ile sor) |
| Kavramlar, sözlük, karar kaydı (`docs/product/glossary.md`, `docs/decisions/`) | `mattpocock-skills:domain-modeling` |
| Modül sınırları, arayüz tasarımı, test edilebilir yapı (`docs/architecture/`) | `mattpocock-skills:codebase-design` |
| Teknoloji karşılaştırma, güncel sürüm/fiyat/doküman araştırması | `mattpocock-skills:research` |
| Bir durum modelini veya akışı denemek (atılacak prototip) | `mattpocock-skills:prototype` |
| Kullanıcının elle yapması gereken kurulum (panel, DNS, anahtar, mağaza hesabı) | `mattpocock-skills:wizard` |

## Tasarım (web ve mobil arayüz)

Önce stil yönü seçilir (`/design`). Her yön bir skill'e eşlenir; önizlemeler ve uygulama o skill'le yapılır. Ürün bağlamı ve tasarım sistemi her zaman Impeccable'da (`PRODUCT.md`, `DESIGN.md`) tutulur.

| Stil yönü (kullanıcıya sunulan seçenek) | Ne zaman iyi | Ana skill |
|---|---|---|
| **Premium / Apple tarzı:** bol boşluk, büyük ve ince tipografi, yumuşak geçişler, pahalı his | Tüketici ürünü, marka algısı önemli, fiyatı yüksek ürün | `taste-skill:high-end-visual-design` |
| **Minimal editoryal:** sıcak monokrom, tipografi odaklı, düz yüzeyler | İçerik, portfolyo, sakin SaaS, güven veren hizmet | `taste-skill:minimalist-ui` |
| **Cesur ve hareketli:** dev tipografi, kaydırmaya bağlı animasyonlar (GSAP), bento ızgaralar | Lansman sayfası, genç kitle, dikkat çekmesi gereken ürün | `taste-skill:gpt-taste` |
| **Endüstriyel / brutalist:** ham ızgara, terminal estetiği, keskin kontrast | Geliştirici aracı, veri yoğun pano, sıra dışı marka | `taste-skill:industrial-brutalist-ui` |
| **İşlevsel ürün arayüzü:** sade, yoğun bilgi, hızlı kullanım | Panel, admin, B2B araç, formlar | `impeccable:impeccable` + `ui-ux-pro-max:ui-styling` (shadcn/ui) |
| **Kendi yönünü bul (anti-generic):** brief'ten yön çıkarır | Hiçbiri tam uymuyorsa | `taste-skill:design-taste-frontend` |

| Tasarım işi | Skill |
|---|---|
| Ürün bağlamını yazmak (`PRODUCT.md`), PRD'den beslenerek | `impeccable:impeccable` → `init` |
| Görsel dünyayı kaydetmek (`DESIGN.md`), seçilen önizlemeden | `impeccable:impeccable` → yeni iş akışı |
| Renk paleti ve yazı tipi çifti adayları, ürün tipine göre | `ui-ux-pro-max:ui-ux-pro-max` |
| Tasarım belirteçleri ve bileşen kuralları | `ui-ux-pro-max:design-system` |
| Ekran/bölüm üretmek | Seçilen yön skill'i + `impeccable:impeccable` |
| Bitmiş ekranı değerlendirmek ve düzeltmek | `impeccable:impeccable` → `critique`, `audit`, `polish` (gerekirse `bolder`/`quieter`/`distill`/`harden`/`adapt`/`animate`) |
| Var olan bir arayüzü yenilemek | `taste-skill:redesign-existing-projects` + `impeccable:impeccable` |
| Logo, marka kimliği | `ui-ux-pro-max:design`, `ui-ux-pro-max:brand` |
| Sosyal medya/reklam görselleri | `ui-ux-pro-max:banner-design` |
| Mobil ekranlar | Seçilen yön skill'i + `impeccable:impeccable` (iOS/Android platform kılavuzu) + `ui-ux-pro-max:ui-ux-pro-max` (React Native) |

## İçerik

| Durum | Skill |
|---|---|
| Kullanıcıya görünen her metin: açılış sayfası, ekran metinleri, e-postalar, mağaza açıklaması, duyurular | Önce yaz, sonra `humanizer:humanizer` ile geçir (AI kokan kalıpları temizler) |

## Bulgu raporları

| Durum | Skill / dosya |
|---|---|
| `/findings-<tür>` (tech, business, security, ux, perf, legal, all) | Yöntem `.claude/findings/protocol.md`, bakış açısı `.claude/findings/lenses/<tür>.md` |
| Business ve legal araştırması | `mattpocock-skills:research` + web araması |
| Teknik ve performans taraması | `ponytail:ponytail-audit` |
| UX taraması | `impeccable:impeccable` → `audit`, `critique` |

## Kod

| Durum | Skill |
|---|---|
| Her kod değişikliği (en küçük tam çözüm, gereksiz soyutlama yok) | `ponytail:ponytail` |
| Kritik akış (auth, ödeme, veri yazma; `docs/quality/test-plan.md` K1-K5) | `mattpocock-skills:tdd` |
| Hata ayıklama | `mattpocock-skills:diagnosing-bugs` |
| Değişiklik incelemesi (`/review-changes`) | `ponytail:ponytail-review` + `code-reviewer` ajanı (+ `security-auditor`) |
| Görev/spec'e uygunluk incelemesi (dal veya PR) | `mattpocock-skills:code-review` |
| Tüm kod tabanı kalite denetimi (`/release ilk`, `/maintain quarterly`) | `ponytail:ponytail-audit` |
| Ertelenen kısa yolların listesi (`/maintain monthly`) | `ponytail:ponytail-debt` |
| PR açıklaması | `mattpocock-skills:pr` |
| CLAUDE.md, komut veya skill düzenlemek (`/retro`) | `mattpocock-skills:writing-for-agents` |
