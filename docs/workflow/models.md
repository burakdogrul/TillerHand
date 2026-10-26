# Model ve effort (rol bazında)

> Kit işi dört role ayırır. Her rolün modelini ve effort'unu (ne kadar düşüneceğini) sen seçersin.
> `/build` her görevin başında, `/start`, `/adopt` ve `/release` başlarken iki ekranda sorar: önce dört rolün modeli, sonra effort'u.
> Seçim `node .claude/hooks/models.mjs --set …` ile `.claude/state/models.json`'a yazılır (git'e girmez). Güncel seçimi `node .claude/hooks/models.mjs --show` gösterir.

## Roller

| Rol | Anahtar | Kapsadığı işler | Önerilen |
|---|---|---|---|
| Planlama ve mimari | `plan` | Plan, mimari ve veri modeli kararları; PRD, README ve kullanıcıya görünen metin. Ana oturumda yürür. | Opus · yüksek |
| Kod yazma | `code` | Kabul testleri ve uygulama kodu. Alt ajana devredilir. | Sonnet · yüksek |
| İnceleme ve denetim | `review` | Kurul üyeleri, `code-reviewer`, `security-auditor`, bulgu raporları (`/findings-all`). | Sonnet · yüksek |
| Doküman ve araştırma | `docs` | CHANGELOG, rapor özeti; kod tarama, web araştırması (`/research` derin). Karar günlüğü karar anında ana oturumda yazılır. | Haiku · yüksek |

Effort ölçeği: düşük = `low`, orta = `medium`, yüksek = `high`, ekstra yüksek = `xhigh`. Effort arttıkça cevap yavaşlar ve limitten daha çok yer.

Opus en pahalı, Haiku en ucuz modeldir. Limit sarı veya kırmızıya döndüğünde en büyük tasarruf kod rolünü bir alt modele almaktır (`docs/workflow/usage-limits.md` §3). Güvenlik, veri modeli ve mimari kararlar planlama rolünde kalır.

## Claude Code'da nasıl uygulanır

- **Ana oturum** planlama rolünü yürütür. Kit ana oturumun modelini değiştiremez: seçilen plan modeli veya effort'u oturumunkinden farklıysa AI tek satırla `/model <ad>` ve `/effort <düzey>` önerir.
- **Alt ajanlar:** Kod yazma, inceleme ve doküman işleri Agent aracıyla alt ajana gider. Çağrıda rolün `model` ve `effort` değeri verilir; çağrıdaki değer ajan dosyasındaki `model:` satırını ezer.
- **Takma adlar:** `opus`, `sonnet`, `haiku` (ayrıca `fable`) her zaman o ailenin en yeni modeline gider. Belirli bir sürüme sabitlemek için tam model kimliği ya da `ANTHROPIC_DEFAULT_OPUS_MODEL` (SONNET, HAIKU) ortam değişkeni.
- **Effort:** Alt ajan çağrısında effort Claude Code v2.1.292 ve sonrasında verilebilir. `CLAUDE_CODE_EFFORT_LEVEL` ortam değişkeni tanımlıysa bütün effort seçimlerini ezer. Bir model her düzeyi desteklemeyebilir.
- **Soru modu:** `maliyet` konusu kapalıysa soru gelmez, son seçim geçerli kalır.
- **İstisnalar:** Commit (hafif) kurul denetimi her commit'te çalıştığı için `haiku` ve `low` kalır (`.claude/board/rules.md`). Karar konseyi (`.claude/board/council.md`) bilerek farklı modelleri karşılaştırır; rol seçimi ona uygulanmaz.

Kaynak: code.claude.com/docs/en/sub-agents, code.claude.com/docs/en/model-config (2026-10-26).

## Codex ve Antigravity

| | Codex | Antigravity |
|---|---|---|
| Ana oturum | Model seçici ve reasoning effort | Model seçici ve düşünme düzeyi (Low / Medium / High) |
| Alt ajan | `.codex/agents/<ad>.toml` → `model`, `model_reasoning_effort`. Başlatırken istemle de verilebilir; verilmezse ana oturumunkini alır. | `.agents/agents/<ad>.md` → `model: inherit`, `flash` ya da `pro`. Alt ajanda düşünme düzeyi yok. |
| Rol karşılığı | Opus ve Sonnet → güçlü model, Haiku → hızlı model (2026-10-26'da dokümanın önerisi: `gpt-6.1-sol` ve `gpt-6-luna`). Effort adları aynı: `low` … `xhigh`. | Opus ve Sonnet → `pro`, Haiku → `flash`. |

Seçenekli soru aracı yoksa (Codex) iki ekran numaralı liste olarak sorulur. Alt ajan çalıştıramıyorsan rolü kendin yürüt ve modeli metinle öner.

Kaynak: developers.openai.com/codex/subagents, antigravity.google/docs/subagents, antigravity.google/docs/models (2026-10-26).
