# [PROJE ADI]

[Tek cümle açıklama]

**Canlı:** [URL] · **Durum:** [geliştirme / beta / canlı]

## Gereksinimler

- [Çalışma ortamı ve sürümü: Node.js 22 (`.nvmrc`) / Python 3.12 (`.python-version`) / Expo CLI]
- [Sistem bağımlılıkları: PostgreSQL 16, ffmpeg, ... (paket yöneticisinin kurmadıkları)]
- [Hesaplar: Supabase, Vercel, ...]

Paket sürümleri kilit dosyasında sabittir (`package-lock.json` / `uv.lock`); kurulumu bu dosyadan yap.

## Kurulum

```bash
git clone [repo-url]
cd [proje]
[bağımlılık kurulum komutu]
cp .env.example .env    # değerleri doldur
[migration komutu]
[geliştirme komutu]
```

## Ortam değişkenleri

Tam liste ve açıklamalar: `.env.example`.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `[dev]` | Geliştirme sunucusu |
| `[test]` | Testler |
| `[lint]` | Lint |
| `[build]` | Prod derlemesi |

## Deploy

[Nasıl deploy edilir, nereye, kim yetkili. Rollback nasıl yapılır.]

## Dokümanlar

| Dosya | İçerik |
|---|---|
| `docs/product/prd.md` | Ne yapıyoruz, kimin için |
| `docs/architecture/overview.md` · `docs/architecture/structure.md` | Nasıl kurulu, klasörler nerede |
| `docs/product/roadmap.md` | Görevler |
| `docs/decisions/log.md` | Neden böyle yaptık |
| `docs/operations/release-checklist.md` · `docs/operations/deploy-setup.md` · `docs/operations/maintenance.md` | Operasyon |
| `docs/findings/` | Teknik, iş, güvenlik, UX, performans ve hukuk bulgu raporları |
