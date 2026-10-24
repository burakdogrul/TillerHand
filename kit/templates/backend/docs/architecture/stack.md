# Stack: Backend / API / Otomasyon

> Bu dosya her oturumda AI'ya yüklenir. Projede farklı bir seçim yaptıysan burayı güncelle
> ve nedenini `docs/decisions/log.md`'ye yaz.

## Karar noktaları

`/start` bu kararları sırayla sorar (`docs/workflow/decision-protocol.md`). Her kararda bu projeye en uygun 2-4 seçeneği sun; **önerilen** etiketi varsayılandır, ama PRD'ye göre başka seçenek daha uygunsa onu öner ve nedenini söyle.

| # | Karar | Seçenekler (ne zaman daha iyi) |
|---|---|---|
| 1 | Dil ve framework | **Python + FastAPI** (önerilen: AI/veri işleri, hızlı geliştirme, otomatik OpenAPI dokümanı) · Node.js + TypeScript + Hono/Fastify (frontend ile aynı dil, tip paylaşımı) · Go (yüksek performans, tek binary, düşük bellek) · Django (hazır admin paneli, büyük monolit) |
| 2 | Veritabanı | **PostgreSQL** (önerilen: her şeye yeter, JSON desteği) · SQLite / Turso (tek sunucu, küçük ölçek, sıfır işletme) · MongoDB (şemasız doküman, değişken yapı) |
| 3 | ORM / sorgu | **SQLAlchemy 2 + Alembic** (Python) · SQLModel (Pydantic ile tek model, daha basit) · Node seçildiyse: Drizzle (önerilen) / Prisma |
| 4 | Kimlik doğrulama | **Dış sağlayıcının JWT'si** (Supabase Auth / Clerk; kullanıcı yönetimini sen yazmazsın) · API anahtarı (servisler arası, B2B API) · Kendi oturum/JWT'n (tam kontrol; güvenlik yükü sende) |
| 5 | Arka plan işleri | **Platform cron'u** (önerilen basit zamanlanmış işler için) · ARQ / Celery + Redis (kuyruk, yeniden deneme, yoğun iş) · Temporal / Inngest (çok adımlı, uzun süren iş akışları) · Yok |
| 6 | API stili | **REST + OpenAPI** (önerilen) · GraphQL (çok farklı istemci, esnek sorgu) · tRPC (sadece TypeScript istemci) |
| 7 | Barındırma | **Railway** (önerilen: en kolay, Postgres dahil) · Fly.io (kullanıcıya yakın bölge, ölçekleme) · Render · Google Cloud Run (istek başı ödeme, sıfıra ölçeklenir) · VPS + Coolify (sabit maliyet, bakım sende) |
| 8 | Paket yönetimi | **uv** (önerilen Python için: çok hızlı, kilit dosyası) · Poetry |
| 9 | Gözlem | **Sentry + yapılandırılmış log** (Better Stack / Axiom) · OpenTelemetry (dağıtık servisler) |
| 10 | Test | **pytest + httpx** (önerilen) · Node seçildiyse: Vitest + supertest |

## Seçilen teknolojiler

> `/start` Adım 4'te karar noktalarına göre doldurulur. Aşağıdaki tablo **önerilen** yığındır ve onaylanana kadar öneri sayılır.
> Seçim farklıysa bu dosyanın komut, klasör, kural, doğrulama ve kontrol bölümleri seçime göre yeniden yazılır.

| Katman | Seçim | Not |
|---|---|---|
| Dil | Python 3.12+ | Alternatif: Node.js + TypeScript (Hono/Fastify + Drizzle) |
| Paket yönetimi | uv | `pip install` değil, `uv add` |
| API | FastAPI + Pydantic v2 | |
| Ayarlar | pydantic-settings | Tüm config ortam değişkeninden |
| DB | PostgreSQL + SQLAlchemy 2 (veya SQLModel) | |
| Migration | Alembic | |
| Arka plan işleri | Cron (platform) / ARQ / Celery | İhtiyaç kadar; basit iş için cron yeter |
| Lint + format | Ruff | |
| Test | pytest + httpx | |
| Paketleme | Docker | |
| Hosting | Railway / Fly.io / Render | |
| Hata takibi | Sentry | |
| Cron izleme | Healthchecks.io (dead man's switch) | İş çalışmazsa alarm |

## Komutlar

```bash
uv sync                                  # bağımlılıkları kur
uv run fastapi dev app/main.py           # geliştirme
uv run pytest                            # test
uv run ruff check .                      # lint
uv run ruff format .                     # format
uv run alembic revision --autogenerate -m "[ad]"   # migration oluştur (çıktıyı mutlaka oku)
uv run alembic upgrade head              # migration uygula
uv run --with pip-audit pip-audit                            # bağımlılık açıkları
docker build -t [ad] . && docker run --env-file .env -p 8000:8000 [ad]
```

## Klasör yapısı

Özellik bazlı yapı ve kurallar: `docs/architecture/structure.md`. Harita: `.claude/structure.json` (dışına yazım sorulur, CI denetler).
```
app/
├── main.py                     # uygulama, router kayıtları, /health
├── config.py                   # pydantic-settings
├── core/                       # veritabanı oturumu, güvenlik, loglama, hata işleyiciler, ortak bağımlılıklar
├── features/
│   └── <özellik>/              # örn. invoice/
│       ├── router.py           # HTTP uçları (ince)
│       ├── service.py          # iş mantığı
│       ├── repository.py       # veritabanı erişimi
│       ├── models.py           # SQLAlchemy modelleri
│       ├── schemas.py          # Pydantic giriş/çıkış şemaları
│       ├── dependencies.py
│       └── exceptions.py
├── shared/                     # birden fazla özelliğin kullandığı yardımcılar
└── jobs/                       # zamanlanmış ve arka plan işleri (idempotent)
alembic/                        # migration'lar
tests/
├── <özellik>/                  # özelliğe göre testler (test_O_01_1_... kabul testleri dahil)
└── live/                       # canlı izleme testleri
Dockerfile  pyproject.toml  uv.lock
```

## Kodlama kuralları

- Router ince, iş mantığı `services/`'te.
- Her uç noktada Pydantic giriş şeması; dönüşte de şema (iç alanlar sızmasın).
- Tutarlı hata biçimi: `{"error": {"code": "...", "message": "..."}}`.
- Liste uçlarında sayfalama zorunlu.
- **Her dış çağrıda açık timeout** (`requests`'te varsayılan timeout yoktur, istek sonsuza kadar asılı kalabilir) ve gerekiyorsa geri çekilmeli tekrar (retry + backoff).
- İşler (jobs) **idempotent**: iki kez çalışırsa zarar vermez.
- Loglar yapılandırılmış (JSON), istek kimliği (request id) içerir; kişisel veri ve sır içermez.
- `/health` ucu: uygulama + DB bağlantısı.
- Migration'lar elle gözden geçirilir; `autogenerate` her şeyi doğru yakalamaz.
- Async uçta senkron, bloklayan kütüphane kullanma.

## Doğrulama (görev bitmeden kanıt)

- Uç nokta: sunucuyu çalıştır, `curl -i` (veya httpx) ile ana senaryo + yetkisiz istek + geçersiz girdi. İstek ve yanıtı göster.
- İş/cron: işi elle bir kez tetikle, logu ve DB'deki etkisini göster; iki kez çalıştırıp idempotent olduğunu göster.
- Migration: `alembic upgrade head` → `alembic downgrade -1` → `alembic upgrade head` temiz geçiyor.

## Otomatik kontroller

| Katman | Ne yapar | Kurulum |
|---|---|---|
| Claude hook'ları | Sır yazımını engeller; `.py` dosyasını Ruff ile biçimlendirir ve lint hatasını AI'ya geri bildirir | Hazır (`.claude/settings.json`). Node.js gerekir |
| Pre-commit | Ruff + sır taraması, commit öncesi | `uvx pre-commit install` (bir kez) |
| CI (+ Semgrep, kopya kod, karmaşıklık bütçesi) | Lint, format, migration, test, açık taraması, Docker build, gitleaks, değişen dosyalarda karmaşıklık bütçesi (fonksiyon karmaşıklığı 15, fonksiyon 80, dosya 400 satır; `node .claude/hooks/budget.mjs --check`) | `.github/workflows/ci.yml` hazır; GitHub'a push et |
| Dependabot | Haftalık bağımlılık PR'ları | `.github/dependabot.yml` hazır |
| MCP | Sentry'deki hataları okuma (`/maintain`) | `.mcp.json` hazır; ilk kullanımda Sentry'ye giriş yap |

## Kabul testleri ve özellik bayrakları

**Kabul testleri** (`docs/quality/test-plan.md` §1a): Test fonksiyonunun adı kriter kimliğini taşır (`test_O_01_1_...`). Pano JUnit raporunu okur:

```bash
uv run pytest --junitxml=test-results/junit.xml
```

**Özellik bayrakları** (`docs/operations/feature-flags.md`): Acil kapatma yeniden deploy gerektirmemeli. Veritabanında `feature_flags` tablosu (`ad`, `acik`, `yuzde`, `guncellendi`) + süreç içinde 60 sn önbellek. Okuma tek bir yerden yapılır: `app/services/bayrak.py` → `bayrak_acik("ad", kullanici_id)`. Bayrağı değiştirmek bir admin ucu veya SQL ile yapılır ve loglanır.

## Sık yapılan AI hataları (bunlara dikkat)

- Pydantic v1 sözdizimini (`class Config`, `.dict()`) v2 ile karıştırmak.
- Dış API çağrısında timeout koymamak, hatayı yutmak (`except: pass`).
- CORS'u `allow_origins=["*"]` ile kimlik bilgisiyle birlikte açmak.
- Cron işini sunucu içinde `while True: sleep` ile yazmak (yeniden başlayınca kaybolur, izlenemez).
- DB oturumunu kapatmamak, bağlantı havuzunu tüketmek.

## Güvenlik (ek)

- [ ] Kimlik doğrulama: JWT doğrulaması (imza + süre + issuer) veya API anahtarı (hash'lenmiş saklanır).
- [ ] Rate limit (slowapi veya reverse proxy).
- [ ] Prod'da `/docs` ve `/openapi.json` kapalı veya korumalı.
- [ ] CORS beyaz liste.
- [ ] Docker imajı root olmayan kullanıcıyla çalışıyor, imajda `.env` yok.

## Canlıya alma (ek)

- [ ] Dockerfile: çok aşamalı, root olmayan kullanıcı, `HEALTHCHECK`
- [ ] Platformda health check `/health`'e bağlı
- [ ] Migration deploy adımında otomatik veya kontrollü çalışıyor (uygulamadan önce)
- [ ] Ortam değişkenleri platformda; `DEBUG` kapalı
- [ ] Kaynak limitleri (bellek/CPU) ve otomatik yeniden başlatma
- [ ] Her cron işi Healthchecks.io'ya ping atıyor; atmazsa alarm
- [ ] Log saklama ve arama (platform logları veya Better Stack/Axiom)
- [ ] Yük altında basit deneme (`hey`, `k6`): beklenen trafiğin 3 katında hata yok
- [ ] Yanıt süresi hedefi: p95 < 500 ms (ana uçlar)

## Bakım (ek)

- Haftalık: cron işleri başarılı mı, kuyruk birikmesi var mı, 5xx oranı.
- Aylık: `uv lock --upgrade` + testler, `uv run --with pip-audit pip-audit`, yavaş sorgular (`pg_stat_statements`).
- Çeyreklik: Python ve temel kütüphanelerin majör sürümleri, Docker taban imajı güncellemesi, DB indeks ve boyut gözden geçirme.
