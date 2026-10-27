# Skill Yönlendirme

> Hangi işte hangi skill kullanılır? Skill'i Skill aracıyla yükle, talimatlarını uygula.
> Bu proje `.claude/settings.json` içinde aşağıdaki plugin'leri tanımlar; Claude Code projeyi açınca kurmayı önerir. Çekirdek dışındakiler paket olarak kapalı gelir (aşağıda "Bağlam paketleri").
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
| gsap-skills (GreenSock, resmi) | gsap-skills | `gsap-skills:` (`tasarim` paketi) |
| understand-anything | understand-anything | `/understand --language en`, `/understand-dashboard`, `/understand-onboard` (`yayin` paketi; `--auto-update` kullanılmaz). Açıkken oturum başı hook'u graf eskiyse sormadan günceller ve token harcar: iş bitince `/tools` ile paketi kapat |
| security-guidance, claude-security, hookify, claude-md-management, session-report | claude-plugins-official (Anthropic) | otomatik hook / `/claude-security`, `/hookify`, `/revise-claude-md`, `/session-report` |
| typescript-lsp (web, mobil) · pyright-lsp (backend) | claude-plugins-official | Dil sunucusu: tip hatası ve tanıma gitme. `npm i -g typescript-language-server typescript` veya `npm i -g pyright` gerekir |
| supabase, postgres-best-practices | supabase-agent-skills | `supabase:`, `postgres-best-practices:` (web, mobil; backend'de sadece postgres) |
| web-quality-skills | addy-web-quality-skills | Core Web Vitals, erişilebilirlik, SEO (web) |
| expo | expo-plugins | Expo build, yükseltme, dağıtım + Expo MCP (mobil) |

**Vercel skill'leri** (`react-best-practices`, `composition-patterns` web'de; `react-native-guidelines` mobilde) plugin değildir. `/start` stack kararından sonra projeye kopyalar:
`npx -y skills@1.7.2 add vercel-labs/agent-skills --skill react-best-practices --skill composition-patterns -a claude-code -y --copy`

**three.js skill'leri** (`threejs-fundamentals`, `threejs-performance`, React'te `threejs-react-three-fiber`; `CloudAI-X/threejs-skills`, MIT) plugin değildir. Sadece 3D seçilirse `/start` 3c sabit commit'ten kopyalar. Her biri ~6k token, çağrılınca yüklenir.

## Kitin kendi skill'leri (`.claude/skills/`)

| Skill | Ne zaman |
|---|---|
| `source-research` | Değişebilen her bilgi (sürüm, fiyat, kota, mevzuat, rakip); teknoloji seçimi; business ve legal raporları |
| `logo-design` | Logo, ikon, favicon, marka paketi (SVG, API gerektirmez) |
| `ui-motion` | Uygulama içi animasyon ve geçişler |
| `motion-video` | Tanıtım videosu, açılış sayfası döngüsü (renderAt(t) + Playwright + ffmpeg) |

## Araçlar (MCP)

| Araç | Ne için | Not |
|---|---|---|
| **Context7** | Kütüphanelerin güncel ve sürüme özel dokümanı | Her tipte açık, ücretsiz |
| **Playwright CLI** | Arayüz kanıtı, konsol, ağ, ekran görüntüsü (`npx -y @playwright/cli@0.1.22`) | Web'de; MCP'den az token. Kabul testleri yine `npx playwright test` |
| **Chrome DevTools**, **Playwright** MCP | Performans izi; keşif amaçlı uzun tarayıcı akışı | Varsayılan kapalı; komut sorup ekler (katalog) |
| **Vercel CLI** | Önizleme ve prod deploy (`npx -y vercel@63.1.1`) | `/release`; `--prod`, `promote`, `rollback` sorulur |
| **Sentry**, **Supabase** | Hata kayıtları, veritabanı uyarıları (salt-okunur) | `/maintain` |
| **Firecrawl** | Site tarama | İsteğe bağlı, API anahtarı gerekir; `source-research` §5 |
| **Maestro**, **Expo** | Mobil E2E testi, EAS build, çökme kayıtları | Mobilde |
| GitHub, Stripe, Vercel, PostHog, Figma… | Servis seçilince | Katalog: `docs/workflow/mcp-catalog.md` |

## Bağlam paketleri

Açık her plugin'in skill açıklamaları her oturumda bağlama yüklenir. Skill listesi bağlamın %1'iyle sınırlıdır; taşınca az kullanılan skill'lerin açıklaması düşer ve Claude onları tanımaz. Plugin içindeki skill'ler tek tek kapatılamaz. Bu yüzden eklentiler **çekirdek** ve **paket** olarak ayrılır. Paketler `.claude/settings.json`'da kapalı gelir; ilgili komut ilk adımda `node .claude/hooks/tools.mjs --required <paket>` ile bakar, kapalıysa maliyetiyle birlikte açmayı sorar. Açma sadece bu makineyi etkiler (`.claude/settings.local.json`). Yönetim: `/tools`. Tanımlar: `.claude/hooks/tools.mjs` → `PACKAGES`.

| Paket | Eklentiler | Açan komut |
|---|---|---|
| Çekirdek (hep açık) | caveman, ponytail, mattpocock-skills, impeccable, humanizer, security-guidance, hookify, claude-md-management + stack eklentileri | - |
| `tasarim` | taste-skill, ui-ux-pro-max, gsap-skills | `/design` |
| `guvenlik` | Trail of Bits (7), claude-security | `/findings-security`, `/findings-all`, `/release first` |
| `yayin` | understand-anything, session-report | `/release`, `/handoff`, `/adopt` |
| `video` | remotion | `motion-video` |

- Paketi oturum ortasında açmak prompt önbelleğini bozar ve bütün bağlam yeniden okunur. En ucuzu faz sınırında, `/clear` ile birlikte açmaktır.
- Kesin ölçüm: `/context` (Skills satırı), `/doctor`; kullanılmayan skill'ler: `/skill-doctor`. Kaba ölçüm: `/tools olc`. `/maintain monthly` bunu kontrol eder.
- Bir eklentiyi çekirdeğe almak veya paketten çıkarmak `teknik` karardır.

**Komut listesi (Hafif/Tam):** Kitin komut açıklamaları da aynı listeye girer (~1.600 token). Hafif ve Standart profilde çekirdek dışı 20 komut `skillOverrides` → `name-only` ile sadece adıyla listelenir: `/` menüsünde durur, Claude adıyla çağırabilir, açıklaması bağlama girmez. Açıklamasıyla kalan çekirdek: start, adopt, build, fix-bug, plan-task, design, tools, review-changes, wrap-up, release. Tam profil: `node .claude/hooks/tools.mjs --commands full`; geri dönmek: `--commands light`. Ayar `.claude/settings.json`'dadır (ekip geneli); kendi `skillOverrides` değerlerin korunur. Codex ve Antigravity'de etkisi yoktur. Liste: `.claude/hooks/tools.mjs` → `CORE_COMMANDS`, `LIGHT_COMMANDS`.

## Skill bütçesi

- Backend projelerinde arayüz tasarım plugin'leri (impeccable dahil) kapalı gelir (`kit/templates/backend/.claude/settings.merge.json`).
- Stack'e özel skill'ler (Supabase, Expo, web kalitesi, LSP) sadece ilgili proje tipinde açılır.
- security-guidance'ın tur sonu incelemesi kapalı gelir (`ENABLE_STOP_REVIEW=0`, kota). Düzenleme anındaki kalıp taraması (ücretsiz) ve commit incelemesi açıktır. Kota rahatsa `.claude/settings.json` → `env`'den açılabilir.
- Yeni bir plugin eklemek `teknik` karardır: aynı işi yapan bir skill zaten var mı, kaynak güvenilir mi, bağlam maliyeti nedir? Üçüncü taraf skill'ler bir saldırı yüzeyidir: kurmadan önce SKILL.md içeriğini oku.

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
| Derin güvenlik taraması (`/findings-security`) | `/claude-security` (Anthropic, çok ajanlı, bulgular doğrulanmış) |
| Güvenlik derinliği | Trail of Bits: `differential-review`, `insecure-defaults`, `sharp-edges`, `static-analysis`, `supply-chain-risk-auditor`, `agentic-actions-auditor`, `fp-check` |
| Business ve legal araştırması | `source-research` + web araması |
| Teknik ve performans taraması | `ponytail:ponytail-audit` |
| UX taraması | `impeccable:impeccable` → `audit`, `critique` |

## Kod

| Durum | Skill |
|---|---|
| Her kod değişikliği (en küçük tam çözüm, gereksiz soyutlama yok) | `ponytail:ponytail` |
| Kritik akış (auth, ödeme, veri yazma; `docs/quality/test-plan.md` K1-K5) | `mattpocock-skills:tdd` (kırmızı testi `test-writer` ajanı yazar, yeşile kod tarafı çevirir) |
| Bozulan projeyi son çalışan hale döndürmek | `/rollback` (`checkpoint.mjs`) |
| Yeni başlayan kullanıcıya her adımı anlatmak | Anlatıcı mod: `.claude/output-styles/anlatici.md` (`outputStyle: anlatici`) |
| Hata ayıklama (`/fix-bug`) | `mattpocock-skills:diagnosing-bugs` + `/freeze <klasör>` |
| Değişiklik incelemesi (`/review-changes`) | `ponytail:ponytail-review` + `code-reviewer` ajanı (+ `security-auditor`) |
| Görev/spec'e uygunluk incelemesi (dal veya PR) | `mattpocock-skills:code-review` |
| Tüm kod tabanı kalite denetimi (`/release ilk`, `/maintain quarterly`) | `ponytail:ponytail-audit` |
| Ertelenen kısa yolların listesi (`/maintain monthly`) | `ponytail:ponytail-debt` |
| PR açıklaması | `mattpocock-skills:pr` |
| CLAUDE.md, komut veya skill düzenlemek (`/retro`) | `mattpocock-skills:writing-for-agents` |
| CLAUDE.md denetimi, oturum dersleri (`/retro`, `/wrap-up`) | `claude-md-management`: `claude-md-improver`, `/revise-claude-md` |
| "Bunu bir daha yapma" → kalıcı kural | `/hookify <kural>` (`.claude/hookify.*.local.md`) |
| React/Next performans (web) · React Native (mobil) | `react-best-practices`, `composition-patterns` · `react-native-guidelines` (Vercel) |
| Veritabanı şeması, sorgu, indeks | `postgres-best-practices:*`, `supabase:*` |
| Token ve maliyet ayrıntısı | `/session-report` (HTML), pano için `node .claude/hooks/cost.mjs` |
