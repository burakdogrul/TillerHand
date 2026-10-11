# Stack: Backend / API / Otomasyon

> Bu dosya her oturumda AI'ya yüklenir. Projede farklı bir seçim yaptıysan burayı güncelle
> ve nedenini `docs/KARARLAR.md`'ye yaz.

## Varsayılan teknolojiler

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

```
app/
  main.py            # uygulama, router kayıtları, /health
  config.py          # pydantic-settings
  api/v1/            # router'lar (sürümlü)
  models/            # DB modelleri
  schemas/           # Pydantic giriş/çıkış şemaları
  services/          # iş mantığı (router'dan ayrı)
  jobs/              # zamanlanmış/arka plan işler
alembic/             # migration'lar
tests/
Dockerfile
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
| CI | Lint, format, migration, test, açık taraması, Docker build, gitleaks | `.github/workflows/ci.yml` hazır; GitHub'a push et |
| Dependabot | Haftalık bağımlılık PR'ları | `.github/dependabot.yml` hazır |
| MCP | Sentry'deki hataları okuma (`/bakim`) | `.mcp.json` hazır; ilk kullanımda Sentry'ye giriş yap |

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
