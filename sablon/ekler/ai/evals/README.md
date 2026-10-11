# Eval Setleri

Her satır bir vaka (`.jsonl`). Alanlar:

| Alan | Açıklama |
|---|---|
| `id` | Benzersiz kimlik |
| `ozellik` | Hangi AI özelliği (`docs/AI.md` → model envanteri) |
| `tur` | `tipik` / `zor` / `kotu-niyetli` |
| `girdi` | Özelliğe verilen girdi |
| `beklenen` | Kontroller: `icerir`, `icermez`, `esit`, `sema`, `hata`, `puanlama` (LLM-as-judge kriteri) |

Çalıştırma betiği projenin diline göre yazılır (`evals/calistir.ts` veya `evals/calistir.py`):
vakaları oku → özelliği gerçek prompt ve modelle çağır → kontrolleri uygula → geçme oranını ve kalanları raporla.
AI'dan ilk AI özelliğiyle birlikte bu betiği yazmasını iste. Eval, `docs/AI.md` §3'teki kabul eşiğini geçmeden prompt/model değişikliği merge edilmez.

Canlıda kötü sonuç veren gerçek örnekleri (kişisel veriyi temizleyerek) buraya ekle.
