# MCP ve eklenti kataloğu

> Şablonda hazır gelmeyen, projede o servis seçilirse açılan bağlantılar. `/start` Adım 5'te (dış servisler) bu tabloya bakar ve eşleşen servis için kurulumu önerir.
> Hepsi resmi, satıcının kendi sunucusudur (doğrulama: 2026-10-12). Kimlik doğrulama tarayıcıda (OAuth) veya senin ortam değişkeninle yapılır; anahtar sohbete veya dosyaya yazılmaz.

## Projede hazır gelenler

| Ne | Tip | Not |
|---|---|---|
| Context7 | hepsi | Güncel kütüphane dokümanı |
| Supabase (salt okunur), Sentry | web, mobil · backend'de Sentry | `DEV_REF` /start'ta doldurulur: **geliştirme** projesi, sadece okur. Prod ref'i AI ortamına (.mcp.json, .env.local) yazılmaz; prod'a bakmak gerekirse kullanıcı paneli açar |
| Maestro | mobil | Mobil E2E (`.maestro/*.yaml`). Maestro CLI kurulu olmalı: `curl -fsSL "https://get.maestro.mobile.dev" \| bash` (Windows: WSL veya docs.maestro.dev) |
| Expo | mobil | `expo@expo-plugins` eklentisiyle gelir: EAS build, iş akışları, TestFlight çökme kayıtları. Bağlanmak için `/mcp` → Expo hesabıyla giriş. Simülatör ve ekran görüntüsü için SDK 54+ ve `npx expo install expo-mcp --dev` |

## Gerektiğinde eklenenler (varsayılan kapalı)

Bu sunucular `.mcp.json`'da gelmez; gereken komut kullanıcıya sorup bu makineye ekler (`--scope local`, git'e girmez). İş bitince `/mcp` ile kapatılabilir. Windows'ta `npx` yerine `cmd /c npx` yaz.

| Ne | Kim ister | Kurulum (doğrulama: 2026-10-23) | Not |
|---|---|---|---|
| Playwright MCP | Keşif amaçlı tarayıcı testi, uzun etkileşimli akış | `claude mcp add --scope local playwright -- npx -y @playwright/mcp@0.0.83` | Ekran görüntüsü için `node .claude/hooks/preview.mjs`. Etkileşimli deneme için önce Playwright CLI (her komut sorulur; proje klasöründe depodaki ayar dosyasını okur): `npx -y @playwright/cli@0.1.22 open <url>`, `snapshot`, `console`, `requests`, `screenshot`. CLI sayfa verisini bağlama zorlamaz, daha az token harcar |
| Chrome DevTools MCP | `/findings-perf`, `/findings-ux` | `claude mcp add --scope local chrome-devtools -- npx -y chrome-devtools-mcp@1.10.1` | Performans izi (LCP, CLS, INP), ağ şelalesi, konsol |
| Figma | `/design` (tasarım Figma'daysa) | `claude mcp add --scope local --transport http figma-remote-mcp https://mcp.figma.com/mcp` | OAuth (`/mcp`). Figma'nın resmi plugin'i (~17 skill) bağlam bütçesi yüzünden kullanılmaz |
| rea (CLI, MCP değil) | `/research` (rakip özelliği nasıl çalışıyor), `/adopt` (kaynağı olmayan parça) | Kurulum yok: `npx -y rea-agents@6.2.0 <alt komut>`; alt komutlar `npx -y rea-agents@6.2.0 --help`. Node `^22.19` veya `>=24.11` ister | Sadece kullanıcının sahip olduğu veya incelemeye yetkili olduğu yazılım. Lisans sözleşmesi (EULA) tersine mühendisliği yasaklayabilir; ticari araçlar (IDA, Hopper, JEB) kendi lisansıyla. `setup` çalıştırılmaz (ajan ayarlarını değiştirir). Analiz yereldir; site incelemesi o siteye gerçek istek atar |
| Supabase dev (yazma) | `/build` (dev'de deneme) | `claude mcp add --scope local --transport http supabase-dev "https://mcp.supabase.com/mcp?project_ref=DEV_REF&features=database,docs"` | Sadece **geliştirme** projesi veya branch'i (`DEV_REF`). Prod ref'i asla bu tanıma yazılmaz. Şema değişikliği yine migration dosyasıyla yapılır |

## Servis seçilince açılanlar

| Servis | Kurulum | Kimlik | Dikkat |
|---|---|---|---|
| GitHub | `/plugin install github@claude-plugins-official` | `GITHUB_PERSONAL_ACCESS_TOKEN` ortam değişkeni (ince ayarlı, sadece bu repo) | Geniş yetkili token verme |
| Stripe | `claude mcp add --transport http stripe https://mcp.stripe.com --scope project` | OAuth (`/mcp`) | Önce test modu hesabıyla bağlan |
| Vercel | CLI: `npx -y vercel@63.1.1` (`/release` kullanır). Log ve build durumu için isteğe bağlı MCP: `claude mcp add --transport http vercel https://mcp.vercel.com --scope project` | `vercel login` / OAuth (`/mcp`) | Deploy ve satın alma yapabilir; `--prod`, `promote`, `rollback` her zaman sorulur (kalkan). Resmi plugin (30+ skill) bağlam bütçesi yüzünden kullanılmaz |
| PostHog | `claude mcp add --transport http posthog https://mcp.posthog.com/mcp --scope project` | OAuth (`/mcp`), bölge otomatik | Ürün analitiği ve özellik bayrakları (`docs/operations/feature-flags.md`) |
| Firebase | `/plugin install firebase@claude-plugins-official` | Firebase CLI girişi | Supabase yerine Firebase seçildiyse |
| Linear | `/plugin install linear@claude-plugins-official` | OAuth | Yol haritası Linear'da tutulacaksa |

## Kural

- Her MCP aracının yaptığı işlem senin hesabının yetkisiyle yapılır. Yazma yetkisi olanlarda (Stripe, Vercel, GitHub) kalıcı veya para harcatan işlem kullanıcı onayı olmadan yapılmaz.
- Yeni bir MCP eklemek `teknik` karardır; listede olmayan bir sunucu önerilirse önce `source-research` ile kaynağını ve bakım durumunu doğrula, `.mcp.json`'a sürüm sabitleyerek ekle.
- Kullanılmayan MCP'yi kapat: her araç tanımı her oturumda bağlama yük ekler.
