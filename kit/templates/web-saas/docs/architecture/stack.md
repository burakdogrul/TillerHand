# Stack: Web Uygulaması / SaaS

> Bu dosya her oturumda AI'ya yüklenir. Projede farklı bir seçim yaptıysan burayı güncelle
> ve nedenini `docs/decisions/log.md`'ye yaz.

## Karar noktaları

`/start` bu kararları sırayla sorar (`docs/workflow/decision-protocol.md`). Her kararda bu projeye en uygun 2-4 seçeneği sun; **önerilen** etiketi varsayılandır, ama PRD'ye göre başka seçenek daha uygunsa onu öner ve nedenini söyle. Fiyat, ücretsiz katman ve kısıt gibi değişebilen iddiaların yanında `(kaynak: <adres>, YYYY-AA-GG)` notu varsa ve 90 günden yeniyse yeniden araştırılmaz.

| # | Karar | Seçenekler (ne zaman daha iyi) |
|---|---|---|
| 1 | Framework | **Next.js** (önerilen: SEO + panel + API tek projede, AI'nın en iyi bildiği ekosistem) · Astro (içerik/açılış sayfası ağırlıklı, en hızlı sayfa) · SvelteKit (daha az kod, hızlı; ekosistem küçük) · React + Vite SPA (sadece giriş arkasında uygulama, SEO gereksiz, en basit barındırma) |
| 2 | Dil | **TypeScript** (önerilen: AI hatalarını derleme anında yakalar) · JavaScript (sadece çok küçük prototip) |
| 3 | Veritabanı + kimlik | **Supabase** (önerilen: Postgres + Auth + Storage + RLS tek yerde; ücretsiz katman 2 aktif proje, proje başı 500 MB veritabanı, 1 hafta hareketsiz kalan proje duraklatılır (kaynak: https://supabase.com/pricing, 2026-10-26)) · Neon + Better Auth (daha fazla kontrol, sağlayıcı bağımlılığı az) · Firebase (gerçek zamanlı, NoSQL, mobil ile ortak backend) · Clerk + Postgres (hazır, şık kimlik arayüzü; ilk 50.000 aylık geri dönen kullanıcı ücretsiz, sonrası kullanıcı başı ücret (kaynak: https://clerk.com/billing, 2026-10-26)) |
| 4 | Veri erişimi | **Supabase client + RLS** (Supabase seçildiyse) · Drizzle ORM (tip güvenli SQL, sağlayıcıdan bağımsız) · Prisma (olgun, şema odaklı; daha ağır) |
| 5 | UI bileşenleri | **shadcn/ui + Tailwind** (önerilen: kod projede, tamamen özelleştirilebilir, tasarım skill'leriyle uyumlu) · Tailwind + kendi bileşenleri (tam özgün tasarım) · Mantine (hazır zengin bileşenler, panel ağırlıklı) |
| 6 | Ödeme | Yok (ilk sürümde ücretsiz) · **iyzico** (TR kartları, taksit, TL) · Stripe (yurt dışı müşteri; TR şirketiyle kısıtlı olabilir: Türkiye desteklenen ülke listesinde görünmüyor (kaynak: https://stripe.com/global, 2026-10-26)) · Paddle / Lemon Squeezy (merchant of record: vergi ve fatura onlarda; yurt dışına abonelik satışı) |
| 7 | Barındırma | **Vercel** (önerilen Next.js için: sıfır ayar, önizleme ortamları) · Cloudflare (ucuz ve hızlı, Workers kısıtları var) · Netlify · Kendi sunucun + Coolify (sabit maliyet, bakım sende) |
| 8 | E-posta | **Resend** (önerilen: geliştirici dostu, React e-posta şablonları) · Postmark (teslim oranı çok yüksek) · Amazon SES (en ucuz, kurulumu zor) |
| 9 | Analitik | **Plausible** (çerezsiz, KVKK dostu; ücretsiz plan yok, aylık 9 dolardan başlar, 30 gün deneme (kaynak: https://plausible.io/docs/billing, 2026-10-26)) · PostHog (ürün analitiği, huniler, özellik bayrakları) · Umami (kendin barındır, ücretsiz) · Yok |
| 10 | Hata takibi | **Sentry** (önerilen) · Highlight / Better Stack |
| 11 | Dil desteği | **Sadece Türkçe** (önerilen MVP için) · Türkçe + İngilizce (next-intl; baştan kurmak sonradan eklemekten ucuzdur) |
| 12 | Test | **Vitest + Playwright** (önerilen) · Sadece Playwright (az mantık, çok arayüz) |

## Seçilen teknolojiler

> `/start` Adım 4'te karar noktalarına göre doldurulur. Aşağıdaki tablo **önerilen** yığındır ve onaylanana kadar öneri sayılır.
> Seçim farklıysa bu dosyanın komut, klasör, kural, doğrulama ve kontrol bölümleri seçime göre yeniden yazılır.

| Katman | Seçim | Not |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript (strict) | |
| UI | Tailwind CSS + shadcn/ui | Yeni bileşen yazmadan önce shadcn'de var mı bak |
| DB + Auth + Depolama | Supabase (Postgres) | Alternatif: Neon + Auth.js |
| ORM / sorgu | Supabase client veya Drizzle | Projede hangisi varsa sadece o |
| Doğrulama | Zod | Hem form hem sunucu |
| Ödeme | Stripe / iyzico / Paddle | TR şirketiyle Stripe sınırlı olabilir, kontrol et |
| E-posta | Resend | Alan adı doğrulaması şart |
| Hosting | Vercel | |
| Hata takibi | Sentry | |
| Analitik | Plausible / PostHog | Çerez onayına dikkat |
| Test | Vitest (birim), Playwright (e2e) | |

## Komutlar

```bash
npm run dev            # geliştirme
npm run build          # prod derleme (deploy öncesi mutlaka)
npm run lint
npx tsc --noEmit       # tip kontrolü
npm run test           # vitest
npx playwright test    # e2e
npx supabase migration new [ad]   # yeni migration
```

## Klasör yapısı

Özellik bazlı yapı ve kurallar: `docs/architecture/structure.md`. Harita: `.claude/structure.json` (dışına yazım sorulur, CI denetler).
```
src/
├── app/                        # SADECE rotalar: page, layout, loading, error, route handler. İş mantığı yok.
│   ├── (marketing)/            # açılış, fiyat, blog
│   ├── (auth)/                 # giriş, kayıt, şifre sıfırlama
│   ├── (app)/                  # giriş gerektiren uygulama
│   └── api/                    # webhook ve dış API uçları
├── features/
│   └── <özellik>/              # örn. invoice/
│       ├── components/         # sadece bu özelliğin bileşenleri
│       ├── hooks/              # istemci hook'ları
│       ├── server/             # server actions, sorgular, servisler (sunucuda çalışır)
│       ├── lib/                # özelliğe özel yardımcılar
│       ├── __tests__/          # birim ve entegrasyon testleri
│       ├── schemas.ts          # Zod şemaları
│       ├── types.ts
│       └── index.ts            # özelliğin dışa açtığı tek kapı
├── components/
│   └── ui/                     # shadcn/ui ve paylaşılan sunum bileşenleri
├── hooks/                      # birden fazla özelliğin kullandığı hook'lar
├── lib/                        # altyapı istemcileri: supabase/, stripe/, email/, sentry
├── config/                     # ortam değişkeni doğrulama (env.ts), sabitler
├── styles/                     # global stiller, tasarım belirteçleri (DESIGN.md'den)
├── types/                      # global tipler
└── middleware.ts
public/                         # statik dosyalar
tests/
├── e2e/                        # Playwright kabul testleri (Ö-01.1 ...)
└── live/                       # canlı izleme testleri (veri silmeyen)
supabase/migrations/            # veritabanı değişiklikleri SADECE burada
```

## Kodlama kuralları

- Varsayılan **Server Component**. `"use client"` sadece etkileşim gerekiyorsa ve en alttaki bileşende.
- Veri yazma: Server Action veya route handler. Her birinde: Zod doğrulama → oturum kontrolü → yetki kontrolü → işlem.
- `NEXT_PUBLIC_` ön ekli değişkenler tarayıcıya gider. Sır asla `NEXT_PUBLIC_` olmaz.
- Supabase gizli anahtarı (`SUPABASE_SECRET_KEY`, `sb_secret_…`; eski adı `service_role`) sadece sunucuda ve sadece gerçekten gerekiyorsa (RLS'i atlar).
- DB şema değişikliği sadece migration dosyasıyla (`npx supabase migration new [ad]`). Panelden veya MCP'den elle DDL yok; `supabase-dev` MCP'si dev'de veri denemek içindir.
- Her yeni tabloda RLS açık, politikası yazılı ve tablo `tests/security/rls.mjs` → `TABLES` listesinde (CI'daki `rls` işi kayıtsız tabloda kırmızı olur).
- Her sayfada `loading.tsx` / boş durum / `error.tsx` düşün.
- Görseller `next/image`, linkler `next/link`.
- Metinler Türkçe; tarih/para `Intl` ile `tr-TR`.
- UI işinden önce `DESIGN.md` ve `docs/design/design-guide.md`'yi oku; belirteçlerin ve kuralların dışına çıkma. Yeni tasarım kararı gerekiyorsa `/design`.

## Doğrulama (görev bitmeden kanıt)

- Arayüz: `node .claude/hooks/preview.mjs <görev kodu>` masaüstü (1440) ve mobil (390) ekran görüntüsünü alır (`AGENTS.md` → `geliştirme:` ve `önizleme:` satırları). Senaryoları denemek için `npm run dev` açıkken Playwright CLI (`npx -y @playwright/cli@0.1.22 open http://localhost:3000`, sonra `snapshot`, `console`, `screenshot`) veya Claude'un tarayıcısı ile sayfayı aç, ana senaryoyu ve bir hata senaryosunu dene.
- Kabul kriterlerini tarayıcıda kanıtlamak: `/qa` (kriter başına Playwright testi, rapor `docs/quality/qa/`).
- Yetki: ikinci bir test kullanıcısıyla birinci kullanıcının kaydına erişmeyi dene; erişememeli.
- Konsolda hata/uyarı yok.

## Otomatik kontroller

| Katman | Ne yapar | Kurulum |
|---|---|---|
| Claude hook'ları | Sır yazımını engeller; düzenlenen dosyayı Prettier ile biçimlendirir | Hazır (`.claude/settings.json`). Prettier projede kurulu olmalı |
| Pre-commit | lint-staged (ESLint + Prettier) + sır taraması | `npm i -D husky lint-staged prettier` → `npm pkg set scripts.prepare="husky"` → `npx husky` |
| CI (+ Semgrep, kopya kod, karmaşıklık bütçesi) | Lint, tip, test, build, açık taraması, gitleaks, değişen dosyalarda karmaşıklık bütçesi (fonksiyon karmaşıklığı 15, fonksiyon 80, dosya 400 satır; `node .claude/hooks/budget.mjs --check`) | `.github/workflows/ci.yml` hazır. GitHub > Settings > Variables'a `NEXT_PUBLIC_*` değerlerini ekle |
| Dependabot | Haftalık küçük güncellemeler tek PR'da | `.github/dependabot.yml` hazır |
| MCP | Supabase (salt-okunur), Sentry, Context7 · gerektiğinde: Playwright, Chrome DevTools, Supabase dev (`docs/workflow/mcp-catalog.md`) | `.mcp.json`: `DEV_REF`'i doldur (salt-okunur, **geliştirme** projesi; prod ref'i AI ortamına yazılmaz). Yazma yetkili Supabase MCP sadece **geliştirme** projesine (`supabase-dev`) |

## Kabul testleri ve özellik bayrakları

**Kabul testleri** (`docs/quality/test-plan.md` §1a): Test adı kriter kimliğini taşır (`test('Ö-01.1 ...')`). Pano JUnit raporunu okur:

```bash
PLAYWRIGHT_JUNIT_OUTPUT_NAME=test-results/junit.xml npx playwright test --reporter=list,junit
npx vitest run --reporter=default --reporter=junit --outputFile.junit=test-results/junit-unit.xml
```

**Özellik bayrakları** (`docs/operations/feature-flags.md`): Acil kapatma deploy gerektirmemeli. Bu yüzden ortam değişkeni değil, çalışma anında okunan bir kaynak kullanılır:
- PostHog seçildiyse PostHog feature flags; değilse
- Supabase'de `feature_flags` tablosu (`ad`, `acik`, `yuzde`) + sunucuda 60 sn önbellek. Okuma tek bir yardımcıdan yapılır: `lib/bayrak.ts` → `bayrakAcik('ad', kullanici)`.
- Bayrak kontrolü sunucuda yapılır; istemci sadece sonucu görür.

## Sık yapılan AI hataları (bunlara dikkat)

- Koda, teste veya ayara bu makineye özel mutlak yol yazmak (`C:\Users\<ad>\…`, `/home/<ad>/…`, proje klasörünün tam yolu): başka makinede çalışmaz. Yolu `import.meta.url` / `__dirname`, `path.join(process.cwd(), …)` veya `os.tmpdir()` ile türet. Deterministik kapı bunu yakalar.
- Client component içinde Supabase admin istemcisi veya sır kullanmak.
- Sayfayı middleware ile koruyup server action'ı korumasız bırakmak.
- RLS'i "çalışmıyor" diye kapatmak.
- Eski Pages Router kalıplarını (`getServerSideProps`) App Router'a karıştırmak.
- Webhook'ta imza doğrulamamak; webhook'u iki kez gelince iki kez işlemek (idempotency).

## Güvenlik (ek)

- [ ] Tüm tablolarda RLS açık ve her tablo saldırgan testinde: `tests/security/rls.mjs` (CI `rls` işi yeşil). Yerelde: `npx -y supabase@2.120.0 start`, sonra dosyanın başındaki komutlar.
- [ ] Başka kullanıcı ve anonim, kullanıcının satırını okuyamıyor, değiştiremiyor, silemiyor (aynı test).
- [ ] Güvenlik başlıkları (CSP, X-Frame-Options vb.) `next.config` veya middleware'de.
- [ ] Auth uçlarında rate limit (Supabase ayarları + gerekiyorsa Upstash).

## Canlıya alma (ek)

- [ ] Vercel prod ortam değişkenleri girildi (Preview ve Production ayrı)
- [ ] Supabase prod projesi ayrı; Auth → URL Configuration'da prod alan adı ve redirect URL'leri
- [ ] Supabase e-posta şablonları Türkçe ve özel SMTP (varsayılan SMTP'nin limiti çok düşük)
- [ ] Ödeme: canlı anahtarlar, canlı webhook uç noktası ve imza sırrı
- [ ] SEO: `metadata` (title, description), Open Graph görseli, `sitemap.ts`, `robots.ts`, favicon
- [ ] Lighthouse (mobil): Performans ≥ 90, Erişilebilirlik ≥ 90, SEO ≥ 90
- [ ] Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms
- [ ] `not-found.tsx` ve `error.tsx` özelleştirildi
- [ ] Alan adı + `www` yönlendirme + SSL (Vercel otomatik)
- [ ] Sentry kaynak haritaları (source map) yükleniyor

## Bakım (ek)

- Haftalık: Vercel kullanım (bandwidth, function süresi), Supabase kullanım (DB boyutu, MAU).
- Aylık: `npm outdated`, `npm audit`, Lighthouse tekrar.
- Çeyreklik: Next.js / Supabase majör sürüm notları; Supabase yedekleri (ücretsiz katmanda PITR yok, kendi yedeğini al: `supabase db dump`).
- Ücretsiz Supabase projesi hareketsiz kalınca duraklatılabilir; canlı projede ücretli plana geç veya bunu izle.
