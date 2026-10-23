# Yeni araçlar ve bağlam yönetimi (Kit 3.10 planı)

**Tarih:** 2026-10-23 · **Soru:** 8 araç (Figma, Chrome DevTools, Playwright, Supabase, Vercel, rea, Understand-Anything, awesome-design-md) kite nasıl eklenir, skill/MCP yükü token harcamadan nasıl yönetilir?

## Bulgular

- **MCP araçları ertelenir.** Tool search varsayılan açık: oturum başında sadece araç adları ve sunucu talimatı yüklenir. Asıl maliyet aracın döndürdüğü çıktıdır (örn. Playwright sayfa ağacı). [1]
- **Skill listesi bağlamın %1'iyle sınırlı.** Taşınca en az kullanılanların açıklaması düşer; Claude o skill'i tanıyamaz. Plugin skill'leri `skillOverrides` ile tek tek kapatılamaz, sadece plugin bütün olarak açılır/kapanır. Gövde çağrılınca yüklenir ve oturum boyu kalır. [2]
- **`disabledMcpjsonServers` hangi ayar dosyasında olursa olsun sunucuyu reddeder;** yerel ayarla geri açılamaz. Bu yüzden varsayılan kapalı MCP'ler `.mcp.json`'da değil katalogda durur, gerekince `--scope local` ile eklenir. [1]
- **Ölçüm (bu makine, 2026-10-23, `get_usage`):** Skills 9.952 token (%1 sınırında, açıklamalar düşmüş: `mattpocock-skills:tdd`, `caveman:*`), MCP tools 20.394 (masaüstü uygulamasının kendi araçları), Memory 3.108. Plugin skill gövdeleri: humanizer ~8k, taste-skill ort. ~6k, impeccable ~3k.
- **Playwright CLI ajanlar için MCP'den az token harcar** (sayfa verisini bağlama zorlamaz). [3]
- **Resmi plugin'ler ağır:** Vercel plugin 30+ skill + 3 ajan + hook; Figma plugin ~17 skill. Supabase resmi plugin'i kitteki `supabase-agent-skills` ile aynı iki skill + MCP. [4]
- **Understand-Anything** SessionStart hook'u graf eskiyse ajana sormadan güncelleme talimatı veriyor ("Do not ask the user for confirmation"); PostToolUse(Bash) hook'u da var. Çıktı dili Türkçe değil (en, zh, zh-TW, ja, ko, ru, vi). MIT. [5]
- **rea:** MIT, MCP + CLI (`rea-agents`), native analiz için Ghidra/Hopper/IDA. `setup` ajan ayarlarını değiştirir; README `@latest` öneriyor (kit sürüm sabitler). [6]
- **three.js:** MIT, r186 (2026-09-24). Resmi ajan skill'i yok; `CloudAI-X/threejs-skills` (MIT, topluluk) 13 skill, her biri ~6k token, plugin değil. [8]
- **GSAP:** Webflow sonrası tüm plugin'ler dahil ücretsiz, ticari kullanım dahil (README). "Standard no-charge license" sayfası kısıtları açıkça yazmıyor; Terms of Use doğrulanacak. Resmi `greensock/gsap-skills` (MIT): Claude plugin'i, 8 skill, gövde toplamı ~23k token. [9]
- **awesome-design-md:** 84 marka DESIGN.md, her biri ~24 KB (~6k token), MIT, plugin değil. [7]

## Kararlar (kullanıcı, 2026-10-23)

| # | Konu | Soru | Seçilen | Kapı |
|---|---|---|---|---|
| 1 | teknik | 8 aracın yeri ve biçimi | Önerilen tablo: Figma MCP katalog, DevTools ve Playwright MCP kapalı + Playwright CLI, Supabase migration, Vercel CLI, rea CLI, UA plugin kapalı, awesome-design-md tek dosya | çift |
| 2 | teknik | Bağlam yönetimi modeli | Çekirdek + paket + komut tetikler | çift |
| 3 | teknik | Çekirdek kapsamı | Orta: kit hook'ları, caveman, ponytail, security-guidance, mattpocock-skills, hookify, claude-md-management, impeccable, humanizer | çift |
| 4 | teknik | mattpocock-skills | Çekirdekte kalır | çift |
| 5 | teknik | Kapalı paket nasıl açılır | Komut sorar → `settings.local.json` + `/reload-plugins`, tercihen faz sınırında | çift |
| 6 | maliyet | humanizer ne zaman | Bugünkü gibi: her kullanıcı metninde, ana bağlamda | çift |
| 7 | veri | Supabase yazma | Şema her zaman CLI migration; MCP prod'da salt-okunur, yazma sadece dev branch/yerel | tek (etki) |
| 8 | teknik | Yönetim komutu adı | `/tools` | çift |
| 9 | teknik | GSAP skill'leri | Resmi `gsap-skills` plugin'i, `tasarim` paketinde (varsayılan kapalı) | çift |
| 11 | guvenlik | Kalkan atlatma bulguları (3. tur) | Şüpheliyse sor: gizleme işareti + korunan kelime → "ask"; kabuk ayrıştırıcı eklenmez | çift |
| 10 | teknik | three.js rehberi | `/start`'ta 3D gerekirse `CloudAI-X/threejs-skills`'ten 3 skill (fundamentals, performance, react-three-fiber) sabit sürümle kopyalanır; gerisi Context7 | çift |

Karar 7: kit reposunda kurul kurulmadığı için `board-architect` ve `security-auditor` rolüyle tek model değerlendirildi; ikisi de seçilen seçeneği önerdi.

## Kaynaklar

1. https://code.claude.com/docs/en/mcp (erişim 2026-10-23)
2. https://code.claude.com/docs/en/skills (erişim 2026-10-23)
3. https://github.com/microsoft/playwright-cli README (son push 2026-10-19)
4. https://github.com/anthropics/claude-plugins-official `.claude-plugin/marketplace.json`; vercel/vercel-plugin, figma/mcp-server-guide, supabase-community/supabase-plugin ağaçları (2026-10-23)
5. https://github.com/Egonex-AI/Understand-Anything README ve `understand-anything-plugin/hooks/hooks.json` (son push 2026-10-22)
6. https://github.com/morluto/rea README (son push 2026-10-23)
7. https://github.com/voltagent/awesome-design-md README ve `design-md/` (son push 2026-10-14)
8. https://github.com/mrdoob/three.js (r186), https://github.com/CloudAI-X/threejs-skills (son push 2026-10-19)
9. https://github.com/greensock/GSAP README, https://gsap.com/standard-license, https://github.com/greensock/gsap-skills (son push 2026-07-29)

## Onaylı plan (2026-10-23)

Sıra A → B → C+D; her biri ayrı commit ve sürüm (3.10.0, 3.11.0, 3.12.0), aralarda `/clear`.

**Paketler:** çekirdek = kit hook'ları, caveman, ponytail, security-guidance, mattpocock-skills, hookify, claude-md-management, impeccable, humanizer. `tasarim` = taste-skill, ui-ux-pro-max, gsap-skills, Figma MCP (katalog). `guvenlik` = trailofbits 7'li, claude-security. `yayin` = understand-anything, session-report. `video` = remotion. `tarayici` = Playwright MCP, Chrome DevTools MCP (katalog, `--scope local`). Stack plugin'leri tipe göre (değişmez).

**A — Bağlam yönetimi (3.10.0)**
1. Spike: `settings.local.json` → `enabledPlugins: true`, projedeki `false`'u eziyor mu (doküman + deneme). Ezmiyorsa yedek: `/plugin` ile kişisel aç/kapat.
2. Testler önce, kırmızı (`kit/tests/tools.test.mjs`): paket aç/kapat `settings.local.json`'ı birleştirir ve diğer anahtarları korur; bilinmeyen paket hata; `--gerekli` çıktısı ve çıkış kodu; `settings.json`'da çekirdek `true`, paket `false`; bozuk `settings.local.json` ezilmez; paket adı dışında argüman kabul edilmez.
3. `.claude/hooks/tools.mjs` (durum, `--ac`, `--kapat`, `--gerekli <paket>`, `--olc`; `plugins-sync.mjs` → `eksikler` kullanır) + `.claude/commands/tools.md`.
4. `.claude/settings.json`: paket plugin'leri `false`, UA ve gsap-skills pazarları, `Bash(node .claude/hooks/tools.mjs:*)` izni. `kit/tests/skills.test.mjs`: claude-security artık `false`.
5. `maintain.md` (aylık: `/context`, `/doctor`, `/skill-doctor`, `tools.mjs --olc`), `skills.md` paket bölümü, `CLAUDE.md` tek satır `/tools`, `start.md` / `kit-update.md` / `handoff.md` paket notu.
6. Testler yeşil, `--olc` ile K1 kanıtı (çekirdek açıklama yükü bugünden ≥%40 düşük).

**B — Mevcut araçlar (3.11.0, yayında):** `tarayici` paketi yerine katalogdaki "Gerektiğinde eklenenler" bölümü kullanıldı: MCP'ler `--scope local` ile eklenir, çünkü `disabledMcpjsonServers` yerel ayarla geri açılamaz. Sürümler (14 günden eski en yeni): @playwright/cli 0.1.22, vercel 63.1.1, supabase 2.120.0. Planın ilk hali: Playwright CLI (sürüm sabit) + web `.mcp.json`'dan Playwright/DevTools çıkar → katalog; DevTools `/findings-perf`/`ux`, Figma `/design`; Supabase migration kuralı (stack.md, build.md) + dev MCP tanımı (katalog); Vercel CLI akışı `/release` + destructive-guard `vercel … --prod` sor (test).

**C — Yeni araçlar ve dokümanlar (3.12.0, yayında):** Sürümler: rea-agents 6.2.0 (14 günden eski en yeni; kurulum betiği yok), awesome-design-md `3b605329`, threejs-skills `0e181866` (dosyalar okundu). GSAP lisansı arşivlenmiş standart lisanstan doğrulandı (canlı sayfa 2026-10-23'te çevrimdışıydı): ticari dahil ücretsiz, yasak = Webflow'a rakip kodsuz animasyon aracı. Ek: `.ua/**` yapı haritasına. Planın ilk hali: rea (`/research`, `/adopt`, hukuki uyarı, sabit sürüm npx); Understand-Anything (`/release`, `/handoff`, `/adopt`; `--auto-update` yok, token uyarısı); awesome-design-md (`/design`, tek dosya sabit commit, Impeccable ile damıt, marka taklidi yok); README, `kit/guide.html` (+artifact), `dashboard.html`, CHANGELOG, VERSION.

**D — three.js ve GSAP (C ile):** gsap-skills `tasarim` paketinde `false`, `/design` "Cesur ve hareketli" açmayı sorar; `/start` 3b: 3D gerekiyorsa threejs-skills'ten 3 skill sabit sürümle kopyala (önce SKILL.md oku); `ui-motion` three.js/R3F satırı + 3D kuralları (tembel yükleme, reduced-motion, WebGL yoksa statik görsel, mobil GPU, dispose); perf/ux lens'lerine WebGL ve GSAP kontrolleri; GSAP lisansı Terms of Use'tan doğrulanır.
