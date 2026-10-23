# Proje yapısı: Backend (FastAPI)

> Bu dosya `.claude/structure.json` haritasının insan için açıklamasıdır; ikisi birlikte güncellenir.
> Yapıya uyum zorunludur: yazım anında hook, her PR'da CI, kurul Mimarı ve `/findings-tech` denetler.

## Kod

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

## Her projede ortak

```
.
├── .claude/               # Claude Code: komutlar, ajanlar, hook'lar, kurul, bulgular, structure.json
├── .github/               # CI, Dependabot, bulut ajanları
├── docs/
│   ├── product/           # prd, roadmap, glossary, launch, feedback, unit-economics
│   ├── architecture/      # overview, stack, structure (bu dosya)
│   ├── design/            # design-guide (arayüz varsa)
│   ├── decisions/         # log.md (karar günlüğü) + adr-NNNN-*.md (ayrıntılı kararlar)
│   ├── quality/           # test-plan, metrics, retros
│   ├── security/          # checklist
│   ├── legal/             # privacy-kvkk
│   ├── operations/        # release-checklist, maintenance, accounts, feature-flags
│   ├── workflow/          # progress, decision-protocol, skills, board, usage-limits, cost-log
│   ├── findings/          # /findings-* raporları (tür/tarih.md, latest.md)
│   └── archive/           # artık geçerli olmayan ama saklanan dokümanlar
├── sandbox/               # deneme, keşif kodu, geçici script (git'e girmez)
├── AGENTS.md  CLAUDE.md  README.md  CHANGELOG.md
└── .env.example
```

## Kurallar

1. **Yeni dosya, haritadaki yerine.** `.claude/structure.json` haritası dışına yazım sorulur; dağınıklık kalıpları (`*.bak`, `*-old.*`, `* copy*`, `temp/`, `deneme*`) engellenir. CI her PR'da tüm depoyu denetler.
2. **Özellik bazlı.** Bir özelliğe ait her şey (bileşen, mantık, test) `features/<özellik>/` altında durur. Bir kod iki özellik tarafından kullanılmaya başlarsa paylaşılan katmana (`components/`, `lib/`, `shared/`) taşınır.
3. **Özellikler birbirinin içine girmez.** `features/a` başka bir özelliğin iç dosyalarını içe aktarmaz; sadece o özelliğin `index` dosyasından dışa açtıklarını kullanır.
4. **Adlandırma:** Klasörler ve dosyalar `kebab-case`. React bileşen dosyaları `PascalCase.tsx` olabilir; Python modülleri `snake_case.py`. Özellik klasör adı tekil ve İngilizce (`invoice`, `customer`).
5. **Geçici ve alakasız işler** `sandbox/` altına. İşe yarayan bir şey çıkarsa doğru yere taşınır; `sandbox/` düzenli temizlenir.
6. **Eski dokümanlar** silinmez, `docs/archive/` altına taşınır ve başına neden arşivlendiği yazılır.
7. **Haritayı değiştirmek** (yeni üst klasör, yeni katman) bir `teknik` karardır: kullanıcıya sorulur, `docs/decisions/` altına kaydedilir, sonra `.claude/structure.json` ve bu dosya güncellenir.
