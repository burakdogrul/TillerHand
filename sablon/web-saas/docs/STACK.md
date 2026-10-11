# Stack: Web Uygulaması / SaaS

> Bu dosya her oturumda AI'ya yüklenir. Projede farklı bir seçim yaptıysan burayı güncelle
> ve nedenini `docs/KARARLAR.md`'ye yaz.

## Varsayılan teknolojiler

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

```
app/                 # rotalar (App Router)
  (auth)/            # giriş/kayıt sayfaları
  (app)/             # giriş gerektiren sayfalar
  api/               # route handler'lar (webhook vb.)
components/          # paylaşılan UI (ui/ = shadcn)
lib/                 # iş mantığı, istemciler, yardımcılar
  supabase/          # server.ts ve client.ts ayrı
supabase/migrations/ # DB değişiklikleri SADECE burada
tests/               # e2e
```

## Kodlama kuralları

- Varsayılan **Server Component**. `"use client"` sadece etkileşim gerekiyorsa ve en alttaki bileşende.
- Veri yazma: Server Action veya route handler. Her birinde: Zod doğrulama → oturum kontrolü → yetki kontrolü → işlem.
- `NEXT_PUBLIC_` ön ekli değişkenler tarayıcıya gider. Sır asla `NEXT_PUBLIC_` olmaz.
- Supabase `service_role` anahtarı sadece sunucuda ve sadece gerçekten gerekiyorsa (RLS'i atlar).
- DB şema değişikliği sadece migration dosyasıyla. Panelden elle değişiklik yok.
- Her yeni tabloda RLS açık ve politikası yazılı.
- Her sayfada `loading.tsx` / boş durum / `error.tsx` düşün.
- Görseller `next/image`, linkler `next/link`.
- Metinler Türkçe; tarih/para `Intl` ile `tr-TR`.
- UI işinden önce `docs/TASARIM.md`'yi oku; renk, boşluk ve bileşen kurallarının dışına çıkma.

## Doğrulama (görev bitmeden kanıt)

- Arayüz: `npm run dev` açıkken Playwright MCP (veya Claude'un tarayıcısı) ile sayfayı aç, ana senaryoyu ve bir hata senaryosunu dene, masaüstü + mobil genişlikte ekran görüntüsü al.
- Yetki: ikinci bir test kullanıcısıyla birinci kullanıcının kaydına erişmeyi dene; erişememeli.
- Konsolda hata/uyarı yok.

## Otomatik kontroller

| Katman | Ne yapar | Kurulum |
|---|---|---|
| Claude hook'ları | Sır yazımını engeller; düzenlenen dosyayı Prettier ile biçimlendirir | Hazır (`.claude/settings.json`). Prettier projede kurulu olmalı |
| Pre-commit | lint-staged (ESLint + Prettier) + sır taraması | `npm i -D husky lint-staged prettier` → `npm pkg set scripts.prepare="husky"` → `npx husky` |
| CI | Lint, tip, test, build, açık taraması, gitleaks | `.github/workflows/ci.yml` hazır. GitHub > Settings > Variables'a `NEXT_PUBLIC_*` değerlerini ekle |
| Dependabot | Haftalık küçük güncellemeler tek PR'da | `.github/dependabot.yml` hazır |
| MCP | Playwright (tarayıcı), Supabase (salt-okunur), Sentry | `.mcp.json`: `PROJE_REF`'i doldur. Supabase MCP'yi sadece **geliştirme** projesine bağla |

## Sık yapılan AI hataları (bunlara dikkat)

- Client component içinde Supabase admin istemcisi veya sır kullanmak.
- Sayfayı middleware ile koruyup server action'ı korumasız bırakmak.
- RLS'i "çalışmıyor" diye kapatmak.
- Eski Pages Router kalıplarını (`getServerSideProps`) App Router'a karıştırmak.
- Webhook'ta imza doğrulamamak; webhook'u iki kez gelince iki kez işlemek (idempotency).

## Güvenlik (ek)

- [ ] Tüm tablolarda RLS açık: `select tablename, rowsecurity from pg_tables where schemaname='public';`
- [ ] Başka kullanıcının ID'siyle istek atınca veri dönmüyor (elle dene).
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
