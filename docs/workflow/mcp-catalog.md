# MCP ve eklenti kataloğu

> Şablonda hazır gelmeyen, projede o servis seçilirse açılan bağlantılar. `/start` Adım 5'te (dış servisler) bu tabloya bakar ve eşleşen servis için kurulumu önerir.
> Hepsi resmi, satıcının kendi sunucusudur (doğrulama: 2026-10-12). Kimlik doğrulama tarayıcıda (OAuth) veya senin ortam değişkeninle yapılır; anahtar sohbete veya dosyaya yazılmaz.

## Projede hazır gelenler

| Ne | Tip | Not |
|---|---|---|
| Context7 | hepsi | Güncel kütüphane dokümanı |
| Playwright, Chrome DevTools | web | Tarayıcı testi, performans izi |
| Supabase (salt okunur), Sentry | web, mobil · backend'de Sentry | `PROJE_REF` /start'ta doldurulur |
| Maestro | mobil | Mobil E2E (`.maestro/*.yaml`). Maestro CLI kurulu olmalı: `curl -fsSL "https://get.maestro.mobile.dev" \| bash` (Windows: WSL veya docs.maestro.dev) |
| Expo | mobil | `expo@expo-plugins` eklentisiyle gelir: EAS build, iş akışları, TestFlight çökme kayıtları. Bağlanmak için `/mcp` → Expo hesabıyla giriş. Simülatör ve ekran görüntüsü için SDK 54+ ve `npx expo install expo-mcp --dev` |

## Servis seçilince açılanlar

| Servis | Kurulum | Kimlik | Dikkat |
|---|---|---|---|
| GitHub | `/plugin install github@claude-plugins-official` | `GITHUB_PERSONAL_ACCESS_TOKEN` ortam değişkeni (ince ayarlı, sadece bu repo) | Geniş yetkili token verme |
| Stripe | `claude mcp add --transport http stripe https://mcp.stripe.com --scope project` | OAuth (`/mcp`) | Önce test modu hesabıyla bağlan |
| Vercel | `claude mcp add --transport http vercel https://mcp.vercel.com --scope project` | OAuth (`/mcp`) | Deploy ve satın alma yapabilir; prod deploy her zaman onayla |
| PostHog | `claude mcp add --transport http posthog https://mcp.posthog.com/mcp --scope project` | OAuth (`/mcp`), bölge otomatik | Ürün analitiği ve özellik bayrakları (`docs/operations/feature-flags.md`) |
| Figma | `claude mcp add --transport http figma-remote-mcp https://mcp.figma.com/mcp --scope project` | OAuth (`/mcp`) | Sadece tasarım Figma'da yapılıyorsa |
| Firebase | `/plugin install firebase@claude-plugins-official` | Firebase CLI girişi | Supabase yerine Firebase seçildiyse |
| Linear | `/plugin install linear@claude-plugins-official` | OAuth | Yol haritası Linear'da tutulacaksa |

## Kural

- Her MCP aracının yaptığı işlem senin hesabının yetkisiyle yapılır. Yazma yetkisi olanlarda (Stripe, Vercel, GitHub) kalıcı veya para harcatan işlem kullanıcı onayı olmadan yapılmaz.
- Yeni bir MCP eklemek `teknik` karardır; listede olmayan bir sunucu önerilirse önce `source-research` ile kaynağını ve bakım durumunu doğrula, `.mcp.json`'a sürüm sabitleyerek ekle.
- Kullanılmayan MCP'yi kapat: her araç tanımı her oturumda bağlama yük ekler.
