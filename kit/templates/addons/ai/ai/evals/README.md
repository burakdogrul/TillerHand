# Eval Sets

Each line is one case (`.jsonl`). Fields:

| Field | Description |
|---|---|
| `id` | Unique id |
| `ozellik` | Which AI feature (`docs/ai/guide.md` → model inventory) |
| `tur` | `tipik` / `zor` / `kotu-niyetli` |
| `girdi` | The input given to the feature |
| `beklenen` | Checks: `icerir`, `icermez`, `esit`, `sema`, `hata`, `puanlama` (LLM-as-judge criterion) |

The run script is written in the project's language (`evals/calistir.ts` or `evals/calistir.py`):
read the cases → call the feature with the real prompt and model → apply the checks → report the pass rate and the failures.
Ask the AI to write this script together with the first AI feature. A prompt/model change is not merged until the eval passes the acceptance threshold in `docs/ai/guide.md` §3.

Add real examples that gave bad results in production here (with personal data removed).
