# Vibe Coding Başlangıç Kiti

Claude Code ile her projeye aynı yapıyla başlamak ve projeyi canlıda tutmak için şablonlar, talimatlar, komutlar ve otomatik kontroller.
Görsel rehber: `REHBER.html` (tarayıcıda aç). Sürüm: `SURUM`, değişiklikler: `CHANGELOG.md`.

**Gereksinimler:** Claude Code, Git, Node.js 18+ (hook'lar için; backend projelerinde de gerekir), PowerShell.

## Hızlı başlangıç

```powershell
.\kit.ps1 yeni -Hedef "D:\Projeler\benim-uygulamam" -Tip web-saas            # web-saas | mobil | backend
.\kit.ps1 yeni -Hedef "D:\Projeler\asistan" -Tip backend -Ekler ai           # AI/LLM özelliği olan proje
cd "D:\Projeler\benim-uygulamam"
claude
```

Claude Code içinde: `/baslat [proje fikrin 1-3 cümle]`

PowerShell script çalıştırmayı engellerse: `powershell -ExecutionPolicy Bypass -File .\kit.ps1 yeni ...`

## Eski projeyi güncellemek

```powershell
.\kit.ps1 guncelle -Proje "D:\Projeler\benim-uygulamam"
.\kit.ps1 guncelle -Proje "D:\Projeler\benim-uygulamam" -Ekler ai   # sonradan AI eki eklemek
```

- **Kitin dosyaları** (komutlar, ajanlar, hook'lar, GUVENLIK / CANLIYA-ALMA / BAKIM / YASAL-KVKK): Sen değiştirmediysen yeni sürümle değiştirilir. Değiştirdiysen dosyan korunur, yeni sürüm yanına `.yeni` olarak konur.
- **Projenin dosyaları** (CLAUDE.md, PRD, STACK, settings.json...): Hiç dokunulmaz. Kitte yeni eklenen dosyalar projede yoksa eklenir.
- Takip `.kit.json` dosyasıyla yapılır. Bu dosyayı commit et.

## Yapı

```
kit.ps1  SURUM  CHANGELOG.md  REHBER.html  testler/
sablon/
  ortak/                      # her projeye
    CLAUDE.md                 # AI'nın anayasası
    docs/                     # PRD, MIMARI, YOL-HARITASI, ILERLEME, KARARLAR, SOZLUK,
                              # TEST-PLANI, GUVENLIK, YASAL-KVKK, CANLIYA-ALMA, LANSMAN, BAKIM, RETRO
    .claude/commands/         # 9 slash komutu
    .claude/agents/           # inceleyici, guvenlik-denetcisi
    .claude/hooks/            # guard-secrets, session-start
  web-saas/ | mobil/ | backend/
    docs/STACK.md             # teknoloji, kurallar, doğrulama, otomatik kontroller, tipe özel listeler
    docs/TASARIM.md           # (web, mobil) tasarım belirteçleri ve bileşen kuralları
    .claude/settings.json     # izinler + hook bağlantıları
    .claude/hooks/format.mjs  # Prettier / Ruff
    .github/                  # CI + Dependabot
    .husky/ .lintstagedrc.json | .pre-commit-config.yaml
    .mcp.json  .gitignore  .env.example
  ekler/ai/                   # docs/AI.md, evals/, prompts/, .env.example parçası
```

## Akış ve komutlar

| Aşama | Komut | Ana dosyalar |
|---|---|---|
| 0. Fikir | `/baslat` | PRD, MIMARI, SOZLUK, YOL-HARITASI, KARARLAR |
| 1. Kurulum | `/gelistir G-001` ... `G-007` | Faz 0: iskelet, CI, ilk deploy, TASARIM |
| 2. Geliştirme | `/planla` → `/gelistir` → `/incele` → commit → `/oturum-sonu` | ILERLEME, YOL-HARITASI |
| Hata | `/hata-ayikla` | TEST-PLANI |
| Faz sonu | `/retro` | RETRO; kite geri bildirim |
| 3. Canlıya alma | `/canliya-al ilk` · `/canliya-al` | CANLIYA-ALMA, GUVENLIK, YASAL-KVKK, LANSMAN, AI |
| 4. Bakım | `/bakim haftalik\|aylik\|ceyreklik` | BAKIM |

## Kiti geliştirmek

- Dersler `/retro` ile gelir. Onaylanan değişiklikler `sablon/`'a yazılır ve `CHANGELOG.md` → "[Yayınlanmamış]" bölümüne eklenir.
- Sürüm çıkarmak için:
  1. `SURUM` dosyasındaki numarayı artır.
  2. CHANGELOG'da "[Yayınlanmamış]" bölümünü sürüm numarasıyla adlandır.
  3. Testleri çalıştır.
  4. Commit at ve `git tag v1.x.0` ile etiketle.
- Testler:
  - `powershell -ExecutionPolicy Bypass -File testler\kit.test.ps1`
  - `node --test testler/guard-secrets.test.mjs`
- Yeni proje tipi eklemek:
  1. `sablon/<tip>/` klasörünü aç; içine `docs/STACK.md`, `.claude/settings.json`, `.claude/hooks/format.mjs`, `.gitignore`, `.env.example` koy.
  2. `kit.ps1` içindeki `ValidateSet`'e ekle.
- Yeni ek eklemek:
  1. `sablon/ekler/<ad>/` klasörünü aç.
  2. Var olan bir dosyanın sonuna eklenecek içerik için `dosya.ekle` adını kullan.
  3. `kit.ps1` içindeki `ValidateSet`'e ekle.
